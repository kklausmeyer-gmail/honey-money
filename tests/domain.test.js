import test from 'node:test';
import assert from 'node:assert/strict';
import { cents, kirkShare, balance, searchable } from '../src/domain.js';

test('money stays exact at decimal and upper boundaries', () => {
  assert.equal(cents('0.29'), 29);
  assert.equal(cents('99999999.99'), 9999999999);
  for (const invalid of ['0', '-1', '1.001', '1e3', 'NaN', '', '100000000']) assert.throws(() => cents(invalid));
});
test('splits conserve cents and distinguish payer from responsibility', () => {
  assert.equal(kirkShare(101, 'half'), 50);
  assert.equal(kirkShare(101, 'jenny'), 0);
  assert.equal(kirkShare(101, 'kirk'), 101);
  assert.equal(kirkShare(101, 'custom', '0.75'), 75);
  assert.equal(kirkShare(101, 'custom', '0'), 0);
  assert.throws(() => kirkShare(101, 'custom', '1.02'));
  const rows = [
    { paid_by: 'jenny', amount_cents: 101, kirk_share_cents: 50 },
    { paid_by: 'kirk', amount_cents: 500, kirk_share_cents: 0 },
  ];
  assert.equal(balance(rows), 450); // Jenny owes Kirk after offsetting both expenses.
});
test('search includes private notes, tags, amounts, and date', () => {
  const row = { description: 'Electricity', notes: 'Auto debited bank XYZ', tags: ['Home'], category: 'Utilities', expense_date: '2026-11-13', amount_cents: 12345, paid_by: 'jenny' };
  for (const query of [' BANK xyz ', 'home', '123.45', '2026-11', 'JENNY']) assert.equal(searchable(row, query), true);
  assert.equal(searchable(row, 'groceries'), false);
});
