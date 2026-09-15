// Vérification du dossier signé par un responsable, depuis la fiche admin (bloc « Dossier & paiement ») :
// action=valider ou action=refuser (motifs cochés parmi DOSSIER_REFUS_MOTIFS + commentaire libre). Un
// refus remet l'étape "à faire" côté famille et, sauf case décochée, lui envoie l'e-mail qui explique
// ce qui manque (sendDossierRefusedEmail). Une validation déclenche l'e-mail de suivi habituel.
import { ensureInscriptionsTable, DOSSIER_REFUS_MOTIFS } from '../../../_shared/inscriptions-db.js';
import { isAuthed, loginPage } from '../../../_shared/admin-auth.js';
import { afterInscriptionChange } from '../../../_shared/automations.js';
import { sendDossierRefusedEmail } from '../../../_shared/confirmation-email.js';

const COMMENT_MAX = 500;

export async function onRequestPost({ request, env, params, waitUntil }) {
  if (!(await isAuthed(request, env))) {
    return new Response(loginPage(), { status: 401, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  await ensureInscriptionsTable(env.DB);
  const id = Number(params.id);
  const row = await env.DB.prepare('SELECT * FROM inscriptions WHERE id = ?').bind(id).first();
  if (!row) {
    return new Response('Inscription introuvable.', { status: 404 });
  }

  const back = (param) => new Response('', { status: 302, headers: { Location: `/admin/inscriptions/${id}?${param}#dossier` } });
  const form = await request.formData().catch(() => null);
  if (!row.dossier_uploaded_at) {
    return back(`verifError=${encodeURIComponent('Aucun dossier reçu pour cette inscription.')}`);
  }
  const siteUrl = new URL(request.url).origin;

  if (form?.get('action') === 'valider') {
    await env.DB.prepare("UPDATE inscriptions SET dossier_status = 'valide', dossier_verified_at = datetime('now') WHERE id = ?").bind(id).run();
    waitUntil(afterInscriptionChange(env, { id, before: row, step: 'dossier', source: 'admin', siteUrl }));
    return back('verifOk=valide');
  }

  if (form?.get('action') === 'refuser') {
    const motifs = [...new Set(form.getAll('motifs'))].filter((key) => key in DOSSIER_REFUS_MOTIFS);
    const commentaire = String(form.get('commentaire') || '').trim().slice(0, COMMENT_MAX);
    if (!motifs.length && !commentaire) {
      return back(`verifError=${encodeURIComponent('Cochez au moins un motif ou écrivez un commentaire : la famille doit savoir quoi corriger.')}`);
    }
    // complete_notified_at est remis à zéro : la famille recevra de nouveau « Dossier complet » une fois
    // le dossier corrigé validé.
    await env.DB.prepare(
      `UPDATE inscriptions SET dossier_status = 'refuse', dossier_verified_at = NULL, dossier_refused_at = datetime('now'),
        dossier_refus_motifs = ?, dossier_refus_commentaire = ?, complete_notified_at = NULL WHERE id = ?`
    )
      .bind(motifs.join(','), commentaire || null, id)
      .run();

    if (form.get('notifier') !== 'on') return back('verifOk=refuse');
    const updated = await env.DB.prepare('SELECT * FROM inscriptions WHERE id = ?').bind(id).first();
    const sent = await sendDossierRefusedEmail(env, updated, siteUrl);
    if (sent) {
      // Compte comme un contact : les relances automatiques attendent au moins 3 jours (_shared/automations.js).
      await env.DB.prepare("UPDATE inscriptions SET last_reminder_at = datetime('now') WHERE id = ?").bind(id).run();
    }
    return back(sent ? 'verifOk=refuse-mail' : 'verifOk=refuse-mail-echec');
  }

  return back(`verifError=${encodeURIComponent('Action inconnue.')}`);
}
