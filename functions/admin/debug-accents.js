// Outil de diagnostic ponctuel — à supprimer une fois le bug de comparaison accentuée
// diagnostiqué. Authentifié admin comme le reste de /admin.
import { isAuthed, loginPage } from '../_shared/admin-auth.js';

export async function onRequestGet({ request, env }) {
  if (!(await isAuthed(request, env))) {
    return new Response(loginPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  const row = await env.DB.prepare(
    `SELECT
      LOWER('É') AS lower_e_accent,
      LOWER('É') = 'é' AS matches_lower,
      LOWER('Léa') = LOWER('LÉA') AS case_insensitive_match,
      LOWER(TRIM('Léa')) AS trimmed_lowered`
  ).first();

  return new Response(JSON.stringify(row, null, 2), { headers: { 'Content-Type': 'application/json;charset=UTF-8' } });
}
