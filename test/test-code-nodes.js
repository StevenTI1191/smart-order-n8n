// Menguji semua Code node n8n secara lokal tanpa n8n.
// Jalankan: node test/test-code-nodes.js
// Cara kerja: isi file code-nodes/*.js dijalankan sebagai fungsi dengan $input dan $() tiruan.

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const load = (f) => fs.readFileSync(path.join(ROOT, 'code-nodes', f), 'utf8');
const order = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'orders', f), 'utf8'));

function run(file, input, nodes = {}) {
  const items = Array.isArray(input) ? input : [input];
  const $input = { first: () => ({ json: items[0] }), all: () => items.map((json) => ({ json })) };
  const $ = (name) => {
    if (!(name in nodes)) throw new Error(`Node "${name}" tidak disediakan di test`);
    return { first: () => ({ json: nodes[name] }) };
  };
  const out = new Function('$input', '$', load(file))($input, $);
  return out[0].json;
}

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ok  ', name); }
  catch (e) { console.log('  GAGAL', name, '\n       ', e.message); process.exitCode = 1; }
};

const NO_HISTORY = { exact_dup: 0, near_dup: 0, prior_rejected: 0, prior_ok: 0 };
// Jalankan pipeline sampai "Skor Risiko"
const score = (file, history = NO_HISTORY) => {
  const n = run('01-normalisasi.js', { body: order(file) });
  return run('02-skor-risiko.js', history, { Normalisasi: n });
};

console.log('01 Normalisasi');
test('pesanan normal valid, HP dan harga dinormalisasi', () => {
  const n = run('01-normalisasi.js', { body: order('01-normal.json') });
  assert.strictEqual(n.valid, true, n.errors.join(', '));
  assert.strictEqual(n.phone, '6281234567890');
  assert.strictEqual(n.items[0].price, 85000);
  assert.strictEqual(n.payment_method, 'transfer');
  assert.strictEqual(n.items_subtotal, 215000);
  assert.strictEqual(n.item_qty, 3);
});
test('payload Shopify dipetakan', () => {
  const n = run('01-normalisasi.js', { body: order('05-shopify.json') });
  assert.strictEqual(n.valid, true, n.errors.join(', '));
  assert.strictEqual(n.source, 'shopify');
  assert.strictEqual(n.order_id, '#1005');
  assert.strictEqual(n.phone, '6285211223344');
  assert.strictEqual(n.total, 320000);
  assert.strictEqual(n.address, 'Jl. Hang Tuah No. 88, Kel. Sail');
});
test('pesanan rusak ditandai invalid dengan alasan', () => {
  const n = run('01-normalisasi.js', { body: order('04-invalid.json') });
  assert.strictEqual(n.valid, false);
  for (const e of ['Nomor HP tidak valid', 'Kota kosong', 'Tidak ada item', 'Total harus lebih dari 0']) {
    assert(n.errors.includes(e), `harus ada error: ${e}`);
  }
});
test('body kosong tidak membuat node crash', () => {
  const n = run('01-normalisasi.js', {});
  assert.strictEqual(n.valid, false);
});

console.log('02 Skor Risiko');
test('pesanan normal = LOW, tanpa AI', () => {
  const s = score('01-normal.json');
  assert.strictEqual(s.risk_level, 'LOW', s.risk_reasons.join('; '));
  assert.strictEqual(s.needs_ai, false);
});
test('COD besar = MEDIUM, perlu AI, tag high_value + cod', () => {
  const s = score('02-cod-besar.json');
  assert.strictEqual(s.risk_level, 'MEDIUM', `${s.risk_score}: ${s.risk_reasons.join('; ')}`);
  assert.strictEqual(s.needs_ai, true);
  assert(s.tags.includes('high_value') && s.tags.includes('cod'));
});
test('pesanan mencurigakan = HIGH', () => {
  const s = score('03-mencurigakan.json');
  assert.strictEqual(s.risk_level, 'HIGH', `${s.risk_score}: ${s.risk_reasons.join('; ')}`);
  assert(s.tags.includes('bulk'));
});
test('pesanan mirip dalam 30 menit menaikkan skor ke MEDIUM', () => {
  const s = score('06-mirip-order-1001.json', { ...NO_HISTORY, near_dup: 1 });
  assert.strictEqual(s.risk_level, 'MEDIUM', `${s.risk_score}`);
});
test('pelanggan lama mengurangi skor dan tidak di bawah 0', () => {
  const s = score('01-normal.json', { ...NO_HISTORY, prior_ok: '3' });
  assert(s.risk_score >= 0);
  assert(s.tags.includes('repeat_customer'));
});

