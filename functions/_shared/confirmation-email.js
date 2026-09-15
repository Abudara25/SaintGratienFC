// E-mail de RÉCEPTION de l'inscription (pas une confirmation de licence — voir le contenu),
// envoyé via l'API Brevo (compte gratuit, français — préféré à Resend, une entreprise
// américaine, à la demande de l'utilisateur ; clé stockée dans le secret Cloudflare Pages
// BREVO_API_KEY — voir CLAUDE.md). Best-effort : n'importe quelle erreur ici ne doit jamais
// faire échouer l'inscription elle-même, c'est pour ça que sendConfirmationEmail() n'est jamais
// `await`ée directement dans le handler — voir `waitUntil()` dans functions/api/inscriptions.js.
// Expéditeur `contact@saintgratienfc.fr`, domaine authentifié DKIM/DMARC côté Brevo — voir
// CLAUDE.md pour le détail de la migration DKIM vers Cloudflare (2026-09-04).
// Le HTML ci-dessous est un e-mail "habillé" aux couleurs du club (maroon/or/crème, cf.
// assets/css/styles.css) plutôt qu'un simple texte — mise en page en table avec styles inline,
// seule approche fiable across les clients mail (Outlook en particulier ignore le CSS externe/
// flexbox/grid). Ne jamais utiliser de <style> externe ni de classes CSS ici : tout doit être en
// attributs/style inline directement sur chaque balise.
import { getNotificationEmail, getCategoriesConfig } from './settings-kv.js';
import { isInscriptionComplete, familyHasActionPending, dossierStatus, refusMotifs } from './inscriptions-db.js';

const escapeHtml = (str = '') =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Repris de la liste éditable de /admin/categories, mais purement cosmétique (retire les espaces
// autour du tiret, ex. "U6 - U7" → "U6-U7") — pas besoin d'aller chercher le libellé exact d'une
// catégorie potentiellement renommée/supprimée depuis, contrairement à la saison (voir buildEmail).
const formatCategorie = (c = '') => c.replace(/\s*-\s*/g, '-');

// Second responsable légal facultatif (colonnes parent2_*) : il reçoit les mêmes e-mails que le
// premier, et le message s'adresse aux deux. `row` en snake_case, comme en base.
function familyRecipients(row) {
  const recipients = [{ email: row.email, name: `${row.parent_prenom} ${row.parent_nom}` }];
  const second = String(row.parent2_email || '').trim();
  if (second && second.toLowerCase() !== String(row.email).trim().toLowerCase()) {
    recipients.push({ email: second, name: `${row.parent2_prenom || ''} ${row.parent2_nom || ''}`.trim() || undefined });
  }
  return recipients;
}
const greetingName = (row) => (row.parent2_prenom ? `${row.parent_prenom} et ${row.parent2_prenom}` : row.parent_prenom);
const rowFromData = (data) => ({
  email: data.email,
  parent_prenom: data.parentPrenom,
  parent_nom: data.parentNom,
  parent2_prenom: data.parent2Prenom,
  parent2_nom: data.parent2Nom,
  parent2_email: data.parent2Email,
});

// Palette reprise de assets/css/styles.css (:root) pour rester cohérent avec le site.
const MAROON_950 = '#3a0f10';
const MAROON_900 = '#4f1414';
const GOLD_500 = '#f0a030';
const GOLD_400 = '#f4b658';
const GOLD_100 = '#fdf0da';
const GOLD_300 = '#f8d28e';
const CREAM_100 = '#fbf7ee';
const CREAM_200 = '#f3ecd8';
const INK_900 = '#201412';
const INK_700 = '#4a3a36';

function buildEmail(data, uploadToken, siteUrl, saison) {
  const depotUrl = `${siteUrl}/depot/${uploadToken}`;
  const nomEnfant = `${data.enfantPrenom} ${data.enfantNom}`;
  const categorie = formatCategorie(data.categorie);

  // Le point important : ne jamais donner l'impression que l'inscription (ou la licence) est
  // déjà acquise. Elle ne l'est qu'une fois le dossier signé déposé, l'adhésion réglée, ET la
  // licence enregistrée par le club auprès de la FFF via Footclubs (démarche faite par le club,
  // pas par la famille, une fois le dossier complet — délai habituel de quelques jours).
  const text = `Bonjour ${greetingName(rowFromData(data))},

Nous avons bien reçu la demande d'inscription de ${nomEnfant} (${categorie}) au Saint-Gratien FC pour la saison ${saison}.

Important : cette inscription n'est pas encore définitive. Elle sera confirmée une fois :
1. le dossier signé déposé (lien ci-dessous),
2. une photo de votre enfant ajoutée depuis le même lien (de face, sur fond blanc — un mur blanc suffit),
3. l'adhésion réglée (${data.modePaiement}),
4. et la licence de votre enfant enregistrée par le club auprès de la Fédération Française de Football (FFF) via la plateforme Footclubs — cette dernière étape est effectuée par le club une fois le dossier complet, généralement sous quelques jours.

Suivez l'avancement de l'inscription (dossier, photo, paiement) et déposez vos documents ici :
${depotUrl}

Des questions ? Répondez à cet e-mail ou écrivez-nous à contact@saintgratienfc.fr.

Sportivement,
Saint-Gratien FC
Stade Robert Lemoine, 75 rue d'Orgemont, Saint-Gratien`;

  const step = (n, label) => `
              <tr>
                <td style="padding:0 0 16px 0;" valign="top" width="36">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr><td width="26" height="26" align="center" valign="middle" style="background-color:${MAROON_900};color:${CREAM_100};font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;border-radius:50%;">${n}</td></tr>
                  </table>
                </td>
                <td style="padding:0 0 16px 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:${INK_900};" valign="top">${label}</td>
              </tr>`;

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Inscription — Saint-Gratien FC</title>
</head>
<body style="margin:0;padding:0;background-color:${CREAM_100};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${CREAM_100};">
    Inscription de ${escapeHtml(nomEnfant)} bien reçue — prochaine étape : déposer le dossier signé et une photo.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CREAM_100};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${GOLD_300};">
          <tr>
            <td style="background-color:${MAROON_900};padding:28px 32px;text-align:center;">
              <img src="${siteUrl}/assets/images/logo-96.webp" width="48" height="48" alt="Saint-Gratien FC" style="display:block;margin:0 auto 10px auto;border-radius:8px;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#ffffff;letter-spacing:.02em;">Saint-Gratien FC</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${GOLD_400};text-transform:uppercase;letter-spacing:.12em;margin-top:2px;">Val-d'Oise · École de foot U6-U9</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px 32px;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:22px;color:${INK_900};">Bonjour ${escapeHtml(greetingName(rowFromData(data)))},</p>
              <p style="margin:0 0 20px 0;font-size:15px;line-height:22px;color:${INK_900};">Nous avons bien reçu la demande d'inscription de <strong>${escapeHtml(nomEnfant)}</strong> (${escapeHtml(categorie)}) au Saint-Gratien FC pour la saison ${escapeHtml(saison)}.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${GOLD_100};border-left:4px solid ${GOLD_500};border-radius:8px;margin:0 0 24px 0;">
                <tr>
                  <td style="padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:${INK_900};">
                    <strong style="color:${MAROON_900};">Important :</strong> cette inscription n'est pas encore définitive. Elle sera confirmée une fois les étapes ci-dessous complétées.
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
                ${step(1, `Déposer le <strong>dossier signé</strong> (bouton ci-dessous).`)}
                ${step(2, `Ajouter une <strong>photo de votre enfant</strong>, de face et sur fond blanc (un mur blanc suffit), depuis le même lien.`)}
                ${step(3, `Régler l'adhésion — mode choisi : <strong>${escapeHtml(data.modePaiement)}</strong>.`)}
                ${step(4, `La licence de votre enfant est enregistrée par le club auprès de la Fédération Française de Football (FFF) via la plateforme Footclubs, une fois le dossier complet — généralement sous quelques jours.`)}
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px auto 28px auto;">
                <tr>
                  <td align="center" style="background-color:${GOLD_500};border-radius:8px;">
                    <a href="${depotUrl}" style="display:inline-block;padding:14px 32px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:${MAROON_950};text-decoration:none;">Suivre mon inscription</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 6px 0;font-size:13px;line-height:20px;color:${INK_700};">Des questions ? Répondez directement à cet e-mail ou écrivez-nous à <a href="mailto:contact@saintgratienfc.fr" style="color:${MAROON_900};">contact@saintgratienfc.fr</a>.</p>
              <p style="margin:24px 0 0 0;font-size:14px;line-height:20px;color:${INK_900};">Sportivement,<br><strong>Saint-Gratien FC</strong></p>
            </td>
          </tr>
          <tr>
            <td style="background-color:${CREAM_200};padding:20px 32px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:17px;color:${INK_700};text-align:center;">
              Saint-Gratien FC · Stade Robert Lemoine, 75 rue d'Orgemont, Saint-Gratien, Val-d'Oise<br>
              Cet e-mail vous est envoyé suite à votre demande d'inscription sur <a href="${siteUrl}" style="color:${INK_700};">saintgratienfc.fr</a>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: `Inscription de ${nomEnfant} — Saint-Gratien FC (à finaliser)`, html, text };
}

