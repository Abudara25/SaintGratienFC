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

// pdfData reprend les champs de assets/js/pdf-inscription.js (buildInscriptionPdfDoc), en
// camelCase — la fiche D1 est en snake_case. Le bouton "Télécharger le PDF" régénère côté client
// (jsPDF, voir le <script> en bas de page) le même document que celui produit à l'inscription :
// utile si la famille n'a pas reçu (ou a perdu) l'e-mail de confirmation et que le club veut le
// lui renvoyer manuellement.
function actionsHtml(r, siteUrl) {
  const pdfData = {
    enfantPrenom: r.enfant_prenom,
    enfantNom: r.enfant_nom,
    naissance: r.naissance,
    categorie: r.categorie,
    tailleMaillot: r.taille_maillot,
    modePaiement: r.mode_paiement,
    parentPrenom: r.parent_prenom,
    parentNom: r.parent_nom,
    email: r.email,
    telephone: r.telephone,
    adresse: r.adresse,
    codePostal: r.code_postal,
    ville: r.ville,
    droitImage: r.droit_image,
  };
  const depotUrl = r.upload_token ? `${siteUrl}/depot/${r.upload_token}` : '';

  return `<button type="button" class="btn btn-sm insc-pdf-btn" data-pdf='${escapeHtml(JSON.stringify(pdfData))}' data-depot-url="${escapeHtml(depotUrl)}">Télécharger le PDF</button>
    <a href="/admin/inscriptions/${r.id}" class="btn btn-dark btn-sm">Modifier</a>
    <form method="POST" action="/admin/inscriptions" onsubmit="return confirm('Supprimer cette inscription ?');">
      <input type="hidden" name="action" value="delete">
      <input type="hidden" name="id" value="${r.id}">
      <button type="submit" class="btn btn-sm" style="background:var(--color-error, #b3261e);color:#fff;">Supprimer</button>
    </form>`;
}

