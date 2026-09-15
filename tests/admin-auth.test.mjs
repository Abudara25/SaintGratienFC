import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COOKIE_NAME,
  verifyAdminPassword,
  setAdminPasswordHash,
  isAuthed,
  createSession,
  destroySession,
  revokeAllSessions,
  handleLogin,
} from '../functions/_shared/admin-auth.js';
import { hashPassword, isPasswordHash } from '../functions/_shared/security.js';
import { createD1, createKV } from './helpers/d1.mjs';

// Un seul environnement pour tout le fichier : les tables sont créées une fois par module.
const env = { DB: createD1(), INSCRIPTION_STATUS: createKV(), ADMIN_PASSWORD: 'secret-cloudflare' };

const sessionCookie = (setCookies) => setCookies.find((c) => c.startsWith(`${COOKIE_NAME}=`)).split(';')[0];
const requestWith = (cookie, ip = '203.0.113.7') =>
  new Request('https://saintgratienfc.fr/admin/inscriptions', { headers: { Cookie: cookie || '', 'CF-Connecting-IP': ip } });
const loginForm = (password) => {
  const form = new FormData();
  form.set('password', password);
  return form;
};

test('mot de passe : secret Cloudflare, puis KV haché, puis ancienne valeur en clair migrée', async () => {
  assert.equal(await verifyAdminPassword(env, 'secret-cloudflare'), true);
  assert.equal(await verifyAdminPassword(env, 'Secret-cloudflare'), false);
  assert.equal(await verifyAdminPassword(env, ''), false);

  await setAdminPasswordHash(env, await hashPassword('nouveau-mdp-2026'));
  assert.equal(await verifyAdminPassword(env, 'nouveau-mdp-2026'), true);
  assert.equal(await verifyAdminPassword(env, 'secret-cloudflare'), false);

  await env.INSCRIPTION_STATUS.put('admin_password', 'ancien-en-clair');
  assert.equal(await verifyAdminPassword(env, 'ancien-en-clair'), true);
  assert.ok(isPasswordHash(await env.INSCRIPTION_STATUS.get('admin_password')));
  assert.equal(await verifyAdminPassword(env, 'ancien-en-clair'), true);

  await env.INSCRIPTION_STATUS.delete('admin_password');
});

test('sessions : le cookie ne contient qu’un jeton, révocable', async () => {
  assert.equal(await isAuthed(requestWith(''), env), false);
  assert.equal(await isAuthed(requestWith(`${COOKIE_NAME}=inventé`), env), false);
  // l'ancien cookie contenant le mot de passe n'ouvre plus rien
  assert.equal(await isAuthed(requestWith('admin_auth=secret-cloudflare'), env), false);

  const cookies = await createSession(env);
  const cookie = sessionCookie(cookies);
  assert.ok(!cookie.includes('secret-cloudflare'));
  assert.ok(cookies.some((c) => c.startsWith('admin_auth=;') && c.includes('Max-Age=0')));
  assert.equal(await isAuthed(requestWith(`autre=1; ${cookie}`), env), true);

  const cleared = await destroySession(requestWith(cookie), env);
  assert.ok(cleared.every((c) => c.includes('Max-Age=0')));
  assert.equal(await isAuthed(requestWith(cookie), env), false);

  const second = sessionCookie(await createSession(env));
  const third = sessionCookie(await createSession(env));
  await revokeAllSessions(env);
  assert.equal(await isAuthed(requestWith(second), env), false);
  assert.equal(await isAuthed(requestWith(third), env), false);
});

test('connexion : 5 échecs bloquent la connexion 15 minutes, par adresse IP', async () => {
  const ok = await handleLogin(requestWith('', '198.51.100.1'), env, loginForm('secret-cloudflare'));
  assert.equal(ok.status, 302);
  const cookie = sessionCookie(ok.headers.getSetCookie());
  assert.equal(await isAuthed(requestWith(cookie), env), true);

  for (let i = 0; i < 5; i++) {
    const res = await handleLogin(requestWith('', '198.51.100.2'), env, loginForm('mauvais'));
    assert.equal(res.status, 401);
  }
  const blocked = await handleLogin(requestWith('', '198.51.100.2'), env, loginForm('secret-cloudflare'));
  assert.equal(blocked.status, 429);
  assert.match(await blocked.text(), /Trop de tentatives/);

  // une autre connexion n'est pas bloquée
  const other = await handleLogin(requestWith('', '198.51.100.3'), env, loginForm('secret-cloudflare'));
  assert.equal(other.status, 302);
});