export async function sendConfirmationEmail(env, data, uploadToken, siteUrl) {
  if (!env.BREVO_API_KEY) return; // pas encore configuré côté Brevo, voir CLAUDE.md

  // Lu côté serveur (pas data.saison envoyé par le client) : reste la source de vérité même si le
  // navigateur de la famille avait chargé /api/categories avant un changement de saison entre-temps.
  const { saison } = await getCategoriesConfig(env);
  const { subject, html, text } = buildEmail(data, uploadToken, siteUrl, saison);

  const body = {
    sender: { email: 'contact@saintgratienfc.fr', name: 'Saint-Gratien FC' },
    to: familyRecipients(rowFromData(data)),
    subject,
    htmlContent: html,
    textContent: text,
  };

  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    // best-effort : un échec d'envoi ne doit jamais faire échouer l'inscription
  }
}

// Notifie le club (jusqu'ici seule la famille recevait un e-mail, voir sendConfirmationEmail
// ci-dessus) : sans ça, le club ne sait qu'une nouvelle inscription est arrivée qu'en consultant
// /admin/inscriptions manuellement. Volontairement simple (texte brut, pas le template habillé
// ci-dessus) — usage interne, pas une communication destinée à une famille.
export async function sendAdminNotification(env, data, siteUrl) {
  if (!env.BREVO_API_KEY) return;

  // Destinataire(s) configurable(s) depuis /admin/parametres (par défaut contact@saintgratienfc.fr,
  // voir _shared/settings-kv.js) — utile si plusieurs personnes du bureau veulent la recevoir.
  const notificationEmail = await getNotificationEmail(env);
  const to = notificationEmail.split(',').map((e) => ({ email: e.trim() })).filter((r) => r.email);
  if (!to.length) return;

  const nomEnfant = `${data.enfantPrenom} ${data.enfantNom}`;
  const categorie = formatCategorie(data.categorie);
  const text = `Nouvelle inscription reçue sur le site :

Enfant : ${nomEnfant} (${categorie})
Naissance : ${data.naissance}
Parent : ${data.parentPrenom} ${data.parentNom}
E-mail : ${data.email}
Téléphone : ${data.telephone || '—'}${
    data.parent2Prenom || data.parent2Nom
      ? `\n2e responsable légal : ${data.parent2Prenom || ''} ${data.parent2Nom || ''} — ${data.parent2Email || 'pas d’e-mail'} — ${data.parent2Telephone || 'pas de téléphone'}`
      : ''
  }
Mode de paiement : ${data.modePaiement}

Voir le détail : ${siteUrl}/admin/inscriptions`;

  const body = {
    sender: { email: 'contact@saintgratienfc.fr', name: 'Saint-Gratien FC — Site' },
    to,
    subject: `Nouvelle inscription : ${nomEnfant}`,
    textContent: text,
  };

  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    // best-effort : un échec d'envoi ne doit jamais faire échouer l'inscription
  }
}

// Relance d'une inscription incomplète (dossier, photo et/ou paiement manquants) : manuelle depuis
// /admin/inscriptions ou la fiche, ou automatique (runReminders dans _shared/automations.js).
// Chaque étape manquante a sa carte avec un bouton qui mène droit au bon endroit (page de suivi
// /depot/<token>#dossier|#photo, lien HelloAsso de la catégorie), les étapes validées restent
// visibles en vert pour montrer l'avancement. Même habillage que buildEmail() ci-dessus (dupliqué,
// voir la note en tête de fichier).
const STADE_MAPS_URL = 'https://www.google.com/maps/search/?api=1&query=Stade+Robert+Lemoine+75+rue+d%27Orgemont+95210+Saint-Gratien';

