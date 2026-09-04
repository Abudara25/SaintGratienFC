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

    // On attend la réponse du serveur avant de générer le PDF : le lien de dépôt du dossier
    // signé (uploadToken) est imprimé dedans, et il faut le token pour construire ce lien.
    submitBtn.disabled = true;
    submitBtn.textContent = 'Génération…';
    let uploadToken = null;
    try {
      const res = await fetch('/api/inscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
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

    generatePdf(data, uploadToken ? `${location.origin}/depot/${uploadToken}` : null);

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

function generatePdf(data, depotUrl) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFillColor(58, 15, 16);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(244, 182, 88);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Saint-Gratien FC', 14, 18);
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("Fiche d'inscription — Saison 2026-2027", 14, 25);

  let y = 42;
  doc.setTextColor(30, 30, 30);

  const heading = (text) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(text, 14, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
  };
  const line = (text) => {
    doc.text(text, 14, y);
    y += 6;
  };

  heading('Enfant');
  line(`Nom : ${data.enfantNom}`);
  line(`Prénom : ${data.enfantPrenom}`);
  line(`Date de naissance : ${data.naissance || '—'}`);
  line(`Catégorie : ${data.categorie}`);
  line(`Taille de maillot : ${data.tailleMaillot || '—'}`);
  y += 4;

  heading('Parent / responsable légal');
  line(`Nom : ${data.parentNom}`);
  line(`Prénom : ${data.parentPrenom}`);
  line(`E-mail : ${data.email}`);
  line(`Téléphone : ${data.telephone || '—'}`);
  line(`Adresse : ${data.adresse || '—'}, ${data.codePostal || ''} ${data.ville || ''}`.trim());
  y += 4;

  heading('Offre choisie');
  line('Adhésion saison 2026-2027 — 180 €');
  line('Licence + tenue complète Patrick (maillot, short, survêtement, sac)');
  line(`Mode de paiement : ${data.modePaiement || '—'}`);
  y += 4;

  heading('Autorisations');
  line("J'autorise mon enfant à participer aux entraînements et activités du Saint-Gratien FC.");
  line(`Droit à l'image (photos/vidéos du club) : ${data.droitImage ? 'Oui' : 'Non'}`);
  y += 8;

  doc.text('Fait à _______________________, le _______________', 14, y);
  y += 10;
  doc.text('Signature du responsable légal :', 14, y);
  y += 20;
  doc.line(14, y, 90, y);
  y += 14;

  if (depotUrl) {
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text('Une fois signé, déposez ce dossier ici :', 14, y);
    y += 6;
    doc.setTextColor(58, 15, 16);
    doc.textWithLink(depotUrl, 14, y, { url: depotUrl });
    y += 4;
  }

  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(
    depotUrl
      ? 'Vous pouvez aussi apporter ce dossier signé directement au club (premier entraînement). Adhésion à régler sur HelloAsso, ou en espèces/chèque en apportant ce dossier.'
      : "À apporter signé au club (premier entraînement) ou à envoyer à contact@saintgratienfc.fr. Adhésion à régler sur HelloAsso, ou en espèces/chèque en apportant ce dossier.",
    14,
    285
  );

  const filename = `inscription-${data.enfantPrenom}-${data.enfantNom}.pdf`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-');
  doc.save(filename);
}
