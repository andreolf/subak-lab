// Subak cascade: 5 paddies, broad-crested notch weirs, lumped mass balance (educational approximation)
// Numbers (estimates, from the offline analysis): C=(2/3)^1.5≈0.544, b=0.20 m, A=200 m², crest 5 cm, E=5 mm/d, infiltration 1.5 mm/d
export const K = { rho: 1000, g: 9.81, C: (2 / 3) ** 1.5, N: 5, crest: 0.05, bund: 0.15, E: 5e-3 / 86400, q: 1.5e-3 / 86400,
  ke: 8e-5, uSoil: 0.25, uStone: 1.5, bMax: 1.2 };
export const weir = (b, H) => (H > 0 ? K.C * b * Math.sqrt(K.g) * H ** 1.5 : 0);
export class Cascade {
  constructor(o = {}) { this.Qin = 1e-3; this.A = 200; this.b = 0.2; this.tembuku = false; this.share = 0.5; this.losses = true; this.reset(o.full); }
  reset(full = false) {
    this.t = 0;
    this.P = Array.from({ length: K.N }, () => ({ h: 0, c: K.crest, db: 0, blocked: false, stones: true, Qn: 0, Qo: 0, overtop: false }));
    if (full) { const H = this.H0(); this.P.forEach((p, i) => (p.h = K.crest + H * (1 - 0.0 * i))); }
  }
  H0() { const Q = this.Qin * (this.tembuku ? this.share : 1); return Q > 0 ? (Q / (K.C * this.b * Math.sqrt(K.g))) ** (2 / 3) : 0; }
  inflow() { return this.Qin * (this.tembuku ? this.share : 1); }
  rates(h) {
    const A = this.A, Lb = Math.sqrt(A); let Qup = this.inflow(); const dh = new Array(K.N), out = [];
    for (let i = 0; i < K.N; i++) {
      const p = this.P[i], b = Math.min(K.bMax, this.b + p.db);
      const Qn = p.blocked ? 0 : weir(b, h[i] - p.c);
      const Qo = weir(Lb, h[i] - K.bund);
      const loss = h[i] > 0 ? A * (this.losses ? K.E + K.q : 0) : 0;
      dh[i] = (Qup - Qn - Qo - loss) / A; out.push([Qn, Qo, b]);
      Qup = Qn + Qo;
    }
    return { dh, out };
  }
  step(dt) {
    const h0 = this.P.map((p) => p.h);
    const k1 = this.rates(h0).dh, hm = h0.map((h, i) => Math.max(0, h + 0.5 * dt * k1[i]));
    const r2 = this.rates(hm);
    this.P.forEach((p, i) => {
      p.h = Math.max(0, p.h + dt * r2.dh[i]); p.Qn = r2.out[i][0]; p.Qo = r2.out[i][1]; p.overtop = p.Qo > 1e-6;
      // crest erosion: critical-flow velocity over the sill vs. critical velocity of the material
      const H = Math.max(0, p.h - p.c), u = p.blocked ? 0 : Math.sqrt(K.g * 2 / 3 * H), uc = p.stones ? K.uStone : K.uSoil;
      if (u > uc && p.c > 0) { const r = K.ke * (u - uc) * dt; p.c = Math.max(0, p.c - r); p.db = Math.min(K.bMax - this.b, p.db + 2 * r); }
    });
    this.t += dt;
  }
  pressure(i) { return K.rho * K.g * this.P[i].h; } // Pa (gauge) at the paddy floor
  tau() { const H = this.H0(), Q = this.inflow(); return Q > 0 && H > 0 ? this.A / (1.5 * Q / H) : Infinity; }
  outflow() { const p = this.P[K.N - 1]; return p.Qn + p.Qo; }
  stored() { return this.P.reduce((s, p) => s + p.h * this.A, 0); }
}
