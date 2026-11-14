// Memeriksa login Cloudflare Access untuk halaman dan API admin.
// Cloudflare Access menaruh token login (JWT) di header "Cf-Access-Jwt-Assertion".
// Token itu diverifikasi di sini dengan kunci publik tim Access, jadi API admin tetap aman
// walaupun suatu saat aturan Access di dashboard salah diatur.

const certCache = { keys: null, at: 0 };

const b64urlToBytes = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const b64urlToJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function getKeys(teamDomain) {
  // Kunci publik di-cache 1 jam
  if (certCache.keys && Date.now() - certCache.at < 3600_000) return certCache.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('Gagal mengambil kunci Cloudflare Access');
  const { keys } = await res.json();
  certCache.keys = keys;
  certCache.at = Date.now();
  return keys;
}

/**
 * Mengembalikan { email } kalau login valid, atau null kalau tidak.
 * env.ACCESS_TEAM_DOMAIN contoh: "namatim.cloudflareaccess.com"
 * env.ACCESS_AUD = "Application Audience (AUD) Tag" dari aplikasi Access
 */
export async function verifyAccess(request, env) {
  const url = new URL(request.url);

  // Hanya untuk development lokal (wrangler dev): tidak pernah berlaku di domain asli
  if (env.DEV_ADMIN_EMAIL && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
    return { email: env.DEV_ADMIN_EMAIL };
  }

  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null; // belum diatur = tolak semua
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;

  try {
    const [h, p, s] = token.split('.');
    const header = b64urlToJson(h);
    const payload = b64urlToJson(p);

    const keys = await getKeys(env.ACCESS_TEAM_DOMAIN);
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk || header.alg !== 'RS256') return null;

    const key = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
    );
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`),
    );
    if (!ok) return null;

    const now = Math.floor(Date.now() / 1000);
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.ACCESS_AUD)) return null;
    if (payload.exp && payload.exp < now) return null;
    if (payload.iss && payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;

    return { email: payload.email || 'admin' };
  } catch (err) {
    console.error('Verifikasi Access gagal:', err?.message || err);
    return null;
  }
}
