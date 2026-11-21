/* Konten panel analitik (konteks global / terpilih) dan isi node yang mengembang. */
import { esc, pct, hbars, histogram, donut, bubbleScatter, answerStrip } from './charts.js';
import { ASPEK_COLOR, BANDS, KOHORT_COLORS, STATUS, bandOf, pearson, initials } from './stats.js';

const fmtDate = ts => new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = ts => new Date(ts).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const num = (x, d = 1) => x == null ? '–' : x.toFixed(d).replace('.', ',');
const sec = (title, body, note = '') => `<section class="blk"><h3>${title}</h3>${body}${note ? `<p class="note">${note}</p>` : ''}</section>`;
const mk = items => `<div class="mk">${items.map(([v, l, c]) => `<div style="--k:${c || 'var(--ink)'}"><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
const goto = (id, text, sub = '') => `<button type="button" class="lnk" data-goto="${id}">${esc(text)}${sub ? `<span>${esc(sub)}</span>` : ''}</button>`;
export const kohortLabel = (ctx, k) => fmtDate(new Date(k + 'T12:00:00').getTime());
export const kohortColor = (ctx, k) => KOHORT_COLORS[ctx.kohorts.indexOf(k) % KOHORT_COLORS.length];
const qShort = (ctx, q) => `Q${q + 1}`;

function aspekRows(ctx, perAspekPct, marker) {
  return ctx.aspek.map((a, i) => ({
    label: a, value: perAspekPct[i], color: ASPEK_COLOR[i], marker: marker ? marker[i] : null,
    tip: `${a}: ${pct(perAspekPct[i], 1)} Ya${marker ? ` (rata-rata kelompok ${pct(marker[i], 1)})` : ''}`
  }));
}
function questionRows(ctx, qIdx, perQ, n) {
  return qIdx.map(q => ({
    label: `Q${q + 1}`, value: n ? perQ[q] / n : null, color: ASPEK_COLOR[ctx.questions[q].aspek],
    tip: `Q${q + 1} · ${ctx.questions[q].text} — ${perQ[q]} dari ${n} Ya (${pct(n ? perQ[q] / n : null, 1)})`
  }));
}
const aspekLegend = ctx => `<div class="lg">${ctx.aspek.map((a, i) => `<span><i style="background:${ASPEK_COLOR[i]}"></i>${a}</span>`).join('')}</div>`;

