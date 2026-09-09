// Saint-Gratien FC — formulaire d'inscription : génère un PDF rempli, puis propose le dépôt du dossier signé (lien unique par famille, /depot/<token>) et le paiement HelloAsso (widget adapté à la catégorie choisie).

// Repli utilisé tant que /api/categories n'a pas répondu (ou si l'appel échoue) : catégories,
// tranches de naissance, saison et liens HelloAsso sont normalement gérés depuis /admin/categories
// (voir functions/admin/categories.js et functions/_shared/settings-kv.js) sans devoir toucher au
// code à chaque saison — ces constantes ne servent plus que de filet de sécurité hors-ligne.
const FALLBACK_SAISON = '2026-2027';
const FALLBACK_PRIX = 180;
const FALLBACK_HELLOASSO_URLS = {
  'U6 - U7': 'https://www.helloasso.com/beta/associations/saint-gratien-football-club/adhesions/adhesion-u6-u7-saint-gratien-fc-2026-2027',
  'U8 - U9': 'https://www.helloasso.com/beta/associations/saint-gratien-football-club/adhesions/adhesion-categorie-u8-u9-saint-gratien-fc-2026-2027-2',
};
const FALLBACK_HELLOASSO_WIDGET_URLS = {
  'U6 - U7': 'https://www.helloasso.com/associations/saint-gratien-football-club/adhesions/adhesion-u6-u7-saint-gratien-fc-2026-2027/widget',
  'U8 - U9': 'https://www.helloasso.com/associations/saint-gratien-football-club/adhesions/adhesion-categorie-u8-u9-saint-gratien-fc-2026-2027-2/widget',
};
const FALLBACK_CATEGORIE_PAR_ANNEE = { 2020: 'U6 - U7', 2021: 'U6 - U7', 2018: 'U8 - U9', 2019: 'U8 - U9' };

// `datetime('now')` (SQLite) renvoie "YYYY-MM-DD HH:MM:SS" en UTC, sans "T" ni "Z" — il faut les
// ajouter pour que `new Date(...)` le reconnaisse de façon fiable (voir aussi la même fonction
// côté serveur dans functions/depot/[token].js).
function formatDuplicateDate(sqliteDatetime) {
  if (!sqliteDatetime) return 'récemment';
  try {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(
      new Date(`${sqliteDatetime.replace(' ', 'T')}Z`)
    );
  } catch {
    return sqliteDatetime;
  }
}

// Construit l'iframe widget HelloAsso (auto-agrandie via postMessage — HelloAsso poste sa hauteur
// réelle une fois le formulaire chargé, sinon l'iframe reste tronquée à la hauteur de départ).
// helloassoMessageAbort : un nouveau submit (retry, changement de mode de paiement) recrée un
// widget sans jamais retirer l'ancien listener "message" sur window — l'AbortController permet de
// désabonner l'ancien avant d'en attacher un nouveau plutôt que de les empiler indéfiniment.
let helloassoMessageAbort = null;

function createHelloAssoWidget(url) {
  helloassoMessageAbort?.abort();
  helloassoMessageAbort = new AbortController();
  const { signal } = helloassoMessageAbort;

  const iframe = document.createElement('iframe');
  iframe.id = 'haWidget';
  iframe.allowTransparency = 'true';
  iframe.scrolling = 'auto';
  iframe.src = url;
  iframe.style.width = '100%';
  iframe.style.height = '750px';
  iframe.style.border = 'none';
  iframe.addEventListener(
    'load',
    () => {
      window.addEventListener(
        'message',
        (e) => {
          if (e.origin !== 'https://www.helloasso.com') return;
          const dataHeight = e.data?.height;
          if (dataHeight > parseFloat(iframe.style.height || 0)) {
            iframe.style.height = `${dataHeight}px`;
          }
        },
        { signal }
      );
    },
    { signal }
  );
  return iframe;
}

