import { useEffect, useRef, useState } from 'react';
import Icon from './Icons.jsx';
import { Ring } from './Charts.jsx';
import { api, loadTurnstile } from '../lib/api.js';
import { rp, initials, LEVEL_COLOR, LEVEL_ID, VERDICT_ID, TAG_ID, byLabel, parseReason, confidence } from '../lib/format.js';

// Isi pesanan yang ditampilkan. Sama dengan skenario di worker/templates.js (HP di server diacak).
const S = {
  normal: {
    label: 'Normal', hint: 'Transfer, alamat lengkap', short: 'OK', tone: 'tone-good',
    f: { name: 'Budi Santoso', phone: '0812-3456-7890', email: 'budi.santoso@gmail.com', city: 'Pekanbaru', address: 'Jl. Sudirman No. 45, RT 02/RW 03', payment: 'Transfer bank', total: 215000,
      items: [{ qty: 2, name: 'Kopi Arabika 250 gr', price: 85000 }, { qty: 1, name: 'Gelas Kaca', price: 45000 }] },
    sim: { status: 200, data: { ok: true, status: 'APPROVED_AUTO', decided_by: 'rules', risk_score: 0, risk_level: 'LOW', risk_reasons: [], tags: ['new_customer'], ai_verdict: null } },
  },
  cod: {
    label: 'COD besar', hint: 'Laptop Rp7,3 juta, COD', short: 'Rp', tone: 'tone-warn',
    f: { name: 'Rina Wulandari', phone: '+62 821 1122 3344', email: 'rina.w@yahoo.com', city: 'Dumai', address: 'Perumahan Griya Indah Blok C No. 12', payment: 'COD', total: 7350000,
      items: [{ qty: 1, name: 'Laptop 14 inci', price: 7200000 }, { qty: 1, name: 'Mouse Wireless', price: 150000 }] },
    sim: { status: 200, data: { ok: true, status: 'APPROVED_AUTO', decided_by: 'ai', risk_score: 55, risk_level: 'MEDIUM', risk_reasons: ['Nilai pesanan besar (+30)', 'COD bernilai besar (+25)'], tags: ['high_value', 'cod', 'new_customer'], ai_verdict: 'APPROVE', ai_confidence: 0.82, ai_reason: 'Contoh jawaban: nilai dan barang wajar, alamat lengkap.' } },
  },
  suspicious: {
    label: 'Mencurigakan', hint: 'Borongan, alamat asal, COD', short: '!', tone: 'tone-bad',
    f: { name: 'Dimas Prasetyo', phone: '0812-9999-0000', email: 'x@mailinator.com', city: 'Jakarta', address: 'jl a', payment: 'COD', total: 2100000,
      items: [{ qty: 12, name: 'Power Bank 20.000 mAh', price: 175000 }] },
    sim: { status: 200, data: { ok: true, status: 'PENDING_REVIEW', decided_by: 'system', risk_score: 70, risk_level: 'HIGH', risk_reasons: ['COD bernilai besar (+25)', 'Jumlah per item tidak wajar (+15)', 'Alamat terlalu pendek (+15)', 'Email sekali pakai (+15)'], tags: ['cod', 'bulk', 'new_customer'], ai_verdict: 'REVIEW', ai_confidence: 0.74, ai_reason: 'Contoh jawaban: alamat tidak lengkap dan email sekali pakai untuk pesanan borongan COD.' } },
  },
  invalid: {
    label: 'Data rusak', hint: 'HP salah, item kosong', short: '×', tone: 'tone-bad',
    f: { name: 'Dodi', phone: '12345', email: 'dodi@gmail.com', city: '', address: 'Jl. Melati No. 9', payment: 'Transfer bank', total: 0, items: [] },
    sim: { status: 422, data: { ok: false, errors: ['Nomor HP tidak valid', 'Kota kosong', 'Tidak ada item', 'Total harus lebih dari 0'] } },
  },
  dup: {
    label: 'Pesanan ganda', hint: 'Dikirim dua kali', short: '2×', tone: 'tone-warn',
    f: { name: 'Budi Santoso', phone: '0812-3456-7890', email: 'budi.santoso@gmail.com', city: 'Pekanbaru', address: 'Jl. Sudirman No. 45, RT 02/RW 03', payment: 'Transfer bank', total: 215000,
      items: [{ qty: 2, name: 'Kopi Arabika 250 gr', price: 85000 }, { qty: 1, name: 'Gelas Kaca', price: 45000 }] },
    sim: { status: 200, data: { ok: true, duplicate: true } },
  },
};
const KEYS = ['normal', 'cod', 'suspicious', 'invalid', 'dup'];
const STEP_NAMES = ['Diterima', 'Validasi', 'Cek riwayat', 'Skor risiko', 'AI', 'Keputusan'];
const STEP_ICONS = ['inbox', 'checkbox', 'clock', 'gauge', 'spark', 'shield'];
const AI_STEP = 4;

