// Saint-Gratien FC — formulaire d'inscription : génère un PDF rempli, puis propose le dépôt du dossier signé (lien unique par famille, /depot/<token>) et le paiement HelloAsso (widget adapté à la catégorie choisie).

const HELLOASSO_URLS = {
  'U6 - U7': 'https://www.helloasso.com/beta/associations/saint-gratien-football-club/adhesions/adhesion-u6-u7-saint-gratien-fc-2026-2027',
  'U8 - U9': 'https://www.helloasso.com/beta/associations/saint-gratien-football-club/adhesions/adhesion-categorie-u8-u9-saint-gratien-fc-2026-2027-2',
};

// Widgets embarqués (fournis par le club depuis HelloAsso, onglet "Diffuser") : le paiement se
// fait dans la page au lieu de rediriger vers helloasso.com. Note l'URL sans "/beta" (le widget
// n'est pas servi sous ce préfixe, contrairement au lien de paiement externe ci-dessus).
const HELLOASSO_WIDGET_URLS = {
  'U6 - U7': 'https://www.helloasso.com/associations/saint-gratien-football-club/adhesions/adhesion-u6-u7-saint-gratien-fc-2026-2027/widget',
  'U8 - U9': 'https://www.helloasso.com/associations/saint-gratien-football-club/adhesions/adhesion-categorie-u8-u9-saint-gratien-fc-2026-2027-2/widget',
};

// Saison 2026-2027 : U6-U7 = nés en 2020 ou 2021, U8-U9 = nés en 2018 ou 2019.
const CATEGORIE_PAR_ANNEE = {
  2020: 'U6 - U7',
  2021: 'U6 - U7',
  2018: 'U8 - U9',
  2019: 'U8 - U9',
};

// Construit l'iframe widget HelloAsso (auto-agrandie via postMessage — HelloAsso poste sa hauteur
// réelle une fois le formulaire chargé, sinon l'iframe reste tronquée à la hauteur de départ).
function createHelloAssoWidget(url) {
  const iframe = document.createElement('iframe');
  iframe.id = 'haWidget';
  iframe.allowTransparency = 'true';
  iframe.scrolling = 'auto';
  iframe.src = url;
  iframe.style.width = '100%';
  iframe.style.height = '750px';
  iframe.style.border = 'none';
  iframe.addEventListener('load', () => {
    window.addEventListener('message', (e) => {
      if (e.origin !== 'https://www.helloasso.com') return;
      const dataHeight = e.data?.height;
      if (dataHeight > parseFloat(iframe.style.height || 0)) {
        iframe.style.height = `${dataHeight}px`;
      }
    });
  });
  return iframe;
}

