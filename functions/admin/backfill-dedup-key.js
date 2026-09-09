// Outil de migration ponctuel (2026-09-09) : calcule et écrit dedup_key pour les lignes créées
// avant l'ajout de cette colonne (voir _shared/inscriptions-db.js). À supprimer une fois exécuté.
import { ensureInscriptionsTable, buildDedupKey } from '../_shared/inscriptions-db.js';
import { isAuthed, loginPage } from '../_shared/admin-auth.js';

export async function onRequestGet({ request, env }) {
  if (!(await isAuthed(request, env))) {
    return new Response(loginPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  await ensureInscriptionsTable(env.DB);
  const { results } = await env.DB.prepare('SELECT id, enfant_prenom, enfant_nom, email FROM inscriptions WHERE dedup_key IS NULL').all();

  for (const row of results) {
    const dedupKey = buildDedupKey({ enfantPrenom: row.enfant_prenom, enfantNom: row.enfant_nom, email: row.email });
    await env.DB.prepare('UPDATE inscriptions SET dedup_key = ? WHERE id = ?').bind(dedupKey, row.id).run();
  }

  return new Response(`Mis à jour : ${results.length} ligne(s).`, { headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
}
