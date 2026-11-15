// Daftar produk untuk form pesanan (/pesan).
// Harga hanya diambil dari sini (server), jadi pembeli tidak bisa mengubah harga lewat browser.
// Ganti isinya dengan produk toko yang memakai Smart Order.

export const STORE = {
  name: 'Kopi Nusantara',
  tagline: 'Kopi pilihan dari petani lokal',
  payments: [
    { id: 'transfer', label: 'Transfer bank' },
    { id: 'ewallet', label: 'E-wallet' },
    { id: 'cod', label: 'Bayar di tempat (COD)' },
  ],
};

export const PRODUCTS = [
  { sku: 'KOPI-ARB-250', name: 'Kopi Arabika Gayo 250 gr', price: 85000 },
  { sku: 'KOPI-ROB-250', name: 'Kopi Robusta Lampung 250 gr', price: 65000 },
  { sku: 'DRIP-10', name: 'Drip Bag isi 10', price: 55000 },
  { sku: 'GLS-01', name: 'Gelas Kaca 300 ml', price: 45000 },
];

export const MAX_QTY = 50;
