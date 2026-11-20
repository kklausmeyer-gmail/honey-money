import { cents, kirkShare, assumedPayer, today } from './domain.js';

export function pacificToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function dueOccurrences(schedule, date = pacificToday()) {
  if (!schedule.active || schedule.next_due > date) return 0;
  const anchor = schedule.anchor_date || schedule.next_due;
  const occurrence = schedule.anchor_date ? schedule.occurrence || 0 : 0;
  const [y,m,d] = anchor.split('-').map(Number), [ty,tm] = date.split('-').map(Number);
  let last;
  if (schedule.frequency === 'weekly') last = Math.floor((Date.parse(date) - Date.parse(anchor)) / (7*86400000));
  else {
    const step = schedule.frequency === 'yearly' ? 12 : schedule.frequency === 'quarterly' ? 3 : 1;
    last = Math.floor(((ty-y)*12 + tm-m) / step);
    const candidate = new Date(Date.UTC(y,m-1+last*step,1));
    const end = new Date(Date.UTC(candidate.getUTCFullYear(),candidate.getUTCMonth()+1,0)).getUTCDate();
    candidate.setUTCDate(Math.min(d,end));
    if (candidate.toISOString().slice(0,10) > date) last--;
  }
  return Math.max(0,last-occurrence+1);
}

export function nextRepeatDate(date, frequency) {
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (frequency === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else {
    const months = frequency === 'yearly' ? 12 : frequency === 'quarterly' ? 3 : 1;
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  }
  return d.toISOString().slice(0,10);
}

export function repeatControls({ form, row, schedules, esc, imported = false }) {
  const source = imported ? 'splitwise_history' : 'expenses';
  if (row && (row.recurring_id || schedules.some(r => r.source_type === source && r.source_id === row.id))) {
    form.querySelector('[type="submit"]').insertAdjacentHTML('beforebegin', '<p class="small">This entry already has a recurring schedule. Manage it under Recurring & reminders.</p>');
    return;
  }
  const section = document.createElement('section');
  section.className = 'repeat-section';
  const payer = row ? assumedPayer(row) : null;
  const amount = imported ? Math.abs(row.cost_cents) : 0;
  const adjustedDelta = imported && row.cost_cents < 0 ? -row.kirk_delta_cents : row?.kirk_delta_cents;
  const share = imported && payer ? (payer === 'kirk' ? amount - adjustedDelta : -adjustedDelta) : Math.floor(amount / 2);
  section.innerHTML = `<label class="duplicate"><input type="checkbox" name="make_recurring" /> Make this a recurring expense</label><div class="repeat-options" hidden><label>Repeat interval<select name="repeat_frequency"><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></label><label>First reminder due<input name="repeat_date" type="date" value="${nextRepeatDate(today(), 'monthly')}" /></label>${imported ? `<p class="small">Confirm the amount, payer and split for future expenses. Your existing imported balance stays as edited above.</p><label>Recurring amount ($)<input name="repeat_amount" inputmode="decimal" value="${(amount / 100).toFixed(2)}" /></label><label>Who will pay?<select name="repeat_payer"><option value="kirk" ${payer === 'kirk' ? 'selected' : ''}>Kirk</option><option value="jenny" ${payer !== 'kirk' ? 'selected' : ''}>Jenny</option></select></label><label>Kirk’s share of future expenses ($)<input name="repeat_share" inputmode="decimal" value="${esc((share / 100).toFixed(2))}" /></label>` : ''}<p class="small">The existing expense is saved once. Only future occurrences use this schedule, and each one needs confirmation.</p></div>`;
  form.querySelector('[type="submit"]').before(section);
  const checkbox = form.elements.make_recurring, options = section.querySelector('.repeat-options');
  const toggle = () => {
    options.hidden = !checkbox.checked;
    options.querySelectorAll('input,select').forEach(el => { el.disabled = !checkbox.checked; el.required = checkbox.checked; });
  };
  checkbox.onchange = toggle; toggle();
  const date = form.elements.repeat_date;
  form.elements.repeat_frequency.onchange = () => { if (!date.dataset.edited) date.value = nextRepeatDate(today(), form.elements.repeat_frequency.value); };
  date.oninput = () => { date.dataset.edited = 'yes'; };
}

export function repeatValues(fields, expense, imported = false) {
  if (!fields.get('make_recurring')) return null;
  const amount = imported ? cents(fields.get('repeat_amount')) : expense.amount_cents;
  const share = imported ? kirkShare(amount, 'custom', fields.get('repeat_share')) : expense.kirk_share_cents;
  if (fields.get('repeat_date') <= expense.expense_date) throw new Error('The first reminder must be after this expense’s date.');
  return { description: expense.description, category: expense.category, notes: expense.notes || '', tags: expense.tags || [], amount_cents: amount, kirk_share_cents: share, paid_by: imported ? fields.get('repeat_payer') : expense.paid_by, frequency: fields.get('repeat_frequency'), anchor_date: fields.get('repeat_date') };
}
