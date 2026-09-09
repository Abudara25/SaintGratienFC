// Reçoit les événements envoyés par l'outil "Requête HTTP" de Cloudflare Zaraz (voir
// confidentialite.html) — appelé côté serveur par Zaraz (pas directement par le navigateur du
// visiteur), donc aucun CORS à gérer. Volontairement minimal : ni cookie, ni IP, ni identifiant
// de visiteur stockés — juste un compteur d'événements agrégé (nom + page + horodatage) pour
// suivre deux actions clés (clic sur le numéro de téléphone, soumission du formulaire de
// contact), sans profilage individuel.
import { ensureEventsTable } from '../_shared/events-db.js';

const ALLOWED_EVENTS = new Set(['phone_click', 'contact_form_submit']);

export async function onRequestPost({ request, env }) {
  let data;
  try {
    data = await request.json();
  } catch {
    return new Response('JSON invalide', { status: 400 });
  }

  if (!ALLOWED_EVENTS.has(data.event)) {
    return new Response('Événement inconnu', { status: 400 });
  }

  try {
    await ensureEventsTable(env.DB);
    await env.DB.prepare('INSERT INTO events (event, page) VALUES (?, ?)')
      .bind(data.event, String(data.page ?? '').slice(0, 200) || null)
      .run();
  } catch {
    return new Response('Échec de l’enregistrement', { status: 500 });
  }

  return new Response('', { status: 204 });
}
