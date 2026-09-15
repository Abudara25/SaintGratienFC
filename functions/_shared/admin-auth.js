// Authentification et habillage partagés par les pages /admin/* : mot de passe unique comparé à un
// cookie HttpOnly, plus l'en-tête HTML, le bandeau de navigation et les petits composants communs
// (icônes, statuts, avatars, messages) — centralisés ici pour qu'une page admin reste cohérente avec
// les autres sans dupliquer ce code. CSS correspondant : assets/css/admin.css.
export const COOKIE_NAME = 'admin_auth';

// Mot de passe actuel : le secret Cloudflare ADMIN_PASSWORD reste la valeur par défaut, mais
// functions/admin/parametres.js permet de le changer depuis l'interface — dans ce cas la valeur
// choisie est stockée dans le KV "saintgratienfc_config" (même binding INSCRIPTION_STATUS que le
// statut d'ouverture des inscriptions, clé "admin_password") et prend le pas sur le secret. Sans
// changement via l'interface, le comportement est inchangé (secret Cloudflare seul).
export async function getAdminPassword(env) {
  try {
    const stored = await env.INSCRIPTION_STATUS.get('admin_password');
    if (stored) return stored;
  } catch {
    // KV indisponible (binding non configuré) : repli sur le secret.
  }
  return env.ADMIN_PASSWORD || null;
}

export async function setAdminPassword(env, newPassword) {
  await env.INSCRIPTION_STATUS.put('admin_password', newPassword);
}

export async function isAuthed(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/\badmin_auth=([^;]+)/);
  const currentPassword = await getAdminPassword(env);
  if (!match || !currentPassword) return false;
  // decodeURIComponent : la valeur est encodée à l'écriture (voir functions/admin/inscriptions.js)
  // pour qu'un mot de passe contenant ';', ',' ou un espace ne tronque pas le cookie.
  let value;
  try {
    value = decodeURIComponent(match[1]);
  } catch {
    return false;
  }
  return value === currentPassword;
}

export const escapeHtml = (str = '') =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Version (?v=) de tous les assets chargés par l'admin — Cloudflare Pages les met en cache 4h sans
// possibilité de le changer (voir CLAUDE.md) : à modifier ici à chaque édition de styles.css,
// admin.css ou d'un script chargé par l'admin, une seule fois pour toutes les pages.
const ASSETS_VERSION = '20260915a';
const asset = (path) => `${path}?v=${ASSETS_VERSION}`;

// Icônes au trait (viewBox 24, stroke 1.8), même convention que les SVG du site public.
const ICON_PATHS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
};

export function icon(name) {
  return `<svg class="adm-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}

export function adminHead(title, bodyClass = 'adm') {
  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${escapeHtml(title)} — Admin Saint-Gratien FC</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/svg+xml" href="/assets/images/favicon-admin.svg">
<link rel="icon" type="image/png" href="/assets/images/favicon-admin.png">
<link rel="manifest" href="/manifest-admin.json">
<link rel="apple-touch-icon" href="/assets/images/apple-touch-icon-admin.png">
<meta name="theme-color" content="#4f1414">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Admin SGFC">
<link rel="preload" href="/assets/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/oswald.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${asset('/assets/css/styles.css')}">
<link rel="stylesheet" href="${asset('/assets/css/admin.css')}">
</head><body class="${bodyClass}">`;
}

// Scripts externes uniquement : le CSP du site bloque les <script> inline (voir _headers).
export function adminScripts(...names) {
  return names.map((name) => `<script src="${asset(`/assets/js/${name}.js`)}"></script>`).join('\n');
}

// Onglets de navigation : barre horizontale dans le bandeau sur ordinateur, barre fixe en bas de
// l'écran sur mobile (les entrées "mobile" y figurent directement, les autres dans le menu "Plus").
const ADMIN_NAV_LINKS = [
  { key: 'dashboard', href: '/admin/dashboard', label: 'Tableau de bord', short: 'Accueil', icon: 'dashboard', mobile: true },
  { key: 'inscriptions', href: '/admin/inscriptions', label: 'Inscriptions', short: 'Inscriptions', icon: 'users', mobile: true },
  { key: 'reinscription', href: '/admin/reinscription', label: 'Réinscription', short: 'Réinscription', icon: 'refresh', mobile: true },
  { key: 'archive', href: '/admin/inscriptions?view=archive', label: 'Corbeille', icon: 'trash' },
  { key: 'events', href: '/admin/events', label: 'Événements', icon: 'activity' },
  { key: 'categories', href: '/admin/categories', label: 'Catégories', icon: 'tag' },
  { key: 'parametres', href: '/admin/parametres', label: 'Paramètres', icon: 'settings' },
];

