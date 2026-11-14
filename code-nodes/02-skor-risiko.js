// Node: "Skor Risiko"  (Code node, mode: Run Once for All Items)
// Input : output node "Cek Riwayat" (exact_dup, near_dup, prior_rejected, prior_ok)
// Output: pesanan + skor risiko, level, alasan, tag klasifikasi, dan apakah perlu AI.
// Semua aturan bersifat pasti (deterministik) supaya keputusan bisa dijelaskan dan diaudit.

const HIGH_VALUE = 5000000;   // pesanan bernilai besar
const COD_LIMIT = 1000000;    // COD di atas ini dianggap berisiko
const BULK_QTY = 10;          // qty per item yang dianggap borongan
const LEVEL_MEDIUM = 30;
const LEVEL_HIGH = 60;
const DISPOSABLE = ['mailinator.com', 'tempmail.com', '10minutemail.com', 'guerrillamail.com', 'yopmail.com', 'trashmail.com'];

const o = $('Normalisasi').first().json;
const h = $input.first().json;
const hist = {
  near_dup: Number(h.near_dup) || 0,
  prior_rejected: Number(h.prior_rejected) || 0,
  prior_ok: Number(h.prior_ok) || 0,
};

const reasons = [];
const add = (poin, teks) => reasons.push({ poin, teks });

if (o.total >= HIGH_VALUE) add(30, 'Nilai pesanan besar');
if (o.payment_method === 'cod' && o.total >= COD_LIMIT) add(25, 'COD bernilai besar');
if (o.items.some((i) => i.qty >= BULK_QTY)) add(15, 'Jumlah per item tidak wajar');
if (o.address.length < 15) add(15, 'Alamat terlalu pendek');
if (!o.email) add(5, 'Tanpa email');
else if (DISPOSABLE.includes(o.email.split('@')[1])) add(15, 'Email sekali pakai');

const nama = o.customer_name.toLowerCase();
if (/\d/.test(nama) || /(.)\1{3,}/.test(nama) || nama.replace(/\s/g, '').length < 3 || /(asdf|qwer|test|tes123|xxx)/.test(nama)) {
  add(15, 'Nama pelanggan mencurigakan');
}

if (o.items_subtotal > 0 && Math.abs(o.total - o.items_subtotal) / o.items_subtotal > 0.3) {
  add(15, 'Total tidak sesuai rincian item');
}

if (hist.near_dup > 0) add(30, 'Pesanan serupa (HP dan total sama) dalam 30 menit');
if (hist.prior_rejected > 0) add(25, 'Pelanggan pernah punya pesanan ditolak');

const jam = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Jakarta' })
  .format(new Date(o.ordered_at)));
if (jam >= 0 && jam < 5) add(5, 'Dipesan dini hari');

if (hist.prior_ok > 0) add(-10, 'Pelanggan lama dengan riwayat baik');

const score = Math.max(0, reasons.reduce((a, r) => a + r.poin, 0));
const level = score >= LEVEL_HIGH ? 'HIGH' : score >= LEVEL_MEDIUM ? 'MEDIUM' : 'LOW';

// Klasifikasi pesanan
const tags = [];
if (o.total >= HIGH_VALUE) tags.push('high_value');
if (o.payment_method === 'cod') tags.push('cod');
if (o.items.some((i) => i.qty >= BULK_QTY)) tags.push('bulk');
tags.push(hist.prior_ok > 0 ? 'repeat_customer' : 'new_customer');

return [{
  json: {
    ...o,
    history: hist,
    risk_score: score,
    risk_level: level,
    risk_reasons: reasons.map((r) => `${r.teks} (${r.poin > 0 ? '+' : ''}${r.poin})`),
    tags,
    needs_ai: level !== 'LOW', // AI hanya dipanggil untuk pesanan yang janggal, supaya hemat kuota
  },
}];
