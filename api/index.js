import axios from "axios";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const data = req.body;
  const from = data.data?.phone || data.phone;
  const message = (data.data?.message || data.message || "").toLowerCase();
  const apiKey = process.env.WABLAS_API_KEY;
  const secretKey = process.env.WABLAS_SECRET_KEY;
  const authHeader = `${apiKey}.${secretKey}`;

  // Kirim pesan ke user
  const sendMessage = async (text, buttons = []) => {
    const payload = {
      phone: from,
      message: text,
      buttons,
    };
    await axios.post("https://tegal.wablas.com/api/v2/send-button", payload, {
      headers: { Authorization: authHeader },
    });
  };

  if (!data || !data.message) {
    console.error("Webhook tidak berisi message:", data);
    return res.status(400).send("Invalid payload");
  }

  // Step 1 - Sambutan awal
  if (message === "hai" || message === "halo" || message === "menu") {
    await sendMessage(
      "Selamat datang di Layanan Klinik Konsultasi Inspektorat Lembaga Kebijakan Pengadaan Barang/Jasa Pemerintah. Silakan pilih layanan konsultasi sesuai kebutuhan Anda:",
      [
        { label: "1. Tata Kelola & Manajemen Risiko", id: "1" },
        { label: "2. Pengadaan Barang/Jasa", id: "2" },
        { label: "3. Pengelolaan Keuangan & BMN", id: "3" },
        { label: "4. Kinerja & Kepegawaian", id: "4" },
        { label: "5. Chat dengan Tim Inspektorat", id: "5" },
      ]
    );
  }

  // Step 2 - Submenu Offline/Online
  else if (["1", "2", "3", "4"].includes(message)) {
    await sendMessage(
      "Terima kasih atas pilihan Anda terhadap jenis layanan konsultasi. Mohon konfirmasi metode pelaksanaan konsultasi:",
      [
        { label: "Offline", id: "offline" },
        { label: "Online", id: "online" },
      ]
    );
  }

  // Step 3 - Form input
  else if (message === "online") {
    await axios.post(
      "https://tegal.wablas.com/api/v2/send-message",
      {
        phone: from,
        message:
          "Dimohon kesediaannya untuk mengisi data diri di bawah ini sebagai bagian dari proses pendataan:\n\nNama:\nUnit Organisasi:\nJabatan:\nReferensi waktu (Hari/Jam):",
      },
      { headers: { Authorization: apiKey } }
    );
  }

  // Step 4 - Simpan ke spreadsheet
  else if (message.includes("nama:")) {
    const lines = message.split("\n");
    const nama = lines[0].split(":")[1]?.trim();
    const unit = lines[1].split(":")[1]?.trim();
    const jabatan = lines[2].split(":")[1]?.trim();
    const waktu = lines[3].split(":")[1]?.trim();

    await axios.post(process.env.SPREADSHEET_WEBHOOK, {
      nama,
      unit,
      jabatan,
      waktu,
      nomor: from,
    });

    await axios.post(
      "https://tegal.wablas.com/api/v2/send-message",
      {
        phone: from,
        message:
          "Terima kasih telah menghubungi Klinik Konsultasi Inspektorat. Permintaan Anda telah kami terima, dan tim kami akan segera menghubungi Anda untuk tindak lanjut.",
      },
      { headers: { Authorization: apiKey } }
    );
  }

  res.status(200).send("OK");
}