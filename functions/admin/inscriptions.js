// Page de consultation des inscriptions (base D1 "DB"), protégée par un mot de passe partagé
// (variable Cloudflare Pages ADMIN_PASSWORD, jamais commitée). Réservée aux responsables du club.
// L'édition d'une inscription se fait sur functions/admin/inscriptions/[id].js ; la suppression
// est gérée ici (onRequestPost, action=delete) car elle ne nécessite pas de formulaire dédié.
import { ensureInscriptionsTable } from '../_shared/inscriptions-db.js';
import { COOKIE_NAME, isAuthed, loginPage, escapeHtml } from '../_shared/admin-auth.js';

function toCsv(rows) {
  const headers = ['Date', 'Enfant', 'Naissance', 'Catégorie', 'Taille maillot', 'Mode paiement', 'Parent', 'E-mail', 'Téléphone', 'Adresse', 'Code postal', 'Ville', 'Autorisation', 'Droit image', 'RGPD'];
  const escapeCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.created_at,
      `${r.enfant_prenom} ${r.enfant_nom}`,
      r.naissance,
      r.categorie,
      r.taille_maillot,
      r.mode_paiement,
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
        <td>${escapeHtml(r.mode_paiement)}</td>
        <td>${escapeHtml(r.parent_prenom)} ${escapeHtml(r.parent_nom)}</td>
        <td><a href="mailto:${escapeHtml(r.email)}">${escapeHtml(r.email)}</a></td>
        <td>${escapeHtml(r.telephone)}</td>
        <td>${escapeHtml(r.adresse)} ${escapeHtml(r.code_postal)} ${escapeHtml(r.ville)}</td>
        <td>${r.droit_image ? 'Oui' : 'Non'}</td>
        <td style="white-space:nowrap;">
          <a href="/admin/inscriptions/${r.id}" class="btn btn-dark btn-sm">Modifier</a>
          <form method="POST" action="/admin/inscriptions" style="display:inline;" onsubmit="return confirm('Supprimer cette inscription ?');">
            <input type="hidden" name="action" value="delete">
            <input type="hidden" name="id" value="${r.id}">
            <button type="submit" class="btn btn-sm" style="background:var(--color-error, #b3261e);color:#fff;">Supprimer</button>
          </form>
        </td>
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
        <th>Date</th><th>Enfant</th><th>Naissance</th><th>Catégorie</th><th>Taille maillot</th><th>Mode paiement</th>
        <th>Parent</th><th>E-mail</th><th>Téléphone</th><th>Adresse</th><th>Droit image</th><th>Actions</th>
      </tr></thead>
      <tbody>${tableRows || '<tr><td colspan="12">Aucune inscription pour le moment.</td></tr>'}</tbody>
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

  if (form.get('action') === 'delete') {
    if (!isAuthed(request, env)) {
      return new Response(loginPage(), { status: 401, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }
    const id = Number(form.get('id'));
    if (id) {
      await ensureInscriptionsTable(env.DB);
      await env.DB.prepare('DELETE FROM inscriptions WHERE id = ?').bind(id).run();
    }
    return new Response('', { status: 302, headers: { Location: '/admin/inscriptions' } });
  }

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
