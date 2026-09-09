// Table dédiée au tracking d'événements (voir functions/api/track-event.js), séparée
// d'"inscriptions" — même pattern que inscriptions-db.js (CREATE TABLE IF NOT EXISTS, pas de
// migration manuelle pour un site sans build step).
export async function ensureEventsTable(db) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        event TEXT NOT NULL,
        page TEXT
      )`
    )
    .run();
}
