// URL de notification à enregistrer chez HelloAsso (Mon compte › Intégrations et API), avec le secret
// en paramètre : https://saintgratienfc.fr/api/helloasso-notification?key=<HELLOASSO_WEBHOOK_SECRET>
// (l'URL complète est affichée dans /admin/parametres). Seules les notifications "Order" sont traitées
// (voir _shared/helloasso.js). HelloAsso réessaie tant qu'il ne reçoit pas de 200 : on renvoie 200 pour
// tout ce qui est volontairement ignoré, 500 seulement si le traitement a échoué et doit être retenté.
import { processHelloAssoOrder } from '../_shared/helloasso.js';
import { getAutomationsConfig } from '../_shared/settings-kv.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function onRequestPost({ request, env, waitUntil }) {
  const url = new URL(request.url);
  if (!env.HELLOASSO_WEBHOOK_SECRET || url.searchParams.get('key') !== env.HELLOASSO_WEBHOOK_SECRET) {
    return json({ error: 'forbidden' }, 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ status: 'ignored', reason: 'contenu illisible' });
  }
  if (payload?.eventType !== 'Order') return json({ status: 'ignored', reason: `événement ${payload?.eventType || 'inconnu'}` });
  if (!(await getAutomationsConfig(env)).helloassoAutoPay) return json({ status: 'ignored', reason: 'automatisation désactivée' });

  try {
    return json(await processHelloAssoOrder(env, payload.data, url.origin, waitUntil));
  } catch {
    return json({ error: 'processing_failed' }, 500);
  }
}
