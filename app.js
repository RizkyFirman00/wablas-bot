import express from "express";
import { createHandler } from "./api/index.js";

export function createApp({ store, httpClient, checkStorage = () => {} }) {
  if (!store) throw new Error("Session store is required");
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));
  app.get("/healthz", async (req, res) => {
    try {
      await checkStorage();
      res.json({ status: "ok", storage: "sqlite" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });

  const handler = createHandler({ store, httpClient });
  const pending = new Map();
  app.all(["/api/index", "/webhook"], async (req, res) => {
    const phone = req.method === "POST" ? req.body?.phone : null;
    if (!phone || typeof phone !== "string") return handler(req, res);

    // A second reply from the same phone must wait for the first session update.
    const previous = pending.get(phone) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    pending.set(phone, current);
    await previous;
    try {
      await handler(req, res);
    } finally {
      release();
      if (pending.get(phone) === current) pending.delete(phone);
    }
  });
  return app;
}
