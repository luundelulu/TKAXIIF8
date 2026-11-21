import { Graph } from './graph.js';
import { buildContext, defaultFilters, filtersActive, visibleIndices, aggregate, buildGraph, MODES, ASPEK_COLOR, BANDS, KOHORT_COLORS, bandOf } from './stats.js';
import { panelFor, panelHead, nodeBody, kohortLabel, kohortColor } from './panel.js';
import { respondentsView, relationsView, dataView } from './views.js';
import { esc, pct } from './charts.js';

const $ = (s, r = document) => r.querySelector(s);
const S = { mode: 'aspek', colorMode: 'band', sizeMode: 'deg', scatter: { x: 0, y: 1 }, tab: 'graph', sort: { key: 'ya', dir: -1 }, dataQ: '' };
let G, panelKey = '';

/* ---------------- boot ---------------- */
const worker = new Worker(new URL('worker.js', import.meta.url));
worker.onerror = e => bootFail(e.message || 'Worker gagal dimuat');
worker.onmessage = ({ data }) => {
  if (!data.ok) return bootFail(data.error);
  S.ctx = buildContext(data.model); S.diagnostics = data.diagnostics; S.sources = data.sources;
  const ch = data.diagnostics.filter(d => d.level !== 'info');
  S.diag = { ...data.quality, checks: ch.length, ok: ch.filter(d => d.level === 'ok').length };
  S.filters = defaultFilters(S.ctx);
  worker.terminate();
  init();
};
worker.postMessage({ base: new URL('data/', document.baseURI).href });
function bootFail(m) { $('#bootMsg').textContent = 'Gagal memuat data: ' + m + '. Buka lewat server statis (bukan file://).'; $('.spin').hidden = true; }

/* ---------------- init ---------------- */
function init() {
  const { ctx } = S;
  $('#sub').textContent = `${ctx.kelas ? 'Kelas ' + ctx.kelas + ' · ' : ''}${ctx.N} responden · ${ctx.N * 20} jawaban`;
  G = new Graph($('#stage'), ctx, {
    mode: () => S.mode,
    colorOf: n => S.colorMode === 'band' ? bandOf(ctx.respondents[n.ref].ya).color : kohortColor(ctx, ctx.respondents[n.ref].kohort),
    label: n => n.type === 'a'
      ? { t: esc(ctx.aspek[n.ref]), s: pct(S.agg.perAspek[n.ref].pct, 0) + ' Ya', color: ASPEK_COLOR[n.ref], aria: ctx.aspek[n.ref] }
      : { t: 'Q' + (n.ref + 1), s: pct(S.agg.n ? S.agg.perQ[n.ref] / S.agg.n : null, 0) + ' Ya', color: ASPEK_COLOR[ctx.questions[n.ref].aspek], aria: `Pernyataan ${n.ref + 1}: ${ctx.questions[n.ref].text}` },
    body: n => nodeBody(S, n),
    onSelect: () => { renderPanel(); },
    onFocus: id => { S.focused = id; renderState(); },
    onPins: c => { $('#zPin').hidden = !c; }
  });
  buildModeSeg(); buildPopovers(); bindUI();
  $('#boot').remove();
  refresh();
  window.__app = { S, G };
}

function refresh() {
  S.idx = visibleIndices(S.ctx, S.filters);
  S.agg = aggregate(S.ctx, S.idx);
  S.graph = buildGraph(S.ctx, S.idx, S.mode, S.filters);
  S.filtersOn = filtersActive(S.ctx, S.filters);
  G.setData(S.graph, { colorMode: S.colorMode, sizeMode: S.sizeMode });
  renderPanel(); renderLegend(); renderState(); renderTab(); updateFilterBadge();
}

