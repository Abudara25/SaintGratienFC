// Tableau de bord admin — première page de la navigation (voir _shared/admin-auth.js). Vue
// synthétique (effectifs par catégorie, part des documents et paiements validés, fiches à compléter)
// plutôt que d'obliger à parcourir /admin/inscriptions carte par carte. Lecture seule, aucune action.
import { ensureInscriptionsTable, isInscriptionComplete, dossierStatus } from '../_shared/inscriptions-db.js';
import { isAuthed, loginPage, escapeHtml, adminHead, adminShell, adminScripts, icon } from '../_shared/admin-auth.js';
import { getCategoriesConfig } from '../_shared/settings-kv.js';

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

function kpi({ iconName, label, value, of, link }) {
  return `<div class="adm-surface adm-kpi">
    <span class="adm-kpi-label">${icon(iconName)}${label}</span>
    <span class="adm-kpi-value">${value}${of != null ? ` <small>/ ${of}</small>` : ''}</span>
    ${of != null ? `<span class="adm-bar" role="img" aria-label="${pct(value, of)} %"><span style="width:${pct(value, of)}%"></span></span>` : ''}
    ${link ? `<a href="${link.href}" class="adm-kpi-link">${link.label} →</a>` : ''}
  </div>`;
}

const shortcut = (href, iconName, title, description) =>
  `<a href="${href}" class="adm-shortcut">${icon(iconName)}<span><strong>${title}</strong><small>${description}</small></span></a>`;

function page({ total, archivedCount, payeCount, dossierCount, dossierAVerifier, completCount, categorieCounts, saison }) {
  const categories = Object.keys(categorieCounts).sort();

  return `${adminHead('Tableau de bord')}
${adminShell({
  active: 'dashboard',
  eyebrow: `Saison ${escapeHtml(saison)}`,
  title: 'Tableau de bord',
  subtitle: "Vue d'ensemble des inscriptions du club.",
  actions: `<a href="/admin/inscriptions" class="adm-btn adm-btn-white">${icon('users')}Voir les inscriptions</a>`,
})}
<main id="adm-main" class="adm-wrap adm-main">
  <div class="adm-kpis">
    ${kpi({ iconName: 'users', label: 'Inscriptions actives', value: total, link: { href: '/admin/inscriptions', label: 'Voir la liste' } })}
    ${kpi({
      iconName: 'file',
      label: 'Documents validés',
      value: dossierCount,
      of: total,
      link: dossierAVerifier ? { href: '/admin/inscriptions?dossier=a_verifier', label: `${dossierAVerifier} à vérifier` } : null,
    })}
    ${kpi({ iconName: 'card', label: 'Payés', value: payeCount, of: total })}
    ${kpi({ iconName: 'send', label: 'À compléter', value: total - completCount, link: { href: '/admin/inscriptions?etat=incomplet', label: 'Voir et relancer' } })}
  </div>
  <div class="adm-dash-grid">
    <section class="adm-surface">
      <div class="adm-surface-head">
        <h2 class="adm-h2">${icon('tag')}Répartition par catégorie</h2>
        <a href="/admin/categories" class="adm-btn adm-btn-sm adm-btn-ghost">Gérer</a>
      </div>
      ${
        categories.length
          ? `<ul class="adm-bars">${categories
              .map(
                (c) =>
                  `<li><span>${escapeHtml(c)}</span><span class="adm-bar" role="img" aria-label="${pct(categorieCounts[c], total)} %"><span style="width:${pct(categorieCounts[c], total)}%"></span></span><span class="adm-bars-value">${categorieCounts[c]}</span></li>`
              )
              .join('')}</ul>`
          : '<p class="adm-help">Aucune inscription active pour le moment.</p>'
      }
    </section>
    <section class="adm-surface">
      <div class="adm-surface-head"><h2 class="adm-h2">${icon('dashboard')}Raccourcis</h2></div>
      <div class="adm-shortcuts">
        ${shortcut('/admin/reinscription', 'refresh', 'Réinscription', 'Campagne de réinscription prioritaire')}
        ${shortcut('/admin/inscriptions?view=archive', 'trash', 'Corbeille', `${archivedCount} profil${archivedCount > 1 ? 's' : ''} archivé${archivedCount > 1 ? 's' : ''}`)}
        ${shortcut('/admin/events', 'activity', 'Événements', 'Clics téléphone et formulaire de contact')}
        ${shortcut('/admin/parametres', 'settings', 'Paramètres', 'Notifications et mot de passe')}
      </div>
    </section>
  </div>
</main>
${adminScripts('admin-nav')}
</body></html>`;
}

export async function onRequestGet({ request, env }) {
  if (!(await isAuthed(request, env))) {
    return new Response(loginPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  await ensureInscriptionsTable(env.DB);
  const { results } = await env.DB.prepare('SELECT * FROM inscriptions').all();
  const active = results.filter((r) => !r.archived_at);
  const categorieCounts = {};
  for (const r of active) categorieCounts[r.categorie] = (categorieCounts[r.categorie] || 0) + 1;
  const { saison } = await getCategoriesConfig(env);

  return new Response(
    page({
      total: active.length,
      archivedCount: results.length - active.length,
      payeCount: active.filter((r) => r.paye).length,
      dossierCount: active.filter((r) => dossierStatus(r) === 'valide').length,
      dossierAVerifier: active.filter((r) => dossierStatus(r) === 'a_verifier').length,
      completCount: active.filter(isInscriptionComplete).length,
      categorieCounts,
      saison,
    }),
    { headers: { 'Content-Type': 'text/html;charset=UTF-8' } }
  );
}
