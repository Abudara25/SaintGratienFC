// Reçoit une soumission du formulaire d'inscription (inscription.html) et l'enregistre dans la
// base D1 "DB" (voir CLAUDE.md pour la création du binding). Le PDF est toujours généré côté
// client avant cet appel (assets/js/inscription.js) : cette requête ne bloque jamais le
// téléchargement du PDF, mais son résultat (uploadToken) conditionne désormais l'affichage du
// lien de dépôt du dossier signé (functions/depot/[token].js) — ce n'est plus un pur filet de
// sécurité silencieux comme avant l'ajout du dépôt (2026-09-04).
import { ensureInscriptionsTable } from '../_shared/inscriptions-db.js';

const REQUIRED_FIELDS = ['enfantPrenom', 'enfantNom', 'naissance', 'categorie', 'tailleMaillot', 'modePaiement', 'parentPrenom', 'parentNom', 'email'];

export async function onRequestPost({ request, env }) {
  let data;
  try {
    data = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400 });
  }

  for (const field of REQUIRED_FIELDS) {
    if (!String(data[field] ?? '').trim()) {
      return new Response(JSON.stringify({ error: `Champ manquant : ${field}` }), { status: 400 });
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return new Response(JSON.stringify({ error: 'E-mail invalide' }), { status: 400 });
  }
  // Format contrôlé (pas juste "non vide") : ce champ est ensuite utilisé tel quel pour dériver
  // la liste des années de naissance affichée dans les filtres de /admin/inscriptions.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.naissance)) {
    return new Response(JSON.stringify({ error: 'Date de naissance invalide' }), { status: 400 });
  }

  const uploadToken = crypto.randomUUID();

  try {
    await ensureInscriptionsTable(env.DB);
    await env.DB.prepare(
      `INSERT INTO inscriptions
        (enfant_prenom, enfant_nom, naissance, categorie, taille_maillot, mode_paiement, parent_prenom, parent_nom, email, telephone, adresse, code_postal, ville, autorisation, droit_image, rgpd, upload_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        uploadToken
      )
      .run();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Échec de l'enregistrement" }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, uploadToken }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
