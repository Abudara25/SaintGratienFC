// Photo de l'enfant : validation, stockage et lecture, partagés par le dépôt famille
// (functions/depot/[token]/photo.js) et la fiche admin (functions/admin/inscriptions/[id]/photo.js)
// pour appliquer les mêmes règles des deux côtés. Stockée dans le bucket R2 "DOSSIERS" (comme le
// dossier signé) sous photos/<upload_token> ; D1 ne garde que la référence (photo_key…).
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function photoError(file) {
  if (!file || typeof file === 'string' || !file.size) return 'Choisissez une photo avant d’envoyer.';
  if (file.size > MAX_SIZE) return 'La photo dépasse 10 Mo — réessayez avec une photo moins lourde.';
  if (!ALLOWED_TYPES.has(file.type)) return 'Format non accepté — envoyez une photo JPG, PNG ou WebP.';
  return null;
}

export async function storePhoto(env, row, file, waitUntil) {
  const key = `photos/${row.upload_token || `admin-${row.id}`}`;
  // arrayBuffer() plutôt qu'un stream : le même buffer sert aussi à la copie de sauvegarde.
  const buffer = await file.arrayBuffer();
  await env.DOSSIERS.put(key, buffer, { httpMetadata: { contentType: file.type } });
  await env.DB.prepare("UPDATE inscriptions SET photo_key = ?, photo_content_type = ?, photo_uploaded_at = datetime('now') WHERE id = ?")
    .bind(key, file.type, row.id)
    .run();
  if (env.DOSSIERS_BACKUP && waitUntil) {
    waitUntil(env.DOSSIERS_BACKUP.put(key, buffer, { httpMetadata: { contentType: file.type } }).catch(() => {}));
  }
}

// L'URL d'affichage porte ?v=<date d'envoi> : une nouvelle photo change d'URL, ce qui permet un
// cache navigateur d'une journée sans risquer de montrer l'ancienne.
export async function photoResponse(env, row) {
  if (!row?.photo_key || !env.DOSSIERS) return new Response('Aucune photo.', { status: 404 });
  const object = await env.DOSSIERS.get(row.photo_key);
  if (!object) return new Response('Photo introuvable.', { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': row.photo_content_type || 'application/octet-stream',
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
