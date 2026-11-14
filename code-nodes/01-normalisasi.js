// Node: "Normalize"  (Code node, mode: Run Once for All Items)
// Input : output node "Webhook Order" ({ headers, params, query, body })
// Output: satu item pesanan dengan format seragam + hasil validasi.
// Menerima dua format: payload generik (lihat test/orders) dan payload webhook Shopify (orders/create).

const body = $input.first().json.body || {};

// "150.000" / "150.000,50" (format Indonesia) atau "150000.00" (Shopify) -> angka
const toNum = (v) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return parseFloat(s.replace(/,/g, '')) || 0;
};

// 0812..., +62 812..., 812... -> 62812...
const normPhone = (v) => {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return d;
};

const normPayment = (v) => {
  const s = String(v ?? '').toLowerCase();
  if (!s) return '';
  if (s.includes('cod') || s.includes('cash on delivery')) return 'cod';
  if (/(transfer|bank|va|virtual)/.test(s)) return 'transfer';
  if (/(ovo|gopay|dana|shopeepay|ewallet|e-wallet|qris|linkaja)/.test(s)) return 'ewallet';
  if (/(card|credit|kartu|stripe|shopify_payments)/.test(s)) return 'card';
  return 'other';
};

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

let o;
if (Array.isArray(body.line_items)) {
  // Format webhook Shopify
  const sa = body.shipping_address || {};
  const cu = body.customer || {};
  o = {
    source: 'shopify',
    order_id: clean(body.name || body.id),
    customer_name: clean(sa.name || [cu.first_name, cu.last_name].filter(Boolean).join(' ')),
    email: clean(body.email || body.contact_email || cu.email).toLowerCase(),
    phone: normPhone(body.phone || sa.phone || cu.phone),
    address: clean([sa.address1, sa.address2].filter(Boolean).join(', ')),
    city: clean(sa.city),
    postal_code: clean(sa.zip),
    items: body.line_items.map((li) => ({
      sku: clean(li.sku),
      name: clean(li.title || li.name),
      qty: Number(li.quantity) || 0,
      price: toNum(li.price),
    })),
    payment_method: normPayment((body.payment_gateway_names || [])[0] || body.gateway),
    total: toNum(body.total_price),
    notes: clean(body.note),
    ordered_at: body.created_at || new Date().toISOString(),
  };
} else {
  // Format generik
  const c = body.customer || {};
  const a = body.shipping_address || {};
  o = {
    source: clean(body.source || 'web').toLowerCase(),
    order_id: clean(body.order_id),
    customer_name: clean(c.name),
    email: clean(c.email).toLowerCase(),
    phone: normPhone(c.phone),
    address: clean(a.address),
    city: clean(a.city),
    postal_code: clean(a.postal_code),
    items: (Array.isArray(body.items) ? body.items : []).map((it) => ({
      sku: clean(it.sku),
      name: clean(it.name),
      qty: Number(it.qty) || 0,
      price: toNum(it.price),
    })),
    payment_method: normPayment(body.payment_method),
    total: toNum(body.total),
    notes: clean(body.notes),
    ordered_at: body.ordered_at || new Date().toISOString(),
  };
}

o.item_qty = o.items.reduce((a, i) => a + i.qty, 0);
o.items_subtotal = o.items.reduce((a, i) => a + i.qty * i.price, 0);

// Validasi: hanya yang membuat pesanan tidak bisa diproses sama sekali.
// Kejanggalan lain (alamat pendek, nama aneh, dll) dinilai di node "Skor Risiko".
const errors = [];
if (!o.order_id) errors.push('order_id kosong');
if (!o.customer_name) errors.push('Nama pelanggan kosong');
if (!/^628\d{7,11}$/.test(o.phone)) errors.push('Nomor HP tidak valid');
if (!o.address) errors.push('Alamat kosong');
if (!o.city) errors.push('Kota kosong');
if (!o.items.length) errors.push('Tidak ada item');
if (o.items.some((i) => i.qty <= 0 || i.price < 0 || !i.name)) errors.push('Ada item dengan nama, qty, atau harga tidak valid');
if (!(o.total > 0)) errors.push('Total harus lebih dari 0');
if (o.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) errors.push('Format email tidak valid');
if (!o.payment_method) errors.push('Metode pembayaran kosong');

return [{ json: { ...o, valid: errors.length === 0, errors } }];
