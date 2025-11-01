import axios from "axios";

const WABLAS_TOKEN = process.env.WABLAS_TOKEN;
const WABLAS_URL = "https://app.wablas.com/api/send-message";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const data = req.body;
  const message = data.message?.toLowerCase();
  const sender = data.phone;

  if (!message || !sender) return res.status(200).send("No message");

  console.log("📩 Pesan baru:", message, "dari:", sender);

  let reply = "";

  // === MENU UTAMA ===
  if (message === "halo") {
    reply = `👋 Hai! Selamat datang di Damantine Bot.\n\nSilakan pilih salah satu menu berikut:\n\n1️⃣ Layanan A\n2️⃣ Layanan B\n3️⃣ Layanan C\n4️⃣ Layanan D\n5️⃣ Hubungi Admin`;
  }

  // === SUBMENU: ONLINE / OFFLINE ===
  else if (["1", "2", "3", "4"].includes(message)) {
    reply = `Kamu memilih menu ${message}.\n\nPilih status layanan:\n🟢 Online\n🔴 Offline`;
  }

  // === FORM ===
  else if (message === "online") {
    reply = `Silakan isi form berikut:\n\nNama:\nUnit:\nJabatan:\nWaktu yang diinginkan:`;
  }

  // === CEK FORM (ada “nama:” berarti user isi form) ===
  else if (message.includes("nama:") && message.includes("unit:")) {
    reply = `✅ Terima kasih! Data kamu sudah diterima dan akan kami proses.`;

    // (Opsional) Simpan ke Google Sheet
    try {
      await axios.post(process.env.SHEET_WEBHOOK_URL, {
        sender,
        text: data.message,
      });
      console.log("📊 Data terkirim ke Google Sheets");
    } catch (err) {
      console.error("Gagal simpan ke Google Sheet:", err.message);
    }
  }

  // === Default ===
  else {
    reply = `Ketik *halo* untuk memulai percakapan 🤖`;
  }

  // === KIRIM BALASAN KE WABLAS ===
  await axios.post(
    WABLAS_URL,
    {
      phone: sender,
      message: reply,
    },
    {
      headers: { Authorization: WABLAS_TOKEN },
    }
  );

  return res.status(200).json({ success: true });
}
