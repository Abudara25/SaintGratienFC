// Changement du mode de paiement depuis l'espace famille /depot/<token> (carte « Paiement de
// l'adhésion », proposée aussi dans l'e-mail de relance). Même protection que la page (le jeton secret
// de la famille). Impossible une fois le paiement validé par le club. Le club est prévenu si les alertes
// de dépôt sont actives (/admin/parametres), puisqu'il attend peut-être un règlement en main propre.
import { ensureInscriptionsTable } from '../../_shared/inscriptions-db.js';
import { getAutomationsConfig } from '../../_shared/settings-kv.js';
import { sendClubPaymentModeAlert } from '../../_shared/confirmation-email.js';

const MODES_PAIEMENT =['HelloAsso', 'Carte bancaire', 'Espèces', 'Chèque'];

export async function onRequestPost({ request, env, params, waitUntil }) {
  await ensureInscriptionsTable(env.DB);
  const inscription = await env.DB.prepare('SELECT * FROM inscriptions WHERE upload_token = ?').bind(params.token).first();
  if (!inscription) return new Response('Lien invalide.', { status: 404 });

  const back = (param) => new Response('', { status: 302, headers: { Location: `/depot/${inscription.upload_token}?${param}#paiement` } });

  let form;
  try {
    form = await request.formData();
  } catch {
    return back(`modeError=${encodeURIComponent('Envoi invalide, réessayez.')}`);
  }
  const mode = String(form.get('modePaiement') || '');
  if (!MODES_PAIEMENT.includes(mode)) {
    return back(`modeError=${encodeURIComponent('Choisissez un mode de paiement.')}`);
  }
  if (inscription.paye) {
    return back(`modeError=${encodeURIComponent('Le paiement est déjà validé par le club : le mode ne peut plus être changé.')}`);
  }
  if (mode === inscription.mode_paiement) return back('modeOk=1');

  try {
    await env.DB.prepare('UPDATE inscriptions SET mode_paiement = ? WHERE id = ? AND (paye IS NULL OR paye = 0)').bind(mode, inscription.id).run();
  } catch {
    return back(`modeError=${encodeURIComponent("Échec de l'enregistrement, réessayez ou écrivez-nous à contact@saintgratienfc.fr.")}`);
  }

  const siteUrl = new URL(request.url).origin;
  waitUntil(
    (async () => {
      try {
        if ((await getAutomationsConfig(env)).clubUploadAlerts) {
          await sendClubPaymentModeAlert(env, { ...inscription, mode_paiement: mode }, siteUrl, inscription.mode_paiement);
        }
      } catch {
        // best-effort
      }
    })()
  );
  return back('modeOk=1');
}
