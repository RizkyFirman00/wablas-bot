const SESSION_TIMEOUT = 30 * 60 * 1000;

export class SessionStoreError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "SessionStoreError";
  }
}

export function createSessionStore(client) {
  return {
    async getSession(phone) {
      try {
        const raw = await client.get(`session:${phone}`);
        if (raw === null || raw === undefined) return null;

        const session = typeof raw === "string" ? JSON.parse(raw) : raw;
        const validStep = ["choose_method", "fill_form", "chat_mode"].includes(session?.step);
        const validLayanan = session?.step === "chat_mode" ||
          (typeof session?.layanan === "string" && session.layanan.trim().length > 0);
        const validMetode = session?.step !== "fill_form" ||
          ["Offline", "Online"].includes(session.metode);
        if (!validStep || !validLayanan || !validMetode) {
          throw new Error("Invalid session data");
        }
        return session;
      } catch (cause) {
        throw new SessionStoreError("Failed to read session", { cause });
      }
    },

    async setSession(phone, data) {
      try {
        const jsonData = typeof data === "string" ? data : JSON.stringify(data);
        const result = await client.set(`session:${phone}`, jsonData, {
          ex: Math.floor(SESSION_TIMEOUT / 1000),
        });
        if (result !== "OK") throw new Error("Session write was not acknowledged");
      } catch (cause) {
        throw new SessionStoreError("Failed to save session", { cause });
      }
    },

    async clearSession(phone) {
      try {
        await client.del(`session:${phone}`);
      } catch (cause) {
        throw new SessionStoreError("Failed to clear session", { cause });
      }
    },
  };
}
