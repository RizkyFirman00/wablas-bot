import axios from "axios";
import { Redis } from "@upstash/redis";

// Inisialisasi Redis (di luar handler)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Konfigurasi
const WABLAS_BASE_URL = "https://tegal.wablas.com/api/v2";
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 menit

// Konstanta untuk teks menu utama (agar tidak duplikat)
const MENU_LIST_TEXT =
  "1. Tata Kelola & Manajemen Risiko\n" +
  "2. Pengadaan Barang/Jasa\n" +
  "3. Pengelolaan Keuangan & BMN\n" +
  "4. Kinerja & Kepegawaian\n" +
  "5. Chat dengan Tim Inspektorat\n\n" +
  "Balas dengan *ANGKA* pilihan Anda (contoh: 1).";

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST");

  if (req.method === "GET") {
    // ... (kode GET biarkan apa adanya) ...
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const data = req.body;
    // ... (validasi payload, ekstrak data, dan ignore message biarkan apa adanya) ...

    // Environment variables
    const apiKey = process.env.WABLAS_API_KEY;
    // ... (sisa env vars dan authHeader biarkan apa adanya) ...

    // Fungsi helper untuk mengirim pesan
    const sendMessage = async (text) => {
      // ... (fungsi sendMessage biarkan apa adanya) ...
    };

    // Session management (VERSI REDIS)
    const getSession = async (phone) => {
      const key = `session:${phone}`;
      const sessionString = await redis.get(key);

      // 1. Jika tidak ada session sama sekali
      if (!sessionString) {
        console.log(`Session for ${phone} not found in Redis.`);
        return null;
      }

      console.log(`Raw session data for ${phone}: "${sessionString}"`);

      // 2. Jika ada session, coba parse
      try {
        return JSON.parse(sessionString);
      } catch (error) {
        // 3. Jika session korup (misal: "[object Object]"), hapus dan return null
        console.error(
          `Failed to parse session for ${phone}. Deleting corrupt key. Data: "${sessionString}"`,
          error
        );
        await redis.del(key); // Hapus data korup
        return null; // Anggap tidak ada session
      }
    };

    const setSession = async (phone, data) => {
      // ... (fungsi setSession biarkan apa adanya) ...
    };

    const clearSession = async (phone) => {
      // ... (fungsi clearSession biarkan apa adanya) ...
    };

    // ========== FLOW LOGIC ==========
    // STEP 1: Menu Utama (Perintah Global)
    if (
      [
        "hai", "halo", "hallo", "selamat pagi", "pagi", "selamat siang",
        "siang", "selamat sore", "sore", "selamat malam", "malam",
        "menu", "mulai", "start", "batal",
      ].includes(message)
    ) {
      await clearSession(from); 
      const welcomeMenuText =
        "*Selamat datang di Layanan Klinik Konsultasi*\n" +
        "*Inspektorat Lembaga Kebijakan Pengadaan Barang/Jasa Pemerintah.*\n\n" +
        "Silakan pilih layanan konsultasi sesuai kebutuhan Anda:\n\n" +
        MENU_LIST_TEXT;
      await sendMessage(welcomeMenuText);
      await new Promise((resolve) => setTimeout(resolve, 500));
      return res.status(200).send("OK");
    }

    // Ambil session saat ini (SETELAH cek perintah global)
    let session = await getSession(from);
    console.log(`Current session for ${from}:`, session);

    // =======================================================
    // PRIORITAS 1: CEK LOGIC YANG MEMILIKI SESSION
    // =======================================================

    // STEP 4: Pilih metode (Online/Offline)
    if (["1", "2"].includes(message) && session?.step === "choose_method") {
      await setSession(from, {
        ...session,
        step: "fill_form",
        metode: message === "1" ? "Offline" : "Online",
      });

      const formTitle =
        message === "1"
          ? "*Form Pendaftaran Konsultasi Offline*"
          : "*Form Pendaftaran Konsultasi Online*";

      await sendMessage(
        `${formTitle}\n\n` +
          "Dimohon kesediaannya untuk mengisi data diri di bawah ini sebagai bagian dari proses pendataan\n\n" +
          "*Format pengisian:*\n" +
          "Nama: [Nama lengkap Anda]\n" +
          "Unit: [Unit organisasi]\n" +
          "Jabatan: [Jabatan Anda]\n" +
          "Referensi Hari/Jam: [Hari/Tanggal dan Jam]\n\n" +
          "*Contoh:*\n" +
          "Nama: Budi Santoso\n" +
          "Unit: Inspektorat\n" +
          "Jabatan: Auditor Ahli Pertama\n" +
          "Referensi Hari/Jam: Senin, 4 Nov 2025 - 10:00 WIB"
      );
      return res.status(200).send("OK");
    }

    // STEP 5: Proses form submission
    if (session?.step === "fill_form") {
      // ... (Parse data form - biarkan apa adanya) ...
      const lines = rawMessage.split("\n").map((line) => line.trim());
      let nama = "", unit = "", jabatan = "", waktu = "";
      for (const line of lines) {
        // ... (logic parsing biarkan apa adanya) ...
        const lower = line.toLowerCase();
        if (lower.startsWith("nama:")) {
          nama = line.substring(line.indexOf(":") + 1).trim();
        } else if (lower.startsWith("unit:")) {
          unit = line.substring(line.indexOf(":") + 1).trim();
        } else if (lower.startsWith("jabatan:")) {
          jabatan = line.substring(line.indexOf(":") + 1).trim();
        } else if (lower.startsWith("referensi hari/jam:")) {
          waktu = line.substring(line.indexOf(":") + 1).trim();
        }
      }

      // Validasi
      if (!nama || !unit || !jabatan || !waktu) {
        // ... (pesan 'Data tidak lengkap' biarkan apa adanya) ...
        await sendMessage(
          "*Data tidak lengkap!*\n\n" +
            "Pastikan Anda mengisi semua field:\n" +
            "✓ Nama\n" + "✓ Unit\n" + "✓ Jabatan\n" + "✓ Referensi Hari/Jam\n\n" +
            "Silakan kirim ulang dengan format yang benar."
        );
        return res.status(200).send("OK");
      }

      // Kirim ke spreadsheet (jika ada webhook)
      if (spreadsheetWebhook) {
        try {
          // ... (axios.post ke spreadsheet biarkan apa adanya) ...
          await axios.post(
            spreadsheetWebhook,
            {
              timestamp: new Date().toISOString(),
              nomor: from, nama, unit, jabatan, waktu,
              layanan: session.layanan,
              metode: session.metode,
            },
            { timeout: 10000 }
          );
          console.log("Data sent to spreadsheet successfully");
        } catch (error) {
          // ... (error handling spreadsheet biarkan apa adanya) ...
          console.error("Error sending to spreadsheet:", error.message);
          await sendMessage(
            "❌ *Pendaftaran Gagal!*\n\n" +
              "Maaf, terjadi kesalahan saat menyimpan pendaftaran Anda ke sistem kami.\n\n" +
              "Data Anda *belum* terkirim. Silakan kirim ulang format isian Anda sekali lagi."
          );
          return res.status(200).send("OK");
        }
      }

      // Konfirmasi
      await sendMessage(
        "✅ *Pendaftaran Berhasil!*\n\n" +
          `Nama: ${nama}\n` + `Unit: ${unit}\n` + `Jabatan: ${jabatan}\n` +
          `Referensi Hari/Jam: ${waktu}\n` + `Layanan: ${session.layanan}\n` +
          `Metode: ${session.metode}\n\n` +
          "Terima kasih telah menghubungi Klinik Konsultasi Inspektorat. " +
          "Permintaan Anda telah kami terima, dan tim kami akan segera menghubungi Anda untuk tindak lanjut.\n\n" +
          "Ketik *MENU* untuk layanan lainnya."
      );

      await clearSession(from);
      return res.status(200).send("OK");
    }

    // Mode chat (PINDAHKAN KE SINI - di luar STEP 5)
    if (session?.step === "chat_mode") {
      if (message === "menu") {
        await clearSession(from);
        const chatMenuText =
          "*Menu Utama*\n\n" +
          "Silakan pilih layanan konsultasi:\n\n" +
          MENU_LIST_TEXT;
        await sendMessage(chatMenuText);
        return res.status(200).send("OK");
      }
      console.log(`Chat message from ${from}: ${rawMessage}`);
      return res.status(200).send("OK");
    }

    // =======================================================
    // PRIORITAS 2: CEK LOGIC JIKA TIDAK ADA SESSION
    // =======================================================

    // Definisi layanan
    const layananMap = {
      1: "Tata Kelola & Manajemen Risiko", 2: "Pengadaan Barang/Jasa",
      3: "Pengelolaan Keuangan & BMN", 4: "Kinerja & Kepegawaian",
    };
    let layananTerpilih = null;

    // Deteksi layanan berdasarkan keyword (jika tidak ada session)
    if (!session) {
      if (message === "1" || message.includes("tata kelola") || message.includes("risiko")) {
        layananTerpilih = layananMap["1"];
      } else if (message === "2" || message.includes("pengadaan")) {
        layananTerpilih = layananMap["2"];
      } else if (message === "3" || message.includes("keuangan") || message.includes("bmn")) {
        layananTerpilih = layananMap["3"];
      } else if (message === "4" || message.includes("kinerja") || message.includes("kepegawaian")) {
        layananTerpilih = layananMap["4"];
      }
    }

    // STEP 2: Pilihan Layanan (1-4)
    if (layananTerpilih && !session) {
      await setSession(from, {
        step: "choose_method",
        layanan: layananTerpilih,
      });
      const metodeText =
        `Anda memilih:\n*${layananTerpilih}*\n\n` +
        "Terima kasih atas pilihan Anda terhadap jenis layanan konsultasi\n" +
        "Mohon konfirmasi metode pelaksanaan konsultasi:\n\n" +
        "1. Offline (Tatap Muka)\n" + "2. Online (Virtual)\n\n" +
        "Balas dengan *ANGKA* pilihan Anda (contoh: 1).";
      await sendMessage(metodeText);
      return res.status(200).send("OK");
    }

    // STEP 3: Chat langsung (opsi 5)
    if ((message === "5" || message.includes("chat")) && !session) {
      await sendMessage(
        "*Chat dengan Tim Inspektorat*\n\n" +
          "Silakan ketik pesan Anda, dan tim kami akan merespons secepat mungkin.\n\n" +
          "Ketik *MENU* untuk kembali ke menu utama."
      );
      await setSession(from, { step: "chat_mode" });
      return res.status(200).send("OK");
    }

    // Default: tidak dikenali
    console.log(`Perintah tidak dikenali dari ${from}: "${rawMessage}"`);
    if (session?.step != "chat_mode") {
      await sendMessage(
        "Maaf, saya tidak memahami perintah tersebut.\n" +
          "*Silahkan kirim pesan sesuai dengan yang diperintahkan.*\n\n" +
          "Ketik *MENU* untuk melihat pilihan layanan."
      );
    }
    return res.status(200).send("OK");

  } catch (error) {
    console.error("Error in webhook handler:", error);
    return res.status(200).send("OK");
  }
}
