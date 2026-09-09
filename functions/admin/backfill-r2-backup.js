// Outil de migration ponctuel (2026-09-09) : copie server-to-server vers DOSSIERS_BACKUP tous
// les objets déjà présents dans DOSSIERS au moment de l'ajout du backup R2 (voir
// functions/depot/[token].js et functions/admin/inscriptions/[id]/dossier.js, qui ne protègent
// que les dépôts *futurs*). Ne transite jamais par une machine externe : lecture et écriture
// se font toutes les deux côté Cloudflare, via les bindings R2. À supprimer une fois exécuté —
// ce n'est pas une fonctionnalité destinée à rester dans le site.
import { isAuthed, loginPage } from '../_shared/admin-auth.js';

export async function onRequestGet({ request, env }) {
  if (!isAuthed(request, env)) {
    return new Response(loginPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }
  if (!env.DOSSIERS || !env.DOSSIERS_BACKUP) {
    return new Response('Bindings DOSSIERS / DOSSIERS_BACKUP manquants.', { status: 500 });
  }

  const copied = [];
  const skipped = [];
  let cursor;
  do {
    const listing = await env.DOSSIERS.list({ cursor });
    for (const item of listing.objects) {
      const object = await env.DOSSIERS.get(item.key);
      if (!object) {
        skipped.push(item.key);
        continue;
      }
      await env.DOSSIERS_BACKUP.put(item.key, object.body, { httpMetadata: object.httpMetadata });
      copied.push(item.key);
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);

  return new Response(
    `Copié : ${copied.length}\n${copied.join('\n')}\n\nIgnoré (introuvable) : ${skipped.length}\n${skipped.join('\n')}`,
    { headers: { 'Content-Type': 'text/plain;charset=UTF-8' } }
  );
}