console.log('03 Request AI');
test('data pribadi tidak ikut terkirim ke AI', () => {
  const s = score('02-cod-besar.json');
  const r = run('03-request-ai.js', s);
  const sent = JSON.stringify(r.ai_request);
  for (const pii of ['Rina', '6282111223344', 'rina.w@yahoo.com', 'Griya Indah']) {
    assert(!sent.includes(pii), `PII bocor: ${pii}`);
  }
  assert.strictEqual(r.ai_request.messages.length, 2);
});

console.log('04 Parse AI');
const reqNode = run('03-request-ai.js', score('02-cod-besar.json'));
const parse = (resp) => run('04-parse-ai.js', resp, { 'Request AI': reqNode });
test('jawaban string JSON', () => {
  const p = parse({ success: true, result: { response: '{"verdict":"approve","confidence":0.82,"reason":"Wajar.","flags":[]}' } });
  assert.strictEqual(p.ai_verdict, 'APPROVE');
  assert.strictEqual(p.ai_confidence, 0.82);
  assert.strictEqual(p.ai_request, undefined);
});
test('jawaban dibungkus ```json dan ada teks lain', () => {
  const p = parse({ result: { response: 'Berikut hasilnya:\n```json\n{"verdict":"REVIEW","confidence":0.6,"reason":"COD besar"}\n```' } });
  assert.strictEqual(p.ai_verdict, 'REVIEW');
});
test('jawaban objek (JSON mode)', () => {
  const p = parse({ result: { response: { verdict: 'REJECT', confidence: 2, reason: 'x' } } });
  assert.strictEqual(p.ai_verdict, 'REJECT');
  assert.strictEqual(p.ai_confidence, 1);
});
test('format gaya OpenAI (choices)', () => {
  const p = parse({ result: { choices: [{ message: { content: '{"verdict":"APPROVE","confidence":0.9,"reason":"ok"}' } }] } });
  assert.strictEqual(p.ai_verdict, 'APPROVE');
});
test('jawaban ngawur -> REVIEW', () => {
  const p = parse({ result: { response: 'Saya tidak yakin.' } });
  assert.strictEqual(p.ai_verdict, 'REVIEW');
  assert(p.ai_flags.includes('ai_error'));
});
test('HTTP error -> REVIEW', () => {
  const p = parse({ error: { message: 'timeout' } });
  assert.strictEqual(p.ai_verdict, 'REVIEW');
});

console.log('05 Tentukan Status');
test('LOW -> APPROVED_AUTO oleh rules, 21 parameter', () => {
  const t = run('05-tentukan-status.js', score('01-normal.json'));
  assert.strictEqual(t.status, 'APPROVED_AUTO');
  assert.strictEqual(t.decided_by, 'rules');
  assert.strictEqual(t.params.length, 21);
  assert.strictEqual(t.params[17], '');
});
test('MEDIUM + AI APPROVE yakin -> APPROVED_AUTO oleh ai', () => {
  const p = parse({ result: { response: '{"verdict":"APPROVE","confidence":0.85,"reason":"Wajar"}' } });
  const t = run('05-tentukan-status.js', p);
  assert.strictEqual(t.status, 'APPROVED_AUTO');
  assert.strictEqual(t.decided_by, 'ai');
});
test('MEDIUM + AI ragu -> PENDING_REVIEW', () => {
  const p = parse({ result: { response: '{"verdict":"APPROVE","confidence":0.5,"reason":"?"}' } });
  assert.strictEqual(run('05-tentukan-status.js', p).status, 'PENDING_REVIEW');
});
test('HIGH selalu PENDING_REVIEW walau AI APPROVE', () => {
  const req = run('03-request-ai.js', score('03-mencurigakan.json'));
  const p = run('04-parse-ai.js', { result: { response: '{"verdict":"APPROVE","confidence":0.99,"reason":"ok"}' } }, { 'Request AI': req });
  const t = run('05-tentukan-status.js', p);
  assert.strictEqual(t.status, 'PENDING_REVIEW');
  assert(t.telegram_text.includes('Skor risiko'));
});
test('kemungkinan pesanan ganda selalu ke owner walau AI APPROVE', () => {
  const req = run('03-request-ai.js', score('06-mirip-order-1001.json', { ...NO_HISTORY, near_dup: 1 }));
  const p = run('04-parse-ai.js', { result: { response: '{"verdict":"APPROVE","confidence":0.95,"reason":"ok"}' } }, { 'Request AI': req });
  assert.strictEqual(run('05-tentukan-status.js', p).status, 'PENDING_REVIEW');
});
test('AI REJECT tidak menolak otomatis', () => {
  const p = parse({ result: { response: '{"verdict":"REJECT","confidence":0.95,"reason":"curang"}' } });
  assert.strictEqual(run('05-tentukan-status.js', p).status, 'PENDING_REVIEW');
});

