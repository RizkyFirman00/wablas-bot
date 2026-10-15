import "dotenv/config";
import { createApp } from "./app.js";
import { createSqliteClient } from "./lib/sqlite-client.js";
import { createSessionStore } from "./lib/session-store.js";

for (const name of ["WABLAS_API_KEY", "WABLAS_SECRET_KEY"]) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}
const client = createSqliteClient({ filename: process.env.DB_PATH || "./data/sessions.sqlite" });
const app = createApp({ store: createSessionStore(client), checkStorage: () => client.check() });
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const server = app.listen(port, host, () => {
  console.log(`Bot listening on ${host}:${port}; storage=sqlite`);
});
server.on("error", (error) => {
  console.error("Cannot start HTTP server:", error.message);
  client.close();
  process.exitCode = 1;
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 25000);
  deadline.unref();
  server.close(() => {
    clearTimeout(deadline);
    client.close();
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
