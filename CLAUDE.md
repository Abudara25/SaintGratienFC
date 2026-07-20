# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Static marketing website for **Saint-Gratien FC**, a football club for kids in Saint-Gratien (Val-d'Oise, France), founded in 2026 — this is its first season. Plain HTML/CSS/JS, no build tools, no framework, no package manager. Files are served as-is; edit them directly and refresh the browser.

## Running locally

There is no dev server, build, lint, or test command configured. To preview the site, serve the folder root with any static file server, e.g.:

```
python -m http.server 8000
```

Then open `http://localhost:8000/index.html`.

## Architecture

- **5 standalone HTML pages**, no templating engine: `index.html`, `actualites.html`, `equipe.html`, `entrainements.html`, `contact.html`. Each page duplicates the same `<header>` and `<footer>` markup verbatim — when changing nav links, social links, or footer contact info, apply the edit to **all 5 files**.
- **`assets/css/styles.css`**: single stylesheet. Design tokens (colors, fonts, spacing) are CSS custom properties in `:root`, with the color palette sampled directly from the club crest (maroon/gold/cream/red). Reusable component classes: `.card`, `.info-list`/`.info-item`, `.cta-banner`, `.eyebrow`, `.filters`/`.filter-btn`.
- **`assets/js/main.js`**: vanilla JS, no dependencies. Key behaviors: sticky header shrink-on-scroll, mobile nav toggle, scroll-reveal via `IntersectionObserver` (elements with `[data-reveal]`), news category filters on `actualites.html` (`data-filter` buttons vs. `data-category` cards — keep both in sync when adding a category), neutralizing placeholder `href="#"` links, and an article "lightbox" (clicking a news `article.card` opens it enlarged in a modal — `#article-lightbox`, present on `index.html` and `actualites.html` only).
- **`assets/images/`**: `logo.png` (club crest, optimized down from a ~4MB original) and `favicon.ico` generated from it.
- **`sitemap.xml` / `robots.txt`**: reference a placeholder domain `votre-domaine.fr` — this must be find-and-replaced (across all HTML files too, in the `<link rel="canonical">` and Open Graph tags) once a real domain is purchased.

## Real club facts — do not contradict these with invented content

- The club **just launched in 2026** — no multi-decade history, no senior/veteran/women's teams, no competitive fixtures, results, or league standings exist. Only two categories: **U6-U7** and **U8-U9**, "loisir" (fun-focused, not competitive), run 100% by volunteers.
- Address: **Stade Robert Lemoine, 75 rue d'Orgemont, Saint-Gratien, Val-d'Oise**.
- Training: **Thursdays 17h–18h** (a Saturday slot is "under consideration", not confirmed).
- Contact: **contact.sgfc@yahoo.com**. No phone number is published on the site (removed intentionally at the user's request).
- Social links: Instagram `https://www.instagram.com/sgfc95`, Facebook `https://www.facebook.com/SGFootballClub`. No YouTube — the icon was removed since no real profile exists.
- The site is **not deployed anywhere yet** (no GitHub Pages, no custom domain). Code lives at `https://github.com/Abudara25/SaintGratienFC` (public repo) only.

## Project-specific conventions

- Only add a "Lire la suite" / read-more link to a news card if there is genuinely more content behind it (a real detail page). None currently exist, so none are used — clicking a card opens the lightbox modal instead, which just shows the same teaser text enlarged.
- The footer "Newsletter" signup form is intentionally non-functional (`onsubmit` just calls `preventDefault()`, no backend) — it's a placeholder kept for future use at the user's request; don't remove it during cleanup passes.
