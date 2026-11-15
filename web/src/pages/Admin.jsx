import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon, { Logo } from '../components/Icons.jsx';
import { Ring, Donut } from '../components/Charts.jsx';
import { api } from '../lib/api.js';
import { rp, rpShort, initials, palette, LEVEL_COLOR, LEVEL_TONE, LEVEL_ID, TRACK, VERDICT_ID, STATUS, byLabel, parseReason, time, confidence, paymentLabel } from '../lib/format.js';

const UNDO_SECONDS = 5;

// Data contoh untuk pengunjung yang belum login (bentuknya sama dengan balasan API)
const ago = (m) => new Date(Date.now() - m * 60000).toISOString();
const SAMPLE_ORDERS = [
  { id: 6, order_id: 'ORD-1006', customer_name: 'Budi Santoso', city: 'Pekanbaru', total: 230000, payment_method: 'transfer', items: [{ qty: 2, name: 'Kopi Arabika' }, { qty: 1, name: 'Gelas Kaca' }], risk_level: 'MEDIUM', risk_score: 30, status: 'PENDING_REVIEW', decided_by: 'system', created_at: ago(4),
    risk_reasons: ['Pesanan serupa (HP dan total sama) dalam 30 menit (+30)'], ai_verdict: 'APPROVE', ai_confidence: 0.9, ai_reason: 'Contoh: pola wajar. Tetap ke owner karena kemungkinan pesanan ganda.' },
  { id: 5, order_id: '#1005', customer_name: 'Sari Dewi', city: 'Pekanbaru', total: 320000, payment_method: 'card', items: [{ qty: 4, name: 'Kaos Polos Hitam' }], risk_level: 'LOW', risk_score: 0, status: 'APPROVED_AUTO', decided_by: 'rules', created_at: ago(5), risk_reasons: [] },
  { id: 3, order_id: 'ORD-1003', customer_name: 'asdf123', city: 'Jakarta', total: 2100000, payment_method: 'cod', items: [{ qty: 12, name: 'Power Bank 20.000 mAh' }], risk_level: 'HIGH', risk_score: 85, status: 'PENDING_REVIEW', decided_by: 'system', created_at: ago(6),
    risk_reasons: ['COD bernilai besar (+25)', 'Jumlah per item tidak wajar (+15)', 'Alamat terlalu pendek (+15)', 'Email sekali pakai (+15)', 'Nama pelanggan mencurigakan (+15)'], ai_verdict: 'REVIEW', ai_confidence: 0.74, ai_reason: 'Contoh: nama dan alamat tidak wajar, barang borongan dengan COD.' },
  { id: 2, order_id: 'ORD-1002', customer_name: 'Rina Wulandari', city: 'Dumai', total: 7350000, payment_method: 'cod', items: [{ qty: 1, name: 'Laptop 14 inci' }, { qty: 1, name: 'Mouse Wireless' }], risk_level: 'MEDIUM', risk_score: 55, status: 'APPROVED_AUTO', decided_by: 'ai', created_at: ago(7), risk_reasons: ['Nilai pesanan besar (+30)', 'COD bernilai besar (+25)'], ai_verdict: 'APPROVE', ai_confidence: 0.82 },
  { id: 1, order_id: 'ORD-1001', customer_name: 'Budi Santoso', city: 'Pekanbaru', total: 230000, payment_method: 'transfer', items: [{ qty: 2, name: 'Kopi Arabika' }, { qty: 1, name: 'Gelas Kaca' }], risk_level: 'LOW', risk_score: 0, status: 'APPROVED_AUTO', decided_by: 'rules', created_at: ago(8), risk_reasons: [] },
];
const SAMPLE_ACTIVITY = [
  { order_id: 'ORD-1006', action: 'PENDING_REVIEW', actor: 'system', created_at: ago(4) },
  { order_id: '#1005', action: 'APPROVED_AUTO', actor: 'rules', created_at: ago(5) },
  { order_id: 'ORD-1003', action: 'PENDING_REVIEW', actor: 'system', created_at: ago(6) },
  { order_id: 'ORD-1002', action: 'APPROVED_AUTO', actor: 'ai', created_at: ago(7) },
];

