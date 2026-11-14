// Pemanggil API website (lihat worker/index.js)

async function call(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  });
  // Cloudflare Access mengalihkan ke halaman login (HTML) kalau sesi habis
  const type = res.headers.get('Content-Type') || '';
  const data = type.includes('application/json') ? await res.json().catch(() => ({})) : {};
  return { status: res.status, ok: res.ok, data };
}

export const api = {
  config: () => call('/api/config'),
  stats: () => call('/api/stats'),
  demoOrder: (scenario, turnstileToken) => call('/api/demo-order', { method: 'POST', body: { scenario, turnstileToken } }),
  me: () => call('/api/admin/me'),
  orders: () => call('/api/admin/orders'),
  decide: (id, decision) => call('/api/admin/decide', { method: 'POST', body: { id, decision } }),
};

// Memuat widget Cloudflare Turnstile sekali saja, hanya kalau site key diatur
let turnstileScript;
export function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!turnstileScript) {
    turnstileScript = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => resolve(window.turnstile);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return turnstileScript;
}
