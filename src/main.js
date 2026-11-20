import './style.css';
import { client, configured, setRememberDevice } from './client.js';
import { cents, kirkShare, money, today, balance, searchable, assumedPayer } from './domain.js';
import { previewSplitwise, signedCents } from './splitwise.js';
import { mfaExpiresAt } from './session.js';
import { managementUI } from './management.js';
import { openDialog } from './dialog.js';
import { repeatControls, repeatValues } from './recurrence.js';

const app = document.querySelector('#app');
let state = { session: null, person: null, rows: [], view: 'expenses', query: '', factor: null, enrollment: null, recovery: false };
let generation = 0;
let authRevision = 0;
let mfaTimer;
let authQueue = Promise.resolve();
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = '<img class="brand-icon" src="./public-icon.svg" alt="" aria-hidden="true" />';
const brand = `<a class="brand" href="./">${icon}<span>honey money<small>SHARED EXPENSES</small></span></a>`;
const notice = '<div id="notice" role="status" aria-live="polite"></div>';
const header = () => `<header>${brand}<div class="header-right"><span class="private-label">Private household expenses</span>${state.session ? '<button class="quiet" id="signout">Sign out</button>' : ''}</div></header>`;
function message(text, error = false) {
  const el = document.querySelector('#notice');
  if (el) { el.textContent = text; el.className = error ? 'notice error' : 'notice success'; }
}
function wireSignout() { document.querySelector('#signout')?.addEventListener('click', signout); }
async function signout() {
  authRevision++;
  generation++;
  clearTimeout(mfaTimer);
  state = { session: null, person: null, rows: [], view: 'expenses', query: '', factor: null, enrollment: null, recovery: false };
  renderLogin();
  if (client) await client.auth.signOut({ scope: 'local' });
}
function scheduleMfaCheck() {
  clearTimeout(mfaTimer);
  const expiry = mfaExpiresAt(state.session);
  if (expiry > Date.now()) mfaTimer = setTimeout(async () => {
    if (!state.session) return;
    if (mfaExpiresAt(state.session) <= Date.now()) await route((await client.auth.getSession()).data.session);
    else scheduleMfaCheck();
  }, Math.min(expiry - Date.now(), 60 * 60 * 1000));
}
const management = managementUI({ client, getState: () => state, refresh: () => loadExpenses(), esc,
  editExpense: row => renderExpenseForm(row), addSchedule: () => renderExpenseForm(null, true) });
window.addEventListener('pageshow', event => { if (event.persisted && client) client.auth.getSession().then(({data}) => route(data.session)); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.session) return;
  if (mfaExpiresAt(state.session) <= Date.now()) client.auth.getSession().then(({data}) => route(data.session));
  else if (document.querySelector('#recurring-list')) management.wireRecurring();
});
window.addEventListener('pagehide', () => { state.rows = []; state.schedules = []; document.querySelector('#expense-dialog')?.replaceChildren(); });

