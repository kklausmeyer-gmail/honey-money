export const HEADERS = ['Date', 'Description', 'Category', 'Cost', 'Currency', 'Jenny', 'Kirk Klausmeyer'];

// Parse quoted commas, escaped quotes, CRLF, and embedded newlines without a network service.
export function csvRows(text) {
  if (text.length > 10_000_000) throw new Error('Export is too large (10 MB maximum).');
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], cell = '', quoted = false, closed = false;
  const finishCell = () => { row.push(cell); cell = ''; closed = false; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === ',') finishCell();
    else if (c === '\r' || c === '\n') {
      finishCell(); rows.push(row); row = [];
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else if (c === '"' && !cell && !closed) quoted = true;
    else {
      if (closed || c === '"') throw new Error('CSV quoting is invalid. Use the original CSV export.');
      cell += c;
    }
  }
  if (quoted) throw new Error('CSV has an unfinished quoted field.');
  if (cell || row.length || closed) { finishCell(); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

export function signedCents(value) {
  const text = String(value).trim();
  if (!/^-?\d{1,8}(\.\d{1,2})?$/.test(text)) throw new Error('Amounts must be numbers with at most two decimal places.');
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  return (Number(whole) * 100 + Number(fraction.padEnd(2, '0'))) * (text.startsWith('-') ? -1 : 1);
}

export function previewSplitwise(text) {
  const csv = csvRows(text);
  if (!csv.length || csv[0].length !== HEADERS.length || csv[0].some((v, i) => v.trim() !== HEADERS[i])) {
    throw new Error('Expected columns: ' + HEADERS.join(', ') + '. Use this group’s original comma-separated CSV.');
  }
  if (csv.length < 2 || csv.length > 20001) throw new Error('Choose an export containing 1–20,000 records.');
  const rows = []; let net = 0, payments = 0;
  for (let i = 1; i < csv.length; i++) {
    try {
      const r = csv[i].map(c => c.trim());
      if (r.length !== 7) throw new Error('Expected seven columns.');
      const [date, description, category, cost, currency, jenny, kirk] = r;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date < '1900-01-01') {
        throw new Error('Expected a valid YYYY-MM-DD date. Summary/footer rows must be reviewed separately.');
      }
      if (!description || description.length > 200 || category.length > 80) throw new Error('Description/category is missing or too long.');
      if (currency !== 'USD') throw new Error('Only USD is supported. Currency conversion is not automatic.');
      const amount = signedCents(cost), jennyDelta = signedCents(jenny), kirkDelta = signedCents(kirk);
      if (jennyDelta + kirkDelta !== 0 || Math.abs(kirkDelta) > Math.abs(amount)) throw new Error('The two balance changes must cancel and fit within the cost.');
      const kind = category.toLowerCase() === 'payment' ? 'settlement' : 'expense';
      if (kind === 'settlement') payments++;
      net += kirkDelta;
      rows.push({ source_row: i, expense_date: date, description, category, cost_cents: amount, currency, kirk_delta_cents: kirkDelta, jenny_delta_cents: jennyDelta, kind });
    } catch (err) { throw new Error(`CSV record ${i + 1}: ${err.message}`); }
  }
  return { rows, net, payments, expenses: rows.length - payments };
}