document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('inscription-status');
  if (statusEl) {
    fetch('/api/inscription-status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && (data.status === 'open' || data.status === 'closed')) {
          statusEl.dataset.status = data.status;
        }
      })
      .catch(() => {}); // en cas d'échec, on garde le data-status par défaut ("open")
  }

  const form = document.getElementById('inscription-form');
  if (!form) return;

  const nextSteps = document.getElementById('inscription-next-steps');
  const depotBtn = document.getElementById('depot-btn');
  const depotFallback = document.getElementById('depot-fallback');
  const mailtoBtn = document.getElementById('mailto-btn');
  const especesChequeBox = document.getElementById('paiement-especes-cheque');
  const especesChequeMode = document.getElementById('paiement-especes-cheque-mode');
  const helloassoBox = document.getElementById('paiement-helloasso');
  const helloassoWidgetContainer = document.getElementById('helloasso-widget-container');
  const helloassoFallbackLink = document.getElementById('helloasso-fallback-link');

  const naissanceInput = form.naissance;
  const categorieSelect = form.categorie;
  if (naissanceInput && categorieSelect) {
    naissanceInput.addEventListener('change', () => {
      // getUTCFullYear (pas getFullYear) : "YYYY-MM-DD" est parsé comme minuit UTC, et lire
      // l'année en heure locale décalerait d'un an pour un fuseau très négatif (ex. UTC-8)
      // sur une naissance au 1er janvier.
      const annee = new Date(naissanceInput.value).getUTCFullYear();
      const categorie = CATEGORIE_PAR_ANNEE[annee];
      if (categorie) categorieSelect.value = categorie;
    });
  }

  const submitBtn = form.querySelector('button[type=submit]');
  const submitBtnDefaultLabel = submitBtn.textContent;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const data = {
      enfantPrenom: form.enfantPrenom.value.trim(),
      enfantNom: form.enfantNom.value.trim(),
      naissance: form.naissance.value,
      categorie: form.categorie.value,
      tailleMaillot: form.tailleMaillot.value,
      modePaiement: form.modePaiement.value,
      parentPrenom: form.parentPrenom.value.trim(),
      parentNom: form.parentNom.value.trim(),
      email: form.email.value.trim(),
      telephone: form.telephone.value.trim(),
      adresse: form.adresse.value.trim(),
      codePostal: form.codePostal.value.trim(),
      ville: form.ville.value.trim(),
      autorisation: form.autorisation.checked,
      droitImage: form.droitImage.checked,
      rgpd: form.rgpd.checked,
    };

    if (!window.jspdf) {
      alert("Le générateur de PDF n'a pas pu se charger (connexion instable ou bloqueur de contenu). Réessayez, ou contactez-nous directement à contact@saintgratienfc.fr.");
      return;
    }

    // Le PDF (sans lien de dépôt, pas encore connu à ce stade) est joint en base64 à la requête
    // pour que le serveur puisse l'attacher à l'e-mail de confirmation (voir
    // functions/_shared/confirmation-email.js) — la famille reçoit ainsi sa fiche remplie par
    // e-mail en plus du téléchargement local ci-dessous.
    const pdfBase64 = getInscriptionPdfBase64(data);

    // On attend la réponse du serveur avant de télécharger le PDF local : le lien de dépôt du
    // dossier signé (uploadToken) est imprimé dedans, et il faut le token pour construire ce lien.
    submitBtn.disabled = true;
    submitBtn.textContent = 'Génération…';
    let uploadToken = null;
    try {
      const res = await fetch('/api/inscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, pdfBase64 }),
      });
      if (res.ok) {
        const json = await res.json();
        uploadToken = json.uploadToken || null;
      }
    } catch {
      // uploadToken reste null : le bouton de dépôt sera remplacé par le repli mailto ci-dessous.
    }
    submitBtn.disabled = false;
    submitBtn.textContent = submitBtnDefaultLabel;

    downloadInscriptionPdf(data, uploadToken ? `${location.origin}/depot/${uploadToken}` : null);

    if (uploadToken) {
      depotBtn.href = `/depot/${uploadToken}`;
      depotBtn.hidden = false;
      depotFallback.hidden = true;
    } else {
      depotBtn.hidden = true;
      depotFallback.hidden = false;
      const subject = `Inscription ${data.enfantPrenom} ${data.enfantNom} — Saint-Gratien FC`;
      const body = [
        'Bonjour,',
        '',
        `Veuillez trouver en pièce jointe la fiche d'inscription de ${data.enfantPrenom} ${data.enfantNom} (${data.categorie}).`,
        "Merci de joindre le PDF que vous venez de télécharger avant l'envoi de cet e-mail.",
        '',
        'Cordialement,',
        `${data.parentPrenom} ${data.parentNom}`,
      ].join('\n');
      mailtoBtn.href = `mailto:contact@saintgratienfc.fr?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }

    if (data.modePaiement === 'HelloAsso') {
      const widgetUrl = HELLOASSO_WIDGET_URLS[data.categorie] || HELLOASSO_WIDGET_URLS['U6 - U7'];
      helloassoWidgetContainer.innerHTML = '';
      helloassoWidgetContainer.appendChild(createHelloAssoWidget(widgetUrl));
      helloassoFallbackLink.href = HELLOASSO_URLS[data.categorie] || HELLOASSO_URLS['U6 - U7'];
      helloassoBox.hidden = false;
      especesChequeBox.hidden = true;
    } else {
      helloassoBox.hidden = true;
      helloassoWidgetContainer.innerHTML = '';
      especesChequeMode.textContent = data.modePaiement || 'espèces ou chèque';
      especesChequeBox.hidden = false;
    }

    nextSteps.hidden = false;
    nextSteps.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});