/* ------------------------ panel global ------------------------ */
export function globalPanel(S) {
  const { ctx, agg, graph: g, filtersOn, scatter } = S, m = g.metrics;
  if (!agg.n) return `<div class="empty"><strong>Tidak ada responden yang cocok.</strong><p>Longgarkan filter atau tekan Hapus semua filter.</p></div>`;
  const kpi = (v, l) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`;
  let h = `<div class="kpis">${kpi(`${agg.n}<small>/${ctx.N}</small>`, 'responden')}${kpi(agg.cells, 'jawaban')}${kpi(pct(agg.pct, 1), 'proporsi Ya')}${kpi(num(agg.median / 20 * 100, 0) + '%', 'median Ya')}</div>`;
  h += sec('Struktur relasi pada graf ini', `<dl class="dl"><div><dt>Node</dt><dd>${m.nodes}</dd></div><div><dt>Relasi</dt><dd>${m.edges}</dd></div><div><dt>Kepadatan</dt><dd>${m.density == null ? '–' : pct(m.density, 1)}</dd></div><div><dt>Komponen terhubung</dt><dd>${m.components}</dd></div><div><dt>Responden terisolasi</dt><dd>${m.isolated}</dd></div><div><dt>Derajat rata-rata / maks</dt><dd>${num(m.meanDeg)} / ${m.maxDeg}</dd></div></dl>`,
    S.mode === 'celah' ? 'Terisolasi = responden tanpa jawaban Tidak pada pertanyaan yang tampil.' : S.mode === 'mirip' ? 'Komponen dihitung antar responden; ≥2 node saja yang dihitung sebagai komponen.' : 'Graf dua pihak (responden–aspek): derajat responden = jumlah aspek yang tampil.');
  h += sec('Aspek mana yang paling kuat?', hbars(aspekRows(ctx, agg.perAspek.map(a => a.pct)), { labelW: 100 }), `Persentase Ya dari seluruh jawaban pada aspek tersebut (${agg.n} responden).`);
  const order = [...Array(20).keys()].sort((a, b) => agg.perQ[a] - agg.perQ[b] || a - b);
  h += sec('Pernyataan mana yang paling sering dijawab Tidak?', aspekLegend(ctx) + hbars(questionRows(ctx, order, agg.perQ, agg.n), { labelW: 28, rowH: 19, barH: 8 }), 'Diurutkan dari persentase Ya terendah. Arahkan kursor ke batang untuk teks pernyataan.');
  const marks = agg.n ? ctx.respondents.find(r => false) : null;
  h += sec('Sebaran jumlah Ya per responden', histogram(agg.hist, v => bandOf(v).color), `Warna mengikuti rentang jumlah Ya (sama dengan warna node). Median ${num(agg.median, 1)} dari 20.`);
  h += sec('Proporsi rentang jumlah Ya', donut(agg.bands.map(b => ({ label: b.label, n: b.n, color: b.color })), String(agg.n), 'responden'), 'Rentang bersifat deskriptif untuk pewarnaan, bukan kategori resmi dari kuesioner.');
  h += sec('Per tanggal pengisian', hbars(agg.byKohort.map(k => ({ label: kohortLabel(ctx, k.kohort), value: k.pct, color: kohortColor(ctx, k.kohort), tip: `${kohortLabel(ctx, k.kohort)}: ${k.n} responden, ${pct(k.pct, 1)} Ya` })), { labelW: 80 }) + `<p class="note">n per tanggal: ${agg.byKohort.map(k => `${k.n}`).join(' · ')}</p>`, 'Tanggal pengisian bukan kelompok yang dibandingkan secara statistik; n kecil.');
  const ix = scatter.x, iy = scatter.y, pts = S.idx.map(i => ({ x: ctx.respondents[i].aspekYa[ix], y: ctx.respondents[i].aspekYa[iy] }));
  const r = pearson(pts.map(p => p.x / ctx.aspekQ[ix].length), pts.map(p => p.y / ctx.aspekQ[iy].length));
  const sel = (id, v) => `<select data-scatter="${id}" aria-label="Sumbu ${id}">${ctx.aspek.map((a, i) => `<option value="${i}" ${i === v ? 'selected' : ''}>${a}</option>`).join('')}</select>`;
  h += sec('Apakah dua aspek bergerak bersama?', `<div class="sel2">X ${sel('x', ix)} Y ${sel('y', iy)}</div>` + bubbleScatter(pts, { xLabel: ctx.aspek[ix], yLabel: ctx.aspek[iy], steps: Math.max(ctx.aspekQ[ix].length, ctx.aspekQ[iy].length) }),
    `Ukuran lingkaran = jumlah responden pada titik yang sama. Korelasi Pearson r = ${r == null ? '– (tidak terdefinisi)' : num(r, 2)} pada skor ter-normalisasi 0–1 (n=${pts.length}); sumbu berbeda skala bila jumlah pertanyaan aspek berbeda.`);
  h += sec('Kualitas data', `<dl class="dl"><div><dt>Sel jawaban kosong</dt><dd>${S.diag.empty}</dd></div><div><dt>Baris tidak valid</dt><dd>${S.diag.errors}</dd></div><div><dt>Email / nama ganda</dt><dd>${S.diag.dups}</dd></div><div><dt>Pemeriksaan lolos</dt><dd>${S.diag.ok} / ${S.diag.checks}</dd></div></dl>`, 'Rincian ada di tab Data.');
  return h;
}

/* ------------------------ panel responden ------------------------ */
export function respondentPanel(S, n, compact = false) {
  const { ctx, agg } = S, R = ctx.respondents[n.ref], b = bandOf(R.ya);
  const ans = [...Array(20).keys()].map(q => ctx.ans(R.i, q));
  const mean = agg.perAspek.map(a => a.pct);
  const sorted = S.idx.map(i => ctx.respondents[i].ya).sort((a, c) => c - a), rank = sorted.indexOf(R.ya) + 1, ties = sorted.filter(v => v === R.ya).length;
  const tidak = ans.map((v, q) => v ? -1 : q).filter(q => q >= 0);
  let h = `<div class="score"><b>${R.ya}<small>/20 Ya</small></b><span><i style="background:${b.color}"></i>${b.label}</span></div>`;
  h += mk([[R.ya, 'Ya', STATUS.yes], [20 - R.ya, 'Tidak', STATUS.no], [`#${rank}`, `dari ${agg.n}`]]);
  h += `<p class="meta">${esc(R.email)}<br>Mengisi ${fmtTime(R.ts)} · <span class="dotk" style="--c:${kohortColor(ctx, R.kohort)}"></span>kelompok tanggal ${kohortLabel(ctx, R.kohort)}</p>`;
  h += sec('Skor per aspek', hbars(aspekRows(ctx, R.aspekYa.map((y, a) => y / ctx.aspekQ[a].length), mean), { labelW: 100 }), `Garis tegak = rata-rata responden yang tampil (n=${agg.n}). Nilai = ${R.aspekYa.map((y, a) => `${y}/${ctx.aspekQ[a].length}`).join(', ')}.`);
  h += sec('Jawaban per pernyataan', answerStrip(ans, ctx.questions, ASPEK_COLOR), '✓ hijau = Ya, ✕ merah = Tidak. Garis kecil di bawah = warna aspek.');
  h += sec(`Dijawab Tidak (${tidak.length})`, tidak.length ? `<ul class="qlist">${tidak.map(q => `<li><b style="color:${ASPEK_COLOR[ctx.questions[q].aspek]}">Q${q + 1}</b> ${esc(ctx.questions[q].text)}</li>`).join('')}</ul>` : '<p class="note">Tidak ada. Semua pernyataan dijawab Ya.</p>');
  h += sec('Posisi dalam kelompok', `<p class="plain">Peringkat ${rank} dari ${agg.n} berdasarkan jumlah Ya${ties > 1 ? ` (seri dengan ${ties - 1} responden lain)` : ''}.</p>` + (compact ? '' : histogram(agg.hist, v => bandOf(v).color, R.ya)));
  const edges = (S.graph.adj.get(n.id) || []).map(e => ({ e, o: e.s === n.id ? e.t : e.s }));
  h += sec(`Relasi pada graf (${edges.length})`, edges.length ? `<div class="chips">${edges.sort((a, c) => c.e.w - a.e.w).map(({ e, o }) => goto(o, o[0] === 'r' ? ctx.respondents[+o.slice(1)].nama : o[0] === 'a' ? ctx.aspek[+o.slice(1)] : 'Q' + (+o.slice(1) + 1), e.label)).join('')}</div>` : '<p class="note">Tidak ada relasi pada mode dan filter saat ini.</p>');
  return h;
}

