// Réglages de l'espace admin : changer le mot de passe (par défaut le secret Cloudflare
// ADMIN_PASSWORD, remplaçable ici — voir _shared/admin-auth.js) et l'adresse qui reçoit l'e-mail
// de notification à chaque nouvelle inscription (par défaut contact@saintgratienfc.fr, voir
// _shared/settings-kv.js et _shared/confirmation-email.js).
//
// Changement de mot de passe en 2 étapes (double vérification par e-mail) : après validation du
// mot de passe actuel + nouveau mot de passe, un code à 6 chiffres est envoyé par e-mail (voir
// _shared/confirmation-email.js) et stocké 15 min dans le KV (_shared/settings-kv.js). Le nouveau
// mot de passe n'est appliqué qu'après saisie de ce code — protège contre un changement fait
// depuis une session compromise (cookie volé) sans que le vrai responsable en soit informé.
import { COOKIE_NAME, isAuthed, loginPage, escapeHtml, adminSidebar, getAdminPassword, setAdminPassword } from '../_shared/admin-auth.js';
import {
  getNotificationEmail,
  setNotificationEmail,
  setPendingPasswordChange,
  getPendingPasswordChange,
  clearPendingPasswordChange,
} from '../_shared/settings-kv.js';
import { sendPasswordChangeCode } from '../_shared/confirmation-email.js';

