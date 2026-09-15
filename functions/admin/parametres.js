// Réglages de l'espace admin : l'adresse qui reçoit les e-mails du site (par défaut
// contact@saintgratienfc.fr, voir _shared/settings-kv.js), les automatisations (_shared/automations.js)
// et le mot de passe (par défaut le secret Cloudflare ADMIN_PASSWORD, remplaçable ici — voir
// _shared/admin-auth.js).
//
// Changement de mot de passe en 2 étapes (double vérification par e-mail) : après validation du
// mot de passe actuel + nouveau mot de passe, un code à 6 chiffres est envoyé par e-mail (voir
// _shared/confirmation-email.js) et stocké 15 min dans le KV (_shared/settings-kv.js). Le nouveau
// mot de passe n'est appliqué qu'après saisie de ce code — protège contre un changement fait
// depuis une session compromise (cookie volé) sans que le vrai responsable en soit informé.
import {
  COOKIE_NAME,
  isAuthed,
  loginPage,
  escapeHtml,
  getAdminPassword,
  setAdminPassword,
  adminHead,
  adminShell,
  adminScripts,
  icon,
  flash,
  statusTag,
  formatDateFr,
} from '../_shared/admin-auth.js';
import {
  getNotificationEmail,
  setNotificationEmail,
  setPendingPasswordChange,
  getPendingPasswordChange,
  clearPendingPasswordChange,
  getAutomationsConfig,
  setAutomationsConfig,
  getCronState,
  DEFAULT_AUTOMATIONS,
} from '../_shared/settings-kv.js';
import { sendPasswordChangeCode, sendWeeklySummary } from '../_shared/confirmation-email.js';
import { runReminders, buildWeeklySummary } from '../_shared/automations.js';

const AUTOMATIONS = [
  {
    key: 'familyEmails',
    title: 'E-mails de suivi aux familles',
    description: 'Quand le club valide une étape (paiement reçu, dossier ou photo reçus par e-mail), puis « Dossier complet » une seule fois.',
    needs: ['brevo'],
  },
  {
    key: 'clubUploadAlerts',
    title: 'Alerte au club à chaque dépôt',
    description: 'E-mail aux adresses ci-dessus dès qu’une famille dépose son dossier signé ou la photo de l’enfant.',
    needs: ['brevo'],
  },
  {
    key: 'helloassoAutoPay',
    title: 'Paiements HelloAsso validés automatiquement',
    description: 'L’étape « Paiement » passe au vert dès que HelloAsso confirme la commande. Si la fiche n’est pas reconnue, le club reçoit un e-mail pour la rattacher à la main.',
    needs: ['helloasso'],
  },
  {
    key: 'autoReminders',
    title: 'Relances automatiques',
    description: 'E-mail aux familles dont le dossier est incomplet, 3 puis 7 jours après l’inscription (2 relances au plus, jamais moins de 3 jours après la précédente).',
    needs: ['brevo', 'cron'],
  },
  {
    key: 'weeklySummary',
    title: 'Récapitulatif chaque lundi',
    description: 'Nouvelles inscriptions de la semaine et dossiers à compléter, envoyés aux adresses ci-dessus.',
    needs: ['brevo', 'cron'],
  },
];

