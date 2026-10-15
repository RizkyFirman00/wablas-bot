import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { once } from "node:events";
import { createApp } from "../app.js";
import { createSessionStore } from "../lib/session-store.js";
import { createSqliteClient } from "../lib/sqlite-client.js";

process.env.WABLAS_API_KEY = "test-key";
process.env.WABLAS_SECRET_KEY = "test-secret";
// The VPS path must not require any Upstash configuration.
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const phone = "628000000000";
const selected = { step: "choose_method", layanan: "Tata Kelola & Manajemen Risiko" };

async function running(t, filename, httpClient) {
  const sent = [];
  const client = createSqliteClient({ filename });
  const store = createSessionStore(client);
  const app = createApp({ store, checkStorage: () => client.check(), httpClient: httpClient ?? {
    async post(url, payload) { sent.push(payload); return { data: { status: true } }; },
  } });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    client.close();
  }
  t.after(close);
  return { client, store, sent, close, base,
    message(message, path = "/api/index") {
      return fetch(base + path, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, message }) });
    },
  };
}

test("SQLite session survives closing and reopening the database", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "wablas-persistence-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, "sessions.sqlite");
  const client = createSqliteClient({ filename });
  await createSessionStore(client).setSession(phone, selected);
  client.close();
  const reopened = createSqliteClient({ filename });
  try {
    assert.deepEqual(await createSessionStore(reopened).getSession(phone), selected);
  } finally { reopened.close(); }
});

test("SQLite expires sessions after 30 minutes and renews expiry on update", async () => {
  let clock = 100000;
  const client = createSqliteClient({ filename: ":memory:", now: () => clock });
  const store = createSessionStore(client);
  try {
    await store.setSession(phone, selected);
    clock += 29 * 60 * 1000;
    assert.deepEqual(await store.getSession(phone), selected);
    await store.setSession(phone, { ...selected, step: "fill_form", metode: "Online" });
    clock += 60 * 1000;
    assert.equal((await store.getSession(phone)).metode, "Online");
    clock += 29 * 60 * 1000;
    assert.equal(await store.getSession(phone), null);
  } finally { client.close(); }
});

test("SQLite clear only removes the selected phone", async () => {
  const client = createSqliteClient({ filename: ":memory:" });
  const store = createSessionStore(client);
  try {
    await store.setSession(phone, selected);
    await store.setSession("other", selected);
    await store.clearSession(phone);
    assert.equal(await store.getSession(phone), null);
    assert.deepEqual(await store.getSession("other"), selected);
  } finally { client.close(); }
});

test("HTTP bot resumes service choice after an application restart without Redis", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "wablas-http-"));
  // Server cleanup is registered later; remove the directory after explicit close.
  const filename = join(directory, "sessions.sqlite");
  try {
    const first = await running(t, filename);
    assert.equal((await first.message("1")).status, 200);
    await first.close();
    const second = await running(t, filename);
    try {
      assert.equal((await second.message("2", "/webhook")).status, 200);
      assert.deepEqual(await second.store.getSession(phone), { ...selected, step: "fill_form", metode: "Online" });
      assert.match(second.sent[0].data[0].message, /Form Pendaftaran Konsultasi Online/);
      const health = await fetch(second.base + "/healthz");
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { status: "ok", storage: "sqlite" });
    } finally { await second.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("overlapping replies from one phone run in order", async (t) => {
  let firstSent;
  const firstReady = new Promise((resolve) => { firstSent = resolve; });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const sent = [];
  const bot = await running(t, ":memory:", {
    async post(url, payload) {
      sent.push(payload);
      if (sent.length === 1) { firstSent(); await gate; }
      return { data: { status: true } };
    },
  });
  const first = bot.message("1");
  await firstReady;
  const second = bot.message("2");
  release();
  assert.equal((await first).status, 200);
  assert.equal((await second).status, 200);
  assert.equal((await bot.store.getSession(phone)).metode, "Online");
  assert.match(sent[1].data[0].message, /Form Pendaftaran Konsultasi Online/);
});

test("HTTP accepts URL-encoded webhook payloads", async (t) => {
  const bot = await running(t, ":memory:");
  const response = await fetch(bot.base + "/api/index", { method: "POST",
    body: new URLSearchParams({ phone, message: "1" }) });
  assert.equal(response.status, 200);
  assert.deepEqual(await bot.store.getSession(phone), selected);
});

test("health check reports unavailable storage", async (t) => {
  const app = createApp({ store: {}, checkStorage() { throw new Error("disk error"); } });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/healthz`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "unavailable" });
});
