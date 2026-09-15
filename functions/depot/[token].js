// Espace famille « Mon inscription », lié depuis l'e-mail de confirmation, le PDF et la page
// d'inscription (lien unique par famille : upload_token, généré par functions/api/inscriptions.js).
// Montre où en est l'inscription — dossier signé, photo de l'enfant, paiement, les trois requis (voir
// isInscriptionComplete) — et permet de déposer le dossier signé (onRequestPost ci-dessous) et la
// photo (functions/depot/[token]/photo.js). Les fichiers sont stockés dans le bucket R2 "DOSSIERS"
// (à créer manuellement sur le dashboard Cloudflare Pages — voir CLAUDE.md), D1 ne garde que les
// références. Le paiement, lui, est validé par un responsable du club depuis l'admin.
import { ensureInscriptionsTable, isInscriptionComplete, dossierStatus, refusMotifs } from '../_shared/inscriptions-db.js';
import { getCategoriesConfig } from '../_shared/settings-kv.js';
import { PHOTO_ACCEPT } from '../_shared/photo-storage.js';
import { afterInscriptionChange } from '../_shared/automations.js';
import { readUpload } from '../_shared/security.js';

const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo
const UPLOAD_ERRORS = {
  empty: 'Choisissez un fichier avant d’envoyer.',
  too_large: 'Le fichier dépasse 10 Mo — réduisez-le (photo compressée, ou export PDF plus léger) et réessayez.',
  bad_type: 'Format non accepté — envoyez un PDF, un JPG ou un PNG.',
};
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const escapeHtml = (str = '') =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// `datetime('now')` (SQLite) renvoie "YYYY-MM-DD HH:MM:SS" en UTC, sans "T" ni "Z" — il faut les
// ajouter pour que `new Date(...)` le reconnaisse de façon fiable dans tous les moteurs JS.
const formatDate = (sqliteDatetime) => {
  try {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' }).format(new Date(`${sqliteDatetime.replace(' ', 'T')}Z`));
  } catch {
    return escapeHtml(sqliteDatetime);
  }
};

const ICONS = {
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
};
const icon = (name) =>
  `<svg class="suivi-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const tag = (ok) => (ok ? '<span class="suivi-tag is-ok">Validé</span>' : '<span class="suivi-tag is-todo">En attente</span>');
// Dossier signé : déposé mais pas encore vérifié, ou refusé par le club (voir dossierStatus).
const DOSSIER_TAGS = {
  valide: tag(true),
  a_verifier: '<span class="suivi-tag is-pending">En vérification</span>',
  refuse: '<span class="suivi-tag is-error">À corriger</span>',
  manquant: tag(false),
};
const flash = (type, message) =>
  `<p class="suivi-flash is-${type}" role="${type === 'error' ? 'alert' : 'status'}">${icon(type === 'error' ? 'alert' : 'check')}<span>${escapeHtml(message)}</span></p>`;

// Exemples illustrés (pas de vraie photo d'enfant) : le même portrait sur fond blanc et sur fond chargé.
const PORTRAIT = '<circle cx="60" cy="60" r="24" fill="#c4b3a0"/><path d="M20 150c4-34 21-52 40-52s36 18 40 52z" fill="#c4b3a0"/>';
const EXAMPLES = `<div class="suivi-examples" aria-hidden="true">
  <figure class="suivi-example is-good">
    <svg viewBox="0 0 120 150"><rect x=".5" y=".5" width="119" height="149" rx="10" fill="#fff" stroke="#e3dccb"/>${PORTRAIT}</svg>
    <figcaption>${icon('check')}Fond blanc</figcaption>
  </figure>
  <figure class="suivi-example is-bad">
    <svg viewBox="0 0 120 150"><rect width="120" height="150" fill="#8fbf95"/><rect width="48" height="92" fill="#7aa6d4"/><circle cx="96" cy="28" r="15" fill="#f0c36b"/><rect x="74" y="66" width="46" height="84" fill="#b8896a"/>${PORTRAIT}</svg>
    <figcaption>${icon('x')}Fond chargé</figcaption>
  </figure>