function automationsSection(auto) {
  const ready = { brevo: auto.brevo, helloasso: Boolean(auto.webhookSecret), cron: auto.cronSecret };
  const webhookUrl = auto.webhookSecret ? `${auto.siteUrl}/api/helloasso-notification?key=${auto.webhookSecret}` : '';
  const kv = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const setup = (ok) => statusTag(ok, { yes: 'Configuré', no: 'À configurer' });

  return `<section class="adm-surface" id="automatisations">
    <h2 class="adm-h2">${icon('refresh')}Automatisations</h2>
    <p class="adm-help" style="margin-top:8px;">Chaque automatisation peut être coupée à tout moment. Celles dont un prérequis manque ne font rien tant qu’il n’est pas configuré (voir « Mise en service » plus bas).</p>
    ${auto.message ? flash('ok', auto.message) : ''}
    ${auto.error ? flash('error', auto.error) : ''}
    <form method="POST">
      <input type="hidden" name="action" value="automations">
      ${AUTOMATIONS.map((a) => {
        const missing = a.needs.filter((n) => !ready[n]);
        return `<label class="adm-check adm-toggle"><input type="checkbox" name="${a.key}" ${auto.config[a.key] ? 'checked' : ''}><span><strong>${a.title}</strong><small>${a.description}${
          missing.length ? ' <em>Prérequis à configurer.</em>' : ''
        }</small></span></label>`;
      }).join('')}
      <div class="adm-form-actions" style="margin-top:16px;"><button type="submit" class="adm-btn adm-btn-primary">${icon('check')}Enregistrer</button></div>
    </form>

    <hr class="adm-divider">
    <h3 class="adm-h3">Mise en service</h3>
    <dl class="adm-kv">
      ${kv('E-mails (Brevo)', setup(auto.brevo))}
      ${kv('Notification HelloAsso', setup(Boolean(auto.webhookSecret)))}
      ${kv('Vérification via l’API HelloAsso', statusTag(auto.helloassoApi, { yes: 'Active', no: 'Inactive' }))}
      ${kv('Tâches programmées', auto.cronSecret ? (auto.cron.lastRun ? `Dernier passage : ${formatDateFr(auto.cron.lastRun.replace('T', ' ').slice(0, 19), { dateStyle: 'short', timeStyle: 'short' })}` : 'Jamais exécutées') : setup(false))}
    </dl>
    ${
      webhookUrl
        ? `<div class="form-field" style="margin-top:12px;">
      <label for="webhook-url">URL à enregistrer chez HelloAsso (Mon compte › Intégrations et API › Notifications)</label>
      <input type="text" id="webhook-url" class="adm-copy" readonly value="${escapeHtml(webhookUrl)}">
    </div>`
        : ''
    }

    <hr class="adm-divider">
    <h3 class="adm-h3">Lancer maintenant</h3>
    <p class="adm-help" style="margin-top:6px;">Utile pour tester, ou si le service programmé n’est pas encore installé.</p>
    <div class="adm-inline-forms">
      <form method="POST" class="admin-confirm-form">
        <input type="hidden" name="action" value="run-reminders">
        <button type="submit" class="adm-btn adm-btn-sm adm-btn-ghost" data-confirm="Envoyer maintenant les relances automatiques dues (dossiers incomplets depuis 3 ou 7 jours) ?">${icon('send')}Envoyer les relances dues</button>
      </form>
      <form method="POST" class="admin-confirm-form">
        <input type="hidden" name="action" value="send-summary">
        <button type="submit" class="adm-btn adm-btn-sm adm-btn-ghost" data-confirm="Envoyer maintenant le récapitulatif aux adresses de notification ?">${icon('mail')}Envoyer le récapitulatif</button>
      </form>
    </div>
  </section>`;
}

