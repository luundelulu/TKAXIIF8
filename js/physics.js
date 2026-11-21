/* Simulasi gaya sederhana untuk node berukuran persegi panjang. Tanpa dependensi. */
export const PHYSICS_CONFIG = {
  repulsion: -180,
  linkDistance: 140,
  collisionPadding: 16,
  velocityDecay: 0.35,
  alphaDecay: 0.025,
  alphaMin: 0.004,
  centerStrength: 0.04,
  linkStrength: 0.12,
  maxRepelDist: 520
};

export class Simulation {
  constructor(cfg = {}) {
    this.cfg = { ...PHYSICS_CONFIG, ...cfg };
    this.nodes = []; this.links = []; this.alpha = 0; this.bounds = { hw: 600, hh: 420 };
  }
  set(nodes, links) { this.nodes = nodes; this.links = links; }
  reheat(a = 0.5) { this.alpha = Math.max(this.alpha, a); }
  get active() { return this.alpha > this.cfg.alphaMin; }

  tick() {
    const c = this.cfg, ns = this.nodes, n = ns.length;
    this.alpha += (0 - this.alpha) * c.alphaDecay;
    const a = this.alpha;
    // gravitasi ke pusat
    for (const p of ns) { const g = c.centerStrength * (p.gravity ?? 1) * a; p.vx -= p.x * g; p.vy -= p.y * g * (c.yPull ?? 1.6); }
    // cincin: container dipertahankan di sekeliling responden (bentuk elips)
    for (const p of ns) if (p.ring && p.fx == null) {
      const s = Math.hypot(p.x / p.ring.rx, p.y / p.ring.ry) || 1e-6;
      p.vx += (p.x / s - p.x) * 0.6 * a; p.vy += (p.y / s - p.y) * 0.6 * a;
    }
    // pegas relasi
    for (const l of this.links) {
      const s = l.source, t = l.target;
      let dx = t.x + t.vx - s.x - s.vx, dy = t.y + t.vy - s.y - s.vy;
      const d = Math.hypot(dx, dy) || 1e-6;
      const rest = l.distance ?? c.linkDistance;
      const k = (d - rest) / d * (l.strength ?? c.linkStrength) * a;
      const bias = s.deg / ((s.deg + t.deg) || 1);
      dx *= k; dy *= k;
      t.vx -= dx * bias; t.vy -= dy * bias; s.vx += dx * (1 - bias); s.vy += dy * (1 - bias);
    }
    // tolakan antar node (skala dengan ukuran)
    const R2 = c.maxRepelDist * c.maxRepelDist;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const p = ns[i], q = ns[j];
      let dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy;
      if (d2 > R2) continue;
      if (d2 < 1) { dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); d2 = dx * dx + dy * dy + 1; }
      const sz = (Math.max(p.w, p.h) + Math.max(q.w, q.h)) / 112; // 1 untuk dua node 56px
      const w = c.repulsion * sz * Math.sqrt((p.charge || 1) * (q.charge || 1)) * a / Math.max(d2, 900);
      const fx = dx * w, fy = dy * w;
      p.vx -= fx; p.vy -= fy; q.vx += fx; q.vy += fy;
    }
    // integrasi
    for (const p of ns) {
      if (p.fx != null) { p.x = p.fx; p.y = p.fy; p.vx = p.vy = 0; continue; }
      p.vx *= 1 - c.velocityDecay; p.vy *= 1 - c.velocityDecay;
      p.x += p.vx; p.y += p.vy;
    }
    this.collide();
    // batas area graf
    const { hw, hh } = this.bounds;
    for (const p of ns) {
      if (p.fx != null) continue;
      const mx = hw - p.w / 2, my = hh - p.h / 2;
      if (p.x > mx) { p.x = mx; p.vx = 0; } else if (p.x < -mx) { p.x = -mx; p.vx = 0; }
      if (p.y > my) { p.y = my; p.vy = 0; } else if (p.y < -my) { p.y = -my; p.vy = 0; }
    }
  }

  /* Tumbukan AABB memakai ukuran aktual (w,h) saat ini. Node 'immovable' (diperluas/diseret) tidak bergeser. */
  collide(iter = 2) {
    const ns = this.nodes, n = ns.length, pad = this.cfg.collisionPadding;
    for (let it = 0; it < iter; it++) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const p = ns[i], q = ns[j];
      const dx = q.x - p.x, dy = q.y - p.y;
      const ox = (p.w + q.w) / 2 + pad - Math.abs(dx), oy = (p.h + q.h) / 2 + pad - Math.abs(dy);
      if (ox <= 0 || oy <= 0) continue;
      const pm = p.immovable ? 0 : 1, qm = q.immovable ? 0 : 1, tot = pm + qm;
      if (!tot) continue;
      let mx = 0, my = 0;
      // dorong sepanjang sumbu overlap terkecil; tambahkan komponen radial agar tidak menumpuk di satu sisi
      if (ox < oy) mx = (dx >= 0 ? 1 : -1) * ox; else my = (dy >= 0 ? 1 : -1) * oy;
      const k = 0.85;
      p.x -= mx * k * pm / tot; p.y -= my * k * pm / tot;
      q.x += mx * k * qm / tot; q.y += my * k * qm / tot;
      if (p.fx != null && !p.immovable) { p.fx = p.x; p.fy = p.y; }
      if (q.fx != null && !q.immovable) { q.fx = q.x; q.fy = q.y; }
    }
  }
}
