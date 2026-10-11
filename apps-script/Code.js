/**
 * Budget web app API (Apps Script bound to the "Budżet 20xx" spreadsheet).
 * Deploy: Web app, Execute as: me, Who has access: Anyone.
 * Every request must carry the household token stored in Script Properties under TOKEN.
 */

var LOG_SHEET = 'Transakcje';
var LOG_HEADERS = ['Zapisano', 'Data', 'Typ', 'Grupa', 'Kategoria', 'Kwota', 'Osoba', 'Opis', 'clientId', 'Status'];
var ACCOUNTS_SHEET = 'STAN KONT';
var YEAR_SHEET = 'CAŁY ROK';
var STATUS_OK = 'OK';
var STATUS_REVERTED = 'Cofnięto';

function doGet(e) {
  return handle_((e && e.parameter) || {});
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Nieprawidłowe żądanie (JSON).' });
  }
  return handle_(body);
}

function handle_(p) {
  try {
    checkToken_(p.token);
    var data;
    switch (p.action) {
      case 'ping': data = { year: sheetYear_() }; break;
      case 'categories': data = getCategories_(monthParam_(p.m)); break;
      case 'month': data = getMonth_(monthParam_(p.m)); break;
      case 'history': data = getHistory_(monthParam_(p.m)); break;
      case 'accounts': data = getAccounts_(monthParam_(p.m)); break;
      case 'add': data = withLock_(function () { return addTransaction_(p); }); break;
      case 'delete': data = withLock_(function () { return deleteTransaction_(p.clientId); }); break;
      case 'setAccount': data = withLock_(function () { return setAccount_(p); }); break;
      default: throw new Error('Nieznana akcja: ' + p.action);
    }
    return json_({ ok: true, data: data });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

// ---------- helpers ----------

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!expected) throw new Error('Brak TOKEN w Script Properties — skonfiguruj skrypt.');
  if (token !== expected) throw new Error('Nieprawidłowy token.');
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Arkusz jest zajęty, spróbuj ponownie.');
  try {
    return fn();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

/** Month number 1..12; defaults to the current month. */
function monthParam_(m) {
  var n = Number(m);
  if (!m) return new Date().getMonth() + 1;
  if (!(n >= 1 && n <= 12)) throw new Error('Nieprawidłowy miesiąc: ' + m);
  return n;
}

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Brak zakładki „' + name + '”.');
  return sh;
}

function monthSheet_(m) {
  return sheet_(MONTHS[m - 1]);
}

/** Year entered next to the "BUDŻET CAŁEGO ROKU" title (searched in the first rows). */
function sheetYear_() {
  var rows = sheet_(YEAR_SHEET).getRange(1, 1, 5, 10).getValues();
  for (var r = 0; r < rows.length; r++) {
    for (var i = 0; i < rows[r].length; i++) {
      var n = toNum(rows[r][i]);
      if (n !== null && n >= 2000 && n <= 2100) return n;
    }
  }
  return null;
}

function monthStructure_(sheet) {
  var values = sheet.getRange(1, 1, sheet.getLastRow(), FIRST_DAY_COL + 1).getValues();
  return parseMonthValues(values);
}

function fmtDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v);
}

function logSheet_() {
  var sh = ss_().getSheetByName(LOG_SHEET);
  if (!sh) {
    sh = ss_().insertSheet(LOG_SHEET);
    sh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    // keep dates as plain text so they are not shifted by time zones
    sh.getRange('B:B').setNumberFormat('@');
  }
  return sh;
}

function findLogRow_(sh, clientId) {
  if (!clientId) return null;
  var found = sh.getRange('I:I').createTextFinder(String(clientId)).matchEntireCell(true).findNext();
  return found ? found.getRow() : null;
}

function logEntry_(row) {
  return {
    savedAt: row[0] instanceof Date ? row[0].toISOString() : String(row[0]),
    date: fmtDate_(row[1]),
    type: row[2] === 'Przychód' ? 'income' : 'expense',
    group: String(row[3]),
    category: String(row[4]),
    amount: Number(row[5]),
    person: String(row[6]),
    note: String(row[7]),
    clientId: String(row[8]),
    status: String(row[9])
  };
}

// ---------- read actions ----------