function page({ notificationEmail, passwordError, passwordOk, emailError, emailOk, awaitingCode, auto }) {
  const passwordSection = awaitingCode
    ? `${flash('info', 'Un code à 6 chiffres a été envoyé par e-mail. Saisissez-le pour confirmer le changement (valable 15 min).')}
       ${passwordError ? flash('error', passwordError) : ''}
       <form method="POST">
         <input type="hidden" name="action" value="password-confirm">
         <div class="form-field">
           <label for="confirmation-code">Code reçu par e-mail</label>
           <input type="text" id="confirmation-code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required autofocus>
         </div>
         <div class="adm-form-actions"><button type="submit" class="adm-btn adm-btn-primary">${icon('check')}Confirmer le changement</button></div>
       </form>
       <form method="POST" style="margin-top:10px;">
         <input type="hidden" name="action" value="password-cancel">
         <button type="submit" class="adm-btn adm-btn-sm adm-btn-ghost">Annuler</button>
       </form>`
    : `${passwordOk ? flash('ok', 'Mot de passe mis à jour.') : ''}
       ${passwordError ? flash('error', passwordError) : ''}
       <form method="POST">
         <input type="hidden" name="action" value="password">
         <div class="form-field">
           <label for="current-password">Mot de passe actuel</label>
           <input type="password" id="current-password" name="currentPassword" autocomplete="current-password" required>
         </div>
         <div class="form-row">
           <div class="form-field">
             <label for="new-password">Nouveau mot de passe</label>
             <input type="password" id="new-password" name="newPassword" autocomplete="new-password" required minlength="8">
           </div>
           <div class="form-field">
             <label for="confirm-password">Confirmer le nouveau mot de passe</label>
             <input type="password" id="confirm-password" name="confirmPassword" autocomplete="new-password" required minlength="8">
           </div>
         </div>
         <p class="adm-help">8 caractères minimum. Un code de confirmation sera envoyé à l'adresse de notification ci-dessus.</p>
         <div class="adm-form-actions"><button type="submit" class="adm-btn adm-btn-primary">${icon('lock')}Changer le mot de passe</button></div>
       </form>`;

  return `${adminHead('Paramètres')}
${adminShell({
  active: 'parametres',
  eyebrow: 'Espace admin',
  title: 'Paramètres',
  subtitle: "E-mails du site, automatisations et mot de passe de l'espace admin.",
})}
<main id="adm-main" class="adm-wrap adm-main adm-main-narrow">
  <section class="adm-surface">
    <h2 class="adm-h2">${icon('mail')}Adresses du club</h2>
    <p class="adm-help" style="margin-top:8px;">Reçoivent les nouvelles inscriptions, les alertes de dépôt, les paiements HelloAsso à rattacher et le récapitulatif du lundi.</p>
    ${emailOk ? flash('ok', 'Adresse mise à jour.') : ''}
    ${emailError ? flash('error', emailError) : ''}
    <form method="POST">
      <input type="hidden" name="action" value="notification-email">
      <div class="form-field">
        <label for="notification-email">E-mail(s) du club (séparés par une virgule)</label>
        <input type="text" id="notification-email" name="notificationEmail" value="${escapeHtml(notificationEmail)}" required>
      </div>
      <div class="adm-form-actions"><button type="submit" class="adm-btn adm-btn-primary">${icon('check')}Enregistrer</button></div>
    </form>
  </section>

  ${automationsSection(auto)}

  <section class="adm-surface">
    <h2 class="adm-h2" style="margin-bottom:16px;">${icon('lock')}Mot de passe admin</h2>
    ${passwordSection}
  </section>
</main>
${adminScripts('admin-nav')}
</body></html>`;
}

async function render(request, env, props, { status = 200, headers = {}, message, error } = {}) {
  const auto = {
    config: await getAutomationsConfig(env),
    cron: await getCronState(env),
    siteUrl: new URL(request.url).origin,
    brevo: Boolean(env.BREVO_API_KEY),
    webhookSecret: env.HELLOASSO_WEBHOOK_SECRET || '',
    helloassoApi: Boolean(env.HELLOASSO_CLIENT_ID && env.HELLOASSO_CLIENT_SECRET),
    cronSecret: Boolean(env.CRON_SECRET),
    message,
    error,
  };
  return new Response(page({ ...props, auto }), { status, headers: { 'Content-Type': 'text/html;charset=UTF-8', ...headers } });
}

