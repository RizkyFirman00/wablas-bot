import assert from 'node:assert/strict';
import test from 'node:test';
import { createHandler } from '../api/index.js';

process.env.WABLAS_API_KEY = 'test-key';
process.env.WABLAS_SECRET_KEY = 'test-secret';

async function submit(t, sheetResponse, { configured = true, reject = false } = {}) {
  const previous = process.env.SPREADSHEET_WEBHOOK;
  t.after(() => {
    if (previous === undefined) delete process.env.SPREADSHEET_WEBHOOK;
    else process.env.SPREADSHEET_WEBHOOK = previous;
  });
  if (configured) process.env.SPREADSHEET_WEBHOOK = 'https://sheets.example.invalid/exec';
  else delete process.env.SPREADSHEET_WEBHOOK;
  const calls = [];
  let cleared = false;
  const handler = createHandler({
    store: {
      async getSession() { return { step: 'fill_form', layanan: 'Tata Kelola & Manajemen Risiko', metode: 'Online' }; },
      async clearSession() { cleared = true; },
    },
    httpClient: {
      async post(url, payload) {
        calls.push({ url, payload });
        if (url === process.env.SPREADSHEET_WEBHOOK) {
          if (reject) throw new Error('Request failed with status code 404');
          return { data: sheetResponse };
        }
        return { data: { status: true } };
      },
    },
  });
  const res = { setHeader() {}, status() { return this; }, send() { return this; } };
  await handler({ method: 'POST', body: {
    id: 'form-event-123', phone: '628000000000',
    message: 'Nama: Peserta Uji\nUnit: Unit Uji\nJabatan: Analis: Data\nReferensi Hari/Jam: Jumat, 16 Oktober 2026 - 10:30 WIB',
  } }, res);
  return { calls, cleared };
}

test('registration keeps minutes and colons, sends a stable id, and confirms only after saving', async (t) => {
  const { calls, cleared } = await submit(t, { status: true, saved: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].payload.submission_id, 'form-event-123');
  assert.equal(calls[0].payload.waktu, 'Jumat, 16 Oktober 2026 - 10:30 WIB');
  assert.equal(calls[0].payload.jabatan, 'Analis: Data');
  assert.equal(calls[0].payload.nomor, '628000000000');
  assert.match(calls[1].payload.data[0].message, /Pendaftaran Berhasil/);
  assert.equal(cleared, true);
});

for (const response of [{ status: false, saved: false }, { status: true }, '<html>Login</html>', null]) {
  test(`registration rejects unconfirmed HTTP-200 responses: ${JSON.stringify(response)}`, async (t) => {
    const { calls, cleared } = await submit(t, response);
    assert.match(calls.at(-1).payload.data[0].message, /Pendaftaran Gagal/);
    assert.equal(cleared, false);
  });
}

test('a missing spreadsheet URL does not report registration success or clear the session', async (t) => {
  const { calls, cleared } = await submit(t, null, { configured: false });
  assert.equal(calls.length, 1);
  assert.match(calls[0].payload.data[0].message, /Pendaftaran Gagal/);
  assert.equal(cleared, false);
});

test('HTTP storage failures keep the form available for retry', async (t) => {
  const { calls, cleared } = await submit(t, null, { reject: true });
  assert.match(calls.at(-1).payload.data[0].message, /Pendaftaran Gagal/);
  assert.equal(cleared, false);
});
