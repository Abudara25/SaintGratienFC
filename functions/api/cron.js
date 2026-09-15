// Tâches programmées (relances automatiques, récapitulatif du lundi — voir _shared/automations.js).
// Cloudflare Pages ne sait pas planifier de tâche : le Worker workers/cron appelle cette route chaque
// matin, avec le secret partagé CRON_SECRET (à définir à l'identique sur le projet Pages et le Worker).
import { runDailyAutomations } from '../_shared/automations.js';

export async function onRequestPost({ request, env }) {
  if (!env.CRON_SECRET || request.headers.get('Authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return new Response('Forbidden', { status: 403 });
  }
  const result = await runDailyAutomations(env, new URL(request.url).origin);
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
}
