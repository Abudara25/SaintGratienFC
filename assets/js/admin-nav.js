// Comportements communs à chaque page /admin/* authentifiée (voir functions/_shared/admin-auth.js).
// Script externe : le CSP du site bloque les attributs onclick/<script> inline (voir _headers).

// Menus repliables <details data-dismiss> (« Plus » de la barre d'onglets mobile, « Filtres » de la
// liste des inscriptions) : se referment au clic à l'extérieur ou avec Échap, comme un menu classique.
const dismissables = [...document.querySelectorAll('details[data-dismiss]')];
document.addEventListener('click', (e) => {
  dismissables.forEach((details) => {
    if (details.open && !details.contains(e.target)) details.open = false;
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  dismissables.forEach((details) => {
    if (!details.open) return;
    details.open = false;
    details.querySelector('summary')?.focus();
  });
});

// Confirmation avant un envoi destructif ou à conséquence (suppression, archivage, relance, changement
// de saison...) — un seul handler partagé par toute page /admin/* utilisant la classe
// .admin-confirm-form. Le message vient de l'attribut data-confirm du bouton de submit : chaque action
// a un libellé différent, et une gravité différente.
document.querySelectorAll('.admin-confirm-form').forEach((form) => {
  form.addEventListener('submit', (e) => {
    const message = form.querySelector('button[type=submit]')?.dataset.confirm || 'Confirmer ?';
    if (!confirm(message)) e.preventDefault();
  });
});
