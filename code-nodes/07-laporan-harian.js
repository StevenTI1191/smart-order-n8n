// Node: "Format Laporan"  (Code node, workflow "Order Daily Report", mode: Run Once for All Items)
// Input : hasil query Q5 "Ringkasan 24 Jam" (satu baris per status)

const rows = $input.all().map((r) => r.json).filter((r) => r.status);
const rp = (n) => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const jumlah = (s) => rows.filter((r) => s.includes(r.status)).reduce((a, r) => a + Number(r.jumlah), 0);
const nilai = (s) => rows.filter((r) => s.includes(r.status)).reduce((a, r) => a + Number(r.nilai), 0);

const total = jumlah(['APPROVED_AUTO', 'APPROVED_MANUAL', 'PENDING_REVIEW', 'REJECTED']);
const auto = jumlah(['APPROVED_AUTO']);
const persen = total ? Math.round((auto / total) * 100) : 0;

const teks = [
  'Laporan pesanan 24 jam terakhir',
  `Pesanan masuk: ${total}`,
  `- Disetujui otomatis: ${auto} (${persen}%)`,
  `- Disetujui owner: ${jumlah(['APPROVED_MANUAL'])}`,
  `- Menunggu review: ${jumlah(['PENDING_REVIEW'])}`,
  `- Ditolak: ${jumlah(['REJECTED'])}`,
  `Nilai pesanan disetujui: ${rp(nilai(['APPROVED_AUTO', 'APPROVED_MANUAL']))}`,
].join('\n');

return [{ json: { teks } }];
