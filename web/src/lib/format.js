// Fungsi bantu tampilan

export const rp = (n) => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');

// "Rp7,9 jt" untuk angka besar di kartu kecil
export const rpShort = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e9) return 'Rp' + (v / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' M';
  if (v >= 1e6) return 'Rp' + (v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
  return rp(v);
};

export const initials = (name = '') =>
  name.trim().split(/\s+/).map((w) => w.charAt(0)).join('').slice(0, 2).toUpperCase() || '?';

const PALETTE = [['rgba(92,198,220,0.072)', '#8AD6E6'], ['rgba(142,155,230,0.096)', '#A5B4FC'], ['rgba(95,196,154,0.072)', '#8ED6B5'], ['rgba(226,181,86,0.072)', '#EACB82']];
export const palette = (name = '') => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % PALETTE.length;
  return PALETTE[h];
};

export const LEVEL_COLOR = { LOW: '#5FC49A', MEDIUM: '#E2B556', HIGH: '#E08294' };
export const LEVEL_ID = { LOW: 'Rendah', MEDIUM: 'Sedang', HIGH: 'Tinggi' };
export const VERDICT_ID = { APPROVE: 'Setuju', REVIEW: 'Perlu dicek', REJECT: 'Tolak' };
export const TAG_ID = { new_customer: 'Pelanggan baru', repeat_customer: 'Pelanggan lama', high_value: 'Nilai besar', cod: 'COD', bulk: 'Borongan' };
export const TRACK = 'rgba(148,163,184,.16)';
export const LEVEL_TONE = { LOW: 'tone-good', MEDIUM: 'tone-warn', HIGH: 'tone-bad' };

export const STATUS = {
  APPROVED_AUTO: { label: 'Otomatis', tone: 'tone-good', color: '#5FC49A' },
  APPROVED_MANUAL: { label: 'Disetujui owner', tone: 'tone-info', color: '#5CC6DC' },
  PENDING_REVIEW: { label: 'Menunggu', tone: 'tone-warn', color: '#E2B556' },
  REJECTED: { label: 'Ditolak', tone: 'tone-bad', color: '#E08294' },
};

// decided_by di database -> teks yang mudah dibaca
export const byLabel = (by) => {
  if (!by || by === 'system') return 'sistem';
  if (by === 'rules') return 'aturan';
  if (by === 'ai') return 'AI';
  return by.replace(/^web:/, '');
};

// "COD bernilai besar (+25)" -> { text: 'COD bernilai besar', pts: 25 }
export const parseReason = (s) => {
  const m = String(s).match(/^(.*?)\s*\(([+-]?\d+)\)\s*$/);
  return m ? { text: m[1], pts: Number(m[2]) } : { text: String(s), pts: 0 };
};

export const time = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const hhmm = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === today.toDateString() ? hhmm : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) + ' ' + hhmm;
};

export const confidence = (c) => (c == null ? '' : Number(c).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export const PAYMENT = { cod: 'COD', transfer: 'Transfer', ewallet: 'E-wallet', card: 'Kartu', other: 'Lainnya' };
export const paymentLabel = (p) => PAYMENT[p] || (p ? p.charAt(0).toUpperCase() + p.slice(1) : '-');
