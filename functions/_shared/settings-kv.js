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

// Catégories d'âge (U6-U7, U8-U9...) + libellé de saison + tarif de l'adhésion en cours,
// modifiables depuis /admin/categories (functions/admin/categories.js) sans passer par une session
// Claude Code à chaque rentrée — voir CLAUDE.md. Alimente dynamiquement le <select> catégorie
// d'inscription.html (via functions/api/categories.js), le formulaire d'édition admin, le filtre de
// la liste, le PDF et l'e-mail de confirmation. Le tarif est unique pour tout le club (pas par
// catégorie) : c'est ainsi qu'il est présenté aujourd'hui sur inscription.html (une seule carte
// "Offre Saison"), pas de raison de complexifier tant que le club ne facture pas différemment selon
// l'âge. DEFAULT_CATEGORIES_CONFIG reprend les valeurs réelles de la saison 2026-2027 (ex-constantes
// de assets/js/inscription.js) : sert de repli tant que /admin/categories n'a jamais été enregistré
// (KV vide), pas seulement en cas d'erreur.
const KV_KEY_CATEGORIES = 'categories_config';

export const DEFAULT_CATEGORIES_CONFIG = {
  saison: '2026-2027',
  prix: 180,
  // Date limite (YYYY-MM-DD) de la réinscription prioritaire — voir effectiveInscriptionStatus()
  // ci-dessous et functions/admin/categories.js. null = pas de campagne de réinscription en cours.
  dateLimiteReinscription: null,
  // Valeur de "saison" juste avant le dernier changement effectif (voir onRequestPost dans
  // functions/admin/categories.js, action=save-saison) — permet le bouton "Revenir à la saison
  // précédente" (action=revert-saison), qui échange saison et previousSaison : un aller-retour reste
  // toujours possible, pas seulement l'annulation d'un seul changement. null tant qu'aucun changement
  // de saison n'a encore eu lieu depuis l'ajout de ce champ.
  previousSaison: null,
  categories: [
    {
      id: 'u6-u7',
      label: 'U6 - U7',
      anneeMin: 2020,
      anneeMax: 2021,
      helloAssoUrl: 'https://www.helloasso.com/beta/associations/saint-gratien-football-club/adhesions/adhesion-u6-u7-saint-gratien-fc-2026-2027',
      helloAssoWidgetUrl: 'https://www.helloasso.com/associations/saint-gratien-football-club/adhesions/adhesion-u6-u7-saint-gratien-fc-2026-2027/widget',
      active: true,
    },
    {
      id: 'u8-u9',
      label: 'U8 - U9',
      anneeMin: 2018,
      anneeMax: 2019,
      helloAssoUrl: 'https://www.helloasso.com/beta/associations/saint-gratien-football-club/adhesions/adhesion-categorie-u8-u9-saint-gratien-fc-2026-2027-2',
      helloAssoWidgetUrl: 'https://www.helloasso.com/associations/saint-gratien-football-club/adhesions/adhesion-categorie-u8-u9-saint-gratien-fc-2026-2027-2/widget',
      active: true,
    },
  ],
};

export async function getCategoriesConfig(env) {
  try {
    const stored = await env.INSCRIPTION_STATUS.get(KV_KEY_CATEGORIES);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && Array.isArray(parsed.categories) && parsed.categories.length) return parsed;
    }
  } catch {
    // KV indisponible ou JSON corrompu : repli sur la config par défaut ci-dessus.
  }
  return DEFAULT_CATEGORIES_CONFIG;
}

export async function setCategoriesConfig(env, config) {
  await env.INSCRIPTION_STATUS.put(KV_KEY_CATEGORIES, JSON.stringify(config));
}

// Statut d'ouverture "effectif" du formulaire public (inscription.html), utilisé par
// functions/api/inscription-status.js et l'entête de functions/admin/inscriptions.js — distinct du
// statut brut stocké dans le KV (clé "inscription_status", voir functions/admin/inscription-status.js)
// : quand ce dernier vaut "closed" ET qu'une date limite de réinscription prioritaire est enregistrée
// (voir dateLimiteReinscription ci-dessus) et dépassée, le site rouvre automatiquement au public sans
// action de l'admin — pas besoin de Cron Trigger, juste une comparaison de date à chaque requête. Un
// statut brut "open" reste toujours prioritaire (l'admin garde la main pour rouvrir plus tôt).
export function effectiveInscriptionStatus(rawStatus, dateLimiteReinscription) {
  if (rawStatus === 'open') return 'open';
  if (dateLimiteReinscription) {
    const today = new Date().toISOString().slice(0, 10);
    if (today >= dateLimiteReinscription) return 'open';
  }
  return 'closed';
}
