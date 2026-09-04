// E-mail de RÉCEPTION de l'inscription (pas une confirmation de licence — voir le contenu),
// envoyé via l'API Resend (compte gratuit, domaine saintgratienfc.fr à vérifier chez Resend,
// clé stockée dans le secret Cloudflare Pages RESEND_API_KEY — voir CLAUDE.md). Best-effort :
// n'importe quelle erreur ici ne doit jamais faire échouer l'inscription elle-même, c'est pour
// ça que sendConfirmationEmail() n'est jamais `await`ée directement dans le handler — voir
// `waitUntil()` dans functions/api/inscriptions.js.
const escapeHtml = (str = '') =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CATEGORIE_LABEL = { 'U6 - U7': 'U6-U7', 'U8 - U9': 'U8-U9' };

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
Saint-Gratien FC`;

  const html = `<p>Bonjour ${escapeHtml(data.parentPrenom)},</p>
<p>Nous avons bien reçu la demande d'inscription de <strong>${escapeHtml(nomEnfant)}</strong> (${escapeHtml(categorie)}) au Saint-Gratien FC pour la saison 2026-2027.</p>
<p><strong>Important :</strong> cette inscription n'est pas encore définitive. Elle sera confirmée une fois :</p>
<ol>
  <li>le dossier signé déposé (lien ci-dessous),</li>
  <li>l'adhésion réglée (${escapeHtml(data.modePaiement)}),</li>
  <li>et la licence de votre enfant enregistrée par le club auprès de la Fédération Française de Football (FFF) via la plateforme Footclubs — cette dernière étape est effectuée par le club une fois le dossier complet, généralement sous quelques jours.</li>
</ol>
<p><strong>Prochaine étape :</strong> <a href="${depotUrl}">déposez le dossier signé ici</a>.</p>
<p>Des questions ? Répondez à cet e-mail ou écrivez-nous à contact@saintgratienfc.fr.</p>
<p>Sportivement,<br>Saint-Gratien FC</p>`;

  return { subject: `Inscription de ${nomEnfant} — Saint-Gratien FC (à finaliser)`, html, text };
}

export async function sendConfirmationEmail(env, data, uploadToken, siteUrl) {
  if (!env.RESEND_API_KEY) return; // pas encore configuré côté Resend, voir CLAUDE.md

  const { subject, html, text } = buildEmail(data, uploadToken, siteUrl);
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Saint-Gratien FC <inscription@saintgratienfc.fr>',
        to: data.email,
        reply_to: 'contact@saintgratienfc.fr',
        subject,
        html,
        text,
      }),
    });
  } catch {
    // best-effort : un échec d'envoi ne doit jamais faire échouer l'inscription
  }
}
