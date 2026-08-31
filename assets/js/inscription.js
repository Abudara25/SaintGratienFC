// Saint-Gratien FC — formulaire d'inscription : génère un PDF rempli, puis propose l'envoi par e-mail et le paiement HelloAsso (lien adapté à la catégorie choisie).

const HELLOASSO_URLS = {
  'U6 - U7': 'https://www.helloasso.com/beta/associations/saint-gratien-football-club/adhesions/adhesion-u6-u7-saint-gratien-fc-2026-2027',
  'U8 - U9': 'https://www.helloasso.com/beta/associations/saint-gratien-football-club/adhesions/adhesion-categorie-u8-u9-saint-gratien-fc-2026-2027-2',
};

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('inscription-form');
  if (!form) return;

  const nextSteps = document.getElementById('inscription-next-steps');
  const mailtoBtn = document.getElementById('mailto-btn');
  const helloassoBtn = document.getElementById('helloasso-btn');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const data = {
      enfantPrenom: form.enfantPrenom.value.trim(),
      enfantNom: form.enfantNom.value.trim(),
      naissance: form.naissance.value,
      categorie: form.categorie.value,
      parentPrenom: form.parentPrenom.value.trim(),
      parentNom: form.parentNom.value.trim(),
      email: form.email.value.trim(),
      telephone: form.telephone.value.trim(),
      adresse: form.adresse.value.trim(),
      codePostal: form.codePostal.value.trim(),
      ville: form.ville.value.trim(),
      droitImage: form.droitImage.checked ? 'Oui' : 'Non',
    };

    if (!window.jspdf) {
      alert("Le générateur de PDF n'a pas pu se charger (connexion instable ou bloqueur de contenu). Réessayez, ou contactez-nous directement à contact.sgfc@yahoo.com.");
      return;
    }
    generatePdf(data);

    const subject = `Inscription ${data.enfantPrenom} ${data.enfantNom} — Saint-Gratien FC`;
    const body = [
      'Bonjour,',
      '',
      `Veuillez trouver en pièce jointe la fiche d'inscription de ${data.enfantPrenom} ${data.enfantNom} (${data.categorie}).`,
      "Merci de joindre le PDF que vous venez de télécharger avant l'envoi de cet e-mail.",
      '',
      'Cordialement,',
      `${data.parentPrenom} ${data.parentNom}`,
    ].join('\n');
    mailtoBtn.href = `mailto:contact.sgfc@yahoo.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    helloassoBtn.href = HELLOASSO_URLS[data.categorie] || HELLOASSO_URLS['U6 - U7'];

    nextSteps.hidden = false;
    nextSteps.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

function generatePdf(data) {
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
  y += 4;

  heading('Autorisations');
  line("J'autorise mon enfant à participer aux entraînements et activités du Saint-Gratien FC.");
  line(`Droit à l'image (photos/vidéos du club) : ${data.droitImage}`);
  y += 8;

  doc.text('Fait à _______________________, le _______________', 14, y);
  y += 10;
  doc.text('Signature du responsable légal :', 14, y);
  y += 20;
  doc.line(14, y, 90, y);

  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(
    "À apporter signé au club (premier entraînement) ou à envoyer à contact.sgfc@yahoo.com. Adhésion à régler sur HelloAsso, ou en espèces/chèque en apportant ce dossier.",
    14,
    285
  );

  const filename = `inscription-${data.enfantPrenom}-${data.enfantNom}.pdf`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-');
  doc.save(filename);
}
