// Espace famille « Mon inscription », lié depuis l'e-mail de confirmation, le PDF et la page
// d'inscription (lien unique par famille : upload_token, généré par functions/api/inscriptions.js).
// Montre où en est l'inscription — dossier signé, photo de l'enfant, paiement, les trois requis (voir
// isInscriptionComplete) — et permet de déposer le dossier signé (onRequestPost ci-dessous) et la
// photo (functions/depot/[token]/photo.js). Les fichiers sont stockés dans le bucket R2 "DOSSIERS"
// (à créer manuellement sur le dashboard Cloudflare Pages — voir CLAUDE.md), D1 ne garde que les
// références. Le paiement, lui, est validé par un responsable du club depuis l'admin.
import { ensureInscriptionsTable, isInscriptionComplete } from '../_shared/inscriptions-db.js';
import { getCategoriesConfig } from '../_shared/settings-kv.js';
import { PHOTO_ACCEPT } from '../_shared/photo-storage.js';
import { afterInscriptionChange } from '../_shared/automations.js';

const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo
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
  const docOk = Boolean(inscription.dossier_uploaded_at);
  const payOk = Boolean(inscription.paye);
  const photoOk = Boolean(inscription.photo_uploaded_at);
  const complete = isInscriptionComplete(inscription);
  const done = [docOk, photoOk, payOk].filter(Boolean).length;
  const remaining = 3 - done;
  const percent = Math.round((done / 3) * 100);
  const mode = inscription.mode_paiement || '';
  const photoSrc = photoOk ? `/depot/${token}/photo?v=${encodeURIComponent(inscription.photo_uploaded_at)}` : '';
  const initials = escapeHtml(`${String(inscription.enfant_prenom || '').charAt(0)}${String(inscription.enfant_nom || '').charAt(0)}`.toUpperCase());

  const step = (iconName, title, detail, ok) => `<li class="suivi-step${ok ? ' is-ok' : ''}">
        <span class="suivi-step-ico">${icon(ok ? 'check' : iconName)}</span>
        <span class="suivi-step-text"><strong>${title}</strong><small>${detail}</small></span>
        ${tag(ok)}
      </li>`;

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
      ${step('file', 'Dossier signé', docOk ? `Reçu le ${formatDate(inscription.dossier_uploaded_at)}` : '<a href="#dossier">À déposer ci-dessous</a>', docOk)}
      ${step('camera', `Photo de ${prenom}`, photoOk ? `Reçue le ${formatDate(inscription.photo_uploaded_at)}` : '<a href="#photo">À ajouter ci-dessous</a>', photoOk)}
      ${step('card', 'Paiement', payOk ? `Reçu${mode ? ` (${escapeHtml(mode)})` : ''}` : `${mode ? `${escapeHtml(mode)} · ` : ''}<a href="#paiement">en attente de réception</a>`, payOk)}
    </ul>
  </div>`;

  const dossierCard = `<div class="suivi-card" id="dossier">
    <div class="suivi-card-head"><h2>${icon('file')}Dossier signé</h2>${tag(docOk)}</div>
    ${messages.dossierOk ? flash('ok', 'Dossier bien reçu, merci !') : ''}
    ${messages.error ? flash('error', messages.error) : ''}
    <p class="suivi-help">${
      docOk
        ? `Nous avons bien reçu votre dossier le ${formatDate(inscription.dossier_uploaded_at)}. Vous pouvez le remplacer ci-dessous si besoin.`
        : 'Imprimez le dossier, faites-le signer, puis déposez-le ici : un scan ou une simple photo du document suffit.'
    }</p>
    <div class="suivi-download">
      <button type="button" class="btn btn-dark suivi-pdf-btn" data-pdf="${escapeHtml(JSON.stringify(pdfData))}" data-depot-url="${escapeHtml(`${siteUrl}/depot/${inscription.upload_token}`)}">Télécharger mon dossier à signer</button>
      <small>Vous ne l'avez plus ? Il est régénéré à l'identique.</small>
    </div>
    <form method="POST" action="/depot/${token}" enctype="multipart/form-data" class="suivi-upload">
      <label for="dossier">Fiche d'inscription signée (PDF ou photo)</label>
      <input type="file" id="dossier" name="dossier" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required>
      <small>PDF, JPG ou PNG, 10 Mo maximum.</small>
      <button type="submit" class="btn btn-primary">${docOk ? 'Remplacer mon dossier' : 'Envoyer mon dossier'}</button>
    </form>
  </div>`;

  const photoCard = `<div class="suivi-card" id="photo">
    <div class="suivi-card-head"><h2>${icon('camera')}Photo de ${prenom}</h2>${tag(photoOk)}</div>
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
<link rel="stylesheet" href="/assets/css/styles.css?v=20260915a">
<link rel="stylesheet" href="/assets/css/suivi.css?v=20260915b">
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

<script src="/assets/js/main.js?v=20260909c"></script>
<script src="/assets/js/pdf-inscription.js?v=20260915a"></script>
<script src="/assets/js/suivi.js?v=20260915a"></script>
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

  const file = form.get('dossier');
  if (!file || typeof file === 'string' || !file.size) {
    return renderError('Choisissez un fichier avant d’envoyer.');
  }
  if (file.size > MAX_SIZE) {
    return renderError('Le fichier dépasse 10 Mo — réduisez-le (photo compressée, ou export PDF plus léger) et réessayez.');
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return renderError('Format non accepté — envoyez un PDF, un JPG ou un PNG.');
  }

  if (!env.DOSSIERS) {
    return renderError("Le dépôt en ligne n'est pas encore activé pour le moment, merci de nous envoyer votre dossier par e-mail à contact@saintgratienfc.fr en attendant.");
  }

  const key = `dossiers/${params.token}`;
  let buffer;
  try {
    // arrayBuffer() plutôt que file.stream() : un stream ne se lit qu'une fois, et ce même
    // buffer sert aussi à la copie de sauvegarde ci-dessous (bucket R2 "DOSSIERS_BACKUP", voir
    // CLAUDE.md — aucun mécanisme de backup natif pour R2, contrairement à D1/Time Travel).
    buffer = await file.arrayBuffer();
    await env.DOSSIERS.put(key, buffer, { httpMetadata: { contentType: file.type } });
    await env.DB.prepare('UPDATE inscriptions SET dossier_key = ?, dossier_content_type = ?, dossier_uploaded_at = datetime(\'now\') WHERE upload_token = ?')
      .bind(key, file.type, params.token)
      .run();
  } catch {
    return renderError("Échec de l'envoi, réessayez ou écrivez-nous à contact@saintgratienfc.fr.");
  }

  // Copie de sauvegarde best-effort : ne doit jamais faire échouer le dépôt principal, qui a
  // déjà réussi à ce stade (D1 mis à jour, réponse déjà déterminée ci-dessous).
  if (env.DOSSIERS_BACKUP) {
    waitUntil(env.DOSSIERS_BACKUP.put(key, buffer, { httpMetadata: { contentType: file.type } }).catch(() => {}));
  }

  waitUntil(afterInscriptionChange(env, { id: inscription.id, before: inscription, step: 'dossier', source: 'famille', siteUrl: new URL(request.url).origin }));
  return new Response('', { status: 302, headers: { Location: `/depot/${inscription.upload_token}?ok=1#dossier` } });
}
