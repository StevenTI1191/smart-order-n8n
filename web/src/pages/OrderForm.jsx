import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icons.jsx';
import { api, loadTurnstile } from '../lib/api.js';
import { rp, initials } from '../lib/format.js';

// Form pesanan untuk pembeli. Penjual membagikan link /pesan di WhatsApp atau Instagram.
// Setiap pesanan langsung diperiksa Smart Order (validasi, cek duplikat, skor risiko, AI).

const EMPTY = { name: '', phone: '', email: '', address: '', city: '', postal_code: '', notes: '', payment_method: '' };

export default function OrderForm() {
  const [catalog, setCatalog] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [qty, setQty] = useState({});
  const [errors, setErrors] = useState([]); // [{ key, msg }]
  const errBox = useRef(null);
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
  const clearErr = (k) => setErrors((list) => list.filter((x) => x.key !== k && x.key !== 'server'));
  const set = (k) => (e) => { clearErr(k); setForm((f) => ({ ...f, [k]: e.target.value })); };
  const errOf = (k) => errors.find((x) => x.key === k)?.msg;
  const bump = (sku, d) => { clearErr('items'); setQty((q) => ({ ...q, [sku]: Math.max(0, Math.min(maxQty, (q[sku] || 0) + d)) })); };

  function check() {
    const e = [];
    const add = (key, msg) => e.push({ key, msg });
    if (!chosen.length) add('items', 'Pilih minimal satu produk');
    if (form.name.trim().length < 2) add('name', 'Nama penerima belum diisi');
    let digits = form.phone.replace(/\D/g, '');
    if (digits.startsWith('0')) digits = '62' + digits.slice(1);
    else if (digits.startsWith('8')) digits = '62' + digits;
    if (!digits) add('phone', 'Nomor WhatsApp belum diisi');
    else if (!/^628\d{7,11}$/.test(digits)) add('phone', 'Nomor WhatsApp belum benar, contoh 081234567890');
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) add('email', 'Format email belum benar');
    if (form.address.trim().length < 10) add('address', 'Tulis alamat lengkap: jalan, nomor rumah, RT/RW');
    if (!form.city.trim()) add('city', 'Kota belum diisi');
    if (!form.payment_method) add('payment_method', 'Pilih metode pembayaran');
    return e;
  }

  async function submit(ev) {
    ev.preventDefault();
    const e = check();
    setErrors(e);
    if (e.length) { showErrors(); return; }
    if (siteKey && !token) { setErrors([{ key: 'server', msg: 'Tunggu verifikasi anti-bot selesai, lalu kirim lagi.' }]); showErrors(); return; }
    setSending(true);
    const res = await api.placeOrder({
      ...form,
      items: chosen.map((p) => ({ sku: p.sku, qty: qty[p.sku] })),
      turnstileToken: token,
    }).catch(() => ({ ok: false, status: 0, data: {} }));
    setSending(false);
    if (siteKey && window.turnstile && widgetId.current != null && widgetId.current !== 'loading') { window.turnstile.reset(widgetId.current); setToken(''); }
    if (res.ok && res.data?.ok) { setDone(res.data); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setErrors((res.data?.errors || [res.data?.error || 'Pesanan belum bisa dikirim. Periksa koneksi lalu coba lagi.']).map((msg) => ({ key: 'server', msg })));
    showErrors();
  }

  // Bawa pembeli ke daftar kesalahan (penting di HP, tombol kirim ada di bilah bawah)
  function showErrors() {
    requestAnimationFrame(() => errBox.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  const reset = () => { setDone(null); setForm(EMPTY); setQty({}); setErrors([]); };

  return (
    <div className="order-page">
      <header className="site-header">
        <div className="wrap" style={{ maxWidth: 1040 }}>
          <div className="store-brand">
            <span className="store-mark">{initials(catalog?.store?.name || 'Toko')}</span>
            <span><b>{catalog?.store?.name || 'Memuat toko…'}</b><small>{catalog?.store?.tagline || ''}</small></span>
          </div>
          <span className="secure-note hide-sm"><Icon name="shield" size={15} />Data pesanan aman</span>
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
                <h1 style={{ fontSize: 'clamp(28px, 5vw, 36px)', fontWeight: 800, letterSpacing: '-.03em' }}>Form pesanan</h1>
                <p className="muted">Pilih produk dan isi data pengiriman. Pesananmu langsung tercatat, tanpa perlu chat panjang.</p>
              </div>

              <section className="card order-section" aria-labelledby="produk">
                <h2 id="produk"><span className="sec-num">1</span>Pilih produk</h2>
                {errOf('items') && <FieldError msg={errOf('items')} />}
                {!catalog && <div className="skeleton" style={{ height: 160 }} />}
                {catalog?.error && <div className="notice tone-bad">Daftar produk belum bisa dimuat. Muat ulang halaman.</div>}
                {products.map((p) => (
                  <div key={p.sku} className={`product-row ${qty[p.sku] ? 'picked' : ''}`}>
                    <span className="product-tile" aria-hidden="true">{initials(p.name)}</span>
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
                <h2 id="penerima"><span className="sec-num">2</span>Data penerima</h2>
                <div className="field-grid">
                  <Field label="Nama penerima" error={errOf('name')} required><input value={form.name} onChange={set('name')} autoComplete="name" maxLength={80} /></Field>
                  <Field label="Nomor WhatsApp" error={errOf('phone')} required><input value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder="08xxxxxxxxxx" maxLength={20} /></Field>
                  <Field label="Email" error={errOf('email')} hint="opsional" wide><input type="email" value={form.email} onChange={set('email')} autoComplete="email" maxLength={120} /></Field>
                  <Field label="Alamat lengkap" error={errOf('address')} required wide><textarea value={form.address} onChange={set('address')} autoComplete="street-address" rows={3} maxLength={300} placeholder="Nama jalan, nomor rumah, RT/RW, kelurahan" /></Field>
                  <Field label="Kota" error={errOf('city')} required><input value={form.city} onChange={set('city')} autoComplete="address-level2" maxLength={80} /></Field>
                  <Field label="Kode pos" hint="opsional"><input value={form.postal_code} onChange={set('postal_code')} inputMode="numeric" autoComplete="postal-code" maxLength={10} /></Field>
                  <Field label="Catatan" hint="opsional" wide><input value={form.notes} onChange={set('notes')} maxLength={300} placeholder="Contoh: titip ke satpam" /></Field>
                </div>
              </section>

              <section className="card order-section" aria-labelledby="bayar">
                <h2 id="bayar"><span className="sec-num">3</span>Pembayaran</h2>
                {errOf('payment_method') && <FieldError msg={errOf('payment_method')} />}
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
                <div ref={errBox} role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {errors.length > 1 && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--bad)' }}>Lengkapi {errors.length} hal ini dulu:</div>}
                  {errors.map((e) => <div key={e.key + e.msg} className="err-row" style={{ fontSize: 14, padding: '8px 10px' }}><Icon name="alert" size={16} stroke={2.2} />{e.msg}</div>)}
                </div>
              )}
              <button type="submit" className="submit" disabled={sending || !catalog || catalog.error}>
                {sending ? <span className="spinner" /> : <Icon name="send" stroke={2.2} />}{sending ? 'Mengirim…' : 'Kirim pesanan'}
              </button>
              {siteKey && <div ref={widget} style={{ minHeight: 65 }} />}
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>Data hanya dipakai untuk memproses dan mengirim pesananmu.</p>
            </aside>

            <div className="mobile-bar">
              <div><small>{chosen.reduce((a, p) => a + qty[p.sku], 0)} barang</small><b>{rp(total)}</b></div>
              <button type="submit" className="submit" disabled={sending || !catalog || catalog.error}>
                {sending ? <span className="spinner" /> : <Icon name="send" stroke={2.2} />}{sending ? 'Mengirim…' : 'Kirim pesanan'}
              </button>
            </div>
          </form>
        )}
      </main>
      <footer className="order-foot">Pesanan diperiksa otomatis oleh <a href="/">Smart Order</a></footer>
    </div>
  );
}

function Field({ label, hint, required, wide, error, children }) {
  return (
    <label className={`field ${wide ? 'wide' : ''} ${error ? 'has-error' : ''}`}>
      <span>{label}{required && <b aria-hidden="true" style={{ color: 'var(--bad)' }}> *</b>}{hint && <small> · {hint}</small>}</span>
      {children}
      {error && <em className="field-error">{error}</em>}
    </label>
  );
}

function FieldError({ msg }) {
  return <div className="field-error" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="alert" size={15} stroke={2.2} />{msg}</div>;
}
