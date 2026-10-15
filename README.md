# Bot Klinik Konsultasi — Docker Compose

Bot Node.js dengan SQLite di VPS. Tidak memerlukan Vercel atau Redis saat dijalankan lewat Compose. Pengiriman dan penerimaan pesan tetap memakai Wablas.

## Menjalankan di VPS

Siapkan Git dan Docker Engine dengan plugin Docker Compose, lalu:

```sh
git clone https://github.com/RizkyFirman00/wablas-bot.git
cd wablas-bot
cp .env.example .env
chmod 600 .env
```

Isi `.env` di VPS:

- `WABLAS_API_KEY` dan `WABLAS_SECRET_KEY`: wajib, gunakan kredensial perangkat Wablas yang sama.
- `WABLAS_PHONE_NUMBER`: nomor WhatsApp bot untuk filter pesan sendiri.
- `WABLAS_BASE_URL`: sesuaikan dengan server Wablas perangkat; nilai awal `https://tegal.wablas.com/api/v2`.
- `SPREADSHEET_WEBHOOK`: URL penyimpanan pendaftaran yang sudah dipakai, bila ada.
- `BOT_PORT`: port lokal VPS, nilai awal `3000`.

Jangan commit `.env` ke Git.

```sh
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3000/healthz
```

Health check harus mengembalikan `{"status":"ok","storage":"sqlite"}`. Container berjalan sebagai user non-root dan restart otomatis kecuali dihentikan manual.

## HTTPS dan webhook Wablas

Port bot terikat ke `127.0.0.1` secara default. Pilih salah satu:

**Jika VPS sudah memiliki reverse proxy HTTPS**, teruskan subdomain bot ke `http://127.0.0.1:3000`. Jika reverse proxy berjalan di container lain, gunakan jaringan Docker bersama; alamat loopback container berbeda dari loopback VPS.

**Jika port 80/443 VPS masih kosong**, gunakan Caddy yang disediakan. Arahkan DNS subdomain ke IP VPS, buka port 80/443, lalu tambahkan `BOT_DOMAIN=bot.domainkamu.id` ke `.env` dan jalankan:

```sh
docker compose -f compose.yaml -f compose.https.yaml up -d --build
```

Caddy mengurus sertifikat HTTPS otomatis. Untuk perintah update/status/log berikutnya, gunakan kedua argumen `-f` yang sama jika memilih Caddy.

Setelah `https://bot.domainkamu.id/healthz` berhasil, ubah webhook pesan masuk di dashboard Wablas ke:

```text
https://bot.domainkamu.id/api/index
```

`/webhook` juga diterima. Payload JSON dan form URL-encoded didukung.

Sesi Upstash lama tidak disalin ke SQLite. Saat pindah endpoint, pengguna mengetik `MENU` untuk mulai ulang. Uji `MENU → 1 → 2`, lalu pastikan bot meminta form **Online** untuk **Tata Kelola & Manajemen Risiko**. Setelah alur WhatsApp berhasil, deployment Vercel dan database Upstash lama bisa dinonaktifkan.

## Update dari Git

```sh
git pull --ff-only
docker compose up -d --build
docker compose ps
```

Sesi disimpan selama 30 menit sejak pembaruan terakhir di volume `bot-data`, di luar image. Sesi bertahan saat restart dan deploy ulang. Jalankan satu instance bot; pesan dari nomor yang sama diproses berurutan dalam proses tersebut.

```sh
docker compose logs --tail=100 bot
docker compose restart bot
```

`docker compose down` mempertahankan volume. **`docker compose down -v` menghapus data sesi.**

Untuk backup konsisten, hentikan bot sebentar dan salin seluruh direktori data (termasuk file WAL jika ada):

```sh
mkdir -p backups
docker compose stop bot
docker compose cp bot:/app/data ./backups/data
docker compose start bot
```

Gunakan tujuan backup baru untuk setiap salinan dan simpan di tempat privat.

## Pengembangan dan pengujian

Node.js 22 atau 24 LTS:

```sh
npm ci
npm test
cp .env.example .env
# Isi kredensial Wablas sebelum menjalankan aplikasi.
npm start
```

Jangan jalankan `npm start` untuk percobaan pesan dengan kredensial produksi. Tes menggunakan pengiriman tiruan dan tidak menghubungi WhatsApp/Wablas.

`api/index.js` dan `vercel.json` mempertahankan endpoint Vercel lama agar migrasi bisa dilakukan bertahap. Hanya jalur legacy tersebut yang masih memakai Upstash; server Compose selalu memakai SQLite.
