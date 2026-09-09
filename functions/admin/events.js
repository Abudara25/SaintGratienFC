// Consultation des événements enregistrés par functions/api/track-event.js (clic téléphone,
// soumission du formulaire de contact) — même garde d'authentification que le reste de /admin.
import { ensureEventsTable } from '../_shared/events-db.js';
import { isAuthed, loginPage, escapeHtml, adminSidebar } from '../_shared/admin-auth.js';

const LABELS = { phone_click: 'Clic sur le numéro de téléphone', contact_form_submit: 'Soumission du formulaire de contact' };

export async function onRequestGet({ request, env }) {
  if (!(await isAuthed(request, env))) {
    return new Response(loginPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  await ensureEventsTable(env.DB);
  const { results: totals } = await env.DB.prepare(
    'SELECT event, COUNT(*) AS total, MAX(created_at) AS derniere FROM events GROUP BY event ORDER BY total DESC'
  ).all();
  const { results: recent } = await env.DB.prepare('SELECT event, page, created_at FROM events ORDER BY id DESC LIMIT 50').all();

  const totalsHtml = totals.length
    ? totals
        .map(
          (t) =>
            `<tr><td>${escapeHtml(LABELS[t.event] || t.event)}</td><td>${t.total}</td><td>${escapeHtml(t.derniere)}</td></tr>`
        )
        .join('')
    : '<tr><td colspan="3">Aucun événement enregistré pour le moment.</td></tr>';

  const recentHtml = recent
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.created_at)}</td><td>${escapeHtml(LABELS[r.event] || r.event)}</td><td>${escapeHtml(r.page || '—')}</td></tr>`
    )
    .join('');

  return new Response(
    `<!doctype html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Événements — Admin Saint-Gratien FC</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/svg+xml" href="/assets/images/favicon-admin.svg">
<link rel="icon" type="image/png" href="/assets/images/favicon-admin.png">
<link rel="stylesheet" href="/assets/css/styles.css?v=20260909g">
<style>
  .admin-main{max-width:900px;}
  table{width:100%;border-collapse:collapse;margin-bottom:32px;}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--cream-200);font-size:.9rem;}
  th{font-family:var(--font-display);font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;color:var(--color-text-muted);}
</style>
</head><body>
  <div class="admin-layout">
    ${adminSidebar('events')}
    <main class="admin-main">
      <h1 style="font-size:1.3rem;margin-bottom:20px;">Événements suivis</h1>

      <h2 style="font-size:1rem;">Totaux</h2>
      <table>
        <thead><tr><th>Événement</th><th>Total</th><th>Dernier</th></tr></thead>
        <tbody>${totalsHtml}</tbody>
      </table>

      <h2 style="font-size:1rem;">50 derniers événements</h2>
      <table>
        <thead><tr><th>Date</th><th>Événement</th><th>Page</th></tr></thead>
        <tbody>${recentHtml || '<tr><td colspan="3">Aucun événement.</td></tr>'}</tbody>
      </table>
    </main>
  </div>
  <script src="/assets/js/admin-nav.js?v=20260909a"></script>
</body></html>`,
    { headers: { 'Content-Type': 'text/html;charset=UTF-8' } }
  );
}
