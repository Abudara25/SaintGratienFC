// Génère une vraie page HTML indexable par article, à partir de content/articles.json
// (édité via /admin — Sveltia CMS). Un article sans page dédiée ne serait qu'un teaser :
// voir la convention SEO documentée dans CLAUDE.md ("chaque article = une page indexable").

const CATEGORY_LABELS = {
  club: 'Club',
  inscriptions: 'Inscriptions',
  benevolat: 'Bénévolat',
  evenement: 'Événement',
  partenariat: 'Partenariat',
};

const CATEGORY_ICONS = {
  club: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  inscriptions: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3a1 1 0 011-1h4a1 1 0 011 1v1"/><path d="M9 13l2 2 4-4"/>',
  benevolat: '<path d="M12 21s-7-5.2-9.5-9.4C.7 8 2.2 4 6 3.2c2.1-.4 4 .6 5 2.3 1-1.7 2.9-2.7 5-2.3C19.8 4 21.3 8 19.5 11.6 17 15.8 12 21 12 21z"/>',
  evenement: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9.5h18"/><path d="M8 3v4M16 3v4"/><path d="M12 12.5l1.1 2.2 2.4.3-1.8 1.7.4 2.3-2.1-1.1-2.1 1.1.4-2.3-1.8-1.7 2.4-.3z"/>',
  partenariat: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>',
};

const escapeHtml = (str = '') =>
  str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const formatDate = (iso) => {
  try {
    // Formatage forcé en UTC : "YYYY-MM-DD" est parsé comme minuit UTC, un fuseau très négatif
    // en heure locale ferait glisser l'affichage d'un jour.
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
  } catch {
    return iso;
  }
};

