import { useEffect, useState } from 'react';
import Icon, { Logo } from '../components/Icons.jsx';
import Demo from '../components/Demo.jsx';
import { Donut, Bar } from '../components/Charts.jsx';
import { api } from '../lib/api.js';

const FEATURES = [
  ['checkbox', 'Validasi dan cek pesanan ganda', 'Nomor HP, alamat, item, dan total dicek sebelum diproses. Pesanan yang terkirim dua kali dikenali dan tidak diproses ulang.'],
  ['gauge', 'Skor risiko transparan', '12 aturan pasti memberi poin. Setiap skor disertai alasan yang bisa dibaca, jadi kamu tahu kenapa pesanan ditahan.'],
  ['spark', 'AI hanya saat perlu', 'Pesanan berisiko rendah langsung diputuskan aturan. AI hanya dipanggil untuk kasus janggal, jadi cepat dan hemat biaya.'],
  ['user', 'Owner tetap memegang kendali', 'AI tidak pernah menolak pesanan sendiri. Pesanan berisiko tinggi selalu menunggu Approve atau Reject dari owner.'],
  ['doc', 'Audit log dan laporan', 'Setiap keputusan tercatat lengkap dengan siapa dan kapan. Notifikasi pesanan berisiko dan ringkasan harian dikirim ke Telegram.'],
  ['send', 'Form untuk WhatsApp & Instagram', 'Jualan lewat chat? Bagikan link form pesanan. Pesanan dari WhatsApp dan Instagram ikut diperiksa otomatis.'],
];
const STEPS = [
  ['Pesanan masuk', 'Dari website, Shopify, atau form pesanan yang dibagikan di WhatsApp dan Instagram.'],
  ['Dicek dan dinilai', 'Data pesanan divalidasi, riwayat pelanggan dicek, lalu skor risiko dihitung dari aturan pasti.'],
  ['AI untuk yang janggal', 'Hanya pesanan berisiko sedang dan tinggi yang dinilai AI, tanpa nama, nomor HP, email, dan alamat.'],
  ['Keputusan', 'Pesanan aman disetujui otomatis. Yang berisiko menunggu keputusanmu di dashboard admin.'],
];
// Dipakai kalau statistik server belum bisa diambil
const SAMPLE = { total: 5, auto_approved: 3, approved_manual: 1, pending: 1, rejected: 0, risk_low: 2, risk_medium: 2, risk_high: 1 };

function useStats() {
  const [state, setState] = useState({ stats: SAMPLE, live: false });
  useEffect(() => {
    api.stats().then(({ ok, data }) => {
      if (ok && data?.stats && data.stats.total > 0) setState({ stats: data.stats, live: true });
    }).catch(() => {});
  }, []);
  return state;
}

