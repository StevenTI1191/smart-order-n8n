// Cloudflare Worker: menyajikan website (folder dist) dan API kecil yang meneruskan
// permintaan ke n8n. Webhook secret n8n hanya ada di sini (env.N8N_WEBHOOK_SECRET),
// tidak pernah dikirim ke browser.
//
// Halaman /admin terbuka untuk semua orang tetapi hanya berisi data contoh.
// Data asli dan tombol Approve/Reject lewat /api/admin/*, yang dikunci Cloudflare Access
// (aturan Access di dashboard) DAN diperiksa ulang di sini (verifyAccess).
//
//   GET  /api/config              -> site key Turnstile (publik)
//   GET  /api/stats               -> statistik 30 hari tanpa data pribadi (publik, di-cache)
//   POST /api/demo-order          -> kirim pesanan demo dari skenario tetap (publik, dibatasi)
//   GET  /api/catalog             -> produk untuk form pesanan (publik)
//   POST /api/order               -> form pesanan pembeli, harga dihitung di server (publik, dibatasi)
//   GET  /api/admin/login         -> pintu login admin, lalu kembali ke /admin (Cloudflare Access)
//   GET  /api/admin/me            -> email admin yang login        (Cloudflare Access)
//   GET  /api/admin/orders        -> daftar pesanan + aktivitas     (Cloudflare Access)
//   POST /api/admin/decide        -> Approve / Reject               (Cloudflare Access)

import { verifyAccess } from './access.js';
import { buildOrder, SCENARIO_KEYS } from './templates.js';
import { STORE, PRODUCTS, MAX_QTY } from './catalog.js';

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });

// Memanggil webhook n8n dengan secret
async function n8n(env, path, { method = 'GET', body, query } = {}) {
  if (!env.N8N_BASE_URL || !env.N8N_WEBHOOK_SECRET) throw new Error('N8N_BASE_URL / N8N_WEBHOOK_SECRET belum diatur');
  const url = new URL(path, env.N8N_BASE_URL.replace(/\/?$/, '/'));
  if (query) for (const [k, v] of Object.entries(query)) if (v) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: { 'X-Webhook-Secret': env.N8N_WEBHOOK_SECRET, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120_000), // AI bisa butuh waktu berpikir
  });
  const data = await res.json().catch(() => ({ ok: false, error: `n8n membalas ${res.status}` }));
  return { status: res.status, data };
}

// Rate limit memakai binding Cloudflare (lihat wrangler.toml). Kalau binding tidak ada, lewati.
async function limited(limiter, key) {
  if (!limiter?.limit) return false;
  const { success } = await limiter.limit({ key });
  return !success;
}

async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true; // Turnstile opsional; aktif kalau secret diisi
  if (!token) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const out = await res.json().catch(() => ({}));
  return Boolean(out.success);
}

