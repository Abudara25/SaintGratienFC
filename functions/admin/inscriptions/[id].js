// Édition d'une inscription (base D1 "DB"), liée depuis le bouton "Modifier" de
// /admin/inscriptions. Même garde d'authentification que la liste (voir _shared/admin-auth.js).
import { ensureInscriptionsTable } from '../../_shared/inscriptions-db.js';
import { isAuthed, loginPage, escapeHtml } from '../../_shared/admin-auth.js';

const REQUIRED_FIELDS = ['enfantPrenom', 'enfantNom', 'naissance', 'categorie', 'tailleMaillot', 'modePaiement', 'parentPrenom', 'parentNom', 'email'];

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
  autorisation: data.autorisation ? 1 : 0,
  droit_image: data.droitImage ? 1 : 0,
  rgpd: data.rgpd ? 1 : 0,
});

function editPage(row, { error } = {}) {
  const checked = (v) => (v ? 'checked' : '');
  const selected = (value, option) => (value === option ? 'selected' : '');

  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Modifier une inscription — Admin Saint-Gratien FC</title>
<meta name="robots" content="noindex, nofollow">
<link rel="stylesheet" href="/assets/css/styles.css?v=20260904">
</head><body style="padding:16px;max-width:640px;margin:0 auto;">
  <p style="margin-bottom:16px;"><a href="/admin/inscriptions">&larr; Retour à la liste</a></p>
  <h1 style="font-size:1.3rem;margin-bottom:16px;">Modifier l'inscription de ${escapeHtml(row.enfant_prenom)} ${escapeHtml(row.enfant_nom)}</h1>
  <p style="margin-bottom:16px;">Dossier signé : ${
    row.dossier_uploaded_at
      ? `<a href="/admin/inscriptions/${row.id}/dossier" target="_blank" rel="noopener">✓ Reçu — voir le fichier</a>`
      : '— pas encore reçu'
  }</p>
  ${error ? `<p style="color:var(--color-error, #b3261e);margin-bottom:16px;">${escapeHtml(error)}</p>` : ''}
  <form method="POST">
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
          <option value="U6 - U7" ${selected(row.categorie, 'U6 - U7')}>U6 - U7 (2020-2021)</option>
          <option value="U8 - U9" ${selected(row.categorie, 'U8 - U9')}>U8 - U9 (2018-2019)</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-field">
        <label for="taille-maillot">Taille de maillot</label>
        <select id="taille-maillot" name="tailleMaillot" required>
          <option value="4 ans" ${selected(row.taille_maillot, '4 ans')}>4 ans</option>
          <option value="6 ans" ${selected(row.taille_maillot, '6 ans')}>6 ans</option>
          <option value="8 ans" ${selected(row.taille_maillot, '8 ans')}>8 ans</option>
          <option value="10 ans" ${selected(row.taille_maillot, '10 ans')}>10 ans</option>
          <option value="12 ans" ${selected(row.taille_maillot, '12 ans')}>12 ans</option>
        </select>
      </div>
      <div class="form-field">
        <label for="mode-paiement">Mode de paiement</label>
        <select id="mode-paiement" name="modePaiement" required>
          <option value="HelloAsso" ${selected(row.mode_paiement, 'HelloAsso')}>HelloAsso</option>
          <option value="Espèces" ${selected(row.mode_paiement, 'Espèces')}>Espèces</option>
          <option value="Chèque" ${selected(row.mode_paiement, 'Chèque')}>Chèque</option>
        </select>
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
        <input type="tel" id="telephone" name="telephone" value="${escapeHtml(row.telephone || '')}">
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
    <div class="form-field" style="gap:12px;">
      <label style="display:flex;align-items:center;gap:10px;font-weight:400;">
        <input type="checkbox" name="autorisation" ${checked(row.autorisation)}>
        <span>Autorisation de participation</span>
      </label>
      <label style="display:flex;align-items:center;gap:10px;font-weight:400;">
        <input type="checkbox" name="droitImage" ${checked(row.droit_image)}>
        <span>Droit à l'image</span>
      </label>
      <label style="display:flex;align-items:center;gap:10px;font-weight:400;">
        <input type="checkbox" name="rgpd" ${checked(row.rgpd)}>
        <span>Consentement RGPD</span>
      </label>
    </div>
    <div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap;">
      <button type="submit" class="btn btn-primary" style="flex:1;min-width:140px;">Enregistrer</button>
      <a href="/admin/inscriptions" class="btn btn-dark" style="flex:1;min-width:140px;">Annuler</a>
    </div>
  </form>
</body></html>`;
}

export async function onRequestGet({ request, env, params }) {
  if (!isAuthed(request, env)) {
    return new Response(loginPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  await ensureInscriptionsTable(env.DB);
  const row = await env.DB.prepare('SELECT * FROM inscriptions WHERE id = ?').bind(Number(params.id)).first();
  if (!row) {
    return new Response('Inscription introuvable.', { status: 404 });
  }

  return new Response(editPage(row), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

export async function onRequestPost({ request, env, params }) {
  if (!isAuthed(request, env)) {
    return new Response(loginPage(), { status: 401, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  await ensureInscriptionsTable(env.DB);
  const id = Number(params.id);
  const existing = await env.DB.prepare('SELECT * FROM inscriptions WHERE id = ?').bind(id).first();
  if (!existing) {
    return new Response('Inscription introuvable.', { status: 404 });
  }

  const form = await request.formData();
  const data = Object.fromEntries(form.entries());

  for (const field of REQUIRED_FIELDS) {
    if (!String(data[field] ?? '').trim()) {
      return new Response(editPage({ ...existing, ...toRow(data) }, { error: `Champ manquant : ${field}` }), {
        status: 400,
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return new Response(editPage({ ...existing, ...toRow(data) }, { error: 'E-mail invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  }

  await env.DB.prepare(
    `UPDATE inscriptions SET
      enfant_prenom = ?, enfant_nom = ?, naissance = ?, categorie = ?, taille_maillot = ?, mode_paiement = ?,
      parent_prenom = ?, parent_nom = ?, email = ?, telephone = ?, adresse = ?, code_postal = ?, ville = ?,
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
      data.autorisation ? 1 : 0,
      data.droitImage ? 1 : 0,
      data.rgpd ? 1 : 0,
      id
    )
    .run();

  return new Response('', { status: 302, headers: { Location: '/admin/inscriptions' } });
}
