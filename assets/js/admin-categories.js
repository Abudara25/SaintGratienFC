// Page /admin/categories (functions/admin/categories.js) : le CSP site-wide (_headers,
// script-src sans 'unsafe-inline') bloque les attributs onsubmit, donc la confirmation avant
// suppression d'une catégorie passe par un fichier externe, comme sur /admin/inscriptions
// (voir assets/js/admin-inscriptions.js, même pattern .cat-confirm-form/data-confirm).
document.querySelectorAll('.cat-confirm-form').forEach((form) => {
  form.addEventListener('submit', (e) => {
    const message = form.querySelector('button[type=submit]')?.dataset.confirm || 'Confirmer ?';
    if (!confirm(message)) e.preventDefault();
  });
});
