// Ferme la session admin (supprimée de D1, cookies effacés) et renvoie vers la page de connexion.
import { destroySession, withCookies } from '../_shared/admin-auth.js';

export async function onRequestGet({ request, env }) {
  return withCookies(new Response('', { status: 302, headers: { Location: '/admin/inscriptions' } }), await destroySession(request, env));
}