console.log('06 Baca Tombol');
const cb = (data, fromId) => ({ callback_query: { id: 'cb1', data, from: { id: fromId, username: 'owner' }, message: { chat: { id: 1 }, message_id: 9 } } });
test('owner menekan approve', () => {
  const b = run('06-baca-tombol.js', cb('approve:42', 123456789));
  assert.strictEqual(b.berwenang, true);
  assert.deepStrictEqual(b.params, ['APPROVED_MANUAL', '@owner', '42']);
});
test('orang lain tidak berwenang', () => {
  assert.strictEqual(run('06-baca-tombol.js', cb('approve:42', 555)).berwenang, false);
});
test('callback data aneh ditolak', () => {
  assert.strictEqual(run('06-baca-tombol.js', cb('hapus:abc', 123456789)).berwenang, false);
});

console.log('07 Laporan Harian');
test('rekap dan persentase otomatis', () => {
  const l = run('07-laporan-harian.js', [
    { status: 'APPROVED_AUTO', jumlah: 8, nilai: '2000000' },
    { status: 'APPROVED_MANUAL', jumlah: 1, nilai: '7350000' },
    { status: 'PENDING_REVIEW', jumlah: 1, nilai: '2000000' },
  ]);
  assert(l.teks.includes('Pesanan masuk: 10'));
  assert(l.teks.includes('(80%)'));
});
test('tidak ada pesanan', () => {
  assert(run('07-laporan-harian.js', [{}]).teks.includes('Pesanan masuk: 0'));
});

test('balasan webhook berisi analisis tanpa data pribadi', () => {
  const s = score('03-mencurigakan.json');
  const w = run('05-tentukan-status.js', { ...s, ai_verdict: 'REVIEW', ai_confidence: 0.7, ai_reason: 'x' }).webhook_response;
  assert.strictEqual(w.risk_level, 'HIGH');
  assert(w.risk_reasons.length > 0 && w.ai_verdict === 'REVIEW');
  const teks = JSON.stringify(w);
  for (const pii of ['asdf123', '081299990000', '6281299990000', 'mailinator', 'jl a']) assert(!teks.includes(pii), 'bocor: ' + pii);
});

console.log('08 Keputusan dari Website');
test('approve valid jadi APPROVED_MANUAL dengan nama admin', () => {
  const k = run('08-keputusan-web.js', { body: { id: 12, decision: 'approve', by: 'steven@mail.com' } });
  assert.strictEqual(k.valid, true);
  assert.deepStrictEqual(k.params, ['APPROVED_MANUAL', 'web:steven@mail.com', '12']);
});
test('reject valid', () => {
  assert.strictEqual(run('08-keputusan-web.js', { body: { id: '7', decision: 'REJECT' } }).status_baru, 'REJECTED');
});
test('id atau keputusan aneh ditolak', () => {
  assert.strictEqual(run('08-keputusan-web.js', { body: { id: '1; drop table', decision: 'APPROVE' } }).valid, false);
  assert.strictEqual(run('08-keputusan-web.js', { body: { id: 3, decision: 'DELETE' } }).valid, false);
  assert.strictEqual(run('08-keputusan-web.js', {}).valid, false);
});
test('nama admin dibersihkan dari karakter berbahaya', () => {
  const k = run('08-keputusan-web.js', { body: { id: 1, decision: 'APPROVE', by: '<script>x</script>' } });
  assert(!/[<>/]/.test(k.oleh), k.oleh);
});

console.log(`\n${passed} tes lulus${process.exitCode ? ', ada yang gagal' : ''}`);
