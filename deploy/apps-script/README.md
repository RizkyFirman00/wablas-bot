# Penyimpanan pendaftaran ke Google Sheets

Tabel: https://docs.google.com/spreadsheets/d/13k-jCRPQjr2n30XvInfbyYighVmKYOA7aaJxtav9Z40/edit

Project Apps Script: https://script.google.com/home/projects/1KSqlUAXL4O1kxOlDBQMNXjiQL3qaqxkYjbrNv84DIYOk97dEHSVJTMTL/edit

Kode `Code.gs` sudah sesuai dengan tabel tersebut. Jika memakai spreadsheet lain, ubah `SPREADSHEET_ID` sebelum menjalankan `setup` dan deploy.

## Kolom tab Pendaftaran

| Kolom | Isi | Sumber payload bot |
| --- | --- | --- |
| A | ID Pendaftaran | `submission_id`, atau UUID untuk bot lama |
| B | Waktu Daftar (WIB) | `timestamp` ISO; disimpan sebagai tanggal dan ditampilkan dalam Asia/Jakarta |
| C | Nomor WhatsApp | `nomor`, disimpan sebagai teks |
| D | Nama | `nama` |
| E | Unit Organisasi | `unit` |
| F | Jabatan | `jabatan` |
| G | Referensi Hari/Jam | `waktu`, teks permintaan jadwal pengguna |
| H | Layanan Konsultasi | `layanan` |
| I | Metode | `metode`: `Offline` atau `Online` |

Tabel awal kosong, tanpa pendaftaran contoh. Pertahankan urutan dan teks header karena script memverifikasinya sebelum menulis.

## Menyiapkan dan deploy Web App

1. Buka project Apps Script di atas. Jika membuat ulang project dari Sheets, buka **Ekstensi → Apps Script** dan isi file kode dengan `Code.gs`.
2. Pilih fungsi `setup`, klik **Jalankan**, lalu izinkan akses Google Sheets yang diperlukan. Fungsi ini menyiapkan header, format, filter, dan zona waktu; data pendaftaran yang sudah ada tidak dihapus.
3. Klik **Terapkan/Deploy → Deployment baru → Aplikasi web/Web app**.
4. Pilih **Jalankan sebagai: Saya/Me** dan **Siapa yang memiliki akses: Siapa saja/Anyone**, agar server bot bisa melakukan POST tanpa login Google interaktif. Spreadsheet tetap privat; GET hanya mengembalikan status layanan, bukan isi data.
5. Deploy, lalu salin **URL aplikasi web** yang berakhiran `/exec`. Jangan gunakan URL editor, URL spreadsheet, atau URL pengujian `/dev`.
6. Buka URL `/exec` dari browser. Respons siap pakai:

   ```json
   {"status":true,"service":"pendaftaran-klinik","sheet":"Pendaftaran"}
   ```

Endpoint menerima JSON melalui `doPost` dan membalas sukses hanya setelah baris ditulis serta `SpreadsheetApp.flush()` selesai. Error aplikasi tetap dikirim sebagai JSON dengan `status:false` dan `saved:false`; bot memeriksa kedua nilai, sehingga halaman login atau HTTP 200 yang berisi error tidak dianggap berhasil.

## Menghubungkan bot

Di komputer/server bot, isi URL baru pada `.env`:

```dotenv
SPREADSHEET_WEBHOOK=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
```

Kemudian jalankan dari folder repo:

```sh
sudo git pull --ff-only
sudo docker compose up -d --build --force-recreate bot
```

Jangan kirim ulang formulir lama otomatis. Uji melalui WhatsApp dengan `MENU → 1 → 2`, kirim formulir, lalu cocokkan data di tabel sebelum memakai pendaftaran untuk kegiatan nyata. Kolom Referensi Hari/Jam harus tetap memuat menit, misalnya `10:30 WIB`.

`submission_id` memakai ID pesan Wablas. Permintaan ulang dengan ID yang sama mengembalikan `duplicate:true` tanpa membuat baris kedua. Bot lama yang tidak mengirim ID tetap diterima, tetapi tiap permintaan memperoleh UUID baru. Lock script mengurutkan pemeriksaan ID dan penulisan.

## Memperbarui script

Setelah mengubah kode, gunakan **Kelola deployment → Edit → Versi baru → Deploy** agar URL `/exec` yang sama menggunakan kode terbaru. Menyimpan kode editor saja belum memperbarui versi Web App.

Dokumentasi Google: https://developers.google.com/apps-script/guides/web

## Validasi

`npm test` mencakup payload bot, parsing jam, penolakan respons tanpa konfirmasi simpan, validasi Apps Script, format kolom, dan pencegahan duplikat menggunakan layanan Google tiruan. Tes lokal ini tidak membuktikan deployment Google atau penyimpanan langsung berhasil; verifikasi baris di Google Sheets setelah Web App diterapkan.
