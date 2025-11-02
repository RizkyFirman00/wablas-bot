import axios from "axios";

// Session storage sederhana (dalam production sebaiknya pakai Redis/Database)
const sessions = new Map();

// Konfigurasi
const WABLAS_BASE_URL = "https://tegal.wablas.com/api/v2";
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 menit

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST");

  if (req.method === "GET") {
    return res.status(200).json({
      status: "ok",
      message: "WA Bot Webhook is running",
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = req.body;

    // Log untuk debugging
    console.log("Received webhook:", JSON.stringify(data, null, 2));

    // Validasi payload - Wablas mengirim data langsung di root level
    if (!data || !data.phone) {
      console.error("Invalid payload - missing phone:", data);
      return res
        .status(400)
        .json({ error: "Invalid payload - phone is required" });
    }

    // Extract data dari payload Wablas
    const from = data.phone; // Nomor pengirim
    const rawMessage = data.message || ""; // Pesan asli
    const message = rawMessage.toLowerCase().trim(); // Pesan lowercase
    const messageType = data.messageType || "text"; // Tipe pesan
    const isFromMe = data.isFromMe || false; // Apakah dari bot sendiri
    const pushName = data.pushName || ""; // Nama pengirim

    // Log untuk debugging
    console.log("=== INCOMING MESSAGE ===");
    console.log("From:", from);
    console.log("Message:", rawMessage);
    console.log("isFromMe:", isFromMe);
    console.log("messageType:", messageType);
    console.log("pushName:", pushName);

    // PENTING: Ignore pesan dari bot sendiri
    // Check berbagai kemungkinan nilai isFromMe
    if (
      isFromMe === true ||
      isFromMe === "true" ||
      isFromMe === 1 ||
      isFromMe === "1"
    ) {
      console.log("✋ Ignoring message from bot itself");
      return res
        .status(200)
        .json({ status: "ignored", reason: "message from bot" });
    }

    // Ignore jika nomor pengirim sama dengan nomor bot
    const botNumber = process.env.WABLAS_PHONE_NUMBER;
    if (botNumber && from === botNumber) {
      console.log("✋ Ignoring message from bot's own number");
      return res
        .status(200)
        .json({ status: "ignored", reason: "same as bot number" });
    }

    // Ignore pesan yang mengandung JSON (kemungkinan response status dari bot)
    if (rawMessage.includes('"status"') && rawMessage.includes('"action"')) {
      console.log("✋ Ignoring JSON status message");
      return res
        .status(200)
        .json({ status: "ignored", reason: "json message" });
    }

    // Ignore pesan yang terlalu pendek atau hanya simbol
    if (rawMessage.length < 1) {
      console.log("✋ Ignoring empty message");
      return res
        .status(200)
        .json({ status: "ignored", reason: "empty message" });
    }

    // Ignore pesan non-text (image, video, dll) - bisa disesuaikan
    if (messageType !== "text") {
      console.log(`Ignoring non-text message type: ${messageType}`);
      return res
        .status(200)
        .json({ status: "ignored", reason: "non-text message" });
    }

    // Environment variables
    const apiKey = process.env.WABLAS_API_KEY;
    const secretKey = process.env.WABLAS_SECRET_KEY;
    const spreadsheetWebhook = process.env.SPREADSHEET_WEBHOOK;

    if (!apiKey || !secretKey) {
      console.error("Missing API credentials");
      return res.status(500).json({ error: "Server configuration error" });
    }

    const authHeader = `${apiKey}.${secretKey}`;

    // Fungsi helper untuk mengirim pesan
    const sendMessage = async (text) => {
      try {
        console.log(`Attempting to send message to ${from}...`);

        // Format sesuai dokumentasi Wablas - menggunakan data array
        const payload = {
          data: [
            {
              phone: from,
              message: text,
            },
          ],
        };

        console.log("Payload:", JSON.stringify(payload));
        console.log("Auth header:", authHeader.substring(0, 20) + "...");

        const response = await axios.post(
          `${WABLAS_BASE_URL}/send-message`,
          payload,
          {
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
            },
            timeout: 15000,
          }
        );
        console.log("Message sent successfully:", response.data);
        return response.data;
      } catch (error) {
        console.error("Error sending message:");
        console.error("Status:", error.response?.status);
        console.error("Data:", JSON.stringify(error.response?.data));
        console.error("Message:", error.message);
        throw error;
      }
    };

    const sendButtons = async (text, buttons) => {
      try {
        console.log(`Attempting to send buttons to ${from}...`);

        // Format sesuai dokumentasi Wablas
        // buttons adalah array string, bukan array object
        const buttonLabels = buttons.map((btn) => btn.label || btn);

        const payload = {
          data: [
            {
              phone: from,
              message: {
                buttons: buttonLabels,
                content: text,
                footer: "Pilih salah satu opsi di atas",
              },
            },
          ],
        };

        console.log("Button payload:", JSON.stringify(payload, null, 2));

        const response = await axios.post(
          `${WABLAS_BASE_URL}/send-button`,
          payload,
          {
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
            },
            timeout: 15000,
          }
        );
        console.log("Buttons sent successfully:", response.data);
        return response.data;
      } catch (error) {
        console.error("Error sending buttons:");
        console.error("Status:", error.response?.status);
        console.error("Data:", JSON.stringify(error.response?.data));
        console.error("Message:", error.message);

        // Fallback: kirim sebagai pesan biasa jika button gagal
        console.log("Falling back to plain message...");

        // Format button sebagai list text
        const buttonLabels = buttons.map((btn) => btn.label || btn);
        const buttonText = buttonLabels
          .map((label, i) => `${i + 1}. ${label}`)
          .join("\n");
        const fallbackMessage = `${text}\n\n${buttonText}\n\nBalas dengan angka pilihan Anda.`;

        return await sendMessage(fallbackMessage);
      }
    };

    // Session management
    const getSession = (phone) => {
      const session = sessions.get(phone);
      if (session && Date.now() - session.timestamp > SESSION_TIMEOUT) {
        sessions.delete(phone);
        return null;
      }
      return session;
    };

    const setSession = (phone, data) => {
      sessions.set(phone, {
        ...data,
        timestamp: Date.now(),
      });
      console.log(`Session set for ${phone}:`, data);
    };

    const clearSession = (phone) => {
      sessions.delete(phone);
      console.log(`Session cleared for ${phone}`);
    };

    // Ambil session saat ini
    let session = getSession(from);
    console.log(`Current session for ${from}:`, session);

    // ========== FLOW LOGIC ==========

    // STEP 1: Menu Utama
    if (["hai", "halo", "menu", "mulai", "start"].includes(message)) {
      clearSession(from);
      await sendButtons(
        "🏥 *Selamat datang di Layanan Klinik Konsultasi*\n" +
          "*Inspektorat LKPP*\n\n" +
          "Silakan pilih layanan konsultasi sesuai kebutuhan Anda:",
        [
          { label: "1️⃣ Tata Kelola & Manajemen Risiko", id: "1" },
          { label: "2️⃣ Pengadaan Barang/Jasa", id: "2" },
          { label: "3️⃣ Pengelolaan Keuangan & BMN", id: "3" },
          { label: "4️⃣ Kinerja & Kepegawaian", id: "4" },
          { label: "💬 Chat dengan Tim Inspektorat", id: "5" },
        ]
      );

      // Delay sebentar sebelum return untuk memastikan pesan terkirim
      await new Promise((resolve) => setTimeout(resolve, 500));
      return res.status(200).json({ status: "ok" });
    }

    // STEP 2: Pilihan Layanan (1-4)
    if (["1", "2", "3", "4"].includes(message) && !session) {
      const layananMap = {
        1: "Tata Kelola & Manajemen Risiko",
        2: "Pengadaan Barang/Jasa",
        3: "Pengelolaan Keuangan & BMN",
        4: "Kinerja & Kepegawaian",
      };

      setSession(from, {
        step: "choose_method",
        layanan: layananMap[message],
      });

      await sendButtons(
        `✅ Anda memilih layanan:\n*${layananMap[message]}*\n\n` +
          "Mohon konfirmasi metode pelaksanaan konsultasi:",
        [
          { label: "🏢 Offline (Tatap Muka)", id: "offline" },
          { label: "💻 Online (Virtual)", id: "online" },
        ]
      );
      return res.status(200).json({ status: "ok" });
    }

    // STEP 3: Chat langsung (opsi 5)
    if (message === "5" && !session) {
      await sendMessage(
        "💬 *Chat dengan Tim Inspektorat*\n\n" +
          "Silakan ketik pesan Anda, dan tim kami akan merespons secepat mungkin.\n\n" +
          "Ketik *menu* untuk kembali ke menu utama."
      );
      setSession(from, { step: "chat_mode" });
      return res.status(200).json({ status: "ok" });
    }

    // STEP 4: Pilih metode (Online/Offline)
    if (
      ["online", "offline"].includes(message) &&
      session?.step === "choose_method"
    ) {
      if (message === "offline") {
        await sendMessage(
          "🏢 *Konsultasi Offline*\n\n" +
            "Untuk konsultasi tatap muka, silakan hubungi:\n" +
            "📞 Telp: (021) xxx-xxxx\n" +
            "📧 Email: inspektorat@lkpp.go.id\n\n" +
            "Atau datang langsung ke:\n" +
            "📍 Kantor LKPP, Jakarta\n\n" +
            "Ketik *menu* untuk kembali."
        );
        clearSession(from);
        return res.status(200).json({ status: "ok" });
      }

      // Online - minta form
      setSession(from, {
        ...session,
        step: "fill_form",
        metode: "online",
      });

      await sendMessage(
        "📝 *Form Pendaftaran Konsultasi Online*\n\n" +
          "Dimohon kesediaannya untuk mengisi data berikut:\n\n" +
          "Format pengisian:\n" +
          "```\n" +
          "Nama: [Nama lengkap Anda]\n" +
          "Unit: [Unit organisasi]\n" +
          "Jabatan: [Jabatan Anda]\n" +
          "Waktu: [Hari/Tanggal dan Jam]\n" +
          "```\n\n" +
          "Contoh:\n" +
          "```\n" +
          "Nama: Budi Santoso\n" +
          "Unit: Divisi Keuangan\n" +
          "Jabatan: Staff\n" +
          "Waktu: Senin, 4 Nov 2025 - 10:00 WIB\n" +
          "```"
      );
      return res.status(200).json({ status: "ok" });
    }

    // STEP 5: Proses form submission
    if (session?.step === "fill_form") {
      // Parse data form
      const lines = rawMessage.split("\n").map((line) => line.trim());
      let nama = "",
        unit = "",
        jabatan = "",
        waktu = "";

      for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.startsWith("nama:")) {
          nama = line.substring(line.indexOf(":") + 1).trim();
        } else if (lower.startsWith("unit:")) {
          unit = line.substring(line.indexOf(":") + 1).trim();
        } else if (lower.startsWith("jabatan:")) {
          jabatan = line.substring(line.indexOf(":") + 1).trim();
        } else if (lower.startsWith("waktu:")) {
          waktu = line.substring(line.indexOf(":") + 1).trim();
        }
      }

      // Validasi
      if (!nama || !unit || !jabatan || !waktu) {
        await sendMessage(
          "❌ *Data tidak lengkap!*\n\n" +
            "Pastikan Anda mengisi semua field:\n" +
            "- Nama\n" +
            "- Unit\n" +
            "- Jabatan\n" +
            "- Waktu\n\n" +
            "Silakan kirim ulang dengan format yang benar."
        );
        return res.status(200).json({ status: "ok" });
      }

      // Kirim ke spreadsheet (jika ada webhook)
      if (spreadsheetWebhook) {
        try {
          await axios.post(
            spreadsheetWebhook,
            {
              timestamp: new Date().toISOString(),
              nomor: from,
              nama,
              unit,
              jabatan,
              waktu,
              layanan: session.layanan,
              metode: session.metode,
            },
            { timeout: 10000 }
          );
          console.log("Data sent to spreadsheet successfully");
        } catch (error) {
          console.error("Error sending to spreadsheet:", error.message);
        }
      }

      // Konfirmasi
      await sendMessage(
        "✅ *Pendaftaran Berhasil!*\n\n" +
          `Nama: ${nama}\n` +
          `Unit: ${unit}\n` +
          `Jabatan: ${jabatan}\n` +
          `Waktu: ${waktu}\n` +
          `Layanan: ${session.layanan}\n\n` +
          "Terima kasih telah menghubungi Klinik Konsultasi Inspektorat. " +
          "Permintaan Anda telah kami terima, dan tim kami akan segera menghubungi Anda untuk tindak lanjut.\n\n" +
          "Ketik *menu* untuk layanan lainnya."
      );

      clearSession(from);
      return res.status(200).json({ status: "ok" });
    }

    // Mode chat
    if (session?.step === "chat_mode") {
      if (message === "menu") {
        clearSession(from);
        await sendButtons(
          "🏥 *Menu Utama*\n\n" + "Silakan pilih layanan konsultasi:",
          [
            { label: "1️⃣ Tata Kelola & Manajemen Risiko", id: "1" },
            { label: "2️⃣ Pengadaan Barang/Jasa", id: "2" },
            { label: "3️⃣ Pengelolaan Keuangan & BMN", id: "3" },
            { label: "4️⃣ Kinerja & Kepegawaian", id: "4" },
            { label: "💬 Chat dengan Tim Inspektorat", id: "5" },
          ]
        );
        return res.status(200).json({ status: "ok" });
      } else {
        await sendMessage(
          "✅ Pesan Anda telah kami terima:\n" +
            `"${rawMessage}"\n\n` +
            "Tim kami akan segera merespons. Terima kasih!"
        );
        return res.status(200).json({ status: "ok" });
      }
    }

    // Default: tidak dikenali
    await sendMessage(
      "Maaf, saya tidak memahami perintah tersebut. 🤔\n\n" +
        "Ketik *menu* untuk melihat pilihan layanan."
    );

    return res.status(200).json({ status: "ok" });
  } catch (error) {
    console.error("Error in webhook handler:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
}
