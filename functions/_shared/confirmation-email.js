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
const escapeHtml = (str = '') =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CATEGORIE_LABEL = { 'U6 - U7': 'U6-U7', 'U8 - U9': 'U8-U9' };

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

function buildEmail(data, uploadToken, siteUrl) {
  const depotUrl = `${siteUrl}/depot/${uploadToken}`;
  const nomEnfant = `${data.enfantPrenom} ${data.enfantNom}`;
  const categorie = CATEGORIE_LABEL[data.categorie] || data.categorie;

  // Le point important : ne jamais donner l'impression que l'inscription (ou la licence) est
  // déjà acquise. Elle ne l'est qu'une fois le dossier signé déposé, l'adhésion réglée, ET la
  // licence enregistrée par le club auprès de la FFF via Footclubs (démarche faite par le club,
  // pas par la famille, une fois le dossier complet — délai habituel de quelques jours).
  const text = `Bonjour ${data.parentPrenom},

Nous avons bien reçu la demande d'inscription de ${nomEnfant} (${categorie}) au Saint-Gratien FC pour la saison 2026-2027.

Important : cette inscription n'est pas encore définitive. Elle sera confirmée une fois :
1. le dossier signé déposé (lien ci-dessous),
2. l'adhésion réglée (${data.modePaiement}),
3. et la licence de votre enfant enregistrée par le club auprès de la Fédération Française de Football (FFF) via la plateforme Footclubs — cette dernière étape est effectuée par le club une fois le dossier complet, généralement sous quelques jours.

Prochaine étape : déposez le dossier signé ici :
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
    Inscription de ${escapeHtml(nomEnfant)} bien reçue — prochaine étape : déposer le dossier signé.
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
              <p style="margin:0 0 16px 0;font-size:15px;line-height:22px;color:${INK_900};">Bonjour ${escapeHtml(data.parentPrenom)},</p>
              <p style="margin:0 0 20px 0;font-size:15px;line-height:22px;color:${INK_900};">Nous avons bien reçu la demande d'inscription de <strong>${escapeHtml(nomEnfant)}</strong> (${escapeHtml(categorie)}) au Saint-Gratien FC pour la saison 2026-2027.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${GOLD_100};border-left:4px solid ${GOLD_500};border-radius:8px;margin:0 0 24px 0;">
                <tr>
                  <td style="padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:${INK_900};">
                    <strong style="color:${MAROON_900};">Important :</strong> cette inscription n'est pas encore définitive. Elle sera confirmée une fois les 3 étapes ci-dessous complétées.
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
                ${step(1, `Déposer le <strong>dossier signé</strong> (bouton ci-dessous).`)}
                ${step(2, `Régler l'adhésion — mode choisi : <strong>${escapeHtml(data.modePaiement)}</strong>.`)}
                ${step(3, `La licence de votre enfant est enregistrée par le club auprès de la Fédération Française de Football (FFF) via la plateforme Footclubs, une fois le dossier complet — généralement sous quelques jours.`)}
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px auto 28px auto;">
                <tr>
                  <td align="center" style="background-color:${GOLD_500};border-radius:8px;">
                    <a href="${depotUrl}" style="display:inline-block;padding:14px 32px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:${MAROON_950};text-decoration:none;">Déposer le dossier signé</a>
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

  const { subject, html, text } = buildEmail(data, uploadToken, siteUrl);
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: 'contact@saintgratienfc.fr', name: 'Saint-Gratien FC' },
        to: [{ email: data.email, name: `${data.parentPrenom} ${data.parentNom}` }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });
  } catch {
    // best-effort : un échec d'envoi ne doit jamais faire échouer l'inscription
  }
}
