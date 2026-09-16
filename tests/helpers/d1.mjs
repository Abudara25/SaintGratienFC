// Base D1 simulée pour les tests : même interface que le binding Cloudflare (prepare/bind/first/all/run),
// sur une base SQLite en mémoire (node:sqlite) — les vraies requêtes SQL du projet sont donc exécutées.
import { DatabaseSync } from 'node:sqlite';

export function createD1() {
  const sqlite = new DatabaseSync(':memory:');
  const queries = new WeakMap();
  const execute = (sql, params) => {
    const prepared = sqlite.prepare(sql);
    const returnsRows = prepared.columns().length > 0;
    const results = returnsRows ? prepared.all(...params) : [];
    const info = returnsRows
      ? sqlite.prepare('SELECT changes() AS changes, last_insert_rowid() AS lastInsertRowid').get()
      : prepared.run(...params);
    return { results, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  };
  const statement = (sql, params = []) => {
    const result = {
      bind: (...args) => statement(sql, args),
      first: async () => sqlite.prepare(sql).get(...params) ?? null,
      all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
      run: async () => execute(sql, params),
    };
    queries.set(result, { sql, params });
    return result;
  };
  return {
    prepare: (sql) => statement(sql),
    batch: async (statements) => {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((statement) => {
          const { sql, params } = queries.get(statement);
          return execute(sql, params);
        });
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
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
