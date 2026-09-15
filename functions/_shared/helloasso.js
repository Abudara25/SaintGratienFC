// Validation automatique des paiements HelloAsso (appelée par functions/api/helloasso-notification.js).
// HelloAsso ne signe pas ses notifications (vérifié dans la documentation développeur le 2026-09-15) :
// l'URL enregistrée chez HelloAsso contient un secret (HELLOASSO_WEBHOOK_SECRET), et si les identifiants
// API HELLOASSO_CLIENT_ID/HELLOASSO_CLIENT_SECRET sont configurés, la commande est relue auprès de l'API
// HelloAsso (GET /v5/orders/{id}) plutôt que de faire confiance au contenu reçu.
// Rattachement : formulaire HelloAsso d'une catégorie (liens de /admin/categories), puis fiche non payée
// de la saison dont le nom de l'enfant correspond au participant — l'e-mail du payeur départage ou,
// pour une commande d'un seul participant, suffit s'il ne désigne qu'une fiche. Sinon, alerte au club.
import { ensureInscriptionsTable, normalize } from './inscriptions-db.js';
import { getCategoriesConfig } from './settings-kv.js';
import { sendHelloAssoAlert } from './confirmation-email.js';
import { afterInscriptionChange } from './automations.js';

// Une ligne par commande traitée : évite de traiter deux fois une notification renvoyée par HelloAsso,
// et garde une trace de ce qui n'a pas pu être rattaché.
async function ensureOrdersTable(db) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS helloasso_orders (
        order_id TEXT PRIMARY KEY,
        received_at TEXT NOT NULL DEFAULT (datetime('now')),
        status TEXT NOT NULL,
        inscription_ids TEXT,
        payer_email TEXT,
        detail TEXT
      )`
    )
    .run();
}

async function fetchVerifiedOrder(env, orderId) {
  const tokenRes = await fetch('https://api.helloasso.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.HELLOASSO_CLIENT_ID, client_secret: env.HELLOASSO_CLIENT_SECRET }),
  });
  if (!tokenRes.ok) throw new Error(`HelloAsso token ${tokenRes.status}`);
  const { access_token: accessToken } = await tokenRes.json();
  const orderRes = await fetch(`https://api.helloasso.com/v5/orders/${encodeURIComponent(orderId)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!orderRes.ok) throw new Error(`HelloAsso order ${orderRes.status}`);
  return orderRes.json();
}

// ".../adhesions/adhesion-u6-u7-saint-gratien-fc-2026-2027" (ou ".../widget") → "adhesion-u6-u7-saint-gratien-fc-2026-2027"
const formSlugs = (categories) =>
  new Set(
    categories
      .flatMap((c) => [c.helloAssoUrl, c.helloAssoWidgetUrl])
      .filter(Boolean)
      .map((url) => url.replace(/\/widget\/?$/, '').replace(/\/+$/, '').split('/').pop())
  );

const isPaid = (order) =>
  (order.payments || []).some((p) => p.state === 'Authorized' || p.state === 'Registered') || (order.items || []).some((i) => i.state === 'Processed');

const cleanName = (value) => normalize(value).replace(/[^a-z0-9]+/g, ' ').trim();
const sameName = (row, user) => Boolean(user) && cleanName(row.enfant_prenom) === cleanName(user.firstName) && cleanName(row.enfant_nom) === cleanName(user.lastName);
const sameEmail = (row, email) => Boolean(email) && [row.email, row.parent2_email].some((e) => e && normalize(e) === normalize(email));

export async function processHelloAssoOrder(env, data, siteUrl, waitUntil) {
  const orderId = String(data?.id || '');
  if (!orderId) return { status: 'ignored', reason: 'commande sans identifiant' };

  await ensureInscriptionsTable(env.DB);
  await ensureOrdersTable(env.DB);
  if (await env.DB.prepare('SELECT order_id FROM helloasso_orders WHERE order_id = ?').bind(orderId).first()) {
    return { status: 'duplicate' };
  }

  const verified = Boolean(env.HELLOASSO_CLIENT_ID && env.HELLOASSO_CLIENT_SECRET);
  const order = verified ? await fetchVerifiedOrder(env, orderId) : data;
  const record = (status, ids, detail) =>
    env.DB.prepare('INSERT INTO helloasso_orders (order_id, status, inscription_ids, payer_email, detail) VALUES (?, ?, ?, ?, ?)')
      .bind(orderId, status, ids.join(','), order.payer?.email || null, detail)
      .run();

  const { saison, categories } = await getCategoriesConfig(env);
  if (!formSlugs(categories).has(order.formSlug)) {
    await record('ignored', [], `formulaire ${order.formSlug || 'inconnu'}`);
    return { status: 'ignored', reason: 'formulaire hors adhésions' };
  }
  // Pas encore payée : rien n'est enregistré, pour qu'une notification ultérieure puisse la traiter.
  if (!isPaid(order)) return { status: 'unpaid' };

  const { results } = await env.DB.prepare('SELECT * FROM inscriptions WHERE archived_at IS NULL AND paye = 0').all();
  const candidates = results.filter((r) => !r.saison || r.saison === saison);
  const participants = (order.items || []).filter((i) => i.user && !i.isCanceled).map((i) => i.user);
  const people = participants.length ? participants : [order.payer];
  const payerEmail = order.payer?.email;

  const matched = [];
  for (const user of people) {
    const pool = candidates.filter((r) => !matched.includes(r));
    const byName = pool.filter((r) => sameName(r, user));
    const byNameAndEmail = byName.filter((r) => sameEmail(r, payerEmail));
    const byEmail = pool.filter((r) => sameEmail(r, payerEmail));
    const pick =
      byNameAndEmail.length === 1 ? byNameAndEmail[0] : byName.length === 1 ? byName[0] : people.length === 1 && byEmail.length === 1 ? byEmail[0] : null;
    if (pick) matched.push(pick);
  }

  for (const row of matched) {
    await env.DB.prepare('UPDATE inscriptions SET paye = 1, helloasso_order_id = ? WHERE id = ?').bind(orderId, row.id).run();
    const task = afterInscriptionChange(env, { id: row.id, before: row, step: 'paiement', source: 'helloasso', siteUrl });
    if (waitUntil) waitUntil(task);
    else await task;
  }

  const status = !matched.length ? 'unmatched' : matched.length < people.length ? 'partial' : 'matched';
  await record(status, matched.map((r) => r.id), verified ? "vérifiée via l'API HelloAsso" : 'non vérifiée (identifiants API absents)');

  if (status !== 'matched') {
    const alert = sendHelloAssoAlert(env, siteUrl, {
      orderId,
      payer: order.payer,
      participants: people.map((u) => `${u?.firstName || ''} ${u?.lastName || ''}`.trim()),
      amount: order.amount?.total,
      reason: status === 'partial' ? 'une partie des participants seulement a été reconnue' : 'aucune inscription correspondante trouvée',
    });
    if (waitUntil) waitUntil(alert);
    else await alert;
  }

  return { status, matched: matched.map((r) => r.id) };
}
