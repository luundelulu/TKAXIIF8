/* Renderer graf: node DOM yang bermorfing + edge SVG, di dalam satu "world" yang di-zoom/pan.
   Jumlah node ≤ ~60, sehingga DOM+SVG dipilih (teks tajam, elemen interaktif asli). Lihat README untuk alasan. */
import { Simulation } from './physics.js';

export const NODE_MOTION = { duration: 320, easing: [0.34, 1.56, 0.64, 1], idleSize: 56, expandedWidth: 320, expandedRadius: 18 };
const SIZE = {
  r: { min: 48, max: 64, expW: 320, expH: 390, rad: 18 },
  a: { w: 120, h: 56, expW: 340, expH: 400, rad: 14 },
  q: { w: 104, h: 48, expW: 340, expH: 330, rad: 12 }
};

function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = t => ((ax * t + bx) * t + cx) * t, Y = t => ((ay * t + by) * t + cy) * t, dX = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = X(t) - x; if (Math.abs(e) < 1e-5) break; const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
    return Y(t);
  };
}
const ease = bezier(...NODE_MOTION.easing);
const SVGNS = 'http://www.w3.org/2000/svg';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export class Graph {
  constructor(stage, ctx, hooks) {
    this.stage = stage; this.ctx = ctx; this.hooks = hooks;
    stage.innerHTML = `<div class="world"><svg class="edges" width="1" height="1" aria-hidden="true"></svg><div class="nodes"></div></div>`;
    this.world = stage.firstElementChild; this.svg = this.world.firstElementChild; this.layer = this.world.lastElementChild;
    this.sim = new Simulation(); this.pool = new Map(); this.lines = []; this.vis = []; this.edges = [];
    this.view = { x: 0, y: 0, k: 1 }; this.expanded = new Set(); this.selectedId = null; this.focusId = null; this.hoverId = null;
    this.multi = false; this.colorMode = 'band'; this.sizeMode = 'deg'; this.running = false; this.first = true;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; this.dirty = true;
    this.rand = mulberry(7); this.ptrs = new Map();
    this.bind();
    new ResizeObserver(() => { this.dirty = true; if (this.first === false && !this.userMoved) this.fit(false); this.kick(); }).observe(stage);
  }

  get dur() { return this.reduced ? 0 : NODE_MOTION.duration; }

  /* ---------- data ---------- */
  setData(g, { colorMode, sizeMode } = {}) {
    if (colorMode) this.colorMode = colorMode; if (sizeMode) this.sizeMode = sizeMode;
    this.g = g; this.edges = g.edges;
    const keep = new Set(g.nodes.map(n => n.id));
    for (const n of this.pool.values()) if (!keep.has(n.id) && n.vis) { n.vis = false; n.el.hidden = true; if (n.expanded) this.collapse(n, true); }
    const nr = g.nodes.length;
    const aspekN = g.nodes.filter(n => n.type === 'a').length, qN = g.nodes.filter(n => n.type === 'q').length;
    let ci = 0;
    const vis = g.nodes.map(d => {
      let n = this.pool.get(d.id);
      if (!n) { n = this.makeNode(d); this.pool.set(d.id, n); }
      Object.assign(n, { deg: d.deg, wdeg: d.wdeg, vis: true, charge: d.type === 'a' ? 9 : d.type === 'q' ? 6 : 1, gravity: d.type === 'r' ? 1 : 0, ring: d.type === 'q' ? { rx: 150 + 17 * qN, ry: 95 + 11 * qN } : d.type === 'a' ? { rx: 270, ry: 170 } : null }); n.el.hidden = false;
      if (n.x === undefined) {
        if (d.type === 'r') { const a = this.rand() * 6.283, r = 60 + this.rand() * 260; n.x = Math.cos(a) * r; n.y = Math.sin(a) * r * 0.7; }
        else { const tot = d.type === 'a' ? aspekN : qN, a = (ci++ / tot) * 6.283 - 1.57, R = d.type === 'a' ? 230 : 330; n.x = Math.cos(a) * R; n.y = Math.sin(a) * R * 0.75; }
        n.vx = n.vy = 0;
      }
      return n;
    });
    // ukuran dasar respondent
    const rs = vis.filter(n => n.type === 'r');
    const val = n => this.sizeMode === 'skor' ? this.ctx.respondents[n.ref].ya : n.deg;
    const vals = rs.map(val), lo = Math.min(...vals), hi = Math.max(...vals);
    this.badgeVaries = new Set(rs.map(n => n.deg)).size > 1;
    rs.forEach(n => { n.base = this.sizeMode === 'flat' || hi === lo ? NODE_MOTION.idleSize : SIZE.r.min + (SIZE.r.max - SIZE.r.min) * (val(n) - lo) / (hi - lo); });
    vis.forEach(n => { this.paintStatic(n); this.setTarget(n, false); });
    this.vis = vis; this.layer.classList.toggle('no-badge', !this.badgeVaries);
    const by = new Map(vis.map(n => [n.id, n]));
    const mode = this.hooks.mode();
    const links = g.edges.map(e => ({
      source: by.get(e.s), target: by.get(e.t),
      distance: mode === 'aspek' ? 150 + (1 - e.w) * 110 : mode === 'mirip' ? 80 + (1 - e.w) * 140 : 300,
      strength: mode === 'mirip' ? 0.06 : mode === 'celah' ? 0.025 : 0.1
    }));
    g.edges.forEach((e, i) => { links[i].e = e; });
    this.sim.set(vis, links);
    this.sim.bounds = { hw: 110 + 105 * Math.sqrt(nr), hh: 60 + 56 * Math.sqrt(nr) };
    this.buildLines();
    for (const n of vis) if (n.expanded) this.fillBody(n);
    if (this.focusId && !by.has(this.focusId)) this.clearFocus();
    if (this.first) {
      this.sim.alpha = 1; for (let i = 0; i < 320; i++) this.sim.tick(); this.sim.alpha = 0;
      this.first = false; this.fit(false);
    } else this.sim.reheat(0.6);
    this.applyHighlight(); this.dirty = true; this.kick();
  }

  makeNode(d) {
    const el = document.createElement('div');
    el.className = 'node t-' + d.type; el.dataset.id = d.id; el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-expanded', 'false');
    el.innerHTML = `<div class="face"></div><div class="panel"><header></header><div class="body"></div></div>`;
    this.layer.appendChild(el);
    const n = { id: d.id, type: d.type, ref: d.ref, el, face: el.firstChild, panel: el.lastChild, deg: 0, wdeg: 0, w: 0, h: 0, rad: 0, vx: 0, vy: 0, expanded: false, immovable: false, fx: null, fy: null, pinUser: false, anim: null, base: 56 };
    const sz = d.type === 'r' ? null : SIZE[d.type]; n.w = sz ? sz.w : 56; n.h = sz ? sz.h : 56; n.rad = sz ? sz.rad : 28;
    return n;
  }

  /* konten + warna yang tidak menyebabkan perubahan geometri */
  paintStatic(n) {
    const c = this.ctx, st = n.el.style;
    if (n.type === 'r') {
      const r = c.respondents[n.ref];
      st.setProperty('--c', this.hooks.colorOf(n)); n.face.innerHTML = `<span class="ini">${initials(r.nama)}</span>${n.deg ? `<span class="badge">${n.deg}</span>` : ''}`;
      n.el.setAttribute('aria-label', `${r.nama}, ${r.ya} dari 20 Ya, ${n.deg} relasi`);
    } else {
      const l = this.hooks.label(n); st.setProperty('--c', l.color);
      n.face.innerHTML = `<span class="l1">${l.t}</span><span class="l2">${l.s}</span>`;
      n.el.setAttribute('aria-label', `${l.aria}, ${n.deg} relasi`);
    }
  }
  restyle(opts = {}) { Object.assign(this, opts); this.setData(this.g); }
  refreshLabels() { for (const n of this.vis) { this.paintStatic(n); if (n.expanded) this.fillBody(n); } }

  setTarget(n, animate = true) {
    let to;
    if (n.expanded) { const s = SIZE[n.type]; to = { w: s.expW, h: s.expH, r: s.rad }; }
    else if (n.type === 'r') to = { w: n.base, h: n.base, r: n.base / 2 };
    else { const s = SIZE[n.type]; to = { w: s.w, h: s.h, r: s.rad }; }
    const same = Math.abs(to.w - n.w) < .5 && Math.abs(to.h - n.h) < .5;
    if (same) { n.anim = null; Object.assign(n, { w: to.w, h: to.h, rad: to.r }); return; }
    if (!animate || !this.dur) { n.anim = null; Object.assign(n, { w: to.w, h: to.h, rad: to.r }); return; }
    n.anim = { t0: performance.now(), from: { w: n.w, h: n.h, r: n.rad }, to };
  }

  buildLines() {
    const need = this.edges.length;
    while (this.lines.length < need) { const l = document.createElementNS(SVGNS, 'line'); this.svg.appendChild(l); this.lines.push(l); }
    this.lines.forEach((l, i) => {
      if (i >= need) { l.style.display = 'none'; return; }
      const e = this.edges[i]; l.style.display = '';
      l.setAttribute('stroke', e.color);
      l.setAttribute('stroke-width', this.hooks.mode() === 'mirip' ? 0.8 + 2.2 * (e.w - 0.8) / 0.2 : 0.8 + 3.2 * e.w);
      l.dataset.o = this.hooks.mode() === 'mirip' ? 0.2 + 0.5 * (e.w - 0.8) / 0.2 : 0.22 + 0.6 * e.w;
      l.style.strokeLinecap = 'round';
    });
  }

  /* ---------- loop ---------- */
  kick() { if (!this.running) { this.running = true; requestAnimationFrame(t => this.frame(t)); } }
  frame(now) {
    let busy = false;
    for (const n of this.vis) if (n.anim) {
      const a = n.anim, p = Math.min(1, (now - a.t0) / this.dur), e = ease(p);
      n.w = a.from.w + (a.to.w - a.from.w) * e; n.h = a.from.h + (a.to.h - a.from.h) * e; n.rad = Math.max(2, a.from.r + (a.to.r - a.from.r) * e);
      if (p >= 1) { Object.assign(n, { w: a.to.w, h: a.to.h, rad: a.to.r }); n.anim = null; }
      busy = true; this.dirty = true;
    }
    if (busy) this.sim.reheat(0.28);
    if (this.sim.active) { this.sim.tick(); this.dirty = true; busy = true; }
    if (this.va) { const p = Math.min(1, (now - this.va.t0) / this.va.d), e = 1 - Math.pow(1 - p, 3); for (const k of ['x', 'y', 'k']) this.view[k] = this.va.f[k] + (this.va.t[k] - this.va.f[k]) * e; if (p >= 1) this.va = null; busy = true; this.dirty = true; }
    if (this.dragging) busy = true;
    if (this.dirty) { this.render(); this.dirty = false; }
    if (busy && !document.hidden) requestAnimationFrame(t => this.frame(t)); else this.running = false;
  }

  render() {
    const v = this.view, r = this.stage.getBoundingClientRect();
    this.world.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.k})`;
    this.world.classList.toggle('lod-far', v.k < 0.55);
    for (const n of this.vis) {
      const sx = n.x * v.k + v.x, sy = n.y * v.k + v.y, hw = n.w * v.k / 2 + 8, hh = n.h * v.k / 2 + 8;
      const off = sx + hw < 0 || sx - hw > r.width || sy + hh < 0 || sy - hh > r.height;
      if (off !== n.culled) { n.culled = off; n.el.style.visibility = off ? 'hidden' : ''; }
      if (off) continue;
      const s = n.el.style;
      s.width = n.w + 'px'; s.height = n.h + 'px'; s.borderRadius = n.rad + 'px';
      s.transform = `translate3d(${n.x - n.w / 2}px,${n.y - n.h / 2}px,0)`;
      const open = n.expanded && (n.w > SIZE[n.type].expW * 0.72);
      if (open !== n.open) { n.open = open; n.el.classList.toggle('open', open); }
    }
    for (let i = 0; i < this.edges.length; i++) {
      const e = this.edges[i], l = this.lines[i], s = this.pool.get(e.s), t = this.pool.get(e.t);
      l.setAttribute('x1', s.x); l.setAttribute('y1', s.y); l.setAttribute('x2', t.x); l.setAttribute('y2', t.y);
    }
  }

  /* ---------- seleksi / ekspansi ---------- */
  toggle(id) { const n = this.pool.get(id); if (!n || !n.vis) return; n.expanded ? this.collapse(n) : this.expand(n); }
  expand(n) {
    if (!this.multi) for (const o of [...this.expanded]) if (o !== n.id) this.collapse(this.pool.get(o), true);
    n.expanded = true; n.immovable = true; this.expanded.add(n.id);
    n.fx = n.x; n.fy = n.y; n.el.classList.add('expanded'); n.el.setAttribute('aria-expanded', 'true');
    this.fillBody(n); this.setTarget(n); this.selectedId = n.id; this.afterChange();
    this.ensureVisible(n);
  }
  collapse(n, silent) {
    if (!n || !n.expanded) return;
    n.expanded = false; n.immovable = false; this.expanded.delete(n.id);
    if (!n.pinUser) { n.fx = n.fy = null; }
    n.el.classList.remove('expanded', 'open'); n.open = false; n.el.setAttribute('aria-expanded', 'false');
    this.setTarget(n);
    if (this.selectedId === n.id) this.selectedId = [...this.expanded].pop() ?? null;
    if (!silent) this.afterChange();
  }
  collapseAll() { for (const id of [...this.expanded]) this.collapse(this.pool.get(id), true); this.afterChange(); }
  collapseSelected() { if (this.selectedId) { this.collapse(this.pool.get(this.selectedId)); return true; } return false; }
  afterChange() { this.sim.reheat(0.35); this.applyHighlight(); this.hooks.onSelect(this.selectedId); this.dirty = true; this.kick(); }

  fillBody(n) {
    const b = this.hooks.body(n);
    n.panel.firstChild.innerHTML = `<span class="chip">${b.chip}</span><div class="ttl"><strong>${b.title}</strong><small>${b.sub}</small></div><button class="x" type="button" aria-label="Ciutkan node" data-close>×</button>`;
    n.panel.lastChild.innerHTML = b.html;
  }

  neighbors(id) {
    const s = new Set([id]); const adj = this.g.adj.get(id) || [];
    for (const e of adj) { s.add(e.s); s.add(e.t); } return s;
  }
  applyHighlight() {
    const emph = this.hoverId || this.selectedId, nb = emph ? this.neighbors(emph) : null;
    const fs = this.focusId ? this.neighbors(this.focusId) : null;
    this.layer.classList.toggle('has-emph', !!nb);
    for (const n of this.vis) {
      n.el.classList.toggle('dim', !!nb && !nb.has(n.id));
      n.el.classList.toggle('hl', !!nb && nb.has(n.id) && n.id !== emph);
      n.el.classList.toggle('faded', !!fs && !fs.has(n.id));
      n.el.classList.toggle('sel', n.id === this.selectedId);
    }
    this.edges.forEach((e, i) => {
      const l = this.lines[i]; let o = +l.dataset.o;
      if (fs && !(fs.has(e.s) && fs.has(e.t))) o = 0.04;
      else if (emph) o = (e.s === emph || e.t === emph) ? Math.min(1, o + 0.35) : 0.06;
      l.style.opacity = o;
    });
  }
  setHover(id) { if (this.hoverId === id) return; this.hoverId = id; this.applyHighlight(); }
  focusNeighborhood(id) {
    this.focusId = id; this.applyHighlight(); this.hooks.onFocus(id);
    const ns = [...this.neighbors(id)].map(x => this.pool.get(x));
    this.fitNodes(ns, true);
  }
  clearFocus() { if (!this.focusId) return; this.focusId = null; this.applyHighlight(); this.hooks.onFocus(null); }
  focusNode(id) {
    const n = this.pool.get(id); if (!n || !n.vis) return false;
    if (!n.expanded) this.expand(n); this.userMoved = true;
    const k = clamp(Math.max(this.view.k, 0.9), 0.25, 1.1), r = this.stage.getBoundingClientRect();
    this.animateView({ k, x: r.width / 2 - n.x * k, y: r.height / 2 - n.y * k });
    n.el.classList.remove('pulse'); void n.el.offsetWidth; n.el.classList.add('pulse');
    return true;
  }
  unpinAll() { for (const n of this.pool.values()) if (n.pinUser) { n.pinUser = false; n.el.classList.remove('pinned'); if (!n.expanded) n.fx = n.fy = null; } this.sim.reheat(0.5); this.kick(); this.hooks.onPins(0); }
  get pinCount() { let c = 0; for (const n of this.pool.values()) if (n.pinUser && n.vis) c++; return c; }

  /* ---------- viewport ---------- */
  animateView(t, ms = 380) {
    if (this.reduced) { this.view = { ...t }; this.dirty = true; this.kick(); return; }
    this.va = { t0: performance.now(), d: ms, f: { ...this.view }, t }; this.kick();
  }
  fitNodes(ns, animate = true, margin = 56) {
    const r = this.stage.getBoundingClientRect(); if (!ns.length || !r.width) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const n of ns) { x0 = Math.min(x0, n.x - n.w / 2); x1 = Math.max(x1, n.x + n.w / 2); y0 = Math.min(y0, n.y - n.h / 2); y1 = Math.max(y1, n.y + n.h / 2); }
    const bw = x1 - x0, bh = y1 - y0;
    const k = clamp(Math.min((r.width - margin * 2) / bw, (r.height - margin * 2) / bh), 0.25, 1.3);
    const t = { k, x: r.width / 2 - (x0 + x1) / 2 * k, y: r.height / 2 - (y0 + y1) / 2 * k };
    if (animate) this.animateView(t); else { this.view = t; this.dirty = true; this.kick(); }
  }
  fit(animate = true) { this.userMoved = false; this.fitNodes(this.vis, animate); }
  reset() { this.clearFocus(); this.fit(true); }
  zoomBy(f, cx, cy) {
    const r = this.stage.getBoundingClientRect(); cx ??= r.width / 2; cy ??= r.height / 2;
    const v = this.view, k = clamp(v.k * f, 0.25, 2.4), s = k / v.k;
    this.userMoved = true; this.va = null;
    this.view = { k, x: cx - (cx - v.x) * s, y: cy - (cy - v.y) * s }; this.dirty = true; this.kick();
  }
  ensureVisible(n) {
    const r = this.stage.getBoundingClientRect(), v = this.view, s = SIZE[n.type], m = 16;
    const L = (n.x - s.expW / 2) * v.k + v.x, R = (n.x + s.expW / 2) * v.k + v.x, T = (n.y - s.expH / 2) * v.k + v.y, B = (n.y + s.expH / 2) * v.k + v.y;
    let dx = 0, dy = 0;
    if (R - L > r.width - 2 * m) dx = r.width / 2 - (L + R) / 2; else { if (L < m) dx = m - L; else if (R > r.width - m) dx = r.width - m - R; }
    if (B - T > r.height - 2 * m) dy = r.height / 2 - (T + B) / 2; else { if (T < m) dy = m - T; else if (B > r.height - m) dy = r.height - m - B; }
    if (dx || dy) { this.userMoved = true; this.animateView({ k: v.k, x: v.x + dx, y: v.y + dy }, 360); }
  }
  toWorld(cx, cy) { const r = this.stage.getBoundingClientRect(); return { x: (cx - r.left - this.view.x) / this.view.k, y: (cy - r.top - this.view.y) / this.view.k }; }

  /* ---------- input ---------- */
  bind() {
    const st = this.stage;
    st.addEventListener('pointerdown', e => this.down(e));
    st.addEventListener('pointermove', e => this.move(e));
    st.addEventListener('pointerup', e => this.up(e));
    st.addEventListener('pointercancel', e => this.up(e));
    st.addEventListener('wheel', e => {
      const b = e.target.closest?.('.body');
      if (b && b.scrollHeight > b.clientHeight + 1) return;
      e.preventDefault(); const r = st.getBoundingClientRect();
      this.zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    st.addEventListener('pointerover', e => { if (this.dragging || e.pointerType === 'touch') return; const n = e.target.closest?.('.node'); if (n) this.setHover(n.dataset.id); });
    st.addEventListener('pointerout', e => { if (!e.relatedTarget || !e.relatedTarget.closest?.('.node')) this.setHover(null); });
    st.addEventListener('keydown', e => {
      const n = e.target.closest?.('.node'); if (!n || e.target !== n) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.toggle(n.dataset.id); }
    });
    st.addEventListener('focusin', e => { const n = e.target.classList?.contains('node') ? e.target : null; if (n) this.setHover(n.dataset.id); });
    st.addEventListener('focusout', () => this.setHover(null));
  }
  down(e) {
    if (e.button > 0) return;
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.ptrs.size === 2) { const [a, b] = [...this.ptrs.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: this.view.k }; this.drag = null; this.dragging = false; return; }
    const nodeEl = e.target.closest?.('.node');
    if (e.target.closest?.('[data-close]')) { this.collapse(this.pool.get(nodeEl.dataset.id)); return; }
    const inBody = e.target.closest?.('.body');
    if (nodeEl && !inBody) {
      const n = this.pool.get(nodeEl.dataset.id), w = this.toWorld(e.clientX, e.clientY);
      this.drag = { kind: 'node', n, sx: e.clientX, sy: e.clientY, ox: n.x - w.x, oy: n.y - w.y, moved: false };
    } else if (!inBody) this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y, moved: false };
    else this.drag = null;
  }
  move(e) {
    if (this.ptrs.has(e.pointerId)) this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.ptrs.size === 2) {
      const [a, b] = [...this.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = this.stage.getBoundingClientRect();
      const target = this.pinch.k * d / this.pinch.d; this.zoomBy(target / this.view.k, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); return;
    }
    const d = this.drag; if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
    if (!d.moved) { d.moved = true; this.dragging = true; try { this.stage.setPointerCapture(e.pointerId); } catch {} this.stage.classList.add('grabbing'); this.setHover(null); }
    if (d.kind === 'pan') { this.userMoved = true; this.va = null; this.view.x = d.vx + e.clientX - d.sx; this.view.y = d.vy + e.clientY - d.sy; this.dirty = true; }
    else { const w = this.toWorld(e.clientX, e.clientY); d.n.fx = w.x + d.ox; d.n.fy = w.y + d.oy; d.n.immovable = true; this.sim.reheat(0.3); }
    this.kick();
  }
  up(e) {
    this.ptrs.delete(e.pointerId); if (this.ptrs.size < 2) this.pinch = null;
    const d = this.drag; this.drag = null; this.dragging = false; this.stage.classList.remove('grabbing');
    if (!d) return;
    if (d.kind === 'node') {
      const n = d.n;
      if (d.moved) { n.pinUser = true; n.immovable = n.expanded; n.el.classList.add('pinned'); n.fx = n.x; n.fy = n.y; this.hooks.onPins(this.pinCount); }
      else {
        const now = performance.now();
        this.toggle(n.id);
        if (this.lastClick && this.lastClick.id === n.id && now - this.lastClick.t < 320) { this.focusNeighborhood(n.id); this.lastClick = null; }
        else this.lastClick = { id: n.id, t: now };
      }
    } else if (!d.moved) { this.collapseAll(); this.clearFocus(); }
    this.kick();
  }
}
