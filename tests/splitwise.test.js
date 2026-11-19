import test from 'node:test';
import assert from 'node:assert/strict';
import { HEADERS, csvRows, previewSplitwise } from '../src/splitwise.js';
import { balance, searchable } from '../src/domain.js';
const csv = (...rows) => [HEADERS.join(','), ...rows].join('\r\n');

test('quoted descriptions, settlements, refunds and zero rows conserve exact balance', () => {
  const preview = previewSplitwise('\uFEFF' + csv(
    '2026-01-01,"Dinner, ""together""",Dining,100.00,USD,50,-50',
    '2026-01-02,Payment,Payment,20,USD,-20,20',
    '2026-01-03,Refund,General,-10,USD,-5,5',
    '2026-01-04,Personal,General,10,USD,0,0', '',
  ));
  assert.equal(preview.rows[0].description, 'Dinner, "together"');
  assert.equal(preview.net, -2500);
  assert.equal(preview.payments, 1);
  assert.equal(preview.expenses, 3);
  const rows = preview.rows.map(r => ({ ...r, source: 'splitwise' }));
  assert.equal(balance(rows), -2500);
  assert.equal(balance([...rows, { paid_by: 'kirk', amount_cents: 100, kirk_share_cents: 50 }]), -2450);
  assert.equal(searchable(rows[0], 'dinner'), true);
  assert.deepEqual(csvRows('"a\nb","c"\r\n'), [['a\nb', 'c']]);
});

test('invalid exports fail closed rather than silently dropping rows', () => {
  for (const row of [
    '2026-02-30,Bad date,General,10,USD,5,-5',
    '2026-01-01,Extra person,General,10,USD,5,-4',
    '2026-01-01,Wrong currency,General,10,EUR,5,-5',
    '2026-01-01,Too precise,General,1.001,USD,0,0',
    '2026-01-01,Wrong deltas,General,10,USD,11,-11',
    'Total balance,,,,,5,-5',
    '2026-01-01,"Unfinished,General,10,USD,5,-5',
    '2026-01-01,"Closed"oops,General,10,USD,5,-5',
    '2026-01-01,Extra column,General,10,USD,5,-5,other',
  ]) assert.throws(() => previewSplitwise(csv(row)));
  assert.throws(() => previewSplitwise(csv()));
  assert.throws(() => previewSplitwise('Date,Cost\n2026-01-01,5'));
});
