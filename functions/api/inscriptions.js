// Reçoit une soumission du formulaire d'inscription (inscription.html) et l'enregistre dans la
// base D1 "DB" (voir CLAUDE.md pour la création du binding). Le PDF est toujours généré côté
// client avant cet appel (assets/js/inscription.js) : cette requête ne bloque jamais le
// téléchargement du PDF, mais son résultat (uploadToken) conditionne désormais l'affichage du
// lien de dépôt du dossier signé (functions/depot/[token].js) — ce n'est plus un pur filet de
// sécurité silencieux comme avant l'ajout du dépôt (2026-09-04). Envoie aussi un e-mail de
// réception (pas de confirmation définitive, voir confirmation-email.js) via Brevo.
import { ensureInscriptionsTable, findExistingInscription, buildDedupKey } from '../_shared/inscriptions-db.js';
import { sendConfirmationEmail, sendAdminNotification } from '../_shared/confirmation-email.js';
import { getCategoriesConfig } from '../_shared/settings-kv.js';

const REQUIRED_FIELDS = ['enfantPrenom', 'enfantNom', 'naissance', 'categorie', 'tailleMaillot', 'modePaiement', 'parentPrenom', 'parentNom', 'email', 'telephone'];

// Contrôle temps réel pendant la saisie (voir assets/js/inscription.js, déclenché au blur de
// prénom/nom/e-mail) : ne renvoie qu'un booléen, jamais createdAt/uploadToken — contrairement au
// POST complet (16 champs requis + validations), ce GET public en query string est trivial à
// sonder en boucle, donc on limite volontairement ce qu'il expose.
export async function onRequestGet({ request, env }) {
  const { searchParams } = new URL(request.url);
  const enfantPrenom = searchParams.get('enfantPrenom') || '';
  const enfantNom = searchParams.get('enfantNom') || '';
  const email = searchParams.get('email') || '';
  const naissance = searchParams.get('naissance') || '';

  if (!enfantPrenom.trim() || !enfantNom.trim() || !email.trim()) {
    return new Response(JSON.stringify({ error: 'Paramètres manquants' }), { status: 400 });
  }

  try {
    await ensureInscriptionsTable(env.DB);
    const { saison } = await getCategoriesConfig(env);
    const existing = await findExistingInscription(env.DB, { enfantPrenom, enfantNom, naissance, email }, saison);
    return new Response(JSON.stringify({ duplicate: !!existing }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Échec de la vérification' }), { status: 500 });
  }
}

export async function onRequestPost({ request, env, waitUntil }) {
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

  // Lu côté serveur (pas data.saison envoyé par le client) : reste la source de vérité même si le
  // navigateur avait chargé /api/categories avant un changement de saison entre-temps. Sert à la
  // fois à scoper le contrôle anti-doublon ci-dessous à la saison en cours (voir
  // findExistingInscription) et à tamponner la fiche pour l'action "Archiver les saisons
  // précédentes"/"Envoyer le lien de réinscription" de /admin/inscriptions et /admin/categories.
  const { saison } = await getCategoriesConfig(env);

  try {
    await ensureInscriptionsTable(env.DB);

    // Anti-doublon : un même enfant (nom+prénom+naissance) déjà inscrit par le même parent
    // (e-mail) POUR LA SAISON EN COURS ne recrée pas une nouvelle fiche. Ajouté après qu'un parent
    // a soumis 4 fois de suite le même dossier (clics répétés) — chaque soumission créait une ligne
    // D1 distincte et renvoyait un nouvel e-mail de confirmation. Scopé à `saison` depuis l'ajout de
    // la réinscription : sans ça, une famille qui se réinscrit légitimement l'année suivante était
    // bloquée par sa fiche de l'an dernier. Requête factorisée dans _shared/inscriptions-db.js (aussi
    // utilisée par le contrôle temps réel, onRequestGet ci-dessus, et par functions/reinscription/
    // [token].js).
    const existing = await findExistingInscription(
      env.DB,
      {
        enfantPrenom: data.enfantPrenom,
        enfantNom: data.enfantNom,
        naissance: data.naissance,
        email: data.email,
      },
      saison
    );

    if (existing) {
      return new Response(
        JSON.stringify({ duplicate: true, uploadToken: existing.upload_token, createdAt: existing.created_at }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch {
    return new Response(JSON.stringify({ error: "Échec de la vérification" }), { status: 500 });
  }

  const uploadToken = crypto.randomUUID();
  const dedupKey = buildDedupKey({ enfantPrenom: data.enfantPrenom, enfantNom: data.enfantNom, email: data.email });

  try {
    await env.DB.prepare(
      `INSERT INTO inscriptions
        (enfant_prenom, enfant_nom, naissance, categorie, taille_maillot, mode_paiement, parent_prenom, parent_nom, email, telephone, adresse, code_postal, ville, autorisation, droit_image, rgpd, upload_token, dedup_key, saison)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        uploadToken,
        dedupKey,
        saison
      )
      .run();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Échec de l'enregistrement" }), { status: 500 });
  }

  // waitUntil (pas await) : l'envoi de l'e-mail continue après la réponse HTTP, sans ajouter de
  // latence pour le parent — sendConfirmationEmail() est déjà best-effort en interne.
  // data.pdfBase64 (optionnel, généré côté client par getInscriptionPdfBase64() dans
  // pdf-inscription.js) est joint en pièce jointe à l'e-mail — voir confirmation-email.js.
  const siteUrl = new URL(request.url).origin;
  waitUntil(sendConfirmationEmail(env, data, uploadToken, siteUrl));
  // Notifie aussi le club (contact@saintgratienfc.fr) : jusqu'ici, seule la famille recevait un
  // e-mail — le club devait consulter /admin/inscriptions manuellement pour savoir qu'une nouvelle
  // demande était arrivée.
  waitUntil(sendAdminNotification(env, data, siteUrl));

  return new Response(JSON.stringify({ ok: true, uploadToken }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
