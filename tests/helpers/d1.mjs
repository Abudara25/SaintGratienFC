// Base D1 simulée pour les tests : même interface que le binding Cloudflare (prepare/bind/first/all/run),
// sur une base SQLite en mémoire (node:sqlite) — les vraies requêtes SQL du projet sont donc exécutées.
import { DatabaseSync } from 'node:sqlite';

export function createD1() {
  const sqlite = new DatabaseSync(':memory:');
  const statement = (sql, params = []) => ({
    bind: (...args) => statement(sql, args),
    first: async () => sqlite.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    run: async () => {
      const info = sqlite.prepare(sql).run(...params);
      return { meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
    },
  });
  return { prepare: (sql) => statement(sql) };
}

export function createKV(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => void store.set(key, value),
    delete: async (key) => void store.delete(key),
    store,
  };
}
