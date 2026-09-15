// Fiche d'une inscription (base D1 "DB") : vue détaillée avec ses actions (paiement, relance, PDF,
// dépôt manuel du dossier, archivage) et, avec ?edit=1, le formulaire de modification. Liée depuis
// les cartes de /admin/inscriptions et depuis /admin/reinscription. Les actions sont traitées par
// functions/admin/inscriptions.js (ou [id]/dossier.js pour le dépôt) et reviennent ici via redirectTo.
import { ensureInscriptionsTable, isInscriptionComplete } from '../../_shared/inscriptions-db.js';
import {
  isAuthed,
  loginPage,
  escapeHtml,
  adminHead,
  adminShell,
  adminScripts,
  icon,
  avatar,
  statusTag,
  flash,
  formatDateFr,
  formatBirth,
} from '../../_shared/admin-auth.js';
import { getCategoriesConfig } from '../../_shared/settings-kv.js';

const REQUIRED_FIELDS = ['enfantPrenom', 'enfantNom', 'naissance', 'categorie', 'tailleMaillot', 'modePaiement', 'parentPrenom', 'parentNom', 'email', 'telephone'];
const LONG_DATE = { day: 'numeric', month: 'long', year: 'numeric' };
const html = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });

// Reconstruit un objet "row" (clés snake_case, comme en base) à partir du formData resoumis, pour
// réafficher les valeurs saisies par l'utilisateur (et pas les anciennes valeurs) en cas d'erreur.
const toRow = (data) => ({
  enfant_prenom: data.enfantPrenom,
  enfant_nom: data.enfantNom,
  naissance: data.naissance,
  categorie: data.categorie,
  taille_maillot: data.tailleMaillot,
  mode_paiement: data.modePaiement,
  parent_prenom: data.parentPrenom,
  parent_nom: data.parentNom,
  email: data.email,
  telephone: data.telephone,
  adresse: data.adresse,
  code_postal: data.codePostal,
  ville: data.ville,
  parent2_prenom: data.parent2Prenom,
  parent2_nom: data.parent2Nom,
  parent2_email: data.parent2Email,
  parent2_telephone: data.parent2Telephone,
  autorisation: data.autorisation ? 1 : 0,
  droit_image: data.droitImage ? 1 : 0,
  rgpd: data.rgpd ? 1 : 0,
});

function actionForm(fields, { label, iconName, className, confirm }) {
  const hidden = Object.entries(fields)
    .map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(String(value))}">`)
    .join('');
  return `<form method="POST" action="/admin/inscriptions"${confirm ? ' class="admin-confirm-form"' : ''}>${hidden}<button type="submit" class="adm-btn ${className}"${
    confirm ? ` data-confirm="${escapeHtml(confirm)}"` : ''
  }>${icon(iconName)}${label}</button></form>`;
}

