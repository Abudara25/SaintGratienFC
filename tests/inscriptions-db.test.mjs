import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureInscriptionsTable,
  resetSchemaCacheForTests,
  findExistingInscription,
  findCurrentSeasonSubmission,
  buildDedupKey,
  normalize,
  isInscriptionComplete,
} from '../functions/_shared/inscriptions-db.js';
import { createD1 } from './helpers/d1.mjs';

test('normalize retire accents, casse et espaces', () => {
  assert.equal(normalize('  Léa '), 'lea');
  assert.equal(normalize('ÉLODIE'), 'elodie');
  assert.equal(normalize(null), '');
});

test('buildDedupKey : même enfant malgré accents et majuscules', () => {
  const a = buildDedupKey({ enfantPrenom: 'Léa', enfantNom: 'Durand', email: 'Parent@Exemple.fr' });
  const b = buildDedupKey({ enfantPrenom: 'LEA', enfantNom: ' durand', email: 'parent@exemple.fr ' });
  assert.equal(a, b);
  assert.notEqual(a, buildDedupKey({ enfantPrenom: 'Léo', enfantNom: 'Durand', email: 'parent@exemple.fr' }));
});

test('isInscriptionComplete = dossier + paiement + photo', () => {
  const complete = { dossier_uploaded_at: '2026-09-15 10:00:00', paye: 1, photo_uploaded_at: '2026-09-15 10:05:00' };
  assert.equal(isInscriptionComplete(complete), true);
  assert.equal(isInscriptionComplete({ ...complete, paye: 0 }), false);
  assert.equal(isInscriptionComplete({ ...complete, photo_uploaded_at: null }), false);
  assert.equal(isInscriptionComplete({ ...complete, dossier_uploaded_at: null }), false);
});

async function insert(db, values) {
  const row = {
    enfant_prenom: 'Léa',
    enfant_nom: 'Durand',
    naissance: '2020-04-02',
    categorie: 'U6 - U7',
    taille_maillot: '6 ans',
    parent_prenom: 'Samia',
    parent_nom: 'Durand',
    email: 'parent@exemple.fr',
    autorisation: 1,
    droit_image: 0,
    rgpd: 1,
    saison: '2026-2027',
    upload_token: 'jeton-1',
    ...values,
  };
  row.dedup_key = buildDedupKey({ enfantPrenom: row.enfant_prenom, enfantNom: row.enfant_nom, email: row.email });
  const columns = Object.keys(row);
  await db
    .prepare(`INSERT INTO inscriptions (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .bind(...Object.values(row))
    .run();
}

test('migrations puis anti-doublon limité à la saison', async () => {
  resetSchemaCacheForTests();
  const db = createD1();
  await ensureInscriptionsTable(db);
  await ensureInscriptionsTable(db); // deuxième appel : aucune migration rejouée, aucune erreur

  await insert(db, {});
  await insert(db, { upload_token: 'jeton-ancien', saison: '2025-2026', naissance: '2019-01-01' });

  const identity = { enfantPrenom: 'LÉA', enfantNom: 'durand', email: 'PARENT@exemple.fr' };
  const found = await findExistingInscription(db, { ...identity, naissance: '2020-04-02' }, '2026-2027');
  assert.equal(found.upload_token, 'jeton-1');
  assert.equal(await findExistingInscription(db, { ...identity, naissance: '2020-05-02' }, '2026-2027'), null);
  assert.equal((await findExistingInscription(db, identity, '2025-2026')).upload_token, 'jeton-ancien');
  assert.equal(await findExistingInscription(db, { ...identity, naissance: '2020-04-02' }, '2027-2028'), null);

  assert.equal(await findCurrentSeasonSubmission(db, { ...identity, naissance: '2020-04-02' }, '2026-2027'), true);
  assert.equal(await findCurrentSeasonSubmission(db, { ...identity, naissance: '2020-04-02' }, '2027-2028'), false);
});
