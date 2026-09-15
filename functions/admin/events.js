// Consultation des événements enregistrés par functions/api/track-event.js (clic téléphone,
// soumission du formulaire de contact) — même garde d'authentification que le reste de /admin.
import { ensureEventsTable } from '../_shared/events-db.js';
import { isAuthed, loginPage, escapeHtml, adminHead, adminShell, adminScripts, icon, formatDateFr } from '../_shared/admin-auth.js';

const LABELS = { phone_click: 'Clic sur le numéro de téléphone', contact_form_submit: 'Soumission du formulaire de contact' };
const ICONS = { phone_click: 'phone', contact_form_submit: 'mail' };
const when = (datetime) => formatDateFr(datetime, { dateStyle: 'short', timeStyle: 'short' }) || '—';

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
    ? `<div class="adm-kpis adm-kpis-auto">${totals
        .map(
          (t) => `<div class="adm-surface adm-kpi">
      <span class="adm-kpi-label">${icon(ICONS[t.event] || 'activity')}${escapeHtml(LABELS[t.event] || t.event)}</span>
      <span class="adm-kpi-value">${t.total}</span>
      <span class="adm-kpi-sub">Dernier : ${when(t.derniere)}</span>
    </div>`
        )
        .join('')}</div>`
    : `<div class="adm-surface adm-empty">${icon('activity')}<p>Aucun événement enregistré pour le moment.</p></div>`;

  const recentHtml = recent
    .map((r) => `<tr><td>${when(r.created_at)}</td><td>${escapeHtml(LABELS[r.event] || r.event)}</td><td>${escapeHtml(r.page || '—')}</td></tr>`)
    .join('');

  return new Response(
    `${adminHead('Événements')}
${adminShell({
  active: 'events',
  eyebrow: 'Suivi du site',
  title: 'Événements',
  subtitle: 'Clics sur le numéro de téléphone et envois du formulaire de contact.',
})}
<main id="adm-main" class="adm-wrap adm-main">
  ${totalsHtml}
  <section class="adm-surface">
    <div class="adm-surface-head"><h2 class="adm-h2">${icon('activity')}50 derniers événements</h2></div>
    <div class="adm-table-wrap">
      <table class="adm-table">
        <thead><tr><th>Date</th><th>Événement</th><th>Page</th></tr></thead>
        <tbody>${recentHtml || '<tr><td colspan="3">Aucun événement.</td></tr>'}</tbody>
      </table>
    </div>
  </section>
</main>
${adminScripts('admin-nav')}
</body></html>`,
    { headers: { 'Content-Type': 'text/html;charset=UTF-8' } }
  );
}
