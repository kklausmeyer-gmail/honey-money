import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRepeatDate, repeatValues, dueOccurrences, pacificToday } from '../src/recurrence.js';
test('to-do count includes every overdue occurrence and decreases after confirm or skip', () => {
  const row = {active:true,frequency:'monthly',anchor_date:'2024-01-31',next_due:'2024-01-31',occurrence:0};
  assert.equal(dueOccurrences(row,'2024-03-30'),2);
  assert.equal(dueOccurrences(row,'2024-03-31'),3);
  assert.equal(dueOccurrences({...row,occurrence:1,next_due:'2024-02-29'},'2024-03-31'),2);
  assert.equal(dueOccurrences({...row,active:false},'2024-03-31'),0);
  assert.equal(dueOccurrences({...row,next_due:'2024-04-30',occurrence:3},'2024-03-31'),0);
  assert.equal(dueOccurrences({active:true,frequency:'weekly',anchor_date:'2026-01-01',next_due:'2026-01-01',occurrence:0},'2026-01-15'),3);
  assert.equal(dueOccurrences({active:true,frequency:'yearly',anchor_date:'2024-02-29',next_due:'2024-02-29',occurrence:0},'2025-02-28'),2);
  assert.equal(pacificToday(new Date('2026-11-20T02:00:00Z')),'2026-11-19');
});
test('repeat suggestions handle month ends, leap years, and weekly year boundaries', () => {
  assert.equal(nextRepeatDate('2024-01-31','monthly'),'2024-02-29');
  assert.equal(nextRepeatDate('2023-01-31','monthly'),'2023-02-28');
  assert.equal(nextRepeatDate('2024-02-29','yearly'),'2025-02-28');
  assert.equal(nextRepeatDate('2026-12-29','weekly'),'2027-01-05');
  assert.equal(nextRepeatDate('2026-01-31','quarterly'),'2026-04-30');
});
test('conversion schedules future entries without changing imported accounting', () => {
  const expense = { expense_date:'2018-05-16',description:'Example',category:'General',cost_cents:1000,kirk_delta_cents:200 };
  const fields = new Map(Object.entries({make_recurring:'on',repeat_amount:'10.00',repeat_share:'8.00',repeat_payer:'kirk',repeat_frequency:'monthly',repeat_date:'2026-12-19'}));
  const schedule = repeatValues(fields,expense,true);
  assert.equal(schedule.amount_cents,1000);
  assert.equal(schedule.kirk_share_cents,800);
  assert.equal(schedule.anchor_date,'2026-12-19');
  assert.equal(expense.kirk_delta_cents,200);
  fields.set('repeat_date','2018-05-16');
  assert.throws(()=>repeatValues(fields,expense,true),/after/);
  fields.delete('make_recurring');
  assert.equal(repeatValues(fields,expense,true),null);
});
