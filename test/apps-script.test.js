import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../deploy/apps-script/Code.gs', import.meta.url), 'utf8');
const registration = {
  submission_id: 'form-event-123', timestamp: '2026-10-15T16:45:00.000Z', nomor: '628000000000',
  nama: 'Peserta Uji', unit: 'Unit Uji', jabatan: 'Analis Data',
  waktu: 'Jumat, 16 Oktober 2026 - 10:30 WIB', layanan: 'Tata Kelola & Manajemen Risiko', metode: 'Online',
};

function fixture({ busy = false, corruptHeaders = false, writeFails = false } = {}) {
  const rows = [];
  let released = false;
  const sheet = {
    getLastRow() { return rows.length; },
    getMaxRows() { return 1000; },
    getRange(row, column, height = 1) {
      return {
        getDisplayValues() { return [rows[row - 1].slice()]; },
        setNumberFormat() { return this; },
        setValues(values) {
          if (writeFails) throw new Error('Write unavailable');
          for (let i = 0; i < values.length; i++) rows[row - 1 + i] = values[i].slice();
          return this;
        },
        createTextFinder(id) {
          return {
            matchEntireCell() { return this; }, useRegularExpression() { return this; },
            findNext() {
              const index = rows.findIndex((values, i) => i >= row - 1 && i < row - 1 + height && values[column - 1] === id);
              return index < 0 ? null : { getRow: () => index + 1 };
            },
          };
        },
      };
    },
  };
  const context = vm.createContext({
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }), flush() {} },
    LockService: { getScriptLock: () => ({ tryLock: () => !busy, releaseLock() { released = true; } }) },
    Utilities: { getUuid: () => 'generated-test-id' },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: (text) => ({ text, setMimeType() { return this; } }) },
    console: { error() {} },
  });
  vm.runInContext(source, context);
  rows.push(Array.from(vm.runInContext('HEADERS', context)));
  if (corruptHeaders) rows[0][0] = 'Unexpected column';
  return { rows, context, released: () => released,
    post(data) { return JSON.parse(context.doPost({ postData: { contents: JSON.stringify(data) } }).text); },
  };
}

test('Apps Script writes all nine fields and returns a durable save acknowledgement', () => {
  const f = fixture();
  const response = f.post(registration);
  assert.equal(response.status, true);
  assert.equal(response.saved, true);
  assert.equal(response.row, 2);
  assert.equal(f.rows[1][0], registration.submission_id);
  assert.equal(f.rows[1][1].toISOString(), registration.timestamp);
  assert.equal(f.rows[1][2], registration.nomor);
  assert.equal(f.rows[1][6], registration.waktu);
  assert.equal(f.rows[1][8], 'Online');
  assert.equal(f.released(), true);
});

test('retrying the same event does not insert another row', () => {
  const f = fixture();
  f.post(registration);
  const retry = f.post(registration);
  assert.equal(retry.saved, true);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.row, 2);
  assert.equal(f.rows.length, 2);
});

test('untrusted form text cannot become a spreadsheet formula', () => {
  const f = fixture();
  f.post({ ...registration, nama: '=IMPORTXML("https://example.invalid", "//x")', unit: '+1+1', jabatan: '@SUM(1,2)', waktu: '-1+1' });
  for (const index of [3, 4, 5, 6]) assert.equal(f.rows[1][index][0], "'");
});

for (const change of [{ nama: '' }, { metode: 'Zoom' }, { nomor: '=1+1' }, { timestamp: 'invalid' }, { submission_id: '=malicious' }]) {
  test(`invalid registration is rejected without writing: ${JSON.stringify(change)}`, () => {
    const f = fixture();
    const response = f.post({ ...registration, ...change });
    assert.equal(response.saved, false);
    assert.equal(response.error, 'INVALID_DATA');
    assert.equal(f.rows.length, 1);
  });
}

test('invalid JSON returns a structured failure', () => {
  const f = fixture();
  const response = JSON.parse(f.context.doPost({ postData: { contents: '{invalid' } }).text);
  assert.equal(response.error, 'INVALID_JSON');
  assert.equal(f.rows.length, 1);
});

test('a busy script never writes without its lock', () => {
  const f = fixture({ busy: true });
  assert.equal(f.post(registration).error, 'BUSY');
  assert.equal(f.rows.length, 1);
});

for (const options of [{ corruptHeaders: true }, { writeFails: true }]) {
  test(`storage errors never acknowledge success: ${JSON.stringify(options)}`, () => {
    const f = fixture(options);
    assert.equal(f.post(registration).error, 'STORAGE_ERROR');
    assert.equal(f.rows.length, 1);
    assert.equal(f.released(), true);
  });
}

test('GET health does not append a registration', () => {
  const f = fixture();
  assert.equal(JSON.parse(f.context.doGet().text).status, true);
  assert.equal(f.rows.length, 1);
});
