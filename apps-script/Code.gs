/**
 * @OnlyCurrentDoc
 * Limits access to the one Sheet this script is bound to. The explicit
 * oauthScopes in appsscript.json are authoritative; this is a fallback in case
 * the manifest is ever reset.
 */

/**
 * Sacramento Cyber Con — sign-up form receiver.
 *
 * Paste this into Extensions → Apps Script of the Google Sheet that should
 * collect submissions, run `setup` once, then deploy as a Web app
 * (Execute as: Me, Who has access: Anyone). See README.md for step-by-step.
 *
 * Each submission is written to the "All" tab, plus one row in the tab for
 * every role the person selected (Attend / Sponsor / Speak / Workshop-Village).
 */

// Optional: comma-separated addresses to email on every new submission.
// Setting this also requires adding
//   "https://www.googleapis.com/auth/script.send_mail"
// to oauthScopes in appsscript.json, then re-authorizing.
var NOTIFY_EMAIL = '';

// Reject submissions completed faster than this (bots fill forms instantly).
var MIN_FILL_MS = 3000;

// Max submissions per email address per 10 minutes.
var RATE_LIMIT = 5;

// Max submissions across ALL senders per 10 minutes. Caps flooding by a bot
// that rotates email addresses. Raise it if a real sign-up rush hits it.
var GLOBAL_RATE_LIMIT = 100;

var BASE_COLUMNS = [
  ['timestamp', 'Timestamp'],
  ['id', 'Submission ID'],
  ['name', 'Name'],
  ['email', 'Email'],
  ['organization', 'Organization'],
];

var TABS = {
  All: BASE_COLUMNS.concat([
    ['roles', 'Roles'],
    ['handle', 'Handle'],
    ['referral', 'Heard About Us'],
    ['comments', 'Comments'],
    ['updates_opt_in', 'Email Updates'],
    ['coc_agree', 'Agreed to CoC'],
  ]),
  Attend: BASE_COLUMNS.concat([
    ['attend_type', 'Attendee Type'],
    ['attend_group_size', 'Group Size'],
    ['attend_volunteer', 'Wants to Volunteer'],
  ]),
  Sponsor: BASE_COLUMNS.concat([
    ['sponsor_company', 'Company'],
    ['sponsor_website', 'Website'],
    ['sponsor_tier', 'Tier Interest'],
    ['sponsor_phone', 'Phone'],
  ]),
  Speak: BASE_COLUMNS.concat([
    ['speak_title', 'Talk Title'],
    ['speak_length', 'Format'],
    ['speak_level', 'Audience Level'],
    ['speak_abstract', 'Abstract'],
    ['speak_links', 'Previous Talks'],
    ['speak_first_time', 'First Talk'],
  ]),
  'Workshop-Village': BASE_COLUMNS.concat([
    ['workshop_type', 'Type'],
    ['workshop_title', 'Title'],
    ['workshop_description', 'Description'],
    ['workshop_capacity', 'Capacity'],
    ['workshop_duration', 'Duration'],
    ['workshop_needs', 'Space/Power/Network Needs'],
  ]),
};

// Form role value → tab name
var ROLE_TABS = { attend: 'Attend', sponsor: 'Sponsor', speak: 'Speak', workshop: 'Workshop-Village' };

// Checkboxes are omitted from the payload when unchecked; record them as "no".
var CHECKBOX_FIELDS = ['attend_volunteer', 'speak_first_time', 'updates_opt_in', 'coc_agree'];

/** Run once from the Apps Script editor to create tabs and header rows. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABS).forEach(function (name) { getOrCreateTab_(ss, name); });
  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);
}

function doGet() {
  return json_({ ok: true, service: 'Sacramento Cyber Con sign-up' });
}

function doPost(e) {
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // Spam traps: pretend success so bots don't learn anything.
    if (data.website_url || Number(data.elapsed_ms) < MIN_FILL_MS) return json_({ ok: true });

    var error = validate_(data);
    if (error) return json_({ ok: false, error: error });

    if (isRateLimited_(data.email)) return json_({ ok: false, error: 'Too many submissions. Please try again later.' });

    CHECKBOX_FIELDS.forEach(function (f) { data[f] = data[f] === 'yes' ? 'yes' : 'no'; });
    data.timestamp = new Date();
    data.id = Utilities.getUuid().slice(0, 8);
    data.roles = data.roles.join(', ');

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      appendRow_(ss, 'All', data);
      data.roles.split(', ').forEach(function (role) { appendRow_(ss, ROLE_TABS[role], data); });
    } finally {
      lock.releaseLock();
    }

    // The row is already saved; a mail failure shouldn't report the submission as failed.
    if (NOTIFY_EMAIL) {
      try { notify_(data); } catch (mailErr) { console.error(mailErr); }
    }
    return json_({ ok: true, id: data.id });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'Server error' });
  }
}

function validate_(data) {
  if (!Array.isArray(data.roles) || !data.roles.length) return 'Select at least one role.';
  for (var i = 0; i < data.roles.length; i++) {
    if (!ROLE_TABS[data.roles[i]]) return 'Unknown role.';
  }
  if (!str_(data.name)) return 'Name is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str_(data.email))) return 'A valid email is required.';
  if (data.coc_agree !== 'yes') return 'You must agree to the Code of Conduct.';
  if (data.roles.indexOf('sponsor') > -1 && !str_(data.sponsor_company)) return 'Company is required for sponsors.';
  if (data.roles.indexOf('speak') > -1 && (!str_(data.speak_title) || !str_(data.speak_abstract))) return 'Talk title and abstract are required.';
  if (data.roles.indexOf('workshop') > -1 && (!str_(data.workshop_title) || !str_(data.workshop_description))) return 'Workshop/village title and description are required.';
  return null;
}

function isRateLimited_(email) {
  return bump_('rl_global', GLOBAL_RATE_LIMIT) || bump_('rl_' + str_(email).toLowerCase(), RATE_LIMIT);
}

function bump_(key, limit) {
  var cache = CacheService.getScriptCache();
  var count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), 600);
  return count > limit;
}

function appendRow_(ss, tabName, data) {
  var sheet = getOrCreateTab_(ss, tabName);
  var row = TABS[tabName].map(function (col) { return clean_(data[col[0]]); });
  sheet.appendRow(row);
}

function getOrCreateTab_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    var headers = TABS[name].map(function (col) { return col[1]; });
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Trim, cap length, and neutralize spreadsheet formula injection
 * (values starting with = + - @ would otherwise be evaluated by Sheets).
 */
function clean_(value) {
  if (value instanceof Date) return value;
  var s = str_(value).slice(0, 5000);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function str_(v) {
  return v === undefined || v === null ? '' : String(v).trim();
}

function notify_(data) {
  // Only known "All" columns, so attacker-supplied extra keys never reach the email.
  var body = TABS.All
    .filter(function (col) { return str_(data[col[0]]) !== ''; })
    .map(function (col) { return col[1] + ': ' + str_(data[col[0]]); })
    .join('\n');
  var name = str_(data.name).replace(/[\r\n\t]+/g, ' ').slice(0, 80);
  MailApp.sendEmail(NOTIFY_EMAIL, '[SacCyberCon] New sign-up: ' + name + ' (' + data.roles + ')', body);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
