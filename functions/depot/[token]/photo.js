// Photo de l'enfant depuis l'espace famille /depot/<token> : GET l'affiche, POST la dépose. Même
// protection que la page (le jeton secret de la famille), mêmes règles que le dépôt admin
// (_shared/photo-storage.js).
import { ensureInscriptionsTable } from '../../_shared/inscriptions-db.js';
import { photoError, storePhoto, photoResponse } from '../../_shared/photo-storage.js';
import { afterInscriptionChange } from '../../_shared/automations.js';

async function loadInscription(env, token) {
  await ensureInscriptionsTable(env.DB);
  return env.DB.prepare('SELECT * FROM inscriptions WHERE upload_token = ?').bind(token).first();
}

export async function onRequestGet({ env, params }) {
  return photoResponse(env, await loadInscription(env, params.token));
}

export async function onRequestPost({ request, env, params, waitUntil }) {
  const inscription = await loadInscription(env, params.token);
  if (!inscription) return new Response('Lien invalide.', { status: 404 });

  const back = (param) => new Response('', { status: 302, headers: { Location: `/depot/${inscription.upload_token}?${param}#photo` } });
  const withError = (message) => back(`photoError=${encodeURIComponent(message)}`);

  let form;
  try {
    form = await request.formData();
  } catch {
    return withError('Envoi invalide, réessayez.');
  }

  const file = form.get('photo');
  const error = photoError(file);
  if (error) return withError(error);
  if (!env.DOSSIERS) {
    return withError("L'envoi en ligne n'est pas encore activé — envoyez-nous la photo par e-mail à contact@saintgratienfc.fr en attendant.");
  }

  try {
    await storePhoto(env, inscription, file, waitUntil);
  } catch {
    return withError("Échec de l'envoi, réessayez ou écrivez-nous à contact@saintgratienfc.fr.");
  }
  waitUntil(afterInscriptionChange(env, { id: inscription.id, before: inscription, step: 'photo', source: 'famille', siteUrl: new URL(request.url).origin }));
  return back('photoOk=1');
}