function fichePage(row, { saison, prix, siteUrl, messages }) {
  const rawName = `${row.enfant_prenom} ${row.enfant_nom}`;
  const name = escapeHtml(rawName);
  const docOk = Boolean(row.dossier_uploaded_at);
  const payOk = Boolean(row.paye);
  const photoOk = Boolean(row.photo_uploaded_at);
  const archived = Boolean(row.archived_at);
  const self = `/admin/inscriptions/${row.id}`;
  const depotPath = row.upload_token ? `/depot/${row.upload_token}` : '';

  // Même document que celui produit à l'inscription (assets/js/pdf-inscription.js, régénéré côté
  // client) : utile si la famille a perdu l'e-mail de confirmation et que le club veut le renvoyer.
  const pdfData = {
    enfantPrenom: row.enfant_prenom,
    enfantNom: row.enfant_nom,
    naissance: row.naissance,
    categorie: row.categorie,
    saison,
    prix,
    tailleMaillot: row.taille_maillot,
    modePaiement: row.mode_paiement,
    parentPrenom: row.parent_prenom,
    parentNom: row.parent_nom,
    email: row.email,
    telephone: row.telephone,
    adresse: row.adresse,
    codePostal: row.code_postal,
    ville: row.ville,
    droitImage: row.droit_image,
    parent2Prenom: row.parent2_prenom,
    parent2Nom: row.parent2_nom,
    parent2Email: row.parent2_email,
    parent2Telephone: row.parent2_telephone,
  };
  const pdfBtn = `<button type="button" class="adm-btn adm-btn-ghost adm-pdf-btn" data-pdf='${escapeHtml(JSON.stringify(pdfData))}' data-depot-url="${escapeHtml(
    depotPath ? `${siteUrl}${depotPath}` : ''
  )}">${icon('download')}Télécharger le PDF</button>`;
  const editBtn = `<a href="${self}?edit=1" class="adm-btn adm-btn-ghost">${icon('edit')}Modifier</a>`;

  const actions = archived
    ? `${actionForm({ action: 'restore', id: row.id, redirectTo: self }, { label: 'Restaurer', iconName: 'refresh', className: 'adm-btn-primary' })}
      ${editBtn}${pdfBtn}
      <span class="adm-actionbar-spacer"></span>
      ${actionForm(
        { action: 'delete', id: row.id, view: 'archive' },
        { label: 'Supprimer définitivement', iconName: 'trash', className: 'adm-btn-danger-solid', confirm: `Supprimer définitivement ${rawName} ? Cette action est irréversible, contrairement à l'archivage.` }
      )}`
    : `${actionForm(
        { action: 'toggle-paye', id: row.id, redirectTo: self },
        payOk
          ? { label: 'Marquer non payé', iconName: 'card', className: 'adm-btn-ghost', confirm: `Marquer ${rawName} comme NON payé ?` }
          : { label: 'Marquer payé', iconName: 'check', className: 'adm-btn-primary', confirm: `Confirmer que ${rawName} a payé ?` }
      )}
      ${editBtn}${pdfBtn}
      ${
        isInscriptionComplete(row)
          ? ''
          : actionForm(
              { action: 'bulk-reminder', ids: row.id, redirectTo: self },
              { label: 'Relancer', iconName: 'send', className: 'adm-btn-ghost', confirm: `Envoyer une relance par e-mail à ${row.email} (dossier, photo ou paiement manquant) ?` }
            )
      }
      <span class="adm-actionbar-spacer"></span>
      ${actionForm(
        { action: 'archive', id: row.id, redirectTo: self },
        { label: 'Archiver', iconName: 'archive', className: 'adm-btn-danger', confirm: `Archiver ${rawName} ? Le profil sera déplacé dans la corbeille, récupérable à tout moment.` }
      )}`;

  const kv = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const yesNo = (value) => (value ? 'Oui' : 'Non');
  const hasParent2 = Boolean(row.parent2_prenom || row.parent2_nom);
  const adresse =
    [row.adresse, [row.code_postal, row.ville].filter(Boolean).join(' ')]
      .filter(Boolean)
      .map(escapeHtml)
      .join(', ') || '—';

  const enfant = `<section class="adm-surface">
    <h2 class="adm-h2">${icon('user')}Enfant</h2>
    <dl class="adm-kv">
      ${kv('Naissance', formatBirth(row.naissance))}
      ${kv('Catégorie', escapeHtml(row.categorie))}
      ${kv('Taille de maillot', escapeHtml(row.taille_maillot || '—'))}
      ${kv('Saison', escapeHtml(row.saison || '—'))}
      ${kv('Autorisation de participation', yesNo(row.autorisation))}
      ${kv("Droit à l'image", yesNo(row.droit_image))}
      ${kv('Consentement RGPD', yesNo(row.rgpd))}
    </dl>
  </section>`;

  const parent = `<section class="adm-surface">
    <h2 class="adm-h2">${icon('phone')}${hasParent2 ? 'Responsables légaux' : 'Responsable légal'}</h2>
    <dl class="adm-kv">
      ${kv('Nom', `${escapeHtml(row.parent_prenom)} ${escapeHtml(row.parent_nom)}`)}
      ${kv('Téléphone', row.telephone ? `<a class="adm-link" href="tel:${escapeHtml(String(row.telephone).replace(/[^\d+]/g, ''))}">${escapeHtml(row.telephone)}</a>` : '—')}
      ${kv('E-mail', `<a class="adm-link" href="mailto:${escapeHtml(row.email)}">${escapeHtml(row.email)}</a>`)}
      ${kv('Adresse', adresse)}
      ${
        hasParent2
          ? `${kv('2e responsable', `${escapeHtml(row.parent2_prenom || '')} ${escapeHtml(row.parent2_nom || '')}`)}
      ${kv('Téléphone (2e)', row.parent2_telephone ? `<a class="adm-link" href="tel:${escapeHtml(String(row.parent2_telephone).replace(/[^\d+]/g, ''))}">${escapeHtml(row.parent2_telephone)}</a>` : '—')}
      ${kv('E-mail (2e)', row.parent2_email ? `<a class="adm-link" href="mailto:${escapeHtml(row.parent2_email)}">${escapeHtml(row.parent2_email)}</a>` : '—')}`
          : ''
      }
    </dl>
  </section>`;

  const dossier = `<section class="adm-surface">
    <h2 class="adm-h2">${icon('file')}Dossier &amp; paiement</h2>
    <dl class="adm-kv">
      ${kv('Document', statusTag(docOk))}
      ${docOk ? kv('Reçu le', formatDateFr(row.dossier_uploaded_at, LONG_DATE)) : ''}
      ${kv('Paiement', statusTag(payOk))}
      ${kv('Mode de paiement', escapeHtml(row.mode_paiement || '—'))}
      ${row.helloasso_order_id ? kv('Validé par HelloAsso', `commande n° ${escapeHtml(row.helloasso_order_id)}`) : ''}
      ${row.last_reminder_at ? kv('Dernière relance', `${formatDateFr(row.last_reminder_at, LONG_DATE)}${row.auto_reminders_sent ? ` (${row.auto_reminders_sent} auto.)` : ''}`) : ''}
      ${depotPath ? kv('Page de suivi famille', `<a class="adm-link" href="${escapeHtml(depotPath)}" target="_blank" rel="noopener">Ouvrir</a>`) : ''}
    </dl>
    ${docOk ? `<a href="${self}/dossier" target="_blank" rel="noopener" class="adm-btn adm-btn-ghost adm-btn-block">${icon('eye')}Voir le dossier reçu</a>` : ''}
    <form method="POST" action="${self}/dossier" enctype="multipart/form-data" class="adm-upload">
      <input type="hidden" name="redirectTo" value="${self}">
      <label for="dossier-file">${docOk ? 'Remplacer par un autre fichier' : 'Dossier signé reçu par e-mail ?'}<small>PDF, JPG ou PNG, 10 Mo maximum.</small></label>
      <input type="file" id="dossier-file" name="dossier" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required>
      <button type="submit" class="adm-btn adm-btn-sm adm-btn-primary">${icon('upload')}${docOk ? 'Remplacer le dossier' : 'Enregistrer le dossier'}</button>
    </form>
  </section>`;

  const photo = `<section class="adm-surface">
    <h2 class="adm-h2">${icon('camera')}Photo de l'enfant</h2>
    <div class="adm-photo">${
      photoOk
        ? `<a href="${self}/photo" target="_blank" rel="noopener"><img src="${self}/photo?v=${encodeURIComponent(row.photo_uploaded_at)}" alt="Photo de ${name}"></a>`
        : `<span class="adm-photo-empty">${icon('camera')}Pas encore de photo</span>`
    }</div>
    <dl class="adm-kv">
      ${kv('Photo', statusTag(photoOk, { yes: 'Validée', no: 'Non validée' }))}
      ${photoOk ? kv('Reçue le', formatDateFr(row.photo_uploaded_at, LONG_DATE)) : ''}
    </dl>
    <form method="POST" action="${self}/photo" enctype="multipart/form-data" class="adm-upload">
      <label for="photo-file">${photoOk ? 'Remplacer par une autre photo' : 'Photo reçue par e-mail ?'}<small>JPG, PNG ou WebP, 10 Mo maximum — de face, sur fond blanc.</small></label>
      <input type="file" id="photo-file" name="photo" accept="image/jpeg,image/png,image/webp" required>
      <button type="submit" class="adm-btn adm-btn-sm adm-btn-primary">${icon('upload')}${photoOk ? 'Remplacer la photo' : 'Enregistrer la photo'}</button>
    </form>
  </section>`;

  const flashes = [
    messages.savedOk && flash('ok', 'Fiche mise à jour.'),
    messages.dossierOk && flash('ok', 'Dossier enregistré.'),
    messages.dossierError && flash('error', messages.dossierError),
    messages.photoOk && flash('ok', 'Photo enregistrée.'),
    messages.photoError && flash('error', messages.photoError),
    messages.bulkOk && flash('ok', messages.bulkOk),
  ]
    .filter(Boolean)
    .join('');

  return `${adminHead(rawName)}
