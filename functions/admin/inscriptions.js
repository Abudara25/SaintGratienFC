// Page de consultation des inscriptions (base D1 "DB"), protégée par un mot de passe partagé
// (variable Cloudflare Pages ADMIN_PASSWORD, jamais commitée). Réservée aux responsables du club.
// L'édition d'une inscription se fait sur functions/admin/inscriptions/[id].js ; la suppression
// est gérée ici (onRequestPost, action=delete) car elle ne nécessite pas de formulaire dédié.
import { ensureInscriptionsTable } from '../_shared/inscriptions-db.js';
import { COOKIE_NAME, isAuthed, loginPage, escapeHtml } from '../_shared/admin-auth.js';

function toCsv(rows) {
  const headers = ['Date', 'Enfant', 'Naissance', 'Catégorie', 'Taille maillot', 'Mode paiement', 'Parent', 'E-mail', 'Téléphone', 'Adresse', 'Code postal', 'Ville', 'Autorisation', 'Droit image', 'RGPD', 'Dossier signé reçu'];
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
      r.dossier_uploaded_at ? 'Oui' : 'Non',
    ]
      .map(escapeCsv)
      .join(',')
  );
  return [headers.map(escapeCsv).join(','), ...lines].join('\r\n');
}

const SORTS = {
  date_desc: (a, b) => b.created_at.localeCompare(a.created_at),
  date_asc: (a, b) => a.created_at.localeCompare(b.created_at),
  nom_asc: (a, b) => a.enfant_nom.localeCompare(b.enfant_nom, 'fr') || a.enfant_prenom.localeCompare(b.enfant_prenom, 'fr'),
  nom_desc: (a, b) => b.enfant_nom.localeCompare(a.enfant_nom, 'fr') || b.enfant_prenom.localeCompare(a.enfant_prenom, 'fr'),
  naissance_asc: (a, b) => a.naissance.localeCompare(b.naissance),
  naissance_desc: (a, b) => b.naissance.localeCompare(a.naissance),
};

