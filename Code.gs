/**
 * Survey backend -- Google Apps Script Web App.
 *
 * Three actions, all over POST:
 *
 *   (no action) / "submit"  append one response row  -- public
 *   "read"                  return every response    -- password required
 *   "delete"                archive one response     -- password required
 *
 * The admin password is NOT in this file. This file lives in a public
 * GitHub repository, so anything written here is world-readable. The
 * password is read from a Script Property named ADMIN_PASSWORD, which is
 * stored on Google's side and never enters git. See README.md.
 *
 * Deployment steps are in README.md.
 */

var SHEET_NAME   = 'Responses';
var TRASH_NAME   = 'Deleted';      // deleted rows are moved here, not destroyed
var PW_PROPERTY  = 'ADMIN_PASSWORD';

// Brute-force limits. A wrong password always costs the caller FAIL_DELAY_MS,
// and after MAX_FAILS wrong tries the read action is refused for
// LOCKOUT_MINUTES regardless of what is sent.
var FAIL_DELAY_MS   = 1500;
var MAX_FAILS       = 8;
var LOCKOUT_MINUTES = 15;

/** Visiting the /exec URL in a browser hits this -- a quick "is it live?" check. */
function doGet() {
  return json_({ ok: true, service: 'survey', sheet: SHEET_NAME });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // Two people submitting at the same moment must not race on the header row.
    lock.waitLock(30000);
  } catch (err) {
    return json_({ ok: false, code: 'busy', error: 'Server busy, please retry.' });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json_({ ok: false, code: 'bad_request', error: 'Empty request body.' });
    }
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;

    if (action === 'read' || action === 'delete') {
      var refusal = authorize_(payload);
      if (refusal) return refusal;
      return action === 'read' ? handleRead_() : handleDelete_(payload);
    }

    // A named action this deployment does not recognise means the page is
    // newer than the deployed code. Refuse it. Falling through to
    // handleSubmit_ would silently append a blank row on every attempt,
    // which is exactly what a delete against an older deployment did.
    if (action) {
      return json_({ ok: false, code: 'unknown_action', staleServer: true,
        action: String(action), error: 'This deployment does not know that action. Nothing was written.' });
    }

    return handleSubmit_(payload);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Public: append a response                                           */
/* ------------------------------------------------------------------ */

function handleSubmit_(payload) {
  // Honeypot: real users never see that field, bots fill it in.
  // Answer 200/ok so the bot has nothing to learn, but store nothing.
  if (payload._hp) return json_({ ok: true });

  var answers = payload.answers || {};
  var meta    = payload.meta || {};

  var sheet   = getSheet_();
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
}

/* ------------------------------------------------------------------ */
/* Admin: read every response, password required                       */
/* ------------------------------------------------------------------ */

/**
 * Gate for every admin action. Returns a refusal response to send back, or
 * null when the caller may proceed.
 */
function authorize_(payload) {
  var props = PropertiesService.getScriptProperties();
  var expected = props.getProperty(PW_PROPERTY);

  if (!expected) {
    return json_({ ok: false, code: 'no_password_set', error:
      'ADMIN_PASSWORD is not set. Add it under Project Settings > Script Properties.' });
  }

  // Refuse outright while locked out, without even looking at the password.
  var until = Number(props.getProperty('lockout_until') || 0);
  if (until && Date.now() < until) {
    return json_({ ok: false, code: 'locked', locked: true,
      minutes: Math.ceil((until - Date.now()) / 60000),
      error: 'Too many wrong attempts.' });
  }

  if (!constantTimeEquals_(String(payload.password || ''), expected)) {
    var fails = Number(props.getProperty('fail_count') || 0) + 1;
    props.setProperty('fail_count', String(fails));
    if (fails >= MAX_FAILS) {
      props.setProperty('lockout_until',
        String(Date.now() + LOCKOUT_MINUTES * 60000));
      props.setProperty('fail_count', '0');
    }
    // Slow every guess down; a scripted attack cannot go faster than this.
    Utilities.sleep(FAIL_DELAY_MS);
    return json_({ ok: false, code: 'bad_password', error: 'Wrong password.' });
  }

  props.deleteProperty('fail_count');
  props.deleteProperty('lockout_until');
  return null;
}

function handleRead_() {
  var sheet = getSheet_();
  var last  = sheet.getLastRow();
  var width = Math.max(sheet.getLastColumn(), 1);
  var headers = getHeaders_(sheet);
  var rows = last > 1
    ? sheet.getRange(2, 1, last - 1, width).getDisplayValues()
    : [];

  return json_({ ok: true, headers: headers, rows: rows, count: rows.length });
}

/**
 * Archive one response.
 *
 * Row numbers shift as soon as anything is deleted, so a stale dashboard
 * could otherwise delete the wrong person. The caller must send back the
 * timestamp and name it believes are on that row; if they do not match, the
 * delete is refused and the client is told to reload.
 *
 * The row is copied to the Deleted sheet before removal, so a mistake is
 * recoverable -- nothing is permanently destroyed here.
 */
function handleDelete_(payload) {
  var rowNum = Number(payload.row);
  var sheet  = getSheet_();
  var last   = sheet.getLastRow();
  var width  = Math.max(sheet.getLastColumn(), 1);

  if (!rowNum || rowNum < 2 || rowNum > last) {
    return json_({ ok: false, code: 'row_missing', stale: true,
      error: 'That row no longer exists.' });
  }

  var headers = getHeaders_(sheet);
  var values  = sheet.getRange(rowNum, 1, 1, width).getDisplayValues()[0];
  var verify  = payload.verify || {};

  var actual = {
    timestamp: String(values[headers.indexOf('timestamp')] || ''),
    name:      String(values[headers.indexOf('name')] || '')
  };
  if (String(verify.timestamp || '') !== actual.timestamp ||
      String(verify.name || '')      !== actual.name) {
    return json_({ ok: false, code: 'stale_row', stale: true,
      actualName: actual.name, error: 'Row changed since the page loaded.' });
  }

  // Copy to the archive sheet first, so a failure here aborts before removal.
  var trash = getTrashSheet_(headers);
  trash.appendRow([new Date()].concat(values));

  sheet.deleteRow(rowNum);

  return json_({ ok: true, deleted: actual.name,
                 remaining: Math.max(sheet.getLastRow() - 1, 0) });
}

/** The archive sheet, created on first use with a deleted_at column. */
function getTrashSheet_(headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var trash = ss.getSheetByName(TRASH_NAME);
  if (!trash) {
    trash = ss.insertSheet(TRASH_NAME);
  }
  if (trash.getLastRow() === 0) {
    var head = ['deleted_at'].concat(headers);
    trash.getRange(1, 1, 1, head.length).setValues([head]);
    trash.getRange(1, 1, 1, head.length).setFontWeight('bold');
    trash.setFrozenRows(1);
  }
  return trash;
}

/** Compare without leaking length or position through timing. */
function constantTimeEquals_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/* ------------------------------------------------------------------ */
/* Sheet helpers                                                       */
/* ------------------------------------------------------------------ */

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