function renderLogin() {
  app.innerHTML = `${header()}<main class="welcome"><section class="welcome-copy"><h1>Shared expenses.<br>A clear balance.</h1><p>Track what you spend, see who owes what,<br>and manage recurring expenses in one place.</p><div class="welcome-ledger" aria-hidden="true"><img src="./public-icon.svg" alt="" /><div>Track spending<br>Split costs<br>Stay up to date</div></div></section><section class="auth-card"><span class="pill">PRIVATE ACCESS</span><h2>Sign in</h2><p>Access your household expenses.</p>${notice}${configured ? `<form id="login"><label>Email<input type="email" name="email" autocomplete="username" required placeholder="you@example.com" /></label><label>Password<input type="password" name="password" autocomplete="current-password" required /></label><label class="duplicate"><input type="checkbox" name="remember" checked /> Keep me signed in on this personal device for up to 30 days.</label><button class="primary" type="submit">Sign in <span>→</span></button></form><button class="text-button" id="forgot">Forgot your password?</button><div class="card-footer">Jenny & Kirk · Two-step verification</div>` : `<div class="setup-box"><h3>Complete setup</h3><p>Connect your Supabase project to enable private sign-in. Follow the setup guide included with this app.</p><p class="small">No database is connected. No expenses have been imported.</p></div>`}</section></main><footer>Honey Money · Shared expense tracking</footer>`;
  wireSignout();
  document.querySelector('#login')?.addEventListener('submit', e => action(e, async form => {
    setRememberDevice(Boolean(form.get('remember')));
    const { error } = await client.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') });
    if (error) throw new Error('Could not sign in. Check your email and password, then try again.');
  }));
  document.querySelector('#forgot')?.addEventListener('click', renderResetRequest);
}
async function action(event, fn) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  message('');
  try { await fn(new FormData(form)); }
  catch (err) { message(err.message || 'Something went wrong. Please try again.', true); }
  finally { if (button?.isConnected) button.disabled = false; }
}
function authCard(title, body) {
  app.innerHTML = `${header()}<main class="centered"><section class="auth-card"><span class="pill">SHARED EXPENSES</span><h2>${title}</h2>${notice}${body}</section></main>`;
  wireSignout();
}
function renderResetRequest() {
  authCard('Reset your password', '<p>We’ll send a password reset link to your email.</p><form id="reset"><label>Email<input name="email" type="email" autocomplete="email" required /></label><button type="submit" class="primary">Send reset link →</button></form><button id="back" class="text-button">Back to sign in</button>');
  document.querySelector('#back').onclick = renderLogin;
  document.querySelector('#reset').onsubmit = e => action(e, async form => {
    const { error } = await client.auth.resetPasswordForEmail(form.get('email'), { redirectTo: new URL('./', location.href).href });
    if (error) throw new Error('Could not send the reset email. Please try again shortly.');
    message('If this email has an account, a reset link is on its way. Open it on this device.');
  });
}
function renderNewPassword() {
  authCard('Choose a new password.', '<p>Use a unique password with at least 14 characters.</p><form id="password"><label>New password<input name="password" type="password" autocomplete="new-password" minlength="14" required /></label><label>Confirm password<input name="confirm" type="password" autocomplete="new-password" minlength="14" required /></label><button type="submit" class="primary">Save password →</button></form>');
  document.querySelector('#password').onsubmit = e => action(e, async form => {
    if (form.get('password') !== form.get('confirm')) throw new Error('The passwords do not match.');
    const { error } = await client.auth.updateUser({ password: form.get('password') });
    if (error) throw new Error('Could not update your password. If two-step verification is required, sign in with your authenticator first, then try again.');
    state.recovery = false;
    await signout();
    message('Password updated. Sign in with your new password.');
  });
}
async function route(session) {
  const ticket = ++generation;
  state.session = session;
  state.rows = [];
  state.schedules = [];
  if (!session) return renderLogin();
  scheduleMfaCheck();
  authCard('Loading…', '<p>Checking your account.</p>');
  const { data: person, error } = await client.rpc('my_membership');
  if (ticket !== generation) return;
  if (error) return authCard('Setup required', '<p>The membership check could not complete. Run the database setup scripts, then sign out and try again.</p>');
  if (!person) return authCard('Account not authorized', '<p>This account has not been added to Honey Money. The project owner needs to add your user ID using the membership setup script.</p>');
  state.person = person;
  const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (ticket !== generation) return;
  if (assuranceError) return authCard('Couldn’t verify your session.', '<p>Please sign out and try again.</p>');
  if (assurance.currentLevel !== 'aal2' || mfaExpiresAt(session) <= Date.now()) return renderMfa(ticket);
  const access = await client.rpc('household_access');
  if (ticket !== generation) return;
  state.managementAvailable = !access.error;
  if (access.error && access.error.code !== 'PGRST202' && access.error.code !== '42883') return authCard('Couldn’t verify access.', '<p>Refresh or sign out and try again.</p>');
  if (!access.error && !access.data) return renderMfa(ticket);
  if (state.recovery) return renderNewPassword();
  state.enrollment = null;
  state.factor = null;
  await loadExpenses(ticket);
}
async function renderMfa(ticket) {
  const { data, error } = await client.auth.mfa.listFactors();
  if (ticket !== generation) return;
  if (error) return authCard('Couldn’t check your authenticator.', '<p>Sign out and try again.</p>');
  const factor = data.totp.find(f => f.status === 'verified');
  state.factor = factor?.id;
  state.enrollment = null;
  authCard(factor ? 'Verify your identity' : 'Set up two-step verification', `${factor ? '<p>Enter the six-digit code from your authenticator app.</p>' : '<p>Connect an authenticator app to protect your shared expenses. Keep its backup in your password manager.</p><button id="enroll" class="secondary">Set up authenticator</button><div id="qr"></div>'}<form id="verify" ${factor ? '' : 'hidden'}><label>Authenticator code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required /></label><button type="submit" class="primary">Verify and continue →</button></form>`);
  document.querySelector('#enroll')?.addEventListener('click', async e => {
    e.target.disabled = true;
    try {
      // Remove abandoned, unverified enrollments to allow a fresh setup attempt.
      const { data: existing, error: listError } = await client.auth.mfa.listFactors();
      if (listError) throw listError;
      for (const pending of existing.all.filter(f => f.factor_type === 'totp' && f.status === 'unverified')) {
        const result = await client.auth.mfa.unenroll({ factorId: pending.id });
        if (result.error) throw result.error;
      }
      const { data: enrollment, error } = await client.auth.mfa.enroll({ factorType: 'totp', issuer: 'Honey Money', friendlyName: 'Honey Money authenticator' });
      if (ticket !== generation) return;
      if (error) throw error;
      state.factor = enrollment.id;
      state.enrollment = enrollment;
      const image = document.createElement('img');
      image.alt = 'Scan this QR code in your authenticator app';
      image.src = enrollment.totp.qr_code.startsWith('data:') ? enrollment.totp.qr_code : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.totp.qr_code)}`;
      const qr = document.querySelector('#qr');
      qr.replaceChildren(image);
      const hint = document.createElement('p');
      hint.className = 'small';
      hint.textContent = `Or enter this setup key manually: ${enrollment.totp.secret}`;
      qr.append(hint);
      document.querySelector('#verify').hidden = false;
      e.target.hidden = true;
    } catch { message('Could not set up the authenticator. Please try again.', true); e.target.disabled = false; }
  });
  document.querySelector('#verify').onsubmit = e => action(e, async form => {
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId: state.factor, code: form.get('code') });
    if (error) throw new Error('That code did not work. Try the latest code from your authenticator.');
    // MFA_CHALLENGE_VERIFIED triggers routing with the upgraded session.
  });
}
async function loadExpenses(ticket = generation) {
  if (!state.session || !state.person) return;
  const rows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client.from('expenses').select('*').order('expense_date', { ascending: false }).order('id').range(offset, offset + 499);
    if (ticket !== generation) return;
    if (error) return authCard('Couldn’t open your expenses.', '<p>Please sign out and try again. If this keeps happening, check that the schema and access rules are installed.</p>');
    rows.push(...data.filter(r => !r.deleted_at));
    if (data.length < 500) break;
    offset += 500;
  }
  state.hasImported = false;
  let historyOffset = 0;
  let importAvailable = true;
  while (true) {
    const { data, error } = await client.from('splitwise_history').select('*').order('expense_date', { ascending: false }).order('id').range(historyOffset, historyOffset + 499);
    if (ticket !== generation) return;
    if (error) {
      // Old deployments remain usable before the owner installs migration 04.
      if (error.code === 'PGRST205' || error.code === '42P01') { importAvailable = false; break; }
      return authCard('Couldn’t open your history.', '<p>Refresh or sign out and try again. Your balance is hidden until all records can be loaded.</p>');
    }
    rows.push(...data.filter(r => !r.deleted_at).map(r => ({ ...r, source: 'splitwise', tags: [] })));
    if (data.length) state.hasImported = true;
    if (data.length < 500) break;
    historyOffset += 500;
  }
  rows.sort((a, b) => b.expense_date.localeCompare(a.expense_date) || a.id.localeCompare(b.id));
  state.importAvailable = importAvailable;
  state.rows = rows;
  state.schedules = [];
  if (state.managementAvailable) {
    let scheduleOffset = 0;
    while (true) {
      const { data, error } = await client.from('recurring_expenses').select('*').order('id').range(scheduleOffset, scheduleOffset + 499);
      if (ticket !== generation) return;
      if (error) return authCard('Couldn’t open your reminders.', '<p>Refresh or sign out and try again.</p>');
      state.schedules.push(...data);
      if (data.length < 500) break;
      scheduleOffset += 500;
    }
  }
  renderDashboard();
}
function renderDashboard() {
  const net = balance(state.rows);
  app.innerHTML = `${header()}<main class="dashboard"><div class="page-heading"><div><span class="eyebrow">HOUSEHOLD OVERVIEW</span><h1>Hi, ${state.person === 'jenny' ? 'Jenny' : 'Kirk'} </h1><p>Expenses, balances, and recurring payments.</p></div><button class="primary compact" id="add">+ Add an expense</button></div>${management.recurringMarkup()}<section class="summary"><div><span class="eyebrow">CURRENT BALANCE</span><h2>${net === 0 ? 'Settled up' : `${net > 0 ? 'Jenny owes Kirk' : 'Kirk owes Jenny'} ${money(Math.abs(net))}`}</h2><p>${state.rows.length ? 'Based on your saved expenses and imported history.' : 'No expenses entered yet.'}</p></div><img class="balance-icon" src="./public-icon.svg" alt="" aria-hidden="true" /></section><section class="ledger"><div class="ledger-top"><h2>Expenses <span class="count">${state.rows.length}</span></h2><button class="quiet" id="refresh">↻ Refresh</button></div><label class="search-label"><span class="sr-only">Search expenses</span><input type="search" id="search" placeholder="Search names, notes, tags, amounts…" value="${esc(state.query)}" /></label><div id="expenses"></div></section><aside class="privacy-note">◈ Only the two of you can access these records. Personal devices stay signed in for up to 30 days after authenticator verification. Sign out on shared devices.</aside></main><footer>Honey Money · Shared expense tracking</footer><dialog id="expense-dialog"></dialog>`;
  wireSignout();
  document.querySelector('#add').onclick = () => renderExpenseForm();
  management.wireRecurring();
  if (!state.hasImported) {
    const button = document.createElement('button');
    button.className = 'quiet'; button.textContent = 'Import Splitwise history';
    document.querySelector('.ledger-top').append(button);
    button.onclick = renderImport;
  }
  document.querySelector('#refresh').onclick = async () => { await route((await client.auth.getSession()).data.session); };
  document.querySelector('#search').oninput = e => { state.query = e.target.value; renderRows(); };
  renderRows();
}
function renderRows() {
  const rows = state.rows.filter(r => searchable(r, state.query));
  document.querySelector('#expenses').innerHTML = rows.length ? `<div class="expense-list">${rows.map(r => r.source === 'splitwise' ? historyRow(r) : `<article class="expense-row"><div class="expense-symbol" aria-hidden="true">${esc(r.description.charAt(0).toUpperCase())}</div><div class="expense-title"><h3>${esc(r.description)}</h3><p>${esc(r.expense_date)} · ${esc(r.category)} · ${r.paid_by === 'jenny' ? 'Jenny' : 'Kirk'} paid</p>${r.notes ? `<p class="notes">${esc(r.notes)}</p>` : ''}${r.tags.length ? `<p class="tags">${r.tags.map(t => `<span>#${esc(t)}</span>`).join(' ')}</p>` : ''}${management.actions(r)}</div><div class="expense-amount"><strong>${money(r.amount_cents)}</strong><small>Kirk ${money(r.kirk_share_cents)}<br>Jenny ${money(r.amount_cents - r.kirk_share_cents)}</small></div></article>`).join('')}</div>` : `<div class="empty-state"><span aria-hidden="true">$</span><h3>${state.query ? 'No matching expenses' : 'No expenses yet'}</h3><p>${state.query ? 'Try another name, note, date, or amount.' : 'Add your first shared expense when you’re ready.<br>Your Splitwise history can come later.'}</p></div>`;
  management.wireRows();
}
function historyRow(r) {
  const delta = r.kirk_delta_cents;
  const payer = assumedPayer(r);
  const paid = payer ? `${payer === 'kirk' ? 'Kirk' : 'Jenny'} paid (assumed)` : r.kind === 'settlement' ? 'Payment / settlement' : 'No payer assumed';
  const effect = delta === 0 ? 'No balance change' : `${delta > 0 ? 'Jenny owes Kirk' : 'Kirk owes Jenny'} ${money(Math.abs(delta))} from this entry`;
  return `<article class="expense-row"><div class="expense-symbol" aria-hidden="true">↗</div><div class="expense-title"><h3>${esc(r.description)}</h3><p>${esc(r.expense_date)} · ${esc(r.category)} · Splitwise ${r.kind === 'settlement' ? 'settlement' : 'history'}</p><p>${effect}</p>${management.actions(r)}</div><div class="expense-amount"><strong>${money(r.cost_cents)}</strong><small class="payer-label">${paid}</small></div></article>`;
}

function renderImport() {
  const dialog = document.querySelector('#expense-dialog');
  const ticket = generation;
  dialog.innerHTML = `<div class="dialog-heading"><h2>Your Splitwise history.</h2><button class="quiet" id="close-import" aria-label="Close">✕</button></div><p class="small">Choose your original group CSV. Previewing keeps the file on this device. Saving sends the validated records to your household database. Historical payer and split details remain unknown; Payment rows are settlements.</p><div id="import-error" class="error" role="alert"></div>${!state.importAvailable ? '<p>First run <strong>supabase/04-splitwise-import.sql</strong> in your own Supabase SQL Editor, then refresh this app.</p>' : state.rows.length ? '<p>The initial import needs an empty ledger. Review existing entries before proceeding.</p>' : '<label>Splitwise CSV<input id="import-file" type="file" accept=".csv,text/csv" /></label><div id="import-preview"></div>'}`;
  openDialog(dialog);
  document.querySelector('#close-import').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.replaceChildren(), { once: true });
  document.querySelector('#import-file')?.addEventListener('change', async e => {
    const target = document.querySelector('#import-preview');
    target.replaceChildren(); document.querySelector('#import-error').textContent = '';
    const file = e.target.files[0];
    if (!file) return;
    e.target.disabled = true;
    try {
      if (file.size > 10_000_000) throw new Error('Choose a CSV smaller than 10 MB.');
      const preview = previewSplitwise(await file.text());
      if (ticket !== generation || !target.isConnected || !dialog.open) return;
      const netLabel = preview.net === 0 ? 'All settled up' : `${preview.net > 0 ? 'Jenny owes Kirk' : 'Kirk owes Jenny'} ${money(Math.abs(preview.net))}`;
      target.innerHTML = `<p><strong>${preview.rows.length} records</strong>: ${preview.expenses} expenses and ${preview.payments} settlements.</p><p>Calculated balance: <strong>${netLabel}</strong></p><details><summary>Review all records</summary><div class="import-table"><table><thead><tr><th>Date</th><th>Description</th><th>Kind</th><th>Cost</th><th>Kirk’s balance change</th></tr></thead><tbody>${preview.rows.map(r => `<tr><td>${esc(r.expense_date)}</td><td>${esc(r.description)}</td><td>${r.kind}</td><td>${money(r.cost_cents)}</td><td>${money(r.kirk_delta_cents)}</td></tr>`).join('')}</tbody></table></div></details><form id="confirm-import"><label>Current balance in this Splitwise group<select name="direction"><option value="-1">Kirk owes Jenny</option><option value="1">Jenny owes Kirk</option><option value="0">All settled up</option></select></label><label>Balance amount ($)<input name="expected" inputmode="decimal" required placeholder="0.00" /></label><label class="duplicate"><input type="checkbox" required /> I checked the records and current group balance. This is the complete history, and I want to import it once.</label><button class="primary" type="submit">Confirm and import history →</button></form>`;
      document.querySelector('#confirm-import').onsubmit = async event => {
        event.preventDefault();
        const form = event.currentTarget, button = form.querySelector('button');
        button.disabled = true;
        let sent = false;
        try {
          const fields = new FormData(form), amount = signedCents(fields.get('expected')), direction = Number(fields.get('direction'));
          if (amount < 0 || (direction === 0 && amount !== 0)) throw new Error('Enter a positive balance, or zero for all settled up.');
          const expected = amount * direction;
          if (expected !== preview.net) throw new Error('The CSV balance does not match Splitwise. Nothing has been imported. Check the group, export date, and balance.');
          if (ticket !== generation || !dialog.open) return;
          sent = true;
          const { error } = await client.rpc('import_splitwise', { p_rows: preview.rows, p_expected_balance: expected });
          if (ticket !== generation) return;
          if (error) throw new Error('Import was not confirmed. Close this window and refresh to check whether it completed. The database prevents a second import. If no history appears, report the error code: ' + (error.code || 'connection error'));
          dialog.close(); await loadExpenses(ticket);
        } catch (err) {
          if (ticket === generation && dialog.open) document.querySelector('#import-error').textContent = err.message;
        } finally { if (!sent && button.isConnected) button.disabled = false; }
      };
    } catch (err) { if (ticket === generation && dialog.open) document.querySelector('#import-error').textContent = err.message; }
    finally { if (e.target.isConnected) e.target.disabled = false; }
  });
}
function renderExpenseForm(row = null, recurring = false) {
  const ticket = generation;
  const newId = crypto.randomUUID();
  const dialog = document.querySelector('#expense-dialog');
  dialog.innerHTML = `<form id="expense-form"><div class="dialog-heading"><h2>Add expense</h2><button type="button" id="close" class="quiet" aria-label="Close">✕</button></div><p class="small">All amounts in USD. For an odd cent, Jenny takes the extra cent in an equal split.</p><div id="form-error" class="error" role="alert"></div><label>Name<input name="description" maxlength="200" required placeholder="What was it for?" /></label><div class="form-grid"><label>Date<input name="expense_date" type="date" value="${today()}" required /></label><label>Amount ($)<input name="amount" inputmode="decimal" required placeholder="0.00" /></label></div><div class="form-grid"><label>Who paid?<select name="paid_by"><option value="${state.person}">${state.person === 'jenny' ? 'Jenny' : 'Kirk'}</option><option value="${state.person === 'jenny' ? 'kirk' : 'jenny'}">${state.person === 'jenny' ? 'Kirk' : 'Jenny'}</option></select></label><label>How do we split it?<select name="split" id="split"><option value="half">50 / 50</option><option value="kirk">All Kirk</option><option value="jenny">All Jenny</option><option value="custom">Custom amounts</option></select></label></div><label id="custom-label" hidden>Kirk’s share ($)<input name="custom" inputmode="decimal" placeholder="0.00" /><small>Jenny’s share is the remainder.</small></label><div class="form-grid"><label>Category<input name="category" maxlength="80" value="General" list="categories" /><datalist id="categories"><option>Groceries</option><option>Home</option><option>Dining</option><option>Travel</option><option>Utilities</option><option>Health</option></datalist></label><label>Tags<input name="tags" placeholder="home, monthly" maxlength="500" /></label></div><label>Notes<textarea name="notes" maxlength="4000" rows="3" placeholder="Auto debited, paid by Zelle, anything to remember…"></textarea></label><label id="duplicate-label" hidden class="duplicate"><input type="checkbox" name="confirm_duplicate" /> A similar expense exists. Save this one too.</label><button type="submit" class="primary">Save expense →</button></form>`;
  const formElement = document.querySelector('#expense-form');
  if (row) {
    const values = { ...row, amount: (row.amount_cents / 100).toFixed(2), custom: (row.kirk_share_cents / 100).toFixed(2), split: 'custom', tags: row.tags.join(', ') };
    for (const [key, value] of Object.entries(values)) if (formElement.elements.namedItem(key)) formElement.elements.namedItem(key).value = value;
    document.querySelector('#custom-label').hidden = false;
    formElement.querySelector('h2').textContent = 'Edit your expense.';
    formElement.querySelector('[type="submit"]').textContent = 'Save changes';
  }
  if (recurring) {
    formElement.querySelector('h2').textContent = 'Recurring expense';
    const schedule = document.createElement('label');
    schedule.innerHTML = 'Repeat<select name="frequency"><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select><small>The date above is the first due date. Each occurrence needs confirmation; creating a schedule adds no expenses.</small>';
    formElement.querySelector('[type="submit"]').before(schedule);
    formElement.querySelector('[type="submit"]').textContent = 'Create recurring reminder';
  }
  else if (state.managementAvailable) repeatControls({ form: formElement, row, schedules: state.schedules || [], esc });
  openDialog(dialog);
  document.querySelector('#close').onclick = () => dialog.close();
  document.querySelector('#split').onchange = e => { document.querySelector('#custom-label').hidden = e.target.value !== 'custom'; };
  document.querySelector('#expense-form').onsubmit = async e => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const button = formEl.querySelector('[type="submit"]');
    button.disabled = true;
    const form = new FormData(formEl);
    try {
      const amount = cents(form.get('amount'));
      const description = form.get('description').trim();
      if (!description) throw new Error('Give this expense a name.');
      const tags = form.get('tags').split(',').map(t => t.trim()).filter(Boolean);
      if (tags.length > 20) throw new Error('Use at most 20 tags.');
      const duplicate = !recurring && state.rows.some(r => r.id !== row?.id && r.expense_date === form.get('expense_date') && r.amount_cents === amount && r.description.toLowerCase() === description.toLowerCase());
      if (duplicate && !form.get('confirm_duplicate')) {
        document.querySelector('#duplicate-label').hidden = false;
        throw new Error('We found an expense with the same date, name, and amount. Check the box if this is a separate expense.');
      }
      const values = { description, expense_date: form.get('expense_date'), amount_cents: amount, paid_by: form.get('paid_by'), kirk_share_cents: kirkShare(amount, form.get('split'), form.get('custom')), category: form.get('category').trim() || 'General', tags, notes: form.get('notes').trim() };
      const repeat = recurring ? null : repeatValues(form, values);
      if (ticket !== generation) return;
      const { error } = recurring
        ? await client.rpc('save_recurring', { p_id: null, p_version: null, p_values: { ...values, frequency: form.get('frequency'), anchor_date: values.expense_date } })
        : repeat ? await client.rpc('save_and_repeat_expense', { p_source: 'expenses', p_id: row?.id || null, p_version: row?.version || null, p_new_id: newId, p_values: values, p_schedule: repeat })
        : row ? await client.rpc('change_expense', { p_source: 'expenses', p_id: row.id, p_version: row.version, p_action: 'edit', p_values: values })
        : await client.from('expenses').insert(values);
      if (ticket !== generation || !formEl.isConnected || !dialog.open) return;
      if (error?.code === '40001') throw new Error('This entry changed on another device. Close this window, refresh, and try again.');
      if (error) throw new Error('Could not save. Check your connection and session, then try again.');
      dialog.close();
      await loadExpenses();
    } catch (err) { if (formEl.isConnected) document.querySelector('#form-error').textContent = err.message; }
    finally { if (button.isConnected) button.disabled = false; }
  };
}

if (client) {
  client.auth.onAuthStateChange((event, session) => {
    // Run async auth work outside Supabase's callback lock.
    if (event === 'PASSWORD_RECOVERY') state.recovery = true;
    if (event === 'SIGNED_OUT') { authRevision++; generation++; state = { session: null, person: null, rows: [], schedules: [], query: '', factor: null, enrollment: null, recovery: false }; clearTimeout(mfaTimer); renderLogin(); return; }
    if (event === 'TOKEN_REFRESHED') {
      state.session = session; scheduleMfaCheck();
      if (mfaExpiresAt(session) <= Date.now()) {
        state.rows = [];
        const revision = ++authRevision;
        authQueue = authQueue.then(() => new Promise(resolve => setTimeout(resolve, 0))).then(() => { if (revision === authRevision) return route(session); }).catch(() => { state.rows = []; state.schedules = []; authCard('Connection issue', '<p>Please sign out and try again.</p>'); });
      }
      return;
    }
    if (['INITIAL_SESSION', 'SIGNED_IN', 'PASSWORD_RECOVERY', 'MFA_CHALLENGE_VERIFIED'].includes(event)) {
      const revision = ++authRevision;
      authQueue = authQueue.then(() => new Promise(resolve => setTimeout(resolve, 0))).then(() => {
        if (revision === authRevision) return route(session);
      }).catch(() => {
        state.rows = [];
        authCard('Connection issue', '<p>Please sign out and try again.</p>');
      });
    }
  });
  // Expired/invalid email links should not silently leave a confusing blank page.
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('error')) { renderLogin(); message('That sign-in link has expired or is invalid. Request a new one.', true); history.replaceState(null, '', location.pathname); }
} else renderLogin();
