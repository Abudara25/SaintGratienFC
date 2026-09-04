// Génération du PDF de fiche d'inscription — partagé entre inscription.js (généré par la famille
// à la soumission du formulaire) et functions/admin/inscriptions.js (regénéré par un responsable
// du club, ex. si la famille n'a pas reçu le mail de confirmation et souhaite le renvoyer). Script
// classique (pas de module), les fonctions sont globales comme le reste de assets/js/*.js.
// Dépend de window.jspdf (cdnjs.cloudflare.com/ajax/libs/jspdf), à charger avant ce fichier.

function buildInscriptionPdfDoc(data, depotUrl) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFillColor(58, 15, 16);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(244, 182, 88);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Saint-Gratien FC', 14, 18);
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("Fiche d'inscription — Saison 2026-2027", 14, 25);

  let y = 42;
  doc.setTextColor(30, 30, 30);

  const heading = (text) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(text, 14, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
  };
  const line = (text) => {
    doc.text(text, 14, y);
    y += 6;
  };

  heading('Enfant');
  line(`Nom : ${data.enfantNom}`);
  line(`Prénom : ${data.enfantPrenom}`);
  line(`Date de naissance : ${data.naissance || '—'}`);
  line(`Catégorie : ${data.categorie}`);
  line(`Taille de maillot : ${data.tailleMaillot || '—'}`);
  y += 4;

  heading('Parent / responsable légal');
  line(`Nom : ${data.parentNom}`);
  line(`Prénom : ${data.parentPrenom}`);
  line(`E-mail : ${data.email}`);
  line(`Téléphone : ${data.telephone || '—'}`);
  line(`Adresse : ${data.adresse || '—'}, ${data.codePostal || ''} ${data.ville || ''}`.trim());
  y += 4;

  heading('Offre choisie');
  line('Adhésion saison 2026-2027 — 180 €');
  line('Licence + tenue complète Patrick (maillot, short, survêtement, sac)');
  line(`Mode de paiement : ${data.modePaiement || '—'}`);
  y += 4;

  heading('Autorisations');
  line("J'autorise mon enfant à participer aux entraînements et activités du Saint-Gratien FC.");
  line(`Droit à l'image (photos/vidéos du club) : ${data.droitImage ? 'Oui' : 'Non'}`);
  y += 8;

  doc.text('Fait à _______________________, le _______________', 14, y);
  y += 10;
  doc.text('Signature du responsable légal :', 14, y);
  y += 20;
  doc.line(14, y, 90, y);
  y += 14;

  if (depotUrl) {
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text('Une fois signé, déposez ce dossier ici :', 14, y);
    y += 6;
    doc.setTextColor(58, 15, 16);
    doc.textWithLink(depotUrl, 14, y, { url: depotUrl });
    y += 4;
  }

  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(
    depotUrl
      ? 'Vous pouvez aussi apporter ce dossier signé directement au club (premier entraînement). Adhésion à régler sur HelloAsso, ou en espèces/chèque en apportant ce dossier.'
      : "À apporter signé au club (premier entraînement) ou à envoyer à contact@saintgratienfc.fr. Adhésion à régler sur HelloAsso, ou en espèces/chèque en apportant ce dossier.",
    14,
    285
  );

  return doc;
}

function inscriptionPdfFilename(data) {
  return `inscription-${data.enfantPrenom}-${data.enfantNom}.pdf`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-');
}

function downloadInscriptionPdf(data, depotUrl) {
  const doc = buildInscriptionPdfDoc(data, depotUrl);
  doc.save(inscriptionPdfFilename(data));
}

// Base64 brut (sans le préfixe "data:application/pdf;base64,") — utilisé pour joindre le PDF à
// l'e-mail de confirmation envoyé côté serveur (voir functions/api/inscriptions.js). Généré sans
// depotUrl : le lien de dépôt est de toute façon déjà présent dans le corps de cet e-mail, et le
// jeton n'est connu qu'après la réponse du serveur — pas encore disponible à ce stade.
function getInscriptionPdfBase64(data) {
  const doc = buildInscriptionPdfDoc(data, null);
  return doc.output('datauristring').split(',')[1];
}
