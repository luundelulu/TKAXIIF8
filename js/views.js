/* Tab Responden, Relasi, dan Data. */
import { esc, pct } from './charts.js';
import { MODES, ASPEK_COLOR, bandOf } from './stats.js';
import { kohortLabel } from './panel.js';

const LV = { ok: 'Lolos', info: 'Catatan', warn: 'Perhatian', error: 'Galat' };
const num = (x, d = 1) => x == null ? '–' : x.toFixed(d).replace('.', ',');

export function respondentsView(S, sort) {
  const { ctx } = S;
  const deg = new Map(S.graph.nodes.filter(n => n.type === 'r').map(n => [n.ref, n.deg]));
  const cols = [
    ['nama', 'Nama', r => r.nama], ['kohort', 'Tanggal', r => r.kohort], ['ya', 'Jumlah Ya', r => r.ya],
    ...ctx.aspek.map((a, i) => ['a' + i, a, r => r.aspekYa[i] / ctx.aspekQ[i].length]),
    ['deg', 'Relasi', r => deg.get(r.i) ?? 0], ['tidak', 'Tidak pada', r => 20 - r.ya]
  ];
  const c = cols.find(x => x[0] === sort.key) || cols[0];
  const rows = S.idx.map(i => ctx.respondents[i]).sort((a, b) => {
    const x = c[2](a), y = c[2](b); const d = typeof x === 'string' ? x.localeCompare(y) : x - y; return (d || a.nama.localeCompare(b.nama)) * sort.dir;
  });
  const hidden = ctx.N - rows.length;
  return `<div class="vhead"><h2>Responden</h2><p>${rows.length} dari ${ctx.N} ditampilkan${hidden ? ` · ${hidden} disembunyikan filter` : ''}. Klik baris untuk menyorot di graf.</p></div>
  <div class="tw"><table class="tbl"><thead><tr>${cols.map(([k, l]) => `<th scope="col" aria-sort="${sort.key === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-sort="${k}">${esc(l)}${sort.key === k ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`).join('')}</tr></thead>
  <tbody>${rows.map(r => `<tr tabindex="0" data-goto="r${r.i}"><td><b>${esc(r.nama)}</b><br><small>${esc(r.email)}</small></td><td>${kohortLabel(ctx, r.kohort)}</td><td class="n"><i class="sw" style="background:${bandOf(r.ya).color}"></i>${r.ya}</td>${r.aspekYa.map((y, a) => `<td class="n">${y}/${ctx.aspekQ[a].length}</td>`).join('')}<td class="n">${deg.get(r.i) ?? 0}</td><td class="n">${20 - r.ya}</td></tr>`).join('')}</tbody></table></div>`;
}

export function relationsView(S) {
  const { ctx, graph: g } = S, m = g.metrics;
  const nm = id => id[0] === 'r' ? ctx.respondents[+id.slice(1)].nama : id[0] === 'a' ? ctx.aspek[+id.slice(1)] : 'Q' + (+id.slice(1) + 1);
  const edges = [...g.edges].sort((a, b) => b.w - a.w || nm(a.s).localeCompare(nm(b.s))).slice(0, 300);
  const defs = {
    aspek: 'Garis responden–aspek. Bobot = jumlah Ya pada aspek ÷ jumlah pernyataan aspek. Tebal dan kepekatan garis mengikuti bobot; jarak pegas juga makin pendek untuk bobot tinggi.',
    celah: 'Garis responden–pernyataan hanya bila responden menjawab Tidak. Semua bobot 1. Responden tanpa garis = tidak ada celah pada pernyataan yang tampil.',
    mirip: `Garis responden–responden bila proporsi jawaban identik pada 20 pernyataan ≥ ${Math.round(S.filters.minSim * 100)}%. Ini kemiripan pola jawaban, bukan hubungan sosial; sumber data tidak memuat hubungan antar-responden.`
  };
  return `<div class="vhead"><h2>Relasi</h2><p>Mode <b>${MODES[S.mode].label}</b>: ${defs[S.mode]}</p></div>
  <dl class="dl wide"><div><dt>Node</dt><dd>${m.nodes}</dd></div><div><dt>Relasi</dt><dd>${m.edges}</dd></div><div><dt>Kepadatan</dt><dd>${m.density == null ? '–' : pct(m.density, 1)}</dd></div><div><dt>Komponen (≥2 node)</dt><dd>${m.components}</dd></div><div><dt>Komponen terbesar</dt><dd>${m.largest} node</dd></div><div><dt>Responden terisolasi</dt><dd>${m.isolated}</dd></div></dl>
  <p class="note pad">Deteksi komunitas tidak dihitung: dengan 35 responden dan pola jawaban yang banyak identik, hasilnya tidak stabil dan mudah disalahartikan. Komponen terhubung dipakai sebagai gantinya.</p>
  <div class="tw"><table class="tbl"><thead><tr><th>Dari</th><th>Ke</th><th>Bobot</th><th>Keterangan</th></tr></thead><tbody>${edges.map(e => `<tr><td>${esc(nm(e.s))}</td><td>${esc(nm(e.t))}</td><td class="n">${num(e.w, 2)}</td><td>${esc(e.label)}</td></tr>`).join('')}</tbody></table></div>${g.edges.length > 300 ? `<p class="note pad">Menampilkan 300 dari ${g.edges.length} relasi teratas berdasarkan bobot.</p>` : ''}`;
}

export function dataView(S, q = '') {
  const { ctx } = S, rows = [];
  const ql = q.trim().toLowerCase();
  for (const r of ctx.respondents) for (let k = 0; k < 20; k++) {
    if (ql && !(r.nama.toLowerCase().includes(ql) || ctx.questions[k].text.toLowerCase().includes(ql) || ('q' + (k + 1)) === ql || (ctx.ans(r.i, k) ? 'ya' : 'tidak') === ql)) continue;
    rows.push([r, k]);
  }
  return `<div class="vhead"><h2>Data dan integritas</h2><p>Seluruh pemrosesan terjadi di browser ini. Tidak ada data yang dikirim ke server mana pun.</p></div>
  <h3 class="h3">Sumber</h3><div class="tw"><table class="tbl"><thead><tr><th>Berkas</th><th>Peran</th><th>Baris</th></tr></thead><tbody>${S.sources.map(s => `<tr><td><code>${esc(s.file)}</code></td><td>${esc(s.role)}</td><td class="n">${s.rows}</td></tr>`).join('')}</tbody></table></div>
  <h3 class="h3">Hasil verifikasi silang</h3><ul class="diag">${S.diagnostics.map(d => `<li class="${d.level}"><span class="lv">${LV[d.level]}</span><div><b>${esc(d.title)}</b><p>${esc(d.detail)}</p></div></li>`).join('')}</ul>
  <h3 class="h3">Seluruh jawaban (${rows.length} dari ${ctx.N * 20})</h3>
  <label class="srch2"><span class="sr">Saring jawaban</span><input type="search" id="dataQ" value="${esc(q)}" placeholder="Nama, teks pernyataan, Q7, ya, tidak" autocomplete="off"></label>
  <div class="tw"><table class="tbl"><thead><tr><th>Responden</th><th>Q</th><th>Aspek</th><th>Pernyataan</th><th>Jawaban</th></tr></thead><tbody>${rows.slice(0, 120).map(([r, k]) => `<tr><td>${esc(r.nama)}</td><td class="n">${k + 1}</td><td><i class="sw" style="background:${ASPEK_COLOR[ctx.questions[k].aspek]}"></i>${esc(ctx.aspek[ctx.questions[k].aspek])}</td><td>${esc(ctx.questions[k].text)}</td><td>${ctx.ans(r.i, k) ? 'Ya' : 'Tidak'}</td></tr>`).join('')}</tbody></table></div>${rows.length > 120 ? `<p class="note pad">Menampilkan 120 baris pertama. Persempit pencarian untuk melihat sisanya.</p>` : ''}`;
}