// Filtrage/tri appliqués côté JS après le SELECT * (peu de lignes attendues pour un seul club) —
// plus simple et plus sûr qu'une clause WHERE dynamique construite à partir des query params.
function filterAndSort(rows, { q, categorie, annee, paiement, dossier, sort }) {
  const needle = q.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (categorie && r.categorie !== categorie) return false;
    if (paiement && r.mode_paiement !== paiement) return false;
    if (annee && !String(r.naissance || '').startsWith(annee)) return false;
    if (dossier === 'recu' && !r.dossier_uploaded_at) return false;
    if (dossier === 'manquant' && r.dossier_uploaded_at) return false;
    if (needle) {
      const haystack = `${r.enfant_prenom} ${r.enfant_nom} ${r.parent_prenom} ${r.parent_nom} ${r.email}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
  return filtered.sort(SORTS[sort] || SORTS.date_desc);
}

function parseFilters(searchParams) {
  return {
    q: searchParams.get('q') || '',
    categorie: searchParams.get('categorie') || '',
    annee: searchParams.get('annee') || '',
    paiement: searchParams.get('paiement') || '',
    dossier: searchParams.get('dossier') || '',
    sort: searchParams.get('sort') || 'date_desc',
  };
}

function actionsHtml(r) {
  return `<a href="/admin/inscriptions/${r.id}" class="btn btn-dark btn-sm">Modifier</a>
    <form method="POST" action="/admin/inscriptions" onsubmit="return confirm('Supprimer cette inscription ?');">
      <input type="hidden" name="action" value="delete">
      <input type="hidden" name="id" value="${r.id}">
      <button type="submit" class="btn btn-sm" style="background:var(--color-error, #b3261e);color:#fff;">Supprimer</button>
    </form>`;
}

// options : { filters, years, total } — years = années de naissance distinctes présentes en
// base (calculées sur l'ensemble non filtré), total = nombre total d'inscriptions non filtrées.
function tablePage(rows, { filters, years, total }) {
  const sel = (actual, value) => (actual === value ? 'selected' : '');
  const qs = new URLSearchParams();
  if (filters.q) qs.set('q', filters.q);
  if (filters.categorie) qs.set('categorie', filters.categorie);
  if (filters.annee) qs.set('annee', filters.annee);
  if (filters.paiement) qs.set('paiement', filters.paiement);
  if (filters.dossier) qs.set('dossier', filters.dossier);
  const csvHref = `/admin/inscriptions?format=csv${qs.toString() ? `&${qs.toString()}` : ''}`;
  const hasActiveFilters = !!(filters.q || filters.categorie || filters.annee || filters.paiement || filters.dossier);

  const filterBar = `<form method="GET" class="insc-filters">
    <input type="search" name="q" value="${escapeHtml(filters.q)}" placeholder="Chercher un nom, prénom, e-mail…" class="insc-search">
    <select name="categorie" onchange="this.form.submit()">
      <option value="">Toutes catégories</option>
      <option value="U6 - U7" ${sel(filters.categorie, 'U6 - U7')}>U6 - U7</option>
      <option value="U8 - U9" ${sel(filters.categorie, 'U8 - U9')}>U8 - U9</option>
    </select>
    <select name="annee" onchange="this.form.submit()">
      <option value="">Toutes années de naissance</option>
      ${years.map((y) => `<option value="${escapeHtml(y)}" ${sel(filters.annee, y)}>${escapeHtml(y)}</option>`).join('')}
    </select>
    <select name="paiement" onchange="this.form.submit()">
      <option value="">Tous paiements</option>
      <option value="HelloAsso" ${sel(filters.paiement, 'HelloAsso')}>HelloAsso</option>
      <option value="Espèces" ${sel(filters.paiement, 'Espèces')}>Espèces</option>
      <option value="Chèque" ${sel(filters.paiement, 'Chèque')}>Chèque</option>
    </select>
    <select name="dossier" onchange="this.form.submit()">
      <option value="">Dossier signé : tous</option>
      <option value="recu" ${sel(filters.dossier, 'recu')}>Dossier reçu</option>
      <option value="manquant" ${sel(filters.dossier, 'manquant')}>Dossier manquant</option>
    </select>
    <select name="sort" onchange="this.form.submit()">
      <option value="date_desc" ${sel(filters.sort, 'date_desc')}>Plus récent d'abord</option>
      <option value="date_asc" ${sel(filters.sort, 'date_asc')}>Plus ancien d'abord</option>
      <option value="nom_asc" ${sel(filters.sort, 'nom_asc')}>Enfant A → Z</option>
      <option value="nom_desc" ${sel(filters.sort, 'nom_desc')}>Enfant Z → A</option>
      <option value="naissance_asc" ${sel(filters.sort, 'naissance_asc')}>Naissance : plus âgé d'abord</option>
      <option value="naissance_desc" ${sel(filters.sort, 'naissance_desc')}>Naissance : plus jeune d'abord</option>
    </select>
    <button type="submit" class="btn btn-dark btn-sm">Filtrer</button>
    ${hasActiveFilters ? '<a href="/admin/inscriptions" class="btn btn-sm" style="background:var(--cream-200);color:var(--maroon-950);">Réinitialiser</a>' : ''}
  </form>`;

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
          <div style="grid-column:1 / -1;"><dt>Dossier signé</dt><dd>${
            r.dossier_uploaded_at
              ? `<a href="/admin/inscriptions/${r.id}/dossier" target="_blank" rel="noopener">✓ Reçu — voir le fichier</a>`
              : '— pas encore reçu'
          }</dd></div>
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
  body{padding:16px;max-width:1400px;margin:0 auto;}
  @media (min-width:600px){ body{padding:24px;} }
  .insc-filters{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;align-items:center;}
  .insc-filters input[type=search],
  .insc-filters select{
    padding:10px 12px;border:1px solid var(--cream-200);border-radius:var(--radius-sm);
    font-size:.88rem;min-height:44px;background:var(--white);color:inherit;
  }
  .insc-search{flex:1 1 220px;}
  @media (max-width:520px){
    .insc-filters{flex-direction:column;align-items:stretch;}
    .insc-filters > *{width:100%;flex:none;}
  }
  .insc-cards{display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:16px;}
  .insc-card{background:var(--white);border:1px solid var(--cream-200);border-radius:var(--radius-sm);padding:14px 16px;}
  .insc-card-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:10px;font-size:1.02rem;}
  .insc-card-date{font-size:.75rem;color:var(--color-text-muted);white-space:nowrap;}
  .insc-card-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;margin:0 0 14px;font-size:.88rem;}
  .insc-card-fields dt{font-weight:600;color:var(--color-text-muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;margin-bottom:2px;}
  .insc-card-fields dd{margin:0;word-break:break-word;}
  .insc-card-actions{display:flex;gap:10px;}
  .insc-card-actions form{flex:1;margin:0;}
  .insc-card-actions .btn{flex:1;width:100%;min-height:44px;}
</style>
</head><body>
  <h1 style="font-size:1.3rem;">Inscriptions (${rows.length}${rows.length !== total ? ` / ${total}` : ''})</h1>
  ${filterBar}
  <p style="margin-bottom:16px;"><a href="${csvHref}" class="btn btn-dark btn-sm">Exporter en CSV${hasActiveFilters ? ' (résultats filtrés)' : ''}</a></p>
  <div class="insc-cards">${cards || `<p>${hasActiveFilters ? 'Aucune inscription ne correspond à ces filtres.' : 'Aucune inscription pour le moment.'}</p>`}</div>
</body></html>`;
}

export async function onRequestGet({ request, env }) {
  if (!isAuthed(request, env)) {
    return new Response(loginPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  await ensureInscriptionsTable(env.DB);
  const { results } = await env.DB.prepare('SELECT * FROM inscriptions ORDER BY created_at DESC').all();

  const { searchParams } = new URL(request.url);
  const filters = parseFilters(searchParams);
  const filtered = filterAndSort(results, filters);

  if (searchParams.get('format') === 'csv') {
    return new Response(toCsv(filtered), {
      headers: {
        'Content-Type': 'text/csv;charset=UTF-8',
        'Content-Disposition': 'attachment; filename="inscriptions.csv"',
      },
    });
  }

  const years = [...new Set(results.map((r) => String(r.naissance || '').slice(0, 4)).filter(Boolean))].sort().reverse();

  return new Response(tablePage(filtered, { filters, years, total: results.length }), {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
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
