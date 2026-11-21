import { STATUS } from './stats.js';
/* Chart SVG kecil tanpa library. Teks memakai token ink, bukan warna seri. Tooltip via atribut data-tip. */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const W = 340;
export const pct = (x, d = 1) => x == null ? '–' : (x * 100).toFixed(d).replace('.', ',') + '%';
const svg = (h, body, label) => `<svg viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}" class="chart">${body}</svg>`;
const rbar = (x, y, w, h, r, fill, tip, extra = '') =>
  `<path d="M${x} ${y}h${Math.max(0, w - r)}a${r} ${r} 0 0 1 ${r} ${r}v${Math.max(0, h - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${r}h${-Math.max(0, w - r)}z" fill="${fill}" ${extra}/>`;

/* Bar horizontal. rows: {label, value(0..1), color, tip, note, marker(0..1)} */
export function hbars(rows, { labelW = 96, rowH = 22, barH = 10, valueFmt = v => pct(v, 0), max = 1 } = {}) {
  const h = rows.length * rowH + 4, x0 = labelW + 6, wMax = W - x0 - 44;
  const body = rows.map((r, i) => {
    const y = i * rowH + 2, bw = r.value == null ? 0 : Math.max(r.value / max * wMax, r.value > 0 ? 2 : 0);
    return `<g data-tip="${esc(r.tip || r.label)}" class="hit"><rect x="0" y="${y}" width="${W}" height="${rowH}" fill="transparent"/>
      <text x="0" y="${y + rowH / 2 + 4}" class="t-lab">${esc(r.label)}</text>
      <rect x="${x0}" y="${y + (rowH - barH) / 2}" width="${wMax}" height="${barH}" rx="5" class="trk"/>
      ${bw ? rbar(x0, y + (rowH - barH) / 2, bw, barH, 5, r.color) : ''}
      ${r.marker != null ? `<rect x="${x0 + r.marker / max * wMax - 1}" y="${y + 2}" width="2" height="${rowH - 4}" class="mk"/>` : ''}
      <text x="${W}" y="${y + rowH / 2 + 4}" text-anchor="end" class="t-val">${esc(r.value == null ? '–' : valueFmt(r.value))}</text></g>`;
  }).join('');
  return svg(h, body, 'Diagram batang');
}

/* Histogram jumlah Ya (0..20), batang per nilai. */
export function histogram(hist, colorOf, mark) {
  const lo = Math.max(0, hist.findIndex(v => v > 0)), hi = 20;
  const vals = []; for (let v = lo; v <= hi; v++) vals.push(v);
  const max = Math.max(1, ...hist), h = 130, pl = 22, pb = 22, pw = W - pl, bw = pw / vals.length;
  let body = [0, 0.5, 1].map(t => { const y = h - pb - t * (h - pb - 10); return `<line x1="${pl}" x2="${W}" y1="${y}" y2="${y}" class="grid"/><text x="${pl - 5}" y="${y + 3}" text-anchor="end" class="t-ax">${Math.round(t * max)}</text>`; }).join('');
  vals.forEach((v, i) => {
    const bh = hist[v] / max * (h - pb - 10), x = pl + i * bw + 1.5;
    body += `<g class="hit" data-tip="${v} Ya: ${hist[v]} responden"><rect x="${pl + i * bw}" y="10" width="${bw}" height="${h - pb - 10}" fill="transparent"/>${hist[v] ? `<rect x="${x}" y="${h - pb - bh}" width="${bw - 3}" height="${bh}" rx="3" fill="${colorOf(v)}"/>` : ''}</g>`;
    if (i % 2 === 0 || vals.length < 9) body += `<text x="${x + (bw - 3) / 2}" y="${h - 7}" text-anchor="middle" class="t-ax">${v}</text>`;
  });
  if (mark != null && mark >= lo) { const x = pl + (mark - lo) * bw + bw / 2; body += `<path d="M${x} ${h - pb + 2}l-5 8h10z" class="mk-fill"/><text x="${x}" y="8" text-anchor="middle" class="t-lab">pilihan</text>`; }
  return svg(h, body, 'Histogram jumlah jawaban Ya');
}

