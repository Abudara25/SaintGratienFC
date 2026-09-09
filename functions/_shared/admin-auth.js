// Authentification partagée par les pages /admin/* (liste, édition, suppression des
// inscriptions...) : mot de passe unique comparé à un cookie HttpOnly. Centralisé ici pour qu'une
// nouvelle page admin applique la même vérification sans la dupliquer — voir
// functions/admin/inscriptions.js et functions/admin/inscriptions/[id].js.
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

export function loginPage({ error } = {}) {
  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Connexion — Admin Saint-Gratien FC</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/svg+xml" href="/assets/images/favicon-admin.svg">
<link rel="icon" type="image/png" href="/assets/images/favicon-admin.png">
<link rel="manifest" href="/manifest-admin.json">
<link rel="apple-touch-icon" href="/assets/images/apple-touch-icon-admin.png">
<meta name="theme-color" content="#4f1414">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Admin SGFC">
<link rel="stylesheet" href="/assets/css/styles.css?v=20260909g">
</head><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--cream-50);">
<form method="POST" action="/admin/inscriptions" style="background:var(--white);padding:32px;border-radius:var(--radius-lg);box-shadow:var(--shadow-md);max-width:340px;width:100%;">
  <h1 style="font-size:1.2rem;margin-bottom:16px;">Espace inscriptions</h1>
  ${error ? '<p style="color:var(--color-error, #b3261e);margin-bottom:12px;font-size:.9rem;">Mot de passe incorrect.</p>' : ''}
  <div class="form-field" style="margin-bottom:16px;">
    <label for="password">Mot de passe</label>
    <input type="password" id="password" name="password" required autofocus>
  </div>
  <button type="submit" class="btn btn-primary btn-block">Se connecter</button>
</form>
</body></html>`;
}

export const escapeHtml = (str = '') =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Navigation commune à chaque page /admin/* authentifiée — remplace les liens de retour/
// déconnexion qui étaient dispersés (et incohérents d'une page à l'autre) dans une petite barre
// en haut de chaque page. `active` sélectionne l'entrée en surbrillance (voir ADMIN_NAV_LINKS) ;
// CSS partagé dans assets/css/styles.css (.admin-layout/.admin-sidebar/...), pas dupliqué dans le
// <style> inline de chaque page puisqu'elles chargent déjà ce fichier.
const ADMIN_NAV_LINKS = [
  { key: 'dashboard', href: '/admin/dashboard', label: 'Tableau de bord' },
  { key: 'inscriptions', href: '/admin/inscriptions', label: 'Inscriptions' },
  { key: 'reinscription', href: '/admin/reinscription', label: 'Réinscription' },
  { key: 'archive', href: '/admin/inscriptions?view=archive', label: 'Corbeille' },
  { key: 'events', href: '/admin/events', label: 'Événements' },
  { key: 'categories', href: '/admin/categories', label: 'Catégories' },
  { key: 'parametres', href: '/admin/parametres', label: 'Paramètres' },
];

export function adminSidebar(active) {
  const links = ADMIN_NAV_LINKS.map(
    (l) => `<a href="${l.href}" class="admin-nav-link${l.key === active ? ' admin-nav-active' : ''}">${l.label}</a>`
  ).join('');
  // Le bouton burger n'existe visuellement (CSS) que sous 760px ; toggle géré par
  // assets/js/admin-nav.js (basculement de la classe admin-nav-open sur .admin-sidebar).
  return `<nav class="admin-sidebar" aria-label="Navigation admin">
    <div class="admin-sidebar-top">
      <span class="admin-sidebar-brand">Saint-Gratien FC</span>
      <button type="button" class="admin-nav-toggle" aria-expanded="false" aria-controls="admin-nav-links">
        <span aria-hidden="true">&#9776;</span><span class="visually-hidden">Menu</span>
      </button>
    </div>
    <div class="admin-sidebar-links" id="admin-nav-links">${links}</div>
    <a href="/admin/logout" class="admin-nav-link admin-nav-logout">Déconnexion</a>
  </nav>`;
}
