// Page dédiée à la campagne de réinscription prioritaire — contrairement à /admin/inscriptions
// (qui mélange toutes les saisons présentes en base, actives ou archivées), cette page ne montre
// QUE les adhérents de la saison précédente : ceux dont saison != saison en cours (voir
// _shared/settings-kv.js). Objectif explicite (demande utilisateur) : éviter qu'un responsable du
// club sélectionne par erreur des familles déjà inscrites cette saison en travaillant sur la liste
// générale, en ne lui montrant que la bonne population dès le départ.
// L'envoi (premier lien ou rappel) réutilise les actions bulk-reinscription/bulk-reinscription-
// rappel de functions/admin/inscriptions.js (génère le reinscription_token si besoin + e-mail via
// sendReinscriptionEmail) — cette page ne fait que POSTer dessus avec redirectTo=/admin/reinscription
// pour revenir ici après coup, et la sélection multiple réutilise telle quelle
// assets/js/admin-inscriptions.js (mêmes id/classes : #bulk-form, #bulk-action, #bulk-select-all,
// #bulk-count, #bulk-ids-container, .insc-select, [data-bulk-action]).
// onRequestPost ci-dessous (action=generate-link) gère en plus la génération du lien pour UNE seule
// fiche sans envoyer d'e-mail, affiché/copiable directement dans une ligne (voir linkBlock) — c'est
// la seule page où ce lien apparaît : à la demande explicite de l'utilisateur, il n'est plus affiché
// ni généré depuis la fiche d'édition /admin/inscriptions/<id>.
import { ensureInscriptionsTable } from '../_shared/inscriptions-db.js';
import { isAuthed, loginPage, escapeHtml, adminSidebar } from '../_shared/admin-auth.js';
import { getCategoriesConfig } from '../_shared/settings-kv.js';

function statusBadge(row) {
  // Un retardataire archivé (voir "Fin de saison" dans /admin/categories) reste actionnable ici même
  // après archivage — ce badge le signale, plutôt que de le faire disparaître silencieusement.
  const archiveBadge = row.archived_at ? `<span class="insc-dossier-badge" style="background:var(--cream-200);color:var(--color-text-muted);">Archivé</span>` : '';
  if (row.dejaReinscrit) return `${archiveBadge}<span class="insc-dossier-badge insc-dossier-ok">✓ Réinscrit</span>`;
  if (row.reinscription_token) return `${archiveBadge}<span class="insc-dossier-badge" style="background:var(--cream-200);color:var(--maroon-950);">Lien envoyé, en attente</span>`;
  return `${archiveBadge}<span class="insc-dossier-badge insc-dossier-missing">Pas encore contacté</span>`;
}

// Lien affiché/généré ici uniquement — pas sur la fiche d'édition /admin/inscriptions/<id>, à la
// demande explicite de l'utilisateur ("tout ce fera dans la section réinscription").
function linkBlock(r, siteUrl, returnTo) {
  if (r.dejaReinscrit) return '';
  if (r.reinscription_token) {
    return `<input type="text" readonly value="${escapeHtml(`${siteUrl}/reinscription/${r.reinscription_token}`)}" style="width:100%;padding:6px 8px;border:1px solid var(--cream-200);border-radius:var(--radius-sm);font-size:.76rem;margin-top:6px;" aria-label="Lien de réinscription de ${escapeHtml(r.enfant_prenom)} (triple-cliquer pour sélectionner)">`;
  }
  return `<form method="POST" style="margin-top:6px;">
    <input type="hidden" name="action" value="generate-link">
    <input type="hidden" name="id" value="${r.id}">
    <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">
    <button type="submit" class="btn btn-sm" style="background:var(--cream-200);color:var(--maroon-950);">Générer le lien (sans envoyer d'e-mail)</button>
  </form>`;
}

