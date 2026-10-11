/**
 * Pure logic (no SpreadsheetApp) shared by Apps Script and vitest tests.
 * In the Apps Script editor this file is "Core.gs"; in Node it is exported via module.exports.
 */

var MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

/** Column I = day 1 (1-based). */
var FIRST_DAY_COL = 9;

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Number in Sheets formula syntax. The decimal separator depends on the
 * spreadsheet locale ("," for pl_PL), so the caller passes it in.
 */
function fmtNum(n, sep) {
  var s = String(round2(n));
  return sep === ',' ? s.replace('.', ',') : s;
}

/** "1 234,56 zł" / "1234.56" / 1234.56 → 1234.56; empty/invalid → null. */
function toNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v === null || v === undefined) return null;
  var s = String(v).replace(/zł/g, '').replace(/[\s ]/g, '').replace(',', '.');
  if (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/**
 * Adds an amount to a day cell.
 * @param {string} formula  getFormula() result ('' when there is no formula)
 * @param {*} value         getValue() result
 * @param {number} amount   amount (negative = refund / correction)
 * @param {string=} sep     decimal separator for formulas ('.' default, ',' for comma locales)
 * @return {{formula?: string, value?: number, error?: string}}
 */
function appendAmount(formula, value, amount, sep) {
  var a = round2(amount);
  var term = (a < 0 ? '-' : '+') + fmtNum(Math.abs(a), sep);
  if (formula) return { formula: formula + term };
  if (value === '' || value === null || value === undefined) return { value: a };
  if (typeof value === 'number') return { formula: '=' + fmtNum(value, sep) + term };
  return { error: 'Komórka zawiera tekst „' + value + '” — popraw ją ręcznie w arkuszu.' };
}

/**
 * Reverts a previously added amount: strips the matching trailing formula term
 * (written with either decimal separator), otherwise appends the opposite amount.
 */
function removeAmount(formula, value, amount, sep) {
  var a = round2(amount);
  if (!formula) {
    if (typeof value === 'number' && round2(value) === a) return { value: '' };
    return appendAmount(formula, value, -a, sep);
  }
  var seps = ['.', ','];
  for (var i = 0; i < seps.length; i++) {
    var term = (a < 0 ? '-' : '+') + fmtNum(Math.abs(a), seps[i]);
    if (formula.length > term.length && formula.slice(-term.length) === term) {
      var rest = formula.slice(0, -term.length);
      if (/^=-?\d+([.,]\d+)?$/.test(rest)) return { value: Number(rest.slice(1).replace(',', '.')) };
      return { formula: rest };
    }
  }
  return appendAmount(formula, value, -a, sep);
}

/**
 * Parses a month sheet (values of columns A..J).
 * A group header is a row whose columns I and J hold 1 and 2 (day numbers).
 * @return {{income: Array, expense: Array}} groups {name,row,items:[{name,row}]}, row is 1-based
 */
function parseMonthValues(values) {
  var out = { income: [], expense: [] };
  var section = null;
  var group = null;
  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    var name = String(row[1] === null || row[1] === undefined ? '' : row[1]).trim();
    if (name === 'Przychody') { section = 'income'; group = null; continue; }
    if (name === 'Wydatki') { section = 'expense'; group = null; continue; }
    if (!section) continue;
    if (name === 'SUMA') break;
    if (toNum(row[FIRST_DAY_COL - 1]) === 1 && toNum(row[FIRST_DAY_COL]) === 2) {
      if (!name) continue;
      group = { name: name, row: r + 1, items: [] };
      out[section].push(group);
      continue;
    }
    if (!name || name === '.' || name === 'Kategoria' || name === 'SUMA:') continue;
    if (group) group.items.push({ name: name, row: r + 1 });
  }
  return out;
}

/** First numeric value (columns C..H) in the row whose column B equals `label`. */
function findLabelValue(values, label) {
  for (var r = 0; r < values.length; r++) {
    if (String(values[r][1]).trim() !== label) continue;
    for (var c = 2; c < Math.min(values[r].length, 8); c++) {
      var n = toNum(values[r][c]);
      if (n !== null) return n;
    }
    return 0;
  }
  return null;
}

/**
 * Maps months to columns (0-based) from the STAN KONT header row.
 * Headers may be text ("Luty") or dates; missing months are inferred by
 * position relative to the ones found (month columns are consecutive).
 * @return {{start: number|null, months: Array<number|null>}}
 */
function accountColumns(headerRow) {
  var months = [null, null, null, null, null, null, null, null, null, null, null, null];
  var start = null;
  for (var c = 2; c < headerRow.length; c++) {
    var h = headerRow[c];
    var idx = -1;
    if (h instanceof Date) idx = h.getMonth();
    else idx = MONTHS.indexOf(String(h === null || h === undefined ? '' : h).trim());
    if (idx >= 0 && months[idx] === null) months[idx] = c;
    else if (start === null && /stan/i.test(String(h))) start = c;
  }
  var anchor = -1;
  for (var i = 0; i < 12; i++) if (months[i] !== null) { anchor = i; break; }
  if (anchor >= 0) {
    for (var m = 0; m < 12; m++) {
      if (months[m] !== null) continue;
      // nearest known month before m (or the anchor)
      var k = m - 1;
      while (k >= 0 && months[k] === null) k--;
      if (k < 0) months[m] = months[anchor] - (anchor - m);
      else months[m] = months[k] + (m - k);
    }
  }
  return { start: start, months: months };
}

/**
 * Parses STAN KONT: two sections starting with a "Nazwa konta" row
 * (assets, then debts), each ending with a "SUMA:" row.
 * @return {{header: Array, assets: Array<{name,row}>, debts: Array<{name,row}>}}
 */
function parseAccountsValues(values) {
  var sections = [];
  var current = null;
  var header = null;
  for (var r = 0; r < values.length; r++) {
    var name = String(values[r][1] === null || values[r][1] === undefined ? '' : values[r][1]).trim();
    if (name === 'Nazwa konta') {
      if (!header) header = values[r];
      current = [];
      sections.push(current);
      continue;
    }
    if (!current) continue;
    if (name === 'SUMA:') { current = null; continue; }
    if (!name) continue;
    current.push({ name: name, row: r + 1 });
  }
  return { header: header || [], assets: sections[0] || [], debts: sections[1] || [] };
}

if (typeof module !== 'undefined') {
  module.exports = {
    MONTHS: MONTHS, FIRST_DAY_COL: FIRST_DAY_COL, round2: round2, fmtNum: fmtNum, toNum: toNum,
    appendAmount: appendAmount, removeAmount: removeAmount, parseMonthValues: parseMonthValues,
    findLabelValue: findLabelValue, accountColumns: accountColumns, parseAccountsValues: parseAccountsValues
  };
}
