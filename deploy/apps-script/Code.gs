const SPREADSHEET_ID = '13k-jCRPQjr2n30XvInfbyYighVmKYOA7aaJxtav9Z40';
const SHEET_NAME = 'Pendaftaran';
const HEADERS = [
  'ID Pendaftaran', 'Waktu Daftar (WIB)', 'Nomor WhatsApp', 'Nama',
  'Unit Organisasi', 'Jabatan', 'Referensi Hari/Jam', 'Layanan Konsultasi', 'Metode'
];

function setup() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  spreadsheet.setSpreadsheetTimeZone('Asia/Jakarta');
  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  assertHeaders_(sheet);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length).setBackground('#f1f3f4').setFontWeight('bold').setWrap(true);
  sheet.setRowHeight(1, 36);
  const count = Math.max(1, sheet.getMaxRows() - 1);
  sheet.getRange(2, 2, count, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  sheet.getRange(2, 3, count, 1).setNumberFormat('@');
  [240, 180, 170, 220, 220, 240, 300, 340, 120].forEach(function (width, index) {
    sheet.setColumnWidth(index + 1, width);
  });
  if (!sheet.getFilter()) sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length).createFilter();
  SpreadsheetApp.flush();
  return { status: true, sheet: SHEET_NAME };
}

function doGet() {
  try {
    getSheet_();
    return json_({ status: true, service: 'pendaftaran-klinik', sheet: SHEET_NAME });
  } catch (error) {
    return json_({ status: false, saved: false, error: 'SHEET_NOT_READY' });
  }
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e && e.postData && e.postData.contents || '');
  } catch (error) {
    return json_({ status: false, saved: false, error: 'INVALID_JSON' });
  }
  const invalid = validate_(data);
  if (invalid) return json_({ status: false, saved: false, error: 'INVALID_DATA', field: invalid });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return json_({ status: false, saved: false, error: 'BUSY' });
  try {
    const sheet = getSheet_();
    const id = data.submission_id || Utilities.getUuid();
    if (sheet.getLastRow() > 1) {
      const existing = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
        .createTextFinder(id).matchEntireCell(true).useRegularExpression(false).findNext();
      if (existing) return json_({ status: true, saved: true, duplicate: true, submission_id: id, row: existing.getRow() });
    }

    const row = sheet.getLastRow() + 1;
    if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
    sheet.getRange(row, 3).setNumberFormat('@');
    sheet.getRange(row, 2).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    sheet.getRange(row, 1, 1, HEADERS.length).setValues([[
      id, new Date(data.timestamp), data.nomor,
      text_(data.nama), text_(data.unit), text_(data.jabatan), text_(data.waktu),
      text_(data.layanan), data.metode
    ]]);
    SpreadsheetApp.flush();
    return json_({ status: true, saved: true, duplicate: false, submission_id: id, row: row });
  } catch (error) {
    console.error('Registration storage failed: ' + error.message);
    return json_({ status: false, saved: false, error: 'STORAGE_ERROR' });
  } finally {
    lock.releaseLock();
  }
}

function validate_(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'body';
  const fields = ['timestamp', 'nomor', 'nama', 'unit', 'jabatan', 'waktu', 'layanan', 'metode'];
  for (let i = 0; i < fields.length; i++) {
    const value = data[fields[i]];
    if (typeof value !== 'string' || !value.trim() || value.length > 5000) return fields[i];
  }
  if (!/^\d{8,16}$/.test(data.nomor)) return 'nomor';
  if (isNaN(new Date(data.timestamp).getTime())) return 'timestamp';
  if (['Offline', 'Online'].indexOf(data.metode) === -1) return 'metode';
  if (data.submission_id !== undefined &&
      (typeof data.submission_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.submission_id))) return 'submission_id';
  return null;
}

function getSheet_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Missing registration sheet');
  assertHeaders_(sheet);
  return sheet;
}

function assertHeaders_(sheet) {
  const actual = sheet.getRange(1, 1, 1, HEADERS.length).getDisplayValues()[0];
  if (actual.some(function (value, index) { return value !== HEADERS[index]; })) {
    throw new Error('Registration headers do not match');
  }
}

function text_(value) {
  // Spreadsheet writes interpret a leading equals sign as a formula.
  return /^[=+@-]/.test(value) ? "'" + value : value;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