// Balasan n8n -> tampilan alur dan hasil
function interpret({ status, data }) {
  if (status === 422 || (data.ok === false && Array.isArray(data.errors))) {
    const n = data.errors?.length || 0;
    return { kind: 'invalid', errors: data.errors || [], flow: ['done', 'error', 'idle', 'idle', 'idle', 'idle'], notes: ['masuk', `${n} masalah`, '–', '–', '–', '–'] };
  }
  if (data.duplicate) {
    return { kind: 'duplicate', flow: ['done', 'done', 'warn', 'skip', 'skip', 'done'], notes: ['masuk', 'lengkap', 'sama persis', 'dilewati', 'dilewati', 'diabaikan'] };
  }
  const reasons = (data.risk_reasons || []).map(parseReason);
  const similar = reasons.some((r) => /serupa/i.test(r.text));
  const level = data.risk_level || 'LOW';
  const verdict = data.ai_verdict;
  const pending = data.status === 'PENDING_REVIEW';
  const aiFailed = verdict && Number(data.ai_confidence) === 0 && /dicek manual/.test(data.ai_reason || '');

  let note = 'Risiko rendah, jadi AI tidak dipanggil.';
  if (!pending && data.decided_by === 'ai') note = `Risiko sedang dan AI yakin pesanan wajar (keyakinan ${confidence(data.ai_confidence)}).`;
  else if (pending && level === 'HIGH') note = 'Risiko tinggi selalu diputuskan owner di dashboard admin.';
  else if (pending && similar) note = 'Kemungkinan pesanan ganda selalu dicek owner, apa pun kata AI.';
  else if (pending) note = 'AI belum cukup yakin, jadi owner yang memutuskan.';

  return {
    kind: pending ? 'pending' : 'ok',
    flow: [
      'done', 'done',
      similar ? 'warn' : 'done',
      level === 'HIGH' ? 'bad' : level === 'MEDIUM' ? 'warn' : 'done',
      !verdict ? 'skip' : verdict === 'APPROVE' ? 'done' : verdict === 'REJECT' ? 'bad' : 'warn',
      pending ? 'pending' : 'done',
    ],
    notes: [
      'masuk', 'lengkap',
      similar ? 'mirip' : (data.tags || []).includes('repeat_customer') ? 'pelanggan lama' : 'baru',
      `${Math.min(100, Number(data.risk_score) || 0)} · ${LEVEL_ID[level]}`,
      verdict ? VERDICT_ID[verdict] || verdict : 'dilewati',
      pending ? 'ke owner' : 'otomatis',
    ],
    score: Math.min(100, Number(data.risk_score) || 0),
    level,
    reasons,
    statusLabel: pending ? 'Menunggu owner' : 'Disetujui otomatis',
    statusNote: note,
    decidedBy: pending ? 'owner, lewat dashboard admin' : byLabel(data.decided_by),
    aiVerdict: verdict ? `${VERDICT_ID[verdict] || verdict} · yakin ${confidence(data.ai_confidence)}` : 'tidak dipanggil',
    aiReason: aiFailed ? 'AI sedang tidak bisa dihubungi, jadi pesanan diarahkan ke owner.' : (data.ai_reason || 'Risiko rendah cukup diputuskan aturan, tanpa perlu AI.'),
    tags: (data.tags || []).map((t) => TAG_ID[t] || t),
    orderId: data.order_id,
  };
}

