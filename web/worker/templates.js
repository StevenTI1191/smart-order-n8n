// Skenario pesanan untuk demo publik.
// Server (bukan browser) yang menyusun isi pesanan, jadi pengunjung hanya bisa memilih
// salah satu skenario ini dan tidak bisa mengirim data sembarangan ke n8n.
// Semua nama, nomor HP, dan alamat adalah data karangan.

const rand = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b % 10).join('');

// Nomor HP acak supaya demo dari pengunjung berbeda tidak saling dianggap "pesanan serupa"
const phone = () => '0812' + rand(8);
const orderId = () => 'DEMO-' + Date.now().toString(36).toUpperCase() + rand(3);

const SCENARIOS = {
  normal: () => ({
    customer: { name: 'Budi Santoso', email: 'budi.santoso@gmail.com', phone: phone() },
    shipping_address: { address: 'Jl. Sudirman No. 45, RT 02/RW 03', city: 'Pekanbaru', postal_code: '28116' },
    items: [
      { sku: 'KOPI-250', name: 'Kopi Arabika 250 gr', qty: 2, price: 85000 },
      { sku: 'GLS-01', name: 'Gelas Kaca', qty: 1, price: 45000 },
    ],
    payment_method: 'transfer',
    total: 215000,
  }),
  cod: () => ({
    customer: { name: 'Rina Wulandari', email: 'rina.w@yahoo.com', phone: phone() },
    shipping_address: { address: 'Perumahan Griya Indah Blok C No. 12', city: 'Dumai', postal_code: '28812' },
    items: [
      { sku: 'LPT-14', name: 'Laptop 14 inci', qty: 1, price: 7200000 },
      { sku: 'MOU-01', name: 'Mouse Wireless', qty: 1, price: 150000 },
    ],
    payment_method: 'cod',
    total: 7350000,
  }),
  suspicious: () => ({
    customer: { name: 'asdf123', email: 'x@mailinator.com', phone: phone() },
    shipping_address: { address: 'jl a', city: 'Jakarta', postal_code: '' },
    items: [{ sku: 'PWB-20', name: 'Power Bank 20.000 mAh', qty: 12, price: 175000 }],
    payment_method: 'cod',
    total: 2100000,
  }),
  invalid: () => ({
    customer: { name: 'Dodi', email: 'dodi@gmail.com', phone: '12345' },
    shipping_address: { address: 'Jl. Melati No. 9', city: '', postal_code: '28111' },
    items: [],
    payment_method: 'transfer',
    total: 0,
  }),
  // Pesanan yang sama dikirim dua kali (seperti webhook toko yang terkirim ulang)
  dup: () => SCENARIOS.normal(),
};

export const SCENARIO_KEYS = Object.keys(SCENARIOS);

export function buildOrder(key) {
  const make = SCENARIOS[key];
  if (!make) return null;
  return { order_id: orderId(), source: 'demo', ...make(), notes: 'Pesanan demo dari website' };
}
