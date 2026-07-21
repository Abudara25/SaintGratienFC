# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Static marketing website for **Saint-Gratien FC**, a football club for kids in Saint-Gratien (Val-d'Oise, France), founded in 2020 — this is its first structured season. Plain HTML/CSS/JS, no build tools, no framework, no package manager. Files are served as-is; edit them directly and refresh the browser.

## Running locally

There is no dev server, build, lint, or test command configured. To preview the site, serve the folder root with any static file server, e.g.:

```
python -m http.server 8000
```

Then open `http://localhost:8000/index.html`.

## Architecture

- **6 standalone HTML pages**, no templating engine: `index.html`, `actualites.html`, `equipe.html`, `entrainements.html`, `partenaires.html`, `contact.html`. Each page duplicates the same `<header>` and `<footer>` markup verbatim — when changing nav links, social links, or footer contact info, apply the edit to **all 6 files**.
- **`assets/css/styles.css`**: single stylesheet. Design tokens (colors, fonts, spacing) are CSS custom properties in `:root`, with the color palette sampled directly from the club crest (maroon/gold/cream/red). Reusable component classes: `.card`, `.info-list`/`.info-item`, `.cta-banner`, `.eyebrow`, `.filters`/`.filter-btn`. **Premium polish pass (2026-07-21)**: `.btn-primary`/`.btn-dark` use a background-image gradient sweep for a hover "shine" (no pseudo-element, so button text is never at risk of being covered by z-index issues — keep that pattern for any new solid-fill button variant); `.page-header` now mirrors the `.hero`'s diagonal-stripe + radial-glow pattern via `::before`/`::after` for visual cohesion; `.eyebrow::before` has a subtle pulsing dot animation; `.info-item .icon` is a soft gradient badge sized for inline SVG (`.icon svg` at 21px) — **all emoji icons were replaced with hand-written line-icon SVGs** (stroke-width 1.8, viewBox 0 0 24 24) for a consistent, non-emoji look; only `partenaires.html`'s numbered `1`–`4` badges remain as plain text by design.
- **`assets/js/main.js`**: vanilla JS, no dependencies. Key behaviors: sticky header shrink-on-scroll, mobile nav toggle, scroll-reveal via `IntersectionObserver` (elements with `[data-reveal]`), news category filters on `actualites.html` (`data-filter` buttons vs. `data-category` cards — keep both in sync when adding a category), neutralizing placeholder `href="#"` links, and an article "lightbox" (clicking a news `article.card` opens it enlarged in a modal — `#article-lightbox`, present on `index.html` and `actualites.html` only). **As of 2026-07-21, both the filter buttons and all news `article.card` elements are removed** (empty "bientôt disponible" placeholder instead, on both pages) — the JS still no-ops safely with none present. Re-add real `data-filter`/`data-category` markup once genuine articles exist, don't reintroduce the invented placeholder dates.
- **`assets/images/`**: `logo.png` (club crest, optimized down from a ~4MB original) and `favicon.ico` generated from it.
- **`sitemap.xml` / `robots.txt`**: reference a placeholder domain `votre-domaine.fr` — this must be find-and-replaced (across all HTML files too, in the `<link rel="canonical">` and Open Graph tags) once a real domain is purchased.

## Real club facts — do not contradict these with invented content

