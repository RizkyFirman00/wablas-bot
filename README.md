# Bot Klinik Konsultasi — Docker Compose

Bot Node.js dengan SQLite di komputer/server sendiri, diakses melalui Cloudflare Tunnel. Tidak memerlukan Vercel atau Redis saat dijalankan lewat Compose. Pengiriman dan penerimaan pesan tetap memakai Wablas.

## Menjalankan di komputer/server

Siapkan Git dan Docker Engine dengan plugin Docker Compose, lalu:

```sh
git clone https://github.com/RizkyFirman00/wablas-bot.git
cd wablas-bot
cp .env.example .env
chmod 600 .env
```

Isi `.env` di komputer/server:

- `WABLAS_API_KEY` dan `WABLAS_SECRET_KEY`: wajib, gunakan kredensial perangkat Wablas yang sama.
- `WABLAS_PHONE_NUMBER`: nomor WhatsApp bot untuk filter pesan sendiri.
- `WABLAS_BASE_URL`: sesuaikan dengan server Wablas perangkat; nilai awal `https://tegal.wablas.com/api/v2`.
- `SPREADSHEET_WEBHOOK`: URL penyimpanan pendaftaran yang sudah dipakai, bila ada.
- `BOT_PORT`: port lokal komputer/server, nilai awal `3000`.

Jangan commit `.env` ke Git.

```sh
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3000/healthz
```

Health check harus mengembalikan `{"status":"ok","storage":"sqlite"}`. Container berjalan sebagai user non-root dan restart otomatis kecuali dihentikan manual.

## Cloudflare Tunnel dan webhook Wablas

Untuk `cloudflared` yang berjalan langsung di komputer/server yang sama dengan Docker, gunakan **Compose utama saja**:

```sh
docker compose up -d --build
```

Di Cloudflare Tunnel yang sudah ada, tambahkan published application route / public hostname:

| Pengaturan | Nilai |
| --- | --- |
| Hostname | Subdomain pilihanmu, misalnya `bot.domainkamu.id` |
| Service type | `HTTP` |
| Service URL | `127.0.0.1:3000` |

Biarkan path hostname kosong agar `/healthz` dan `/api/index` sama-sama diteruskan. Jika `BOT_PORT` diubah, sesuaikan port pada Service URL. Nomor port ini adalah port host, bukan port internal container.

Pengaturan ini memakai HTTPS dari Cloudflare. Tidak perlu menjalankan `compose.https.yaml`, mengatur `BOT_DOMAIN`, atau membuka port 3000 ke internet. Token Tunnel tetap berada di konfigurasi `cloudflared` yang sudah ada; bot tidak memerlukannya. Komputer/server dan `cloudflared` harus tetap berjalan agar webhook tersedia.

Periksa endpoint publik:

```sh
curl --fail https://bot.domainkamu.id/healthz
```

Respons yang benar adalah JSON `status: ok` dan `storage: sqlite`. Pastikan hostname webhook bisa diakses Wablas tanpa halaman login atau tantangan browser Cloudflare. Jika perlindungan tersebut aktif, sesuaikan aturan khusus hostname/path webhook.

Panduan ini khusus connector yang berjalan langsung di host yang sama. Jika `cloudflared` dipindahkan ke container Docker, alamat `127.0.0.1` di dalamnya menunjuk container connector; gunakan jaringan Docker bersama dan alamat service bot sebagai origin.

Setelah `https://bot.domainkamu.id/healthz` berhasil, ubah webhook pesan masuk di dashboard Wablas ke:

```text
https://bot.domainkamu.id/api/index
```

`/webhook` juga diterima. Payload JSON dan form URL-encoded didukung.

Sesi Upstash lama tidak disalin ke SQLite. Saat pindah endpoint, pengguna mengetik `MENU` untuk mulai ulang. Uji `MENU → 1 → 2`, lalu pastikan bot meminta form **Online** untuk **Tata Kelola & Manajemen Risiko**. Setelah alur WhatsApp berhasil, deployment Vercel dan database Upstash lama bisa dinonaktifkan.

## Alternatif tanpa Cloudflare Tunnel

Jika nanti memakai server dengan akses langsung dan port 80/443 tersedia, `compose.https.yaml` menyediakan Caddy sebagai alternatif. Arahkan DNS subdomain ke IP server, isi `BOT_DOMAIN=bot.domainkamu.id` di `.env`, lalu jalankan kedua file Compose:

```sh
docker compose -f compose.yaml -f compose.https.yaml up -d --build
```

Untuk pengaturan Cloudflare Tunnel di atas, bagian alternatif ini tidak digunakan.

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

Untuk membuat ulang endpoint penyimpanan pendaftaran, lihat [tabel dan Apps Script](deploy/apps-script/README.md).

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
