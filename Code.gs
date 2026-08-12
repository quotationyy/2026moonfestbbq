/**
 * Survey backend — Google Apps Script Web App.
 *
 * Receives a POST from survey/index.html and appends one row to the
 * spreadsheet this script is bound to. Columns are created automatically
 * from the question ids, so adding a question to the form later just adds
 * a new column instead of breaking anything.
 *
 * Deployment steps are in README.md.
 */

var SHEET_NAME = 'Responses';

/** Visiting the /exec URL in a browser hits this — a quick "is it live?" check. */
function doGet() {
  return json_({ ok: true, service: 'survey', sheet: SHEET_NAME });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // Two people submitting at the same moment must not race on the header row.
    lock.waitLock(30000);
  } catch (err) {
    return json_({ ok: false, error: 'Server busy, please retry.' });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json_({ ok: false, error: 'Empty request body.' });
    }

    var payload = JSON.parse(e.postData.contents);

    // Honeypot: real users never see that field, bots fill it in.
    // Answer 200/ok so the bot has nothing to learn, but store nothing.
    if (payload._hp) return json_({ ok: true });

    var answers = payload.answers || {};
    var meta = payload.meta || {};

    var sheet = getSheet_();
    var headers = getHeaders_(sheet);

    // Add a column for any question id we haven't seen before.
    var incoming = Object.keys(answers);
    var added = [];
    for (var i = 0; i < incoming.length; i++) {
      if (headers.indexOf(incoming[i]) === -1) added.push(incoming[i]);
    }
    if (added.length) {
      headers = headers.concat(added);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    // Build the row in header order so columns always line up.
    var row = new Array(headers.length).fill('');
    var put = function (header, value) {
      var at = headers.indexOf(header);
      if (at !== -1) row[at] = value;   // ignore columns the user removed
    };
    put('timestamp', new Date());
    put('submitted_at', meta.submittedAt || '');
    put('source_page', meta.page || '');
    for (var j = 0; j < incoming.length; j++) {
      put(incoming[j], answers[incoming[j]]);
    }

    sheet.appendRow(row);
    return json_({ ok: true, row: sheet.getLastRow() });

  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/** The response sheet, created with its fixed leading columns if missing. */
function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    var base = ['timestamp', 'submitted_at', 'source_page'];
    sheet.getRange(1, 1, 1, base.length).setValues([base]);
    sheet.getRange(1, 1, 1, base.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getHeaders_(sheet) {
  var width = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, width)
    .getValues()[0]
    .map(function (h) { return String(h).trim(); })
    .filter(function (h) { return h !== ''; });
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
