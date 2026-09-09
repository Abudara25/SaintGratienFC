// Catégories d'âge actives + saison en cours, lues depuis le KV "saintgratienfc_config" (voir
// _shared/settings-kv.js) et gérées depuis /admin/categories. Consommé par assets/js/inscription.js
// pour construire dynamiquement le <select> catégorie, la correspondance année de naissance →
// catégorie et les liens/widgets HelloAsso, sans devoir toucher au code à chaque saison.
import { getCategoriesConfig } from '../_shared/settings-kv.js';

export async function onRequestGet({ env }) {
  const config = await getCategoriesConfig(env);
  const categories = config.categories
    .filter((c) => c.active)
    .map((c) => ({
      id: c.id,
      label: c.label,
      anneeMin: c.anneeMin,
      anneeMax: c.anneeMax,
      helloAssoUrl: c.helloAssoUrl || '',
      helloAssoWidgetUrl: c.helloAssoWidgetUrl || '',
    }));

  return new Response(JSON.stringify({ saison: config.saison, prix: config.prix ?? 180, categories }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