/* ---------------- panel ---------------- */
function renderPanel() {
  const n = G.selectedId ? G.pool.get(G.selectedId) : null;
  const key = n ? n.id : '';
  const el = $('#panel'), keep = key === panelKey ? el.scrollTop : 0;
  el.innerHTML = panelHead(S, n) + `<div class="pb">${panelFor(S, n)}</div>`;
  el.scrollTop = keep; panelKey = key;
}
function renderState() {
  const m = S.graph.metrics;
  $('#gstate').textContent = `${S.idx.length} dari ${S.ctx.N} responden · ${m.edges} relasi${S.focused ? ' · fokus tetangga (klik area kosong untuk keluar)' : ''}`;
}
function renderLegend() {
  const { ctx, agg } = S;
  const sw = (c, t, n) => `<li><i style="background:${c}"></i>${t}${n != null ? `<b>${n}</b>` : ''}</li>`;
  const col = S.colorMode === 'band'
    ? `<h4>Warna node: jumlah Ya</h4><ul>${agg.bands.map(b => sw(b.color, b.label, b.n)).join('')}</ul>`
    : `<h4>Warna node: tanggal isi</h4><ul>${ctx.kohorts.map(k => sw(kohortColor(ctx, k), kohortLabel(ctx, k), S.idx.filter(i => ctx.respondents[i].kohort === k).length)).join('')}</ul>`;
  const size = S.sizeMode === 'deg' ? 'Ukuran = jumlah relasi' : S.sizeMode === 'skor' ? 'Ukuran = jumlah Ya' : 'Ukuran seragam';
  const edge = S.mode === 'aspek' ? 'Tebal garis = skor aspek' : S.mode === 'mirip' ? 'Tebal garis = kemiripan jawaban' : 'Garis = jawaban Tidak';
  $('#legend').innerHTML = `${col}<p>${size}<br>${edge}</p><p class="hint">${MODES[S.mode].hint}</p>`;
}
function updateFilterBadge() {
  const f = S.filters, c = S.ctx; let k = 0;
  if (f.kohort.size !== c.kohorts.length) k++; if (f.band.size !== BANDS.length) k++; if (f.tidakQ.size) k++; if (f.minAspekYa !== 1) k++; if (f.minSim !== 0.9) k++;
  $('#fCnt').hidden = !k; $('#fCnt').textContent = k;
}

