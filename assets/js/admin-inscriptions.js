// Page /admin/inscriptions (functions/admin/inscriptions.js) : ce fichier externe existe
// uniquement parce que le CSP site-wide (_headers, script-src sans 'unsafe-inline') bloque les
// attributs onchange/onsubmit et les <script> inline — un précédent inline sur cette page ne
// s'exécutait donc jamais dans un vrai navigateur (filtres et bouton PDF muets, sans erreur visible
// hors console devtools).
document.querySelectorAll('.insc-filters select').forEach((select) => {
  select.addEventListener('change', () => select.form.submit());
});

// Bouton "Archiver"/"Supprimer définitivement"/"Marquer payé" d'une fiche (voir actionsHtml dans
// functions/admin/inscriptions.js) : le message vient de l'attribut data-confirm du bouton plutôt
// que d'un texte fixe ici, chaque action ayant un libellé différent (et une gravité différente).
document.querySelectorAll('.insc-confirm-form').forEach((form) => {
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

// Sélection multiple (case à cocher par carte, voir actionsHtml) + barre d'actions groupées
// (#bulk-form). Les cases ne sont pas dans #bulk-form (une carte contient déjà plusieurs <form>
// distincts — dossier/paiement/archivage/suppression — et imbriquer des <form> est invalide en
// HTML) : #bulk-form reste vide de cases et reçoit, juste avant l'envoi, un <input type="hidden"
// name="ids"> par case cochée.
const bulkForm = document.getElementById('bulk-form');
if (bulkForm) {
  const selectAllCb = document.getElementById('bulk-select-all');
  const countEl = document.getElementById('bulk-count');
  const idsContainer = document.getElementById('bulk-ids-container');
  const actionBtns = [...bulkForm.querySelectorAll('[data-bulk-action]')];
  const selectCheckboxes = () => [...document.querySelectorAll('.insc-select')];

  function syncBulkUI() {
    const all = selectCheckboxes();
    const checked = all.filter((cb) => cb.checked);
    countEl.textContent = `${checked.length} sélectionné(s)`;
    idsContainer.innerHTML = checked.map((cb) => `<input type="hidden" name="ids" value="${cb.dataset.id}">`).join('');
    actionBtns.forEach((btn) => {
      btn.disabled = checked.length === 0;
    });
    selectAllCb.checked = all.length > 0 && checked.length === all.length;
  }

  selectCheckboxes().forEach((cb) => {
    // stopPropagation : la case vit dans <summary class="insc-card-head">, sans ça la cliquer
    // ouvrirait/replierait aussi la carte (comportement natif de <summary> sur tout clic à
    // l'intérieur, pas seulement sur le texte).
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', syncBulkUI);
  });

  selectAllCb.addEventListener('click', (e) => e.stopPropagation());
  selectAllCb.addEventListener('change', () => {
    selectCheckboxes().forEach((cb) => {
      cb.checked = selectAllCb.checked;
    });
    syncBulkUI();
  });

  actionBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const message = btn.dataset.confirm;
      if (message && !confirm(message)) return;
      document.getElementById('bulk-action').value = btn.dataset.bulkAction;
      bulkForm.submit();
    });
  });
}
