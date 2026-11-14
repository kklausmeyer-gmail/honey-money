import './style.css';
import { client, configured } from './client.js';
import { cents, kirkShare, money, today, balance, searchable } from './domain.js';

const app = document.querySelector('#app');
let state = { session: null, person: null, rows: [], view: 'expenses', query: '', factor: null, enrollment: null, recovery: false };
let generation = 0;
let authRevision = 0;
let idleTimer;
let authQueue = Promise.resolve();
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = '<span class="brand-icon" aria-hidden="true">♡</span>';
const brand = `<a class="brand" href="./">${icon}<span>honey money<small>JUST US TWO</small></span></a>`;
const notice = '<div id="notice" role="status" aria-live="polite"></div>';
const header = () => `<header>${brand}<div class="header-right"><span class="private-label">◈ A little space for the two of you</span>${state.session ? '<button class="quiet" id="signout">Sign out</button>' : ''}</div></header>`;
function message(text, error = false) {
  const el = document.querySelector('#notice');
  if (el) { el.textContent = text; el.className = error ? 'notice error' : 'notice success'; }
}
function wireSignout() { document.querySelector('#signout')?.addEventListener('click', signout); }
async function signout() {
  authRevision++;
  generation++;
  clearTimeout(idleTimer);
  state = { session: null, person: null, rows: [], view: 'expenses', query: '', factor: null, enrollment: null, recovery: false };
  renderLogin();
  if (client) await client.auth.signOut({ scope: 'local' });
}
function resetIdle() {
  clearTimeout(idleTimer);
  if (state.session) idleTimer = setTimeout(() => { signout(); }, 15 * 60 * 1000);
}
for (const type of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(type, resetIdle, { passive: true });
window.addEventListener('pagehide', () => { state.rows = []; });

function renderLogin() {
  app.innerHTML = `${header()}<main class="welcome"><section class="welcome-copy"><span class="eyebrow">SEPARATE ACCOUNTS. SHARED LIFE.</span><h1>A little less math.<br>A lot more <em>us.</em></h1><p>Your everyday expenses, happily together.<br>A private place for Jenny & Kirk to keep things fair.</p><div class="bunny-art" aria-hidden="true"><div class="sun">♡</div><div class="bunny one"><i></i><i></i><b>·ᴗ·</b></div><div class="bunny two"><i></i><i></i><b>·ᴗ·</b></div><span class="flower">✳</span><div class="ground"></div></div><div class="little-note">For our home, our plans, and all the little things.</div></section><section class="auth-card"><span class="pill">YOUR PRIVATE CORNER</span><h2>Hey, honey.</h2><p>Make yourself at home.</p>${notice}${configured ? `<form id="login"><label>Email<input type="email" name="email" autocomplete="username" required placeholder="you@example.com" /></label><label>Password<input type="password" name="password" autocomplete="current-password" required /></label><button class="primary" type="submit">Come on in <span>→</span></button></form><button class="text-button" id="forgot">Forgot your password?</button><div class="card-footer">◈ Just Jenny & Kirk · Two-step sign-in</div>` : `<div class="setup-box"><h3>Your cozy corner is ready.</h3><p>Connect your Supabase project to enable private sign-in. Follow the setup guide included with this app.</p><p class="small">No database is connected. No expenses have been imported.</p></div>`}</section></main><footer>Made for two. With a little honey.</footer>`;
  wireSignout();
  document.querySelector('#login')?.addEventListener('submit', e => action(e, async form => {
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
  app.innerHTML = `${header()}<main class="centered"><section class="auth-card"><span class="pill">JUST US TWO</span><h2>${title}</h2>${notice}${body}</section></main>`;
  wireSignout();
}
function renderResetRequest() {
  authCard('A fresh start.', '<p>We’ll send a password reset link to your email.</p><form id="reset"><label>Email<input name="email" type="email" autocomplete="email" required /></label><button type="submit" class="primary">Send reset link →</button></form><button id="back" class="text-button">Back to sign in</button>');
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
  if (!session) return renderLogin();
  resetIdle();
  authCard('One little moment…', '<p>Checking your private space.</p>');
  const { data: person, error } = await client.rpc('my_membership');
  if (ticket !== generation) return;
  if (error) return authCard('Setup needs a little care.', '<p>The membership check could not complete. Run the database setup scripts, then sign out and try again.</p>');
  if (!person) return authCard('This space is just for two.', '<p>This account has not been added to Honey Money. The project owner needs to add your user ID using the membership setup script.</p>');
  state.person = person;
  const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (ticket !== generation) return;
  if (assuranceError) return authCard('Couldn’t verify your session.', '<p>Please sign out and try again.</p>');
  if (assurance.currentLevel !== 'aal2') return renderMfa(ticket);
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
  authCard(factor ? 'One more little step.' : 'Let’s keep this just ours.', `${factor ? '<p>Enter the six-digit code from your authenticator app.</p>' : '<p>Connect an authenticator app to protect your shared expenses. Keep its backup in your password manager.</p><button id="enroll" class="secondary">Set up authenticator</button><div id="qr"></div>'}<form id="verify" ${factor ? '' : 'hidden'}><label>Authenticator code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required /></label><button type="submit" class="primary">Unlock our space →</button></form>`);
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
    rows.push(...data);
    if (data.length < 500) break;
    offset += 500;
  }
  state.rows = rows;
  renderDashboard();
}
function renderDashboard() {
  const net = balance(state.rows);
  app.innerHTML = `${header()}<main class="dashboard"><div class="page-heading"><div><span class="eyebrow">OUR EVERYDAY, TOGETHER</span><h1>Hey, ${state.person === 'jenny' ? 'Jenny' : 'Kirk'} <span class="heart">♡</span></h1><p>All the little things that add up to us.</p></div><button class="primary compact" id="add">+ Add an expense</button></div><section class="summary"><div><span class="eyebrow">KEEPING THINGS FAIR</span><h2>${net === 0 ? 'All square, honey.' : `${net > 0 ? 'Jenny owes Kirk' : 'Kirk owes Jenny'} ${money(Math.abs(net))}`}</h2><p>${state.rows.length ? 'Based on the expenses entered here.' : 'Your fresh start. No expenses entered yet.'}</p></div><span class="summary-art" aria-hidden="true">♡<small>you + me</small></span></section><section class="ledger"><div class="ledger-top"><h2>Our expenses <span class="count">${state.rows.length}</span></h2><button class="quiet" id="refresh">↻ Refresh</button></div><label class="search-label"><span class="sr-only">Search expenses</span><input type="search" id="search" placeholder="Search names, notes, tags, amounts…" value="${esc(state.query)}" /></label><div id="expenses"></div></section><aside class="privacy-note">◈ Only the two of you can access these records. This session signs out after 15 minutes of inactivity.</aside></main><footer>Made for two. With a little honey.</footer><dialog id="expense-dialog"></dialog>`;
  wireSignout();
  document.querySelector('#add').onclick = renderExpenseForm;
  document.querySelector('#refresh').onclick = async () => { await route((await client.auth.getSession()).data.session); };
  document.querySelector('#search').oninput = e => { state.query = e.target.value; renderRows(); };
  renderRows();
}
function renderRows() {
  const rows = state.rows.filter(r => searchable(r, state.query));
  document.querySelector('#expenses').innerHTML = rows.length ? `<div class="expense-list">${rows.map(r => `<article class="expense-row"><div class="expense-symbol" aria-hidden="true">${esc(r.description.charAt(0).toUpperCase())}</div><div class="expense-title"><h3>${esc(r.description)}</h3><p>${esc(r.expense_date)} · ${esc(r.category)} · ${r.paid_by === 'jenny' ? 'Jenny' : 'Kirk'} paid</p>${r.notes ? `<p class="notes">${esc(r.notes)}</p>` : ''}${r.tags.length ? `<p class="tags">${r.tags.map(t => `<span>#${esc(t)}</span>`).join(' ')}</p>` : ''}</div><div class="expense-amount"><strong>${money(r.amount_cents)}</strong><small>Kirk ${money(r.kirk_share_cents)}<br>Jenny ${money(r.amount_cents - r.kirk_share_cents)}</small></div></article>`).join('')}</div>` : `<div class="empty-state"><span aria-hidden="true">♡</span><h3>${state.query ? 'No matches just yet.' : 'A clean slate for our next chapter.'}</h3><p>${state.query ? 'Try another name, note, date, or amount.' : 'Add your first shared expense when you’re ready.<br>Your Splitwise history can come later.'}</p></div>`;
}
function renderExpenseForm() {
  const dialog = document.querySelector('#expense-dialog');
  dialog.innerHTML = `<form id="expense-form"><div class="dialog-heading"><h2>A little something shared.</h2><button type="button" id="close" class="quiet" aria-label="Close">✕</button></div><p class="small">All amounts in USD. For an odd cent, Jenny takes the extra cent in an equal split.</p><div id="form-error" class="error" role="alert"></div><label>Name<input name="description" maxlength="200" required placeholder="What was it for?" /></label><div class="form-grid"><label>Date<input name="expense_date" type="date" value="${today()}" required /></label><label>Amount ($)<input name="amount" inputmode="decimal" required placeholder="0.00" /></label></div><div class="form-grid"><label>Who paid?<select name="paid_by"><option value="${state.person}">${state.person === 'jenny' ? 'Jenny' : 'Kirk'}</option><option value="${state.person === 'jenny' ? 'kirk' : 'jenny'}">${state.person === 'jenny' ? 'Kirk' : 'Jenny'}</option></select></label><label>How do we split it?<select name="split" id="split"><option value="half">50 / 50</option><option value="kirk">All Kirk</option><option value="jenny">All Jenny</option><option value="custom">Custom amounts</option></select></label></div><label id="custom-label" hidden>Kirk’s share ($)<input name="custom" inputmode="decimal" placeholder="0.00" /><small>Jenny’s share is the remainder.</small></label><div class="form-grid"><label>Category<input name="category" maxlength="80" value="General" list="categories" /><datalist id="categories"><option>Groceries</option><option>Home</option><option>Dining</option><option>Travel</option><option>Utilities</option><option>Health</option></datalist></label><label>Tags<input name="tags" placeholder="home, monthly" maxlength="500" /></label></div><label>Notes<textarea name="notes" maxlength="4000" rows="3" placeholder="Auto debited, paid by Zelle, anything to remember…"></textarea></label><label id="duplicate-label" hidden class="duplicate"><input type="checkbox" name="confirm_duplicate" /> A similar expense exists. Save this one too.</label><button type="submit" class="primary">Save our expense →</button></form>`;
  dialog.showModal();
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
      const duplicate = state.rows.some(r => r.expense_date === form.get('expense_date') && r.amount_cents === amount && r.description.toLowerCase() === description.toLowerCase());
      if (duplicate && !form.get('confirm_duplicate')) {
        document.querySelector('#duplicate-label').hidden = false;
        throw new Error('We found an expense with the same date, name, and amount. Check the box if this is a separate expense.');
      }
      const { error } = await client.from('expenses').insert({ description, expense_date: form.get('expense_date'), amount_cents: amount, paid_by: form.get('paid_by'), kirk_share_cents: kirkShare(amount, form.get('split'), form.get('custom')), category: form.get('category').trim() || 'General', tags, notes: form.get('notes').trim() });
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
    if (event === 'SIGNED_OUT') { authRevision++; generation++; state.rows = []; state.session = null; state.person = null; clearTimeout(idleTimer); renderLogin(); return; }
    if (event === 'TOKEN_REFRESHED') { state.session = session; return; }
    if (['INITIAL_SESSION', 'SIGNED_IN', 'PASSWORD_RECOVERY', 'MFA_CHALLENGE_VERIFIED'].includes(event)) {
      const revision = ++authRevision;
      authQueue = authQueue.then(() => new Promise(resolve => setTimeout(resolve, 0))).then(() => {
        if (revision === authRevision) return route(session);
      }).catch(() => {
        state.rows = [];
        authCard('A small connection hiccup.', '<p>Please sign out and try again.</p>');
      });
    }
  });
  // Expired/invalid email links should not silently leave a confusing blank page.
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('error')) { renderLogin(); message('That sign-in link has expired or is invalid. Request a new one.', true); history.replaceState(null, '', location.pathname); }
} else renderLogin();