const ACTION_TEXT = {
  APPROVED_AUTO: 'disetujui otomatis', APPROVED_MANUAL: 'disetujui owner', PENDING_REVIEW: 'masuk antrian review',
  REJECTED: 'ditolak', DUPLICATE: 'terkirim ulang, diabaikan', INVALID: 'ditolak karena data rusak',
};
const DOT = { REJECTED: '#FB7185', INVALID: '#FB7185', PENDING_REVIEW: '#FBBF24', DUPLICATE: '#FBBF24', APPROVED_MANUAL: '#22D3EE' };

// Baris database -> bentuk untuk tampilan
function view(o) {
  const items = Array.isArray(o.items) ? o.items : [];
  return {
    dbId: o.id,
    id: o.order_id,
    source: o.source,
    customer: o.customer_name || '-',
    city: o.city || '-',
    amount: Number(o.total) || 0,
    total: rp(o.total),
    payment: paymentLabel(o.payment_method),
    items: items.map((i) => `${i.qty}× ${i.name}`).join(', ') || '-',
    level: o.risk_level || 'LOW',
    score: Number(o.risk_score) || 0,
    status: o.status,
    by: byLabel(o.decided_by),
    time: time(o.created_at),
    reasons: (o.risk_reasons || []).map(parseReason).map((r) => `${r.text} ${r.pts > 0 ? '+' : ''}${r.pts}`),
    ai: o.ai_verdict ? `${VERDICT_ID[o.ai_verdict] || o.ai_verdict} · yakin ${confidence(o.ai_confidence)}` : 'tidak dipanggil',
    aiReason: o.ai_reason || 'Risiko rendah, AI tidak dipanggil.',
  };
}

