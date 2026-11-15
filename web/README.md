# Smart Order – Website

Website untuk project Smart Order: halaman depan dengan demo interaktif yang memanggil sistem asli, dan halaman admin untuk Approve/Reject pesanan. Backend-nya adalah n8n di folder induk repo ini (`smart-order-n8n`).

- **Frontend**: React + Vite
- **Server**: Cloudflare Worker (`worker/`) yang menyajikan website dan meneruskan API ke n8n
- **Keamanan**: webhook secret n8n hanya ada di Worker, admin dikunci Cloudflare Access, demo dibatasi rate limit dan (opsional) Turnstile

```
Browser ──▶ Cloudflare Worker (order.sldev.my.id) ──secret──▶ n8n (VPS, lewat Tunnel) ──▶ PostgreSQL
                │                                                └──▶ Workers AI, Telegram
                ├─ /            halaman depan + demo
                ├─ /admin       panel admin (data contoh kalau belum login)
                └─ /api/*       API (lihat worker/index.js)
```

## Halaman

| Alamat | Isi | Akses |
| --- | --- | --- |
| `/` | Fitur, cara kerja, demo 5 skenario, statistik 30 hari | Publik |
| `/admin` | Panel admin. Tanpa login: mode demo dengan data contoh | Publik |
| `/pesan` | Form pesanan untuk pembeli. Penjual membagikan link ini di WhatsApp atau Instagram | Publik |
| `/api/admin/*` | Data asli dan keputusan Approve/Reject | Cloudflare Access |

Form pesanan (`/pesan`) memakai daftar produk di `worker/catalog.js`. Harga selalu dihitung di server, dan pembeli hanya melihat status umum ("dikonfirmasi" atau "sedang dicek penjual"), bukan skor risikonya. Ganti isi `catalog.js` dengan produk toko yang memakai Smart Order.

Demo di halaman depan mengirim pesanan dari skenario tetap (`worker/templates.js`) ke n8n. Pengunjung hanya memilih skenario, isi pesanan disusun server. Kalau n8n tidak bisa dihubungi, demo otomatis menampilkan hasil simulasi.

## Prasyarat

1. Backend (folder induk repo ini) sudah jalan, termasuk workflow **[Order] API** (`04-order-api.json`) sudah di-import dan di-Publish.
2. Node.js 20+ di laptop.
3. Domain `sldev.my.id` ada di akun Cloudflare yang sama.

## Menjalankan di laptop

```bash
npm install
cp .dev.vars.example .dev.vars     # isi N8N_WEBHOOK_SECRET dan DEV_ADMIN_EMAIL
npm run preview                    # build lalu jalankan Worker di http://localhost:8787
```

`DEV_ADMIN_EMAIL` membuat `/admin` langsung masuk sebagai admin, **hanya** saat dibuka dari `localhost`. Di domain asli nilai ini diabaikan.

## Deploy ke Cloudflare

### 1. Upload ke GitHub, lalu hubungkan

1. Cloudflare dashboard → **Workers & Pages → Create → Import a repository** → pilih repo `smart-order-n8n`.
2. Di pengaturan build, isi **Root directory** (path) dengan `web`. Ini penting, karena website ada di folder `web/`, bukan di root repo.
3. Build command `npm run build`, deploy command `npx wrangler deploy`.

Kalau build gagal di tahap install karena tidak ada `package-lock.json`, jalankan `npm install` sekali di folder `web` di laptop, lalu commit file lock yang terbentuk.

Atau dari laptop (di folder `web`): `npx wrangler login` lalu `npm run deploy`.

Domain `order.sldev.my.id` dibuat otomatis dari `[[routes]]` di `wrangler.toml`.

### 2. Isi rahasia

Workers & Pages → `smart-order` → **Settings → Variables and Secrets** → Add:

| Nama | Tipe | Isi |
| --- | --- | --- |
| `N8N_WEBHOOK_SECRET` | Secret | Sama persis dengan Value credential "Webhook Secret" di n8n |

Nilai publik (`N8N_BASE_URL`, dll.) ada di `wrangler.toml` bagian `[vars]`.

### 3. Kunci admin dengan Cloudflare Access

1. Cloudflare dashboard → **Zero Trust → Access → Applications → Add an application → Self-hosted**.
2. Application domain: `order.sldev.my.id`, path `api/admin`.
3. Policy: **Allow**, Include → **Emails** → email kamu. Login method: **One-time PIN**.
4. Simpan, lalu buka aplikasi itu dan salin **Application Audience (AUD) Tag**.
5. Team domain ada di **Zero Trust → Settings → Custom Pages** (contoh `namatim.cloudflareaccess.com`).
6. Isi di `wrangler.toml`:
   ```toml
   ACCESS_TEAM_DOMAIN = "namatim.cloudflareaccess.com"
   ACCESS_AUD = "isi_aud_tag"
   ```
   lalu deploy ulang (push ke GitHub atau `npm run deploy`).

Worker memverifikasi token login Access sendiri (`worker/access.js`), jadi API admin tetap tertutup walaupun aturan Access salah diatur. Kalau `ACCESS_*` kosong, semua permintaan admin ditolak.

Cara masuk: buka `/admin` → **Masuk sebagai admin** → masukkan kode OTP dari email → kembali ke `/admin` dengan data asli. Link di notifikasi Telegram langsung mengarah ke halaman login ini.

### 4. (Opsional) Turnstile anti-bot untuk demo

1. Cloudflare dashboard → **Turnstile → Add widget**, hostname `order.sldev.my.id`, mode Managed.
2. Site key → `TURNSTILE_SITE_KEY` di `wrangler.toml`.
3. Secret key → secret `TURNSTILE_SECRET` di dashboard Worker.

Tanpa Turnstile, demo tetap dibatasi rate limit: 5 pesanan per menit per pengunjung dan 30 per menit total.

## Struktur

```
src/
  main.jsx              memilih halaman (/ atau /admin)
  pages/Landing.jsx     halaman depan
  pages/Admin.jsx       panel admin (live atau mode demo)
  pages/OrderForm.jsx   form pesanan untuk pembeli (/pesan)
  components/Demo.jsx   demo 5 skenario
  components/Charts.jsx cincin skor, donut, bar
  lib/api.js            pemanggil /api/*
  lib/format.js         format rupiah, waktu, label status
worker/
  index.js              routing API + file website
  access.js             verifikasi login Cloudflare Access (JWT RS256)
  templates.js          isi pesanan tiap skenario demo
  catalog.js            nama toko, produk, harga, dan metode bayar untuk form pesanan
```

## Catatan keamanan

- Webhook secret n8n tidak pernah sampai ke browser.
- Nama admin di audit log diambil dari login Access (`web:email`), bukan dari isi permintaan.
- Endpoint publik hanya mengembalikan statistik dan hasil analisis tanpa data pribadi.
- Data pelanggan di demo adalah data karangan.
