// Gestion des catégories d'âge (U6-U7, U8-U9...) et de la saison en cours, stockées dans le KV
// "saintgratienfc_config" (_shared/settings-kv.js, clé "categories_config"). Ajoutée pour que le
// club puisse ouvrir une nouvelle saison (nouvelles tranches de naissance, nouveaux liens HelloAsso)
// ou créer une nouvelle catégorie sans session Claude Code — voir CLAUDE.md. Consommée par :
// - functions/api/categories.js (public, alimente le <select> d'inscription.html) ;
// - functions/admin/inscriptions/[id].js (select catégorie du formulaire d'édition) ;
// - functions/_shared/confirmation-email.js (libellé de saison dans l'e-mail de confirmation) ;
// - functions/admin/inscriptions.js (libellé de saison injecté dans le PDF régénéré depuis l'admin).
// Le champ "categorie" stocké en base D1 reste le libellé texte (ex. "U6 - U7"), pas l'id interne
// ci-dessous : renommer une catégorie ne modifie donc pas les inscriptions déjà enregistrées (comme
// pour le filtre "année de naissance", dérivé des données existantes plutôt que d'une liste figée).
import { isAuthed, loginPage, escapeHtml, adminSidebar } from '../_shared/admin-auth.js';
import { getCategoriesConfig, setCategoriesConfig } from '../_shared/settings-kv.js';

function slugify(label) {
  const base = String(label)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'categorie';
}

