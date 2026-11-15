import { useEffect, useRef, useState } from 'react';
import Icon, { Logo } from '../components/Icons.jsx';
import { api, loadTurnstile } from '../lib/api.js';
import { rp } from '../lib/format.js';

// Form pesanan untuk pembeli. Penjual membagikan link /pesan di WhatsApp atau Instagram.
// Setiap pesanan langsung diperiksa Smart Order (validasi, cek duplikat, skor risiko, AI).

const EMPTY = { name: '', phone: '', email: '', address: '', city: '', postal_code: '', notes: '', payment_method: '' };

export default function OrderForm() {
  const [catalog, setCatalog] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [qty, setQty] = useState({});
  const [errors, setErrors] = useState([]);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);
  const [siteKey, setSiteKey] = useState(null);
  const [token, setToken] = useState('');
  const widget = useRef(null);
  const widgetId = useRef(null);

  useEffect(() => {
    api.catalog().then(({ ok, data }) => setCatalog(ok ? data : { error: true })).catch(() => setCatalog({ error: true }));
    api.config().then(({ data }) => data?.turnstileSiteKey && setSiteKey(data.turnstileSiteKey)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!siteKey || !widget.current || widgetId.current != null) return;
    widgetId.current = 'loading';
    loadTurnstile().then((t) => {
      widgetId.current = t.render(widget.current, {
        sitekey: siteKey, theme: 'light', size: 'flexible',
        callback: setToken, 'expired-callback': () => setToken(''), 'error-callback': () => setToken(''),
      });
    }).catch(() => {});
  }, [siteKey, catalog]);

  const products = catalog?.products || [];
  const maxQty = catalog?.maxQty || 50;
  const chosen = products.filter((p) => qty[p.sku] > 0);
  const total = chosen.reduce((a, p) => a + p.price * qty[p.sku], 0);
  const set = (k) => (e) => { setErrors([]); setForm((f) => ({ ...f, [k]: e.target.value })); };
  const bump = (sku, d) => { setErrors([]); setQty((q) => ({ ...q, [sku]: Math.max(0, Math.min(maxQty, (q[sku] || 0) + d)) })); };

  function check() {
    const e = [];
    if (form.name.trim().length < 2) e.push('Nama penerima belum diisi');
    if (form.phone.replace(/\D/g, '').length < 9) e.push('Nomor WhatsApp belum benar');
    if (form.address.trim().length < 10) e.push('Alamat lengkap belum diisi');
    if (!form.city.trim()) e.push('Kota belum diisi');
    if (!chosen.length) e.push('Pilih minimal satu produk');
    if (!form.payment_method) e.push('Pilih metode pembayaran');
    return e;
  }

  async function submit(ev) {
    ev.preventDefault();
    const e = check();
    setErrors(e);
    if (e.length) return;
    if (siteKey && !token) { setErrors(['Tunggu verifikasi anti-bot selesai, lalu kirim lagi.']); return; }
    setSending(true);
    const res = await api.placeOrder({
      ...form,
      items: chosen.map((p) => ({ sku: p.sku, qty: qty[p.sku] })),
      turnstileToken: token,
    }).catch(() => ({ ok: false, status: 0, data: {} }));
    setSending(false);
    if (siteKey && window.turnstile && widgetId.current != null && widgetId.current !== 'loading') { window.turnstile.reset(widgetId.current); setToken(''); }
    if (res.ok && res.data?.ok) { setDone(res.data); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setErrors(res.data?.errors || [res.data?.error || 'Pesanan belum bisa dikirim. Periksa koneksi lalu coba lagi.']);
  }

  const reset = () => { setDone(null); setForm(EMPTY); setQty({}); setErrors([]); };

  return (
    <div className="order-page">
      <header className="site-header">
        <div className="wrap" style={{ maxWidth: 1040 }}>
          <Logo href="/" />
          <span className="pill tone-info" style={{ fontSize: 13 }}><Icon name="shield" size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />Pesanan diperiksa otomatis</span>
        </div>
      </header>

      <main className="wrap" style={{ maxWidth: 1040, paddingTop: 40, paddingBottom: 72 }}>
        {done ? (
          <div className="card order-done so-fade">
            <div className={`empty-icon ${done.state === 'review' ? 'tone-warn' : 'tone-good'}`}><Icon name={done.state === 'review' ? 'clock' : 'check'} size={30} stroke={2.2} /></div>
            <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em' }}>
              {done.state === 'confirmed' ? 'Pesanan dikonfirmasi' : done.state === 'duplicate' ? 'Pesanan sudah kami terima' : 'Pesanan diterima'}
            </h1>
            <p className="muted" style={{ maxWidth: 460 }}>
              {done.state === 'confirmed'
                ? 'Terima kasih! Pesananmu sudah dikonfirmasi dan akan segera diproses.'
                : done.state === 'duplicate'
                  ? 'Pesanan yang sama sudah tercatat sebelumnya, jadi tidak dibuat dua kali.'
                  : 'Terima kasih! Penjual akan memeriksa pesananmu dan menghubungi lewat WhatsApp untuk konfirmasi.'}
            </p>
            <div className="facts" style={{ width: '100%', maxWidth: 420 }}>
              <div><small>Nomor pesanan</small><b>{done.order_id}</b></div>
              <div><small>Total</small><b>{rp(done.total)}</b></div>
            </div>
            <button type="button" className="btn" onClick={reset}>Buat pesanan lain</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="order-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
              <div>
                <span className="eyebrow">{catalog?.store?.name || 'Form pesanan'}</span>
                <h1 style={{ fontSize: 'clamp(28px, 5vw, 36px)', fontWeight: 800, letterSpacing: '-.03em', marginTop: 6 }}>Form pesanan</h1>
                <p className="muted">{catalog?.store?.tagline ? catalog.store.tagline + '. ' : ''}Isi data di bawah, pesanan langsung tercatat tanpa perlu chat panjang.</p>
              </div>

              <section className="card order-section" aria-labelledby="produk">
                <h2 id="produk">1. Pilih produk</h2>
                {!catalog && <div className="skeleton" style={{ height: 160 }} />}
                {catalog?.error && <div className="notice tone-bad">Daftar produk belum bisa dimuat. Muat ulang halaman.</div>}
                {products.map((p) => (
                  <div key={p.sku} className="product-row">
                    <div className="grow"><div style={{ fontWeight: 700 }}>{p.name}</div><div className="muted" style={{ fontSize: 14 }}>{rp(p.price)}</div></div>
                    <div className="stepper" role="group" aria-label={`Jumlah ${p.name}`}>
                      <button type="button" onClick={() => bump(p.sku, -1)} aria-label={`Kurangi ${p.name}`} disabled={!qty[p.sku]}>−</button>
                      <span aria-live="polite">{qty[p.sku] || 0}</span>
                      <button type="button" onClick={() => bump(p.sku, 1)} aria-label={`Tambah ${p.name}`}>+</button>
                    </div>
                  </div>
                ))}
              </section>

              <section className="card order-section" aria-labelledby="penerima">
                <h2 id="penerima">2. Data penerima</h2>
                <div className="field-grid">
                  <Field label="Nama penerima" required><input value={form.name} onChange={set('name')} autoComplete="name" maxLength={80} /></Field>
                  <Field label="Nomor WhatsApp" required><input value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder="08xxxxxxxxxx" maxLength={20} /></Field>
                  <Field label="Email" hint="opsional" wide><input type="email" value={form.email} onChange={set('email')} autoComplete="email" maxLength={120} /></Field>
                  <Field label="Alamat lengkap" required wide><textarea value={form.address} onChange={set('address')} autoComplete="street-address" rows={3} maxLength={300} placeholder="Nama jalan, nomor rumah, RT/RW, kelurahan" /></Field>
                  <Field label="Kota" required><input value={form.city} onChange={set('city')} autoComplete="address-level2" maxLength={80} /></Field>
                  <Field label="Kode pos" hint="opsional"><input value={form.postal_code} onChange={set('postal_code')} inputMode="numeric" autoComplete="postal-code" maxLength={10} /></Field>
                  <Field label="Catatan" hint="opsional" wide><input value={form.notes} onChange={set('notes')} maxLength={300} placeholder="Contoh: titip ke satpam" /></Field>
                </div>
              </section>

              <section className="card order-section" aria-labelledby="bayar">
                <h2 id="bayar">3. Pembayaran</h2>
                <div className="pay-options" role="radiogroup" aria-labelledby="bayar">
                  {(catalog?.store?.payments || []).map((pm) => (
                    <label key={pm.id} className="pay-option">
                      <input type="radio" name="payment" value={pm.id} checked={form.payment_method === pm.id} onChange={set('payment_method')} />
                      <span>{pm.label}</span>
                    </label>
                  ))}
                </div>
              </section>
            </div>

            <aside className="card order-summary">
              <h2 style={{ fontSize: 18, fontWeight: 800 }}>Ringkasan</h2>
              {chosen.length === 0 && <p className="muted" style={{ fontSize: 14 }}>Belum ada produk dipilih.</p>}
              {chosen.map((p) => (
                <div key={p.sku} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                  <span>{qty[p.sku]}× {p.name}</span><b style={{ whiteSpace: 'nowrap' }}>{rp(p.price * qty[p.sku])}</b>
                </div>
              ))}
              <div className="divider-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 700 }}>Total</span><span className="total" style={{ fontSize: 24 }}>{rp(total)}</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>Ongkos kirim dikonfirmasi penjual lewat WhatsApp.</p>
              {errors.length > 0 && (
                <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {errors.map((e) => <div key={e} className="err-row" style={{ fontSize: 14, padding: '8px 10px' }}><Icon name="alert" size={16} stroke={2.2} />{e}</div>)}
                </div>
              )}
              <button type="submit" className="submit" disabled={sending || !catalog || catalog.error}>
                {sending ? <span className="spinner" /> : <Icon name="send" stroke={2.2} />}{sending ? 'Mengirim…' : 'Kirim pesanan'}
              </button>
              {siteKey && <div ref={widget} style={{ minHeight: 65 }} />}
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>Data hanya dipakai untuk memproses dan mengirim pesananmu.</p>
            </aside>
          </form>
        )}
      </main>
    </div>
  );
}

function Field({ label, hint, required, wide, children }) {
  return (
    <label className={`field ${wide ? 'wide' : ''}`}>
      <span>{label}{required && <b aria-hidden="true" style={{ color: 'var(--bad)' }}> *</b>}{hint && <small> · {hint}</small>}</span>
      {children}
    </label>
  );
}
