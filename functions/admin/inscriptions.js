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

// Boutons Modifier/Supprimer, partagés par la vue tableau (desktop) et la vue cartes (mobile).
function actionsHtml(r) {
  return `<a href="/admin/inscriptions/${r.id}" class="btn btn-dark btn-sm">Modifier</a>
    <form method="POST" action="/admin/inscriptions" onsubmit="return confirm('Supprimer cette inscription ?');">
      <input type="hidden" name="action" value="delete">
      <input type="hidden" name="id" value="${r.id}">
      <button type="submit" class="btn btn-sm" style="background:var(--color-error, #b3261e);color:#fff;">Supprimer</button>
    </form>`;
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
        <td style="white-space:nowrap;">${actionsHtml(r)}</td>
      </tr>`
    )
    .join('');

  // Vue "cartes" (< 768px) : le tableau à 12 colonnes est illisible sur téléphone même avec le
  // scroll horizontal — une carte par inscription, une seule fois pour toutes les infos.
  const cards = rows
    .map(
      (r) => `<div class="insc-card">
        <div class="insc-card-head">
          <strong>${escapeHtml(r.enfant_prenom)} ${escapeHtml(r.enfant_nom)}</strong>
          <span class="insc-card-date">${escapeHtml(r.created_at)}</span>
        </div>
        <dl class="insc-card-fields">
          <div><dt>Naissance</dt><dd>${escapeHtml(r.naissance)}</dd></div>
          <div><dt>Catégorie</dt><dd>${escapeHtml(r.categorie)}</dd></div>
          <div><dt>Taille maillot</dt><dd>${escapeHtml(r.taille_maillot)}</dd></div>
          <div><dt>Paiement</dt><dd>${escapeHtml(r.mode_paiement)}</dd></div>
          <div><dt>Parent</dt><dd>${escapeHtml(r.parent_prenom)} ${escapeHtml(r.parent_nom)}</dd></div>
          <div><dt>Téléphone</dt><dd>${r.telephone ? escapeHtml(r.telephone) : '—'}</dd></div>
          <div style="grid-column:1 / -1;"><dt>E-mail</dt><dd><a href="mailto:${escapeHtml(r.email)}">${escapeHtml(r.email)}</a></dd></div>
          <div style="grid-column:1 / -1;"><dt>Adresse</dt><dd>${r.adresse ? escapeHtml(r.adresse) : '—'} ${escapeHtml(r.code_postal || '')} ${escapeHtml(r.ville || '')}</dd></div>
          <div><dt>Droit image</dt><dd>${r.droit_image ? 'Oui' : 'Non'}</dd></div>
        </dl>
        <div class="insc-card-actions">${actionsHtml(r)}</div>
      </div>`
    )
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Inscriptions — Admin Saint-Gratien FC</title>
<meta name="robots" content="noindex, nofollow">
<link rel="stylesheet" href="/assets/css/styles.css?v=20260904">
<style>
  body{padding:16px;max-width:100%;}
  @media (min-width:600px){ body{padding:24px;} }
  table{border-collapse:collapse;width:100%;font-size:.85rem;background:var(--white);}
  th,td{border:1px solid var(--cream-200);padding:8px 10px;text-align:left;white-space:nowrap;}
  th{background:var(--cream-100);position:sticky;top:0;}
  .wrap{overflow-x:auto;}
  td form{display:inline;margin:0;}
  .insc-cards{display:none;}
  .insc-card{background:var(--white);border:1px solid var(--cream-200);border-radius:var(--radius-sm);padding:14px 16px;margin-bottom:12px;}
  .insc-card-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:10px;font-size:1.02rem;}
  .insc-card-date{font-size:.75rem;color:var(--color-text-muted);white-space:nowrap;}
  .insc-card-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;margin:0 0 14px;font-size:.88rem;}
  .insc-card-fields dt{font-weight:600;color:var(--color-text-muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;margin-bottom:2px;}
  .insc-card-fields dd{margin:0;word-break:break-word;}
  .insc-card-actions{display:flex;gap:10px;}
  .insc-card-actions form{flex:1;margin:0;}
  .insc-card-actions .btn{flex:1;width:100%;min-height:44px;}
  @media (max-width:767px){
    .wrap{display:none;}
    .insc-cards{display:block;}
  }
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
  <div class="insc-cards">${cards || '<p>Aucune inscription pour le moment.</p>'}</div>
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
