/**
 * Daily e-mail reminder to fill in the budget.
 * Setup: run setupReminders() once from the Apps Script editor (it asks for Gmail permission).
 * Optional Script Properties:
 *   REMINDER_EMAILS  comma-separated recipients (default: the script owner)
 *   APP_URL          link opened by the button in the e-mail
 */

var REMINDER_HOUR = 22;
var DEFAULT_APP_URL = 'https://luciob90.github.io/budzet-domowy/';

/** Creates the daily trigger (Apps Script fires it between 22:00 and 23:00). */
function setupReminders() {
  removeReminders();
  ScriptApp.newTrigger('sendDailyReminder').timeBased().everyDays(1).atHour(REMINDER_HOUR)
    .inTimezone(Session.getScriptTimeZone()).create();
  Logger.log('Przypomnienie ustawione codziennie o ' + REMINDER_HOUR + ':00 dla: ' + reminderRecipients_().join(', '));
}

function removeReminders() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendDailyReminder') ScriptApp.deleteTrigger(t);
  });
}

function reminderRecipients_() {
  var raw = PropertiesService.getScriptProperties().getProperty('REMINDER_EMAILS');
  var list = (raw || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  return list.length ? list : [Session.getEffectiveUser().getEmail()];
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

function sendDailyReminder() {
  var now = new Date();
  var m = now.getMonth() + 1;
  var day = now.getDate();
  var today = dayTotals_(m, day);
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
    '</div>';
  var text = 'Czy wszystkie dzisiejsze wydatki są już w budżecie?\n\n' +
    rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') + '\n\n' + appUrl;

  MailApp.sendEmail({
    to: reminderRecipients_().join(','),
    subject: 'Budżet ' + dateLabel + ': uzupełnij wydatki',
    body: text,
    htmlBody: html,
    name: 'Budżet domowy'
  });
}