function row(r, siteUrl, returnTo) {
  const name = `${escapeHtml(r.enfant_prenom)} ${escapeHtml(r.enfant_nom)}`;
  return `<div class="reinsc-row">
    <label class="reinsc-row-check">
      <input type="checkbox" class="insc-select" data-id="${r.id}" aria-label="Sélectionner ${name}" ${r.dejaReinscrit ? 'disabled' : ''}>
    </label>
    <div class="reinsc-row-main">
      <strong>${name}</strong>
      <span class="reinsc-row-sub">${escapeHtml(r.categorie)} · né(e) le ${escapeHtml(r.naissance)} · saison ${escapeHtml(r.saison)}</span>
      <span class="reinsc-row-sub">${escapeHtml(r.parent_prenom)} ${escapeHtml(r.parent_nom)} · <a href="mailto:${escapeHtml(r.email)}">${escapeHtml(r.email)}</a>${r.telephone ? ` · ${escapeHtml(r.telephone)}` : ''}</span>
      ${linkBlock(r, siteUrl, returnTo)}
    </div>
    <div class="reinsc-row-actions">
      ${statusBadge(r)}
      <a href="/admin/inscriptions/${r.id}" class="btn btn-sm" style="background:var(--cream-200);color:var(--maroon-950);">Voir la fiche</a>
    </div>
  </div>`;
}

function page({ rows, saison, q, bulkOk, total, siteUrl, returnTo, dateLimiteReinscription }) {
  const reinscritCount = rows.filter((r) => r.dejaReinscrit).length;
  const contacteCount = rows.filter((r) => !r.dejaReinscrit && r.reinscription_token).length;
  const nonContacteCount = rows.filter((r) => !r.dejaReinscrit && !r.reinscription_token).length;

  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Réinscription — Admin Saint-Gratien FC</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/svg+xml" href="/assets/images/favicon-admin.svg">
<link rel="icon" type="image/png" href="/assets/images/favicon-admin.png">
<link rel="stylesheet" href="/assets/css/styles.css?v=20260909g">
<style>
  .admin-main{max-width:1000px;}
  .reinsc-stats{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px;}
  .reinsc-stat{background:var(--white);border:1px solid var(--cream-200);border-radius:var(--radius-sm);padding:12px 16px;flex:1;min-width:140px;}
  .reinsc-stat strong{display:block;font-family:var(--font-display);font-size:1.5rem;color:var(--maroon-900);}
  .reinsc-stat span{font-size:.78rem;color:var(--color-text-muted);}
  .reinsc-search{display:flex;gap:10px;margin-bottom:16px;}
  .reinsc-search input{flex:1;padding:10px 12px;border:1px solid var(--cream-200);border-radius:var(--radius-sm);font-size:.9rem;min-height:44px;}
  .insc-select{width:20px;height:20px;flex-shrink:0;cursor:pointer;}
  .insc-select:disabled{cursor:not-allowed;opacity:.35;}
  .insc-bulk-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:12px 14px;margin-bottom:16px;background:var(--white);border:1px solid var(--cream-200);border-radius:var(--radius-sm);font-size:.85rem;}
  .insc-bulk-select-all{display:flex;align-items:center;gap:8px;cursor:pointer;white-space:nowrap;}
  .insc-bulk-count{color:var(--color-text-muted);white-space:nowrap;}
  .insc-bulk-bar .btn[disabled]{opacity:.45;cursor:not-allowed;}
  .insc-banner{padding:12px 16px;border-radius:var(--radius-sm);margin-bottom:16px;font-size:.9rem;}
  .insc-banner-ok{background:var(--gold-100);color:var(--maroon-900);}
  .insc-dossier-badge{font-size:.66rem;font-weight:700;padding:4px 9px;border-radius:999px;white-space:nowrap;text-transform:uppercase;letter-spacing:.03em;flex-shrink:0;}
  .insc-dossier-ok{background:var(--gold-100);color:var(--maroon-900);}
  .insc-dossier-missing{background:var(--cream-200);color:var(--color-text-muted);}
  .reinsc-rows{display:flex;flex-direction:column;gap:10px;}
  .reinsc-row{display:flex;align-items:flex-start;gap:14px;background:var(--white);border:1px solid var(--cream-200);border-radius:var(--radius-sm);padding:14px 16px;}
  .reinsc-row-check{padding-top:2px;}
  .reinsc-row-main{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;}
  .reinsc-row-sub{font-size:.82rem;color:var(--color-text-muted);word-break:break-word;}
  .reinsc-row-actions{display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0;}
  @media (max-width:560px){
    .reinsc-row{flex-wrap:wrap;}
    .reinsc-row-actions{flex-direction:row;align-items:center;width:100%;justify-content:space-between;}
  }
