// Authentification partagée par les pages /admin/* (liste, édition, suppression des
// inscriptions...) : mot de passe unique (secret Cloudflare ADMIN_PASSWORD, jamais commité)
// comparé à un cookie HttpOnly. Centralisé ici pour qu'une nouvelle page admin applique la même
// vérification sans la dupliquer — voir functions/admin/inscriptions.js et
// functions/admin/inscriptions/[id].js.
export const COOKIE_NAME = 'admin_auth';

export function isAuthed(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/\badmin_auth=([^;]+)/);
  return !!env.ADMIN_PASSWORD && match?.[1] === env.ADMIN_PASSWORD;
}

export function loginPage({ error } = {}) {
  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Connexion — Admin Saint-Gratien FC</title>
<meta name="robots" content="noindex, nofollow">
<link rel="stylesheet" href="/assets/css/styles.css?v=20260905">
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
