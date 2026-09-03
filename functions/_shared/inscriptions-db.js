// Schéma partagé par functions/api/inscriptions.js (écriture) et functions/admin/inscriptions.js
// (lecture). CREATE TABLE IF NOT EXISTS : pas d'outil de migration pour un site sans build step,
// la table s'auto-crée au premier appel plutôt que d'exiger une étape manuelle côté utilisateur.
export async function ensureInscriptionsTable(db) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS inscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        enfant_prenom TEXT NOT NULL,
        enfant_nom TEXT NOT NULL,
        naissance TEXT NOT NULL,
        categorie TEXT NOT NULL,
        taille_maillot TEXT NOT NULL,
        parent_prenom TEXT NOT NULL,
        parent_nom TEXT NOT NULL,
        email TEXT NOT NULL,
        telephone TEXT,
        adresse TEXT,
        code_postal TEXT,
        ville TEXT,
        autorisation INTEGER NOT NULL,
        droit_image INTEGER NOT NULL,
        rgpd INTEGER NOT NULL
      )`
    )
    .run();
}
