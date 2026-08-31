// Lit l'état ouvert/fermé des inscriptions depuis le KV "saintgratienfc_config"
// (clé "inscription_status", modifiable directement dans le dashboard Cloudflare).
export async function onRequestGet({ env }) {
  let status = 'open';
  try {
    const value = await env.INSCRIPTION_STATUS.get('inscription_status');
    if (value === 'open' || value === 'closed') status = value;
  } catch (e) {
    // KV indisponible : on reste sur "open" par défaut.
  }

  return new Response(JSON.stringify({ status }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
