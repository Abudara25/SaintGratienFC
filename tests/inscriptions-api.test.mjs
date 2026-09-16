import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/inscriptions.js';
import { fixture, validData, synchronizeReads } from './helpers/inscriptions.mjs';

async function submit(env, data = validData, tasks = []) {
  return onRequestPost({
    request: new Request('https://saintgratienfc.fr/api/inscriptions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': crypto.randomUUID() },
      body: JSON.stringify(data),
    }),
    env, waitUntil: (task) => tasks.push(task),
  });
}

test('API : dates impossibles, dates futures et choix falsifiés refusés sans écriture', async () => {
  const env = await fixture();
  for (const patch of [
    { naissance: '2020-99-99' }, { naissance: '2020-02-30' }, { naissance: '2019-02-29' },
    { naissance: '2020-04-31' }, { naissance: '2999-01-01' }, { naissance: '2020-2-01' },
    { tailleMaillot: 'inconnue' }, { modePaiement: 'gratuit' },
  ]) {
    const response = await submit(env, { ...validData, ...patch });
    assert.equal(response.status, 400, JSON.stringify(patch));
  }
  assert.equal((await submit(env, [])).status, 400);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM inscriptions').first()).n, 0);
});

test('API : une date bissextile valide est enregistrée, saison imposée par le serveur', async () => {
  const env = await fixture();
  const tasks = [];
  const response = await submit(env, { ...validData, saison: '2099-2100' }, tasks);
  await Promise.all(tasks);
  assert.equal(response.status, 200);
  const body = await response.json();
  const row = await env.DB.prepare('SELECT * FROM inscriptions').first();
  assert.equal(row.naissance, '2020-02-29');
  assert.equal(row.saison, '2026-2027');
  assert.equal(row.upload_token, body.uploadToken);
});

test('API : deux envois simultanés ne créent qu’une fiche et le doublon ne révèle pas le jeton', { timeout: 5000 }, async (t) => {
  const env = await fixture();
  synchronizeReads(t, env.DB, /^SELECT upload_token, created_at, naissance, saison/);
  const tasks = [];
  const responses = await Promise.all([
    submit(env, validData, tasks),
    submit(env, { ...validData, enfantPrenom: 'LEA', email: 'PARENT@example.fr' }, tasks),
  ]);
  await Promise.all(tasks);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM inscriptions').first()).n, 1);
  const duplicate = await responses.find((r) => r.status === 409).json();
  assert.equal(duplicate.duplicate, true);
  assert.equal('uploadToken' in duplicate, false);
});

test('API : une même identité reste autorisée à la saison suivante', async () => {
  const env = await fixture();
  const tasks = [];
  assert.equal((await submit(env, validData, tasks)).status, 200);
  const { DEFAULT_CATEGORIES_CONFIG } = await import('../functions/_shared/settings-kv.js');
  await env.INSCRIPTION_STATUS.put('categories_config', JSON.stringify({ ...DEFAULT_CATEGORIES_CONFIG, saison: '2027-2028' }));
  assert.equal((await submit(env, validData, tasks)).status, 200);
  await Promise.all(tasks);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM inscriptions').first()).n, 2);
});
