// Lit l'état ouvert/fermé des inscriptions depuis le KV "saintgratienfc_config" (clé
// "inscription_status", modifiable depuis /admin/inscriptions — functions/admin/inscription-status.js).
// Le statut renvoyé est "effectif" (voir effectiveInscriptionStatus dans _shared/settings-kv.js) :
// si le statut brut est "closed" mais que la date limite de réinscription prioritaire (réglée dans
// /admin/categories) est dépassée, le site rouvre automatiquement au public sans action de l'admin.
// dateLimiteReinscription est aussi renvoyée pour qu'inscription.html puisse afficher "réinscription
// prioritaire en cours, ouverture au public le [date]" plutôt qu'un simple "fermé" tant que cette
// date n'est pas atteinte.
import { getCategoriesConfig, effectiveInscriptionStatus, todayIso } from '../_shared/settings-kv.js';

export async function onRequestGet({ env }) {
  let rawStatus = 'open';
  try {
    const value = await env.INSCRIPTION_STATUS.get('inscription_status');
    if (value === 'open' || value === 'closed') rawStatus = value;
  } catch (e) {
    // KV indisponible : on reste sur "open" par défaut.
  }

  const { dateLimiteReinscription, dateFermetureInscriptions } = await getCategoriesConfig(env);
  const status = effectiveInscriptionStatus(rawStatus, dateLimiteReinscription, dateFermetureInscriptions);
  // La date de réinscription n'est utile au formulaire que si elle est encore à venir : une fermeture
  // due à la date de fermeture automatique ne doit pas s'afficher comme une "réinscription en cours".
  const upcomingDeadline = status === 'closed' && dateLimiteReinscription && todayIso() < dateLimiteReinscription ? dateLimiteReinscription : null;

  return new Response(JSON.stringify({ status, dateLimiteReinscription: upcomingDeadline }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