export function donut(parts, centerTop, centerBottom) {
  const total = parts.reduce((s, p) => s + p.n, 0), cx = 62, cy = 62, R = 52, r = 34;
  let a0 = -Math.PI / 2, body = '';
  const arc = (a, b, c, tip) => {
    const f = b - a > Math.PI ? 1 : 0, p = (R, t) => [cx + R * Math.cos(t), cy + R * Math.sin(t)];
    const [x1, y1] = p(R, a), [x2, y2] = p(R, b), [x3, y3] = p(r, b), [x4, y4] = p(r, a);
    return `<path d="M${x1} ${y1}A${R} ${R} 0 ${f} 1 ${x2} ${y2}L${x3} ${y3}A${r} ${r} 0 ${f} 0 ${x4} ${y4}z" fill="${c}" class="seg hit" data-tip="${esc(tip)}"/>`;
  };
  if (!total) body = `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" class="trk-s" stroke-width="${R - r}"/>`;
  else parts.forEach(p => {
    if (!p.n) return;
    const a1 = a0 + p.n / total * Math.PI * 2 - (parts.filter(x => x.n).length > 1 ? 0.03 : 0.0001);
    body += arc(a0, p.n === total ? a0 + Math.PI * 2 - 0.0001 : a1, p.color, `${p.label}: ${p.n} responden (${pct(p.n / total, 0)})`);
    a0 += p.n / total * Math.PI * 2;
  });
  body += `<text x="${cx}" y="${cy + 2}" text-anchor="middle" class="t-big">${esc(centerTop)}</text><text x="${cx}" y="${cy + 17}" text-anchor="middle" class="t-ax">${esc(centerBottom)}</text>`;
  body += parts.map((p, i) => `<g transform="translate(150 ${22 + i * 28})"><rect width="10" height="10" rx="3" fill="${p.color}"/><text x="18" y="9" class="t-lab">${esc(p.label)}</text><text x="${W - 150}" y="9" text-anchor="end" class="t-val">${p.n}</text></g>`).join('');
  return svg(124, body, 'Diagram donat proporsi responden per rentang jumlah Ya');
}

/* Scatter dengan ukuran bubble = jumlah responden pada titik yang sama (tanpa jitter agar nilai tidak dimanipulasi). */
export function bubbleScatter(points, { xLabel, yLabel, steps = 5 }) {
  const h = 210, pl = 30, pb = 28, pr = 10, pt = 8, pw = W - pl - pr, ph = h - pb - pt;
  const key = new Map();
  points.forEach(p => { const k = p.x + ',' + p.y; key.set(k, (key.get(k) || { ...p, n: 0 })); key.get(k).n++; });
  const maxN = Math.max(1, ...[...key.values()].map(v => v.n));
  const X = v => pl + v / steps * pw, Y = v => pt + ph - v / steps * ph;
  let body = '';
  for (let v = 0; v <= steps; v++) body += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${pl - 6}" y="${Y(v) + 3}" text-anchor="end" class="t-ax">${v}</text><text x="${X(v)}" y="${h - pb + 14}" text-anchor="middle" class="t-ax">${v}</text>`;
  body += `<text x="${pl + pw / 2}" y="${h - 3}" text-anchor="middle" class="t-ax">${esc(xLabel)} (jumlah Ya)</text>`;
  body += `<text transform="translate(9 ${pt + ph / 2}) rotate(-90)" text-anchor="middle" class="t-ax">${esc(yLabel)}</text>`;
  for (const v of key.values()) {
    const r = 4 + 9 * Math.sqrt(v.n / maxN);
    body += `<circle cx="${X(v.x)}" cy="${Y(v.y)}" r="${r}" class="dot hit" data-tip="${esc(`${xLabel} ${v.x}, ${yLabel} ${v.y}: ${v.n} responden`)}"/>`;
  }
  return svg(h, body, `Sebaran ${xLabel} terhadap ${yLabel}`);
}

/* Strip 20 jawaban satu responden. */
export function answerStrip(ans, qs, colors) {
  const cw = (W - 19 * 3) / 20;
  const body = ans.map((v, i) => { const x = i * (cw + 3);
    return `<g class="hit" data-tip="${esc(`Q${i + 1} · ${v ? 'Ya' : 'Tidak'} — ${qs[i].text}`)}">
    <rect x="${x}" y="0" width="${cw}" height="22" rx="4" fill="${v ? STATUS.yes : STATUS.no}"/>
    <text x="${x + cw / 2}" y="15.5" text-anchor="middle" class="t-mark">${v ? '✓' : '✕'}</text>
    <rect x="${x}" y="25" width="${cw}" height="3" rx="1.5" fill="${colors[qs[i].aspek]}"/>
    <text x="${x + cw / 2}" y="40" text-anchor="middle" class="t-ax">${i + 1}</text></g>`; }).join('');
  return svg(46, body, 'Jawaban per pertanyaan: ✓ Ya, ✕ Tidak. Garis kecil di bawah = warna aspek');
}
