// Node: "Parse AI"  (Code node, mode: Run Once for All Items)
// Input : output node "Cloudflare AI" (HTTP Request, Settings > On Error: Continue)
// Output: pesanan + ai_verdict, ai_confidence, ai_reason, ai_flags
// Kalau AI error atau jawabannya tidak bisa dibaca, pesanan diarahkan ke review manusia.

const o = { ...$('Request AI').first().json };
delete o.ai_request;
const r = $input.first().json || {};

const fallback = (alasan) => [{
  json: { ...o, ai_verdict: 'REVIEW', ai_confidence: 0, ai_reason: alasan, ai_flags: ['ai_error'] },
}];

if (r.error || r.success === false) return fallback('AI tidak bisa dihubungi, perlu dicek manual');

// Format jawaban Workers AI berbeda antar model: result.response (string/objek) atau gaya OpenAI (choices)
let raw = r.result?.response ?? r.result?.choices?.[0]?.message?.content ?? r.choices?.[0]?.message?.content;

let d = null;
try {
  if (raw && typeof raw === 'object') d = raw;
  else if (typeof raw === 'string') {
    const m = raw.replace(/```json|```/g, '').match(/\{[\s\S]*\}/);
    if (m) d = JSON.parse(m[0]);
  }
} catch (e) {
  d = null;
}

const verdict = String(d?.verdict || '').toUpperCase();
if (!['APPROVE', 'REVIEW', 'REJECT'].includes(verdict)) return fallback('Jawaban AI tidak valid, perlu dicek manual');

let conf = Number(d.confidence);
if (!Number.isFinite(conf)) conf = 0.5;
conf = Math.min(1, Math.max(0, conf));

return [{
  json: {
    ...o,
    ai_verdict: verdict,
    ai_confidence: Math.round(conf * 100) / 100,
    ai_reason: String(d.reason || '').slice(0, 300),
    ai_flags: Array.isArray(d.flags) ? d.flags.slice(0, 5).map(String) : [],
  },
}];
