// Page publique de réinscription prioritaire, liée depuis un lien personnel envoyé par e-mail ou
// distribué à la main (voir functions/admin/inscriptions.js, action=bulk-reinscription, et
// functions/_shared/confirmation-email.js, sendReinscriptionEmail). Reprend quasiment telle quelle
// la section formulaire d'inscription.html (mêmes id/name de champs, mêmes scripts assets/js/
// inscription.js + pdf-inscription.js) mais pré-remplie à partir de la fiche de la saison qui se
// termine — la famille n'a qu'à vérifier/ajuster (catégorie recalculée automatiquement pour la
// nouvelle saison via la même logique naissance → catégorie que le formulaire public, voir
// inscription.js) puis valider. La soumission POSTe directement vers /api/inscriptions comme le
// formulaire public — aucune route de POST dédiée ici, tout le comportement (PDF, e-mail, dépôt du
// dossier, dédoublonnage scopé à la saison en cours) est déjà géré par ce chemin partagé.
// Accessible en tout temps, y compris si le formulaire public est fermé (voir inscription-status) :
// le lien personnel EST le contrôle d'accès, pas le statut ouvert/fermé du site.
import { ensureInscriptionsTable, findCurrentSeasonSubmission } from '../_shared/inscriptions-db.js';
import { getCategoriesConfig } from '../_shared/settings-kv.js';

const escapeHtml = (str = '') =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function notFound(request, env) {
  const siteUrl = new URL(request.url).origin;
  const res = await env.ASSETS.fetch(new URL('/404.html', siteUrl));
  return new Response(res.body, { status: 404, headers: res.headers });
}

function alreadyRegisteredPage(row) {
  const nomEnfant = `${escapeHtml(row.enfant_prenom)} ${escapeHtml(row.enfant_nom)}`;
  return shell({
    title: 'Réinscription déjà reçue',
    intro: `Réinscription de ${nomEnfant}`,
    body: `<div class="card" style="background:var(--gold-100);box-shadow:none;">
      <div class="card-body">
        <h3 style="margin-bottom:8px;">Merci, c'est déjà fait !</h3>
        <p style="margin-bottom:0;color:var(--color-text-muted);">Nous avons bien reçu la réinscription de <strong>${nomEnfant}</strong> pour la saison en cours. Si vous pensez qu'il s'agit d'une erreur, écrivez-nous à <a href="mailto:contact@saintgratienfc.fr">contact@saintgratienfc.fr</a>.</p>
      </div>
    </div>`,
  });
}

// squelette minimal (header/footer du site) — pas le grid-2 "Infos pratiques" d'inscription.html,
// cette page n'a besoin que du formulaire (comme functions/depot/[token].js).
function shell({ title, intro, body }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — Saint-Gratien FC</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/assets/images/favicon.ico">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/assets/images/apple-touch-icon.png">
<meta name="theme-color" content="#4f1414">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Saint-Gratien FC">
<link rel="preload" href="/assets/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/oswald.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/styles.css?v=20260909g">
</head>
<body>
<a href="#main" class="skip-link">Aller au contenu</a>

<header class="site-header">
  <div class="container">
    <a href="/" class="brand">
      <img src="/assets/images/logo-96.webp" alt="Blason du Saint-Gratien FC" width="48" height="48">
      <span class="brand-name"><strong>Saint-Gratien FC</strong><span>Val-d'Oise</span></span>
    </a>
    <nav class="main-nav" id="main-nav" aria-label="Navigation principale">
      <ul>
        <li><a href="/">Accueil</a></li>
        <li><a href="/actualites">Actualités</a></li>
        <li><a href="/equipe">Le Club</a></li>
        <li><a href="/entrainements">Entraînements</a></li>
        <li><a href="/partenaires">Partenaires</a></li>
        <li><a href="/contact">Contact</a></li>
      </ul>
    </nav>
    <div class="header-actions">
      <button class="burger" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="main-nav">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</header>

<main id="main">
  <div class="page-header">
    <div class="container">
      <span class="eyebrow">Réinscription prioritaire</span>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(intro)}</p>
    </div>
  </div>

  <section class="bg-surface">
    <div class="container" style="max-width:640px;">
      ${body}
    </div>
  </section>