</style>
</head><body>
  <div class="admin-layout">
    ${adminSidebar('reinscription')}
    <main class="admin-main">
      <h1 style="font-size:1.3rem;margin-bottom:8px;">Réinscription prioritaire</h1>
      <p style="margin-bottom:20px;color:var(--color-text-muted);font-size:.9rem;">Adhérents de la saison précédente (pas encore rattachés à la saison en cours, « ${escapeHtml(saison)} »). Contrairement à la liste générale d'<a href="/admin/inscriptions">Inscriptions</a>, cette page ne montre que les familles concernées par la réinscription — pas de risque de contacter quelqu'un déjà inscrit cette saison.</p>

      ${bulkOk ? `<p class="insc-banner insc-banner-ok">${escapeHtml(bulkOk)}</p>` : ''}

      <div class="reinsc-stats">
        <div class="reinsc-stat"><strong>${total}</strong><span>Adhérents à réinscrire</span></div>
        <div class="reinsc-stat"><strong>${reinscritCount}</strong><span>Déjà réinscrits</span></div>
        <div class="reinsc-stat"><strong>${contacteCount}</strong><span>Contactés, en attente</span></div>
        <div class="reinsc-stat"><strong>${nonContacteCount}</strong><span>Pas encore contactés</span></div>
      </div>

      <form method="GET" class="reinsc-search">
        <input type="search" name="q" value="${escapeHtml(q)}" placeholder="Chercher un nom, prénom, e-mail…">
        <button type="submit" class="btn btn-dark btn-sm">Chercher</button>
        ${q ? `<a href="/admin/reinscription" class="btn btn-sm" style="background:var(--cream-200);color:var(--maroon-950);">Réinitialiser</a>` : ''}
      </form>

      ${
        dateLimiteReinscription
          ? `<p style="margin-bottom:12px;font-size:.85rem;color:var(--color-text-muted);">Date limite de réinscription prioritaire : <strong style="color:var(--maroon-950);">${escapeHtml(dateLimiteReinscription.split('-').reverse().join('/'))}</strong> (<a href="/admin/categories">modifier</a>). Le bouton « Envoyer un rappel » ci-dessous permet de relancer les familles déjà contactées qui n'ont pas encore validé, autant de fois que nécessaire avant cette date.</p>`
          : `<p style="margin-bottom:12px;font-size:.85rem;color:var(--color-text-muted);">Aucune date limite réglée — <a href="/admin/categories">en définir une</a> permet d'informer les familles et de savoir quand rouvrir au public.</p>`
      }

      <form method="POST" action="/admin/inscriptions" id="bulk-form" class="insc-bulk-bar">
        <input type="hidden" name="action" id="bulk-action" value="">
        <input type="hidden" name="redirectTo" value="/admin/reinscription${q ? `?q=${encodeURIComponent(q)}` : ''}">
        <div id="bulk-ids-container"></div>
        <label class="insc-bulk-select-all">
          <input type="checkbox" id="bulk-select-all">
          Tout sélectionner (hors déjà réinscrits)
        </label>
        <span id="bulk-count" class="insc-bulk-count">0 sélectionné(s)</span>
        <button type="button" class="btn btn-sm" data-bulk-action="bulk-reinscription" data-confirm="Envoyer aux profils sélectionnés leur lien personnel de réinscription prioritaire ?" style="background:var(--gold-500);color:var(--maroon-950);" disabled>Envoyer le lien de réinscription</button>
        <button type="button" class="btn btn-sm" data-bulk-action="bulk-reinscription-rappel" data-confirm="Envoyer un rappel aux profils sélectionnés déjà contactés mais pas encore réinscrits ? (ignoré pour les profils jamais contactés)" style="background:var(--cream-200);color:var(--maroon-950);" disabled>Envoyer un rappel</button>
      </form>

      <div class="reinsc-rows">${
        rows.length
          ? rows.map((r) => row(r, siteUrl, returnTo)).join('')
          : `<p>${
              q
                ? 'Aucun adhérent de la saison précédente ne correspond à cette recherche.'
                : total === 0
                  ? "Aucun adhérent de la saison précédente à réinscrire — soit c'est la toute première saison du club, soit tout le monde est déjà à jour."
                  : 'Tous les adhérents correspondant à cette recherche sont déjà réinscrits.'
            }</p>`
      }</div>
    </main>
  </div>
  <script src="/assets/js/admin-nav.js?v=20260909a"></script>
  <script src="/assets/js/admin-inscriptions.js?v=20260909e"></script>