export default function Admin() {
  const [mode, setMode] = useState('loading'); // loading | live | demo
  const [email, setEmail] = useState('');
  const [rows, setRows] = useState([]);
  const [activity, setActivity] = useState([]);
  const [local, setLocal] = useState({}); // keputusan yang belum terkirim / mode demo: { [dbId]: status }
  const [localLog, setLocalLog] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState(null); // { text, error, undo }
  const [countdown, setCountdown] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [copied, setCopied] = useState(false);
  const pendingRef = useRef(null); // { order, decision, timer }
  const loginFailed = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('login') === 'gagal';

  const load = useCallback(async () => {
    const res = await api.orders().catch(() => ({ ok: false, status: 0, data: {} }));
    if (res.ok && res.data?.ok) {
      setRows(res.data.orders || []);
      setActivity(res.data.activity || []);
      setLoadError('');
    } else if (res.status === 401 || res.status === 0) {
      // Sesi login habis (Cloudflare Access mengalihkan ke halaman login)
      setLoadError('Sesi login habis. Klik "Masuk sebagai admin" untuk login lagi.');
    } else {
      setLoadError(res.data?.error || 'Data tidak bisa dimuat. Coba lagi beberapa saat.');
    }
  }, []);

  // Cek login admin. Belum login = mode demo dengan data contoh.
  useEffect(() => {
    api.me().then(({ ok, data }) => {
      if (ok && data?.ok) { setEmail(data.email); setMode('live'); load(); }
      else { setMode('demo'); setRows(SAMPLE_ORDERS); setActivity(SAMPLE_ACTIVITY); }
    }).catch(() => { setMode('demo'); setRows(SAMPLE_ORDERS); setActivity(SAMPLE_ACTIVITY); });
  }, [load]);

  // Muat ulang otomatis tiap 30 detik di mode live
  useEffect(() => {
    if (mode !== 'live') return;
    const t = setInterval(() => { if (!pendingRef.current) load(); }, 30000);
    return () => clearInterval(t);
  }, [mode, load]);

  useEffect(() => {
    if (!countdown) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const orders = useMemo(
    () => rows.map(view).map((o) => (local[o.dbId] ? { ...o, status: local[o.dbId], by: mode === 'live' ? byLabel('web:' + email) : 'kamu' } : o)),
    [rows, local, mode, email],
  );

  // Kirim keputusan ke server setelah jeda "Batalkan"
  async function commit(p) {
    clearTimeout(p.timer);
    pendingRef.current = null;
    setCountdown(0);
    if (mode !== 'live') { setToast(null); return; }
    const res = await api.decide(p.order.dbId, p.decision).catch(() => ({ ok: false, data: {} }));
    if (res.ok && res.data?.ok) {
      setToast({ text: `${p.order.id} tersimpan. Tercatat di audit log.` });
      await load();
      setLocal((l) => { const n = { ...l }; delete n[p.order.dbId]; return n; });
      setLocalLog((g) => g.filter((e) => e.key !== p.key));
    } else {
      setLocal((l) => { const n = { ...l }; delete n[p.order.dbId]; return n; });
      setLocalLog((g) => g.filter((e) => e.key !== p.key));
      setToast({ text: `${p.order.id} gagal disimpan: ${res.data?.error || 'server tidak membalas'}.`, error: true });
      load();
    }
  }

  function decide(order, decision) {
    if (pendingRef.current) commit(pendingRef.current); // keputusan sebelumnya langsung dikirim
    const status = decision === 'APPROVE' ? 'APPROVED_MANUAL' : 'REJECTED';
    const word = decision === 'APPROVE' ? 'disetujui' : 'ditolak';
    const key = Date.now();
    setLocal((l) => ({ ...l, [order.dbId]: status }));
    setLocalLog((g) => [{ key, order_id: order.id, action: status, actor: mode === 'live' ? 'web:' + email : 'kamu', created_at: new Date().toISOString() }, ...g]);
    const p = { order, decision, key };
    p.timer = setTimeout(() => commit(p), UNDO_SECONDS * 1000);
    pendingRef.current = p;
    setCountdown(mode === 'live' ? UNDO_SECONDS : 0);
    setToast({ text: `${order.id} ${word}.${mode === 'live' ? '' : ' (mode demo, tidak disimpan)'}`, undo: true });
  }

  function undo() {
    const p = pendingRef.current;
    if (p) {
      clearTimeout(p.timer);
      pendingRef.current = null;
      setLocal((l) => { const n = { ...l }; delete n[p.order.dbId]; return n; });
      setLocalLog((g) => g.filter((e) => e.key !== p.key));
    }
    setCountdown(0);
    setToast(null);
  }

  async function copyFormLink() {
    const link = window.location.origin + '/pesan';
    try { await navigator.clipboard.writeText(link); } catch { window.prompt('Salin link form pesanan:', link); return; }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const q = query.trim().toLowerCase();
  const match = (o) => !q || o.id.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q);
  const queue = orders.filter((o) => o.status === 'PENDING_REVIEW' && match(o)).sort((a, b) => b.score - a.score);
  const table = orders.filter((o) => match(o) && (filter === 'ALL' || (filter === 'APPROVED' ? o.status.startsWith('APPROVED') : o.status === filter)));
  const cnt = (s) => orders.filter((o) => o.status === s).length;
  const total = orders.length;
  const auto = cnt('APPROVED_AUTO'), am = cnt('APPROVED_MANUAL'), pend = cnt('PENDING_REVIEW'), rej = cnt('REJECTED');
  const value = orders.filter((o) => o.status.startsWith('APPROVED')).reduce((a, o) => a + o.amount, 0);
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  const feed = [...localLog, ...activity].slice(0, 8);
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

  if (mode === 'loading') {
    return <div className="gate neon"><div className="skeleton" style={{ width: 320, height: 160 }} /></div>;
  }

  const C22 = 2 * Math.PI * 22;
  return (
    <div className="admin neon">
      <aside className="side" aria-label="Navigasi admin">
        <Logo sub="Admin Center" href="/" />
        <nav className="side-nav">
          <span className="side-label">Menu</span>
          <a href="#ringkasan" aria-current="page"><Icon name="grid" /><span>Ringkasan</span></a>
          <a href="#antrian"><Icon name="clock" /><span>Antrian review</span>{pend > 0 && <span className="count-badge">{pend}</span>}</a>
          <a href="#semua"><Icon name="list" /><span>Semua pesanan</span></a>
          <a href="#aktivitas"><Icon name="activity" /><span>Aktivitas</span></a>
        </nav>
        <div className="side-extra">
          {mode === 'demo' ? (
            <div className="demo-card">
              <span style={{ fontWeight: 700 }}>Mode demo</span>
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Kamu melihat data contoh. Keputusan tidak disimpan.</span>
              <a href="/api/admin/login">Masuk sebagai admin</a>
            </div>
          ) : (
            <div className="demo-card">
              <span style={{ fontWeight: 700 }}>Link form pesanan</span>
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Bagikan di WhatsApp atau bio Instagram. Pesanan yang masuk langsung diperiksa.</span>
              <button type="button" onClick={copyFormLink}>{copied ? 'Link disalin' : 'Salin link'}</button>
            </div>
          )}
        </div>
      </aside>

      <div className="admin-main">
        <div className="topbar">
          <div className="topbar-in">
            <div className="crumbs"><span>Dashboard</span><span aria-hidden="true">/</span><b>Ringkasan</b></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <label className="search">
                <Icon name="search" size={16} />
                <input type="search" aria-label="Cari pesanan" placeholder="Cari pesanan atau pelanggan" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              <a className="icon-btn" href="#antrian" aria-label={`${pend} pesanan menunggu keputusan`}><Icon name="bell" />{pend > 0 && <span className="dot" />}</a>
              {mode === 'live' && <button type="button" className="icon-btn" aria-label="Muat ulang" onClick={load}><Icon name="refresh" /></button>}
              <div className="who">
                <div className="avatar" style={{ width: 38, height: 38, fontSize: 14, background: 'rgba(34,211,238,.14)', color: '#67E8F9', border: '1px solid rgba(34,211,238,.5)' }}>{mode === 'live' ? initials(email.split('@')[0]) : 'D'}</div>
                <div className="who-name hide-sm">
                  <b>{mode === 'live' ? email : 'Pengunjung'}</b>
                  {mode === 'live' ? <a href="/cdn-cgi/access/logout" style={{ fontSize: 11 }}>Keluar</a> : <small>mode demo</small>}
                </div>
              </div>
            </div>
          </div>
        </div>

        <main className="admin-content" id="ringkasan">
          {mode === 'demo' && (
            <div className="notice tone-info" role="note" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px' }}>
              <span>{loginFailed ? 'Login admin gagal atau Cloudflare Access belum diatur. ' : ''}Ini mode demo dengan data contoh. Coba tekan Approve atau Reject.</span>
              <a className="btn" href="/api/admin/login" style={{ height: 36 }}>Masuk sebagai admin</a>
            </div>
          )}
          {loadError && (
            <div className="notice tone-bad" role="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span>{loadError}</span>
              <a className="btn" href="/api/admin/login" style={{ height: 36 }}>Masuk sebagai admin</a>
            </div>
          )}

          <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 14, color: 'var(--muted)', textTransform: 'capitalize' }}>{today}</div>
              <h1 style={{ fontSize: 'clamp(26px, 6vw, 34px)', fontWeight: 800, letterSpacing: '-.03em' }}>Selamat datang <span className="grad-text">kembali</span></h1>
            </div>
            <span className={`pill ${pend ? 'tone-warn' : 'tone-good'}`} style={{ fontSize: 14, padding: '8px 14px' }}>
              {pend ? `${pend} pesanan menunggu keputusanmu` : 'Semua pesanan sudah diputuskan'}
            </span>
          </section>

          <section aria-label="Ringkasan" className="kpis">
            <Kpi title="Menunggu review" icon="clock" tone="tone-warn" value={pend} bar={pct(pend)} color="#FBBF24" />
            <Kpi title="Disetujui otomatis" icon="spark" tone="tone-good" value={<>{auto} <span style={{ fontSize: 16, color: 'var(--muted)', fontWeight: 600 }}>{pct(auto)}%</span></>} bar={pct(auto)} color="#34D399" />
            <Kpi title="Diputuskan owner" icon="user" tone="tone-info" value={am + rej} bar={pct(am + rej)} color="#22D3EE" />
            <div className="kpi dark">
              <div className="kpi-head"><span>Nilai disetujui</span><div className="kpi-icon" style={{ background: 'rgba(34,211,238,.12)', color: '#67E8F9' }}><Icon name="trend" /></div></div>
              <span style={{ fontSize: 'clamp(18px, 4vw, 30px)', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.1, whiteSpace: 'nowrap' }} title={rp(value)}>{value >= 10_000_000 ? rpShort(value) : rp(value)}</span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>dari {total} pesanan</span>
            </div>
          </section>

          {toast && (
            <div role="status" className={`toast so-fade ${toast.error ? 'error' : ''}`}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name={toast.error ? 'alert' : 'check'} stroke={2.2} color={toast.error ? '#FDA4AF' : '#6EE7B7'} />{toast.text}
              </span>
              {toast.undo && pendingRef.current
                ? <button type="button" onClick={undo}>Batalkan{countdown ? ` (${countdown})` : ''}</button>
                : <button type="button" onClick={() => setToast(null)} aria-label="Tutup">Tutup</button>}
            </div>
          )}

          <div className="two-col">
            <section id="antrian" aria-label="Antrian review" className="queue">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>Perlu keputusan</h2>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Risiko tertinggi di atas</span>
              </div>
              {queue.length === 0 && (
                <div className="card empty so-fade">
                  <div className="empty-icon tone-good"><Icon name="check" size={28} stroke={2.2} /></div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{q ? 'Tidak ada yang cocok' : 'Semua beres'}</div>
                  <div className="muted">{q ? 'Coba kata kunci lain.' : 'Tidak ada pesanan yang menunggu keputusan.'}</div>
                </div>
              )}
              {queue.map((o) => {
                const [bg, fg] = palette(o.customer);
                const chip = LEVEL_TONE[o.level];
                return (
                  <article key={o.dbId} className="card qcard so-fade">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div className="avatar" style={{ width: 48, height: 48, background: bg, color: fg }}>{initials(o.customer)}</div>
                      <div style={{ flex: '1 1 0', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: 17 }}>{o.customer}</span>
                          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{o.id} · {o.time}</span>
                          <span className={`pill ${chip}`}>Risiko {LEVEL_ID[o.level].toLowerCase()}</span>
                        </div>
                        <div style={{ fontSize: 14, color: 'var(--ink-2)' }}>{o.items}</div>
                      </div>
                      <Ring size={56} r={22} stroke={6} value={o.score} color={LEVEL_COLOR[o.level]} track={TRACK} label={`Skor risiko ${o.score}`}>
                        <span style={{ fontWeight: 800, fontSize: 15 }}>{o.score}</span>
                      </Ring>
                    </div>
                    <div className="facts facts-3">
                      <div><small>Total</small><b style={{ fontWeight: 800 }}>{o.total}</b></div>
                      <div><small>Bayar</small><b>{o.payment}</b></div>
                      <div><small>Kirim ke</small><b>{o.city}</b></div>
                    </div>
                    {o.reasons.length > 0 && <div className="chips">{o.reasons.map((x) => <span key={x} className={`chip ${chip}`} style={{ padding: '5px 10px' }}>{x}</span>)}</div>}
                    <div className="ai-box" style={{ padding: '12px 14px' }}>
                      <div className="ai-icon" style={{ width: 32, height: 32, color: 'var(--teal)' }}><Icon name="spark" size={16} /></div>
                      <div style={{ minWidth: 0 }}><div className="ai-title">AI · {o.ai}</div><div className="ai-text">{o.aiReason}</div></div>
                    </div>
                    <div className="decide">
                      <button type="button" className="btn-reject" onClick={() => decide(o, 'REJECT')}><Icon name="x" size={16} stroke={2.4} />Reject</button>
                      <button type="button" className="btn-approve" onClick={() => decide(o, 'APPROVE')}><Icon name="check" size={16} stroke={2.4} />Approve</button>
                    </div>
                  </article>
                );
              })}
            </section>

            <aside className="side-col">
              <div className="card box">
                <h2>Status pesanan</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                  <Donut total={total} label="Distribusi status pesanan"
                    segments={[{ value: auto, color: STATUS.APPROVED_AUTO.color }, { value: am, color: STATUS.APPROVED_MANUAL.color }, { value: pend, color: STATUS.PENDING_REVIEW.color }, { value: rej, color: STATUS.REJECTED.color }]} />
                  <div className="legend" style={{ gap: 8 }}>
                    <div><i style={{ background: STATUS.APPROVED_AUTO.color }} />Otomatis <strong>{auto}</strong></div>
                    <div><i style={{ background: STATUS.APPROVED_MANUAL.color }} />Disetujui owner <strong>{am}</strong></div>
                    <div><i style={{ background: STATUS.PENDING_REVIEW.color }} />Menunggu <strong>{pend}</strong></div>
                    <div><i style={{ background: STATUS.REJECTED.color }} />Ditolak <strong>{rej}</strong></div>
                  </div>
                </div>
              </div>
              <div className="card box" id="aktivitas">
                <h2>Aktivitas</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {feed.length === 0 && <span className="muted">Belum ada aktivitas.</span>}
                  {feed.map((e, i) => (
                    <div key={(e.key || e.created_at) + e.order_id + i} className="feed-item so-fade">
                      <div className="feed-dot" style={{ background: DOT[e.action] || '#34D399', boxShadow: `0 0 8px ${DOT[e.action] || '#34D399'}` }} />
                      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 14 }}><strong>{e.order_id}</strong> {ACTION_TEXT[e.action] || e.action.toLowerCase()}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{byLabel(e.actor)} · {time(e.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>

          <section id="semua" aria-label="Semua pesanan" className="card box" style={{ gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 20 }}>Semua pesanan</h2>
              <div role="group" aria-label="Filter status" className="filters">
                {[['ALL', 'Semua'], ['PENDING_REVIEW', 'Menunggu'], ['APPROVED', 'Disetujui'], ['REJECTED', 'Ditolak']].map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="table-wrap">
              <table className="orders">
                <thead><tr><th>Pelanggan</th><th>Pesanan</th><th style={{ textAlign: 'right' }}>Total</th><th>Risiko</th><th>Status</th><th>Oleh</th></tr></thead>
                <tbody>
                  {table.length === 0 && <tr className="tr-empty"><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 28 }}>Tidak ada pesanan.</td></tr>}
                  {table.map((o) => {
                    const [bg, fg] = palette(o.customer);
                    const st = STATUS[o.status] || { label: o.status, tone: 'tone-neutral' };
                    return (
                      <tr key={o.dbId}>
                        <td><div className="row" style={{ gap: 10 }}><div className="avatar" style={{ width: 32, height: 32, fontSize: 12, background: bg, color: fg }}>{initials(o.customer)}</div><span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{o.customer}</span></div></td>
                        <td className="td-order"><span>{o.items}</span><small>{o.id} · {o.time}</small></td>
                        <td className="num">{o.total}</td>
                        <td className="td-risk"><div className="row" style={{ gap: 8 }}><div style={{ width: 56, height: 6, borderRadius: 999, background: TRACK, overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 999, background: LEVEL_COLOR[o.level], width: Math.max(4, Math.min(100, o.score)) + '%' }} /></div><span style={{ fontSize: 13, fontWeight: 600 }}>{o.score}</span><span className="lvl">{LEVEL_ID[o.level]}</span></div></td>
                        <td><span className={`pill ${st.tone}`}>{st.label}</span></td>
                        <td className="td-by">{o.by}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function Kpi({ title, icon, tone, value, bar, color }) {
  return (
    <div className="card kpi">
      <div className="kpi-head"><span>{title}</span><div className={`kpi-icon ${tone}`}><Icon name={icon} /></div></div>
      <span className="kpi-value">{value}</span>
      <div style={{ height: 6, borderRadius: 999, background: TRACK, overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 999, background: color, width: bar + '%', transition: 'width .4s ease' }} /></div>
    </div>
  );
}
