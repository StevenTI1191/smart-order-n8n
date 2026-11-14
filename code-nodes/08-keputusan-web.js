// Node: "Cek Keputusan"  (Code node, workflow "[Order] API", mode: Run Once for All Items)
// Input : Webhook "Keputusan" (POST /webhook/api/decide)
// Body  : { "id": 12, "decision": "APPROVE" | "REJECT", "by": "steven@email.com" }
// Output: { valid, error, params: [status_baru, oleh, id] } untuk query Q4.
// Siapa yang menekan tombol diisi oleh server website (dari login Cloudflare Access),
// bukan dari browser, jadi tidak bisa dipalsukan pengunjung.

const b = $input.first().json.body || {};
const id = String(b.id ?? '').trim();
const decision = String(b.decision || '').toUpperCase();
const status_baru = decision === 'APPROVE' ? 'APPROVED_MANUAL' : decision === 'REJECT' ? 'REJECTED' : null;
const oleh = String(b.by || 'admin').replace(/[^\w@.+-]/g, '').slice(0, 80) || 'admin';

let error = null;
if (!/^\d{1,18}$/.test(id)) error = 'id tidak valid';
else if (!status_baru) error = 'decision harus APPROVE atau REJECT';

return [{
  json: {
    valid: !error,
    error,
    id,
    status_baru,
    oleh: 'web:' + oleh,
    params: [status_baru, 'web:' + oleh, id],
  },
}];
