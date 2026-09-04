// Page de consultation des inscriptions (base D1 "DB"), protégée par un mot de passe partagé
// (variable Cloudflare Pages ADMIN_PASSWORD, jamais commitée). Réservée aux responsables du club.
import { ensureInscriptionsTable } from '../_shared/inscriptions-db.js';

const escapeHtml = (str = '') =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const COOKIE_NAME = 'admin_auth';

function isAuthed(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/\badmin_auth=([^;]+)/);
  return !!env.ADMIN_PASSWORD && match?.[1] === env.ADMIN_PASSWORD;
}

function loginPage({ error } = {}) {
  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Connexion — Admin Saint-Gratien FC</title>
<meta name="robots" content="noindex, nofollow">
<link rel="stylesheet" href="/assets/css/styles.css?v=20260904">
</head><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--cream-50);">
<form method="POST" style="background:var(--white);padding:32px;border-radius:var(--radius-lg);box-shadow:var(--shadow-md);max-width:340px;width:100%;">
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

function toCsv(rows) {
  const headers = ['Date', 'Enfant', 'Naissance', 'Catégorie', 'Taille maillot', 'Parent', 'E-mail', 'Téléphone', 'Adresse', 'Code postal', 'Ville', 'Autorisation', 'Droit image', 'RGPD'];
  const escapeCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.created_at,
      `${r.enfant_prenom} ${r.enfant_nom}`,
      r.naissance,
      r.categorie,
      r.taille_maillot,
      `${r.parent_prenom} ${r.parent_nom}`,
      r.email,
      r.telephone,
      r.adresse,
      r.code_postal,
      r.ville,
      r.autorisation ? 'Oui' : 'Non',
      r.droit_image ? 'Oui' : 'Non',
      r.rgpd ? 'Oui' : 'Non',
    ]
      .map(escapeCsv)
      .join(',')
  );
  return [headers.map(escapeCsv).join(','), ...lines].join('\r\n');
}

function tablePage(rows) {
  const tableRows = rows
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.created_at)}</td>
        <td>${escapeHtml(r.enfant_prenom)} ${escapeHtml(r.enfant_nom)}</td>
        <td>${escapeHtml(r.naissance)}</td>
        <td>${escapeHtml(r.categorie)}</td>
        <td>${escapeHtml(r.taille_maillot)}</td>
        <td>${escapeHtml(r.parent_prenom)} ${escapeHtml(r.parent_nom)}</td>
        <td><a href="mailto:${escapeHtml(r.email)}">${escapeHtml(r.email)}</a></td>
        <td>${escapeHtml(r.telephone)}</td>
        <td>${escapeHtml(r.adresse)} ${escapeHtml(r.code_postal)} ${escapeHtml(r.ville)}</td>
        <td>${r.droit_image ? 'Oui' : 'Non'}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Inscriptions — Admin Saint-Gratien FC</title>
<meta name="robots" content="noindex, nofollow">
<link rel="stylesheet" href="/assets/css/styles.css?v=20260904">
<style>
  body{padding:24px;max-width:100%;}
  table{border-collapse:collapse;width:100%;font-size:.85rem;background:var(--white);}
  th,td{border:1px solid var(--cream-200);padding:8px 10px;text-align:left;white-space:nowrap;}
  th{background:var(--cream-100);position:sticky;top:0;}
  .wrap{overflow-x:auto;}
</style>
</head><body>
  <h1 style="font-size:1.3rem;">Inscriptions (${rows.length})</h1>
  <p style="margin-bottom:16px;"><a href="/admin/inscriptions?format=csv" class="btn btn-dark btn-sm">Exporter en CSV</a></p>
  <div class="wrap">
    <table>
      <thead><tr>
        <th>Date</th><th>Enfant</th><th>Naissance</th><th>Catégorie</th><th>Taille maillot</th>
        <th>Parent</th><th>E-mail</th><th>Téléphone</th><th>Adresse</th><th>Droit image</th>
      </tr></thead>
      <tbody>${tableRows || '<tr><td colspan="10">Aucune inscription pour le moment.</td></tr>'}</tbody>
    </table>
  </div>
</body></html>`;
}

export async function onRequestGet({ request, env }) {
  if (!isAuthed(request, env)) {
    return new Response(loginPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  await ensureInscriptionsTable(env.DB);
  const { results } = await env.DB.prepare('SELECT * FROM inscriptions ORDER BY created_at DESC').all();

  const { searchParams } = new URL(request.url);
  if (searchParams.get('format') === 'csv') {
    return new Response(toCsv(results), {
      headers: {
        'Content-Type': 'text/csv;charset=UTF-8',
        'Content-Disposition': 'attachment; filename="inscriptions.csv"',
      },
    });
  }

  return new Response(tablePage(results), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

export async function onRequestPost({ request, env }) {
  const form = await request.formData();
  const password = form.get('password');

  if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
    return new Response(loginPage({ error: true }), {
      status: 401,
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  }

  return new Response('', {
    status: 302,
    headers: {
      Location: '/admin/inscriptions',
      'Set-Cookie': `${COOKIE_NAME}=${password}; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=2592000`,
    },
  });
}