/* ---------------- tabs & views ---------------- */
function renderTab() {
  const t = S.tab; if (t === 'graph') return;
  const el = $('#v-' + t);
  if (t === 'resp') el.innerHTML = respondentsView(S, S.sort);
  else if (t === 'rel') el.innerHTML = relationsView(S);
  else { const had = document.activeElement?.id === 'dataQ'; el.innerHTML = dataView(S, S.dataQ); if (had) { const i = $('#dataQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}
function setTab(t) {
  S.tab = t;
  document.querySelectorAll('.tabs [role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  for (const v of ['graph', 'resp', 'rel', 'data']) $('#v-' + v).hidden = v !== t;
  document.body.dataset.tab = t;
  renderTab(); if (t === 'graph') { G.dirty = true; G.kick(); }
}

/* ---------------- controls ---------------- */
function buildModeSeg() {
  const seg = $('#modeSeg');
  seg.innerHTML = Object.entries(MODES).map(([k, m]) => `<button type="button" role="radio" aria-checked="${k === S.mode}" data-mode="${k}" title="${esc(m.hint)}">${m.label}</button>`).join('');
  seg.addEventListener('click', e => {
    const b = e.target.closest('[data-mode]'); if (!b || b.dataset.mode === S.mode) return;
    S.mode = b.dataset.mode; seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    G.clearFocus(); buildPopovers(); refresh(); G.userMoved = false; setTimeout(() => { if (!G.userMoved) G.fit(true); }, 1100);
  });
}

function buildPopovers() {
  const { ctx } = S, f = S.filters;
  const chk = (name, val, label, on, extra = '') => `<label class="ck"><input type="checkbox" data-f="${name}" value="${val}" ${on ? 'checked' : ''}><span>${label}${extra}</span></label>`;
  $('#popFilter').innerHTML = `<div class="ph2"><strong>Filter</strong><button class="lnk" data-act="clear">Hapus semua filter</button></div>
  <fieldset><legend>Tanggal pengisian</legend>${ctx.kohorts.map(k => chk('kohort', k, kohortLabel(ctx, k), f.kohort.has(k), `<small>${ctx.respondents.filter(r => r.kohort === k).length}</small>`)).join('')}</fieldset>
  <fieldset><legend>Rentang jumlah Ya</legend>${BANDS.map(b => chk('band', b.id, `<i class="sw" style="background:${b.color}"></i>${b.label}`, f.band.has(b.id), `<small>${ctx.respondents.filter(r => b.test(r.ya)).length}</small>`)).join('')}</fieldset>
  <fieldset><legend>Menjawab Tidak pada</legend><div class="qgrid">${ctx.questions.map((q, i) => `<label class="qc" title="${esc(q.text)}"><input type="checkbox" data-f="tidakQ" value="${i}" ${f.tidakQ.has(i) ? 'checked' : ''}><span style="--c:${ASPEK_COLOR[q.aspek]}">Q${i + 1}</span></label>`).join('')}</div><p class="note">Menampilkan responden yang menjawab Tidak pada salah satu yang dipilih.</p></fieldset>
  ${S.mode === 'aspek' ? `<fieldset><legend>Ambang relasi aspek</legend><label class="rg">Garis tampil bila Ya ≥ <b id="vAsp">${f.minAspekYa}</b><input type="range" data-f="minAspekYa" min="1" max="10" step="1" value="${f.minAspekYa}"></label></fieldset>` : ''}
  ${S.mode === 'mirip' ? `<fieldset><legend>Ambang kemiripan</legend><label class="rg">Jawaban identik ≥ <b id="vSim">${Math.round(f.minSim * 100)}%</b><input type="range" data-f="minSim" min="0.5" max="1" step="0.05" value="${f.minSim}"></label></fieldset>` : ''}`;
  $('#popSet').innerHTML = `<div class="ph2"><strong>Pengaturan</strong></div>
  <fieldset><legend>Perluasan node</legend><label class="ck"><input type="radio" name="multi" data-s="multi" value="0" ${!G.multi ? 'checked' : ''}><span>Satu node</span></label><label class="ck"><input type="radio" name="multi" data-s="multi" value="1" ${G.multi ? 'checked' : ''}><span>Beberapa node sekaligus</span></label></fieldset>
  <fieldset><legend>Warna node</legend><label class="ck"><input type="radio" name="col" data-s="color" value="band" ${S.colorMode === 'band' ? 'checked' : ''}><span>Jumlah Ya</span></label><label class="ck"><input type="radio" name="col" data-s="color" value="kohort" ${S.colorMode === 'kohort' ? 'checked' : ''}><span>Tanggal pengisian</span></label></fieldset>
  <fieldset><legend>Ukuran node responden</legend>${[['deg', 'Jumlah relasi'], ['skor', 'Jumlah Ya'], ['flat', 'Seragam']].map(([v, l]) => `<label class="ck"><input type="radio" name="sz" data-s="size" value="${v}" ${S.sizeMode === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</fieldset>
  <fieldset><legend>Gerak</legend><label class="ck"><input type="checkbox" data-s="reduce" ${G.reduced ? 'checked' : ''}><span>Kurangi animasi</span></label></fieldset>
  <button class="btn wide" data-act="unpin">Lepas semua pin posisi</button>`;
}

function bindUI() {
  /* popover */
  const pops = [['#bFilter', '#popFilter'], ['#bSet', '#popSet']];
  const closePops = () => pops.forEach(([b, p]) => { $(p).hidden = true; $(b).setAttribute('aria-expanded', 'false'); });
  pops.forEach(([b, p]) => $(b).addEventListener('click', e => { e.stopPropagation(); const open = $(p).hidden; closePops(); $(p).hidden = !open; $(b).setAttribute('aria-expanded', String(open)); }));
  document.addEventListener('click', e => { if (!e.target.closest('.pop') && !e.target.closest('.acts')) closePops(); if (!e.target.closest('.search')) closeRes(); });
  $('#popFilter').addEventListener('input', e => {
    const t = e.target, k = t.dataset.f; if (!k) return;
    const f = S.filters;
    if (t.type === 'range') { f[k] = +t.value; const lab = k === 'minSim' ? $('#vSim') : $('#vAsp'); lab.textContent = k === 'minSim' ? Math.round(f[k] * 100) + '%' : f[k]; }
    else { const set = f[k], v = k === 'tidakQ' ? +t.value : t.value; t.checked ? set.add(v) : set.delete(v); }
    refresh();
  });
  $('#popFilter').addEventListener('click', e => { if (e.target.dataset.act === 'clear') { S.filters = defaultFilters(S.ctx); buildPopovers(); refresh(); $('#popFilter').hidden = false; } });
  $('#popSet').addEventListener('change', e => {
    const t = e.target, s = t.dataset.s; if (!s) return;
    if (s === 'multi') { G.multi = t.value === '1'; if (!G.multi) { const keep = G.selectedId; for (const id of [...G.expanded]) if (id !== keep) G.collapse(G.pool.get(id), true); G.afterChange(); } }
    if (s === 'color') { S.colorMode = t.value; G.colorMode = t.value; for (const n of G.vis) G.paintStatic(n); renderLegend(); G.kick(); }
    if (s === 'size') { S.sizeMode = t.value; G.sizeMode = t.value; G.setData(S.graph); renderLegend(); }
    if (s === 'reduce') { G.reduced = t.checked; document.body.classList.toggle('reduced', t.checked); }
  });
  $('#popSet').addEventListener('click', e => { if (e.target.dataset.act === 'unpin') { G.unpinAll(); } });

  /* zoom */
  $('#zIn').onclick = () => G.zoomBy(1.25); $('#zOut').onclick = () => G.zoomBy(0.8); $('#zFit').onclick = () => G.reset(); $('#zPin').onclick = () => G.unpinAll();

  /* delegasi klik pada isi node & panel */
  const nav = e => {
    const g = e.target.closest('[data-goto]');
    if (g && !g.closest('.node:not(.open)')) { goTo(g.dataset.goto); return true; }
    if (e.target.closest('[data-clear]')) { G.collapseAll(); return true; }
  };
  $('#stage').addEventListener('click', nav); $('#panel').addEventListener('click', nav);
  $('#panel').addEventListener('change', e => { const k = e.target.dataset.scatter; if (k) { S.scatter[k] = +e.target.value; renderPanel(); } });
  $('#v-resp').addEventListener('click', e => {
    const b = e.target.closest('[data-sort]');
    if (b) { const k = b.dataset.sort; S.sort = { key: k, dir: S.sort.key === k ? -S.sort.dir : (k === 'nama' || k === 'kohort' ? 1 : -1) }; renderTab(); return; }
    const r = e.target.closest('[data-goto]'); if (r) goTo(r.dataset.goto);
  });
  $('#v-resp').addEventListener('keydown', e => { if (e.key === 'Enter') { const r = e.target.closest('tr[data-goto]'); if (r) goTo(r.dataset.goto); } });
  $('#v-data').addEventListener('input', e => { if (e.target.id === 'dataQ') { S.dataQ = e.target.value; renderTab(); } });

  /* tabs & drawer */
  document.querySelectorAll('.tabs [role=tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('#drawerBtn').onclick = () => { const o = $('#panel').classList.toggle('open'); $('#drawerBtn').setAttribute('aria-expanded', String(o)); };

  /* tooltip */
  const tip = $('#tip');
  const place = e => { const w = tip.offsetWidth, h = tip.offsetHeight; tip.style.left = Math.min(innerWidth - w - 8, Math.max(8, e.clientX + 14)) + 'px'; tip.style.top = Math.min(innerHeight - h - 8, e.clientY + 16) + 'px'; };
  document.addEventListener('pointerover', e => { const t = e.target.closest?.('[data-tip]'); if (t) { tip.textContent = t.dataset.tip; tip.hidden = false; place(e); } });
  document.addEventListener('pointermove', e => { if (!tip.hidden) place(e); });
  document.addEventListener('pointerout', e => { if (e.target.closest?.('[data-tip]')) tip.hidden = true; });

  /* pencarian */
  const q = $('#q'), res = $('#qres'); let items = [], act = -1;
  const closeRes = () => { res.hidden = true; q.setAttribute('aria-expanded', 'false'); act = -1; };
  const norm = s => s.normalize('NFKD').toLowerCase();
  const draw = () => {
    const t = norm(q.value.trim()); if (!t) return closeRes();
    items = S.ctx.respondents.filter(r => norm(r.nama).includes(t) || norm(r.email).includes(t)).slice(0, 8);
    res.innerHTML = items.length ? items.map((r, i) => { const vis = S.idx.includes(r.i); return `<li role="option" id="qo${i}" data-i="${r.i}" aria-selected="${i === act}" class="${vis ? '' : 'off'}"><b>${esc(r.nama)}</b><small>${vis ? r.ya + '/20 Ya' : 'disembunyikan filter'}</small></li>`; }).join('') : '<li class="none">Tidak ada responden yang cocok</li>';
    res.hidden = false; q.setAttribute('aria-expanded', 'true');
  };
  const pick = i => { const r = S.ctx.respondents[i]; closeRes(); q.value = r.nama; goTo('r' + i); };
  q.addEventListener('input', () => { act = -1; draw(); });
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (res.hidden) draw(); act = (act + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(items.length, 1); draw(); }
    else if (e.key === 'Enter') { const r = items[act >= 0 ? act : 0]; if (r) pick(r.i); }
    else if (e.key === 'Escape') { if (!res.hidden || q.value) { closeRes(); q.value = ''; e.stopPropagation(); } }
  });
  res.addEventListener('mousedown', e => { const li = e.target.closest('[data-i]'); if (li) { e.preventDefault(); pick(+li.dataset.i); } });

  /* keyboard global */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!$('#popFilter').hidden || !$('#popSet').hidden) { closePops(); return; }
      if (S.tab !== 'graph') return;
      if (G.collapseSelected()) return; if (G.focusId) G.clearFocus(); return;
    }
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || S.tab !== 'graph') return;
    if (e.key === '+' || e.key === '=') G.zoomBy(1.2); else if (e.key === '-') G.zoomBy(1 / 1.2); else if (e.key === '0') G.reset();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) G.kick(); });
}

function goTo(id) {
  if (S.tab !== 'graph') setTab('graph');
  const n = G.pool.get(id);
  if (!n || !n.vis) { toast(id[0] === 'r' ? `${S.ctx.respondents[+id.slice(1)].nama} tidak tampil karena filter saat ini.` : 'Node tidak tampil pada mode atau filter saat ini.'); return; }
  $('#panel').classList.remove('open'); $('#drawerBtn').setAttribute('aria-expanded', 'false');
  requestAnimationFrame(() => G.focusNode(id));
}
let tt;
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 3600); }
