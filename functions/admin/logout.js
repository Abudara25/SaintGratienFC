// Efface le cookie admin_auth (voir functions/_shared/admin-auth.js) et renvoie vers la page de
// connexion. Manquait jusqu'ici : aucun moyen de se déconnecter depuis l'interface, le cookie
// (30 jours) ne s'effaçait qu'en le supprimant manuellement dans le navigateur.
import { COOKIE_NAME } from '../_shared/admin-auth.js';

export async function onRequestGet() {
  return new Response('', {
    status: 302,
    headers: {
      Location: '/admin/inscriptions',
      'Set-Cookie': `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=0`,
    },
  });
}