/* ------------------------ panel container ------------------------ */
export function aspekPanel(S, n) {
  const { ctx, agg } = S, a = n.ref, qs = ctx.aspekQ[a], pa = agg.perAspek[a];
  let h = `<div class="score"><b>${pct(pa.pct, 1)}</b><span>Ya, ${pa.ya} dari ${pa.cells} jawaban</span></div>`;
  h += mk([[pa.ya, 'Ya', STATUS.yes], [pa.cells - pa.ya, 'Tidak', STATUS.no], [agg.n, 'responden']]);
  h += sec(`${qs.length} pernyataan`, hbars(questionRows(ctx, qs, agg.perQ, agg.n), { labelW: 28, rowH: 20 }), 'Arahkan kursor ke batang untuk teks pernyataan.');
  const rows = S.idx.map(i => ({ i, y: ctx.respondents[i].aspekYa[a] })).sort((x, y) => x.y - y.y || ctx.respondents[x.i].nama.localeCompare(ctx.respondents[y.i].nama));
  h += sec('Responden dengan skor terendah pada aspek ini', `<div class="chips">${rows.slice(0, 8).map(r => goto('r' + r.i, ctx.respondents[r.i].nama, `${r.y}/${qs.length}`)).join('')}</div>`);
  return h;
}
export function questionPanel(S, n) {
  const { ctx, agg } = S, q = n.ref, Q = ctx.questions[q], ya = agg.perQ[q], tidak = S.idx.filter(i => !ctx.ans(i, q));
  let h = `<p class="plain">${esc(Q.text)}</p><div class="score"><b>${pct(agg.n ? ya / agg.n : null, 1)}</b><span><i style="background:${ASPEK_COLOR[Q.aspek]}"></i>${ctx.aspek[Q.aspek]} · Ya ${ya}, Tidak ${agg.n - ya}</span></div>`;
  h += mk([[ya, 'Ya', STATUS.yes], [agg.n - ya, 'Tidak', STATUS.no]]);
  h += sec(`Menjawab Tidak (${tidak.length})`, tidak.length ? `<div class="chips">${tidak.map(i => goto('r' + i, ctx.respondents[i].nama, `${ctx.respondents[i].ya}/20`)).join('')}</div>` : '<p class="note">Tidak ada.</p>');
  h += sec('Ya per tanggal pengisian', hbars(ctx.kohorts.map(k => { const m = S.idx.filter(i => ctx.respondents[i].kohort === k); const y = m.filter(i => ctx.ans(i, q)).length; return { label: kohortLabel(ctx, k), value: m.length ? y / m.length : null, color: kohortColor(ctx, k), tip: `${kohortLabel(ctx, k)}: ${y} dari ${m.length} Ya` }; }), { labelW: 80 }));
  return h;
}