${adminShell({
  active: archived ? 'archive' : 'inscriptions',
  back: archived ? { href: '/admin/inscriptions?view=archive', label: 'Corbeille' } : { href: '/admin/inscriptions', label: 'Inscriptions' },
  lead: avatar(row, 'lg'),
  eyebrow: "Fiche d'inscription",
  title: name,
  subtitle: `${escapeHtml(row.categorie)} · inscription du ${formatDateFr(row.created_at, LONG_DATE)}${archived ? ` · archivée le ${formatDateFr(row.archived_at, LONG_DATE)}` : ''}`,
  meta: `<div class="adm-hero-tags"><span>Document</span>${statusTag(docOk)}<span>Photo</span>${statusTag(photoOk, { yes: 'Validée', no: 'Non validée' })}<span>Paiement</span>${statusTag(payOk)}</div>`,
})}
<main id="adm-main" class="adm-wrap adm-main">
  ${flashes}
  <div class="adm-surface adm-actionbar">${actions}</div>
  <div class="adm-fiche-grid">${enfant}${parent}${dossier}${photo}</div>
</main>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js" integrity="sha512-plOdviVmws4Y3JAvbnpfKb2hVxKM1lCwsi3vmElYRj+tiDLffZ4FVUj5a8vyKJ9pIgl8JCAHEJ4D1iUKBecswg==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
${adminScripts('pdf-inscription', 'admin-nav', 'admin-inscriptions')}
</body></html>`;
}

function editPage(row, categories, { error } = {}) {
  const checked = (v) => (v ? 'checked' : '');
  const selected = (value, option) => (value === option ? 'selected' : '');
  const name = `${escapeHtml(row.enfant_prenom)} ${escapeHtml(row.enfant_nom)}`;

  // La catégorie de la fiche peut avoir été renommée/supprimée depuis /admin/categories : on
  // l'ajoute à la liste si elle n'y figure plus, pour ne jamais faire disparaître silencieusement la
  // valeur enregistrée du formulaire (voir aussi le filtre "catégorie" de /admin/inscriptions, qui
  // dérive sa propre liste des données plutôt que de cette config éditable).
  const categoryOptions = categories.some((c) => c.label === row.categorie) ? categories : [...categories, { label: row.categorie }];

  return `${adminHead(`Modifier — ${row.enfant_prenom} ${row.enfant_nom}`)}