function buildReminderEmail(row, siteUrl, { helloAssoUrl = '', prix = null } = {}) {
  const nomEnfant = `${row.enfant_prenom} ${row.enfant_nom}`;
  const prenom = row.enfant_prenom;
  const categorie = formatCategorie(row.categorie);
  const suiviUrl = row.upload_token ? `${siteUrl}/depot/${row.upload_token}` : null;
  const mode = row.mode_paiement || '';
  const payOnline = mode === 'HelloAsso' && /^https:\/\//.test(helloAssoUrl);
  const prixText = prix ? `${prix} € (ou 3 × ${Math.round((prix / 3) * 100) / 100} € sans frais sur HelloAsso)` : '';

  const dossier = dossierStatus(row);
  const motifs = refusMotifs(row);
  const steps = [
    {
      key: 'dossier',
      ok: dossier === 'valide',
      // Déposé, en attente de vérification par le club : rien à faire pour la famille.
      pending: dossier === 'a_verifier',
      title: 'Dossier signé',
      text:
        dossier === 'refuse'
          ? `Le dossier reçu n'a pas pu être validé${motifs.length ? ` : ${motifs.join(' ')}` : '.'} Complétez-le puis déposez-le à nouveau.`
          : "Imprimez le dossier d'inscription, remplissez le lieu et la date, signez-le, puis déposez-le : un scan ou une simple photo du document suffit.",
      cta: suiviUrl && { label: dossier === 'refuse' ? 'Déposer le dossier corrigé' : 'Déposer le dossier', url: `${suiviUrl}#dossier` },
      alt: suiviUrl && { intro: "Vous n'avez plus le dossier ?", label: 'Le retélécharger', url: `${suiviUrl}?telecharger=1#dossier` },
    },
    {
      key: 'photo',
      ok: Boolean(row.photo_uploaded_at),
      title: `Photo de ${prenom}`,
      text: `De face, sur un fond blanc (un mur blanc fait parfaitement l'affaire), bien éclairée et sans casquette. Une photo prise avec un téléphone convient très bien. Elle reste réservée au club.`,
      cta: suiviUrl && { label: 'Ajouter la photo', url: `${suiviUrl}#photo` },
    },
    {
      key: 'paiement',
      ok: Boolean(row.paye),
      title: "Paiement de l'adhésion",
      text: payOnline
        ? `Vous avez choisi de régler en ligne avec HelloAsso (carte bancaire)${prixText ? ` : ${prixText}` : ''}.`
        : `${mode ? `Vous avez choisi de régler par ${mode.toLowerCase()}${prix ? ` (${prix} €)` : ''} : ` : ''}à remettre à un responsable du club, par exemple lors d'un entraînement, le jeudi de 17h à 18h au Stade Robert Lemoine.`,
      cta: payOnline && { label: 'Payer sur HelloAsso', url: helloAssoUrl },
      alt: suiviUrl && {
        intro: mode === 'HelloAsso' ? 'Vous préférez régler en espèces ou par chèque ?' : 'Vous préférez payer en ligne par carte (en 3 fois sans frais possible) ?',
        label: 'Changer de mode de paiement',
        url: `${suiviUrl}#paiement`,
      },
    },
  ];
  const missing = steps.filter((s) => !s.ok && !s.pending);
  const done = steps.filter((s) => s.ok).length;
  const percent = Math.round((done / steps.length) * 100);
  const remaining = missing.length > 1 ? `il reste ${missing.length} étapes` : 'il reste une seule étape';

  const text = `Bonjour ${greetingName(row)},

Petit rappel concernant l'inscription de ${nomEnfant} (${categorie}) au Saint-Gratien FC : ${remaining} pour la finaliser${done ? ` (${done} sur 3 déjà validée${done > 1 ? 's' : ''})` : ''}.

${missing
  .map((s) => `• ${s.title}\n  ${s.text}${s.cta ? `\n  ${s.cta.label} : ${s.cta.url}` : ''}${s.alt ? `\n  ${s.alt.intro} ${s.alt.label} : ${s.alt.url}` : ''}`)
  .join('\n\n')}
${steps.some((s) => s.pending) ? '\nLe dossier signé est bien reçu : le club le vérifie en ce moment, rien à faire de votre côté pour cette étape.\n' : ''}${suiviUrl ? `\nSuivre l'inscription et déposer vos documents : ${suiviUrl}\n` : ''}
Infos pratiques
- Entraînements : le jeudi de 17h à 18h
- Stade Robert Lemoine, 75 rue d'Orgemont, Saint-Gratien : ${STADE_MAPS_URL}
- Ce qu'il faut prévoir : ${siteUrl}/entrainements.html

Des questions ? Répondez à cet e-mail ou écrivez-nous à contact@saintgratienfc.fr.

Sportivement,
Saint-Gratien FC`;

  const button = (cta, primary) => `
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 0 0;">
                        <tr>
                          <td align="center" style="background-color:${primary ? GOLD_500 : MAROON_900};border-radius:8px;">
                            <a href="${escapeHtml(cta.url)}" target="_blank" style="display:inline-block;padding:11px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:${primary ? MAROON_950 : '#ffffff'};text-decoration:none;">${escapeHtml(cta.label)} &rarr;</a>
                          </td>
                        </tr>
                      </table>`;

  let n = 0;
  const stepsHtml = steps
    .map((s) => {
      if (s.ok) {
        return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px 0;background-color:${GREEN_100};border-radius:10px;">
                <tr>
                  <td width="44" valign="middle" style="padding:12px 0 12px 16px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="26" height="26" align="center" valign="middle" style="background-color:${GREEN_700};color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;border-radius:50%;">&#10003;</td></tr></table>
                  </td>
                  <td valign="middle" style="padding:12px 16px 12px 10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${GREEN_700};"><strong>${escapeHtml(s.title)}</strong></td>
                  <td align="right" valign="middle" style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;color:${GREEN_700};">Validé</td>
                </tr>
              </table>`;
      }
      if (s.pending) {
        return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px 0;background-color:${CREAM_100};border-radius:10px;">
                <tr>
                  <td valign="middle" style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${INK_900};"><strong>${escapeHtml(s.title)}</strong><br><span style="font-size:13px;color:${INK_700};">Bien reçu, en cours de vérification par le club.</span></td>
                  <td align="right" valign="middle" style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;color:#8a4b12;white-space:nowrap;">En vérification</td>
                </tr>
              </table>`;
      }
      n++;
      return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px 0;background-color:#ffffff;border:1px solid ${GOLD_300};border-left:4px solid ${GOLD_500};border-radius:10px;">
                <tr>
                  <td width="44" valign="top" style="padding:16px 0 16px 16px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="26" height="26" align="center" valign="middle" style="background-color:${MAROON_900};color:${CREAM_100};font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;border-radius:50%;">${n}</td></tr></table>
                  </td>
                  <td valign="top" style="padding:16px 18px 16px 10px;font-family:Arial,Helvetica,sans-serif;">
                    <div style="font-size:15px;line-height:22px;font-weight:bold;color:${MAROON_900};">${escapeHtml(s.title)} <span style="display:inline-block;margin-left:6px;padding:2px 9px;border-radius:999px;background-color:${GOLD_100};color:#8a4b12;font-size:11px;line-height:16px;vertical-align:middle;">À faire</span></div>
                    <div style="margin-top:4px;font-size:13px;line-height:20px;color:${INK_700};">${escapeHtml(s.text)}</div>${s.cta ? button(s.cta, n === 1) : ''}${
                      s.alt
                        ? `
                    <div style="margin-top:12px;font-size:13px;line-height:19px;color:${INK_700};">${escapeHtml(s.alt.intro)} <a href="${escapeHtml(s.alt.url)}" target="_blank" style="color:${MAROON_900};font-weight:bold;">${escapeHtml(s.alt.label)}</a></div>`
                        : ''
                    }
                  </td>
                </tr>
              </table>`;
    })
    .join('');

  const info = (label, value) => `
                <tr>
                  <td valign="top" width="96" style="padding:5px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:${INK_700};text-transform:uppercase;letter-spacing:.06em;">${label}</td>
                  <td valign="top" style="padding:5px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:19px;color:${INK_900};">${value}</td>
                </tr>`;
  const link = (url, label) => `<a href="${escapeHtml(url)}" target="_blank" style="color:${MAROON_900};font-weight:bold;">${label}</a>`;

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Rappel — Saint-Gratien FC</title>
</head>
<body style="margin:0;padding:0;background-color:${CREAM_100};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${CREAM_100};">
    Inscription de ${escapeHtml(nomEnfant)} : ${remaining}, tout se fait en quelques minutes depuis votre page de suivi.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CREAM_100};">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${GOLD_300};">
          <tr>
            <td style="background-color:${MAROON_900};padding:28px 28px 26px 28px;text-align:center;">
              <img src="${siteUrl}/assets/images/logo-96.webp" width="56" height="56" alt="Saint-Gratien FC" style="display:block;margin:0 auto 10px auto;border-radius:8px;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${GOLD_400};text-transform:uppercase;letter-spacing:.14em;">Saint-Gratien FC · Saison ${escapeHtml(row.saison || '')}</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:28px;font-weight:bold;color:#ffffff;margin-top:8px;">Encore un petit effort&nbsp;!</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:${GOLD_300};margin-top:4px;">L'inscription de ${escapeHtml(prenom)} est presque terminée</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 14px 0;font-size:15px;line-height:22px;color:${INK_900};">Bonjour ${escapeHtml(greetingName(row))},</p>
              <p style="margin:0 0 22px 0;font-size:15px;line-height:22px;color:${INK_900};">Petit rappel concernant l'inscription de <strong>${escapeHtml(nomEnfant)}</strong> (${escapeHtml(categorie)}) : ${remaining} pour la finaliser. Tout se fait en quelques minutes, depuis votre téléphone.</p>
              ${
                done
                  ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px 0;">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:${INK_900};">${done} étape${done > 1 ? 's' : ''} validée${done > 1 ? 's' : ''} sur 3</td>
                  <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:${MAROON_900};">${percent}&nbsp;%</td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;background-color:${CREAM_200};border-radius:999px;">
                <tr>
                  <td width="${percent}%" height="8" style="background-color:${GOLD_500};border-radius:999px;font-size:0;line-height:0;">&nbsp;</td>
                  <td height="8" style="font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>`
                  : ''
              }
              ${stepsHtml}
              ${
                suiviUrl
                  ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 26px auto;">
                <tr>
                  <td align="center" style="border:2px solid ${MAROON_900};border-radius:8px;">
                    <a href="${suiviUrl}" target="_blank" style="display:inline-block;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:${MAROON_900};text-decoration:none;">Voir le suivi de mon inscription</a>
                  </td>
                </tr>
              </table>`
                  : '<div style="height:18px;line-height:18px;font-size:0;">&nbsp;</div>'
              }
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;background-color:${CREAM_100};border-radius:10px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:${MAROON_900};text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">Infos pratiques</div>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${info('Quand', 'Le jeudi, de 17h à 18h')}
                      ${info('Où', `Stade Robert Lemoine, 75 rue d'Orgemont, Saint-Gratien<br>${link(STADE_MAPS_URL, 'Voir sur la carte')}`)}
                      ${info('À prévoir', `Tenue adaptée à la météo, stabilisés ou crampons moulés, gourde d'eau — ${link(`${siteUrl}/entrainements.html`, 'tous les détails')}`)}
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 6px 0;font-size:13px;line-height:20px;color:${INK_700};">Des questions ? Répondez directement à cet e-mail ou écrivez-nous à <a href="mailto:contact@saintgratienfc.fr" style="color:${MAROON_900};">contact@saintgratienfc.fr</a>.</p>
              <p style="margin:20px 0 24px 0;font-size:14px;line-height:20px;color:${INK_900};">Sportivement,<br><strong>Saint-Gratien FC</strong></p>
            </td>
          </tr>
          <tr>
            <td style="background-color:${CREAM_200};padding:20px 28px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:18px;color:${INK_700};text-align:center;">
              <a href="https://www.instagram.com/sgfc95" target="_blank" style="color:${MAROON_900};font-weight:bold;text-decoration:none;">Instagram</a> &nbsp;·&nbsp;
              <a href="https://www.facebook.com/SGFootballClub" target="_blank" style="color:${MAROON_900};font-weight:bold;text-decoration:none;">Facebook</a> &nbsp;·&nbsp;
              <a href="${siteUrl}" target="_blank" style="color:${MAROON_900};font-weight:bold;text-decoration:none;">saintgratienfc.fr</a><br>
              Saint-Gratien FC · Stade Robert Lemoine, 75 rue d'Orgemont, Saint-Gratien, Val-d'Oise<br>
              Cet e-mail vous est envoyé suite à votre demande d'inscription.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: `Rappel — inscription de ${nomEnfant} : ${remaining}`, html, text };
}