// options : { filters, years, total, returnTo, dossierError, dossierOk, inscriptionStatus,
// siteUrl } — years = années de naissance distinctes présentes en base (calculées sur l'ensemble
// non filtré), total = nombre total d'inscriptions non filtrées, returnTo = chemin+query courant
// (pour revenir ici après un dépôt de dossier, filtres compris — voir safeRedirect dans
// [id]/dossier.js), inscriptionStatus = 'open'|'closed' (KV "saintgratienfc_config", voir
// functions/admin/inscription-status.js et functions/api/inscription-status.js), siteUrl = origine
// (pour le lien de dépôt imprimé dans le PDF régénéré, voir actionsHtml).
function tablePage(rows, { filters, years, total, returnTo, dossierError, dossierOk, inscriptionStatus, siteUrl }) {
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
      (r) => `<details class="insc-card">
        <summary class="insc-card-head">
          <span class="insc-card-head-main">
            <strong>${escapeHtml(r.enfant_prenom)} ${escapeHtml(r.enfant_nom)}</strong>
            <span class="insc-card-date">${escapeHtml(r.created_at)}</span>
          </span>
          <span class="insc-dossier-badge ${r.dossier_uploaded_at ? 'insc-dossier-ok' : 'insc-dossier-missing'}">${
            r.dossier_uploaded_at ? '✓ Dossier' : 'Dossier manquant'
          }</span>
          <span class="insc-card-chevron" aria-hidden="true">▸</span>
        </summary>
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
          <div style="grid-column:1 / -1;">
            <dt>Dossier signé</dt>
            <dd>
              ${r.dossier_uploaded_at ? `<a href="/admin/inscriptions/${r.id}/dossier" target="_blank" rel="noopener">Voir le fichier reçu</a>` : '— pas encore reçu'}
              <form method="POST" action="/admin/inscriptions/${r.id}/dossier" enctype="multipart/form-data" class="insc-dossier-form">
                <input type="hidden" name="redirectTo" value="${escapeHtml(returnTo)}">
                <label for="dossier-${r.id}" class="visually-hidden">Déposer le dossier signé de ${escapeHtml(r.enfant_prenom)} ${escapeHtml(r.enfant_nom)}</label>
                <input type="file" id="dossier-${r.id}" name="dossier" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required>
                <button type="submit" class="btn btn-dark btn-sm">${r.dossier_uploaded_at ? 'Remplacer le dossier' : 'Enregistrer le dossier'}</button>
              </form>
            </dd>
          </div>
        </dl>
        <div class="insc-card-actions">${actionsHtml(r, siteUrl)}</div>
      </details>`
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
  /* align-items:start (pas le stretch par défaut d'une grille) : sinon toutes les cartes d'un
     même rang s'étirent à la hauteur de la plus grande dès qu'une seule se déplie, laissant un
     grand cadre blanc vide sous les cartes restées repliées. */
  .insc-cards{display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:16px;align-items:start;}
  .insc-card{background:var(--white);border:1px solid var(--cream-200);border-radius:var(--radius-sm);padding:14px 16px;}
  .insc-card-head{display:flex;align-items:center;gap:10px;font-size:1.02rem;list-style:none;cursor:pointer;padding:2px 0;min-height:44px;}
  .insc-card-head::-webkit-details-marker{display:none;}
  .insc-card[open] .insc-card-head{margin-bottom:10px;}
  .insc-card-head-main{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;}
  .insc-card-date{font-size:.75rem;color:var(--color-text-muted);white-space:nowrap;}
  .insc-card-chevron{color:var(--color-text-muted);font-size:.8rem;transition:transform .15s ease;flex-shrink:0;}
  .insc-card[open] .insc-card-chevron{transform:rotate(90deg);}
  .insc-dossier-badge{font-size:.66rem;font-weight:700;padding:4px 9px;border-radius:999px;white-space:nowrap;text-transform:uppercase;letter-spacing:.03em;flex-shrink:0;}
  .insc-dossier-ok{background:var(--gold-100);color:var(--maroon-900);}
  .insc-dossier-missing{background:var(--cream-200);color:var(--color-text-muted);}
  .insc-card-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;margin:0 0 14px;font-size:.88rem;}
  .insc-card-fields dt{font-weight:600;color:var(--color-text-muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;margin-bottom:2px;}
  .insc-card-fields dd{margin:0;word-break:break-word;}
  .insc-dossier-form{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;align-items:center;}
  .insc-dossier-form input[type=file]{flex:1 1 160px;min-width:0;font-size:.82rem;}
  .insc-dossier-form .btn{min-height:40px;flex-shrink:0;}
  .insc-card-actions{display:flex;flex-wrap:wrap;gap:10px;}
  .insc-card-actions form{flex:1;margin:0;min-width:120px;}
  .insc-card-actions .btn{flex:1;width:100%;min-height:44px;min-width:120px;}
  .insc-card-actions .insc-pdf-btn{flex-basis:100%;background:var(--cream-200);color:var(--maroon-950);}
  .insc-banner{padding:12px 16px;border-radius:var(--radius-sm);margin-bottom:16px;font-size:.9rem;}
  .insc-banner-error{background:#fbe9e7;color:var(--color-error, #b3261e);}
  .insc-banner-ok{background:var(--gold-100);color:var(--maroon-900);}
  .insc-status-bar{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:12px 16px;border-radius:var(--radius-sm);margin-bottom:16px;font-size:.9rem;}
  .insc-status-bar form{margin:0;}
  .insc-status-open{background:var(--gold-100);color:var(--maroon-900);}
  .insc-status-closed{background:#fbe9e7;color:var(--color-error, #b3261e);}
</style>
</head><body>
  <h1 style="font-size:1.3rem;">Inscriptions (${rows.length}${rows.length !== total ? ` / ${total}` : ''})</h1>
  <div class="insc-status-bar ${inscriptionStatus === 'closed' ? 'insc-status-closed' : 'insc-status-open'}">
    <span>Inscriptions sur le site : <strong>${inscriptionStatus === 'closed' ? 'fermées' : 'ouvertes'}</strong></span>
    <form method="POST" action="/admin/inscription-status">
      <input type="hidden" name="status" value="${inscriptionStatus === 'closed' ? 'open' : 'closed'}">
      <button type="submit" class="btn btn-sm ${inscriptionStatus === 'closed' ? 'btn-primary' : 'btn-dark'}">${
        inscriptionStatus === 'closed' ? 'Rouvrir les inscriptions' : 'Fermer les inscriptions'
      }</button>
    </form>
  </div>
  ${dossierError ? `<p class="insc-banner insc-banner-error">${escapeHtml(dossierError)}</p>` : ''}
  ${dossierOk ? '<p class="insc-banner insc-banner-ok">Dossier enregistré.</p>' : ''}
  ${filterBar}
  <p style="margin-bottom:16px;"><a href="${csvHref}" class="btn btn-dark btn-sm">Exporter en CSV${hasActiveFilters ? ' (résultats filtrés)' : ''}</a></p>
  <div class="insc-cards">${cards || `<p>${hasActiveFilters ? 'Aucune inscription ne correspond à ces filtres.' : 'Aucune inscription pour le moment.'}</p>`}</div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js" integrity="sha512-plOdviVmws4Y3JAvbnpfKb2hVxKM1lCwsi3vmElYRj+tiDLffZ4FVUj5a8vyKJ9pIgl8JCAHEJ4D1iUKBecswg==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
  <script src="/assets/js/pdf-inscription.js?v=20260905"></script>
  <script>
    document.querySelectorAll('.insc-pdf-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        downloadInscriptionPdf(JSON.parse(btn.dataset.pdf), btn.dataset.depotUrl || null);
      });
    });
  </script>
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

  // Chemin+query courant (sans dossierError/dossierOk, qui sont des messages ponctuels, pas des
  // filtres à reproduire) — sert de redirectTo aux formulaires de dépôt de dossier des cartes, pour
  // revenir exactement sur cette vue filtrée après upload. Voir safeRedirect dans [id]/dossier.js.
  const returnParams = new URLSearchParams(searchParams);
  returnParams.delete('dossierError');
  returnParams.delete('dossierOk');
  const returnTo = `/admin/inscriptions${returnParams.toString() ? `?${returnParams.toString()}` : ''}`;

  let inscriptionStatus = 'open';
  try {
    const value = await env.INSCRIPTION_STATUS.get('inscription_status');
    if (value === 'open' || value === 'closed') inscriptionStatus = value;
  } catch {
    // KV indisponible (binding non configuré) : on reste sur "open" par défaut.
  }

  return new Response(
    tablePage(filtered, {
      filters,
      years,
      total: results.length,
      returnTo,
      dossierError: searchParams.get('dossierError'),
      dossierOk: searchParams.get('dossierOk'),
      inscriptionStatus,
      siteUrl: new URL(request.url).origin,
    }),
    { headers: { 'Content-Type': 'text/html;charset=UTF-8' } }
  );
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