document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('inscription-status');
  if (statusEl) {
    fetch('/api/inscription-status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || (data.status !== 'open' && data.status !== 'closed')) return;
        // "priority" (pas renvoyé tel quel par l'API — voir functions/api/inscription-status.js) :
        // le statut brut est "closed" mais une date limite de réinscription prioritaire est encore
        // en cours, on affiche donc un message différent de "fermé" (voir .inscription-priority
        // ci-dessous et sa date limite, plutôt que le bloc .inscription-closed générique).
        if (data.status === 'closed' && data.dateLimiteReinscription) {
          statusEl.dataset.status = 'priority';
          const dateEl = document.getElementById('inscription-priority-date');
          if (dateEl) {
            try {
              dateEl.textContent = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(`${data.dateLimiteReinscription}T00:00:00`));
            } catch {
              dateEl.textContent = data.dateLimiteReinscription;
            }
          }
        } else {
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

  // État rempli par /api/categories ci-dessous — initialisé au repli hors-ligne (FALLBACK_*) puis
  // remplacé dès que l'appel réussit. Des `let` (pas `const`) : les gestionnaires d'événements
  // enregistrés plus bas (fermeture) lisent la valeur en vigueur au moment où ils s'exécutent, pas
  // celle au moment de leur enregistrement.
  let saison = FALLBACK_SAISON;
  let prix = FALLBACK_PRIX;
  let categorieParAnnee = FALLBACK_CATEGORIE_PAR_ANNEE;
  let helloAssoUrls = FALLBACK_HELLOASSO_URLS;
  let helloAssoWidgetUrls = FALLBACK_HELLOASSO_WIDGET_URLS;
  let firstCategorieAvecHelloAsso = Object.keys(FALLBACK_HELLOASSO_WIDGET_URLS)[0];

  const naissanceInput = form.naissance;
  const categorieSelect = form.categorie;

  fetch('/api/categories')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data || !Array.isArray(data.categories) || !data.categories.length) return;

      if (data.saison) {
        saison = data.saison;
        document.querySelectorAll('[data-saison-text]').forEach((el) => {
          el.textContent = saison;
        });
      }
      if (Number.isFinite(data.prix)) {
        prix = data.prix;
        document.querySelectorAll('[data-prix-text]').forEach((el) => {
          el.textContent = prix;
        });
        // Approximation du montant par échéance affiché sur la carte d'offre — le détail exact des
        // 3 prélèvements dépend du plan de paiement configuré côté HelloAsso (onglet campagne), pas
        // de ce site ; ce n'est qu'un aperçu, jamais utilisé pour calculer un vrai paiement.
        document.querySelectorAll('[data-prix-tiers-text]').forEach((el) => {
          el.textContent = Math.round(prix / 3);
        });
      }

      categorieParAnnee = {};
      helloAssoUrls = {};
      helloAssoWidgetUrls = {};
      firstCategorieAvecHelloAsso = null;

      for (const c of data.categories) {
        for (let annee = c.anneeMin; annee <= c.anneeMax; annee++) categorieParAnnee[annee] = c.label;
        if (c.helloAssoUrl) helloAssoUrls[c.label] = c.helloAssoUrl;
        if (c.helloAssoWidgetUrl) helloAssoWidgetUrls[c.label] = c.helloAssoWidgetUrl;
        if (!firstCategorieAvecHelloAsso && c.helloAssoWidgetUrl) firstCategorieAvecHelloAsso = c.label;
      }
      if (!firstCategorieAvecHelloAsso) firstCategorieAvecHelloAsso = data.categories[0].label;

      if (categorieSelect) {
        const previousValue = categorieSelect.value;
        // Le libellé vient de /admin/categories (réservé au club, protégé par mot de passe) : le
        // risque d'y trouver du HTML malveillant est faible, mais on échappe quand même par principe
        // avant de l'injecter via innerHTML.
        const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        categorieSelect.innerHTML = data.categories
          .map((c) => {
            const annees = c.anneeMin === c.anneeMax ? c.anneeMin : `${c.anneeMin}-${c.anneeMax}`;
            return `<option value="${escapeHtml(c.label)}">${escapeHtml(c.label)} (${annees})</option>`;
          })
          .join('');
        // Si une date de naissance est déjà renseignée (pré-remplie par functions/reinscription/
        // [token].js, ou déjà saisie par l'utilisateur avant que cette réponse n'arrive), on
        // recalcule la catégorie à partir des tranches d'âge à jour plutôt que de garder l'ancienne
        // valeur telle quelle — indispensable pour la réinscription, où l'enfant change souvent de
        // catégorie d'une saison à l'autre. Sinon, reprend la sélection précédente si elle existe
        // toujours, ou garde le 1er élément par défaut.
        const anneeNaissance = naissanceInput?.value ? new Date(naissanceInput.value).getUTCFullYear() : null;
        const categorieRecalculee = anneeNaissance && categorieParAnnee[anneeNaissance];
        if (categorieRecalculee) {
          categorieSelect.value = categorieRecalculee;
        } else if (data.categories.some((c) => c.label === previousValue)) {
          categorieSelect.value = previousValue;
        }
      }
    })
    .catch(() => {}); // en cas d'échec, on garde les repères par défaut (FALLBACK_*) et le <select> statique du HTML

  if (naissanceInput && categorieSelect) {
    naissanceInput.addEventListener('change', () => {
      // getUTCFullYear (pas getFullYear) : "YYYY-MM-DD" est parsé comme minuit UTC, et lire
      // l'année en heure locale décalerait d'un an pour un fuseau très négatif (ex. UTC-8)
      // sur une naissance au 1er janvier.
      const annee = new Date(naissanceInput.value).getUTCFullYear();
      const categorie = categorieParAnnee[annee];
      if (categorie) categorieSelect.value = categorie;
    });
  }

  const submitBtn = form.querySelector('button[type=submit]');
  const submitBtnDefaultLabel = submitBtn.textContent;

  // Avertissement précoce (pas le contrôle définitif, qui reste au submit ci-dessous avec la
  // date exacte) : dès que prénom+nom de l'enfant et e-mail du parent sont remplis, un parent
  // n'a plus à finir tout le formulaire pour apprendre que son enfant est déjà inscrit — cas
  // réel d'un parent ayant soumis 4 fois de suite le même dossier.
  const duplicateWarning = document.getElementById('inscription-duplicate-warning');
  let duplicateCheckController = null;

  async function checkDuplicateInline() {
    const enfantPrenom = form.enfantPrenom.value.trim();
    const enfantNom = form.enfantNom.value.trim();
    const email = form.email.value.trim();
    if (!duplicateWarning || !enfantPrenom || !enfantNom || !email) {
      if (duplicateWarning) duplicateWarning.hidden = true;
      return;
    }

    duplicateCheckController?.abort();
    duplicateCheckController = new AbortController();
    try {
      const params = new URLSearchParams({ enfantPrenom, enfantNom, email });
      if (form.naissance.value) params.set('naissance', form.naissance.value);
      const res = await fetch(`/api/inscriptions?${params}`, { signal: duplicateCheckController.signal });
      const json = res.ok ? await res.json() : null;
      duplicateWarning.hidden = !json?.duplicate;
    } catch {
      // Requête abandonnée (nouvelle frappe pendant la vérification) ou réseau indisponible :
      // on n'affiche rien plutôt qu'une fausse alerte — le contrôle au submit reste la garde
      // définitive contre un vrai doublon en base.
    }
  }

  [form.enfantPrenom, form.enfantNom, form.email].forEach((el) => el.addEventListener('blur', checkDuplicateInline));

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
      saison,
      prix,
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
    let duplicateCreatedAt = null;
    try {
      const res = await fetch('/api/inscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, pdfBase64 }),
      });
      if (res.status === 409) {
        const json = await res.json().catch(() => null);
        if (json?.duplicate) duplicateCreatedAt = json.createdAt || '';
      } else if (res.ok) {
        const json = await res.json();
        uploadToken = json.uploadToken || null;
      }
    } catch {
      // uploadToken reste null : le bouton de dépôt sera remplacé par le repli mailto ci-dessous.
    }
    submitBtn.disabled = false;
    submitBtn.textContent = submitBtnDefaultLabel;

    // Anti-doublon : un enfant déjà inscrit (même nom/prénom/naissance/e-mail parent) ne
    // régénère pas de nouvelle fiche — un parent avait soumis le même dossier 4 fois de suite par
    // clics répétés, créant autant de lignes D1 et d'e-mails de confirmation. On s'arrête ici,
    // sans télécharger de PDF ni afficher les étapes suivantes.
    if (duplicateCreatedAt !== null) {
      const duplicateEl = document.getElementById('inscription-duplicate');
      const dateEl = document.getElementById('inscription-duplicate-date');
      if (dateEl) dateEl.textContent = formatDuplicateDate(duplicateCreatedAt);
      if (duplicateEl) {
        duplicateEl.hidden = false;
        duplicateEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    // Masqué au cas où un précédent essai (autre enfant) avait affiché le message de doublon.
    const duplicateEl = document.getElementById('inscription-duplicate');
    if (duplicateEl) duplicateEl.hidden = true;

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
      const widgetUrl = helloAssoWidgetUrls[data.categorie] || helloAssoWidgetUrls[firstCategorieAvecHelloAsso];
      helloassoWidgetContainer.innerHTML = '';
      helloassoWidgetContainer.appendChild(createHelloAssoWidget(widgetUrl));
      helloassoFallbackLink.href = helloAssoUrls[data.categorie] || helloAssoUrls[firstCategorieAvecHelloAsso];
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