- The club was **founded in 2020** — no multi-decade history, no senior/veteran/women's teams, no competitive fixtures, results, or league standings exist. Only two categories: **U6-U7** and **U8-U9**, "loisir" (fun-focused, not competitive), run 100% by volunteers.
- The club has **no players yet** — registrations for the first season just opened. Never say it "already has players/teams" (present tense); phrase player/team content prospectively ("nos futurs joueurs", "nos catégories"). The sponsoring PDF source claims otherwise in places — don't trust it on this point.
- Address: **Stade Robert Lemoine, 75 rue d'Orgemont, Saint-Gratien, Val-d'Oise**.
- Training: **Thursdays 17h–18h** — the only slot this season, shared by both categories. A second slot is only being considered **for next season**, not this one, and **no day is fixed for it yet** (don't say "Saturday" or any specific day) — it would only be requested from the town hall (mairie) if the club has enough registered members (adhérents) by then. Don't describe a second slot as already secured or scheduled for this year.
- On the field, coaches alone manage sessions — parents are asked not to intervene, however well-intentioned. Phrased warmly as a "Ce qu'il faut prévoir" item on `entrainements.html` (not as a blunt rule on `equipe.html`, where it read too harsh and was moved off on 2026-07-21).
- Contact: **contact.sgfc@yahoo.com**. No phone number is published on the site **except** on `partenaires.html`, where `06 60 23 49 55` appears as a dedicated sponsor/business contact (per the user's explicit choice) — every other page stays email-only.
- The club is an **association loi 1901**, no confirmed "intérêt général"/mécénat status — never claim a tax deduction on donations (e.g. no "60% déductible des impôts") unless the user confirms that status exists.
- A real sponsoring dossier (`Sponsoring.pdf`, provided by the user) is the source for `partenaires.html`: club needs (maillots, matériel sportif, location de terrain incl. **Atletica** — a real rented facility, distinct from the municipal Stade Robert Lemoine — and vie du club) and sponsor perks (logo maillots, réseaux sociaux, logo supports, événements/tournois).
- Social links: Instagram `https://www.instagram.com/sgfc95`, Facebook `https://www.facebook.com/SGFootballClub`. No YouTube — the icon was removed since no real profile exists.
- The site is **not deployed anywhere yet** (no GitHub Pages, no custom domain). Code lives at `https://github.com/Abudara25/SaintGratienFC` (public repo) only.

## Responsive

- `.grid-2` collapses to 1 column at **760px** (not 620px like `.grid-3`/`.grid-4`) — deliberately split in the `@media` rules so 2-column text+content sections (mission/encadrement, catégories, contreparties, etc.) don't get squeezed into narrow columns on tablets before stacking. Don't recombine that rule with `.grid-3`/`.grid-4` without re-checking nested-grid sections like index.html's "Un club, des valeurs".
- All `.btn` use `white-space: nowrap` — keep button labels short (≲25 chars); a longer label can overflow its column on narrow screens instead of wrapping. Fixed one real instance on 2026-07-21 (index.html partners CTA, was "Découvrir le dossier de sponsoring" → "Découvrir le dossier").
- **Tooling note**: `mcp__claude-in-chrome__resize_window` does not actually resize the browser viewport in this dev environment (confirmed via `window.innerWidth` staying at the real window size regardless of the requested width) — don't rely on it for visual mobile QA here; audit responsive behavior by reading the CSS media queries against each page's markup instead. Also, a long-lived tab caches `assets/css/styles.css` aggressively across navigations in this session — after editing the CSS, bust the cache (reset the `<link>` `href` with a `?bust=` query, or re-fetch with `cache:'no-store'`) before trusting `getComputedStyle` results, otherwise you'll be testing stale rules.
- **Fixed 2026-07-21**: `.site-header` had `backdrop-filter: blur(10px)`, which (like `transform`/`filter`/`perspective`/`will-change`) makes an element a new containing block for `position: fixed` descendants. Since `.main-nav` (the mobile slide-in menu) is `position: fixed` *inside* `.site-header`, its `inset: var(--header-h) 0 0 0` was resolving against the ~84px-tall header instead of the viewport — collapsing the panel to 0 height (menu opened but showed nothing). Removed `backdrop-filter` from `.site-header` to fix; confirmed via `getBoundingClientRect` before/after (0px → 626px). If a header blur effect is wanted again, put it on a `::before` pseudo-element instead of the header itself, never on an ancestor of the fixed nav.
- **Fixed 2026-07-21**: `.hero-crest img` had `width="360" height="360"` HTML attributes, but CSS only overrode `width: min(360px, 80%)` — `height` fell back to the fixed `360px` attribute on narrow screens, stretching the crest vertically. Added `height: auto` to `.hero-crest img`.

## Project-specific conventions

- Only add a "Lire la suite" / read-more link to a news card if there is genuinely more content behind it (a real detail page). None currently exist, so none are used — clicking a card opens the lightbox modal instead, which just shows the same teaser text enlarged.
- The footer "Newsletter" signup form is intentionally non-functional (`onsubmit` just calls `preventDefault()`, no backend) — it's a placeholder kept for future use at the user's request; don't remove it during cleanup passes.