function getCategories_(m) {
  var s = monthStructure_(monthSheet_(m));
  function strip(groups) {
    return groups
      .filter(function (g) { return g.items.length > 0; })
      .map(function (g) { return { name: g.name, items: g.items.map(function (i) { return i.name; }) }; });
  }
  return { year: sheetYear_(), income: strip(s.income), expense: strip(s.expense) };
}

function getMonth_(m) {
  var sheet = monthSheet_(m);
  var values = sheet.getRange(1, 1, sheet.getLastRow(), FIRST_DAY_COL + 1).getValues();
  var s = parseMonthValues(values);
  function amounts(row) {
    var r = values[row - 1];
    return { plan: toNum(r[2]) || 0, actual: toNum(r[3]) || 0 };
  }
  function withAmounts(groups) {
    return groups.map(function (g) {
      var a = amounts(g.row);
      return {
        name: g.name, plan: a.plan, actual: a.actual,
        items: g.items.map(function (i) { var b = amounts(i.row); return { name: i.name, plan: b.plan, actual: b.actual }; })
      };
    });
  }
  return {
    month: m,
    year: sheetYear_(),
    summary: {
      plannedIncome: findLabelValue(values, 'Planowane przychody'),
      plannedExpense: findLabelValue(values, 'Planowane wydatki'),
      income: findLabelValue(values, 'Rzeczywiste przychody'),
      expense: findLabelValue(values, 'Rzeczywiste wydatki'),
      left: findLabelValue(values, 'Mogę jeszcze wydać do końca miesiąca'),
      daysLeft: findLabelValue(values, 'Liczba dni do końca miesiąca'),
      perDay: findLabelValue(values, 'Mogę jeszcze tyle wydawać średnio dziennie')
    },
    income: withAmounts(s.income),
    expense: withAmounts(s.expense)
  };
}

function getHistory_(m) {
  var sh = logSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var rows = sh.getRange(2, 1, last - 1, LOG_HEADERS.length).getValues();
  var prefix = '-' + (m < 10 ? '0' : '') + m + '-';
  return rows
    .map(logEntry_)
    .filter(function (e) { return e.date.substr(4, 4) === prefix; })
    .reverse();
}

function getAccounts_(m) {
  var sh = sheet_(ACCOUNTS_SHEET);
  var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var parsed = parseAccountsValues(values);
  var cols = accountColumns(parsed.header);
  var col = cols.months[m - 1];
  if (col === null || col === undefined) throw new Error('Nie znaleziono kolumny miesiąca w STAN KONT.');
  var prevCol = m > 1 ? cols.months[m - 2] : cols.start;
  function rows(list) {
    return list.map(function (a) {
      var r = values[a.row - 1];
      return {
        name: a.name,
        value: toNum(r[col]),
        prev: prevCol === null || prevCol === undefined ? null : toNum(r[prevCol])
      };
    });
  }
  return { month: m, assets: rows(parsed.assets), debts: rows(parsed.debts) };
}

// ---------- write actions ----------

function addTransaction_(p) {
  var type = p.type === 'income' ? 'income' : p.type === 'expense' ? 'expense' : null;
  if (!type) throw new Error('Nieprawidłowy typ.');
  var amount = round2(Number(p.amount));
  if (!isFinite(amount) || amount === 0) throw new Error('Nieprawidłowa kwota.');
  var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(p.date || ''));
  if (!d) throw new Error('Nieprawidłowa data.');
  var year = Number(d[1]), month = Number(d[2]), day = Number(d[3]);
  var sheetYear = sheetYear_();
  if (sheetYear && year !== sheetYear) throw new Error('Ten arkusz dotyczy roku ' + sheetYear + '.');
  if (month < 1 || month > 12 || day < 1 || day > 31) throw new Error('Nieprawidłowa data.');

  var log = logSheet_();
  var existing = findLogRow_(log, p.clientId);
  if (existing) {
    return { duplicate: true, entry: logEntry_(log.getRange(existing, 1, 1, LOG_HEADERS.length).getValues()[0]) };
  }

  var sheet = monthSheet_(month);
  var cell = locateCell_(sheet, type, p.group, p.category, day);
  writeAmount_(cell, amount, appendAmount);

  var person = String(p.person || '').trim();
  var note = String(p.note || '').trim();
  var line = fmtNum(amount) + ' zł' + (person ? ' – ' + person : '') + (note ? ' – ' + note : '');
  var oldNote = cell.getNote();
  cell.setNote(oldNote ? oldNote + '\n' + line : line);

  var row = [new Date(), d[0], type === 'income' ? 'Przychód' : 'Wydatek', p.group, p.category,
    amount, person, note, String(p.clientId || Utilities.getUuid()), STATUS_OK];
  log.appendRow(row);
  return { duplicate: false, entry: logEntry_(row) };
}

