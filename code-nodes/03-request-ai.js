// Node: "Request AI"  (Code node, mode: Run Once for All Items)
// Input : output node "Risk Score" (cabang needs_ai = true)
// Output: pesanan + ai_request (body untuk Cloudflare Workers AI)
// Data pribadi (nama, HP, email, alamat lengkap) TIDAK dikirim ke AI. Yang dikirim hanya fitur risiko.

const o = $input.first().json;

const features = {
  total: o.total,
  items_subtotal: o.items_subtotal,
  payment_method: o.payment_method,
  item_count: o.items.length,
  item_qty: o.item_qty,
  items: o.items.slice(0, 10).map((i) => ({ name: i.name.slice(0, 60), qty: i.qty, price: i.price })),
  city: o.city,
  address_length: o.address.length,
  has_email: Boolean(o.email),
  customer_history: o.history,
  rule_score: o.risk_score,
  rule_level: o.risk_level,
  rule_reasons: o.risk_reasons,
  notes: o.notes.slice(0, 200),
};

const system = [
  'Kamu analis risiko pesanan untuk toko online di Indonesia.',
  'Nilai apakah pesanan ini aman diproses. Data pribadi pelanggan sengaja tidak dikirim.',
  'Balas HANYA dengan JSON valid tanpa teks lain, dengan format:',
  '{"verdict":"APPROVE|REVIEW|REJECT","confidence":0.0,"reason":"maksimal 2 kalimat bahasa Indonesia","flags":["..."]}',
  'Pedoman: APPROVE jika pola pesanan wajar. REVIEW jika ada kejanggalan yang perlu dicek manusia.',
  'REJECT hanya jika sangat jelas penipuan atau tidak masuk akal.',
  'confidence = seberapa yakin kamu (0 sampai 1). Jangan mengarang fakta di luar data.',
].join('\n');

const ai_request = {
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: 'Data pesanan:\n' + JSON.stringify(features) },
  ],
  max_tokens: 2000, // Gemma 4 "berpikir" dulu (reasoning), jadi butuh ruang token lebih besar
  temperature: 0.1,
};

return [{ json: { ...o, ai_request } }];
