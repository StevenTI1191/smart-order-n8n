// Node: "Tentukan Status"  (Code node, mode: Run Once for All Items)
// Input : dari "Skor Risiko" (risiko LOW, tanpa AI) ATAU dari "Parse AI"
// Output: status akhir, parameter untuk query "Simpan Pesanan", dan teks notifikasi Telegram.
//
// Aturan keputusan:
//   LOW                                   -> APPROVED_AUTO (oleh rules)
//   MEDIUM + AI APPROVE + confidence>=0.7 -> APPROVED_AUTO (oleh ai)
//   selain itu (termasuk semua HIGH)      -> PENDING_REVIEW (owner memutuskan)
// Kemungkinan pesanan ganda (near_dup) selalu ke owner, apa pun kata AI.
// AI tidak pernah menolak pesanan sendiri. Rekomendasi REJECT tetap diputuskan manusia.

const MIN_AI_CONFIDENCE = 0.7;
const o = $input.first().json;

let status = 'PENDING_REVIEW';
let decided_by = 'system';
if (o.risk_level === 'LOW') {
  status = 'APPROVED_AUTO';
  decided_by = 'rules';
} else if (o.risk_level === 'MEDIUM' && !(Number(o.history?.near_dup) > 0) && o.ai_verdict === 'APPROVE' && Number(o.ai_confidence) >= MIN_AI_CONFIDENCE) {
  status = 'APPROVED_AUTO';
  decided_by = 'ai';
}

const rp = (n) => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');

const params = [
  o.order_id,                                   // $1
  o.source,                                     // $2
  o.customer_name,                              // $3
  o.email || '',                                // $4
  o.phone,                                      // $5
  o.address,                                    // $6
  o.city,                                       // $7
  o.postal_code || '',                          // $8
  JSON.stringify(o.items),                      // $9
  o.item_qty,                                   // $10
  o.payment_method,                             // $11
  o.total,                                      // $12
  o.risk_score,                                 // $13
  o.risk_level,                                 // $14
  JSON.stringify(o.risk_reasons || []),         // $15
  JSON.stringify(o.tags || []),                 // $16
  o.ai_verdict || '',                           // $17
  o.ai_confidence == null ? '' : String(o.ai_confidence), // $18
  o.ai_reason || '',                            // $19
  status,                                       // $20
  decided_by,                                   // $21
];

const telegram_text = [
  'Pesanan perlu review',
  `${o.order_id} (${o.source})`,
  `Pelanggan: ${o.customer_name}, ${o.city}`,
  `Total: ${rp(o.total)} (${o.payment_method})`,
  `Item: ${o.items.map((i) => `${i.qty}x ${i.name}`).join(', ').slice(0, 200)}`,
  '',
  `Skor risiko: ${o.risk_score} (${o.risk_level})`,
  ...(o.risk_reasons || []).map((r) => `- ${r}`),
  '',
  o.ai_verdict ? `Rekomendasi AI: ${o.ai_verdict} (${o.ai_confidence})` : 'Rekomendasi AI: -',
  o.ai_reason || '',
].join('\n').trim();

return [{
  json: {
    ...o,
    status,
    decided_by,
    params,
    telegram_text,
    // Balasan ke pengirim (toko / website demo): hasil analisis tanpa data pribadi
    webhook_response: {
      ok: true,
      order_id: o.order_id,
      status,
      decided_by,
      risk_score: o.risk_score,
      risk_level: o.risk_level,
      risk_reasons: o.risk_reasons || [],
      tags: o.tags || [],
      ai_verdict: o.ai_verdict || null,
      ai_confidence: o.ai_confidence ?? null,
      ai_reason: o.ai_reason || null,
    },
  },
}];