</main>

<footer class="site-footer">
  <div class="container">
    <div class="footer-bottom">
      <p>© 2026 Saint-Gratien FC — Tous droits réservés.</p>
      <p><a href="/mentions-legales">Mentions légales</a> · <a href="/confidentialite">Confidentialité</a></p>
    </div>
  </div>
</footer>

<script src="/assets/js/main.js?v=20260909c"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js" integrity="sha512-plOdviVmws4Y3JAvbnpfKb2hVxKM1lCwsi3vmElYRj+tiDLffZ4FVUj5a8vyKJ9pIgl8JCAHEJ4D1iUKBecswg==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script src="/assets/js/pdf-inscription.js?v=20260909b"></script>
<script src="/assets/js/inscription.js?v=20260909f"></script>
</body>
</html>
`;
}

function formPage(row) {
  const nomEnfant = `${escapeHtml(row.enfant_prenom)} ${escapeHtml(row.enfant_nom)}`;
  const selected = (value, option) => (value === option ? 'selected' : '');

  const body = `<p class="section-sub">Les informations de la saison précédente sont pré-remplies ci-dessous — vérifiez-les, ajustez-les si besoin (la catégorie est recalculée automatiquement selon la nouvelle saison), puis validez pour réserver la place de ${nomEnfant}.</p>

      <div class="card" style="margin-bottom:24px;border-left:4px solid var(--gold-500);box-shadow:none;">
        <div class="card-body">
          <span class="eyebrow" style="margin-bottom:4px;">Offre Saison <span data-saison-text>2026-2027</span></span>
          <h3 style="margin-bottom:4px;"><span data-prix-text>180</span> € <span style="font-weight:400;font-size:.85rem;color:var(--color-text-muted);">(ou 3 × <span data-prix-tiers-text>60</span> € sans frais sur HelloAsso)</span></h3>
          <p style="margin-bottom:0;color:var(--color-text-muted);">Licence + tenue complète Patrick incluse (maillot, short, survêtement, sac).</p>
        </div>
      </div>

      <form id="inscription-form" novalidate>
        <div class="form-row">
          <div class="form-field">
            <label for="enfant-prenom">Prénom de l'enfant</label>
            <input type="text" id="enfant-prenom" name="enfantPrenom" value="${escapeHtml(row.enfant_prenom)}" required>
          </div>
          <div class="form-field">
            <label for="enfant-nom">Nom de l'enfant</label>
            <input type="text" id="enfant-nom" name="enfantNom" value="${escapeHtml(row.enfant_nom)}" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label for="naissance">Date de naissance</label>
            <input type="date" id="naissance" name="naissance" value="${escapeHtml(row.naissance)}" required>
          </div>
          <div class="form-field">
            <label for="categorie">Catégorie</label>
            <!-- Recalculée automatiquement depuis la date de naissance ci-dessus au chargement de
                 /api/categories (voir assets/js/inscription.js) — utile ici, où l'enfant change
                 souvent de catégorie d'une saison à l'autre. Options de repli en attendant. -->
            <select id="categorie" name="categorie" required>
              <option value="${escapeHtml(row.categorie)}">${escapeHtml(row.categorie)}</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label for="taille-maillot">Taille de maillot</label>
            <select id="taille-maillot" name="tailleMaillot" required>
              <option value="" disabled>Choisir une taille</option>
              <option value="4 ans" ${selected(row.taille_maillot, '4 ans')}>4 ans</option>
              <option value="6 ans" ${selected(row.taille_maillot, '6 ans')}>6 ans</option>
              <option value="8 ans" ${selected(row.taille_maillot, '8 ans')}>8 ans</option>
              <option value="10 ans" ${selected(row.taille_maillot, '10 ans')}>10 ans</option>
              <option value="12 ans" ${selected(row.taille_maillot, '12 ans')}>12 ans</option>
            </select>
            <small style="font-size:.82rem;color:var(--color-text-muted);line-height:1.5;">Tenue Patrick (maillot, short, survêtement, sac) — à ajuster si votre enfant a grandi.</small>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label for="parent-prenom">Prénom du parent</label>
            <input type="text" id="parent-prenom" name="parentPrenom" value="${escapeHtml(row.parent_prenom)}" required>
          </div>
          <div class="form-field">
            <label for="parent-nom">Nom du parent</label>
            <input type="text" id="parent-nom" name="parentNom" value="${escapeHtml(row.parent_nom)}" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label for="email">E-mail (parent)</label>
            <input type="email" id="email" name="email" value="${escapeHtml(row.email)}" required>
          </div>
          <div class="form-field">
            <label for="telephone">Téléphone (parent)</label>
            <input type="tel" id="telephone" name="telephone" value="${escapeHtml(row.telephone || '')}" required>
          </div>
        </div>

        <p id="inscription-duplicate-warning" hidden style="font-size:.85rem;color:var(--color-error, #b3261e);background:#fbe9e7;padding:10px 14px;border-radius:var(--radius-sm);">
          Un enfant portant ce nom et prénom semble déjà réinscrit avec cette adresse e-mail. Si c'est une erreur, vérifiez l'orthographe — sinon consultez vos e-mails ou contactez-nous à <a href="mailto:contact@saintgratienfc.fr">contact@saintgratienfc.fr</a>.
        </p>

        <div class="form-field">
          <label for="adresse">Adresse</label>
          <input type="text" id="adresse" name="adresse" value="${escapeHtml(row.adresse || '')}">
        </div>
        <div class="form-row">
          <div class="form-field">
            <label for="code-postal">Code postal</label>
            <input type="text" id="code-postal" name="codePostal" value="${escapeHtml(row.code_postal || '')}">
          </div>
          <div class="form-field">
            <label for="ville">Ville</label>
            <input type="text" id="ville" name="ville" value="${escapeHtml(row.ville || '')}">
          </div>
        </div>
        <div class="form-field">
          <label for="mode-paiement">Mode de paiement</label>
          <select id="mode-paiement" name="modePaiement" required>
            <option value="" disabled ${row.mode_paiement ? '' : 'selected'}>Choisir un mode de paiement</option>
            <option value="HelloAsso" ${selected(row.mode_paiement, 'HelloAsso')}>HelloAsso (carte bancaire, en ligne)</option>
            <option value="Espèces" ${selected(row.mode_paiement, 'Espèces')}>Espèces</option>
            <option value="Chèque" ${selected(row.mode_paiement, 'Chèque')}>Chèque</option>
          </select>
        </div>

        <div class="form-field" style="gap:12px;">
          <label style="display:flex;align-items:flex-start;gap:10px;font-weight:400;font-size:.92rem;">
            <input type="checkbox" id="autorisation" name="autorisation" required style="margin-top:3px;">
            <span>J'autorise mon enfant à participer aux entraînements et activités du Saint-Gratien FC.</span>
          </label>
          <label style="display:flex;align-items:flex-start;gap:10px;font-weight:400;font-size:.92rem;">
            <input type="checkbox" id="droit-image" name="droitImage" style="margin-top:3px;">
            <span>J'autorise le club à utiliser des photos/vidéos de mon enfant prises lors des activités du club, à des fins de communication (site, réseaux sociaux).</span>
          </label>
          <label style="display:flex;align-items:flex-start;gap:10px;font-weight:400;font-size:.92rem;">
            <input type="checkbox" id="rgpd" name="rgpd" required style="margin-top:3px;">
            <span>J'accepte que ces informations soient utilisées uniquement pour traiter l'inscription de mon enfant au club (voir notre <a href="/confidentialite" target="_blank">politique de confidentialité</a>).</span>
          </label>
        </div>

        <p style="font-size:.85rem;color:var(--color-text-muted);">Un questionnaire de santé (ou certificat médical) pourra vous être demandé avant le début de la saison.</p>

        <p style="font-size:.85rem;color:var(--color-text-muted);"><strong style="color:var(--maroon-950);">Important :</strong> cette réinscription ne sera définitive qu'une fois l'adhésion réglée et la licence de votre enfant enregistrée par le club auprès de la FFF.</p>

        <button type="submit" class="btn btn-primary btn-block">Télécharger mon dossier</button>
      </form>

      <div id="inscription-duplicate" hidden style="margin-top:28px;">
        <div class="card" style="background:var(--gold-100);box-shadow:none;">
          <div class="card-body">
            <h3 style="margin-bottom:8px;">Dossier déjà envoyé</h3>
            <p style="margin-bottom:0;color:var(--color-text-muted);">Une réinscription pour cet enfant a déjà été envoyée le <strong id="inscription-duplicate-date"></strong>. Consultez vos e-mails (pensez aux spams), ou contactez-nous à <a href="mailto:contact@saintgratienfc.fr">contact@saintgratienfc.fr</a> si besoin.</p>
          </div>
        </div>
      </div>

      <div id="inscription-next-steps" hidden style="margin-top:28px;">
        <div class="card" style="background:var(--gold-100);box-shadow:none;">
          <div class="card-body" style="gap:14px;">
            <h3 style="margin-bottom:0;">Dossier généré : encore 2 étapes</h3>
            <p style="margin-bottom:0;color:var(--color-text-muted);">1. Imprimez le dossier téléchargé, faites-le signer, puis déposez-le en ligne (photo ou scan). 2. Réglez l'adhésion selon le mode choisi.</p>
            <div style="display:flex;gap:12px;flex-wrap:wrap;">
              <a id="depot-btn" target="_blank" rel="noopener" class="btn btn-dark">1. Déposer mon dossier signé</a>
            </div>
            <p id="depot-fallback" hidden style="margin:0;font-size:.85rem;color:var(--color-text-muted);">Le lien de dépôt n'a pas pu être généré (connexion instable) — <a id="mailto-btn">envoyez-nous votre dossier par e-mail</a> à la place.</p>
            <div id="paiement-especes-cheque" hidden style="background:var(--white);border-radius:var(--radius-sm);padding:14px 16px;font-size:.92rem;color:var(--color-text-muted);">
              Merci de prévoir le règlement (<strong id="paiement-especes-cheque-mode"></strong>) lors du dépôt du dossier signé au club.
            </div>
            <div id="paiement-helloasso" hidden>
              <div id="helloasso-widget-container"></div>
              <p style="margin:10px 0 0;font-size:.82rem;color:var(--color-text-muted);">Le paiement ne s'affiche pas ? <a id="helloasso-fallback-link" target="_blank" rel="noopener">Ouvrez-le dans un nouvel onglet</a>.</p>
            </div>
          </div>
        </div>
      </div>`;

  return shell({ title: 'Réinscription prioritaire', intro: `Réservez la place de ${nomEnfant} pour la saison prochaine`, body });
}

async function loadByToken(env, token) {
  await ensureInscriptionsTable(env.DB);
  return env.DB.prepare('SELECT * FROM inscriptions WHERE reinscription_token = ?').bind(token).first();
}

export async function onRequestGet({ request, env, params }) {
  const row = await loadByToken(env, params.token);
  if (!row) return notFound(request, env);

  const { saison } = await getCategoriesConfig(env);
  const alreadyDone = await findCurrentSeasonSubmission(
    env.DB,
    { enfantPrenom: row.enfant_prenom, enfantNom: row.enfant_nom, naissance: row.naissance, email: row.email },
    saison
  );

  return new Response(alreadyDone ? alreadyRegisteredPage(row) : formPage(row), {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}
