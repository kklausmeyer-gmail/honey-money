import { signedCents } from './splitwise.js';
import { money } from './domain.js';
import { openDialog } from './dialog.js';
import { repeatControls, repeatValues, dueOccurrences, pacificToday } from './recurrence.js';

export function managementUI({ client, getState, refresh, esc, editExpense, addSchedule }) {
  const sourceOf = row => row.source === 'splitwise' ? 'splitwise_history' : 'expenses';
  const errorMessage = error => error?.code === '40001' ? 'This item changed on another device. Close this window, refresh, and try again.' : 'Could not save. Check your session and connection, then refresh before retrying.';
  function open(title, body) {
    const dialog = document.querySelector('#expense-dialog');
    dialog.innerHTML = `<div class="dialog-heading"><h2>${title}</h2><button id="manage-close" class="quiet" aria-label="Close">✕</button></div><div id="manage-error" class="error" role="alert"></div>${body}`;
    openDialog(dialog); document.querySelector('#manage-close').onclick = () => dialog.close();
    return dialog;
  }
  async function submit(form, operation, dialog) {
    const state = getState(), buttons = [...form.querySelectorAll('button')];
    buttons.forEach(b => { b.disabled = true; });
    try {
      const result = await operation(new FormData(form));
      if (result.error) throw result.error;
      if (getState() !== state || !form.isConnected || !dialog.open) return;
      dialog.close(); await refresh();
    } catch (error) {
      if (getState() === state && dialog.open) {
        document.querySelector('#manage-error').textContent = error.userMessage || errorMessage(error);
        buttons.forEach(b => { b.disabled = false; });
      }
    }
  }
  function historyEdit(row) {
    const dialog = open('Edit imported entry.', `<p class="small">The cost and the amount owed are separate in the original export. Review both when changing an imported expense. Payment category means settlement.</p><form id="history-edit"><label>Name<input name="description" maxlength="200" required value="${esc(row.description)}" /></label><label>Date<input name="expense_date" type="date" required value="${esc(row.expense_date)}" /></label><label>Category<input name="category" maxlength="80" value="${esc(row.category)}" /></label><label>Original cost ($)<input name="cost" inputmode="decimal" required value="${(row.cost_cents / 100).toFixed(2)}" /></label><label>Effect on the shared balance<select name="direction"><option value="1" ${row.kirk_delta_cents > 0 ? 'selected' : ''}>Jenny owes Kirk</option><option value="-1" ${row.kirk_delta_cents < 0 ? 'selected' : ''}>Kirk owes Jenny</option><option value="0" ${row.kirk_delta_cents === 0 ? 'selected' : ''}>No balance change</option></select></label><label>Amount of this balance change ($)<input name="impact" inputmode="decimal" required value="${(Math.abs(row.kirk_delta_cents) / 100).toFixed(2)}" /></label><button class="primary" type="submit">Save changes</button></form>`);
    const form = document.querySelector('#history-edit');
    repeatControls({ form, row, schedules: getState().schedules || [], esc, imported: true });
    form.onsubmit = event => { event.preventDefault(); submit(form, fields => {
      let cost, delta;
      try {
        cost = signedCents(fields.get('cost'));
        const amount = signedCents(fields.get('impact')), direction = Number(fields.get('direction'));
        if (amount < 0 || (direction === 0 && amount !== 0)) throw new Error('Enter a positive balance change, or zero for no balance change.');
        delta = amount * direction;
      }
      catch (e) { throw { userMessage: e.message }; }
      if (Math.abs(delta) > Math.abs(cost)) throw { userMessage: 'The balance change cannot exceed the cost.' };
      const values = { description: fields.get('description').trim(), expense_date: fields.get('expense_date'), category: fields.get('category').trim(), cost_cents: cost, kirk_delta_cents: delta };
      let repeat;
      try { repeat = repeatValues(fields, values, true); } catch (e) { throw { userMessage: e.message }; }
      return repeat
        ? client.rpc('save_and_repeat_expense', { p_source: 'splitwise_history', p_id: row.id, p_version: row.version, p_new_id: null, p_values: values, p_schedule: repeat })
        : client.rpc('change_expense', { p_source: 'splitwise_history', p_id: row.id, p_version: row.version, p_action: 'edit', p_values: values });
    }, dialog); };
  }
  function deleteEntry(row) {
    const dialog = open('Delete this entry?', `<p>${esc(row.description)} · ${esc(row.expense_date)}</p><p class="small">It will be removed from your ledger and balance. A private change history retains the previous record. A recurring schedule, if any, stays active.</p><form id="delete-entry"><button type="submit" class="primary danger">Delete expense</button></form>`);
    const form = document.querySelector('#delete-entry');
    form.onsubmit = event => { event.preventDefault(); submit(form, () => client.rpc('change_expense', { p_source: sourceOf(row), p_id: row.id, p_version: row.version, p_action: 'delete' }), dialog); };
  }
  function actions(row) {
    if (!getState().managementAvailable) return '';
    return `<div class="row-actions"><button class="quiet" data-edit="${esc(row.id)}">Edit</button><button class="quiet" data-delete="${esc(row.id)}">Delete</button></div>`;
  }
  function wireRows() {
    for (const kind of ['edit','delete']) document.querySelectorAll(`[data-${kind}]`).forEach(button => {
      button.onclick = () => {
        const row = getState().rows.find(r => r.id === button.dataset[kind]);
        if (!row) return;
        if (kind === 'delete') deleteEntry(row);
        else if (row.source === 'splitwise') historyEdit(row);
        else editExpense(row);
      };
    });
  }
  function recurringMarkup() {
    if (!getState().managementAvailable) return '';
    return '<section class="todo-bar recurring" aria-label="Recurring expense to-do list"><div class="todo-heading"><button class="todo-toggle" id="todo-toggle" aria-expanded="false" aria-controls="todo-content"><span>To do</span><span id="todo-count" class="todo-count" aria-live="polite" hidden></span><span id="todo-status" class="small">All caught up</span><span aria-hidden="true">⌄</span></button><button class="quiet" id="add-schedule">+ Recurring expense</button></div><div id="todo-content" hidden><p class="small recurring-note">Confirm each due occurrence before it affects your balance, or skip it. Dates use Pacific time. You can keep using the rest of the page.</p><div id="recurring-list"></div></div></section>';
  }
  function wireRecurring() {
    if (!getState().managementAvailable) return;
    document.querySelector('#add-schedule').onclick = addSchedule;
    const pacificDate = pacificToday();
    const schedules = getState().schedules || [];
    const count = schedules.reduce((sum,r) => sum + dueOccurrences(r,pacificDate),0);
    const badge = document.querySelector('#todo-count');
    badge.textContent = count; badge.hidden = count === 0;
    document.querySelector('#todo-status').textContent = count ? `${count === 1 ? 'recurring expense' : 'recurring expenses'} due` : 'All caught up';
    const toggle = document.querySelector('#todo-toggle'), content = document.querySelector('#todo-content');
    content.hidden = !getState().todoOpen;
    toggle.setAttribute('aria-expanded', String(!content.hidden));
    toggle.onclick = () => { content.hidden = !content.hidden; getState().todoOpen = !content.hidden; toggle.setAttribute('aria-expanded', String(!content.hidden)); };
    const ordered = [...schedules].sort((a,b) => Number(b.active) - Number(a.active) || a.next_due.localeCompare(b.next_due));
    document.querySelector('#recurring-list').innerHTML = ordered.length ? ordered.map(r => `<article class="expense-row"><div class="expense-title"><h3>${esc(r.description)} · ${money(r.amount_cents)}</h3><p>${esc(r.frequency)} · ${r.active ? `Next: ${esc(r.next_due)}` : 'Paused'}${r.active && r.next_due <= pacificDate ? ' · Due now' : ''}</p><div class="row-actions">${r.active && r.next_due <= pacificDate ? `<button class="quiet" data-confirm="${r.id}">Review & add</button><button class="quiet" data-skip="${r.id}">Skip this occurrence</button>` : ''}<button class="quiet" data-pause="${r.id}">${r.active ? 'Pause' : 'Resume'}</button></div></div></article>`).join('') : '<p class="small recurring-note">No recurring expenses yet.</p>';
    for (const action of ['confirm','skip','pause']) document.querySelectorAll(`[data-${action}]`).forEach(button => {
      button.onclick = () => {
        const row = schedules.find(r => r.id === button.dataset[action]);
        const title = action === 'confirm' ? 'Add this occurrence?' : action === 'skip' ? 'Skip this occurrence?' : row.active ? 'Pause this schedule?' : 'Resume this schedule?';
        const dialog = open(title, `<p>${esc(row.description)} · ${money(row.amount_cents)}<br>Due ${esc(row.next_due)} · ${row.paid_by === 'kirk' ? 'Kirk' : 'Jenny'} paid<br>Kirk’s share ${money(row.kirk_share_cents)} · Jenny’s share ${money(row.amount_cents - row.kirk_share_cents)}</p><p class="small">${action === 'confirm' ? 'Adds one expense dated on this due date. Older missed occurrences remain separate reminders.' : action === 'skip' ? 'Advances to the next occurrence without adding an expense.' : 'Pausing stops reminders; resuming keeps the original next due date. To change the amount or cadence, pause this schedule and create a replacement.'}</p><form id="recurring-action"><button type="submit" class="primary">Confirm</button></form>`);
        const form = document.querySelector('#recurring-action');
        form.onsubmit = event => { event.preventDefault(); submit(form, () => action === 'pause' ? client.rpc('save_recurring', { p_id: row.id, p_version: row.version, p_values: { active: !row.active } }) : client.rpc('confirm_recurring', { p_id: row.id, p_version: row.version, p_skip: action === 'skip' }), dialog); };
      };
    });
  }
  return { actions, wireRows, recurringMarkup, wireRecurring };
}
