// Bouton burger de la sidebar admin (voir functions/_shared/admin-auth.js, adminSidebar()) —
// chargé sur chaque page /admin/* authentifiée. Script externe : le CSP du site bloque les
// attributs onclick/<script> inline (voir la même note dans admin-inscriptions.js).
document.querySelectorAll('.admin-nav-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const sidebar = btn.closest('.admin-sidebar');
    const open = sidebar.classList.toggle('admin-nav-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
});

// Confirmation avant un envoi destructif ou à conséquence (suppression, archivage, changement de
// saison...) — un seul handler partagé par toute page /admin/* utilisant la classe
// .admin-confirm-form, plutôt qu'une copie de ces 6 lignes par page (c'était le cas avant le
// 2026-09-10 : admin-inscriptions.js et admin-categories.js avaient chacun leur propre copie
// identique). Le message vient de l'attribut data-confirm du bouton de submit, pas d'un texte fixe
// ici : chaque action a un libellé différent, et une gravité différente.
document.querySelectorAll('.admin-confirm-form').forEach((form) => {
  form.addEventListener('submit', (e) => {
    const message = form.querySelector('button[type=submit]')?.dataset.confirm || 'Confirmer ?';
    if (!confirm(message)) e.preventDefault();
  });
});
