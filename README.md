# Smart Order Management dengan n8n + Cloudflare Workers AI

Sistem otomatis untuk memproses pesanan toko online: menerima pesanan lewat webhook, menormalisasi dan memvalidasi data, mendeteksi duplikat, menilai risiko, meminta pendapat AI untuk pesanan yang janggal, lalu menyerahkan pesanan berisiko kepada owner lewat halaman admin website (notifikasi tetap dikirim ke Telegram). Semua kejadian tercatat di PostgreSQL.

Repo ini berisi dua bagian:

| Folder | Isi |
| --- | --- |
| `/` (root) | Backend: n8n, PostgreSQL, Cloudflare Tunnel, workflow, query, dan tes |
| [`web/`](web/) | Website: halaman depan + demo, panel admin, Cloudflare Worker (lihat [`web/README.md`](web/README.md)) |

Biaya: Rp0. Semua komponen berjalan di VPS kampus (atau laptop) dengan Docker, dan AI memakai kuota gratis Cloudflare Workers AI (10.000 neuron per hari).

## Daftar isi

1. [Alur sistem](#1-alur-sistem)
2. [Isi folder](#2-isi-folder)
3. [Setup server](#3-setup-server)
4. [Siapkan Cloudflare Workers AI, Telegram, dan credentials](#4-siapkan-cloudflare-workers-ai-telegram-dan-credentials)
   - [Cara cepat: import file workflow](#cara-cepat-import-file-workflow)
5. [Workflow 1: Order Intake](#5-workflow-1-order-intake)
6. [Workflow 2: Order Approval](#6-workflow-2-order-approval)
7. [Workflow 3: Laporan harian](#7-workflow-3-laporan-harian)
   - [Workflow 4: API untuk website](#7b-workflow-4-api-untuk-website)
8. [Pengujian](#8-pengujian)
9. [Menghubungkan ke toko sungguhan (Shopify)](#9-menghubungkan-ke-toko-sungguhan-shopify)
10. [Publikasi portfolio](#10-publikasi-portfolio)

## 1. Alur sistem

```
Pesanan (website / Shopify / curl)
   │  POST /webhook/order  + header X-Webhook-Secret
   ▼
Normalisasi & validasi ──(tidak valid)──► log INVALID, balas HTTP 422
   ▼
Cek riwayat di PostgreSQL ──(order_id sudah ada)──► log DUPLICATE, balas HTTP 200
   ▼
Skor risiko (aturan pasti)
   ├─ LOW ─────────────────────────────────────────► APPROVED_AUTO
   └─ MEDIUM / HIGH ► Cloudflare Workers AI ► keputusan
                         ├─ MEDIUM + AI APPROVE (yakin ≥ 0.7) ► APPROVED_AUTO
                         └─ lainnya ► PENDING_REVIEW ► Telegram owner [Approve] [Reject]
   (kemungkinan pesanan ganda selalu ke owner, apa pun kata AI)
```

Prinsip desainnya:

- **Aturan dulu, AI kemudian.** Skor risiko dihitung dengan aturan pasti yang bisa dijelaskan. AI hanya dipanggil untuk pesanan MEDIUM/HIGH, jadi kuota gratis cukup.
- **AI tidak pernah menolak sendiri.** Rekomendasi REJECT dari AI tetap diputuskan manusia. Semua pesanan HIGH wajib di-review owner.
- **Data pribadi tidak dikirim ke AI.** Nama, HP, email, dan alamat lengkap tidak ikut terkirim. AI hanya menerima fitur risiko seperti total, metode bayar, jumlah item, dan panjang alamat.
- **Aman dari kiriman ganda.** Ada constraint `UNIQUE (source, order_id)` dan update approval hanya berlaku untuk pesanan yang masih `PENDING_REVIEW`.

### Aturan skor risiko

| Aturan | Poin |
| --- | --- |
| Total ≥ Rp5.000.000 | +30 |
| COD dan total ≥ Rp1.000.000 | +25 |
| Pesanan serupa (HP dan total sama) dalam 30 menit | +30 |
| Pelanggan pernah punya pesanan ditolak | +25 |
| Qty satu item ≥ 10 | +15 |
| Alamat kurang dari 15 karakter | +15 |
| Nama mengandung angka, huruf berulang, atau pola seperti "asdf"/"test" | +15 |
| Email sekali pakai (mailinator, dll) | +15 |
| Total berbeda lebih dari 30% dari jumlah rincian item | +15 |
| Tanpa email | +5 |
| Dipesan pukul 00.00–04.59 WIB | +5 |
| Pelanggan lama (ada pesanan sah lebih dari 1 hari lalu) | −10 |

Level: **LOW** < 30, **MEDIUM** 30–59, **HIGH** ≥ 60. Semua angka bisa diubah di bagian atas `code-nodes/02-skor-risiko.js`.

Setiap pesanan juga diberi tag klasifikasi: `high_value`, `cod`, `bulk`, `new_customer` / `repeat_customer`.

## 2. Isi folder

| File | Fungsi |
| --- | --- |
| `docker-compose.yml`, `.env.example` | n8n + PostgreSQL + Cloudflare Tunnel |
| `sql/schema.sql` | Tabel `orders` dan `order_logs` (dibuat otomatis saat pertama kali jalan) |
| `sql/queries.sql` | Tujuh query (Q1–Q7) yang ditempel ke node Postgres |
| `code-nodes/01–08-*.js` | Isi tiap Code node, tinggal salin-tempel |
| `test/orders/*.json` | Enam contoh pesanan untuk berbagai skenario |
| `test/kirim-order.sh` | Mengirim pesanan uji ke webhook |
| `test/test-code-nodes.js` | Uji semua Code node tanpa n8n: `node test/test-code-nodes.js` |
| `workflows/*.json` | Empat workflow n8n siap import |
| `scripts/build_workflows.py` | Membangkitkan ulang `workflows/*.json` dari `code-nodes/` dan `sql/` |
| `web/` | Website React + Cloudflare Worker yang memanggil workflow API |

## 3. Setup server

Langkah dasarnya sama dengan panduan project struk: Docker, Cloudflare Tunnel `n8n.sldev.my.id`, dan `WEBHOOK_URL`.

1. Salin folder ini ke VPS, lalu `cp .env.example .env` dan isi nilainya. Pakai password Postgres yang kuat.
2. Jalankan:

   ```bash
   docker compose up -d
   docker compose logs postgres | grep "init"   # pastikan 01-schema.sql dijalankan
   ```

3. Cek tabel sudah ada:

   ```bash
   docker compose exec postgres psql -U orders_app -d orders -c "\dt"
   ```

Kalau n8n dari project struk sudah berjalan, cukup tambahkan service `postgres`, volume `pg_data`, dan folder `sql/` ke compose yang ada. Tunnel dan n8n-nya dipakai bersama.

`schema.sql` hanya dijalankan otomatis saat volume Postgres masih kosong. Kalau volume sudah ada, jalankan manual:

```bash
docker compose exec -T postgres psql -U orders_app -d orders < sql/schema.sql
```

## 4. Siapkan Cloudflare Workers AI, Telegram, dan credentials

### Cloudflare Workers AI

1. Dashboard Cloudflare → catat **Account ID** (ada di halaman Overview atau di URL dashboard).
2. My Profile → API Tokens → Create Token → pakai template **Workers AI** → Create. Salin token-nya.
3. Model default di panduan ini: `@cf/google/gemma-4-26b-a4b-it`, yang menurut changelog Cloudflare (Juli 2026) masih tersedia di paket gratis. Daftar model bisa berubah, jadi cek katalog Workers AI di dashboard. Ganti model cukup di URL node "Cloudflare AI".

Kuota gratisnya 10.000 neuron per hari dan direset pukul 07.00 WIB (00.00 UTC). Karena AI hanya dipanggil untuk pesanan MEDIUM/HIGH, kuota ini cukup untuk demo dan pengujian.

### Bot Telegram

1. Buat bot baru lewat @BotFather (`/newbot`). Pakai **bot terpisah** dari project struk, karena satu bot hanya bisa punya satu webhook.
2. Kirim pesan apa saja ke bot, lalu buka `https://api.telegram.org/bot<TOKEN>/getUpdates`. Catat `chat.id` kamu (tujuan notifikasi) dan `from.id` (masukkan ke `OWNER_IDS` di `06-baca-tombol.js`).

### Credentials di n8n

| Credential | Isi |
| --- | --- |
| **Header Auth** "Webhook Secret" | Name: `X-Webhook-Secret`, Value: string acak panjang (`openssl rand -hex 24`) |
| **Header Auth** "Cloudflare AI" | Name: `Authorization`, Value: `Bearer <API_TOKEN>` (kata `Bearer` + spasi wajib, kalau tidak Cloudflare membalas 401) |
| **Postgres** "Orders DB" | Host `postgres`, Database `orders`, User/Password dari `.env`, Port `5432`, SSL `disable` |
| **Telegram API** "Order Bot" | Token dari BotFather |

Kolom **Name** di form Header Auth adalah nama header HTTP yang dikirim, bukan nama credential. Nama credential ("Webhook Secret", "Cloudflare AI", dan seterusnya) diganti lewat judul di kiri atas form. Karena kedua credential bertipe Header Auth, setelah import pastikan node **Webhook Order** memakai `Webhook Secret` dan node **Cloudflare AI** memakai `Cloudflare AI`, jangan tertukar.

## Cara cepat: import file workflow

Folder `workflows/` berisi empat workflow siap import. Nama node di workflow Intake memakai bahasa Inggris dan dikelompokkan dengan 4 sticky note (Intake & validation, Duplicate check, Risk score + AI, Decision & notify). Isinya dibangkitkan oleh `scripts/build_workflows.py` dari `code-nodes/` dan `sql/queries.sql`, jadi selalu sama dengan kode yang diuji.

1. Buat dulu keempat credentials di n8n dengan nama **persis** seperti ini: `Webhook Secret`, `Cloudflare AI`, `Orders DB`, `Order Bot`.
2. Di n8n: **Create workflow** → menu **⋯** (kanan atas) → **Import from File** → pilih `workflows/01-order-intake.json`. Ulangi untuk `03-laporan-harian.json` dan `04-order-api.json`, masing-masing di workflow baru. `02-order-approval.json` hanya diperlukan kalau ingin memutuskan lewat tombol Telegram, bukan lewat website.
3. **Setelah import, buka setiap node yang bertanda peringatan** (segitiga merah atau kuning) lalu pilih credential yang sesuai di dropdown. Credential tidak ikut tersimpan di file, jadi langkah ini wajib.
4. Ganti tiga placeholder:

   | Workflow | Node | Ganti |
   | --- | --- | --- |
   | Intake | Cloudflare AI | `GANTI_ACCOUNT_ID` di URL dengan Account ID Cloudflare |
   | Intake | Notify Owner | Chat ID `GANTI_CHAT_ID` dengan chat id Telegram-mu |
   | Laporan Harian | Kirim Laporan | Chat ID `GANTI_CHAT_ID` dengan chat id Telegram-mu |
   | Approval (opsional) | Baca Tombol | `OWNER_IDS = [123456789]` dengan user id Telegram-mu |

5. Simpan, lalu aktifkan workflow Intake, Laporan Harian, dan API (tombol **Publish**). Uji dengan `test/kirim-order.sh` (bagian 8).

Kalau ada node yang gagal dibaca setelah import (versi n8n berbeda), samakan pengaturannya dengan penjelasan node di bawah. Kalau mengubah kode di `code-nodes/` atau `sql/`, jalankan `python3 scripts/build_workflows.py` untuk membangkitkan ulang file workflow.

## 5. Workflow 1: Order Intake

Penjelasan berikut berguna untuk memahami setiap node, atau untuk menyusun workflow secara manual tanpa import.

Buat workflow baru bernama **Order Intake**. Nama node harus sama persis seperti di bawah, karena dipakai di dalam kode.

```
Webhook Order → Normalize → Valid?
   ├─ false → Log Invalid → Reply Invalid
   └─ true  → Check History → Duplicate?
                 ├─ true  → Log Duplicate → Reply Duplicate
                 └─ false → Risk Score → Needs AI?
                               ├─ true  → Request AI → Cloudflare AI → Parse AI ─┐
                               └─ false ─────────────────────────────────────────┤
                                                                                 ▼
                                Decide Status → Save Order → Reply Webhook → Needs Review? → Notify Owner
```

**1. Webhook Order** (Webhook)
- HTTP Method `POST`, Path `order`.
- Authentication: Header Auth → credential "Webhook Secret".
- Respond: **Using 'Respond to Webhook' Node**.

**2. Normalize** (Code) → isi dengan `code-nodes/01-normalisasi.js`.

**3. Valid?** (If) → kondisi Boolean: `{{ $json.valid }}` is true.

**4. Log Invalid** (Postgres, cabang false)
- Operation: Execute Query, isi dengan **Q3** dari `sql/queries.sql`.
- Options → Query Parameters: `{{ [$json.order_id || '-', $json.source, 'INVALID', $json.errors.join('; ')] }}`

**5. Reply Invalid** (Respond to Webhook)
- Respond With: JSON, Response Code `422`.
- Body: `{{ JSON.stringify({ ok: false, errors: $('Normalize').first().json.errors }) }}`

**6. Check History** (Postgres, cabang true)
- Execute Query dengan **Q1**.
- Query Parameters: `{{ [$json.source, $json.order_id, $json.phone, $json.total] }}`

**7. Duplicate?** (If) → Number: `{{ $json.exact_dup }}` is greater than `0`.

**8. Log Duplicate** (Postgres, cabang true)
- Q3 dengan parameter `{{ [$('Normalize').first().json.order_id, $('Normalize').first().json.source, 'DUPLICATE', 'Webhook terkirim ulang'] }}`

**9. Reply Duplicate** (Respond to Webhook)
- Response Code `200` (supaya pengirim seperti Shopify tidak terus mengirim ulang).
- Body: `{{ JSON.stringify({ ok: true, duplicate: true, order_id: $('Normalize').first().json.order_id }) }}`

**10. Risk Score** (Code, cabang false dari Duplicate?) → isi dengan `code-nodes/02-skor-risiko.js`.

**11. Needs AI?** (If) → Boolean: `{{ $json.needs_ai }}` is true.

**12. Request AI** (Code, cabang true) → isi dengan `code-nodes/03-request-ai.js`.

**13. Cloudflare AI** (HTTP Request)
- Method `POST`.
- URL: `https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai/run/@cf/google/gemma-4-26b-a4b-it`
- Authentication: Generic Credential Type → Header Auth → "Cloudflare AI".
- Send Body: JSON → Specify Body: Using JSON → `{{ JSON.stringify($json.ai_request) }}`
- Options: Timeout `90000`. Model Gemma 4 "berpikir" dulu sebelum menjawab, jadi butuh waktu lebih lama dan `max_tokens` besar (2000, diatur di `03-request-ai.js`).
- Settings: Retry On Fail aktif (2 kali, jeda 3000 ms). On Error: **Continue** (bukan "Continue (using error output)"), supaya kalau AI gagal, node berikutnya tetap jalan dan mengarahkan pesanan ke review manusia.

**14. Parse AI** (Code) → isi dengan `code-nodes/04-parse-ai.js`.

**15. Decide Status** (Code) → isi dengan `code-nodes/05-tentukan-status.js`. Sambungkan **dua input** ke node ini: dari `Parse AI` dan dari cabang false `Needs AI?`.

**16. Save Order** (Postgres)
- Execute Query dengan **Q2**.
- Query Parameters: `{{ $json.params }}`
- Settings: aktifkan **Always Output Data**. Kalau dua webhook yang sama datang bersamaan, query mengembalikan 0 baris, dan workflow harus tetap sampai ke node balasan.

**17. Reply Webhook** (Respond to Webhook)
- Respond With: JSON, Response Code `200`.
- Body: `{{ JSON.stringify($('Decide Status').first().json.webhook_response) }}`

**18. Needs Review?** (If), dengan dua kondisi (AND):
- `{{ $('Decide Status').first().json.status }}` equals `PENDING_REVIEW`
- `{{ $('Save Order').first().json.id }}` is not empty

**19. Notify Owner** (Telegram → Send Message)
- Chat ID: chat id kamu.
- Text: `{{ $('Decide Status').first().json.telegram_text }}`
- Text ditambah baris link panel admin: `Putuskan di panel admin: https://order.sldev.my.id/api/admin/login`
- Tanpa tombol. Keputusan Approve/Reject dilakukan di halaman admin website (lihat bagian 7b).
  Kalau ingin tombol di Telegram, pakai workflow Order Approval (bagian 6) dan tambahkan Inline Keyboard
  `approve:{{ $('Save Order').first().json.id }}` / `reject:{{ $('Save Order').first().json.id }}`.
- Additional Fields: matikan **Append n8n Attribution**.

Setelah selesai, klik **Publish / Active** supaya URL produksi `/webhook/order` aktif.

## 6. Workflow 2: Order Approval (opsional, tombol Telegram)

Workflow terpisah bernama **Order Approval**, dijalankan saat owner menekan tombol. Tidak diperlukan kalau keputusan dilakukan lewat website.

```
Telegram Trigger → Baca Tombol → Jawab Tombol → Berwenang? → Update Keputusan → Sudah Diproses? → Kabari Owner
```

1. **Telegram Trigger**: credential "Order Bot", Updates: `callback_query`.
2. **Baca Tombol** (Code) → isi dengan `code-nodes/06-baca-tombol.js`. Ganti `OWNER_IDS` dengan user id kamu.
3. **Jawab Tombol** (Telegram → Callback → Answer Query)
   - Query ID: `{{ $json.callback_id }}`
   - Text: `{{ $json.berwenang ? 'Diproses' : 'Kamu tidak punya akses' }}`
   - Langkah ini menghilangkan ikon loading di tombol.
4. **Berwenang?** (If) → Boolean: `{{ $('Baca Tombol').first().json.berwenang }}` is true.
5. **Update Keputusan** (Postgres)
   - Execute Query dengan **Q4**.
   - Query Parameters: `{{ $('Baca Tombol').first().json.params }}`
   - Settings: **Always Output Data** aktif.
6. **Sudah Diproses?** (If) → `{{ $json.id }}` is not empty. Kalau kosong, artinya pesanan sudah diputuskan sebelumnya (tombol ditekan dua kali), dan workflow berhenti.
7. **Kabari Owner** (Telegram → Send Message)
   - Chat ID: `{{ $('Baca Tombol').first().json.chat_id }}`
   - Text: `{{ $json.order_id }} → {{ $json.status }} oleh {{ $('Baca Tombol').first().json.oleh }}`
   - Additional Fields → Reply To Message ID: `{{ $('Baca Tombol').first().json.message_id }}`

Di tahap lanjutan, kamu bisa menambahkan notifikasi ke pelanggan (email atau WhatsApp) setelah pesanannya disetujui.

## 7. Workflow 3: Laporan harian

1. **Schedule Trigger**: setiap hari pukul 20.00.
2. **Ringkasan 24 Jam** (Postgres): Q5, Settings **Always Output Data** aktif.
3. **Format Laporan** (Code) → isi dengan `code-nodes/07-laporan-harian.js`.
4. **Telegram → Send Message** ke chat id kamu: `{{ $json.teks }}`

## 7b. Workflow 4: API untuk website

Workflow **[Order] API** (`workflows/04-order-api.json`) dipakai website Smart Order (`smart-order-web`). Semua endpoint dikunci credential `Webhook Secret`, dan yang memanggilnya hanya server website (Cloudflare Worker), bukan browser.

| Endpoint | Fungsi | Query |
| --- | --- | --- |
| `GET /webhook/api/orders?status=ALL` | 200 pesanan terbaru + 30 aktivitas untuk halaman admin | Q6 |
| `POST /webhook/api/decide` body `{ id, decision: APPROVE\|REJECT, by }` | Keputusan owner dari website | `08-keputusan-web.js` + Q4 |
| `GET /webhook/api/stats` | Statistik 30 hari tanpa data pribadi untuk halaman depan | Q7 |

Q4 hanya mengubah pesanan yang masih `PENDING_REVIEW`, jadi keputusan ganda dibalas 409. Nama admin (`by`) diisi server website dari login Cloudflare Access, bukan dari browser.

Balasan webhook `/webhook/order` juga berisi hasil analisis tanpa data pribadi (`risk_score`, `risk_level`, `risk_reasons`, `tags`, `ai_verdict`, `ai_confidence`, `ai_reason`, `decided_by`), yang ditampilkan demo di website.

## 8. Pengujian

### Uji logika tanpa n8n

```bash
node test/test-code-nodes.js
```

Ada 32 tes yang mencakup normalisasi (format generik dan Shopify), skor risiko, perlindungan data pribadi, berbagai format jawaban AI (termasuk jawaban rusak dan error), keputusan status, tombol, laporan, balasan webhook tanpa data pribadi, dan keputusan dari website.

### Uji end-to-end

```bash
chmod +x test/kirim-order.sh
WEBHOOK_SECRET=isi_secret ./test/kirim-order.sh
```

| Pesanan | Hasil yang diharapkan |
| --- | --- |
| 01-normal | Skor 0, LOW → `APPROVED_AUTO` |
| 02-cod-besar | Skor 55, MEDIUM → AI → otomatis kalau AI yakin, kalau tidak masuk Telegram |
| 03-mencurigakan | Skor 85, HIGH → `PENDING_REVIEW`, tombol muncul di Telegram |
| 04-invalid | HTTP 422 dengan daftar error |
| 05-shopify | Format Shopify terbaca → `APPROVED_AUTO` |
| 01-normal (dikirim ulang) | `duplicate: true` |
| 06-mirip-order-1001 | Skor 30, MEDIUM, selalu `PENDING_REVIEW` (kemungkinan pesanan ganda) |

Lalu tekan Approve di Telegram, tekan sekali lagi (harus diabaikan), dan coba tekan dari akun lain (harus ditolak).

Cek isi database:

```bash
docker compose exec postgres psql -U orders_app -d orders \
  -c "select order_id, risk_score, risk_level, ai_verdict, status, decided_by from orders order by id" \
  -c "select order_id, action, actor, created_at from order_logs order by id"
```

### Yang perlu dipantau

- **Kualitas jawaban AI.** Jalankan pesanan 02 beberapa kali dan lihat `ai_verdict` serta `ai_reason`. Kalau model sering memberi jawaban yang tidak valid (`ai_flags` berisi `ai_error`), coba model lain dari katalog Workers AI.
- **Pemakaian neuron.** Bisa dilihat di dashboard Cloudflare → AI → Workers AI.

## 9. Menghubungkan ke toko sungguhan (Shopify)

Node `Normalize` sudah bisa membaca payload webhook Shopify `orders/create`.

1. Buat **development store** gratis lewat akun Shopify Partner.
2. Settings → Notifications → Webhooks → buat webhook `Order creation` dengan format JSON dan URL `https://n8n.sldev.my.id/webhook/order`.
3. Shopify tidak bisa mengirim header custom. Buat Webhook node terpisah (misalnya path `order-shopify`) tanpa Header Auth, lalu verifikasi tanda tangan `X-Shopify-Hmac-Sha256`. Caranya: di Webhook node aktifkan opsi Raw Body, set env `NODE_FUNCTION_ALLOW_BUILTIN=crypto` di service n8n, lalu hitung HMAC-SHA256 dari raw body dengan secret dari Shopify di sebuah Code node. Tolak request kalau hasilnya tidak cocok.

## 10. Publikasi portfolio

- **GitHub**: upload folder ini (tanpa `.env`), ditambah ekspor ketiga workflow (menu ⋯ → Download). Cek dulu hasil ekspornya dan hapus chat id serta Account ID Cloudflare.
- **Video demo 60–90 detik**: jalankan `kirim-order.sh`, tunjukkan respons tiap skenario, notifikasi dan tombol Approve di Telegram, isi tabel `orders`, lalu laporan harian.
- **Post LinkedIn**: tulis masalahnya (memeriksa pesanan secara manual itu lambat dan rawan penipuan COD), daftar fitur, lalu angka hasil. Contohnya persentase pesanan yang disetujui otomatis dari laporan harian, jumlah tes yang lulus, dan biaya Rp0. Tambahkan poin yang jarang ada di project serupa: data pribadi tidak dikirim ke AI, dan AI tidak pernah menolak pesanan sendiri.
