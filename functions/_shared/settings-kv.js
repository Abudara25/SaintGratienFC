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

// Double vérification par e-mail avant qu'un changement de mot de passe admin ne prenne effet
// (functions/admin/parametres.js) : le nouveau mot de passe n'est appliqué qu'après saisie d'un
// code à 6 chiffres reçu par e-mail — protège contre un changement fait depuis une session
// compromise (cookie volé) sans que le vrai responsable en soit informé. Expire après 15 min
// (expirationTtl KV) : pas besoin de le nettoyer explicitement si l'admin abandonne en cours.
const KV_KEY_PENDING_PASSWORD = 'pending_password_change';
const PENDING_PASSWORD_TTL_SECONDS = 15 * 60;

export async function setPendingPasswordChange(env, { code, newPassword }) {
  await env.INSCRIPTION_STATUS.put(KV_KEY_PENDING_PASSWORD, JSON.stringify({ code, newPassword }), {
    expirationTtl: PENDING_PASSWORD_TTL_SECONDS,
  });
}

export async function getPendingPasswordChange(env) {
  try {
    const stored = await env.INSCRIPTION_STATUS.get(KV_KEY_PENDING_PASSWORD);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export async function clearPendingPasswordChange(env) {
  await env.INSCRIPTION_STATUS.delete(KV_KEY_PENDING_PASSWORD);
}
