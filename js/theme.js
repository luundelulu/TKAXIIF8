/* Kustomisasi warna: preset + warna per status. Memutasi palet di stats.js, lalu meminta tampilan digambar ulang.
   Tidak menyentuh data, fisika, atau interaksi graf. Pilihan disimpan di localStorage (opsional). */
import { ASPEK_COLOR, BANDS, KOHORT_COLORS, STATUS, contrast, inkOn } from './stats.js';

export const PRESETS = {
  kontras: { name: 'Kontras tinggi', band: ['#047857', '#1D4ED8', '#C2410C'], aspek: ['#7C3AED', '#DB2777', '#B45309'], yes: '#047857', no: '#B91C1C', kohort: ['#6D28D9', '#BE185D', '#B45309', '#334155'] },
  buta: { name: 'Ramah buta warna', band: ['#0072B2', '#56B4E9', '#D55E00'], aspek: ['#0072B2', '#AA3377', '#996600'], yes: '#0072B2', no: '#D55E00', kohort: ['#0072B2', '#AA3377', '#996600', '#555555'] },
  lembut: { name: 'Lembut', band: ['#3F6E5A', '#5B7DB1', '#B4684D'], aspek: ['#6D5BD0', '#C0508A', '#A66A2E'], yes: '#3F6E5A', no: '#B4584D', kohort: ['#6D5BD0', '#C0508A', '#A66A2E', '#64748B'] }
};
const KEY = 'tka-theme-v1';
let cur = structuredClone(PRESETS.kontras); cur.preset = 'kontras';
let onChange = () => {};

function apply(t) {
  cur = structuredClone(t);
  t.band.forEach((c, i) => BANDS[i].color = c);
  t.aspek.forEach((c, i) => ASPEK_COLOR[i] = c);
  (t.kohort || PRESETS.kontras.kohort).forEach((c, i) => KOHORT_COLORS[i] = c);
  STATUS.yes = t.yes; STATUS.no = t.no;
  const r = document.documentElement.style;
  r.setProperty('--yes', t.yes); r.setProperty('--no', t.no);
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* penyimpanan tidak tersedia: abaikan */ }
}
export function initTheme(cb) {
  onChange = cb;
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.band?.length === 3 && s.aspek?.length === 3) { apply({ ...PRESETS.kontras, ...s }); return; } } catch { /* abaikan */ }
  apply(PRESETS.kontras);
}

const FIELDS = [
  ['Warna jumlah Ya pada node responden', [['band', 0, '20 Ya (penuh)'], ['band', 1, '16–19 Ya'], ['band', 2, '≤15 Ya']]],
  ['Warna jawaban', [['yes', null, 'Ya'], ['no', null, 'Tidak']]],
  ['Warna aspek', [['aspek', 0, 'Pemahaman dasar'], ['aspek', 1, 'Persiapan'], ['aspek', 2, 'Kesiapan']]]
];
const get = (k, i) => i == null ? cur[k] : cur[k][i];

export function themeSection() {
  const warn = [...cur.band, cur.yes, cur.no].some(c => contrast(c, inkOn(c)) < 4.5);
  return `<fieldset class="theme"><legend>Warna &amp; tampilan</legend>
  <p class="note">Pilih tema siap pakai, atau ubah warna satu per satu. Perubahan langsung terlihat di graf.</p>
  <div class="presets">${Object.entries(PRESETS).map(([k, p]) => `<button type="button" class="preset" data-preset="${k}" aria-pressed="${cur.preset === k}"><span class="pv">${p.band.map(c => `<i style="background:${c}"></i>`).join('')}</span>${p.name}</button>`).join('')}</div>
  ${FIELDS.map(([title, rows]) => `<div class="cgrp"><h5>${title}</h5>${rows.map(([k, i, lab]) => `<label class="cpick"><input type="color" data-color="${k}" ${i == null ? '' : `data-i="${i}"`} value="${get(k, i)}" aria-label="${lab}"><span>${lab}</span></label>`).join('')}</div>`).join('')}
  ${warn ? '<p class="warn" role="status">Ada warna yang terlalu pucat sehingga tulisan di atasnya sulit dibaca. Pilih warna yang lebih pekat.</p>' : ''}
  <button type="button" class="btn wide" data-act="theme-reset">Kembalikan warna awal</button></fieldset>`;
}

/* Dipanggil dari main.js; mengembalikan true bila event ditangani */
export function themeEvent(e) {
  const t = e.target;
  if (e.type === 'click') {
    const p = t.closest('[data-preset]');
    if (p) { apply({ ...PRESETS[p.dataset.preset], preset: p.dataset.preset }); onChange(true); return true; }
    if (t.dataset.act === 'theme-reset') { apply({ ...PRESETS.kontras, preset: 'kontras' }); onChange(true); return true; }
  }
  if (e.type === 'input' && t.dataset.color) {
    const n = structuredClone(cur), k = t.dataset.color, i = t.dataset.i;
    if (i == null) n[k] = t.value; else n[k][+i] = t.value;
    n.preset = 'custom'; apply(n); onChange(false); return true;
  }
  return false;
}