// Fiches sans jeton de suivi (anciennes inscriptions) : on en crée un au moment d'écrire à la famille,
// sinon l'e-mail ne peut contenir aucun lien vers la page de suivi.
async function ensureUploadToken(env, row) {
  if (row.upload_token || !env.DB || !row.id) return row;
  const token = crypto.randomUUID();
  try {
    await env.DB.prepare('UPDATE inscriptions SET upload_token = ? WHERE id = ? AND upload_token IS NULL').bind(token, row.id).run();
    const fresh = await env.DB.prepare('SELECT upload_token FROM inscriptions WHERE id = ?').bind(row.id).first();
    return { ...row, upload_token: fresh?.upload_token || null };
  } catch {
    return row;
  }
}

// Contrairement à sendConfirmationEmail/sendAdminNotification (best-effort, fire-and-forget via
// waitUntil), l'appelant (functions/admin/inscriptions.js, action=bulk-reminder) a besoin du
// résultat pour compter succès/échecs et l'afficher dans la bannière — donc `await`ée, retourne
// true/false comme sendPasswordChangeCode.
export async function sendReminderEmail(env, row, siteUrl) {
  if (!env.BREVO_API_KEY) return false;
  if (!familyHasActionPending(row)) return false; // complet, ou seul le club a encore quelque chose à vérifier

  const withToken = await ensureUploadToken(env, row);
  const config = await getCategoriesConfig(env);
  const categorie = (config.categories || []).find((c) => c.label === row.categorie);
  const { subject, html, text } = buildReminderEmail(
    { ...withToken, saison: withToken.saison || config.saison },
    siteUrl,
    { helloAssoUrl: categorie?.helloAssoUrl || '', prix: config.prix }
  );
  const body = {
    sender: { email: 'contact@saintgratienfc.fr', name: 'Saint-Gratien FC' },
    to: familyRecipients(row),
    subject,
    htmlContent: html,
    textContent: text,
  };

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Réinscription prioritaire, envoyée depuis /admin/reinscription (sélection multiple → "Envoyer le
// lien de réinscription", action=bulk-reinscription sur functions/admin/inscriptions.js) sur les
// fiches de la saison qui se termine — donne à chaque famille déjà inscrite un lien personnel
// (/reinscription/<token>, voir functions/reinscription/[token].js) pour réserver la place de son
// enfant avant l'ouverture au public. Reprend la même structure visuelle que buildReminderEmail()
// ci-dessus (dupliquée, voir la note en tête de fichier sur le choix de ne pas factoriser ces
// templates). isRappel (bool) : même contenu, wording adapté pour une relance envoyée à une famille
// déjà contactée mais qui n'a pas encore réservé sa place (action=bulk-reinscription-rappel,
// déclenchée à la main par un responsable du club depuis /admin/reinscription, autant de fois que
// nécessaire avant la date limite — pas d'automatisation programmée, voir CLAUDE.md/la discussion
// avec l'utilisateur sur les limites d'infra Cron Trigger pour ce projet).
function buildReinscriptionEmail(row, siteUrl, dateLimiteReinscription, isRappel) {
  const nomEnfant = `${row.enfant_prenom} ${row.enfant_nom}`;
  const lienUrl = `${siteUrl}/reinscription/${row.reinscription_token}`;
  const deadlinePhrase = dateLimiteReinscription
    ? ` avant le ${escapeHtml(dateLimiteReinscription.split('-').reverse().join('/'))}`
    : '';
  const intro = isRappel
    ? `Petit rappel : la place de ${nomEnfant} au Saint-Gratien FC est toujours réservée en priorité pour la saison prochaine, mais nous n'avons pas encore reçu votre confirmation.`
    : `En tant que famille déjà inscrite, ${nomEnfant} bénéficie d'une place prioritaire pour la saison prochaine au Saint-Gratien FC — avant l'ouverture des inscriptions au public.`;

  const text = `Bonjour ${greetingName(row)},

${intro}

Pour réserver sa place${deadlinePhrase}, cliquez sur ce lien personnel (les informations de l'an dernier sont déjà pré-remplies, il ne reste qu'à les vérifier) :
${lienUrl}

Des questions ? Répondez à cet e-mail ou écrivez-nous à contact@saintgratienfc.fr.

Sportivement,
Saint-Gratien FC
Stade Robert Lemoine, 75 rue d'Orgemont, Saint-Gratien`;

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Réinscription prioritaire — Saint-Gratien FC</title>
</head>
<body style="margin:0;padding:0;background-color:${CREAM_100};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${CREAM_100};">
    Réservez la place de ${escapeHtml(nomEnfant)} pour la saison prochaine, en priorité.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CREAM_100};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${GOLD_300};">
          <tr>
            <td style="background-color:${MAROON_900};padding:28px 32px;text-align:center;">
              <img src="${siteUrl}/assets/images/logo-96.webp" width="48" height="48" alt="Saint-Gratien FC" style="display:block;margin:0 auto 10px auto;border-radius:8px;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#ffffff;letter-spacing:.02em;">Saint-Gratien FC</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${GOLD_400};text-transform:uppercase;letter-spacing:.12em;margin-top:2px;">Val-d'Oise · École de foot U6-U9</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px 32px;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:22px;color:${INK_900};">Bonjour ${escapeHtml(greetingName(row))},</p>
              <p style="margin:0 0 20px 0;font-size:15px;line-height:22px;color:${INK_900};">${
                isRappel
                  ? `Petit rappel : la place de <strong>${escapeHtml(nomEnfant)}</strong> est toujours réservée en priorité pour la saison prochaine, mais nous n'avons pas encore reçu votre confirmation.`
                  : `En tant que famille déjà inscrite, <strong>${escapeHtml(nomEnfant)}</strong> bénéficie d'une place prioritaire pour la saison prochaine — avant l'ouverture des inscriptions au public.`
              }</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${GOLD_100};border-left:4px solid ${GOLD_500};border-radius:8px;margin:0 0 24px 0;">
                <tr>
                  <td style="padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:${INK_900};">
                    Réservez sa place${deadlinePhrase} : les informations de l'an dernier sont déjà pré-remplies, il ne reste qu'à les vérifier.
                  </td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px auto 28px auto;">
                <tr>
                  <td align="center" style="background-color:${GOLD_500};border-radius:8px;">
                    <a href="${lienUrl}" style="display:inline-block;padding:14px 32px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:${MAROON_950};text-decoration:none;">${isRappel ? 'Confirmer' : 'Réserver'} la place de ${escapeHtml(row.enfant_prenom)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 6px 0;font-size:13px;line-height:20px;color:${INK_700};">Des questions ? Répondez directement à cet e-mail ou écrivez-nous à <a href="mailto:contact@saintgratienfc.fr" style="color:${MAROON_900};">contact@saintgratienfc.fr</a>.</p>
              <p style="margin:24px 0 0 0;font-size:14px;line-height:20px;color:${INK_900};">Sportivement,<br><strong>Saint-Gratien FC</strong></p>
            </td>
          </tr>
          <tr>
            <td style="background-color:${CREAM_200};padding:20px 32px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:17px;color:${INK_700};text-align:center;">
              Saint-Gratien FC · Stade Robert Lemoine, 75 rue d'Orgemont, Saint-Gratien, Val-d'Oise<br>
              Cet e-mail vous est envoyé suite à votre inscription précédente sur <a href="${siteUrl}" style="color:${INK_700};">saintgratienfc.fr</a>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject: isRappel ? `Rappel — réinscription prioritaire de ${nomEnfant} — Saint-Gratien FC` : `Réinscription prioritaire — ${nomEnfant} — Saint-Gratien FC`,
    html,
    text,
  };
}

// Contrairement à sendConfirmationEmail/sendAdminNotification (best-effort, fire-and-forget via
// waitUntil), l'appelant (functions/admin/inscriptions.js, action=bulk-reinscription(-rappel)) a
// besoin du résultat pour compter succès/échecs et l'afficher dans la bannière — donc `await`ée,
// retourne true/false comme sendReminderEmail. row.reinscription_token doit déjà être généré et
// enregistré avant cet appel (voir onRequestPost dans functions/admin/inscriptions.js).
export async function sendReinscriptionEmail(env, row, siteUrl, dateLimiteReinscription, isRappel = false) {
  if (!env.BREVO_API_KEY) return false;
  if (!row.reinscription_token) return false;

  const { subject, html, text } = buildReinscriptionEmail(row, siteUrl, dateLimiteReinscription, isRappel);
  const body = {
    sender: { email: 'contact@saintgratienfc.fr', name: 'Saint-Gratien FC' },
    to: familyRecipients(row),
    subject,
    htmlContent: html,
    textContent: text,
  };

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Code de double vérification avant un changement de mot de passe admin (voir
// functions/admin/parametres.js et _shared/settings-kv.js). Contrairement aux e-mails ci-dessus,
// un échec d'envoi ici DOIT bloquer le changement — sans lui, personne ne serait informé qu'un
// mot de passe a été modifié. L'appelant vérifie donc le retour (true/false) plutôt que d'ignorer
// l'erreur.
export async function sendPasswordChangeCode(env, code) {
  if (!env.BREVO_API_KEY) return false;

  const to = (await getNotificationEmail(env)).split(',').map((e) => ({ email: e.trim() })).filter((r) => r.email);
  if (!to.length) return false;

  const body = {
    sender: { email: 'contact@saintgratienfc.fr', name: 'Saint-Gratien FC — Site' },
    to,
    subject: 'Code de confirmation — changement de mot de passe admin',
    textContent: `Un changement de mot de passe a été demandé sur l'espace admin de saintgratienfc.fr.\n\nCode de confirmation : ${code}\n\nCe code expire dans 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail — le mot de passe actuel reste inchangé tant que ce code n'a pas été saisi.`,
  };

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// E-mails des automatisations (déclenchés par _shared/automations.js et _shared/helloasso.js).

async function brevoSend(env, body) {
  if (!env.BREVO_API_KEY) return false;
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function clubRecipients(env) {
  return (await getNotificationEmail(env))
    .split(',')
    .map((e) => ({ email: e.trim() }))
    .filter((r) => r.email);
}

const GREEN_100 = '#e3f2e6';
const GREEN_700 = '#2f6b3a';

// Suivi famille : une étape validée par le club (dossier ou photo reçus par e-mail, paiement reçu),
// ou le dossier complet. Récapitule les 3 étapes avec leur état et renvoie vers la page de suivi.
function buildFollowUpEmail(row, siteUrl, { complete, step }) {
  const nomEnfant = `${row.enfant_prenom} ${row.enfant_nom}`;
  const suiviUrl = `${siteUrl}/depot/${row.upload_token}`;
  const dossier = dossierStatus(row);
  // [libellé, état] — état : 'ok' | 'pending' (dossier en vérification) | 'todo' ; STATE_LABELS pour l'affichage.
  const steps = [
    ['Dossier signé', dossier === 'valide' ? 'ok' : dossier === 'a_verifier' ? 'pending' : 'todo'],
    [`Photo de ${row.enfant_prenom}`, row.photo_uploaded_at ? 'ok' : 'todo'],
    ["Paiement de l'adhésion", row.paye ? 'ok' : 'todo'],
  ];
  const STATE_LABELS = { ok: 'Validé', pending: 'En vérification', todo: 'En attente' };
  const remaining = steps.filter(([, state]) => state === 'todo').map(([label]) => label);
  const intro = complete
    ? `Bonne nouvelle : toutes les étapes de l'inscription de ${nomEnfant} sont validées.`
    : {
        dossier: `Nous avons vérifié et validé le dossier signé de ${nomEnfant}, merci !`,
        photo: `Nous avons bien reçu la photo de ${nomEnfant}.`,
        paiement: `Nous avons bien reçu le paiement de l'adhésion de ${nomEnfant}, merci !`,
      }[step];
  // Jamais "inscription définitive" avant la licence FFF (voir CLAUDE.md et buildEmail ci-dessus).
  const next = complete
    ? `Le club enregistre maintenant la licence de ${row.enfant_prenom} auprès de la Fédération Française de Football (FFF) via Footclubs, généralement sous quelques jours : l'inscription sera définitive à ce moment-là.`
    : remaining.length
      ? `Il reste : ${remaining.join(', ')}.`
      : "Le club vérifie encore le dossier signé : nous revenons vers vous dès qu'il est validé.";
  const subject = complete
    ? `Dossier complet — ${nomEnfant} — Saint-Gratien FC`
    : `Inscription de ${nomEnfant} : ${{ dossier: 'dossier signé validé', photo: 'photo reçue', paiement: 'paiement reçu' }[step]}`;

  const text = `Bonjour ${greetingName(row)},

${intro}

${steps.map(([label, state]) => `- ${label} : ${STATE_LABELS[state].toLowerCase()}`).join('\n')}

${next}

Suivre l'inscription : ${suiviUrl}

Des questions ? Répondez à cet e-mail ou écrivez-nous à contact@saintgratienfc.fr.

Sportivement,
Saint-Gratien FC
Stade Robert Lemoine, 75 rue d'Orgemont, Saint-Gratien`;

  const stepRows = steps
    .map(
      ([label, state]) => `
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid ${CREAM_200};font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${INK_900};">${escapeHtml(label)}</td>
                  <td align="right" style="padding:10px 0;border-bottom:1px solid ${CREAM_200};font-family:Arial,Helvetica,sans-serif;"><span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:bold;background-color:${state === 'ok' ? GREEN_100 : GOLD_100};color:${state === 'ok' ? GREEN_700 : '#8a4b12'};">${STATE_LABELS[state]}</span></td>
                </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${CREAM_100};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${CREAM_100};">
    ${escapeHtml(intro)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CREAM_100};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${GOLD_300};">
          <tr>
            <td style="background-color:${MAROON_900};padding:28px 32px;text-align:center;">
              <img src="${siteUrl}/assets/images/logo-96.webp" width="48" height="48" alt="Saint-Gratien FC" style="display:block;margin:0 auto 10px auto;border-radius:8px;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#ffffff;letter-spacing:.02em;">Saint-Gratien FC</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${GOLD_400};text-transform:uppercase;letter-spacing:.12em;margin-top:2px;">Val-d'Oise · École de foot U6-U9</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px 32px;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:22px;color:${INK_900};">Bonjour ${escapeHtml(greetingName(row))},</p>
              <p style="margin:0 0 20px 0;font-size:15px;line-height:22px;color:${INK_900};">${escapeHtml(intro)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">${stepRows}
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${complete ? GREEN_100 : GOLD_100};border-left:4px solid ${complete ? GREEN_700 : GOLD_500};border-radius:8px;margin:0 0 24px 0;">
                <tr>
                  <td style="padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:${INK_900};">${escapeHtml(next)}</td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px auto 28px auto;">
                <tr>
                  <td align="center" style="background-color:${GOLD_500};border-radius:8px;">
                    <a href="${suiviUrl}" style="display:inline-block;padding:14px 32px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:${MAROON_950};text-decoration:none;">Suivre mon inscription</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 6px 0;font-size:13px;line-height:20px;color:${INK_700};">Des questions ? Répondez directement à cet e-mail ou écrivez-nous à <a href="mailto:contact@saintgratienfc.fr" style="color:${MAROON_900};">contact@saintgratienfc.fr</a>.</p>
              <p style="margin:24px 0 0 0;font-size:14px;line-height:20px;color:${INK_900};">Sportivement,<br><strong>Saint-Gratien FC</strong></p>
            </td>
          </tr>
          <tr>
            <td style="background-color:${CREAM_200};padding:20px 32px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:17px;color:${INK_700};text-align:center;">
              Saint-Gratien FC · Stade Robert Lemoine, 75 rue d'Orgemont, Saint-Gratien, Val-d'Oise<br>
              Cet e-mail vous est envoyé suite à votre demande d'inscription sur <a href="${siteUrl}" style="color:${INK_700};">saintgratienfc.fr</a>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

// step : 'dossier' | 'photo' | 'paiement' (ignoré si complete)
export async function sendFollowUpEmail(env, row, siteUrl, { complete = false, step } = {}) {
  if (!row.upload_token) return false;
  const { subject, html, text } = buildFollowUpEmail(row, siteUrl, { complete, step });
  return brevoSend(env, {
    sender: { email: 'contact@saintgratienfc.fr', name: 'Saint-Gratien FC' },
    to: familyRecipients(row),
    subject,
    htmlContent: html,
    textContent: text,
  });
}

// Alerte interne (texte brut, comme sendAdminNotification) : une famille vient de déposer son dossier
// signé ou la photo de l'enfant depuis sa page de suivi.
export async function sendClubUploadAlert(env, row, siteUrl, kind) {
  const to = await clubRecipients(env);
  if (!to.length) return false;
  const nomEnfant = `${row.enfant_prenom} ${row.enfant_nom}`;
  const fiche = `${siteUrl}/admin/inscriptions/${row.id}`;
  return brevoSend(env, {
    sender: { email: 'contact@saintgratienfc.fr', name: 'Saint-Gratien FC — Site' },
    to,
    subject: `${kind === 'photo' ? 'Photo déposée' : 'Dossier signé à vérifier'} : ${nomEnfant}`,
    textContent:
      kind === 'photo'
        ? `La famille de ${nomEnfant} (${formatCategorie(row.categorie)}) vient de déposer la photo de l’enfant en ligne.\n\nVoir la fiche : ${fiche}`
        : `La famille de ${nomEnfant} (${formatCategorie(row.categorie)}) vient de déposer le dossier signé en ligne.\n\nÀ vérifier : signature du responsable légal, lieu et date, document complet et lisible. Puis « Valider » ou « Refuser » sur la fiche (un refus prévient la famille par e-mail) :\n${fiche}#dossier`,
  });
}

// Dossier refusé par le club (functions/admin/inscriptions/[id]/verification.js) : explique à la famille ce
// qui manque et la renvoie vers sa page de suivi pour déposer le dossier corrigé. Ton volontairement
// bienveillant : ce n'est pas un reproche, le dossier est simplement incomplet.
function buildDossierRefusedEmail(row, siteUrl) {
  const nomEnfant = `${row.enfant_prenom} ${row.enfant_nom}`;
  const suiviUrl = `${siteUrl}/depot/${row.upload_token}`;
  const motifs = refusMotifs(row);
  const commentaire = String(row.dossier_refus_commentaire || '').trim();
  const subject = `Dossier de ${nomEnfant} à compléter — Saint-Gratien FC`;
  const intro = `Merci pour l'envoi du dossier d'inscription de ${nomEnfant} ! En le vérifiant, nous avons remarqué qu'il n'est pas encore complet, nous ne pouvons donc pas le valider pour le moment.`;
  const checks = ['Le lieu et la date remplis (« Fait à …, le … »)', 'La signature du responsable légal', 'Le document entier et bien lisible (une photo nette suffit)'];

  const text = `Bonjour ${greetingName(row)},

${intro}

Ce qu'il manque :
${motifs.map((m) => `- ${m}`).join('\n')}${commentaire ? `\n\nPrécision du club : ${commentaire}` : ''}

Avant de le renvoyer, vérifiez :
${checks.map((c) => `- ${c}`).join('\n')}

Déposer le dossier corrigé : ${suiviUrl}#dossier
Vous n'avez plus le dossier ? Le retélécharger : ${suiviUrl}?telecharger=1#dossier

Des questions ? Répondez à cet e-mail ou écrivez-nous à contact@saintgratienfc.fr.

Sportivement,
Saint-Gratien FC
Stade Robert Lemoine, 75 rue d'Orgemont, Saint-Gratien`;

  const bullet = (content, color) => `
                <tr>
                  <td width="22" valign="top" style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:bold;color:${color};">•</td>
                  <td valign="top" style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:${INK_900};">${content}</td>
                </tr>`;

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${CREAM_100};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${CREAM_100};">
    Le dossier de ${escapeHtml(nomEnfant)} est presque bon : il manque ${escapeHtml(motifs[0] ? motifs[0].charAt(0).toLowerCase() + motifs[0].slice(1) : 'un élément')}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CREAM_100};">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${GOLD_300};">
          <tr>
            <td style="background-color:${MAROON_900};padding:28px 28px 26px 28px;text-align:center;">
              <img src="${siteUrl}/assets/images/logo-96.webp" width="56" height="56" alt="Saint-Gratien FC" style="display:block;margin:0 auto 10px auto;border-radius:8px;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${GOLD_400};text-transform:uppercase;letter-spacing:.14em;">Saint-Gratien FC · Dossier d'inscription</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:28px;font-weight:bold;color:#ffffff;margin-top:8px;">Un petit oubli dans le dossier</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:${GOLD_300};margin-top:4px;">Quelques minutes suffisent pour le corriger</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 14px 0;font-size:15px;line-height:22px;color:${INK_900};">Bonjour ${escapeHtml(greetingName(row))},</p>
              <p style="margin:0 0 22px 0;font-size:15px;line-height:22px;color:${INK_900};">${escapeHtml(intro)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px 0;background-color:#fdecea;border-left:4px solid #b3261e;border-radius:10px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#8c1d18;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">Ce qu'il manque</div>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${motifs.map((m) => bullet(escapeHtml(m), '#b3261e')).join('')}
                    </table>${
                      commentaire
                        ? `
                    <div style="margin-top:10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:${INK_900};"><strong>Précision du club :</strong> ${escapeHtml(commentaire)}</div>`
                        : ''
                    }
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px 0;background-color:${CREAM_100};border-radius:10px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:${MAROON_900};text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">Avant de le renvoyer, vérifiez</div>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${checks.map((c) => bullet(escapeHtml(c), GREEN_700)).join('')}
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 12px auto;">
                <tr>
                  <td align="center" style="background-color:${GOLD_500};border-radius:8px;">
                    <a href="${suiviUrl}#dossier" target="_blank" style="display:inline-block;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:${MAROON_950};text-decoration:none;">Déposer le dossier corrigé &rarr;</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px 0;text-align:center;font-size:13px;line-height:19px;color:${INK_700};">Vous n'avez plus le dossier ? <a href="${suiviUrl}?telecharger=1#dossier" target="_blank" style="color:${MAROON_900};font-weight:bold;">Le retélécharger</a></p>
              <p style="margin:0 0 6px 0;font-size:13px;line-height:20px;color:${INK_700};">Des questions ? Répondez directement à cet e-mail ou écrivez-nous à <a href="mailto:contact@saintgratienfc.fr" style="color:${MAROON_900};">contact@saintgratienfc.fr</a>.</p>
              <p style="margin:20px 0 24px 0;font-size:14px;line-height:20px;color:${INK_900};">Sportivement,<br><strong>Saint-Gratien FC</strong></p>
            </td>
          </tr>
          <tr>
            <td style="background-color:${CREAM_200};padding:20px 28px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:18px;color:${INK_700};text-align:center;">
              Saint-Gratien FC · Stade Robert Lemoine, 75 rue d'Orgemont, Saint-Gratien, Val-d'Oise<br>
              Cet e-mail vous est envoyé suite à votre demande d'inscription sur <a href="${siteUrl}" style="color:${INK_700};">saintgratienfc.fr</a>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

// Attendue par l'appelant, qui affiche si l'e-mail est bien parti (true/false).
export async function sendDossierRefusedEmail(env, row, siteUrl) {
  const withToken = await ensureUploadToken(env, row);
  if (!withToken.upload_token) return false;
  const { subject, html, text } = buildDossierRefusedEmail(withToken, siteUrl);
  return brevoSend(env, {
    sender: { email: 'contact@saintgratienfc.fr', name: 'Saint-Gratien FC' },
    to: familyRecipients(withToken),
    subject,
    htmlContent: html,
    textContent: text,
  });
}

// Alerte interne : une famille a changé son mode de paiement depuis sa page de suivi.
export async function sendClubPaymentModeAlert(env, row, siteUrl, previousMode) {
  const to = await clubRecipients(env);
  if (!to.length) return false;
  const nomEnfant = `${row.enfant_prenom} ${row.enfant_nom}`;
  return brevoSend(env, {
    sender: { email: 'contact@saintgratienfc.fr', name: 'Saint-Gratien FC — Site' },
    to,
    subject: `Mode de paiement changé : ${nomEnfant}`,
    textContent: `La famille de ${nomEnfant} (${formatCategorie(row.categorie)}) a changé son mode de paiement : ${previousMode || 'non renseigné'} → ${row.mode_paiement}.\n\nVoir la fiche : ${siteUrl}/admin/inscriptions/${row.id}`,
  });
}

// Paiement HelloAsso reçu mais pas (ou pas entièrement) rattaché à une inscription : à traiter à la main.
export async function sendHelloAssoAlert(env, siteUrl, { orderId, payer, participants, amount, reason }) {
  const to = await clubRecipients(env);
  if (!to.length) return false;
  const montant = Number.isFinite(amount) ? `${(amount / 100).toFixed(2).replace('.', ',')} €` : '—';
  return brevoSend(env, {
    sender: { email: 'contact@saintgratienfc.fr', name: 'Saint-Gratien FC — Site' },
    to,
    subject: `Paiement HelloAsso à rattacher : ${payer?.firstName || ''} ${payer?.lastName || ''}`.trim(),
    textContent: `Un paiement HelloAsso n'a pas pu être rattaché automatiquement à une inscription (${reason}).

Commande n° ${orderId}
Payeur : ${payer?.firstName || ''} ${payer?.lastName || ''} <${payer?.email || '—'}>
Participant(s) : ${participants.join(', ') || '—'}
Montant : ${montant}

À faire : retrouver la fiche dans ${siteUrl}/admin/inscriptions et cliquer sur « Marquer payé ».`,
  });
}

// Récapitulatif hebdomadaire envoyé au club (voir buildWeeklySummary dans _shared/automations.js).
export async function sendWeeklySummary(env, siteUrl, summary) {
  const to = await clubRecipients(env);
  if (!to.length) return false;
  const nouvelles = summary.nouvelles.length
    ? summary.nouvelles.map((n) => `- ${n.name} (${formatCategorie(n.categorie)}) — ${n.complete ? 'complet' : 'à compléter'}`).join('\n')
    : '- aucune';
  return brevoSend(env, {
    sender: { email: 'contact@saintgratienfc.fr', name: 'Saint-Gratien FC — Site' },
    to,
    subject: `Récapitulatif de la semaine — ${summary.nouvelles.length} nouvelle${summary.nouvelles.length > 1 ? 's' : ''} inscription${summary.nouvelles.length > 1 ? 's' : ''}`,
    textContent: `Récapitulatif des inscriptions — saison ${summary.saison}

Nouvelles inscriptions ces 7 derniers jours : ${summary.nouvelles.length}
${nouvelles}

Où en sont les ${summary.total} inscriptions actives :
- Complètes : ${summary.complet}
- Dossier signé à vérifier par le club : ${summary.dossierAVerifier}${summary.dossierAVerifier ? ` (${siteUrl}/admin/inscriptions?dossier=a_verifier)` : ''}
- Dossier signé manquant ou refusé : ${summary.missingDossier}
- Photo manquante : ${summary.missingPhoto}
- Paiement en attente : ${summary.missingPaiement}

Voir les dossiers à compléter : ${siteUrl}/admin/inscriptions?etat=incomplet`,
  });
}
