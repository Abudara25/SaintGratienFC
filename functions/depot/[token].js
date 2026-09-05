// Page publique de dépôt du dossier signé, liée depuis un lien unique par famille (voir
// assets/js/inscription.js — le lien est construit avec l'upload_token renvoyé par
// functions/api/inscriptions.js à la création de l'inscription). Remplace l'ancien "1. Envoyer
// par e-mail" (mailto), qui ne pouvait de toute façon pas joindre le PDF automatiquement.
// Le fichier est stocké dans le bucket R2 "DOSSIERS" (à créer manuellement sur le dashboard
// Cloudflare Pages — voir CLAUDE.md), la base D1 ne garde que la référence (dossier_key).
import { ensureInscriptionsTable } from '../_shared/inscriptions-db.js';

const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const escapeHtml = (str = '') =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// `datetime('now')` (SQLite) renvoie "YYYY-MM-DD HH:MM:SS" en UTC, sans "T" ni "Z" — il faut les
// ajouter pour que `new Date(...)` le reconnaisse de façon fiable dans tous les moteurs JS.
const formatDateTime = (sqliteDatetime) => {
  try {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(
      new Date(`${sqliteDatetime.replace(' ', 'T')}Z`)
    );
  } catch {
    return sqliteDatetime;
  }
};

function page({ siteUrl, inscription, error, success }) {
  const nomEnfant = `${escapeHtml(inscription.enfant_prenom)} ${escapeHtml(inscription.enfant_nom)}`;

  const status =
    success
      ? `<div class="card" style="background:var(--gold-100);box-shadow:none;margin-bottom:24px;"><div class="card-body"><strong style="color:var(--maroon-950);">Dossier bien reçu, merci !</strong><p style="margin-bottom:0;color:var(--color-text-muted);">Nous avons bien reçu le dossier signé de ${nomEnfant}. Vous pouvez déposer un nouveau fichier ci-dessous si besoin (il remplacera celui-ci).</p></div></div>`
      : inscription.dossier_uploaded_at
      ? `<div class="card" style="background:var(--gold-100);box-shadow:none;margin-bottom:24px;"><div class="card-body"><strong style="color:var(--maroon-950);">Dossier déjà reçu</strong><p style="margin-bottom:0;color:var(--color-text-muted);">Nous avons reçu un dossier le ${formatDateTime(inscription.dossier_uploaded_at)}. Vous pouvez le remplacer ci-dessous si besoin.</p></div></div>`
      : '';

  const errorHtml = error ? `<p style="color:var(--color-error, #b3261e);margin-bottom:16px;">${escapeHtml(error)}</p>` : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Déposer le dossier signé — Saint-Gratien FC</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/assets/images/favicon.ico">
<link rel="preload" href="/assets/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/oswald.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/styles.css?v=20260905b">
</head>
<body>
<a href="#main" class="skip-link">Aller au contenu</a>

<header class="site-header">
  <div class="container">
    <a href="/index.html" class="brand">
      <img src="/assets/images/logo-96.webp" alt="Blason du Saint-Gratien FC" width="48" height="48">
      <span class="brand-name"><strong>Saint-Gratien FC</strong><span>Val-d'Oise</span></span>
    </a>
    <nav class="main-nav" id="main-nav" aria-label="Navigation principale">
      <ul>
        <li><a href="/index.html">Accueil</a></li>
        <li><a href="/actualites.html">Actualités</a></li>
        <li><a href="/equipe.html">Le Club</a></li>
        <li><a href="/entrainements.html">Entraînements</a></li>
        <li><a href="/partenaires.html">Partenaires</a></li>
        <li><a href="/contact.html">Contact</a></li>
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
      <span class="eyebrow">Inscription</span>
      <h1>Déposer le dossier signé</h1>
      <p>Dossier de ${nomEnfant}</p>
    </div>
  </div>

  <section class="bg-surface">
    <div class="container" style="max-width:560px;">
      ${status}
      ${errorHtml}
      <form method="POST" enctype="multipart/form-data">
        <div class="form-field">
          <label for="dossier">Fiche d'inscription signée (PDF ou photo)</label>
          <input type="file" id="dossier" name="dossier" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required>
          <small style="font-size:.82rem;color:var(--color-text-muted);">PDF, JPG ou PNG, 10 Mo maximum.</small>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Envoyer mon dossier signé</button>
      </form>
      <p style="margin-top:20px;font-size:.85rem;color:var(--color-text-muted);">Un problème ? Écrivez-nous à <a href="mailto:contact@saintgratienfc.fr">contact@saintgratienfc.fr</a>.</p>
    </div>
  </section>
</main>

<footer class="site-footer">
  <div class="container">
    <div class="footer-bottom">
      <p>© 2026 Saint-Gratien FC — Tous droits réservés.</p>
      <p><a href="/mentions-legales.html">Mentions légales</a> · <a href="/confidentialite.html">Confidentialité</a></p>
    </div>
  </div>
</footer>

<script src="/assets/js/main.js?v=20260905b"></script>
</body>
</html>
`;
}

async function loadInscription(env, token) {
  await ensureInscriptionsTable(env.DB);
  return env.DB.prepare('SELECT * FROM inscriptions WHERE upload_token = ?').bind(token).first();
}

async function notFound(request, env) {
  const siteUrl = new URL(request.url).origin;
  const res = await env.ASSETS.fetch(new URL('/404.html', siteUrl));
  return new Response(res.body, { status: 404, headers: res.headers });
}

export async function onRequestGet({ request, env, params }) {
  const inscription = await loadInscription(env, params.token);
  if (!inscription) return notFound(request, env);

  const siteUrl = new URL(request.url).origin;
  const success = new URL(request.url).searchParams.get('ok') === '1';
  return new Response(page({ siteUrl, inscription, success }), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

export async function onRequestPost({ request, env, params }) {
  const inscription = await loadInscription(env, params.token);
  if (!inscription) return notFound(request, env);

  const siteUrl = new URL(request.url).origin;
  const renderError = (error) =>
    new Response(page({ siteUrl, inscription, error }), { status: 400, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });

  let form;
  try {
    form = await request.formData();
  } catch {
    return renderError("Envoi invalide, réessayez.");
  }

  const file = form.get('dossier');
  if (!file || typeof file === 'string' || !file.size) {
    return renderError('Choisissez un fichier avant d’envoyer.');
  }
  if (file.size > MAX_SIZE) {
    return renderError('Le fichier dépasse 10 Mo — réduisez-le (photo compressée, ou export PDF plus léger) et réessayez.');
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return renderError('Format non accepté — envoyez un PDF, un JPG ou un PNG.');
  }

  if (!env.DOSSIERS) {
    return renderError("Le dépôt en ligne n'est pas encore activé pour le moment, merci de nous envoyer votre dossier par e-mail à contact@saintgratienfc.fr en attendant.");
  }

  const key = `dossiers/${params.token}`;
  try {
    await env.DOSSIERS.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    await ensureInscriptionsTable(env.DB);
    await env.DB.prepare('UPDATE inscriptions SET dossier_key = ?, dossier_content_type = ?, dossier_uploaded_at = datetime(\'now\') WHERE upload_token = ?')
      .bind(key, file.type, params.token)
      .run();
  } catch {
    return renderError("Échec de l'envoi, réessayez ou écrivez-nous à contact@saintgratienfc.fr.");
  }

  return new Response('', { status: 302, headers: { Location: `/depot/${params.token}?ok=1` } });
}