${adminShell({
  active: row.archived_at ? 'archive' : 'inscriptions',
  back: { href: `/admin/inscriptions/${row.id}`, label: 'Retour à la fiche' },
  lead: avatar(row, 'lg'),
  eyebrow: 'Modifier la fiche',
  title: name,
})}
<main id="adm-main" class="adm-wrap adm-main adm-main-narrow">
  ${error ? flash('error', error) : ''}
  <form method="POST" class="adm-surface">
    <section class="adm-form-section">
      <h2 class="adm-h2">${icon('user')}Enfant</h2>
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
          <select id="categorie" name="categorie" required>
            ${categoryOptions
              .map((c) => {
                const annees = c.anneeMin == null ? '' : c.anneeMin === c.anneeMax ? ` (${c.anneeMin})` : ` (${c.anneeMin}-${c.anneeMax})`;
                return `<option value="${escapeHtml(c.label)}" ${selected(row.categorie, c.label)}>${escapeHtml(c.label)}${annees}</option>`;
              })
              .join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label for="taille-maillot">Taille de maillot</label>
          <select id="taille-maillot" name="tailleMaillot" required>
            ${['4 ans', '6 ans', '8 ans', '10 ans', '12 ans'].map((t) => `<option value="${t}" ${selected(row.taille_maillot, t)}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label for="mode-paiement">Mode de paiement</label>
          <select id="mode-paiement" name="modePaiement" required>
            ${['HelloAsso', 'Espèces', 'Chèque'].map((m) => `<option value="${m}" ${selected(row.mode_paiement, m)}>${m}</option>`).join('')}
          </select>
        </div>
      </div>
    </section>

    <section class="adm-form-section">
      <h2 class="adm-h2">${icon('phone')}Responsable légal</h2>
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
    </section>

    <section class="adm-form-section">
      <h2 class="adm-h2">${icon('users')}Second responsable légal <span class="adm-count">facultatif</span></h2>
      <div class="form-row">
        <div class="form-field">
          <label for="parent2-prenom">Prénom</label>
          <input type="text" id="parent2-prenom" name="parent2Prenom" value="${escapeHtml(row.parent2_prenom || '')}">
        </div>
        <div class="form-field">
          <label for="parent2-nom">Nom</label>
          <input type="text" id="parent2-nom" name="parent2Nom" value="${escapeHtml(row.parent2_nom || '')}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label for="parent2-email">E-mail</label>
          <input type="email" id="parent2-email" name="parent2Email" value="${escapeHtml(row.parent2_email || '')}">
        </div>
        <div class="form-field">
          <label for="parent2-telephone">Téléphone</label>
          <input type="tel" id="parent2-telephone" name="parent2Telephone" value="${escapeHtml(row.parent2_telephone || '')}">
        </div>
      </div>
    </section>

    <section class="adm-form-section">
      <h2 class="adm-h2">${icon('check')}Autorisations</h2>
      <label class="adm-check"><input type="checkbox" name="autorisation" ${checked(row.autorisation)}><span>Autorisation de participation</span></label>
      <label class="adm-check"><input type="checkbox" name="droitImage" ${checked(row.droit_image)}><span>Droit à l'image</span></label>
      <label class="adm-check"><input type="checkbox" name="rgpd" ${checked(row.rgpd)}><span>Consentement RGPD</span></label>
    </section>

    <div class="adm-form-actions adm-form-actions-wide" style="margin-top:20px;">
      <button type="submit" class="adm-btn adm-btn-primary">${icon('check')}Enregistrer</button>
      <a href="/admin/inscriptions/${row.id}" class="adm-btn adm-btn-ghost">Annuler</a>
    </div>
  </form>
</main>
${adminScripts('admin-nav')}
</body></html>`;
}

export async function onRequestGet({ request, env, params }) {
  if (!(await isAuthed(request, env))) {
    return html(loginPage());
  }

  await ensureInscriptionsTable(env.DB);
  const row = await env.DB.prepare('SELECT * FROM inscriptions WHERE id = ?').bind(Number(params.id)).first();
  if (!row) {
    return new Response('Inscription introuvable.', { status: 404 });
  }

  const url = new URL(request.url);
  const { categories, saison, prix } = await getCategoriesConfig(env);
  if (url.searchParams.get('edit') === '1') {
    return html(editPage(row, categories));
  }
  return html(
    fichePage(row, {
      saison,
      prix,
      siteUrl: url.origin,
      messages: {
        savedOk: url.searchParams.get('savedOk'),
        dossierOk: url.searchParams.get('dossierOk'),
        dossierError: url.searchParams.get('dossierError'),
        bulkOk: url.searchParams.get('bulkOk'),
        photoOk: url.searchParams.get('photoOk'),
        photoError: url.searchParams.get('photoError'),
      },
    })
  );
}

export async function onRequestPost({ request, env, params }) {
  if (!(await isAuthed(request, env))) {
    return html(loginPage(), 401);
  }

  await ensureInscriptionsTable(env.DB);
  const id = Number(params.id);
  const existing = await env.DB.prepare('SELECT * FROM inscriptions WHERE id = ?').bind(id).first();
  if (!existing) {
    return new Response('Inscription introuvable.', { status: 404 });
  }

  const form = await request.formData();
  const data = Object.fromEntries(form.entries());
  const { categories } = await getCategoriesConfig(env);

  for (const field of REQUIRED_FIELDS) {
    if (!String(data[field] ?? '').trim()) {
      return html(editPage({ ...existing, ...toRow(data) }, categories, { error: `Champ manquant : ${field}` }), 400);
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return html(editPage({ ...existing, ...toRow(data) }, categories, { error: 'E-mail invalide' }), 400);
  }
  if (data.parent2Email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.parent2Email.trim())) {
    return html(editPage({ ...existing, ...toRow(data) }, categories, { error: 'E-mail du second responsable invalide' }), 400);
  }

  await env.DB.prepare(
    `UPDATE inscriptions SET
      enfant_prenom = ?, enfant_nom = ?, naissance = ?, categorie = ?, taille_maillot = ?, mode_paiement = ?,
      parent_prenom = ?, parent_nom = ?, email = ?, telephone = ?, adresse = ?, code_postal = ?, ville = ?,
      parent2_prenom = ?, parent2_nom = ?, parent2_email = ?, parent2_telephone = ?,
      autorisation = ?, droit_image = ?, rgpd = ?
     WHERE id = ?`
  )
    .bind(
      data.enfantPrenom.trim(),
      data.enfantNom.trim(),
      data.naissance,
      data.categorie,
      data.tailleMaillot,
      data.modePaiement,
      data.parentPrenom.trim(),
      data.parentNom.trim(),
      data.email.trim(),
      data.telephone?.trim() || null,
      data.adresse?.trim() || null,
      data.codePostal?.trim() || null,
      data.ville?.trim() || null,
      data.parent2Prenom?.trim() || null,
      data.parent2Nom?.trim() || null,
      data.parent2Email?.trim() || null,
      data.parent2Telephone?.trim() || null,
      data.autorisation ? 1 : 0,
      data.droitImage ? 1 : 0,
      data.rgpd ? 1 : 0,
      id
    )
    .run();

  return new Response('', { status: 302, headers: { Location: `/admin/inscriptions/${id}?savedOk=1` } });
}