export default function Landing() {
  const { stats, live } = useStats();
  const pct = (n) => (stats.total ? Math.round((n / stats.total) * 100) : 0);
  const riskMax = Math.max(1, stats.risk_low + stats.risk_medium + stats.risk_high);

  return (
    <div className="neon" style={{ position: 'relative', overflowX: 'clip' }}>
      <header className="site-header">
        <div className="wrap">
          <Logo href="#atas" />
          <nav className="nav" aria-label="Utama">
            <a href="#fitur">Fitur</a><a href="#cara-kerja">Cara kerja</a><a href="#demo">Demo</a><a href="#statistik">Statistik</a>
          </nav>
          <div className="header-actions">
            <a className="btn hide-sm" href="/admin">Masuk admin</a>
            <a className="btn btn-primary" href="#demo">Coba demo</a>
          </div>
        </div>
      </header>

      <section id="atas" className="hero">
        <div className="glow" aria-hidden="true" style={{ width: 640, height: 640, right: -140, top: -220, background: 'radial-gradient(circle, rgba(34,211,238,.20) 0%, rgba(5,8,15,0) 68%)' }} />
        <div className="glow" aria-hidden="true" style={{ width: 520, height: 520, left: '38%', top: 220, background: 'radial-gradient(circle, rgba(167,139,250,.16) 0%, rgba(5,8,15,0) 68%)' }} />
        <div className="wrap">
          <div className="hero-copy">
            <span className="badge-new"><i aria-hidden="true" />AI agent untuk toko online</span>
            <h1>Pesanan aman diproses, <span className="grad-text">tanpa cek manual satu per satu.</span></h1>
            <p className="hero-lead">Smart Order menilai risiko setiap pesanan dengan aturan yang bisa dijelaskan, meminta pendapat AI hanya untuk yang janggal, dan menyerahkan keputusan akhir pesanan berisiko kepada pemilik toko.</p>
            <div className="hero-cta">
              <a className="btn btn-primary btn-lg" href="#demo">Coba demo interaktif <Icon name="arrow" stroke={2.2} /></a>
              <a className="btn btn-lg" href="/pesan"><Icon name="send" />Lihat form pesanan</a>
            </div>
            <div className="checks">
              <span><Icon name="check" size={16} stroke={2.4} color="#34D399" />Data pribadi tidak dikirim ke AI</span>
              <span><Icon name="check" size={16} stroke={2.4} color="#34D399" />Setiap keputusan tercatat</span>
            </div>
          </div>

          <div className="hero-shot" aria-hidden="true">
            <div className="browser">
              <div className="browser-bar">
                <i style={{ background: '#FB7185' }} /><i style={{ background: '#FBBF24' }} /><i style={{ background: '#34D399' }} />
                <span className="browser-url">Dashboard admin</span>
              </div>
              <div className="browser-body">
                <div className="mini-stats">
                  <div className="mini-stat"><div>Otomatis</div><div>60%</div></div>
                  <div className="mini-stat"><div>Menunggu</div><div>2</div></div>
                  <div className="mini-stat"><div>Disetujui</div><div>Rp7,9 jt</div></div>
                </div>
                <div className="mini-order warn">
                  <div className="row">
                    <span className="avatar" style={{ width: 40, height: 40, fontSize: 14, background: 'rgba(251,191,36,.12)', color: '#FCD34D', border: '1px solid rgba(251,191,36,.5)' }}>AP</span>
                    <div className="grow"><div className="mini-name">Andi Pratama · ORD-1003</div><div className="mini-sub">12× Power Bank · COD · Rp2.100.000</div></div>
                    <span className="pill tone-warn">Sedang · 55</span>
                  </div>
                  <div className="chips">
                    <span className="chip tone-warn">COD besar +25</span><span className="chip tone-warn">Borongan +15</span><span className="chip tone-warn">Email sekali pakai +15</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span className="fake-btn" style={{ flex: 1, border: '1px solid var(--line-2)', color: 'var(--bad)' }}>Reject</span>
                    <span className="fake-btn" style={{ flex: 2, background: 'var(--grad)', color: '#04131A' }}>Approve</span>
                  </div>
                </div>
                <div className="mini-order" style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <span className="avatar" style={{ width: 40, height: 40, fontSize: 14, background: 'rgba(52,211,153,.12)', color: '#6EE7B7', border: '1px solid rgba(52,211,153,.5)' }}>SD</span>
                  <div className="grow"><div className="mini-name">Sari Dewi · #1005</div><div className="mini-sub">4× Kaos Polos Hitam · Rp320.000</div></div>
                  <span className="pill tone-good">Otomatis</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="tech" aria-label="Sumber pesanan" style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="wrap">
          <span className="tech-label">Pesanan dari</span>
          {['Website sendiri', 'Shopify', 'WhatsApp', 'Instagram'].map((t) => <span key={t} className="tech-name">{t}</span>)}
        </div>
      </section>

      <section className="wrap" aria-label="Angka utama" style={{ paddingTop: 64, paddingBottom: 24 }}>
        <div className="numbers">
          {[['12', 'aturan risiko yang bisa dijelaskan'], ['3', 'level risiko: rendah, sedang, tinggi'], ['0', 'data pribadi dikirim ke AI'], ['100%', 'keputusan tercatat di audit log']].map(([n, t]) => (
            <div key={t}><div className="big grad-text">{n}</div><div className="muted">{t}</div></div>
          ))}
        </div>
      </section>

      <section id="fitur" className="wrap" style={{ paddingTop: 72, paddingBottom: 72, display: 'flex', flexDirection: 'column', gap: 40 }}>
        <div className="section-head">
          <span className="eyebrow">Fitur</span>
          <h2 className="section-title" style={{ maxWidth: 680 }}>Semua yang dibutuhkan untuk memeriksa pesanan</h2>
          <p className="section-sub">Dari pesanan masuk sampai keputusan akhir, setiap langkah otomatis, tercatat, dan bisa dijelaskan.</p>
        </div>
        <div className="features">
          {FEATURES.map(([icon, title, text]) => (
            <div key={title} className="card feature">
              <span className="feature-icon"><Icon name={icon} size={22} /></span>
              <h3>{title}</h3>
              <p className="muted">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="cara-kerja" style={{ background: 'var(--soft)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap" style={{ paddingTop: 72, paddingBottom: 72, display: 'flex', flexDirection: 'column', gap: 40 }}>
          <div className="section-head">
            <span className="eyebrow">Cara kerja</span>
            <h2 className="section-title">Empat langkah, hitungan detik</h2>
          </div>
          <div className="steps">
            {STEPS.map(([title, text], i) => (
              <div key={title} className="step">
                <span className={`step-num ${i === STEPS.length - 1 ? 'last' : ''}`}>{i + 1}</span>
                <h3>{title}</h3>
                <p className="muted">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Demo />

      <section id="statistik" className="wrap" style={{ paddingTop: 8, paddingBottom: 72, display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="eyebrow">Statistik</span>
            <h2 style={{ fontSize: 'clamp(26px, 5vw, 32px)', fontWeight: 800, letterSpacing: '-.03em' }}>{live ? 'Hasil 30 hari terakhir' : 'Contoh statistik'}</h2>
          </div>
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>{stats.total} pesanan · tanpa data pribadi</span>
        </div>
        <div className="stat-cards">
          <div className="card stat-card">
            <h3 style={{ fontSize: 17, fontWeight: 700 }}>Status pesanan</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
              <Donut size={150} r={54} stroke={18} total={stats.total}
                label={`${stats.auto_approved} otomatis, ${stats.approved_manual} disetujui owner, ${stats.pending} menunggu, ${stats.rejected} ditolak`}
                segments={[{ value: stats.auto_approved, color: '#34D399' }, { value: stats.approved_manual, color: '#22D3EE' }, { value: stats.pending, color: '#FBBF24' }, { value: stats.rejected, color: '#FB7185' }]} />
              <div className="legend">
                <div><i style={{ background: '#34D399' }} />Disetujui otomatis <strong>{stats.auto_approved} · {pct(stats.auto_approved)}%</strong></div>
                <div><i style={{ background: '#22D3EE' }} />Disetujui owner <strong>{stats.approved_manual}</strong></div>
                <div><i style={{ background: '#FBBF24' }} />Menunggu <strong>{stats.pending}</strong></div>
                <div><i style={{ background: '#FB7185' }} />Ditolak <strong>{stats.rejected}</strong></div>
              </div>
            </div>
          </div>
          <div className="card stat-card">
            <h3 style={{ fontSize: 17, fontWeight: 700 }}>Level risiko</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[['Rendah', stats.risk_low, '#34D399'], ['Sedang', stats.risk_medium, '#FBBF24'], ['Tinggi', stats.risk_high, '#FB7185']].map(([l, n, c]) => (
                <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>{l}</span><strong>{n}</strong></div>
                  <Bar value={n} max={riskMax} color={c} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="wrap" aria-label="Ajakan" style={{ paddingBottom: 72 }}>
        <div className="cta">
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 620 }}>
            <h2>Berhenti cek pesanan satu per satu</h2>
            <p style={{ fontSize: 17, color: 'var(--ink-2)' }}>Biarkan Smart Order menyaring pesanan, dan fokuslah pada yang benar-benar perlu keputusanmu.</p>
          </div>
          <div style={{ position: 'relative', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a className="btn btn-primary btn-lg" href="#demo">Coba demo</a>
            <a className="btn btn-lg" href="/admin">Lihat dashboard</a>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="wrap">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 40, justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320 }}>
              <Logo href="#atas" />
              <p style={{ color: 'var(--muted)', fontSize: 14 }}>AI agent yang memeriksa setiap pesanan toko online sebelum diproses.</p>
            </div>
            <div className="footer-cols">
              <div><span style={{ fontWeight: 700 }}>Produk</span><a href="#fitur">Fitur</a><a href="#cara-kerja">Cara kerja</a><a href="#demo">Demo</a></div>
              <div><span style={{ fontWeight: 700 }}>Untuk penjual</span><a href="/pesan">Form pesanan</a><a href="/admin">Dashboard admin</a></div>
              <div><span style={{ fontWeight: 700 }}>Keamanan</span><span className="f">Data pribadi tidak ke AI</span><span className="f">Login admin dengan OTP</span></div>
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 20, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 13, color: 'var(--muted)' }}>
            <span>© {new Date().getFullYear()} Smart Order</span>
            <span>Pesanan pada demo memakai data contoh.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
