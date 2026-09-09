// Lit l'état ouvert/fermé des inscriptions depuis le KV "saintgratienfc_config" (clé
// "inscription_status", modifiable depuis /admin/inscriptions — functions/admin/inscription-status.js).
// Le statut renvoyé est "effectif" (voir effectiveInscriptionStatus dans _shared/settings-kv.js) :
// si le statut brut est "closed" mais que la date limite de réinscription prioritaire (réglée dans
// /admin/categories) est dépassée, le site rouvre automatiquement au public sans action de l'admin.
// dateLimiteReinscription est aussi renvoyée pour qu'inscription.html puisse afficher "réinscription
// prioritaire en cours, ouverture au public le [date]" plutôt qu'un simple "fermé" tant que cette
// date n'est pas atteinte.
import { getCategoriesConfig, effectiveInscriptionStatus } from '../_shared/settings-kv.js';

export async function onRequestGet({ env }) {
  let rawStatus = 'open';
  try {
    const value = await env.INSCRIPTION_STATUS.get('inscription_status');
    if (value === 'open' || value === 'closed') rawStatus = value;
  } catch (e) {
    // KV indisponible : on reste sur "open" par défaut.
  }

  const { dateLimiteReinscription } = await getCategoriesConfig(env);
  const status = effectiveInscriptionStatus(rawStatus, dateLimiteReinscription);

  return new Response(JSON.stringify({ status, dateLimiteReinscription: status === 'closed' ? dateLimiteReinscription : null }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