export async function onRequestGet({ request, env }) {
  if (!(await isAuthed(request, env))) {
    return new Response(loginPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }
  const notificationEmail = await getNotificationEmail(env);
  const pending = await getPendingPasswordChange(env);
  return render(request, env, { notificationEmail, awaitingCode: !!pending });
}

export async function onRequestPost({ request, env }) {
  if (!(await isAuthed(request, env))) {
    return new Response(loginPage(), { status: 401, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  const form = await request.formData();
  const action = form.get('action');
  const notificationEmail = await getNotificationEmail(env);
  const siteUrl = new URL(request.url).origin;

  if (action === 'notification-email') {
    const value = String(form.get('notificationEmail') || '').trim();
    const addresses = value.split(',').map((a) => a.trim()).filter(Boolean);
    const allValid = addresses.length > 0 && addresses.every((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
    if (!allValid) {
      return render(request, env, { notificationEmail: value, emailError: 'Une ou plusieurs adresses ne sont pas valides.' }, { status: 400 });
    }
    await setNotificationEmail(env, addresses.join(', '));
    return render(request, env, { notificationEmail: addresses.join(', '), emailOk: true });
  }

  if (action === 'automations') {
    const config = Object.fromEntries(Object.keys(DEFAULT_AUTOMATIONS).map((key) => [key, form.get(key) === 'on']));
    await setAutomationsConfig(env, config);
    return render(request, env, { notificationEmail }, { message: 'Automatisations enregistrées.' });
  }

  if (action === 'run-reminders') {
    if (!env.BREVO_API_KEY) return render(request, env, { notificationEmail }, { error: 'BREVO_API_KEY n’est pas configurée : aucun e-mail ne peut partir.' });
    const { sent, failed } = await runReminders(env, siteUrl);
    return render(request, env, { notificationEmail }, {
      message: `${sent} relance${sent > 1 ? 's' : ''} envoyée${sent > 1 ? 's' : ''}${failed ? `, ${failed} échec${failed > 1 ? 's' : ''}` : ''}.`,
    });
  }

  if (action === 'send-summary') {
    const ok = await sendWeeklySummary(env, siteUrl, await buildWeeklySummary(env));
    return render(request, env, { notificationEmail }, ok ? { message: 'Récapitulatif envoyé.' } : { error: 'Échec de l’envoi du récapitulatif (vérifiez BREVO_API_KEY et les adresses du club).' });
  }

  if (action === 'password') {
    const currentPassword = form.get('currentPassword');
    const newPassword = form.get('newPassword');
    const confirmPassword = form.get('confirmPassword');
    const actualPassword = await getAdminPassword(env);

    if (currentPassword !== actualPassword) {
      return render(request, env, { notificationEmail, passwordError: 'Mot de passe actuel incorrect.' }, { status: 400 });
    }
    if (!newPassword || newPassword.length < 8) {
      return render(request, env, { notificationEmail, passwordError: 'Le nouveau mot de passe doit faire au moins 8 caractères.' }, { status: 400 });
    }
    if (newPassword !== confirmPassword) {
      return render(request, env, { notificationEmail, passwordError: 'Les deux mots de passe ne correspondent pas.' }, { status: 400 });
    }

    // Tirage cryptographique (pas Math.random, prévisible) : ce code protège un changement de mot de passe.
    const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
    const sent = await sendPasswordChangeCode(env, code);
    if (!sent) {
      return render(
        request,
        env,
        {
          notificationEmail,
          passwordError: "Échec de l'envoi du code de confirmation (vérifiez que l'adresse de notification est valide et BREVO_API_KEY configurée). Le mot de passe n'a pas été changé.",
        },
        { status: 500 }
      );
    }
    await setPendingPasswordChange(env, { code, newPassword });
    return render(request, env, { notificationEmail, awaitingCode: true });
  }

  if (action === 'password-confirm') {
    const pending = await getPendingPasswordChange(env);
    const submittedCode = String(form.get('code') || '').trim();

    if (!pending) {
      return render(request, env, { notificationEmail, passwordError: 'Code expiré, recommencez.' }, { status: 400 });
    }
    if (submittedCode !== pending.code) {
      return render(request, env, { notificationEmail, passwordError: 'Code incorrect.', awaitingCode: true }, { status: 400 });
    }

    await setAdminPassword(env, pending.newPassword);
    await clearPendingPasswordChange(env);
    // Réémet le cookie avec le nouveau mot de passe : sans ça, l'admin serait déconnecté par son
    // propre changement de mot de passe au prochain rechargement.
    return render(
      request,
      env,
      { notificationEmail, passwordOk: true },
      { headers: { 'Set-Cookie': `${COOKIE_NAME}=${encodeURIComponent(pending.newPassword)}; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=2592000` } }
    );
  }

  if (action === 'password-cancel') {
    await clearPendingPasswordChange(env);
    return render(request, env, { notificationEmail });
  }

  return render(request, env, { notificationEmail });
}
