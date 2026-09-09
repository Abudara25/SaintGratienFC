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
    // 2026-09-09 : voir buildDedupKey() ci-dessous — SQLite/D1 ne gère pas les accents dans
    // LOWER()/UPPER() (LOWER('É') renvoie 'É' inchangé), donc LOWER(TRIM(enfant_prenom)) = LOWER(?)
    // ne détectait pas "Léa" vs "LÉA" comme le même prénom. dedup_key est calculée en JS
    // (accents retirés) à l'écriture, comparée par égalité stricte plutôt que via LOWER() en SQL.
    'dedup_key TEXT',
    // 2026-09-09 : statut de paiement, coché manuellement par un responsable depuis /admin/
    // inscriptions (mode_paiement dit *comment* la famille compte payer, choisi à l'inscription ;
    // paye dit si l'argent a *effectivement* été reçu — utile pour Espèces/Chèque, qui ne sont pas
    // confirmés automatiquement comme le serait un paiement HelloAsso). 0/1, INTEGER comme
    // autorisation/droit_image/rgpd.
    'paye INTEGER NOT NULL DEFAULT 0',
    // 2026-09-09 : archivage ("corbeille") — sortir un profil de la liste active sans le supprimer
    // définitivement (voir functions/admin/inscriptions.js, action=archive/restore). NULL = actif ;
    // une date = archivé, affichée telle quelle dans la corbeille (même convention que created_at).
    'archived_at TEXT',
    // Saison au moment de l'inscription (ex. "2026-2027"), lue côté serveur depuis
    // _shared/settings-kv.js au moment du POST (functions/api/inscriptions.js) — jamais la valeur
    // envoyée par le client, qui a pu charger /api/categories avant un changement de saison
    // entre-temps. Tamponnée rétroactivement pour les fiches déjà en base au moment de l'ajout de
    // cette colonne (voir juste après la boucle ci-dessous) : au lancement de cette fonctionnalité,
    // le club n'a connu qu'une seule saison ("2026-2027"), donc toutes les lignes existantes en sont
    // forcément — indispensable pour que la comparaison stricte de saison utilisée par la
    // réinscription (functions/reinscription/[token].js) et par le contrôle anti-doublon
    // (findExistingInscription ci-dessous) les reconnaisse encore comme "saison en cours" une fois
    // la saison suivante ouverte, plutôt que de les traiter en permanence comme "saison inconnue".
    'saison TEXT',
    // Jeton pour /reinscription/<token> (functions/reinscription/[token].js) : généré par l'action
    // "Envoyer le lien de réinscription" de /admin/inscriptions (onRequestPost, bulk-reinscription)
    // sur la fiche de la saison qui se termine — ouvre un formulaire pré-rempli à partir de cette
    // fiche pour créer celle de la saison suivante. NULL tant que la campagne n'a pas été lancée
    // pour cette famille.
    'reinscription_token TEXT',
  ];
  for (const column of addedColumns) {
    try {
      await db.prepare(`ALTER TABLE inscriptions ADD COLUMN ${column}`).run();
      if (column.startsWith('saison ')) {
        // Ne s'exécute qu'une fois : ce bloc try ne réussit que la toute première fois que la
        // colonne est ajoutée (les appels suivants échouent sur "duplicate column name" et passent
        // au catch ci-dessous, sans repasser ici). Toutes les fiches déjà présentes à ce moment sont
        // forcément de la saison "2026-2027" (seule saison ayant jamais existé pour ce club à la
        // date de cet ajout) — voir le commentaire sur 'saison TEXT' ci-dessus.
        await db.prepare("UPDATE inscriptions SET saison = '2026-2027' WHERE saison IS NULL").run();
      }
    } catch {}
  }

  await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_inscriptions_upload_token ON inscriptions(upload_token)').run();
  await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_inscriptions_reinscription_token ON inscriptions(reinscription_token)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_inscriptions_dedup_key ON inscriptions(dedup_key)').run();
}

