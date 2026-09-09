// Page /admin/inscriptions (functions/admin/inscriptions.js) : ce fichier externe existe
// uniquement parce que le CSP site-wide (_headers, script-src sans 'unsafe-inline') bloque les
// attributs onchange/onsubmit et les <script> inline — un précédent inline sur cette page ne
// s'exécutait donc jamais dans un vrai navigateur (filtres et bouton PDF muets, sans erreur visible
// hors console devtools).
document.querySelectorAll('.insc-filters select').forEach((select) => {
  select.addEventListener('change', () => select.form.submit());
});

document.querySelectorAll('.insc-delete-form').forEach((form) => {
  form.addEventListener('submit', (e) => {
    if (!confirm('Supprimer cette inscription ?')) e.preventDefault();
  });
});

document.querySelectorAll('.insc-toggle-paye-form').forEach((form) => {
  form.addEventListener('submit', (e) => {
    const message = form.querySelector('button[type=submit]')?.dataset.confirm || 'Confirmer ?';
    if (!confirm(message)) e.preventDefault();
  });
});

document.querySelectorAll('.insc-pdf-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    downloadInscriptionPdf(JSON.parse(btn.dataset.pdf), btn.dataset.depotUrl || null);
  });
});
