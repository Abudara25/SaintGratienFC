// E-mail de RÉCEPTION de l'inscription (pas une confirmation de licence — voir le contenu),
// envoyé via l'API Brevo (compte gratuit, français — préféré à Resend, une entreprise
// américaine, à la demande de l'utilisateur ; clé stockée dans le secret Cloudflare Pages
// BREVO_API_KEY — voir CLAUDE.md). Best-effort : n'importe quelle erreur ici ne doit jamais
// faire échouer l'inscription elle-même, c'est pour ça que sendConfirmationEmail() n'est jamais
// `await`ée directement dans le handler — voir `waitUntil()` dans functions/api/inscriptions.js.
// Expéditeur `contact@saintgratienfc.fr` (déjà vérifié côté Brevo) plutôt que `inscription@` :
// l'authentification complète du domaine (DKIM) est bloquée tant que les 2 enregistrements
// CNAME fournis par Brevo n'ont pas été ajoutés côté Infomaniak (qui héberge saintgratienfc.fr
// et détient déjà `_domainkey.saintgratienfc.fr` en délégation NS — Cloudflare ne peut pas
// servir de sous-enregistrements sous une zone déléguée ailleurs). Voir CLAUDE.md.
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
