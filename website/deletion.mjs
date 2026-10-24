import { deleteSkinSnapAccount } from './deletion-client.mjs';
const form = document.querySelector('#delete-form');
const status = document.querySelector('#delete-status');
const submit = form?.querySelector('button[type=submit]');
let busy = false;
let config;
if (form) {
  if (submit) submit.disabled = true;
  fetch('./site-config.json', { cache: 'no-store' }).then(response => {
    if (!response.ok) throw new Error('Configuration unavailable');
    return response.json();
  }).then(value => {
    config = value;
    if (value.deletionEnabled !== true || !value.supabaseUrl || !value.publishableKey || !value.apiUrl) {
      throw new Error('Account deletion is not enabled in this review copy.');
    }
    if (submit) submit.disabled = false;
    status.textContent = 'Use your existing SkinSnap account. This page does not create a new account.';
  }).catch(() => {
    config = null;
    if (submit) submit.disabled = true;
    status.textContent = 'External deletion is disabled in this review copy. In the app, open Progress → Account & data settings → Delete account.';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !config) return;
    if (!form.reportValidity()) return;
    const fields = new FormData(form);
    const input = { email: fields.get('email'), password: fields.get('password'), confirmation: fields.get('confirmation'), acknowledged: fields.get('acknowledged') === 'yes' };
    busy = true;
    submit.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.textContent = 'Verifying your account and requesting deletion…';
    form.querySelector('[name=password]').value = '';
    try {
      await deleteSkinSnapAccount(config, input);
      form.reset();
      form.hidden = true;
      status.textContent = 'Your SkinSnap account and configured server records were deleted. Clear app data on other devices if needed. Provider-held copies may remain. Deleting an account does not cancel a Google Play subscription; manage that separately in Google Play.';
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'Deletion is not confirmed. Please retry.'; }
    finally { input.password = ''; busy = false; submit.disabled = false; form.setAttribute('aria-busy', 'false'); }
  });
}