// Bandeau commun (navigation + titre de page). title/eyebrow/subtitle/meta/lead/actions sont du HTML
// déjà échappé par l'appelant ; stats = [{ value, label }] (valeurs calculées, jamais saisies).
export function adminShell({ active, eyebrow = '', title, subtitle = '', stats = [], actions = '', back = null, lead = '', meta = '' }) {
  const current = (key) => (key === active ? ' is-active" aria-current="page' : '');
  const tabs = ADMIN_NAV_LINKS.map((l) => `<a href="${l.href}" class="adm-tab${current(l.key)}">${l.label}</a>`).join('');
  const mobileLinks = ADMIN_NAV_LINKS.filter((l) => l.mobile)
    .map((l) => `<a href="${l.href}" class="adm-tabbar-link${current(l.key)}">${icon(l.icon)}<span>${l.short}</span></a>`)
    .join('');
  const moreLinks = ADMIN_NAV_LINKS.filter((l) => !l.mobile);
  const moreActive = moreLinks.some((l) => l.key === active);

  return `<a href="#adm-main" class="skip-link">Aller au contenu</a>
<header class="adm-hero">
  <div class="adm-wrap">
    <div class="adm-topbar">
      <a href="/admin/dashboard" class="adm-brand">
        <img src="/assets/images/logo-96.webp" alt="" width="40" height="40">
        <span><strong>Saint-Gratien FC</strong><small>Espace admin</small></span>
      </a>
      <nav class="adm-tabs" aria-label="Navigation admin">${tabs}</nav>
      <a href="/admin/logout" class="adm-logout" title="Déconnexion">${icon('logout')}<span class="visually-hidden">Déconnexion</span></a>
    </div>
    <div class="adm-hero-main">
      <div class="adm-hero-heading">
        ${lead}
        <div class="adm-hero-text">
          ${back ? `<a href="${back.href}" class="adm-back">${icon('arrowLeft')}${escapeHtml(back.label)}</a>` : ''}
          ${eyebrow ? `<p class="adm-eyebrow">${eyebrow}</p>` : ''}
          <h1>${title}</h1>
          ${subtitle ? `<p class="adm-hero-sub">${subtitle}</p>` : ''}
          ${meta}
        </div>
      </div>
      ${actions ? `<div class="adm-hero-actions">${actions}</div>` : ''}
    </div>
    ${stats.length ? `<div class="adm-stats">${stats.map((s) => `<div class="adm-stat"><strong>${s.value}</strong><span>${s.label}</span></div>`).join('')}</div>` : ''}
  </div>
</header>
<nav class="adm-tabbar" aria-label="Navigation admin">
  ${mobileLinks}
  <details class="adm-more" data-dismiss>
    <summary class="adm-tabbar-link${moreActive ? ' is-active' : ''}">${icon('more')}<span>Plus</span></summary>
    <div class="adm-more-menu">
      ${moreLinks.map((l) => `<a href="${l.href}" class="${l.key === active ? 'is-active" aria-current="page' : ''}">${icon(l.icon)}${l.label}</a>`).join('')}
      <a href="/admin/logout">${icon('logout')}Déconnexion</a>
    </div>
  </details>
</nav>`;
}

export function loginPage({ error } = {}) {
  return `${adminHead('Connexion', 'adm adm-login-body')}
<main class="adm-login">
  <form method="POST" action="/admin/inscriptions" class="adm-login-card">
    <img src="/assets/images/logo-96.webp" alt="Blason du Saint-Gratien FC" width="72" height="72">
    <p class="adm-eyebrow">Espace admin</p>
    <h1>Connexion</h1>
    ${error ? flash('error', 'Mot de passe incorrect.') : ''}
    <div class="form-field">
      <label for="password">Mot de passe</label>
      <input type="password" id="password" name="password" autocomplete="current-password" required autofocus>
    </div>
    <button type="submit" class="adm-btn adm-btn-primary adm-btn-block">${icon('lock')}Se connecter</button>
  </form>
</main>
</body></html>`;
}

// type : 'ok' | 'error' | 'info' — message en texte brut, échappé ici.
export function flash(type, message) {
  return `<p class="adm-flash adm-flash-${type}" role="${type === 'error' ? 'alert' : 'status'}">${icon(type === 'error' ? 'alert' : type === 'info' ? 'calendar' : 'check')}<span>${escapeHtml(message)}</span></p>`;
}

export function statusTag(ok, { yes = 'Validé', no = 'Non validé' } = {}) {
  return ok ? `<span class="adm-tag is-yes">${icon('check')}${yes}</span>` : `<span class="adm-tag is-no">${no}</span>`;
}

// Photo de l'enfant si elle a été déposée (functions/admin/inscriptions/[id]/photo.js), sinon ses
// initiales sur un fond choisi d'après l'id : chaque fiche garde la même couleur d'une page à
// l'autre, ce qui aide à la repérer dans la liste.
export function avatar(row, size = '') {
  const classes = `adm-avatar adm-tone-${Math.abs(Number(row.id) || 0) % 5}${size ? ` adm-avatar-${size}` : ''}`;
  if (row.photo_uploaded_at) {
    return `<img class="${classes} adm-avatar-photo" src="/admin/inscriptions/${row.id}/photo?v=${encodeURIComponent(row.photo_uploaded_at)}" alt="" loading="lazy">`;
  }
  const initials = `${String(row.enfant_prenom || '').trim().charAt(0)}${String(row.enfant_nom || '').trim().charAt(0)}`.toUpperCase() || '?';
  return `<span class="${classes}" aria-hidden="true">${escapeHtml(initials)}</span>`;
}

// `datetime('now')` (SQLite) renvoie "YYYY-MM-DD HH:MM:SS" en UTC, sans "T" ni "Z".
export function formatDateFr(sqliteDatetime, options = { day: 'numeric', month: 'short' }) {
  if (!sqliteDatetime) return '';
  try {
    return escapeHtml(
      new Intl.DateTimeFormat('fr-FR', { ...options, timeZone: 'Europe/Paris' }).format(new Date(`${String(sqliteDatetime).replace(' ', 'T')}Z`))
    );
  } catch {
    return escapeHtml(sqliteDatetime);
  }
}

export const formatBirth = (iso) => escapeHtml(/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('/') : iso || '—');