// Retire les accents et met en minuscules — SQLite LOWER() étant limité à l'ASCII (voir plus haut),
// la normalisation se fait ici, côté JS, avant toute comparaison ou écriture.
function normalize(str) {
  return String(str || '')
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Clé de déduplication : prénom+nom+e-mail normalisés (sans naissance — voir findExistingInscription
// ci-dessous pour pourquoi). Calculée à l'identique à l'écriture (functions/api/inscriptions.js) et
// à la lecture, pour une comparaison par égalité stricte en SQL plutôt qu'un LOWER() qui échoue sur
// les caractères accentués.
export function buildDedupKey({ enfantPrenom, enfantNom, email }) {
  return `${normalize(enfantPrenom)}|${normalize(enfantNom)}|${normalize(email)}`;
}

// Recherche une inscription existante par identité enfant+parent. Utilisé par le contrôle strict
// au submit (functions/api/inscriptions.js, POST — naissance toujours fournie) et par le contrôle
// temps réel pendant la saisie (même fichier, GET — naissance optionnelle, pas forcément encore
// remplie au moment où prénom/nom/e-mail le sont). La correspondance sur prénom/nom/e-mail se fait
// via dedup_key (égalité stricte, calculée en JS) ; la naissance, quand fournie, est filtrée ensuite
// en JS sur les candidats trouvés — la table reste petite (un seul club), pas besoin de l'inclure
// dans la clé indexée.
//
// currentSaison (optionnel) : sans lui, une même famille redevenait "doublon" à chaque nouvelle
// saison, y compris pour une vraie réinscription légitime — corrigé en scopant le contrôle aux
// fiches de la saison en cours (saison = currentSaison). Le repli "!r.saison" (fiche sans saison
// connue) est une pure sécurité : ensureInscriptionsTable() ci-dessus tamponne déjà toutes les
// fiches existantes à "2026-2027" dès l'ajout de la colonne, il ne devrait plus jamais y avoir de
// saison NULL en pratique. functions/reinscription/[token].js n'utilise volontairement PAS cette
// fonction pour savoir si une réinscription a déjà eu lieu : il lui faut une correspondance stricte
// sur la saison (voir findCurrentSeasonSubmission dans ce fichier), pas ce repli — la fiche chargée
// par le token est elle-même celle de la saison qui se termine.
export async function findExistingInscription(db, { enfantPrenom, enfantNom, naissance, email }, currentSaison) {
  const dedupKey = buildDedupKey({ enfantPrenom, enfantNom, email });
  const { results } = await db
    .prepare('SELECT upload_token, created_at, naissance, saison FROM inscriptions WHERE dedup_key = ?')
    .bind(dedupKey)
    .all();

  const scoped = currentSaison ? results.filter((r) => !r.saison || r.saison === currentSaison) : results;

  if (!scoped.length) return null;
  if (!naissance) return scoped[0];
  return scoped.find((r) => r.naissance === naissance) || null;
}

// Utilisé uniquement par functions/reinscription/[token].js pour savoir si une famille a déjà
// finalisé sa réinscription de la saison en cours (affiche alors "déjà réinscrit" plutôt que le
// formulaire). Volontairement une correspondance STRICTE sur la saison (pas de repli "!r.saison"
// comme dans findExistingInscription ci-dessus) : la fiche chargée par le token de réinscription est
// elle-même celle de la saison qui se termine, un repli sur "sans saison connue" la ferait
// correspondre à elle-même dès le premier chargement du lien, avant toute réinscription réelle.
export async function findCurrentSeasonSubmission(db, { enfantPrenom, enfantNom, naissance, email }, currentSaison) {
  const dedupKey = buildDedupKey({ enfantPrenom, enfantNom, email });
  const { results } = await db
    .prepare('SELECT naissance FROM inscriptions WHERE dedup_key = ? AND saison = ?')
    .bind(dedupKey, currentSaison)
    .all();
  return results.some((r) => r.naissance === naissance);
}
