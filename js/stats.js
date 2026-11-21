/* Statistik, filter, dan pembangunan graf. Semua angka dihitung dari model hasil worker. */
export const ASPEK_COLOR = ['#8B5CF6', '#EC4899', '#FB923C'];
export const BANDS = [
  { id: 'full', label: '20 Ya', test: y => y === 20, color: '#4C3D9E' },
  { id: 'high', label: '16–19 Ya', test: y => y >= 16 && y < 20, color: '#8F85C9' },
  { id: 'low', label: '≤15 Ya', test: y => y <= 15, color: '#D4CFEA' }
];
export const KOHORT_COLORS = ['#8B5CF6', '#EC4899', '#FB923C', '#64748B'];
export const bandOf = y => BANDS.find(b => b.test(y));

export function buildContext(model) {
  const N = model.respondents.length;
  const A = new Uint8Array(model.answers);
  const kohorts = [...new Set(model.respondents.map(r => r.kohort))].sort();
  const sim = new Float32Array(N * N); // proporsi jawaban identik
  for (let i = 0; i < N; i++) for (let j = i; j < N; j++) {
    let m = 0; for (let q = 0; q < 20; q++) if (A[i * 20 + q] === A[j * 20 + q]) m++;
    sim[i * N + j] = sim[j * N + i] = m / 20;
  }
  return { ...model, N, A, kohorts, sim, ans: (i, q) => A[i * 20 + q] };
}

export function defaultFilters(ctx) {
  return { kohort: new Set(ctx.kohorts), band: new Set(BANDS.map(b => b.id)), tidakQ: new Set(), minAspekYa: 1, minSim: 0.9 };
}
export function filtersActive(ctx, f) {
  return f.kohort.size !== ctx.kohorts.length || f.band.size !== BANDS.length || f.tidakQ.size > 0 || f.minAspekYa !== 1 || f.minSim !== 0.9;
}

export function visibleIndices(ctx, f) {
  const out = [];
  for (const r of ctx.respondents) {
    if (!f.kohort.has(r.kohort) || !f.band.has(bandOf(r.ya).id)) continue;
    if (f.tidakQ.size) { let hit = false; for (const q of f.tidakQ) if (!ctx.ans(r.i, q)) { hit = true; break; } if (!hit) continue; }
    out.push(r.i);
  }
  return out;
}

export function aggregate(ctx, idx) {
  const n = idx.length;
  const perQ = new Array(20).fill(0);
  for (const i of idx) for (let q = 0; q < 20; q++) perQ[q] += ctx.A[i * 20 + q];
  const perAspek = ctx.aspekQ.map(qs => {
    const ya = qs.reduce((s, q) => s + perQ[q], 0), cells = qs.length * n;
    return { ya, cells, pct: cells ? ya / cells : null };
  });
  const totalYa = perQ.reduce((a, b) => a + b, 0);
  const hist = new Array(21).fill(0);
  for (const i of idx) hist[ctx.respondents[i].ya]++;
  const scores = idx.map(i => ctx.respondents[i].ya).sort((a, b) => a - b);
  const median = n ? (n % 2 ? scores[(n - 1) / 2] : (scores[n / 2 - 1] + scores[n / 2]) / 2) : null;
  const byKohort = ctx.kohorts.map(k => {
    const m = idx.filter(i => ctx.respondents[i].kohort === k);
    const ya = m.reduce((s, i) => s + ctx.respondents[i].ya, 0);
    return { kohort: k, n: m.length, pct: m.length ? ya / (m.length * 20) : null };
  });
  const bands = BANDS.map(b => ({ ...b, n: idx.filter(i => b.test(ctx.respondents[i].ya)).length }));
  return { n, cells: n * 20, totalYa, pct: n ? totalYa / (n * 20) : null, perQ, perAspek, hist, median, byKohort, bands };
}