export default function Demo() {
  const [picked, setPicked] = useState('suspicious');
  const [step, setStep] = useState(-1); // -1 siap, 0..5 berjalan, 6 selesai
  const [result, setResult] = useState(null);
  const [notice, setNotice] = useState(null);
  const [siteKey, setSiteKey] = useState(null);
  const [token, setToken] = useState('');
  const widget = useRef(null);
  const widgetId = useRef(null);
  const runId = useRef(0);

  const cur = S[picked];
  const running = step >= 0 && step < 6;
  const finished = step >= 6 && result;

  // Turnstile (anti-bot) hanya kalau site key diatur di server
  useEffect(() => {
    api.config().then(({ data }) => data?.turnstileSiteKey && setSiteKey(data.turnstileSiteKey)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!siteKey || !widget.current || widgetId.current != null) return;
    widgetId.current = 'loading'; // cegah widget dobel
    loadTurnstile().then((t) => {
      widgetId.current = t.render(widget.current, {
        sitekey: siteKey, theme: 'light', size: 'flexible',
        callback: setToken, 'expired-callback': () => setToken(''), 'error-callback': () => setToken(''),
      });
    }).catch(() => {});
  }, [siteKey]);

  // Animasi tahap: berhenti di tahap AI sampai jawaban server datang
  useEffect(() => {
    if (step < 0 || step >= 6) return;
    if (step === AI_STEP && !result) return;
    const t = setTimeout(() => setStep((s) => s + 1), result && step >= AI_STEP ? 300 : 420);
    return () => clearTimeout(t);
  }, [step, result]);

  const pick = (k) => { runId.current++; setPicked(k); setStep(-1); setResult(null); setNotice(null); };

  async function submit() {
    if (running) return;
    if (siteKey && !token) { setNotice({ tone: 'tone-warn', text: 'Tunggu verifikasi anti-bot di bawah tombol selesai, lalu coba lagi.' }); return; }
    const id = ++runId.current;
    setResult(null); setNotice(null); setStep(0);
    let res;
    try {
      res = await api.demoOrder(picked, token);
    } catch {
      res = { status: 0, data: {} };
    }
    if (siteKey && window.turnstile && widgetId.current != null && widgetId.current !== 'loading') { window.turnstile.reset(widgetId.current); setToken(''); }
    if (id !== runId.current) return; // pengguna sudah ganti skenario

    const live = res.status === 200 || res.status === 422;
    if (!live) {
      setNotice({
        tone: res.status === 429 || res.status === 403 ? 'tone-warn' : 'tone-neutral',
        text: (res.data?.error ? res.data.error + ' ' : 'Server demo sedang tidak bisa dihubungi. ') + 'Ditampilkan hasil simulasi.',
      });
    }
    setResult({ ...interpret(live ? res : cur.sim), live });
  }

  const shown = finished ? result : null;
  const flowState = (i) => {
    if (step < 0) return 'idle';
    if (step >= 6 || i < step) return result ? result.flow[i] : 'done';
    if (i === step) return 'active';
    return 'idle';
  };
  const flowNote = (i) => {
    const st = flowState(i);
    if (st === 'active') return i === AI_STEP ? 'menunggu AI…' : 'proses…';
    if ((step >= 6 || i < step) && result && result.flow[i] !== 'idle') return result.notes[i];
    if (i < step && !result) return 'selesai';
    return '–';
  };
  const pct = step < 0 ? 0 : Math.round((Math.min(step, 6) / 6) * 100);
  const badge = finished
    ? result.kind === 'invalid' ? ['Ditolak', 'tone-bad'] : result.kind === 'pending' ? ['Menunggu owner', 'tone-warn'] : result.kind === 'duplicate' ? ['Duplikat dikenali', 'tone-warn'] : ['Selesai', 'tone-good']
    : running ? ['Memproses…', 'tone-info'] : ['Siap', 'tone-info'];
  const levelColor = LEVEL_COLOR[shown?.level] || '#2E8A5E';
  const tiles = ['#DDF2F8|#0E5F75', '#E9EEF9|#2C467F', '#E7F4EC|#146C43'];

  return (
    <section id="demo" className="wrap" style={{ paddingTop: 72, paddingBottom: 72, display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div className="section-head">
        <span className="eyebrow">Demo interaktif</span>
        <h2 className="section-title">Coba sendiri dengan lima skenario</h2>
        <p className="section-sub">Pilih skenario, tekan Kirim pesanan, lalu lihat setiap tahap pemeriksaan. Pesanan diproses oleh sistem yang sebenarnya.</p>
      </div>

      <div role="group" aria-label="Pilih skenario" className="scenarios">
        {KEYS.map((k) => (
          <button key={k} type="button" className="scenario" aria-pressed={k === picked} onClick={() => pick(k)}>
            <span className={`scenario-icon ${S[k].tone}`}>{S[k].short}</span>
            <span className="scenario-text"><b>{S[k].label}</b><small>{S[k].hint}</small></span>
          </button>
        ))}
      </div>

      <div className="card demo-box">
        <div className="flow-head">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700 }}>Tahap pemeriksaan</div>
            <span className={`pill ${badge[1]}`}>{badge[0]}</span>
          </div>
          <div className="flow-steps">
            {STEP_NAMES.map((n, i) => {
              const st = flowState(i);
              return (
                <div key={n} className="flow-step">
                  <div className={`flow-dot ${st} ${st === 'active' ? 'so-pulse' : ''}`}><Icon name={STEP_ICONS[i]} size={20} /></div>
                  <b>{n}</b>
                  <small>{flowNote(i)}</small>
                </div>
              );
            })}
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={finished && result.kind === 'invalid'
              ? { background: 'var(--bad-mark)', width: '33%' }
              : { background: 'var(--grad)', width: pct + '%' }} />
          </div>
        </div>

        <div className="demo-panels">
          <div className="panel-order" aria-label="Pesanan">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h3 className="panel-title">Pesanan</h3>
              <span className="tag">{finished ? (!result.live ? 'Contoh' : result.orderId || (result.kind === 'invalid' ? 'Tidak tercatat' : 'Sudah tercatat')) : running ? 'Mengirim…' : 'Belum dikirim'}</span>
            </div>
            <div className="row" style={{ gap: 14 }}>
              <div className="avatar" style={{ width: 46, height: 46, background: '#DDF2F8', color: '#0E5F75' }}>{initials(cur.f.name)}</div>
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 700 }}>{cur.f.name}</span>
                <span style={{ fontSize: 13, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{cur.f.phone} · {cur.f.email}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, color: 'var(--ink-2)' }}>
              <Icon name="pin" color="#0E7490" style={{ marginTop: 3, flex: 'none' }} />
              <span>{cur.f.address}<span className="muted"> · {cur.f.city || 'kota kosong'}</span></span>
            </div>
            <div className="divider-top" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cur.f.items.length ? cur.f.items.map((it, i) => {
                const [bg, fg] = tiles[i % 3].split('|');
                return (
                  <div key={it.name} className="row">
                    <div className="item-tile" style={{ background: bg, color: fg }}>{it.qty}×</div>
                    <div className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600 }}>{it.name}</span>
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{it.qty} × {rp(it.price)}</span>
                    </div>
                    <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{rp(it.qty * it.price)}</div>
                  </div>
                );
              }) : <div style={{ border: '1px dashed #D3DCE2', borderRadius: 14, padding: 16, color: 'var(--muted)', textAlign: 'center' }}>Belum ada item</div>}
            </div>
            <div className="divider-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span className="tag">{cur.f.payment}</span>
              <span className="total">{rp(cur.f.total)}</span>
            </div>
            <button type="button" className="submit" onClick={submit} disabled={running}>
              {running ? <span className="spinner" /> : <Icon name="send" stroke={2.2} />}
              {running ? 'Memproses…' : 'Kirim pesanan'}
            </button>
            {siteKey && <div ref={widget} style={{ minHeight: 65 }} />}
            {notice && <div className={`notice ${notice.tone}`} role="status">{notice.text}</div>}
          </div>

          <div className="panel-result" aria-label="Hasil analisis" aria-live="polite">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h3 className="panel-title">Hasil</h3>
              {finished && <span className={`pill ${result.live ? 'tone-good' : 'tone-neutral'}`}>{result.live ? 'Langsung dari server' : 'Simulasi'}</span>}
            </div>

            {!finished && (
              <div className="result-idle">
                <div className={`idle-icon ${running ? 'so-pulse' : ''}`}><Icon name="spark" size={28} /></div>
                <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{running ? 'Pesanan sedang diperiksa…' : 'Belum ada hasil'}</div>
                <div style={{ maxWidth: 300 }}>{running
                  ? (step === AI_STEP ? 'AI sedang menilai pesanan. Biasanya beberapa detik.' : 'Lihat setiap tahap menyala di atas.')
                  : 'Tekan Kirim pesanan untuk melihat skor risiko, alasan, dan keputusan.'}</div>
              </div>
            )}

            {finished && result.kind === 'invalid' && (
              <div className="so-fade" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="row">
                  <div className="avatar tone-bad" style={{ width: 48, height: 48 }}><Icon name="x" size={22} stroke={2.2} /></div>
                  <div><div style={{ fontWeight: 800, fontSize: 18 }}>Ditolak sistem</div><div style={{ fontSize: 13, color: 'var(--muted)' }}>Data tidak lengkap, tidak diproses</div></div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {result.errors.map((e) => <div key={e} className="err-row"><Icon name="alert" size={16} stroke={2.2} />{e}</div>)}
                </div>
              </div>
            )}

            {finished && result.kind === 'duplicate' && (
              <div className="so-fade" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="row">
                  <div className="avatar tone-warn" style={{ width: 48, height: 48 }}><Icon name="copy" size={22} /></div>
                  <div><div style={{ fontWeight: 800, fontSize: 18 }}>Pesanan ganda dikenali</div><div style={{ fontSize: 13, color: 'var(--muted)' }}>Kiriman kedua tidak diproses ulang</div></div>
                </div>
                <p style={{ color: 'var(--ink-2)' }}>Pesanan yang sama masuk dua kali, misalnya karena pembeli menekan tombol kirim dua kali. Kiriman pertama diproses normal. Kiriman kedua hanya dicatat di audit log, tanpa dinilai ulang dan tanpa notifikasi ganda.</p>
              </div>
            )}

            {finished && (result.kind === 'ok' || result.kind === 'pending') && (
              <div className="so-fade" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                  <Ring value={shown.score} color={levelColor} label={`Skor risiko ${shown.score} dari 100`}>
                    <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1 }}>{shown.score}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{LEVEL_ID[shown.level]}</span>
                  </Ring>
                  <div style={{ flex: '1 1 180px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span className={`pill ${shown.kind === 'ok' ? 'tone-good' : 'tone-warn'}`} style={{ alignSelf: 'flex-start', fontSize: 15, padding: '6px 14px' }}>{shown.statusLabel}</span>
                    <div style={{ color: 'var(--ink-2)' }}>{shown.statusNote}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>Diputuskan oleh <strong style={{ color: 'var(--ink)' }}>{shown.decidedBy}</strong></div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>Kenapa skornya begini</div>
                  {shown.reasons.length ? shown.reasons.map((x) => (
                    <div key={x.text} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}><span>{x.text}</span><span style={{ fontWeight: 700 }}>{x.pts > 0 ? '+' : ''}{x.pts}</span></div>
                      <div className="bar-track"><div className="bar-fill" style={{ background: x.pts < 0 ? '#2E8A5E' : levelColor, width: Math.min(100, Math.round((Math.abs(x.pts) / 30) * 100)) + '%' }} /></div>
                    </div>
                  )) : <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--good)', fontWeight: 600 }}><Icon name="check" size={16} stroke={2.2} />Tidak ada tanda risiko</div>}
                </div>
                <div className="ai-box">
                  <div className="ai-icon"><Icon name="spark" /></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <div className="ai-title">AI · {shown.aiVerdict}</div>
                    <div className="ai-text">{shown.aiReason}</div>
                  </div>
                </div>
                <div className="chips">{shown.tags.map((t) => <span key={t} className="chip tone-neutral">{t}</span>)}</div>
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="live-note">Data pelanggan di demo ini adalah contoh. Pesanan demo masuk ke antrian admin dan tercatat di audit log.</p>
    </section>
  );
}
