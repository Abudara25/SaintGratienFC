// Outil de diagnostic ponctuel — à supprimer une fois le bug de doublon accentué diagnostiqué.
import { buildDedupKey } from '../_shared/inscriptions-db.js';
import { isAuthed, loginPage } from '../_shared/admin-auth.js';

// Pas de Buffer (Node) disponible sans nodejs_compat — TextEncoder est standard côté Workers.
const toHex = (str) =>
  Array.from(new TextEncoder().encode(str))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

export async function onRequestGet({ request, env }) {
  if (!(await isAuthed(request, env))) {
    return new Response(loginPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  const { searchParams } = new URL(request.url);
  const uploadToken = searchParams.get('uploadToken');
  const enfantPrenom = searchParams.get('enfantPrenom') || '';
  const enfantNom = searchParams.get('enfantNom') || '';
  const email = searchParams.get('email') || '';

  const row = uploadToken
    ? await env.DB.prepare('SELECT enfant_prenom, enfant_nom, email, dedup_key FROM inscriptions WHERE upload_token = ?').bind(uploadToken).first()
    : null;

  const queryKey = buildDedupKey({ enfantPrenom, enfantNom, email });
  const storedKeyRecomputed = row ? buildDedupKey({ enfantPrenom: row.enfant_prenom, enfantNom: row.enfant_nom, email: row.email }) : null;

  return new Response(
    JSON.stringify(
      {
        query: { enfantPrenom, enfantNom, email, queryKey, queryKeyHex: toHex(queryKey) },
        storedRow: row,
        storedKeyRecomputed,
        storedKeyRecomputedHex: storedKeyRecomputed ? toHex(storedKeyRecomputed) : null,
        match: row ? row.dedup_key === queryKey : null,
      },
      null,
      2
    ),
    { headers: { 'Content-Type': 'application/json;charset=UTF-8' } }
  );
}