async function handleApi(request, env, ctx, url) {
  const path = url.pathname;
  const ip = request.headers.get('CF-Connecting-IP') || 'local';

  if (path === '/api/config' && request.method === 'GET') {
    return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY || null });
  }

  if (path === '/api/stats' && request.method === 'GET') {
    const cache = caches.default;
    const cacheKey = new Request(new URL('/api/stats', url.origin));
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    const { status, data } = await n8n(env, 'webhook/api/stats');
    const res = json(data, status === 200 ? 200 : 502, status === 200 ? { 'Cache-Control': 'public, max-age=60' } : {});
    if (status === 200) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  }

  if (path === '/api/demo-order' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (!SCENARIO_KEYS.includes(body.scenario)) return json({ ok: false, error: 'Skenario tidak dikenal' }, 400);
    if (await limited(env.DEMO_LIMITER, `ip:${ip}`)) {
      return json({ ok: false, error: 'Terlalu sering. Coba lagi sekitar satu menit lagi.' }, 429);
    }
    if (await limited(env.DEMO_GLOBAL_LIMITER, 'global')) {
      return json({ ok: false, error: 'Demo sedang ramai. Coba lagi sebentar.' }, 429);
    }
    if (!(await verifyTurnstile(env, body.turnstileToken, ip))) {
      return json({ ok: false, error: 'Verifikasi anti-bot gagal. Muat ulang halaman lalu coba lagi.' }, 403);
    }

    const order = buildOrder(body.scenario);
    let result = await n8n(env, 'webhook/order', { method: 'POST', body: order });
    // Skenario "pesanan ganda": kirim pesanan yang sama sekali lagi
    if (body.scenario === 'dup' && result.status === 200) {
      result = await n8n(env, 'webhook/order', { method: 'POST', body: order });
    }
    return json({ ...result.data, order_id: result.data.order_id || order.order_id }, result.status);
  }

  if (path === '/api/catalog' && request.method === 'GET') {
    return json({ store: STORE, products: PRODUCTS, maxQty: MAX_QTY }, 200, { 'Cache-Control': 'public, max-age=300' });
  }

  // Form pesanan untuk pembeli (link yang dibagikan penjual di WhatsApp / Instagram)
  if (path === '/api/order' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (await limited(env.DEMO_LIMITER, `order:${ip}`)) {
      return json({ ok: false, error: 'Terlalu banyak pesanan dalam waktu singkat. Coba lagi sebentar.' }, 429);
    }
    if (!(await verifyTurnstile(env, body.turnstileToken, ip))) {
      return json({ ok: false, error: 'Verifikasi anti-bot gagal. Muat ulang halaman lalu coba lagi.' }, 403);
    }
    const str = (v, max) => String(v ?? '').trim().slice(0, max);
    // Harga dan nama produk dari katalog server, bukan dari browser
    const items = (Array.isArray(body.items) ? body.items : [])
      .map((it) => {
        const p = PRODUCTS.find((x) => x.sku === it?.sku);
        const qty = Math.floor(Number(it?.qty));
        return p && qty > 0 ? { sku: p.sku, name: p.name, qty: Math.min(qty, MAX_QTY), price: p.price } : null;
      })
      .filter(Boolean);
    const payment = STORE.payments.some((x) => x.id === body.payment_method) ? body.payment_method : '';
    const order = {
      order_id: 'WEB-' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 900 + 100),
      source: 'form',
      customer: { name: str(body.name, 80), email: str(body.email, 120), phone: str(body.phone, 30) },
      shipping_address: { address: str(body.address, 300), city: str(body.city, 80), postal_code: str(body.postal_code, 10) },
      items,
      payment_method: payment,
      total: items.reduce((a, i) => a + i.qty * i.price, 0),
      notes: str(body.notes, 300),
    };
    const { status, data } = await n8n(env, 'webhook/order', { method: 'POST', body: order });
    // Pembeli hanya melihat status umum, bukan skor risiko atau alasan internal
    if (status === 422) return json({ ok: false, errors: data.errors || ['Data pesanan belum lengkap'] }, 422);
    if (status !== 200 || !data.ok) return json({ ok: false, error: 'Pesanan belum bisa diproses. Coba lagi sebentar.' }, 502);
    return json({
      ok: true,
      order_id: data.order_id || order.order_id,
      state: data.duplicate ? 'duplicate' : data.status === 'APPROVED_AUTO' ? 'confirmed' : 'review',
      total: order.total,
    });
  }

  if (path.startsWith('/api/admin/')) {
    const user = await verifyAccess(request, env);

    // Tombol "Masuk sebagai admin": Cloudflare Access meminta login dulu, lalu kembali ke /admin
    if (path === '/api/admin/login') {
      return Response.redirect(new URL(user ? '/admin' : '/admin?login=gagal', url.origin), 302);
    }
    if (!user) return json({ ok: false, error: 'Perlu login admin' }, 401);

    if (path === '/api/admin/me' && request.method === 'GET') return json({ ok: true, email: user.email });

    if (path === '/api/admin/orders' && request.method === 'GET') {
      const { status, data } = await n8n(env, 'webhook/api/orders', { query: { status: url.searchParams.get('status') } });
      return json(data, status);
    }

    if (path === '/api/admin/decide' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      // Nama admin diambil dari login Access, bukan dari isi permintaan browser
      const { status, data } = await n8n(env, 'webhook/api/decide', {
        method: 'POST',
        body: { id: body.id, decision: body.decision, by: user.email },
      });
      return json(data, status);
    }
  }

  return json({ ok: false, error: 'Tidak ditemukan' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, ctx, url);
      } catch (err) {
        console.error(url.pathname, 'gagal:', err?.stack || err);
        return json({ ok: false, error: 'Server sedang bermasalah' }, 502);
      }
    }
    // File website (React). Alamat yang tidak cocok dengan file diarahkan ke index.html.
    return env.ASSETS.fetch(request);
  },
};
