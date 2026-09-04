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

  // Colonnes ajoutées après la création initiale de la table en production : ALTER TABLE ADD
  // COLUMN plutôt que CREATE TABLE IF NOT EXISTS, pour que les bases déjà existantes suivent.
  // Erreur "duplicate column name" ignorée volontairement (colonne déjà présente).
  const addedColumns = [
    'mode_paiement TEXT', // 2026-09-04
    // 2026-09-04 : dépôt du dossier signé (voir functions/depot/[token].js) — upload_token est
    // généré à l'inscription (functions/api/inscriptions.js) et sert de clé secrète pour le lien
    // de dépôt public ; dossier_key est la clé de l'objet dans le bucket R2 "DOSSIERS".
    'upload_token TEXT',
    'dossier_key TEXT',
    'dossier_content_type TEXT',
    'dossier_uploaded_at TEXT',
  ];
  for (const column of addedColumns) {
    try {
      await db.prepare(`ALTER TABLE inscriptions ADD COLUMN ${column}`).run();
    } catch {}
  }

  await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_inscriptions_upload_token ON inscriptions(upload_token)').run();
}
