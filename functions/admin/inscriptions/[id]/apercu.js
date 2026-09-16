// Aperçu du dossier signé dans l'admin, sans quitter l'application. Ouvrir directement le PDF
// (dossier.js) dans un nouvel onglet renvoyait, dans l'admin installée sur Android, vers la
// visionneuse PDF du téléphone, puis vers l'écran d'accueil au retour au lieu de la fiche. Ici le
// PDF est dessiné dans la page par PDF.js (assets/js/admin-apercu.js) et la page s'ouvre dans la
// même fenêtre : le bouton retour ramène à la fiche.
import { ensureInscriptionsTable } from '../../../_shared/inscriptions-db.js';
import { isAuthed, loginPage, adminHead, adminShell, adminScripts, escapeHtml, icon } from '../../../_shared/admin-auth.js';

const html = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });

export async function onRequestGet({ request, env, params }) {
  if (!(await isAuthed(request, env))) return html(loginPage());

  await ensureInscriptionsTable(env.DB);
  const row = await env.DB.prepare('SELECT id, enfant_prenom, enfant_nom, dossier_key, dossier_content_type FROM inscriptions WHERE id = ?')
    .bind(Number(params.id))
    .first();
  if (!row) return new Response('Inscription introuvable.', { status: 404 });

  const fiche = `/admin/inscriptions/${row.id}`;
  const fileUrl = `${fiche}/dossier`;
  const name = `${escapeHtml(row.enfant_prenom)} ${escapeHtml(row.enfant_nom)}`;
  const isPdf = row.dossier_content_type === 'application/pdf';

  const viewer = !row.dossier_key
    ? `<div class="adm-empty">${icon('file')}<p>Aucun dossier reçu pour cette inscription.</p></div>`
    : isPdf
      ? `<div class="adm-viewer" data-pdf="${fileUrl}"><p class="adm-help adm-viewer-status">Chargement du dossier…</p></div>`
      : `<div class="adm-viewer"><img src="${fileUrl}" alt="Dossier signé de ${name}"></div>`;

  return html(`${adminHead(`Dossier de ${row.enfant_prenom} ${row.enfant_nom}`)}
${adminShell({
  active: 'inscriptions',
  back: { href: fiche, label: 'Retour à la fiche' },
  eyebrow: 'Dossier signé',
  title: name,
})}
<main id="adm-main" class="adm-wrap adm-main">
  <div class="adm-surface adm-actionbar">
    <a href="${fiche}#dossier" class="adm-btn adm-btn-primary">${icon('arrowLeft')}Retour à la fiche</a>
    ${row.dossier_key ? `<a href="${fileUrl}?telecharger=1" class="adm-btn adm-btn-ghost" download>${icon('download')}Télécharger</a>` : ''}
  </div>
  <section class="adm-surface adm-viewer-surface">${viewer}</section>
</main>
${isPdf && row.dossier_key ? '<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" integrity="sha512-q+4liFwdPC/bNdhUpZx6aXDx/h77yEQtn4I1slHydcbZK34nLaR3cAeYSJshoxIOq3mjEf7xJE8YWIUHMn+oCQ==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>' : ''}
${adminScripts('admin-nav', 'admin-apercu')}
</body></html>`);
}
