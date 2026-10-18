/**
 * Daily e-mail reminders to fill in the budget, configured per person from the app.
 * Setup: run setupReminders() once from the Apps Script editor (it asks for Gmail permission).
 * Per-person settings live in the REMINDERS Script Property: { "<email>": { enabled, hour, lastSent } }.
 * Optional Script Property APP_URL: link opened by the button in the e-mail.
 */

var REMINDERS_PROP = 'REMINDERS';
var DEFAULT_REMINDER_HOUR = 22;
var DEFAULT_APP_URL = 'https://luciob90.github.io/budzet-domowy/';

/** Installs the hourly trigger; adds the owner at 22:00 if nobody is configured yet. */
function setupReminders() {
  removeReminders();
  ensureReminderTrigger_();
  var cfg = loadReminders_();
  if (Object.keys(cfg).length === 0) {
    cfg[Session.getEffectiveUser().getEmail().toLowerCase()] = { enabled: true, hour: DEFAULT_REMINDER_HOUR };
    saveReminders_(cfg);
  }
  Logger.log('Przypomnienia: ' + JSON.stringify(cfg));
}

/** Removes the trigger — no reminder is sent to anyone until setupReminders() runs again. */
function removeReminders() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'runReminders' || fn === 'sendDailyReminder') ScriptApp.deleteTrigger(t);
  });
}

function ensureReminderTrigger_() {
  var exists = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'runReminders'; });
  if (!exists) ScriptApp.newTrigger('runReminders').timeBased().everyHours(1).create();
}

function loadReminders_() {
  try {
    return JSON.parse(PropertiesService.getScriptProperties().getProperty(REMINDERS_PROP) || '{}');
  } catch (err) {
    return {};
  }
}

function saveReminders_(cfg) {
  PropertiesService.getScriptProperties().setProperty(REMINDERS_PROP, JSON.stringify(cfg));
}

function normEmail_(email) {
  var e = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('Nieprawidłowy adres e-mail.');
  return e;
}

// ---------- API (called from Code.js) ----------

function getReminder_(email) {
  var e = normEmail_(email);
  var c = loadReminders_()[e];
  return { email: e, enabled: Boolean(c && c.enabled), hour: c ? c.hour : DEFAULT_REMINDER_HOUR };
}

function setReminder_(p) {
  var e = normEmail_(p.email);
  var hour = Number(p.hour);
  if (!(hour >= 0 && hour <= 23 && Math.floor(hour) === hour)) throw new Error('Nieprawidłowa godzina.');
  var cfg = loadReminders_();
  cfg[e] = { enabled: p.enabled === true, hour: hour, lastSent: cfg[e] ? cfg[e].lastSent : undefined };
  saveReminders_(cfg);
  ensureReminderTrigger_();
  return getReminder_(e);
}

// ---------- trigger ----------

/** Runs every hour; e-mails everyone whose reminder hour is now and who has not got one today. */
function runReminders() {
  var tz = Session.getScriptTimeZone();
  var now = new Date();
  var hour = Number(Utilities.formatDate(now, tz, 'H'));
  var today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var cfg = loadReminders_();
  var due = Object.keys(cfg).filter(function (e) {
    return cfg[e].enabled && cfg[e].hour === hour && cfg[e].lastSent !== today;
  });
  if (due.length === 0) return;

  var mail = buildReminderMail_(now);
  due.forEach(function (e) {
    MailApp.sendEmail({ to: e, subject: mail.subject, body: mail.text, htmlBody: mail.html, name: 'Budżet domowy' });
    cfg[e].lastSent = today;
  });
  // re-read so a concurrent change from the app is not overwritten
  var fresh = loadReminders_();
  due.forEach(function (e) { if (fresh[e]) fresh[e].lastSent = today; });
  saveReminders_(fresh);
}

/** Sends the reminder to yourself right away (handy for checking how it looks). */
function sendTestReminder() {
  var mail = buildReminderMail_(new Date());
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(), subject: mail.subject, body: mail.text, htmlBody: mail.html, name: 'Budżet domowy'
  });
}

/** Totals for one day column of the month sheet: { income, expense }. */
function dayTotals_(m, day) {
  var sheet = monthSheet_(m);
  var s = monthStructure_(sheet);
  var column = sheet.getRange(1, FIRST_DAY_COL + day - 1, sheet.getLastRow(), 1).getValues();
  function sum(groups) {
    var total = 0;
    groups.forEach(function (g) {
      g.items.forEach(function (i) { total += toNum(column[i.row - 1][0]) || 0; });
    });
    return round2(total);
  }
  return { income: sum(s.income), expense: sum(s.expense) };
}

function money_(n) {
  if (n === null || n === undefined) return '—';
  var parts = round2(n).toFixed(2).split('.');
  return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + parts[1] + ' zł';
}

function buildReminderMail_(now) {
  var m = now.getMonth() + 1;
  var today = dayTotals_(m, now.getDate());
  var sum = getMonth_(m).summary;
  var appUrl = PropertiesService.getScriptProperties().getProperty('APP_URL') || DEFAULT_APP_URL;
  var dateLabel = Utilities.formatDate(now, Session.getScriptTimeZone(), 'd.MM');

  var rows = [
    ['Wydatki dziś', money_(today.expense)],
    ['Wydatki w ' + MONTHS[m - 1].toLowerCase(), money_(sum.expense)],
    ['Przychody w miesiącu', money_(sum.income)],
    ['Zostało do końca miesiąca', money_(sum.left)]
  ];
  var html =
    '<div style="font-family:Arial,sans-serif;max-width:480px">' +
    '<p style="font-size:16px">Czy wszystkie dzisiejsze wydatki są już w budżecie?</p>' +
    '<table style="border-collapse:collapse;width:100%;font-size:14px">' +
    rows.map(function (r) {
      return '<tr><td style="padding:6px 0;color:#555">' + r[0] + '</td>' +
        '<td style="padding:6px 0;text-align:right;font-weight:bold">' + r[1] + '</td></tr>';
    }).join('') +
    '</table>' +
    '<p style="margin:24px 0"><a href="' + appUrl + '" style="background:#0f766e;color:#fff;padding:12px 20px;' +
    'border-radius:10px;text-decoration:none;font-weight:bold">Otwórz budżet</a></p>' +
    '<p style="font-size:12px;color:#888">Godzinę lub wyłączenie przypomnienia zmienisz w aplikacji: Ustawienia → Przypomnienie e-mail.</p>' +
    '</div>';
  var text = 'Czy wszystkie dzisiejsze wydatki są już w budżecie?\n\n' +
    rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') + '\n\n' + appUrl +
    '\n\nGodzinę lub wyłączenie przypomnienia zmienisz w aplikacji: Ustawienia → Przypomnienie e-mail.';

  return { subject: 'Budżet ' + dateLabel + ': uzupełnij wydatki', text: text, html: html };
}
