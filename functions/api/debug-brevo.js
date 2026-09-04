// Endpoint de diagnostic TEMPORAIRE — à supprimer après usage. Appelle l'API Brevo et renvoie
// la réponse brute (statut + corps) pour diagnostiquer un échec d'envoi silencieux côté
// functions/_shared/confirmation-email.js. Ne renvoie jamais la clé API elle-même.
export async function onRequestGet({ env }) {
  const hasKey = !!env.BREVO_API_KEY;
  if (!hasKey) {
    return new Response(JSON.stringify({ hasKey }), { headers: { 'Content-Type': 'application/json' } });
  }

  let status, body;
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: 'contact@saintgratienfc.fr', name: 'Saint-Gratien FC' },
        to: [{ email: 'a.gherari@hotmail.com', name: 'Test Diagnostic' }],
        subject: 'Diagnostic Brevo',
        htmlContent: '<p>Test diagnostic.</p>',
        textContent: 'Test diagnostic.',
      }),
    });
    status = res.status;
    body = await res.text();
  } catch (e) {
    status = 'fetch-threw';
    body = String(e);
  }

  return new Response(JSON.stringify({ hasKey, status, body }), { headers: { 'Content-Type': 'application/json' } });
}