</div>`;

// Valeurs identiques au <select> modePaiement d'inscription.html (et à MODES_PAIEMENT de ./[token]/paiement.js).
const PAYMENT_CHOICES = [
  ['HelloAsso', 'HelloAsso', 'Carte bancaire, en ligne — paiement en 3 fois sans frais possible'],
  ['Espèces', 'Espèces', "À remettre à un responsable du club, par exemple lors d'un entraînement"],
  ['Chèque', 'Chèque', "À remettre à un responsable du club, par exemple lors d'un entraînement"],
];

function helloAssoUrlFor(categories, label) {
  const categorie = categories.find((c) => c.label === label);
  return categorie && /^https:\/\//.test(categorie.helloAssoUrl || '') ? categorie.helloAssoUrl : '';
}

function page({ inscription, saison, prix, helloAssoUrl, messages, siteUrl }) {
  const token = escapeHtml(inscription.upload_token);
  // Même PDF qu'à l'inscription (assets/js/pdf-inscription.js, généré dans le navigateur par
  // assets/js/suivi.js) : la famille peut le retélécharger si elle a perdu l'e-mail de confirmation.
  // Même forme de données que la fiche admin (functions/admin/inscriptions/[id].js).
  const pdfData = {
    enfantPrenom: inscription.enfant_prenom,
    enfantNom: inscription.enfant_nom,
    naissance: inscription.naissance,
    categorie: inscription.categorie,
    saison,
    prix,
    tailleMaillot: inscription.taille_maillot,
    modePaiement: inscription.mode_paiement,
    parentPrenom: inscription.parent_prenom,
    parentNom: inscription.parent_nom,
    email: inscription.email,
    telephone: inscription.telephone,
    adresse: inscription.adresse,
    codePostal: inscription.code_postal,
    ville: inscription.ville,
    droitImage: inscription.droit_image,
    parent2Prenom: inscription.parent2_prenom,
    parent2Nom: inscription.parent2_nom,
    parent2Email: inscription.parent2_email,
    parent2Telephone: inscription.parent2_telephone,
  };
  const prenom = escapeHtml(inscription.enfant_prenom);
  const nomEnfant = `${prenom} ${escapeHtml(inscription.enfant_nom)}`;
  const dossier = dossierStatus(inscription);
  const docOk = dossier === 'valide';
  const payOk = Boolean(inscription.paye);
  const photoOk = Boolean(inscription.photo_uploaded_at);
  // La photo n'est pas vérifiée par le club : « Reçue », pas « Validé ».
  const photoTag = photoOk ? '<span class="suivi-tag is-ok">Reçue</span>' : tag(false);
  const complete = isInscriptionComplete(inscription);
  const done = [docOk, photoOk, payOk].filter(Boolean).length;
  const remaining = 3 - done;
  const percent = Math.round((done / 3) * 100);
  const mode = inscription.mode_paiement || '';
  const photoSrc = photoOk ? `/depot/${token}/photo?v=${encodeURIComponent(inscription.photo_uploaded_at)}` : '';
  const initials = escapeHtml(`${String(inscription.enfant_prenom || '').charAt(0)}${String(inscription.enfant_nom || '').charAt(0)}`.toUpperCase());

  const step = (iconName, title, detail, ok, stateTag = tag(ok)) => `<li class="suivi-step${ok ? ' is-ok' : ''}">
        <span class="suivi-step-ico">${icon(ok ? 'check' : iconName)}</span>
        <span class="suivi-step-text"><strong>${title}</strong><small>${detail}</small></span>
        ${stateTag}
      </li>`;
  const dossierDetail = {
    valide: `Validé le ${formatDate(inscription.dossier_verified_at || inscription.dossier_uploaded_at)}`,
    a_verifier: `Reçu le ${formatDate(inscription.dossier_uploaded_at)}`,
    refuse: '<a href="#dossier">Incomplet : voir ce qu’il manque</a>',
    manquant: '<a href="#dossier">À déposer ci-dessous</a>',
  }[dossier];
  const motifs = refusMotifs(inscription);
  const commentaire = String(inscription.dossier_refus_commentaire || '').trim();

  const summary = `<div class="suivi-card suivi-summary${complete ? ' is-complete' : ''}">
    <div class="suivi-id">
      ${photoOk ? `<img class="suivi-avatar" src="${photoSrc}" alt="Photo de ${prenom}">` : `<span class="suivi-avatar" aria-hidden="true">${initials}</span>`}
      <div>
        <h2>${nomEnfant}</h2>
        <p>${escapeHtml(inscription.categorie)} · saison ${escapeHtml(saison)}</p>
      </div>
    </div>
    <div class="suivi-progress">
      <div class="suivi-progress-head"><strong>${done} étape${done > 1 ? 's' : ''} validée${done > 1 ? 's' : ''} sur 3</strong><span>${percent} %</span></div>
      <span class="suivi-bar"><span style="width:${percent}%"></span></span>
    </div>
    ${
      complete
        ? `<div class="suivi-banner is-complete">${icon('check')}<div><strong>Dossier complet, merci !</strong><p>Tout est validé de notre côté. Le club enregistre maintenant la licence de ${prenom} auprès de la Fédération Française de Football, généralement sous quelques jours.</p></div></div>`
        : `<div class="suivi-banner">${icon('clock')}<div><strong>Encore ${remaining} étape${remaining > 1 ? 's' : ''} à valider</strong><p>Chaque étape passe au vert dès qu'elle est validée par le club.</p></div></div>`
    }
    <ul class="suivi-steps">
      ${step('file', 'Dossier signé', dossierDetail, docOk, DOSSIER_TAGS[dossier])}
      ${step('camera', `Photo de ${prenom}`, photoOk ? `Reçue le ${formatDate(inscription.photo_uploaded_at)}` : '<a href="#photo">À ajouter ci-dessous</a>', photoOk, photoTag)}
      ${step('card', 'Paiement', payOk ? `Reçu${mode ? ` (${escapeHtml(mode)})` : ''}` : `${mode ? `${escapeHtml(mode)} · ` : ''}<a href="#paiement">en attente de réception</a>`, payOk, payOk ? '<span class="suivi-tag is-ok">Payé</span>' : tag(false))}
    </ul>
  </div>`;

  const dossierCard = `<div class="suivi-card" id="dossier">
    <div class="suivi-card-head"><h2>${icon('file')}Dossier signé</h2>${DOSSIER_TAGS[dossier]}</div>
    ${messages.dossierOk ? flash('ok', 'Dossier bien reçu, merci ! Le club va vérifier qu’il est bien complet, signé et daté.') : ''}
    ${messages.error ? flash('error', messages.error) : ''}
    ${
      dossier === 'refuse'
        ? `<div class="suivi-refus" role="alert">
      <p><strong>${icon('alert')}Le dossier reçu est incomplet</strong></p>
      ${
        motifs.length
          ? `<p>Nous n'avons pas pu le valider pour ${motifs.length > 1 ? 'les raisons suivantes' : 'la raison suivante'} :</p>
      <ul>${motifs.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`
          : ''
      }
      ${commentaire ? `<p><strong>Précision du club :</strong> ${escapeHtml(commentaire)}</p>` : ''}
      <p>Complétez-le puis déposez-le à nouveau ci-dessous.</p>
    </div>`
        : ''
    }
    <p class="suivi-help">${
      {
        valide: `Votre dossier a été vérifié et validé par le club le ${formatDate(inscription.dossier_verified_at || inscription.dossier_uploaded_at)}, merci !`,
        a_verifier: `Nous avons bien reçu votre dossier le ${formatDate(inscription.dossier_uploaded_at)}. Le club vérifie qu'il est complet, signé et daté : cette étape passera au vert dès qu'il sera validé. Vous pouvez le remplacer ci-dessous si besoin.`,
        refuse: 'Pas de souci, vous pouvez retélécharger le dossier si besoin.',
        manquant: 'Imprimez le dossier, remplissez le lieu et la date, signez-le, puis déposez-le ici : un scan ou une simple photo du document suffit.',
      }[dossier]
    }</p>
    <div class="suivi-download">
      <button type="button" class="btn btn-dark suivi-pdf-btn" data-pdf="${escapeHtml(JSON.stringify(pdfData))}" data-depot-url="${escapeHtml(`${siteUrl}/depot/${inscription.upload_token}`)}">Télécharger mon dossier à signer</button>
      <small>Vous ne l'avez plus ? Il est régénéré à l'identique.</small>
    </div>
    <form method="POST" action="/depot/${token}" enctype="multipart/form-data" class="suivi-upload">
      <label for="dossier">Fiche d'inscription signée (PDF ou photo)</label>
      <ul class="suivi-checklist">
        <li>${icon('check')}<span>Le lieu et la date sont remplis (« Fait à …, le … »)</span></li>
        <li>${icon('check')}<span>Le responsable légal a signé</span></li>
        <li>${icon('check')}<span>Le document est entier et bien lisible</span></li>
      </ul>
      <input type="file" id="dossier" name="dossier" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required>
      <small>PDF, JPG ou PNG, 10 Mo maximum.</small>
      <button type="submit" class="btn btn-primary">${dossier === 'refuse' ? 'Envoyer le dossier corrigé' : dossier === 'manquant' ? 'Envoyer mon dossier' : 'Remplacer mon dossier'}</button>
    </form>
  </div>`;

  const photoCard = `<div class="suivi-card" id="photo">
    <div class="suivi-card-head"><h2>${icon('camera')}Photo de ${prenom}</h2>${photoTag}</div>
    ${messages.photoOk ? flash('ok', 'Photo bien reçue, merci !') : ''}
    ${messages.photoError ? flash('error', messages.photoError) : ''}
    <div class="suivi-photo-grid">
      <div class="suivi-photo-preview">${photoOk ? `<img src="${photoSrc}" alt="Photo de ${prenom}">` : `<span>${icon('camera')}Pas encore de photo</span>`}</div>
      <div>
        <p class="suivi-help">Elle reste réservée au club. Pour une photo réussie :</p>
        <ul class="suivi-tips">
          <li>${icon('check')}<span><strong>Sur un fond blanc</strong> ou très clair : un mur blanc fait parfaitement l'affaire.</span></li>
          <li>${icon('check')}<span><strong>De face</strong>, le visage bien visible et centré, les épaules dans le cadre.</span></li>
          <li>${icon('check')}<span><strong>Bien éclairée</strong>, idéalement à la lumière du jour, sans ombre sur le visage.</span></li>
          <li>${icon('check')}<span><strong>Sans casquette</strong> ni lunettes de soleil.</span></li>
        </ul>
        ${EXAMPLES}
      </div>
    </div>
    <form method="POST" action="/depot/${token}/photo" enctype="multipart/form-data" class="suivi-upload">
      <label for="photo">Photo de ${prenom}</label>
      <input type="file" id="photo" name="photo" accept="${PHOTO_ACCEPT}" required>
      <small>JPG, PNG ou WebP, 10 Mo maximum. Une photo prise avec un téléphone convient très bien.</small>
      <button type="submit" class="btn btn-primary">${photoOk ? 'Remplacer la photo' : 'Envoyer la photo'}</button>
    </form>
  </div>`;

  const paiementCard = payOk
    ? ''
    : `<div class="suivi-card" id="paiement">
    <div class="suivi-card-head"><h2>${icon('card')}Paiement de l'adhésion</h2>${tag(false)}</div>
    ${messages.modeOk ? flash('ok', 'Mode de paiement enregistré, merci !') : ''}
    ${messages.modeError ? flash('error', messages.modeError) : ''}
    ${
      mode === 'HelloAsso'
        ? `<p class="suivi-help">Vous avez choisi de régler en ligne avec HelloAsso (carte bancaire).</p>${
            helloAssoUrl ? `<a href="${escapeHtml(helloAssoUrl)}" class="btn btn-primary" target="_blank" rel="noopener">Payer sur HelloAsso</a>` : ''
          }`
        : `<p class="suivi-help">${
            mode ? `Vous avez choisi de régler par <strong>${escapeHtml(mode.toLowerCase())}</strong> : ` : ''
          }à remettre à un responsable du club, par exemple lors d'un entraînement (le jeudi de 17h à 18h, au Stade Robert Lemoine).</p>`
    }
    <p class="suivi-note">Dès que le club a bien reçu votre règlement, il le valide et cette étape passe au vert — cela peut prendre quelques jours.</p>
    <details class="suivi-change"${messages.modeError ? ' open' : ''}>
      <summary>Changer de mode de paiement</summary>
      <form method="POST" action="/depot/${token}/paiement" class="suivi-change-form">
        <fieldset>
          <legend>Comment souhaitez-vous régler l'adhésion ?</legend>
          ${PAYMENT_CHOICES.map(
            ([value, title, detail]) => `<label class="suivi-choice">
            <input type="radio" name="modePaiement" value="${value}"${value === mode ? ' checked' : ''} required>
            <span><strong>${title}</strong><small>${detail}</small></span>
          </label>`
          ).join('')}
        </fieldset>
        <button type="submit" class="btn btn-dark">Enregistrer ce choix</button>
      </form>
    </details>
  </div>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mon inscription — Saint-Gratien FC</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/assets/images/favicon.ico">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/assets/images/apple-touch-icon.png">
<meta name="theme-color" content="#4f1414">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Saint-Gratien FC">
<link rel="preload" href="/assets/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/oswald.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/styles.css?v=7109b179b1">
<link rel="stylesheet" href="/assets/css/suivi.css?v=d301f4a08f">
</head>
<body>
<a href="#main" class="skip-link">Aller au contenu</a>

<header class="site-header">
  <div class="container">
    <a href="/" class="brand">
      <img src="/assets/images/logo-96.webp" alt="Blason du Saint-Gratien FC" width="48" height="48">
      <span class="brand-name"><strong>Saint-Gratien FC</strong><span>Val-d'Oise</span></span>
    </a>
    <nav class="main-nav" id="main-nav" aria-label="Navigation principale">
      <ul>
        <li><a href="/">Accueil</a></li>
        <li><a href="/actualites">Actualités</a></li>
        <li><a href="/equipe">Le Club</a></li>
        <li><a href="/entrainements">Entraînements</a></li>
        <li><a href="/partenaires">Partenaires</a></li>
        <li><a href="/contact">Contact</a></li>
      </ul>
    </nav>
    <div class="header-actions">
      <button class="burger" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="main-nav">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</header>

<main id="main">
  <div class="page-header">
    <div class="container">
      <span class="eyebrow">Espace famille</span>
      <h1>Mon inscription</h1>
      <p>Suivez le dossier de ${nomEnfant} étape par étape.</p>
    </div>
  </div>

  <section class="bg-cream">
    <div class="container suivi-wrap">
      ${summary}
      ${dossierCard}
      ${photoCard}
      ${paiementCard}
      <p class="suivi-contact">Une question ? Écrivez-nous à <a href="mailto:contact@saintgratienfc.fr">contact@saintgratienfc.fr</a>.</p>
    </div>
  </section>
</main>

<footer class="site-footer">
  <div class="container">
    <div class="footer-bottom">
      <p>© 2026 Saint-Gratien FC — Tous droits réservés.</p>
      <p><a href="/mentions-legales">Mentions légales</a> · <a href="/confidentialite">Confidentialité</a></p>
    </div>
  </div>
</footer>

<script src="/assets/js/main.js?v=e9e2287f4e"></script>
<script src="/assets/js/pdf-inscription.js?v=694e920360"></script>
<script src="/assets/js/suivi.js?v=3e7079aba5"></script>
</body>
</html>
`;
}

async function loadInscription(env, token) {
  await ensureInscriptionsTable(env.DB);
  return env.DB.prepare('SELECT * FROM inscriptions WHERE upload_token = ?').bind(token).first();
}

async function notFound(request, env) {
  const siteUrl = new URL(request.url).origin;
  const res = await env.ASSETS.fetch(new URL('/404.html', siteUrl));
  return new Response(res.body, { status: 404, headers: res.headers });
}

async function render(env, inscription, messages, status = 200, siteUrl = 'https://saintgratienfc.fr') {
  const { saison, prix, categories } = await getCategoriesConfig(env);
  return new Response(
    page({
      inscription,
      saison: inscription.saison || saison,
      prix,
      helloAssoUrl: helloAssoUrlFor(categories, inscription.categorie),
      messages,
      siteUrl,
    }),
    { status, headers: { 'Content-Type': 'text/html;charset=UTF-8' } }
  );
}

export async function onRequestGet({ request, env, params }) {
  const inscription = await loadInscription(env, params.token);
  if (!inscription) return notFound(request, env);

  const { searchParams } = new URL(request.url);
  return render(env, inscription, {
    dossierOk: searchParams.get('ok') === '1',
    photoOk: searchParams.get('photoOk') === '1',
    photoError: searchParams.get('photoError'),
    modeOk: searchParams.get('modeOk') === '1',
    modeError: searchParams.get('modeError'),
  }, 200, new URL(request.url).origin);
}

export async function onRequestPost({ request, env, params, waitUntil }) {
  const inscription = await loadInscription(env, params.token);
  if (!inscription) return notFound(request, env);

  const renderError = (error) => render(env, inscription, { error }, 400, new URL(request.url).origin);

  let form;
  try {
    form = await request.formData();
  } catch {
    return renderError('Envoi invalide, réessayez.');
  }

  if (!env.DOSSIERS) {
    return renderError("Le dépôt en ligne n'est pas encore activé pour le moment, merci de nous envoyer votre dossier par e-mail à contact@saintgratienfc.fr en attendant.");
  }
  // Type déduit du contenu du fichier, pas de ce qu'annonce le navigateur.
  const upload = await readUpload(form.get('dossier'), { allowedTypes: ALLOWED_TYPES, maxSize: MAX_SIZE });
  if (upload.error) return renderError(UPLOAD_ERRORS[upload.error]);

  const key = `dossiers/${params.token}`;
  try {
    await env.DOSSIERS.put(key, upload.buffer, { httpMetadata: { contentType: upload.type } });
    // Tout nouveau dépôt de la famille repasse « à vérifier » par le club, même après une validation.
    await env.DB.prepare("UPDATE inscriptions SET dossier_key = ?, dossier_content_type = ?, dossier_uploaded_at = datetime('now'), dossier_status = 'a_verifier', dossier_verified_at = NULL WHERE upload_token = ?")
      .bind(key, upload.type, params.token)
      .run();
  } catch {
    return renderError("Échec de l'envoi, réessayez ou écrivez-nous à contact@saintgratienfc.fr.");
  }

  // Copie de sauvegarde best-effort : ne doit jamais faire échouer le dépôt principal, qui a
  // déjà réussi à ce stade (D1 mis à jour, réponse déjà déterminée ci-dessous).
  if (env.DOSSIERS_BACKUP) {
    waitUntil(env.DOSSIERS_BACKUP.put(key, upload.buffer, { httpMetadata: { contentType: upload.type } }).catch(() => {}));
  }

  waitUntil(afterInscriptionChange(env, { id: inscription.id, before: inscription, step: 'dossier', source: 'famille', siteUrl: new URL(request.url).origin }));
  return new Response('', { status: 302, headers: { Location: `/depot/${inscription.upload_token}?ok=1#dossier` } });
}