export async function onRequestGet({ request, params, env }) {
  const siteUrl = new URL(request.url).origin;
  let data;
  try {
    const res = await env.ASSETS.fetch(new URL('/content/articles.json', siteUrl));
    data = res.ok ? await res.json() : null;
  } catch {
    data = null;
  }

  const article = data?.articles?.find((a) => a.slug === params.slug);
  if (!article) {
    // Vrai 404 (pas une redirection vers actualites.html) : Google déconseille de rediriger une
    // URL sans contenu réel vers une page qui répond 200 ("soft 404"). On réutilise le 404.html
    // du site pour garder le même rendu que les autres pages introuvables.
    const notFound = await env.ASSETS.fetch(new URL('/404.html', siteUrl));
    return new Response(notFound.body, { status: 404, headers: notFound.headers });
  }

  const categoryLabel = CATEGORY_LABELS[article.category] || 'Club';
  const icon = CATEGORY_ICONS[article.category] || CATEGORY_ICONS.club;
  const image = article.image ? `${siteUrl}${article.image}` : `${siteUrl}/assets/images/og-image.jpg`;
  const canonical = `${siteUrl}/actualites/${params.slug}`;
  const title = escapeHtml(article.title);
  const excerpt = escapeHtml(article.excerpt || '');
  const paragraphs = (article.body || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('\n            ');

  const media = article.image
    ? `<img src="${article.image}" alt="" width="800" height="500" style="width:100%;height:100%;object-fit:cover;">`
    : `<svg class="icon-illustration" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Saint-Gratien FC</title>
<meta name="description" content="${excerpt}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:title" content="${title} — Saint-Gratien FC">
<meta property="og:description" content="${excerpt}">
<meta property="og:image" content="${image}">
<meta property="og:locale" content="fr_FR">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${image}">
<link rel="icon" href="/assets/images/favicon.ico">
<link rel="preload" href="/assets/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/oswald.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/styles.css?v=20260831">
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
      <a href="/inscription.html" class="btn btn-primary btn-sm nav-cta">Devenir adhérent</a>
    </nav>
    <div class="header-actions">
      <a href="/inscription.html" class="btn btn-primary btn-sm">Devenir adhérent</a>
      <button class="burger" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="main-nav">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</header>

<main id="main">
  <div class="page-header">
    <div class="container">
      <span class="eyebrow">${categoryLabel}</span>
      <h1>${title}</h1>
      <p>${formatDate(article.date)}</p>
    </div>
  </div>

  <section class="bg-surface">
    <div class="container" style="max-width:760px;">
      <div class="card" style="margin-bottom:32px;">
        <div class="card-media">${media}<span class="tag">${categoryLabel}</span></div>
      </div>
      <div style="font-size:1.05rem;line-height:1.75;color:var(--color-text);">
        ${paragraphs || `<p>${excerpt}</p>`}
      </div>
      <p style="margin-top:32px;"><a href="/actualites.html" class="card-link">Retour aux actualités</a></p>
    </div>
  </section>
</main>

<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div>
        <div class="footer-brand">
          <img src="/assets/images/logo-96.webp" alt="">
          <strong>Saint-Gratien FC</strong>
        </div>
        <p>Nouveau club de football loisir à Saint-Gratien, le Saint-Gratien FC accueille les enfants de 5 à 8 ans (U6-U7 et U8-U9) dans un esprit familial, 100% porté par des bénévoles.</p>
        <div class="social-row">
          <a href="https://www.facebook.com/SGFootballClub" aria-label="Facebook" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M13.5 21v-7.2h2.4l.4-2.8h-2.8v-1.6c0-.8.2-1.4 1.4-1.4h1.5V5.4c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.2v1.9H7.5v2.8h2.1V21h3.9z"/></svg></a>
          <a href="https://www.instagram.com/sgfc95" aria-label="Instagram" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 8.2a3.8 3.8 0 100 7.6 3.8 3.8 0 000-7.6zm0 6.3a2.5 2.5 0 110-5 2.5 2.5 0 010 5zm5-6.6a1 1 0 11-2 0 1 1 0 012 0zM12 3c-2.5 0-2.8 0-3.7.1-1 .1-1.7.2-2.3.5-.6.2-1.1.6-1.6 1.1-.5.5-.8 1-1.1 1.6-.2.6-.4 1.3-.5 2.3C3 9.5 3 9.8 3 12.3s0 2.8.1 3.7c.1 1 .2 1.7.5 2.3.2.6.6 1.1 1.1 1.6.5.5 1 .8 1.6 1.1.6.2 1.3.4 2.3.5.9.1 1.2.1 3.7.1s2.8 0 3.7-.1c1-.1 1.7-.2 2.3-.5.6-.2 1.1-.6 1.6-1.1.5-.5.8-1 1.1-1.6.2-.6.4-1.3.5-2.3.1-.9.1-1.2.1-3.7s0-2.8-.1-3.7c-.1-1-.2-1.7-.5-2.3-.2-.6-.6-1.1-1.1-1.6-.5-.5-1-.8-1.6-1.1-.6-.2-1.3-.4-2.3-.5C14.8 3 14.5 3 12 3z"/></svg></a>
        </div>
      </div>
      <div>
        <h3>Navigation</h3>
        <ul>
          <li><a href="/index.html">Accueil</a></li>
          <li><a href="/actualites.html">Actualités</a></li>
          <li><a href="/equipe.html">Le Club</a></li>
          <li><a href="/entrainements.html">Entraînements</a></li>
          <li><a href="/partenaires.html">Partenaires</a></li>
          <li><a href="/contact.html">Contact</a></li>
        </ul>
      </div>
      <div>
        <h3>Infos pratiques</h3>
        <ul>
          <li><a href="/contact.html">Stade Robert Lemoine, Saint-Gratien</a></li>
          <li><a href="mailto:contact@saintgratienfc.fr">contact@saintgratienfc.fr</a></li>
        </ul>
      </div>
      <div>
        <h3>Newsletter</h3>
        <p>Recevez les actus et les infos du club chaque mois.</p>
        <form class="newsletter">
          <label for="footer-email" class="visually-hidden">Adresse e-mail</label>
          <input type="email" id="footer-email" placeholder="Votre e-mail" required>
          <button type="submit" class="btn btn-primary btn-sm">OK</button>
        </form>
      </div>
    </div>
    <div class="footer-bottom">
      <p>© 2026 Saint-Gratien FC — Tous droits réservés.</p>
      <p><a href="/mentions-legales.html">Mentions légales</a> · <a href="/confidentialite.html">Confidentialité</a></p>
      <p>Val-d'Oise · Depuis 2020</p>
      <p>Site créé par <a href="https://abiweb.fr" target="_blank" rel="nofollow noopener">Abiweb</a></p>
    </div>
  </div>
</footer>

<script src="/assets/js/main.js?v=20260831"></script>
</body>
</html>
`;

  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}
