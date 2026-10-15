import assert from "node:assert/strict";
import test from "node:test";

process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.invalid";
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
process.env.WABLAS_API_KEY = "test-key";
process.env.WABLAS_SECRET_KEY = "test-secret";
const { createHandler, createSessionStore, SessionStoreError } = await import("../api/index.js");

function fixture() {
  const records = new Map();
  const sent = [];
  const client = {
    async get(key) { return records.get(key) ?? null; },
    async set(key, value, options) {
      assert.deepEqual(options, { ex: 1800 });
      records.set(key, value);
      return "OK";
    },
    async del(key) { return Number(records.delete(key)); },
  };
  const store = createSessionStore(client);
  const handler = createHandler({ store, httpClient: {
    async post(url, payload) { sent.push(payload); return { data: { status: true } }; },
  } });
  async function message(text) {
    const res = {
      code: null, body: null,
      setHeader() {},
      status(code) { this.code = code; return this; },
      send(body) { this.body = body; return this; },
    };
    await handler({ method: "POST", body: { phone: "628000000000", message: text } }, res);
    return res;
  }
  return { records, client, store, sent, message };
}

for (const [choice, method] of [["1", "Offline"], ["2", "Online"]]) {
  test(`service 1 then method ${choice} retains the original service (${method})`, async () => {
    const f = fixture();
    assert.equal((await f.message("1")).code, 200);
    assert.equal((await f.store.getSession("628000000000")).step, "choose_method");
    assert.equal((await f.message(choice)).code, 200);
    assert.deepEqual(await f.store.getSession("628000000000"), {
      step: "fill_form", layanan: "Tata Kelola & Manajemen Risiko", metode: method,
    });
    assert.match(f.sent.at(-1).data[0].message, new RegExp(`Form Pendaftaran Konsultasi ${method}`));
  });
}

test("read failure stops routing, preserves session, and allows retry", async () => {
  const f = fixture();
  await f.message("1");
  const originalGet = f.client.get;
  f.client.get = async () => { throw new Error("Redis offline"); };
  assert.equal((await f.message("2")).code, 503);
  assert.equal(f.sent.length, 1);
  f.client.get = originalGet;
  assert.equal((await f.message("2")).code, 200);
  assert.equal((await f.store.getSession("628000000000")).metode, "Online");
});

for (const step of ["initial service", "method"]) {
  test(`failed write at ${step} never sends the next prompt`, async () => {
    const f = fixture();
    if (step === "method") await f.message("1");
    const sentBefore = f.sent.length;
    const previous = f.records.get("session:628000000000");
    f.client.set = async () => { throw new Error("Redis offline"); };
    assert.equal((await f.message(step === "method" ? "2" : "1")).code, 503);
    assert.equal(f.sent.length, sentBefore);
    assert.equal(f.records.get("session:628000000000"), previous);
  });
}

test("unacknowledged write fails", async () => {
  const f = fixture();
  f.client.set = async () => null;
  assert.equal((await f.message("1")).code, 503);
  assert.equal(f.sent.length, 0);
});

for (const raw of ["{invalid", "null", "false", "{}", { step: "unknown" },
  { step: "choose_method" }, { step: "fill_form", layanan: "Test" }]) {
  test(`corrupt session fails without deleting or treating it as a new conversation: ${JSON.stringify(raw)}`, async () => {
    const f = fixture();
    f.records.set("session:628000000000", raw);
    assert.equal((await f.message("2")).code, 503);
    assert.equal(f.sent.length, 0);
    assert.equal(f.records.get("session:628000000000"), raw);
  });
}

test("missing session and Redis object deserialization remain supported", async () => {
  const f = fixture();
  assert.equal(await f.store.getSession("628000000000"), null);
  const session = { step: "choose_method", layanan: "Tata Kelola & Manajemen Risiko" };
  f.records.set("session:628000000000", session);
  assert.deepEqual(await f.store.getSession("628000000000"), session);
  assert.equal((await f.message("2")).code, 200);
});

test("reset failure does not display a misleading main menu", async () => {
  const f = fixture();
  await f.message("1");
  f.client.del = async () => { throw new Error("Redis offline"); };
  assert.equal((await f.message("menu")).code, 503);
  assert.equal(f.sent.length, 1);
  assert.equal((await f.store.getSession("628000000000")).step, "choose_method");
});

test("storage failures are identifiable without exposing their cause in the response", async () => {
  const f = fixture();
  f.client.get = async () => { throw new Error("private connection details"); };
  await assert.rejects(f.store.getSession("628000000000"), SessionStoreError);
  const response = await f.message("2");
  assert.equal(response.code, 503);
  assert.equal(response.body, "Session storage unavailable");
});