</body></html>`;
}

export async function onRequestGet({ request, env }) {
  if (!(await isAuthed(request, env))) {
    return new Response(loginPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  await ensureInscriptionsTable(env.DB);
  const { results } = await env.DB.prepare('SELECT * FROM inscriptions').all();
  const { saison, dateLimiteReinscription } = await getCategoriesConfig(env);

  // Une fiche de la saison en cours partageant la même dedup_key qu'une fiche de la saison
  // précédente = cette famille s'est déjà réinscrite (voir _shared/inscriptions-db.js,
  // findCurrentSeasonSubmission — même logique, mais calculée ici une fois pour tout le monde
  // plutôt qu'en une requête par fiche : la table reste petite, un seul SELECT * suffit).
  const currentSeasonKeys = new Set(results.filter((r) => r.saison === saison).map((r) => r.dedup_key));
  let rows = results
    .filter((r) => r.saison && r.saison !== saison)
    .map((r) => ({ ...r, dejaReinscrit: currentSeasonKeys.has(r.dedup_key) }));

  const total = rows.length;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) => `${r.enfant_prenom} ${r.enfant_nom} ${r.parent_prenom} ${r.parent_nom} ${r.email}`.toLowerCase().includes(needle));
  }

  rows.sort((a, b) => a.enfant_nom.localeCompare(b.enfant_nom, 'fr') || a.enfant_prenom.localeCompare(b.enfant_prenom, 'fr'));

  const siteUrl = new URL(request.url).origin;
  const returnTo = `/admin/reinscription${q ? `?q=${encodeURIComponent(q)}` : ''}`;

  return new Response(page({ rows, saison, q, bulkOk: searchParams.get('bulkOk'), total, siteUrl, returnTo, dateLimiteReinscription }), {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}

// Génère (si besoin) le lien de réinscription d'une seule fiche, sans envoyer d'e-mail — pour le cas
// où l'admin veut distribuer le lien à la main (SMS, message perso) plutôt que via l'e-mail
// automatique. returnTo (posté par linkBlock ci-dessus) ramène sur la recherche/page en cours ;
// jamais une redirection ouverte (allowlist identique à celle de bulk-reinscription dans
// functions/admin/inscriptions.js).
export async function onRequestPost({ request, env }) {
  if (!(await isAuthed(request, env))) {
    return new Response(loginPage(), { status: 401, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  const form = await request.formData();
  const returnTo = /^\/admin\/reinscription(\?[^\s]*)?$/.test(form.get('returnTo') || '') ? form.get('returnTo') : '/admin/reinscription';

  if (form.get('action') === 'generate-link') {
    const id = Number(form.get('id'));
    if (id) {
      await ensureInscriptionsTable(env.DB);
      const row = await env.DB.prepare('SELECT reinscription_token FROM inscriptions WHERE id = ?').bind(id).first();
      if (row && !row.reinscription_token) {
        await env.DB.prepare('UPDATE inscriptions SET reinscription_token = ? WHERE id = ?').bind(crypto.randomUUID(), id).run();
      }
    }
  }

  return new Response('', { status: 302, headers: { Location: returnTo } });
}
