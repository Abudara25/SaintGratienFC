// Génère (si besoin) le reinscription_token d'une fiche depuis sa page d'édition (bouton "Générer
// le lien de réinscription"), pour le cas où l'admin veut le lien d'une seule famille sans passer
// par l'action groupée "Envoyer le lien de réinscription" de /admin/inscriptions (qui génère aussi
// le token, mais pour toute une sélection). Ne renvoie jamais d'e-mail — juste le lien affiché sur
// la fiche (functions/admin/inscriptions/[id].js), à distribuer à la main.
import { ensureInscriptionsTable } from '../../../_shared/inscriptions-db.js';
import { isAuthed, loginPage } from '../../../_shared/admin-auth.js';

export async function onRequestPost({ request, env, params }) {
  if (!(await isAuthed(request, env))) {
    return new Response(loginPage(), { status: 401, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  await ensureInscriptionsTable(env.DB);
  const id = Number(params.id);
  const row = await env.DB.prepare('SELECT reinscription_token FROM inscriptions WHERE id = ?').bind(id).first();
  if (!row) {
    return new Response('Inscription introuvable.', { status: 404 });
  }

  if (!row.reinscription_token) {
    await env.DB.prepare('UPDATE inscriptions SET reinscription_token = ? WHERE id = ?').bind(crypto.randomUUID(), id).run();
  }

  return new Response('', { status: 302, headers: { Location: `/admin/inscriptions/${id}` } });
}
