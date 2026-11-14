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

const PALETTE = [['#DDF2F8', '#0E5F75'], ['#E9EEF9', '#2C467F'], ['#E7F4EC', '#146C43'], ['#FFF0D9', '#8A4B00']];
export const palette = (name = '') => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % PALETTE.length;
  return PALETTE[h];
};

export const LEVEL_COLOR = { LOW: '#2E8A5E', MEDIUM: '#D99A2B', HIGH: '#B3261E' };
export const LEVEL_TONE = { LOW: 'tone-good', MEDIUM: 'tone-warn', HIGH: 'tone-bad' };

export const STATUS = {
  APPROVED_AUTO: { label: 'Otomatis', tone: 'tone-good', color: '#2E8A5E' },
  APPROVED_MANUAL: { label: 'Disetujui owner', tone: 'tone-info', color: '#67C3D9' },
  PENDING_REVIEW: { label: 'Menunggu', tone: 'tone-warn', color: '#D99A2B' },
  REJECTED: { label: 'Ditolak', tone: 'tone-bad', color: '#B3261E' },
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
