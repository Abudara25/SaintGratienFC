// Réglages modifiables depuis /admin/parametres, stockés dans le même KV "saintgratienfc_config"
// (binding INSCRIPTION_STATUS) que le statut d'ouverture des inscriptions — un seul KV pour tout
// le petit nombre de réglages de ce site, pas besoin d'un binding dédié par réglage.
const KV_KEY_NOTIFICATION_EMAIL = 'notification_email';
export const DEFAULT_NOTIFICATION_EMAIL = 'contact@saintgratienfc.fr';

export async function getNotificationEmail(env) {
  try {
    const stored = await env.INSCRIPTION_STATUS.get(KV_KEY_NOTIFICATION_EMAIL);
    if (stored) return stored;
  } catch {
    // KV indisponible (binding non configuré) : repli sur l'adresse par défaut.
  }
  return DEFAULT_NOTIFICATION_EMAIL;
}

export async function setNotificationEmail(env, value) {
  await env.INSCRIPTION_STATUS.put(KV_KEY_NOTIFICATION_EMAIL, value);
}
