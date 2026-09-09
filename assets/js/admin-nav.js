// Bouton burger de la sidebar admin (voir functions/_shared/admin-auth.js, adminSidebar()) —
// chargé sur les 4 pages /admin/* authentifiées. Script externe : le CSP du site bloque les
// attributs onclick/<script> inline (voir la même note dans admin-inscriptions.js).
document.querySelectorAll('.admin-nav-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const sidebar = btn.closest('.admin-sidebar');
    const open = sidebar.classList.toggle('admin-nav-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
});