function uniqueId(base, existingIds) {
  if (!existingIds.includes(base)) return base;
  let n = 2;
  while (existingIds.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function categoryCard(c, { isFirst, isLast }) {
  return `<div class="cat-card">
    <form method="POST" class="cat-form">
      <input type="hidden" name="id" value="${escapeHtml(c.id)}">
      <div class="form-row">
        <div class="form-field">
          <label for="label-${escapeHtml(c.id)}">Nom de la catégorie</label>
          <input type="text" id="label-${escapeHtml(c.id)}" name="label" value="${escapeHtml(c.label)}" required maxlength="40">
        </div>
        <div class="form-field">
          <label style="display:flex;align-items:center;gap:8px;font-weight:400;margin-top:26px;">
            <input type="checkbox" name="active" ${c.active ? 'checked' : ''}>
            Catégorie active (visible sur le formulaire d'inscription)
          </label>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label for="annee-min-${escapeHtml(c.id)}">Naissance — année la plus ancienne</label>
          <input type="number" id="annee-min-${escapeHtml(c.id)}" name="anneeMin" value="${c.anneeMin ?? ''}" required min="2000" max="2100">
        </div>
        <div class="form-field">
          <label for="annee-max-${escapeHtml(c.id)}">Naissance — année la plus récente</label>
          <input type="number" id="annee-max-${escapeHtml(c.id)}" name="anneeMax" value="${c.anneeMax ?? ''}" required min="2000" max="2100">
        </div>
      </div>
      <div class="form-field">
        <label for="ha-url-${escapeHtml(c.id)}">Lien de paiement HelloAsso (onglet « Diffuser » → Bouton &amp; widget → lien classique)</label>
        <input type="url" id="ha-url-${escapeHtml(c.id)}" name="helloAssoUrl" value="${escapeHtml(c.helloAssoUrl || '')}" placeholder="https://www.helloasso.com/beta/associations/...">
      </div>
      <div class="form-field">
        <label for="ha-widget-${escapeHtml(c.id)}">Lien widget HelloAsso (même onglet, sans « /beta », se terminant par « /widget »)</label>
        <input type="url" id="ha-widget-${escapeHtml(c.id)}" name="helloAssoWidgetUrl" value="${escapeHtml(c.helloAssoWidgetUrl || '')}" placeholder="https://www.helloasso.com/associations/.../widget">
      </div>
      <div class="cat-actions">
        <button type="submit" name="action" value="update" class="btn btn-dark btn-sm">Enregistrer</button>
        ${!isFirst ? `<button type="submit" name="action" value="move-up" class="btn btn-sm" style="background:var(--cream-200);color:var(--maroon-950);" formnovalidate>&uarr; Monter</button>` : ''}
        ${!isLast ? `<button type="submit" name="action" value="move-down" class="btn btn-sm" style="background:var(--cream-200);color:var(--maroon-950);" formnovalidate>&darr; Descendre</button>` : ''}
      </div>
    </form>
    <form method="POST" class="cat-confirm-form">
      <input type="hidden" name="action" value="delete">
      <input type="hidden" name="id" value="${escapeHtml(c.id)}">
      <button type="submit" class="btn btn-sm" data-confirm="Supprimer la catégorie « ${escapeHtml(c.label)} » ? Les inscriptions déjà enregistrées avec cette catégorie ne seront pas modifiées, mais elle disparaîtra du formulaire d'inscription et des filtres." style="background:var(--color-error, #b3261e);color:#fff;">Supprimer la catégorie</button>
    </form>
  </div>`;
}

function page({ config, error, ok }) {
  const cards = config.categories
    .map((c, i) => categoryCard(c, { isFirst: i === 0, isLast: i === config.categories.length - 1 }))
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Catégories — Admin Saint-Gratien FC</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/svg+xml" href="/assets/images/favicon-admin.svg">
<link rel="icon" type="image/png" href="/assets/images/favicon-admin.png">
<link rel="stylesheet" href="/assets/css/styles.css?v=20260909f">
<style>
  .admin-main{max-width:640px;}
  .cat-card{background:var(--white);border:1px solid var(--cream-200);border-radius:var(--radius-sm);padding:16px 18px;margin-bottom:16px;}
  .cat-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:4px;}
  .cat-confirm-form{margin-top:10px;}
  .cat-banner{padding:12px 16px;border-radius:var(--radius-sm);margin-bottom:16px;font-size:.9rem;}
  .cat-banner-error{background:#fbe9e7;color:var(--color-error, #b3261e);}
  .cat-banner-ok{background:var(--gold-100);color:var(--maroon-900);}
</style>
</head><body>
  <div class="admin-layout">
    ${adminSidebar('categories')}
    <main class="admin-main">
      <h1 style="font-size:1.3rem;margin-bottom:8px;">Catégories</h1>
      <p style="margin-bottom:20px;color:var(--color-text-muted);font-size:.9rem;">Gérez ici les catégories d'âge affichées sur le formulaire d'inscription, leurs tranches de naissance et leurs liens de paiement HelloAsso — pratique pour préparer la saison suivante dès la fin de la saison en cours, sans coder.</p>
      ${error ? `<p class="cat-banner cat-banner-error">${escapeHtml(error)}</p>` : ''}
      ${ok ? '<p class="cat-banner cat-banner-ok">Modifications enregistrées.</p>' : ''}

      <h2 style="font-size:1rem;margin-bottom:8px;">Saison en cours</h2>
      <form method="POST" style="margin-bottom:32px;">
        <input type="hidden" name="action" value="save-saison">
        <div class="form-field" style="margin-bottom:12px;">
          <label for="saison">Libellé de saison (ex. « 2026-2027 »)</label>
          <input type="text" id="saison" name="saison" value="${escapeHtml(config.saison)}" required maxlength="20" placeholder="2026-2027">
          <small style="font-size:.8rem;color:var(--color-text-muted);">Utilisé dans le PDF d'inscription et l'e-mail de confirmation. Le reste du site (page « Entraînements », textes de présentation...) reste à mettre à jour à la main chaque saison.</small>
        </div>
        <button type="submit" class="btn btn-primary btn-sm">Enregistrer la saison</button>
      </form>

      <h2 style="font-size:1rem;margin-bottom:8px;">Catégories (${config.categories.length})</h2>
      ${cards}

      <h2 style="font-size:1rem;margin:24px 0 8px;">Ajouter une catégorie</h2>
      <form method="POST" class="cat-card">
        <input type="hidden" name="action" value="add">
        <div class="form-row">
          <div class="form-field">
            <label for="new-label">Nom de la catégorie</label>
            <input type="text" id="new-label" name="label" placeholder="U10 - U11" required maxlength="40">
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label for="new-annee-min">Naissance — année la plus ancienne</label>
            <input type="number" id="new-annee-min" name="anneeMin" required min="2000" max="2100" placeholder="2016">
          </div>
          <div class="form-field">
            <label for="new-annee-max">Naissance — année la plus récente</label>
            <input type="number" id="new-annee-max" name="anneeMax" required min="2000" max="2100" placeholder="2017">
          </div>
        </div>
        <div class="form-field">
          <label for="new-ha-url">Lien de paiement HelloAsso (facultatif, à compléter dès qu'il existe)</label>
          <input type="url" id="new-ha-url" name="helloAssoUrl" placeholder="https://www.helloasso.com/beta/associations/...">
        </div>
        <div class="form-field">
          <label for="new-ha-widget">Lien widget HelloAsso (facultatif)</label>
          <input type="url" id="new-ha-widget" name="helloAssoWidgetUrl" placeholder="https://www.helloasso.com/associations/.../widget">
        </div>
        <button type="submit" class="btn btn-primary btn-sm">Ajouter la catégorie</button>
      </form>
    </main>
  </div>
  <script src="/assets/js/admin-nav.js?v=20260909a"></script>
  <script src="/assets/js/admin-categories.js?v=20260909a"></script>
</body></html>`;
}

function parseCategoryFields(form) {
  const label = String(form.get('label') || '').trim();
  const anneeMin = Number(form.get('anneeMin'));
  const anneeMax = Number(form.get('anneeMax'));
  const helloAssoUrl = String(form.get('helloAssoUrl') || '').trim();
  const helloAssoWidgetUrl = String(form.get('helloAssoWidgetUrl') || '').trim();

  if (!label) return { error: 'Le nom de la catégorie est obligatoire.' };
  if (!Number.isInteger(anneeMin) || !Number.isInteger(anneeMax) || anneeMin < 2000 || anneeMax > 2100) {
    return { error: 'Les années de naissance doivent être des nombres entiers valides.' };
  }
  if (anneeMin > anneeMax) {
    return { error: "L'année la plus ancienne doit être inférieure ou égale à l'année la plus récente." };
  }
  if (helloAssoUrl && !/^https:\/\//.test(helloAssoUrl)) {
    return { error: 'Le lien de paiement HelloAsso doit commencer par https://.' };
  }
  if (helloAssoWidgetUrl && !/^https:\/\//.test(helloAssoWidgetUrl)) {
    return { error: 'Le lien widget HelloAsso doit commencer par https://.' };
  }

  return { fields: { label, anneeMin, anneeMax, helloAssoUrl, helloAssoWidgetUrl } };
}

export async function onRequestGet({ request, env }) {
  if (!(await isAuthed(request, env))) {
    return new Response(loginPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }
  const config = await getCategoriesConfig(env);
  return new Response(page({ config }), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

export async function onRequestPost({ request, env }) {
  if (!(await isAuthed(request, env))) {
    return new Response(loginPage(), { status: 401, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  const config = await getCategoriesConfig(env);
  const form = await request.formData();
  const action = form.get('action');

  const withError = (error, status = 400) =>
    new Response(page({ config, error }), { status, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });

  if (action === 'save-saison') {
    const saison = String(form.get('saison') || '').trim();
    if (!saison) return withError('Le libellé de saison est obligatoire.');
    await setCategoriesConfig(env, { ...config, saison });
    return new Response(page({ config: { ...config, saison }, ok: true }), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  if (action === 'add') {
    const { error, fields } = parseCategoryFields(form);
    if (error) return withError(error);
    const id = uniqueId(slugify(fields.label), config.categories.map((c) => c.id));
    const nextConfig = { ...config, categories: [...config.categories, { id, ...fields, active: true }] };
    await setCategoriesConfig(env, nextConfig);
    return new Response(page({ config: nextConfig, ok: true }), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  if (action === 'update') {
    const id = form.get('id');
    const { error, fields } = parseCategoryFields(form);
    if (error) return withError(error);
    const active = form.get('active') === 'on';
    const nextConfig = {
      ...config,
      categories: config.categories.map((c) => (c.id === id ? { ...c, ...fields, active } : c)),
    };
    await setCategoriesConfig(env, nextConfig);
    return new Response(page({ config: nextConfig, ok: true }), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  if (action === 'delete') {
    const id = form.get('id');
    const nextConfig = { ...config, categories: config.categories.filter((c) => c.id !== id) };
    await setCategoriesConfig(env, nextConfig);
    return new Response(page({ config: nextConfig, ok: true }), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  if (action === 'move-up' || action === 'move-down') {
    const id = form.get('id');
    const categories = [...config.categories];
    const index = categories.findIndex((c) => c.id === id);
    const swapWith = action === 'move-up' ? index - 1 : index + 1;
    if (index === -1 || swapWith < 0 || swapWith >= categories.length) {
      return new Response(page({ config }), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }
    [categories[index], categories[swapWith]] = [categories[swapWith], categories[index]];
    const nextConfig = { ...config, categories };
    await setCategoriesConfig(env, nextConfig);
    return new Response(page({ config: nextConfig, ok: true }), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  return new Response(page({ config }), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}
