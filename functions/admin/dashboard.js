// Tableau de bord admin — première page de la sidebar (voir _shared/admin-auth.js). Vue
// synthétique (effectifs par catégorie, % payés, % dossiers reçus) plutôt que d'obliger à parcourir
// /admin/inscriptions carte par carte pour se faire une idée globale. Lecture seule, aucune action.
import { ensureInscriptionsTable } from '../_shared/inscriptions-db.js';
import { isAuthed, loginPage, escapeHtml, adminSidebar } from '../_shared/admin-auth.js';

function statCard(label, value, sub) {
  return `<div class="dash-card">
    <div class="dash-card-value">${escapeHtml(String(value))}</div>
    <div class="dash-card-label">${escapeHtml(label)}</div>
    ${sub ? `<div class="dash-card-sub">${escapeHtml(sub)}</div>` : ''}
  </div>`;
}

function page({ total, archivedCount, payeCount, dossierCount, categorieCounts }) {
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);

  const cards = [
    statCard('Inscriptions actives', total),
    statCard('Paiement reçu', `${payeCount} / ${total}`, total ? `${pct(payeCount)}%` : undefined),
    statCard('Dossier signé reçu', `${dossierCount} / ${total}`, total ? `${pct(dossierCount)}%` : undefined),
    ...Object.keys(categorieCounts).sort().map((c) => statCard(c, categorieCounts[c])),
    statCard('Dans la corbeille', archivedCount),
  ].join('');

  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tableau de bord — Admin Saint-Gratien FC</title>
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
<style>
  .admin-main{max-width:900px;}
  .dash-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(180px, 1fr));gap:16px;margin-top:20px;}
  .dash-card{background:var(--white);border:1px solid var(--cream-200);border-radius:var(--radius-sm);padding:18px 20px;}
  .dash-card-value{font-family:var(--font-display);font-size:1.9rem;font-weight:700;color:var(--maroon-900);line-height:1.1;}
  .dash-card-label{font-size:.82rem;color:var(--color-text-muted);margin-top:4px;}
  .dash-card-sub{display:inline-block;margin-top:8px;padding:2px 9px;border-radius:999px;background:var(--gold-100);color:var(--maroon-900);font-size:.72rem;font-weight:700;}
</style>
</head><body>
  <div class="admin-layout">
    ${adminSidebar('dashboard')}
    <main class="admin-main">
      <h1 style="font-size:1.3rem;">Tableau de bord</h1>
      <p style="margin-top:6px;"><a href="/admin/inscriptions">Voir la liste des inscriptions &rarr;</a></p>
      <div class="dash-grid">${cards}</div>
    </main>
  </div>
  <script src="/assets/js/admin-nav.js?v=20260909a"></script>
</body></html>`;
}

export async function onRequestGet({ request, env }) {
  if (!(await isAuthed(request, env))) {
    return new Response(loginPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  await ensureInscriptionsTable(env.DB);
  const { results } = await env.DB.prepare('SELECT * FROM inscriptions').all();
  const active = results.filter((r) => !r.archived_at);
  const archivedCount = results.length - active.length;
  const total = active.length;
  const payeCount = active.filter((r) => r.paye).length;
  const dossierCount = active.filter((r) => r.dossier_uploaded_at).length;
  const categorieCounts = {};
  for (const r of active) categorieCounts[r.categorie] = (categorieCounts[r.categorie] || 0) + 1;

  return new Response(page({ total, archivedCount, payeCount, dossierCount, categorieCounts }), {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}
