// Grafik kecil berbasis SVG: cincin skor dan donut status

export function Ring({ size = 128, r = 54, stroke = 12, value = 0, color, track = '#E6EBEF', label, children }) {
  const C = 2 * Math.PI * r;
  const vb = (r + stroke / 2 + 4) * 2;
  const c = vb / 2;
  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} role="img" aria-label={label}>
        <circle cx={c} cy={c} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${(C * Math.max(0.02, Math.min(1, value / 100))).toFixed(1)} ${C.toFixed(1)}`}
          transform={`rotate(-90 ${c} ${c})`} style={{ transition: 'stroke-dasharray .5s ease' }} />
      </svg>
      <div className="gauge-label">{children}</div>
    </div>
  );
}

// segments: [{ value, color }]
export function Donut({ size = 128, r = 48, stroke = 16, segments, total, label, caption = 'pesanan' }) {
  const C = 2 * Math.PI * r;
  const vb = (r + stroke / 2 + 4) * 2;
  const c = vb / 2;
  const sum = segments.reduce((a, s) => a + s.value, 0);
  let acc = 0;
  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} role="img" aria-label={label}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#F1F5F8" strokeWidth={stroke} />
        {sum > 0 && segments.map((s, i) => {
          const len = (C * s.value) / sum;
          const el = s.value > 0 ? (
            <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
              strokeDasharray={`${Math.max(0, len - (segments.filter((x) => x.value > 0).length > 1 ? 2 : 0)).toFixed(1)} ${C.toFixed(1)}`}
              strokeDashoffset={(-acc).toFixed(1)} transform={`rotate(-90 ${c} ${c})`} />
          ) : null;
          acc += len;
          return el;
        })}
      </svg>
      <div className="gauge-label">
        <span style={{ fontSize: size > 140 ? 32 : 28, fontWeight: 800, lineHeight: 1 }}>{total ?? sum}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{caption}</span>
      </div>
    </div>
  );
}

export function Bar({ value, max, color, height = 10, track = '#F1F5F8' }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ height, borderRadius: 999, background: track, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: pct + '%', borderRadius: 999, background: color, transition: 'width .4s ease' }} />
    </div>
  );
}