function deleteTransaction_(clientId) {
  var log = logSheet_();
  var rowNo = findLogRow_(log, clientId);
  if (!rowNo) throw new Error('Nie znaleziono transakcji.');
  var entry = logEntry_(log.getRange(rowNo, 1, 1, LOG_HEADERS.length).getValues()[0]);
  if (entry.status !== STATUS_OK) return { entry: entry };

  var parts = entry.date.split('-');
  var cell = locateCell_(monthSheet_(Number(parts[1])), entry.type, entry.group, entry.category, Number(parts[2]));
  writeAmount_(cell, -entry.amount, function (f, v, a, sep) { return removeAmount(f, v, -a, sep); });
  var oldNote = cell.getNote();
  cell.setNote((oldNote ? oldNote + '\n' : '') + 'cofnięto ' + fmtNum(entry.amount) + ' zł');

  log.getRange(rowNo, 10).setValue(STATUS_REVERTED);
  entry.status = STATUS_REVERTED;
  return { entry: entry };
}

function setAccount_(p) {
  var m = monthParam_(p.m);
  var value = p.value === '' || p.value === null ? '' : toNum(p.value);
  if (value === null) throw new Error('Nieprawidłowa kwota.');
  var sh = sheet_(ACCOUNTS_SHEET);
  var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var parsed = parseAccountsValues(values);
  var list = p.section === 'debts' ? parsed.debts : parsed.assets;
  var acc = list.filter(function (a) { return a.name === p.name; })[0];
  if (!acc) throw new Error('Nie znaleziono konta „' + p.name + '”.');
  var col = accountColumns(parsed.header).months[m - 1];
  if (col === null || col === undefined) throw new Error('Nie znaleziono kolumny miesiąca w STAN KONT.');
  sh.getRange(acc.row, col + 1).setValue(value);
  return { name: acc.name, value: value === '' ? null : value };
}

/**
 * Applies `build(formula, value, amount, sep)` to the cell and checks that the cell
 * now evaluates to old value + amount. The formula decimal separator depends on the
 * spreadsheet locale, so "." is tried first and "," second; on failure the original
 * content is restored so the sheet is never left with a broken formula.
 */
function writeAmount_(cell, amount, build) {
  var formula = cell.getFormula();
  var value = cell.getValue();
  var expected = round2((typeof value === 'number' ? value : 0) + amount);
  var seps = ['.', ','];
  for (var i = 0; i < seps.length; i++) {
    var res = build(formula, value, amount, seps[i]);
    if (res.error) throw new Error(res.error);
    if (res.formula === undefined) {
      cell.setValue(res.value);
      return;
    }
    cell.setFormula(res.formula);
    SpreadsheetApp.flush();
    var now = cell.getValue();
    if (typeof now === 'number' && round2(now) === expected) return;
  }
  if (formula) cell.setFormula(formula); else cell.setValue(value);
  throw new Error('Nie udało się zapisać formuły w komórce ' + cell.getA1Notation() + ' — sprawdź ją w arkuszu.');
}

/** Finds the day cell for (type, group, category); verifies the column via the group header row. */
function locateCell_(sheet, type, groupName, category, day) {
  var s = monthStructure_(sheet);
  var group = s[type].filter(function (g) { return g.name === groupName; })[0];
  if (!group) throw new Error('Nie znaleziono grupy „' + groupName + '” w zakładce ' + sheet.getName() + '.');
  var item = group.items.filter(function (i) { return i.name === category; })[0];
  if (!item) throw new Error('Nie znaleziono kategorii „' + category + '” w grupie „' + groupName + '”.');
  var col = FIRST_DAY_COL + day - 1;
  if (toNum(sheet.getRange(group.row, col).getValue()) !== day) {
    throw new Error('Kolumna dnia ' + day + ' nie pasuje do układu arkusza ' + sheet.getName() + '.');
  }
  return sheet.getRange(item.row, col);
}
