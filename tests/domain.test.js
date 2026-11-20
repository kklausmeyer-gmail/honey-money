import test from 'node:test';
import assert from 'node:assert/strict';
import { cents, kirkShare, balance, searchable, assumedPayer } from '../src/domain.js';

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

test('assumed imported payers are searchable without changing authoritative balances', () => {
  const imported = { source: 'splitwise', kind: 'expense', cost_cents: 1000, kirk_delta_cents: 200, description: 'Example', expense_date: '2020-01-01', category: 'General' };
  assert.equal(assumedPayer(imported), 'kirk');
  assert.equal(searchable(imported, 'kirk'), true);
  assert.equal(balance([imported]), 200); // Do not assume a 50/50 split and change this to 500.
  assert.equal(assumedPayer({...imported, kirk_delta_cents: -200}), 'jenny');
  assert.equal(assumedPayer({...imported, cost_cents: -1000, kirk_delta_cents: -200}), 'kirk');
  assert.equal(assumedPayer({...imported, kind: 'settlement'}), null);
  assert.equal(assumedPayer({...imported, kirk_delta_cents: 0}), null);
  assert.equal(balance([{...imported, deleted_at: '2026-01-01'}]), 0);
});
