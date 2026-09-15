// Photo de l'enfant depuis la fiche admin : GET l'affiche (avatars de la liste et de la fiche), POST
// la dépose à la place de la famille (photo reçue par e-mail, par exemple). Même garde
// d'authentification que le reste de /admin, mêmes règles que le dépôt famille (_shared/photo-storage.js).
import { ensureInscriptionsTable } from '../../../_shared/inscriptions-db.js';
import { isAuthed, loginPage } from '../../../_shared/admin-auth.js';
import { photoError, storePhoto, photoResponse } from '../../../_shared/photo-storage.js';
import { afterInscriptionChange } from '../../../_shared/automations.js';

async function loadInscription(env, id) {
  await ensureInscriptionsTable(env.DB);
  return env.DB.prepare('SELECT * FROM inscriptions WHERE id = ?').bind(Number(id)).first();
}

export async function onRequestGet({ request, env, params }) {
  if (!(await isAuthed(request, env))) return new Response('', { status: 401 });
  return photoResponse(env, await loadInscription(env, params.id));
}

export async function onRequestPost({ request, env, params, waitUntil }) {
  if (!(await isAuthed(request, env))) {
    return new Response(loginPage(), { status: 401, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }
  const inscription = await loadInscription(env, params.id);
  if (!inscription) return new Response('Inscription introuvable.', { status: 404 });

  const back = (param) => new Response('', { status: 302, headers: { Location: `/admin/inscriptions/${inscription.id}?${param}` } });
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
  if (!env.DOSSIERS) return withError('Stockage des fichiers (bucket R2) non configuré.');

  try {
    await storePhoto(env, inscription, file, waitUntil);
  } catch {
    return withError("Échec de l'envoi, réessayez.");
  }
  waitUntil(afterInscriptionChange(env, { id: inscription.id, before: inscription, step: 'photo', source: 'admin', siteUrl: new URL(request.url).origin }));
  return back('photoOk=1');
}