function page({ notificationEmail, passwordError, passwordOk, emailError, emailOk, awaitingCode }) {
  const passwordSection = awaitingCode
    ? `<p style="color:var(--maroon-900);margin-bottom:12px;">Un code à 6 chiffres a été envoyé par e-mail. Saisissez-le pour confirmer le changement (valable 15 min).</p>
       ${passwordError ? `<p style="color:var(--color-error, #b3261e);margin-bottom:12px;">${escapeHtml(passwordError)}</p>` : ''}
       <form method="POST">
         <input type="hidden" name="action" value="password-confirm">
         <div class="form-field" style="margin-bottom:16px;">
           <label for="confirmation-code">Code reçu par e-mail</label>
           <input type="text" id="confirmation-code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autofocus>
         </div>
         <button type="submit" class="btn btn-primary">Confirmer le changement</button>
       </form>
       <form method="POST" style="margin-top:8px;">
         <input type="hidden" name="action" value="password-cancel">
         <button type="submit" class="btn btn-dark btn-sm">Annuler</button>
       </form>`
    : `${passwordOk ? '<p style="color:var(--maroon-900);margin-bottom:12px;">Mot de passe mis à jour.</p>' : ''}
       ${passwordError ? `<p style="color:var(--color-error, #b3261e);margin-bottom:12px;">${escapeHtml(passwordError)}</p>` : ''}
       <form method="POST">
         <input type="hidden" name="action" value="password">
         <div class="form-field" style="margin-bottom:12px;">
           <label for="current-password">Mot de passe actuel</label>
           <input type="password" id="current-password" name="currentPassword" required>
         </div>
         <div class="form-field" style="margin-bottom:12px;">
           <label for="new-password">Nouveau mot de passe</label>
           <input type="password" id="new-password" name="newPassword" required minlength="8">
         </div>
         <div class="form-field" style="margin-bottom:16px;">
           <label for="confirm-password">Confirmer le nouveau mot de passe</label>
           <input type="password" id="confirm-password" name="confirmPassword" required minlength="8">
         </div>
         <button type="submit" class="btn btn-primary">Changer le mot de passe</button>
       </form>`;

  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Paramètres — Admin Saint-Gratien FC</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/svg+xml" href="/assets/images/favicon-admin.svg">
<link rel="icon" type="image/png" href="/assets/images/favicon-admin.png">
<link rel="stylesheet" href="/assets/css/styles.css?v=20260909f">
<style>
  .admin-main{max-width:480px;}
</style>
</head><body>
  <div class="admin-layout">
    ${adminSidebar('parametres')}
    <main class="admin-main">
      <h1 style="font-size:1.3rem;margin-bottom:24px;">Paramètres</h1>

      <h2 style="font-size:1rem;margin-bottom:8px;">Notification des nouvelles inscriptions</h2>
      ${emailOk ? '<p style="color:var(--maroon-900);margin-bottom:12px;">Adresse mise à jour.</p>' : ''}
      ${emailError ? `<p style="color:var(--color-error, #b3261e);margin-bottom:12px;">${escapeHtml(emailError)}</p>` : ''}
      <form method="POST" style="margin-bottom:32px;">
        <input type="hidden" name="action" value="notification-email">
        <div class="form-field" style="margin-bottom:12px;">
          <label for="notification-email">E-mail(s) recevant la notification (séparés par une virgule)</label>
          <input type="text" id="notification-email" name="notificationEmail" value="${escapeHtml(notificationEmail)}" required>
        </div>
        <button type="submit" class="btn btn-primary">Enregistrer</button>
      </form>

      <h2 style="font-size:1rem;margin-bottom:8px;">Mot de passe admin</h2>
      ${passwordSection}
    </main>
  </div>
  <script src="/assets/js/admin-nav.js?v=20260909a"></script>
</body></html>`;
}

export async function onRequestGet({ request, env }) {
  if (!(await isAuthed(request, env))) {
    return new Response(loginPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }
  const notificationEmail = await getNotificationEmail(env);
  const pending = await getPendingPasswordChange(env);
  return new Response(page({ notificationEmail, awaitingCode: !!pending }), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

export async function onRequestPost({ request, env }) {
  if (!(await isAuthed(request, env))) {
    return new Response(loginPage(), { status: 401, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  const form = await request.formData();
  const action = form.get('action');
  const notificationEmail = await getNotificationEmail(env);

  if (action === 'notification-email') {
    const value = String(form.get('notificationEmail') || '').trim();
    const addresses = value.split(',').map((a) => a.trim()).filter(Boolean);
    const allValid = addresses.length > 0 && addresses.every((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
    if (!allValid) {
      return new Response(page({ notificationEmail: value, emailError: 'Une ou plusieurs adresses ne sont pas valides.' }), {
        status: 400,
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    }
    await setNotificationEmail(env, addresses.join(', '));
    return new Response(page({ notificationEmail: addresses.join(', '), emailOk: true }), {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  }

  if (action === 'password') {
    const currentPassword = form.get('currentPassword');
    const newPassword = form.get('newPassword');
    const confirmPassword = form.get('confirmPassword');
    const actualPassword = await getAdminPassword(env);

    if (currentPassword !== actualPassword) {
      return new Response(page({ notificationEmail, passwordError: 'Mot de passe actuel incorrect.' }), {
        status: 400,
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    }
    if (!newPassword || newPassword.length < 8) {
      return new Response(page({ notificationEmail, passwordError: 'Le nouveau mot de passe doit faire au moins 8 caractères.' }), {
        status: 400,
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    }
    if (newPassword !== confirmPassword) {
      return new Response(page({ notificationEmail, passwordError: 'Les deux mots de passe ne correspondent pas.' }), {
        status: 400,
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const sent = await sendPasswordChangeCode(env, code);
    if (!sent) {
      return new Response(
        page({
          notificationEmail,
          passwordError: "Échec de l'envoi du code de confirmation (vérifiez que l'adresse de notification est valide et BREVO_API_KEY configurée). Le mot de passe n'a pas été changé.",
        }),
        { status: 500, headers: { 'Content-Type': 'text/html;charset=UTF-8' } }
      );
    }
    await setPendingPasswordChange(env, { code, newPassword });
    return new Response(page({ notificationEmail, awaitingCode: true }), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  if (action === 'password-confirm') {
    const pending = await getPendingPasswordChange(env);
    const submittedCode = String(form.get('code') || '').trim();

    if (!pending) {
      return new Response(page({ notificationEmail, passwordError: 'Code expiré, recommencez.' }), {
        status: 400,
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    }
    if (submittedCode !== pending.code) {
      return new Response(page({ notificationEmail, passwordError: 'Code incorrect.', awaitingCode: true }), {
        status: 400,
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    }

    await setAdminPassword(env, pending.newPassword);
    await clearPendingPasswordChange(env);
    // Réémet le cookie avec le nouveau mot de passe : sans ça, l'admin serait déconnecté par son
    // propre changement de mot de passe au prochain rechargement.
    return new Response(page({ notificationEmail, passwordOk: true }), {
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
        'Set-Cookie': `${COOKIE_NAME}=${encodeURIComponent(pending.newPassword)}; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=2592000`,
      },
    });
  }

  if (action === 'password-cancel') {
    await clearPendingPasswordChange(env);
    return new Response(page({ notificationEmail }), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  return new Response(page({ notificationEmail }), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}
