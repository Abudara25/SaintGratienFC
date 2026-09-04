// Sert le dossier signé (stocké dans le bucket R2 "DOSSIERS") depuis la fiche admin d'une
// inscription — voir functions/depot/[token].js pour le dépôt côté famille. Même garde
// d'authentification que le reste de /admin (_shared/admin-auth.js).
import { ensureInscriptionsTable } from '../../../_shared/inscriptions-db.js';
import { isAuthed, loginPage } from '../../../_shared/admin-auth.js';

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
