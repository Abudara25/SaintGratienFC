// Remplace la mise à jour manuelle des ?v=AAAAMMJJ (voir CLAUDE.md, cache 4h de Cloudflare Pages) :
//   - chaque référence à assets/css/*.css ou assets/js/*.js dans les pages HTML et les Functions reçoit
//     l'empreinte du fichier (?v=<10 caractères>) : elle change toute seule quand le fichier change ;
//   - ASSETS_VERSION (functions/_shared/admin-auth.js) reçoit l'empreinte de l'ensemble des assets ;
//   - le header et le footer de chaque page HTML sont comparés à ceux d'index.html, et recopiés.
//
// npm run sync             → applique
// npm run sync -- --check  → n'écrit rien, sort en erreur si quelque chose n'est pas à jour
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const checkOnly = process.argv.includes('--check');

const read = (file) => readFileSync(join(root, file), 'utf8');
const digest = (content) => createHash('sha256').update(content).digest('hex').slice(0, 10);

function walk(dir, filter) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path, filter);
    return filter(entry.name) ? [path.replace(/\\/g, '/')] : [];
  });
}

const htmlPages = readdirSync(root).filter((name) => name.endsWith('.html'));
const functionFiles = walk('functions', (name) => name.endsWith('.js'));
const assetFiles = [...walk('assets/css', (n) => n.endsWith('.css')), ...walk('assets/js', (n) => n.endsWith('.js'))].sort();

const changes = [];
const pending = new Map();
const contentOf = (file) => pending.get(file) ?? read(file);
const update = (file, next, reason) => {
  if (next === contentOf(file)) return;
  pending.set(file, next);
  changes.push(`${file} : ${reason}`);
};

// 1. Versions des assets
const assetHash = new Map(assetFiles.map((file) => [file, digest(read(file))]));
const ASSET_REF = /(\/?)(assets\/(?:css|js)\/[\w.-]+\.(?:css|js))\?v=[\w-]+/g;
for (const file of [...htmlPages, ...functionFiles]) {
  const next = contentOf(file).replace(ASSET_REF, (match, slash, path) => (assetHash.has(path) ? `${slash}${path}?v=${assetHash.get(path)}` : match));
  update(file, next, 'versions des assets');
}

const adminAuth = 'functions/_shared/admin-auth.js';
const globalHash = digest(assetFiles.map((file) => `${file}:${assetHash.get(file)}`).join('\n'));
update(adminAuth, contentOf(adminAuth).replace(/const ASSETS_VERSION = '[\w-]+';/, `const ASSETS_VERSION = '${globalHash}';`), 'ASSETS_VERSION');

// 2. Header et footer identiques à index.html (404.html garde son footer réduit, sans scripts)
const block = (html, tag) => html.match(new RegExp(`<${tag} class="site-${tag}">[\\s\\S]*?</${tag}>`))?.[0];
const reference = { header: block(read('index.html'), 'header'), footer: block(read('index.html'), 'footer') };
for (const page of htmlPages.filter((p) => p !== 'index.html')) {
  for (const tag of page === '404.html' ? ['header'] : ['header', 'footer']) {
    const html = contentOf(page);
    const current = block(html, tag);
    if (current && current !== reference[tag]) update(page, html.replace(current, reference[tag]), `${tag} recopié depuis index.html`);
  }
}

if (!changes.length) {
  console.log('Tout est à jour.');
} else if (checkOnly) {
  console.error(`À mettre à jour (lancez npm run sync) :\n- ${changes.join('\n- ')}`);
  process.exitCode = 1;
} else {
  for (const [file, content] of pending) writeFileSync(join(root, file), content);
  console.log(`Mis à jour :\n- ${changes.join('\n- ')}`);
}
console.log(`(${relative(root, root) || '.'} — ${assetFiles.length} assets suivis)`);