export function pearson(xs, ys) {
  const n = xs.length; if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

export const MODES = {
  aspek: { label: 'Aspek', hint: 'Responden ↔ 3 aspek. Tebal garis = skor aspek responden.' },
  celah: { label: 'Celah', hint: 'Responden ↔ pertanyaan yang dijawab Tidak.' },
  mirip: { label: 'Kemiripan', hint: 'Responden ↔ responden dengan jawaban identik ≥ ambang.' }
};

/* Graf untuk mode + filter. Node dikembalikan sebagai deskriptor ringan; posisi dikelola graph.js. */
export function buildGraph(ctx, idx, mode, f) {
  const nodes = [], edges = [];
  idx.forEach(i => nodes.push({ id: 'r' + i, type: 'r', ref: i }));
  const set = new Set(idx);
  if (mode === 'aspek') {
    ctx.aspek.forEach((_, a) => nodes.push({ id: 'a' + a, type: 'a', ref: a }));
    for (const i of idx) ctx.aspek.forEach((_, a) => {
      const ya = ctx.respondents[i].aspekYa[a];
      if (ya >= f.minAspekYa) edges.push({ s: 'r' + i, t: 'a' + a, w: ya / ctx.aspekQ[a].length, color: ASPEK_COLOR[a], aspek: a, label: `${ya}/${ctx.aspekQ[a].length} Ya` });
    });
  } else if (mode === 'celah') {
    const qs = f.tidakQ.size ? [...f.tidakQ] : ctx.questions.map((_, q) => q);
    qs.forEach(q => nodes.push({ id: 'q' + q, type: 'q', ref: q }));
    for (const i of idx) for (const q of qs) if (!ctx.ans(i, q)) edges.push({ s: 'r' + i, t: 'q' + q, w: 1, color: ASPEK_COLOR[ctx.questions[q].aspek], aspek: ctx.questions[q].aspek, label: 'Tidak' });
  } else {
    for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
      const w = ctx.sim[idx[a] * ctx.N + idx[b]];
      if (w >= f.minSim - 1e-9) edges.push({ s: 'r' + idx[a], t: 'r' + idx[b], w, color: '#8B5CF6', aspek: -1, label: `${Math.round(w * 20)}/20 identik` });
    }
  }
  const deg = new Map(nodes.map(n => [n.id, 0])), wdeg = new Map(nodes.map(n => [n.id, 0])), adj = new Map(nodes.map(n => [n.id, []]));
  const uf = new Map(nodes.map(n => [n.id, n.id]));
  const find = x => { while (uf.get(x) !== x) { uf.set(x, uf.get(uf.get(x))); x = uf.get(x); } return x; };
  edges.forEach((e, k) => {
    e.id = k;
    deg.set(e.s, deg.get(e.s) + 1); deg.set(e.t, deg.get(e.t) + 1);
    wdeg.set(e.s, wdeg.get(e.s) + e.w); wdeg.set(e.t, wdeg.get(e.t) + e.w);
    adj.get(e.s).push(e); adj.get(e.t).push(e);
    uf.set(find(e.s), find(e.t));
  });
  nodes.forEach(n => { n.deg = deg.get(n.id); n.wdeg = wdeg.get(n.id); });
  const comps = new Map(); nodes.forEach(n => { const r = find(n.id); comps.set(r, (comps.get(r) || 0) + 1); });
  const nn = nodes.length;
  const rn = nodes.filter(n => n.type === 'r');
  const metrics = {
    nodes: nn, edges: edges.length,
    density: nn > 1 ? 2 * edges.length / (nn * (nn - 1)) : null,
    components: [...comps.values()].filter(c => c > 1).length,
    largest: Math.max(0, ...[...comps.values()]),
    isolated: rn.filter(n => n.deg === 0).length,
    maxDeg: Math.max(0, ...rn.map(n => n.deg)),
    meanDeg: rn.length ? rn.reduce((s, n) => s + n.deg, 0) / rn.length : null,
    bipartite: mode !== 'mirip'
  };
  return { nodes, edges, adj, set, metrics };
}
