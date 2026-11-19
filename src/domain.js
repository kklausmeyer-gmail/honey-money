export function cents(value) {
  const text = String(value).trim();
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) throw new Error('Enter a positive amount with at most two decimal places.');
  const [whole, fraction = ''] = text.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (amount <= 0) throw new Error('The amount must be greater than zero.');
  return amount;
}

export function kirkShare(amount, split, custom) {
  if (split === 'half') return Math.floor(amount / 2);
  if (split === 'kirk') return amount;
  if (split === 'jenny') return 0;
  if (split !== 'custom') throw new Error('Choose a split.');
  if (String(custom).trim() === '0' || String(custom).trim() === '0.00') return 0;
  const share = cents(custom);
  if (share > amount) throw new Error('Kirk’s share cannot exceed the total.');
  return share;
}

export const money = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const balance = (rows) => rows.reduce((sum, row) => sum + (row.source === 'splitwise' ? row.kirk_delta_cents : (row.paid_by === 'kirk' ? row.amount_cents : 0) - row.kirk_share_cents), 0);
export function searchable(row, query) {
  return [row.description, row.notes, row.category, ...(row.tags || []), row.expense_date, ((row.source === 'splitwise' ? row.cost_cents : row.amount_cents) / 100).toFixed(2), row.paid_by, row.source, row.kind]
    .join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}