export function panelFor(S, n) {
  if (!n) return globalPanel(S);
  return n.type === 'r' ? respondentPanel(S, n) : n.type === 'a' ? aspekPanel(S, n) : questionPanel(S, n);
}
export function panelHead(S, n) {
  const { ctx } = S;
  if (!n) return `<div class="ph"><small>Konteks</small><h2>Seluruh data tampil</h2></div>`;
  if (n.type === 'r') return `<div class="ph"><small>Responden <button class="lnk back" data-clear>← ringkasan</button></small><h2>${esc(ctx.respondents[n.ref].nama)}</h2></div>`;
  if (n.type === 'a') return `<div class="ph"><small>Aspek <button class="lnk back" data-clear>← ringkasan</button></small><h2>${esc(ctx.aspek[n.ref])}</h2></div>`;
  return `<div class="ph"><small>Pertanyaan ${n.ref + 1} <button class="lnk back" data-clear>← ringkasan</button></small><h2>${esc(ctx.aspek[ctx.questions[n.ref].aspek])}</h2></div>`;
}

/* isi node mengembang */
export function nodeBody(S, n) {
  const { ctx } = S;
  if (n.type === 'r') { const R = ctx.respondents[n.ref]; return { chip: initials(R.nama), title: esc(R.nama), sub: `${R.ya}/20 Ya · ${n.deg} relasi`, html: respondentPanel(S, n, true) }; }
  if (n.type === 'a') return { chip: 'A', title: esc(ctx.aspek[n.ref]), sub: `${ctx.aspekQ[n.ref].length} pernyataan · ${n.deg} responden terhubung`, html: aspekPanel(S, n) };
  return { chip: 'Q' + (n.ref + 1), title: `Pernyataan ${n.ref + 1}`, sub: `${ctx.aspek[ctx.questions[n.ref].aspek]} · ${n.deg} menjawab Tidak`, html: questionPanel(S, n) };
}
