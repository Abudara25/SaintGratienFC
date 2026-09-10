// Page de consultation des inscriptions (base D1 "DB"), protégée par un mot de passe partagé
// (variable Cloudflare Pages ADMIN_PASSWORD, jamais commitée). Réservée aux responsables du club.
// L'édition d'une inscription se fait sur functions/admin/inscriptions/[id].js ; la suppression
// est gérée ici (onRequestPost, action=delete) car elle ne nécessite pas de formulaire dédié.
import { ensureInscriptionsTable } from '../_shared/inscriptions-db.js';
import { COOKIE_NAME, isAuthed, loginPage, escapeHtml, adminSidebar, getAdminPassword } from '../_shared/admin-auth.js';
import { sendReminderEmail, sendReinscriptionEmail } from '../_shared/confirmation-email.js';
import { getCategoriesConfig, effectiveInscriptionStatus } from '../_shared/settings-kv.js';

function toCsv(rows) {
  const headers = ['Date', 'Enfant', 'Naissance', 'Catégorie', 'Taille maillot', 'Mode paiement', 'Paiement reçu', 'Parent', 'E-mail', 'Téléphone', 'Adresse', 'Code postal', 'Ville', 'Autorisation', 'Droit image', 'RGPD', 'Dossier signé reçu'];
  // Un champ commençant par =, +, -, @, tab ou retour chariot est préfixé d'une apostrophe :
  // sinon Excel/Sheets peut l'interpréter comme une formule (injection CSV) à l'ouverture de
  // l'export si un parent a saisi ce genre de contenu dans le formulaire public.
  const escapeCsv = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = rows.map((r) =>
    [
      r.created_at,
      `${r.enfant_prenom} ${r.enfant_nom}`,
      r.naissance,
      r.categorie,
      r.taille_maillot,
      r.mode_paiement,
      r.paye ? 'Oui' : 'Non',
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
function filterAndSort(rows, { q, categorie, annee, paiement, dossier, paye, sort }) {
  const needle = q.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (categorie && r.categorie !== categorie) return false;
    if (paiement && r.mode_paiement !== paiement) return false;
    if (annee && !String(r.naissance || '').startsWith(annee)) return false;
    if (dossier === 'recu' && !r.dossier_uploaded_at) return false;
    if (dossier === 'manquant' && r.dossier_uploaded_at) return false;
    if (paye === 'oui' && !r.paye) return false;
    if (paye === 'non' && r.paye) return false;
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
    paye: searchParams.get('paye') || '',
    view: searchParams.get('view') === 'archive' ? 'archive' : 'active',
    sort: searchParams.get('sort') || 'date_desc',
  };
}

// pdfData reprend les champs de assets/js/pdf-inscription.js (buildInscriptionPdfDoc), en
// camelCase — la fiche D1 est en snake_case. Le bouton "Télécharger le PDF" régénère côté client
// (jsPDF, voir le <script> en bas de page) le même document que celui produit à l'inscription :
// utile si la famille n'a pas reçu (ou a perdu) l'e-mail de confirmation et que le club veut le
// lui renvoyer manuellement.
function actionsHtml(r, siteUrl, saison, prix) {
  const pdfData = {
    enfantPrenom: r.enfant_prenom,
    enfantNom: r.enfant_nom,
    naissance: r.naissance,
    categorie: r.categorie,
    saison,
    prix,
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
  const name = `${escapeHtml(r.enfant_prenom)} ${escapeHtml(r.enfant_nom)}`;

  const pdfBtn = `<button type="button" class="btn btn-sm insc-pdf-btn" data-pdf='${escapeHtml(JSON.stringify(pdfData))}' data-depot-url="${escapeHtml(depotUrl)}">Télécharger le PDF</button>`;
  const editLink = `<a href="/admin/inscriptions/${r.id}" class="btn btn-dark btn-sm">Modifier</a>`;

  // Profil archivé (corbeille) : restaurer (sans confirmation, action réversible sans risque) ou
  // supprimer définitivement (confirmation renforcée — irréversible, contrairement à "Archiver").
  if (r.archived_at) {
    return `${pdfBtn}
    ${editLink}
    <form method="POST" action="/admin/inscriptions">
      <input type="hidden" name="action" value="restore">
      <input type="hidden" name="id" value="${r.id}">
      <input type="hidden" name="view" value="archive">
      <button type="submit" class="btn btn-sm" style="background:var(--gold-500);color:var(--maroon-950);">Restaurer</button>
    </form>
    <form method="POST" action="/admin/inscriptions" class="insc-confirm-form insc-full-form">
      <input type="hidden" name="action" value="delete">
      <input type="hidden" name="id" value="${r.id}">
      <input type="hidden" name="view" value="archive">
      <button type="submit" class="btn btn-sm" data-confirm="Supprimer définitivement ${name} ? Cette action est irréversible, contrairement à l'archivage." style="background:var(--color-error, #b3261e);color:#fff;">Supprimer définitivement</button>
    </form>`;
  }

  return `${pdfBtn}
    ${editLink}
    <form method="POST" action="/admin/inscriptions" class="insc-confirm-form">
      <input type="hidden" name="action" value="toggle-paye">
      <input type="hidden" name="id" value="${r.id}">
      <button type="submit" class="btn btn-sm" data-confirm="${
        r.paye ? `Marquer ${name} comme NON payé ?` : `Confirmer que ${name} a payé ?`
      }" style="background:${r.paye ? 'var(--cream-200)' : 'var(--gold-500)'};color:var(--maroon-950);">${
        r.paye ? 'Marquer non payé' : 'Marquer payé'
      }</button>
    </form>
    <form method="POST" action="/admin/inscriptions" class="insc-confirm-form">
      <input type="hidden" name="action" value="archive">
      <input type="hidden" name="id" value="${r.id}">
      <button type="submit" class="btn btn-sm" data-confirm="Archiver ${name} ? Le profil sera déplacé dans la corbeille, récupérable à tout moment." style="background:var(--cream-200);color:var(--maroon-950);">Archiver</button>
    </form>`;
}

// options : { filters, years, categories, total, archivedCount, returnTo, dossierError, dossierOk,
// bulkOk, inscriptionStatus, siteUrl, saison } — years/categories = années de naissance et
// catégories distinctes présentes en base (calculées sur l'ensemble non filtré, comme pour "years" —
// pas la liste éditable de /admin/categories, pour que le filtre reste exact même si une catégorie a
// été renommée/supprimée depuis), total = nombre d'inscriptions de la vue courante (active ou
// archivée, filters.view) avant filtres additionnels, archivedCount = nombre total de profils
// archivés (badge du lien "Corbeille", affiché seulement en vue active), returnTo = chemin+query
// courant (pour revenir ici après un dépôt de dossier, filtres compris — voir safeRedirect dans
// [id]/dossier.js), bulkOk = message de résultat d'une action groupée (archiver/relancer la
// sélection, voir onRequestPost), inscriptionStatus = 'open'|'closed' (KV "saintgratienfc_config",
// voir functions/admin/inscription-status.js et functions/api/inscription-status.js), siteUrl =
// origine (pour le lien de dépôt imprimé dans le PDF régénéré, voir actionsHtml), saison/prix =
// libellé de saison et tarif courants (_shared/settings-kv.js, /admin/categories) imprimés dans ce
// même PDF régénéré.
function tablePage(rows, { filters, years, categories, total, archivedCount, returnTo, dossierError, dossierOk, bulkOk, savedOk, inscriptionStatus, effectiveStatus, siteUrl, saison, prix }) {
  const sel = (actual, value) => (actual === value ? 'selected' : '');
  const qs = new URLSearchParams();
  if (filters.q) qs.set('q', filters.q);
  if (filters.categorie) qs.set('categorie', filters.categorie);
  if (filters.annee) qs.set('annee', filters.annee);
  if (filters.paiement) qs.set('paiement', filters.paiement);
  if (filters.dossier) qs.set('dossier', filters.dossier);
  if (filters.paye) qs.set('paye', filters.paye);
  if (filters.view === 'archive') qs.set('view', 'archive');
  const csvHref = `/admin/inscriptions?format=csv${qs.toString() ? `&${qs.toString()}` : ''}`;
  const activeFilterCount = [filters.q, filters.categorie, filters.annee, filters.paiement, filters.dossier, filters.paye].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;
  const resetHref = `/admin/inscriptions${filters.view === 'archive' ? '?view=archive' : ''}`;

  // <details>/<summary> (comme les cartes d'inscription, voir plus bas) plutôt qu'un bouton JS : la
  // barre de filtres (recherche + 5 select + tri) prend beaucoup de hauteur une fois tous ses
  // champs affichés, replier/déplier au clic aide sur mobile comme sur desktop. Ouverte par défaut
  // seulement si des filtres sont déjà actifs, pour ne pas les cacher sans prévenir.
  const filterBar = `<details class="insc-filters-details" ${hasActiveFilters ? 'open' : ''}>
    <summary class="insc-filters-summary">
      <span>Filtres${activeFilterCount ? ` (${activeFilterCount})` : ''}</span>
      <span class="insc-card-chevron" aria-hidden="true">▸</span>
    </summary>
    <form method="GET" class="insc-filters">
    ${filters.view === 'archive' ? '<input type="hidden" name="view" value="archive">' : ''}
    <input type="search" name="q" value="${escapeHtml(filters.q)}" placeholder="Chercher un nom, prénom, e-mail…" class="insc-search">
    <select name="categorie">
      <option value="">Toutes catégories</option>
      ${categories.map((c) => `<option value="${escapeHtml(c)}" ${sel(filters.categorie, c)}>${escapeHtml(c)}</option>`).join('')}
    </select>
    <select name="annee">
      <option value="">Toutes années de naissance</option>
      ${years.map((y) => `<option value="${escapeHtml(y)}" ${sel(filters.annee, y)}>${escapeHtml(y)}</option>`).join('')}
    </select>
    <select name="paiement">
      <option value="">Tous paiements</option>
      <option value="HelloAsso" ${sel(filters.paiement, 'HelloAsso')}>HelloAsso</option>
      <option value="Espèces" ${sel(filters.paiement, 'Espèces')}>Espèces</option>
      <option value="Chèque" ${sel(filters.paiement, 'Chèque')}>Chèque</option>
    </select>
    <select name="dossier">
      <option value="">Dossier signé : tous</option>
      <option value="recu" ${sel(filters.dossier, 'recu')}>Dossier reçu</option>
      <option value="manquant" ${sel(filters.dossier, 'manquant')}>Dossier manquant</option>
    </select>
    <select name="paye">
      <option value="">Paiement reçu : tous</option>
      <option value="oui" ${sel(filters.paye, 'oui')}>Payé</option>
      <option value="non" ${sel(filters.paye, 'non')}>Non payé</option>
    </select>
    <select name="sort">
      <option value="date_desc" ${sel(filters.sort, 'date_desc')}>Plus récent d'abord</option>
      <option value="date_asc" ${sel(filters.sort, 'date_asc')}>Plus ancien d'abord</option>
      <option value="nom_asc" ${sel(filters.sort, 'nom_asc')}>Enfant A → Z</option>
      <option value="nom_desc" ${sel(filters.sort, 'nom_desc')}>Enfant Z → A</option>
      <option value="naissance_asc" ${sel(filters.sort, 'naissance_asc')}>Naissance : plus âgé d'abord</option>
      <option value="naissance_desc" ${sel(filters.sort, 'naissance_desc')}>Naissance : plus jeune d'abord</option>
    </select>
    <button type="submit" class="btn btn-dark btn-sm">Filtrer</button>
    ${hasActiveFilters ? `<a href="${resetHref}" class="btn btn-sm" style="background:var(--cream-200);color:var(--maroon-950);">Réinitialiser</a>` : ''}
    </form>
  </details>`;

  const cards = rows
    .map(
      (r) => `<details class="insc-card">
        <summary class="insc-card-head">
          <span class="insc-card-head-top">
            <input type="checkbox" class="insc-select" data-id="${r.id}" aria-label="Sélectionner ${escapeHtml(r.enfant_prenom)} ${escapeHtml(r.enfant_nom)}">
            <span class="insc-card-head-main">
              <strong>${escapeHtml(r.enfant_prenom)} ${escapeHtml(r.enfant_nom)}</strong>
              <span class="insc-card-date">${r.archived_at ? `Archivé le ${escapeHtml(r.archived_at)}` : escapeHtml(r.created_at)}</span>
            </span>
            <span class="insc-card-chevron" aria-hidden="true">▸</span>
          </span>
          <span class="insc-card-badges">
            <span class="insc-dossier-badge ${r.dossier_uploaded_at ? 'insc-dossier-ok' : 'insc-dossier-missing'}">${
              r.dossier_uploaded_at ? '✓ Dossier' : 'Dossier manquant'
            }</span>
            <span class="insc-dossier-badge ${r.paye ? 'insc-dossier-ok' : 'insc-dossier-missing'}">${
              r.paye ? '✓ Payé' : 'Non payé'
            }</span>
          </span>
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
        <div class="insc-card-actions">${actionsHtml(r, siteUrl, saison, prix)}</div>
      </details>`
    )
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Inscriptions — Admin Saint-Gratien FC</title>
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
  .admin-main{max-width:1400px;}
  .insc-filters-details{margin-bottom:20px;border:1px solid var(--cream-200);border-radius:var(--radius-sm);background:var(--white);}
  .insc-filters-summary{
    display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;
    padding:10px 14px;cursor:pointer;list-style:none;font-weight:600;font-size:.92rem;
  }
  .insc-filters-summary::-webkit-details-marker{display:none;}
  .insc-filters-details[open] .insc-filters-summary{border-bottom:1px solid var(--cream-200);}
  .insc-filters-details[open] .insc-filters-summary .insc-card-chevron{transform:rotate(90deg);}
  .insc-filters{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:14px;}
  .insc-filters input[type=search],
  .insc-filters select{
    padding:10px 12px;border:1px solid var(--cream-200);border-radius:var(--radius-sm);
    font-size:1rem;min-height:44px;background:var(--white);color:inherit;
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
  /* Ligne "nom + chevron" et ligne des badges séparées (flex-direction:column) plutôt qu'une seule
     rangée : avec 2+ badges (dossier, payé…), les mettre côte à côte avec le nom écrasait ce
     dernier sur mobile (une seule colonne de carte dès 300px de large). Les badges wrappent
     librement sous le nom, qui garde toute la largeur disponible sur sa propre ligne. */
  .insc-card-head{display:flex;flex-direction:column;gap:8px;font-size:1.02rem;list-style:none;cursor:pointer;padding:2px 0;}
  .insc-card-head::-webkit-details-marker{display:none;}
  .insc-card[open] .insc-card-head{margin-bottom:10px;}
  .insc-card-head-top{display:flex;align-items:center;gap:10px;min-height:44px;}
  .insc-card-head-main{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;}
  .insc-card-date{font-size:.75rem;color:var(--color-text-muted);}
  .insc-card-chevron{color:var(--color-text-muted);font-size:.8rem;transition:transform .15s ease;flex-shrink:0;}
  .insc-card[open] .insc-card-chevron{transform:rotate(90deg);}
  .insc-card-badges{display:flex;flex-wrap:wrap;gap:6px;}
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
  /* "Supprimer définitivement" est trop long pour partager sa rangée avec un autre bouton min-width
     120px sans que le texte ne déborde (nowrap hérité de .btn) — pleine largeur, comme le bouton
     PDF, ce qui lui donne aussi un peu plus de poids visuel avant un clic aussi irréversible. */
  .insc-card-actions .insc-full-form{flex-basis:100%;}
  .insc-select{width:20px;height:20px;flex-shrink:0;cursor:pointer;}
  .insc-bulk-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:12px 14px;margin-bottom:16px;background:var(--white);border:1px solid var(--cream-200);border-radius:var(--radius-sm);font-size:.85rem;}
  .insc-bulk-select-all{display:flex;align-items:center;gap:8px;cursor:pointer;white-space:nowrap;}
  .insc-bulk-count{color:var(--color-text-muted);white-space:nowrap;}
  .insc-bulk-bar .btn[disabled]{opacity:.45;cursor:not-allowed;}
  .insc-banner{padding:12px 16px;border-radius:var(--radius-sm);margin-bottom:16px;font-size:.9rem;}
  .insc-banner-error{background:#fbe9e7;color:var(--color-error, #b3261e);}
  .insc-banner-ok{background:var(--gold-100);color:var(--maroon-900);}
  .insc-status-bar{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:12px 16px;border-radius:var(--radius-sm);margin-bottom:16px;font-size:.9rem;}
  .insc-status-bar form{margin:0;}
  .insc-status-open{background:var(--gold-100);color:var(--maroon-900);}
  .insc-status-closed{background:#fbe9e7;color:var(--color-error, #b3261e);}
</style>
</head><body>
  <div class="admin-layout">
    ${adminSidebar(filters.view === 'archive' ? 'archive' : 'inscriptions')}
    <main class="admin-main">
  <h1 style="font-size:1.3rem;">${filters.view === 'archive' ? 'Corbeille' : 'Inscriptions'} (${rows.length}${rows.length !== total ? ` / ${total}` : ''})</h1>
  ${
    filters.view === 'archive'
      ? '<p style="margin-bottom:12px;"><a href="/admin/inscriptions">&larr; Retour aux inscriptions actives</a></p>'
      : archivedCount
        ? `<p style="margin-bottom:12px;"><a href="/admin/inscriptions?view=archive">Voir la corbeille (${archivedCount}) &rarr;</a></p>`
        : ''
  }
  <div class="insc-status-bar ${effectiveStatus === 'closed' ? 'insc-status-closed' : 'insc-status-open'}">
    <span>Inscriptions sur le site : <strong>${effectiveStatus === 'closed' ? 'fermées' : 'ouvertes'}</strong>${
      effectiveStatus === 'open' && inscriptionStatus === 'closed'
        ? ' <em style="font-weight:400;">(rouverture automatique — date limite de réinscription atteinte, voir /admin/categories)</em>'
        : ''
    }</span>
    <form method="POST" action="/admin/inscription-status">
      <input type="hidden" name="status" value="${inscriptionStatus === 'closed' ? 'open' : 'closed'}">
      <button type="submit" class="btn btn-sm ${inscriptionStatus === 'closed' ? 'btn-primary' : 'btn-dark'}">${
        inscriptionStatus === 'closed' ? 'Rouvrir les inscriptions' : 'Fermer les inscriptions'
      }</button>
    </form>
  </div>
  ${dossierError ? `<p class="insc-banner insc-banner-error">${escapeHtml(dossierError)}</p>` : ''}
  ${dossierOk ? '<p class="insc-banner insc-banner-ok">Dossier enregistré.</p>' : ''}
  ${bulkOk ? `<p class="insc-banner insc-banner-ok">${escapeHtml(bulkOk)}</p>` : ''}
  ${savedOk ? '<p class="insc-banner insc-banner-ok">Inscription mise à jour.</p>' : ''}
  ${filterBar}
  <p style="margin-bottom:16px;"><a href="${csvHref}" class="btn btn-dark btn-sm">Exporter en CSV${hasActiveFilters ? ' (résultats filtrés)' : ''}</a></p>
  <form method="POST" action="/admin/inscriptions" id="bulk-form" class="insc-bulk-bar">
    <input type="hidden" name="action" id="bulk-action" value="">
    ${filters.view === 'archive' ? '<input type="hidden" name="view" value="archive">' : ''}
    <div id="bulk-ids-container"></div>
    <label class="insc-bulk-select-all">
      <input type="checkbox" id="bulk-select-all">
      Tout sélectionner
    </label>
    <span id="bulk-count" class="insc-bulk-count">0 sélectionné(s)</span>
    <button type="button" class="btn btn-sm" data-bulk-action="bulk-archive" data-confirm="Archiver les profils sélectionnés ? Ils seront déplacés dans la corbeille, récupérables à tout moment." style="background:var(--cream-200);color:var(--maroon-950);" disabled>Archiver la sélection</button>
    <button type="button" class="btn btn-sm" data-bulk-action="bulk-export" style="background:var(--cream-200);color:var(--maroon-950);" disabled>Exporter la sélection (CSV)</button>
    <button type="button" class="btn btn-sm" data-bulk-action="bulk-reminder" data-confirm="Envoyer une relance par e-mail aux profils sélectionnés qui n'ont pas encore payé ou envoyé leur dossier ? Les profils déjà complets ne recevront rien." style="background:var(--gold-500);color:var(--maroon-950);" disabled>Envoyer une relance</button>
  </form>
  <div class="insc-cards">${
    cards ||
    `<p>${
      hasActiveFilters
        ? 'Aucune inscription ne correspond à ces filtres.'
        : filters.view === 'archive'
          ? 'La corbeille est vide.'
          : 'Aucune inscription pour le moment.'
    }</p>`
  }</div>
    </main>
  </div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js" integrity="sha512-plOdviVmws4Y3JAvbnpfKb2hVxKM1lCwsi3vmElYRj+tiDLffZ4FVUj5a8vyKJ9pIgl8JCAHEJ4D1iUKBecswg==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
  <script src="/assets/js/pdf-inscription.js?v=20260909b"></script>
  <script src="/assets/js/admin-nav.js?v=20260909a"></script>
  <script src="/assets/js/admin-inscriptions.js?v=20260909e"></script>
</body></html>`;
}

export async function onRequestGet({ request, env }) {
  if (!(await isAuthed(request, env))) {
    return new Response(loginPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  await ensureInscriptionsTable(env.DB);
  const { results } = await env.DB.prepare('SELECT * FROM inscriptions ORDER BY created_at DESC').all();

  const { searchParams } = new URL(request.url);
  const filters = parseFilters(searchParams);
  // La corbeille (filters.view === 'archive') et la liste active se partagent la même requête
  // SELECT * ; on scope sur archived_at avant d'appliquer les autres filtres (recherche,
  // catégorie…), pour que les deux vues restent filtrables/triables indépendamment.
  const archivedCount = results.filter((r) => r.archived_at).length;
  const viewRows = results.filter((r) => (filters.view === 'archive' ? r.archived_at : !r.archived_at));
  const filtered = filterAndSort(viewRows, filters);

  if (searchParams.get('format') === 'csv') {
    return new Response(toCsv(filtered), {
      headers: {
        'Content-Type': 'text/csv;charset=UTF-8',
        'Content-Disposition': 'attachment; filename="inscriptions.csv"',
      },
    });
  }

  const years = [...new Set(results.map((r) => String(r.naissance || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const categories = [...new Set(results.map((r) => r.categorie).filter(Boolean))].sort();

  // Chemin+query courant (sans dossierError/dossierOk, qui sont des messages ponctuels, pas des
  // filtres à reproduire) — sert de redirectTo aux formulaires de dépôt de dossier des cartes, pour
  // revenir exactement sur cette vue filtrée après upload. Voir safeRedirect dans [id]/dossier.js.
  const returnParams = new URLSearchParams(searchParams);
  returnParams.delete('dossierError');
  returnParams.delete('dossierOk');
  returnParams.delete('savedOk');
  const returnTo = `/admin/inscriptions${returnParams.toString() ? `?${returnParams.toString()}` : ''}`;

  let inscriptionStatus = 'open';
  try {
    const value = await env.INSCRIPTION_STATUS.get('inscription_status');
    if (value === 'open' || value === 'closed') inscriptionStatus = value;
  } catch {
    // KV indisponible (binding non configuré) : on reste sur "open" par défaut.
  }

  const { saison, prix, dateLimiteReinscription } = await getCategoriesConfig(env);
  const effectiveStatus = effectiveInscriptionStatus(inscriptionStatus, dateLimiteReinscription);

  return new Response(
    tablePage(filtered, {
      filters,
      years,
      categories,
      total: viewRows.length,
      archivedCount,
      returnTo,
      dossierError: searchParams.get('dossierError'),
      dossierOk: searchParams.get('dossierOk'),
      bulkOk: searchParams.get('bulkOk'),
      savedOk: searchParams.get('savedOk'),
      inscriptionStatus,
      effectiveStatus,
      siteUrl: new URL(request.url).origin,
      saison,
      prix,
    }),
    { headers: { 'Content-Type': 'text/html;charset=UTF-8' } }
  );
}

// Actions ponctuelles par fiche (une par bouton de actionsHtml) : delete = suppression définitive
// (réservée à la corbeille côté UI, voir actionsHtml), toggle-paye = bascule le statut de paiement,
// archive = sort la fiche de la liste active vers la corbeille (réversible), restore = l'inverse.
// Le champ caché "view" (présent seulement sur les formulaires rendus en corbeille) fait revenir
// l'admin sur la vue d'où il vient plutôt que de le sortir de la corbeille malgré lui après un
// restore/suppression définitive.
const ROW_ACTIONS = {
  delete: (db, id) => db.prepare('DELETE FROM inscriptions WHERE id = ?').bind(id).run(),
  'toggle-paye': (db, id) => db.prepare('UPDATE inscriptions SET paye = 1 - paye WHERE id = ?').bind(id).run(),
  archive: (db, id) => db.prepare("UPDATE inscriptions SET archived_at = datetime('now') WHERE id = ?").bind(id).run(),
  restore: (db, id) => db.prepare('UPDATE inscriptions SET archived_at = NULL WHERE id = ?').bind(id).run(),
};

export async function onRequestPost({ request, env }) {
  const form = await request.formData();
  const action = form.get('action');

  if (action in ROW_ACTIONS) {
    if (!(await isAuthed(request, env))) {
      return new Response(loginPage(), { status: 401, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }
    const id = Number(form.get('id'));
    if (id) {
      await ensureInscriptionsTable(env.DB);
      await ROW_ACTIONS[action](env.DB, id);
    }
    const redirectView = form.get('view') === 'archive' ? '?view=archive' : '';
    return new Response('', { status: 302, headers: { Location: `/admin/inscriptions${redirectView}` } });
  }

  // Actions groupées (sélection multiple, voir la barre #bulk-form et assets/js/admin-inscriptions.js)
  // — ids[] vient des <input type="hidden" name="ids"> injectés par ce script juste avant l'envoi.
  if (action === 'bulk-archive' || action === 'bulk-export' || action === 'bulk-reminder') {
    if (!(await isAuthed(request, env))) {
      return new Response(loginPage(), { status: 401, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }
    await ensureInscriptionsTable(env.DB);
    const ids = form.getAll('ids').map(Number).filter(Boolean);
    const redirectView = form.get('view') === 'archive' ? '?view=archive' : '';

    if (!ids.length) {
      return new Response('', { status: 302, headers: { Location: `/admin/inscriptions${redirectView}` } });
    }

    if (action === 'bulk-archive') {
      for (const id of ids) {
        await ROW_ACTIONS.archive(env.DB, id);
      }
      const msg = encodeURIComponent(`${ids.length} profil${ids.length > 1 ? 's' : ''} archivé${ids.length > 1 ? 's' : ''}.`);
      return new Response('', { status: 302, headers: { Location: `/admin/inscriptions${redirectView}${redirectView ? '&' : '?'}bulkOk=${msg}` } });
    }

    const { results } = await env.DB.prepare('SELECT * FROM inscriptions').all();
    const selected = results.filter((r) => ids.includes(r.id));

    if (action === 'bulk-export') {
      return new Response(toCsv(selected), {
        headers: {
          'Content-Type': 'text/csv;charset=UTF-8',
          'Content-Disposition': 'attachment; filename="inscriptions-selection.csv"',
        },
      });
    }

    // bulk-reminder : un e-mail par profil sélectionné n'ayant pas encore payé ou pas encore envoyé
    // son dossier (sendReminderEmail ignore elle-même les profils déjà complets, renvoie alors
    // false — compté comme "ignoré" ici plutôt que comme un échec d'envoi).
    const siteUrl = new URL(request.url).origin;
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of selected) {
      if (row.dossier_uploaded_at && row.paye) {
        skipped++;
        continue;
      }
      const ok = await sendReminderEmail(env, row, siteUrl);
      if (ok) sent++;
      else failed++;
    }
    const parts = [`${sent} relance${sent > 1 ? 's' : ''} envoyée${sent > 1 ? 's' : ''}`];
    if (skipped) parts.push(`${skipped} ignoré${skipped > 1 ? 's' : ''} (déjà complet${skipped > 1 ? 's' : ''})`);
    if (failed) parts.push(`${failed} échec${failed > 1 ? 's' : ''}`);
    const msg = encodeURIComponent(`${parts.join(', ')}.`);
    return new Response('', { status: 302, headers: { Location: `/admin/inscriptions${redirectView}${redirectView ? '&' : '?'}bulkOk=${msg}` } });
  }

  // bulk-reinscription : génère (si besoin) un reinscription_token par fiche sélectionnée puis
  // envoie à chaque famille son lien personnel /reinscription/<token> (functions/reinscription/
  // [token].js) — voir sendReinscriptionEmail. bulk-reinscription-rappel : même envoi, mais wording
  // de relance (isRappel) et réservé aux familles déjà contactées une première fois (un rappel n'a
  // de sens que si un lien existe déjà) — déclenché à la main autant de fois que nécessaire avant la
  // date limite (/admin/categories) depuis /admin/reinscription, pas d'automatisation programmée
  // (pas de Cron Trigger pour ce projet, voir la discussion avec l'utilisateur). Branche séparée du
  // bloc précédent (pas de SELECT * ni ids déjà résolus à ce stade), calquée sur son début. Lancée
  // depuis /admin/inscriptions (sélection libre) ou /admin/reinscription (déjà scopée aux adhérents
  // de la saison précédente) — redirectTo ramène sur la page d'où l'action a été lancée plutôt que
  // de toujours renvoyer vers /admin/inscriptions, jamais une redirection ouverte (allowlist ci-dessous).
  if (action === 'bulk-reinscription' || action === 'bulk-reinscription-rappel') {
    if (!(await isAuthed(request, env))) {
      return new Response(loginPage(), { status: 401, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }
    const isRappel = action === 'bulk-reinscription-rappel';
    await ensureInscriptionsTable(env.DB);
    const ids = form.getAll('ids').map(Number).filter(Boolean);
    const redirectView = form.get('view') === 'archive' ? '?view=archive' : '';
    const redirectTo = /^\/admin\/(inscriptions|reinscription)(\?[^\s]*)?$/.test(form.get('redirectTo') || '')
      ? form.get('redirectTo')
      : `/admin/inscriptions${redirectView}`;
    const withParam = (url, param) => `${url}${url.includes('?') ? '&' : '?'}${param}`;

    if (!ids.length) {
      return new Response('', { status: 302, headers: { Location: redirectTo } });
    }

    const { results } = await env.DB.prepare('SELECT * FROM inscriptions').all();
    const selected = results.filter((r) => ids.includes(r.id));
    const { saison, dateLimiteReinscription } = await getCategoriesConfig(env);
    const siteUrl = new URL(request.url).origin;

    // Une fiche déjà réinscrite pour la saison en cours (même dedup_key qu'une fiche de cette
    // saison — voir _shared/inscriptions-db.js) n'a pas besoin de recevoir le lien une seconde
    // fois : renvoyer "réinscrivez-vous" à une famille qui l'a déjà fait serait déroutant.
    const currentSeasonKeys = new Set(results.filter((r) => r.saison === saison).map((r) => r.dedup_key));

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (let row of selected) {
      if (currentSeasonKeys.has(row.dedup_key)) {
        skipped++;
        continue;
      }
      // Un rappel n'a de sens que pour une famille déjà contactée une première fois — sans lien
      // existant, rien à rappeler (elle recevrait le même message qu'un premier envoi, sous un sujet
      // "Rappel" trompeur).
      if (isRappel && !row.reinscription_token) {
        skipped++;
        continue;
      }
      if (!row.reinscription_token) {
        const token = crypto.randomUUID();
        await env.DB.prepare('UPDATE inscriptions SET reinscription_token = ? WHERE id = ?').bind(token, row.id).run();
        row = { ...row, reinscription_token: token };
      }
      const ok = await sendReinscriptionEmail(env, row, siteUrl, dateLimiteReinscription, isRappel);
      if (ok) sent++;
      else failed++;
    }
    const parts = [`${sent} ${isRappel ? 'rappel' : 'lien de réinscription'}${sent > 1 ? 's' : ''} envoyé${sent > 1 ? 's' : ''}`];
    if (skipped) parts.push(`${skipped} ignoré${skipped > 1 ? 's' : ''} (${isRappel ? 'déjà réinscrit ou jamais contacté' : 'déjà réinscrit'}${skipped > 1 ? 's' : ''})`);
    if (failed) parts.push(`${failed} échec${failed > 1 ? 's' : ''} (BREVO_API_KEY manquante ou envoi refusé — le lien reste consultable sur /admin/reinscription)`);
    const msg = encodeURIComponent(`${parts.join(', ')}.`);
    return new Response('', { status: 302, headers: { Location: withParam(redirectTo, `bulkOk=${msg}`) } });
  }

  const password = form.get('password');
  const currentPassword = await getAdminPassword(env);

  if (!currentPassword || password !== currentPassword) {
    return new Response(loginPage({ error: true }), {
      status: 401,
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  }

  return new Response('', {
    status: 302,
    headers: {
      Location: '/admin/inscriptions',
      'Set-Cookie': `${COOKIE_NAME}=${encodeURIComponent(password)}; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=2592000`,
    },
  });
}
