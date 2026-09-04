// Sert le dossier signé (stocké dans le bucket R2 "DOSSIERS") depuis la fiche admin d'une
// inscription — voir functions/depot/[token].js pour le dépôt côté famille. Même garde
// d'authentification que le reste de /admin (_shared/admin-auth.js).
// onRequestPost (ajouté 2026-09-05) : dépôt manuel par un responsable du club, pour le cas où un
// parent envoie le dossier signé par e-mail plutôt que par le lien /depot/<token> — mêmes règles
// de validation que ce dépôt public (voir MAX_SIZE/ALLOWED_TYPES), stocké sous la même clé R2
// (dossiers/<upload_token>) pour que les deux chemins de dépôt restent interchangeables.
import { ensureInscriptionsTable } from '../../../_shared/inscriptions-db.js';
import { isAuthed, loginPage } from '../../../_shared/admin-auth.js';

const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

// N'autorise que des redirections internes vers /admin/inscriptions (avec filtres éventuels), pour
// ramener l'admin sur la liste exactement là où il était — jamais une redirection ouverte.
const safeRedirect = (value) => (/^\/admin\/inscriptions(\?[^\s]*)?$/.test(value || '') ? value : '/admin/inscriptions');

export async function onRequestGet({ request, env, params }) {
  if (!isAuthed(request, env)) {
    return new Response(loginPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  await ensureInscriptionsTable(env.DB);
  const row = await env.DB.prepare('SELECT dossier_key, dossier_content_type FROM inscriptions WHERE id = ?').bind(Number(params.id)).first();
  if (!row?.dossier_key) {
    return new Response('Aucun dossier pour cette inscription.', { status: 404 });
  }
  if (!env.DOSSIERS) {
    return new Response('Le stockage des dossiers (bucket R2) n’est pas configuré.', { status: 500 });
  }

  const object = await env.DOSSIERS.get(row.dossier_key);
  if (!object) {
    return new Response('Fichier introuvable (peut-être supprimé).', { status: 404 });
  }

  const ext = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[row.dossier_content_type] || 'bin';
  return new Response(object.body, {
    headers: {
      'Content-Type': row.dossier_content_type || 'application/octet-stream',
      'Content-Disposition': `inline; filename="dossier-${params.id}.${ext}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function onRequestPost({ request, env, params }) {
  if (!isAuthed(request, env)) {
    return new Response(loginPage(), { status: 401, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  await ensureInscriptionsTable(env.DB);
  const id = Number(params.id);
  const row = await env.DB.prepare('SELECT upload_token FROM inscriptions WHERE id = ?').bind(id).first();
  if (!row) {
    return new Response('Inscription introuvable.', { status: 404 });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    form = null;
  }
  const redirectTo = safeRedirect(form?.get('redirectTo'));
  const withError = (error) =>
    new Response('', { status: 302, headers: { Location: `${redirectTo}${redirectTo.includes('?') ? '&' : '?'}dossierError=${encodeURIComponent(error)}` } });

  if (!form) {
    return withError('Envoi invalide, réessayez.');
  }

  const file = form.get('dossier');
  if (!file || typeof file === 'string' || !file.size) {
    return withError('Choisissez un fichier avant d’envoyer.');
  }
  if (file.size > MAX_SIZE) {
    return withError('Le fichier dépasse 10 Mo.');
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return withError('Format non accepté — PDF, JPG ou PNG uniquement.');
  }
  if (!env.DOSSIERS) {
    return withError("Stockage des dossiers (bucket R2) non configuré.");
  }

  const key = `dossiers/${row.upload_token || `admin-${id}`}`;
  try {
    await env.DOSSIERS.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    await env.DB.prepare(
      "UPDATE inscriptions SET dossier_key = ?, dossier_content_type = ?, dossier_uploaded_at = datetime('now') WHERE id = ?"
    )
      .bind(key, file.type, id)
      .run();
  } catch {
    return withError("Échec de l'envoi, réessayez.");
  }

  return new Response('', { status: 302, headers: { Location: `${redirectTo}${redirectTo.includes('?') ? '&' : '?'}dossierOk=1` } });
}
