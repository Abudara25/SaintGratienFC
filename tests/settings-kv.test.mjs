import test from 'node:test';
import assert from 'node:assert/strict';
import { getCategoriesConfig, DEFAULT_CATEGORIES_CONFIG } from '../functions/_shared/settings-kv.js';
import { createKV } from './helpers/d1.mjs';

const categories = [{ id: 'u6-u7', label: 'U6 - U7', anneeMin: 2020, anneeMax: 2021, active: true }];

test('getCategoriesConfig : jamais de saison vide', async () => {
  assert.equal((await getCategoriesConfig({ INSCRIPTION_STATUS: createKV() })).saison, DEFAULT_CATEGORIES_CONFIG.saison);

  for (const stored of [{ categories }, { categories, saison: '' }, { categories, saison: '   ' }]) {
    const config = await getCategoriesConfig({ INSCRIPTION_STATUS: createKV({ categories_config: JSON.stringify(stored) }) });
    assert.equal(config.saison, DEFAULT_CATEGORIES_CONFIG.saison);
    assert.equal(config.prix, DEFAULT_CATEGORIES_CONFIG.prix);
    assert.deepEqual(config.categories, categories);
  }

  const saved = await getCategoriesConfig({ INSCRIPTION_STATUS: createKV({ categories_config: JSON.stringify({ categories, saison: '2027-2028', prix: 200 }) }) });
  assert.equal(saved.saison, '2027-2028');
  assert.equal(saved.prix, 200);
});
