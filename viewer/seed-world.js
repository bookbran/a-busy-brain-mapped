// The garden (seed.js's world): one canvas, the same node atom as the globe
// and the wordmark, through which the camera travels on the way to the
// member's first seed. Everything here is a form made of nodes: a form is a
// flat array of nodes, each with a place, a size, a colour, a motion class
// and the parameters that class needs, so branches, hanging lanterns, thin
// vines, broad leaves, reeds, petals, spirals and orbiting lights each move
// the way their material would. Seven hero specimens are composed by hand;
// the rest of the garden is simpler, so the heroes read as extraordinary.
//
// Owned by seed.js. Nothing here reads the page, writes the brain, or speaks.
(function () {
  'use strict';

  // ── node layout: a flat array, 15 numbers per node ─────────────────────
  //  0 x  1 y  2 z   rest position, form units (y up)
  //  3 r  4 a  5 c   radius, alpha, colour index into the form's palette
  //  6 m           motion class
  //  7 ph  8 w      phase, and the class's main parameter (tipness, hang length, radius...)
  //  9 ex 10 ey 11 ez  a pivot or centre the class needs
  // 12 q           a second parameter (weight, speed, cycle)
  // 13 bw 14 bp    the sway of the structure this node hangs on (flex, phase)
  const S = 15;
  // STOP (2026-10-07): an obstacle, drawn as a stop sign (an octagon), never a
  // circle, because a circle is a note worth keeping and these are things
  // worth looking beyond. It breathes until it has been read (w = 1).
  const M = { STATIC: 0, BRANCH: 1, PEND: 2, VINE: 3, LEAF: 4, FROND: 5, REED: 6, PETAL: 7, TWIST: 8, HEAVY: 9, ORBIT: 10, PAGE: 11, CORE: 12, SHIMMER: 13, SPIN: 14, FLAME: 15, BREATHE: 16, WAG: 17, LIFT: 18, TICK: 19, RISE: 20, BLOOM: 21, SCURRY: 22, OPEN: 23, STOP: 24 };
  const TAU = Math.PI * 2;

  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function oklchRgb(Lt, C, h) {
    const hr = h * Math.PI / 180, a = C * Math.cos(hr), b = C * Math.sin(hr);
    const l = (Lt + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (Lt - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (Lt - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s]
      .map((v) => { v = Math.max(0, Math.min(1, v)); return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)); });
  }
  const rgb = (c) => 'rgb(' + c.join(',') + ')';
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

  // ── THE OBJECTS. Things that do not grow on plants, in nodes, drawn facing
  // the camera so they read from every angle (y down, own units). ──────────
  const OBJ = {
    lollipop: (P) => { ring(P, 0, -1.1, 1, 11); P.push([0, -1.1, 1.6, 1]); for (let k = 1; k <= 4; k++) P.push([0, -1.1 + 1 + k * 0.42, 0.9, 1]); },
    camera: (P) => { rect(P, -1.3, -0.8, 1.3, 0.8, 14); ring(P, 0.1, 0, 0.5, 7); P.push([-0.7, -1.05, 0.9, 1], [-0.3, -1.05, 0.9, 1]); },
    tractor: (P) => { ring(P, -0.9, 0.2, 0.85, 9); ring(P, 1.0, 0.5, 0.5, 7); line(P, -1.8, -0.5, 1.6, -0.5, 7); rect(P, -0.4, -1.7, 0.6, -0.5, 8); P.push([-1.3, -1.1, 0.9, 1], [-1.3, -1.5, 0.9, 1]); },
    key: (P) => { ring(P, 0, -1.3, 0.62, 9); line(P, 0, -0.65, 0, 1.4, 5); P.push([0.4, 1.4, 0.9, 1], [0.4, 0.9, 0.9, 1], [0.3, 0.4, 0.8, 1]); },
    house: (P) => { rect(P, -1, -0.4, 1, 1.1, 12); line(P, -1.25, -0.4, 0, -1.5, 5); line(P, 0, -1.5, 1.25, -0.4, 5); P.push([0, 0.8, 0.9, 1], [0, 0.35, 0.9, 1]); },
    bulb: (P) => { ring(P, 0, -0.6, 0.85, 11); rect(P, -0.4, 0.35, 0.4, 1.1, 8); P.push([-0.2, -0.3, 0.8, 0.9], [0.2, -0.6, 0.8, 0.9], [-0.2, -0.9, 0.8, 0.9]); },
    umbrella: (P) => { arc(P, 0, 0, 1.4, Math.PI, 2 * Math.PI, 10); line(P, 0, 0, 0, 1.5, 5); P.push([0.25, 1.65, 0.8, 1], [0.5, 1.5, 0.8, 1]); },
    boat: (P) => { arc(P, 0, 0.3, 1.5, 0.15, Math.PI - 0.15, 8); line(P, 0, 0.3, 0, -1.7, 6); line(P, 0.05, -1.6, 1.1, -0.2, 5); line(P, 0.05, -0.2, 1.1, -0.2, 4); },
    heart: (P) => { for (let k = 0; k < 14; k++) { const t = k / 14 * TAU; P.push([Math.sin(t) ** 3 * 1.2, -(1.0 * Math.cos(t) - 0.4 * Math.cos(2 * t) - 0.16 * Math.cos(3 * t) - 0.08 * Math.cos(4 * t)) - 0.2, 0.95, 1]); } },
    cup: (P) => { line(P, -0.9, -0.6, -0.7, 0.9, 5); line(P, 0.9, -0.6, 0.7, 0.9, 5); line(P, -0.7, 0.9, 0.7, 0.9, 4); arc(P, 1.15, 0.1, 0.45, -Math.PI / 2, Math.PI / 2, 5); P.push([-0.3, -1.2, 0.7, 0.7], [0.1, -1.5, 0.7, 0.6], [0.4, -1.1, 0.7, 0.7]); },
    bicycle: (P) => { ring(P, -1.1, 0.4, 0.75, 9); ring(P, 1.1, 0.4, 0.75, 9); line(P, -1.1, 0.4, 0, -0.7, 4); line(P, 0, -0.7, 1.1, 0.4, 4); line(P, -1.1, 0.4, 0.3, 0.4, 3); P.push([0.9, -1.0, 0.9, 1], [-0.2, -1.1, 0.9, 1]); },
    star: (P) => { for (let k = 0; k < 10; k++) { const a = k / 10 * TAU - Math.PI / 2, r = k % 2 ? 0.6 : 1.4; P.push([Math.cos(a) * r, Math.sin(a) * r, k % 2 ? 0.8 : 1, 1]); } },
    book: (P) => { rect(P, -1.3, -0.9, 0, 0.9, 10); rect(P, 0, -0.9, 1.3, 0.9, 10); line(P, -1.0, -0.4, -0.3, -0.4, 3); line(P, 0.3, -0.4, 1.0, -0.4, 3); },
    balloon: (P) => { for (let k = 0; k < 11; k++) { const a = k / 11 * TAU; P.push([Math.cos(a) * 0.85, -0.7 + Math.sin(a) * 1.05, 1, 1]); } for (let k = 1; k <= 4; k++) P.push([Math.sin(k) * 0.15, 0.45 + k * 0.4, 0.75, 0.9]); },
    kite: (P) => { P.push([0, -1.5, 1, 1], [1, -0.3, 1, 1], [0, 1.2, 1, 1], [-1, -0.3, 1, 1], [0.5, -0.9, 0.8, 1], [0.5, 0.45, 0.8, 1], [-0.5, 0.45, 0.8, 1], [-0.5, -0.9, 0.8, 1]); for (let k = 1; k <= 4; k++) P.push([Math.sin(k * 1.4) * 0.3, 1.2 + k * 0.4, 0.75, 0.9]); },
    pencil: (P) => { rect(P, -0.35, -1.6, 0.35, 1.0, 10); P.push([-0.2, 1.3, 0.8, 1], [0.2, 1.3, 0.8, 1], [0, 1.65, 0.9, 1], [-0.35, -1.85, 0.8, 1], [0.35, -1.85, 0.8, 1]); },
    ladder: (P) => { line(P, -0.6, -1.7, -0.6, 1.7, 7); line(P, 0.6, -1.7, 0.6, 1.7, 7); for (let k = -1; k <= 1; k++) P.push([-0.2, k * 1.0, 0.8, 1], [0.2, k * 1.0, 0.8, 1]); },
    envelope: (P) => { rect(P, -1.4, -0.9, 1.4, 0.9, 12); line(P, -1.3, -0.8, 0, 0.3, 4); line(P, 0, 0.3, 1.3, -0.8, 4); },
    bell: (P) => { arc(P, 0, 0.2, 1.1, Math.PI, 2 * Math.PI, 9); line(P, -1.3, 0.5, 1.3, 0.5, 6); P.push([0, 0.9, 1.1, 1], [0, -1.3, 0.9, 1]); },
    lantern: (P) => { rect(P, -0.7, -0.9, 0.7, 0.9, 10); P.push([0, 0, 1.4, 1], [0, -1.25, 0.8, 1], [0, 1.2, 0.8, 1]); },
    telescope: (P) => { line(P, -1.4, 1.0, 1.2, -1.1, 9); line(P, -1.2, 1.3, 1.4, -0.8, 9); line(P, -0.2, 0.4, -0.2, 1.7, 4); line(P, -0.8, 1.7, 0.4, 1.7, 4); P.push([1.5, -1.15, 1.1, 1]); },
    guitar: (P) => { ring(P, 0, 0.6, 0.9, 10); ring(P, 0, -0.35, 0.65, 8); line(P, 0, -1.0, 0, -2.0, 5); P.push([0, 0.55, 1, 0.9], [-0.25, -2.1, 0.8, 1], [0.25, -2.1, 0.8, 1]); },
    horn: (P) => { arc(P, 0.2, 0, 1.1, Math.PI * 0.6, Math.PI * 1.9, 10); line(P, -0.9, 0.9, -1.6, 1.4, 4); ring(P, 1.4, -1.0, 0.45, 7); },
    hammer: (P) => { line(P, 0, -0.9, 0, 1.7, 7); rect(P, -1.1, -1.5, 1.1, -0.7, 10); },
    wheel: (P) => { ring(P, 0, 0, 1.4, 14); ring(P, 0, 0, 0.35, 5); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; P.push([Math.cos(a) * 0.85, Math.sin(a) * 0.85, 0.8, 0.9]); } },
  };
  function ring(P, cx, cy, r, n) { for (let k = 0; k < n; k++) { const a = k / n * TAU; P.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.9, 1]); } }
  function arc(P, cx, cy, r, a0, a1, n) { for (let k = 0; k < n; k++) { const a = a0 + (a1 - a0) * k / (n - 1); P.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.9, 1]); } }
  function line(P, x0, y0, x1, y1, n) { for (let k = 0; k < n; k++) { const t = n > 1 ? k / (n - 1) : 0; P.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.85, 1]); } }
  function rect(P, x0, y0, x1, y1, n) { const per = Math.max(2, Math.round(n / 4)); line(P, x0, y0, x1, y0, per); line(P, x1, y0, x1, y1, per); line(P, x1, y1, x0, y1, per); line(P, x0, y1, x0, y0, per); }
  const OBJ_NAMES = Object.keys(OBJ);
  const MAKER_OBJ = ['guitar', 'horn', 'hammer', 'wheel', 'pencil', 'cup', 'bell', 'camera', 'lantern', 'key'];
  function object(name) { const P = []; OBJ[name](P); return P; }
  const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // girth over [{at, r}], eased between stations (artGirthAt)
  function girthAt(g, u) {
    if (u <= g[0].at) return g[0].r;
    for (let i = 1; i < g.length; i++) if (u <= g[i].at) { const k = (u - g[i - 1].at) / Math.max(1e-6, g[i].at - g[i - 1].at), e = k * k * (3 - 2 * k); return g[i - 1].r + (g[i].r - g[i - 1].r) * e; }
    return g[g.length - 1].r;
  }
  // a Catmull-Rom pass through control points (artSmoothPoly), per segment
  function smooth(pts, per) {
    if (pts.length < 3) return pts.slice();
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < per; k++) {
        const t = k / per, t2 = t * t, t3 = t2 * t;
        out.push([0, 1, 2].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
      }
    }
    out.push(pts[pts.length - 1].slice());
    return out;
  }

  // ── the builder: one form under construction ───────────────────────────
  function Builder(rand, s) {
    this.rand = rand; this.s = s; this.P = []; this.flows = []; this.things = []; this.core = [0, 0.02 * s, 0];
  }
  Builder.prototype = {
    n() { return this.P.length / S; },
    node(x, y, z, r, a, c, m, ph, w, ex, ey, ez, q, bw, bp) {
      this.P.push(x, y, z, r, a, c || 0, m || 0, ph || 0, w || 0, ex || 0, ey || 0, ez || 0, q || 0, bw || 0, bp || 0);
      return this.P.length / S - 1;
    },
    // A stem: nodes along a bending line. o: { r, c, flex0, flex, ph, m, w0, w1, taper, step }
    // Returns the tip, the direction there, and the node indices (a flow).
    // NODE SCULPTURE, NOT DOTTED DRAWING. A stem with `mass` is not one line of
    // nodes: it is a centre lane plus `mass` lanes bundled round it, offset by
    // about a radius, jittered, thicker toward the base, so a trunk reads as a
    // volume. The centre lane is what `idx` returns (flows and junctions hang
    // off it); the bundle rides the same sway.
    stem(from, len, yaw, bend, o) {
      const s = this.s, step = (o.step || 0.045) * s, n = Math.max(3, Math.round(len / step));
      let [x, y, z] = from; const idx = [];
      const lean0 = o.lean0 || 0, mass = o.mass || 0, rand = this.rand;
      let dir = [0, 1, 0];
      for (let i = 1; i <= n; i++) {
        const t = i / n, lean = lean0 + bend * t, st = len / n;
        dir = [Math.sin(lean) * Math.cos(yaw), Math.cos(lean), Math.sin(lean) * Math.sin(yaw)];
        x += dir[0] * st; y += dir[1] * st; z += dir[2] * st;
        const r = (o.r || 0.012 * s) * (1 - (o.taper == null ? 0.3 : o.taper) * t);
        const w = (o.w0 || 0) + ((o.w1 == null ? 0 : o.w1) - (o.w0 || 0)) * t;
        const bw = (o.flex0 || 0) + (o.flex || 0) * t, ph = (o.ph || 0) + t * (o.phAlong || 0);
        idx.push(this.node(x, y, z, r, o.a == null ? 1 : o.a, o.c || 0, o.m || M.BRANCH, ph, w, o.ex || 0, o.ey || 0, o.ez || 0, o.q || 0, bw, o.bp || 0));
        if (mass) {
          // lanes round the centre, more of them low down, each a little off its own line
          const lanes = Math.max(1, Math.round(mass * (1.15 - 0.55 * t)));
          const spread = r * (1.25 + 0.5 * (1 - t)) * (o.spread || 1);
          for (let k = 0; k < lanes; k++) {
            const a = k / lanes * TAU + i * 0.9 + (o.twist || 0) * t * 6, rr = spread * (0.75 + rand() * 0.5);
            // perpendicular to the stem: a ring in the plane across `dir`
            const px = Math.cos(a) * rr, pz = Math.sin(a) * rr;
            this.node(x + px * dir[1] + (rand() - 0.5) * r * 0.4, y - (px * dir[0] + pz * dir[2]) * 0.6, z + pz * dir[1] + (rand() - 0.5) * r * 0.4,
              r * (0.55 + rand() * 0.35), (o.a == null ? 1 : o.a) * (0.7 + rand() * 0.25), o.c || 0, o.m || M.BRANCH, ph, w, o.ex || 0, o.ey || 0, o.ez || 0, o.q || 0, bw, o.bp || 0);
          }
        }
      }
      return { tip: [x, y, z], dir, idx, lean: lean0 + bend };
    },
    // A junction: a denser mass of nodes where branches divide, weight is
    // carried, or a vine crosses. Helps the eye read structure.
    knot(at, r, n, col, bw, bp) {
      const rand = this.rand;
      for (let k = 0; k < n; k++) {
        const a = k * 2.39996, rr = Math.sqrt((k + 0.5) / n) * r, y = (rand() - 0.5) * r * 1.2;
        this.node(at[0] + Math.cos(a) * rr, at[1] + y, at[2] + Math.sin(a) * rr, r * (0.28 + rand() * 0.2), 0.85 + rand() * 0.15, col || 0, M.BRANCH, 0, 0, 0, 0, 0, 0, bw || 0, bp || 0);
      }
    },
    // A canopy with volume: several overlapping lobes, each a dome, denser
    // toward its own centre, so the mass reads as nested clouds rather than
    // one outlined curve.
    canopy(c, R, n, col, o) {
      o = o || {};
      const rand = this.rand, lobes = o.lobes || 4, idx = [];
      for (let l = 0; l < lobes; l++) {
        const a = l / lobes * TAU + rand() * 0.8, off = l ? R * (0.35 + rand() * 0.3) : 0;
        const cc = [c[0] + Math.cos(a) * off, c[1] + (rand() - 0.3) * R * 0.25, c[2] + Math.sin(a) * off * (o.flat || 1)];
        const RR = l ? R * (0.5 + rand() * 0.25) : R * 0.8, nn = Math.round(n / lobes);
        for (let i = 0; i < nn; i++) {
          // fill the lobe, not just its surface: radius pulled toward the centre
          const u = rand() ** 0.55, y = 1 - 2 * rand(), rr = Math.sqrt(Math.max(0, 1 - y * y)) * u, aa = rand() * TAU;
          const lower = o.lower == null ? 0.55 : o.lower;
          if (y < -lower) continue;
          idx.push(this.node(cc[0] + Math.cos(aa) * rr * RR, cc[1] + y * RR * (o.squash || 0.7), cc[2] + Math.sin(aa) * rr * RR,
            (o.r || 0.011 * this.s) * (0.7 + rand() * 0.6) * (u < 0.5 ? 0.85 : 1), (0.75 + 0.25 * u) * (o.a || 0.9), col, M.LEAF, rand() * TAU, 0.3 + 0.7 * u,
            0, 0, 0, 0, (o.bw || 0) + u * (o.bwEdge || 0.4), (o.bp || 0) + l * 0.35));
        }
      }
      return idx;
    },
    // A VOLUME. A sphere filled with nodes, dense at its core and thinning
    // outward (the sea art's rule: bodies from cross-sections, filler that
    // hugs the form, front and back told apart by the renderer). cols: inner,
    // outer. The core reads as a body; the rim reads as light.
    orb(c, R, n, cols, o) {
      o = o || {};
      const rand = this.rand, idx = [];
      for (let i = 0; i < n; i++) {
        const u = rand() ** (o.core || 0.6), y = 1 - 2 * rand(), rr = Math.sqrt(Math.max(0, 1 - y * y)) * u, a = rand() * TAU;
        if (o.upper && y < -0.05) continue;
        const inner = u < 0.5;
        idx.push(this.node(c[0] + Math.cos(a) * rr * R, c[1] + y * R * (o.squash || 1), c[2] + Math.sin(a) * rr * R,
          (o.r || 0.011 * this.s) * (inner ? 1.15 : 0.85) * (0.8 + rand() * 0.4), inner ? 1 : 0.7 + 0.3 * u, inner ? cols[0] : cols[1],
          o.m == null ? M.LEAF : o.m, rand() * TAU, o.w == null ? 0.3 + 0.5 * u : o.w, c[0], c[1], c[2], o.q || 0, o.bw || 0, o.bp || 0));
      }
      return idx;
    },
    // A LATTICE: rings joined by uprights, a scaffold something can stand on.
    lattice(base, h, R, rings, posts, col, o) {
      o = o || {};
      const idx = [], taper = o.taper == null ? 0.3 : o.taper;
      for (let r = 0; r <= rings; r++) {
        const y = base[1] + h * r / rings, RR = R * (1 - taper * r / rings);
        for (let k = 0; k < 14; k++) { const a = k / 14 * TAU + r * 0.2; idx.push(this.node(base[0] + Math.cos(a) * RR, y, base[2] + Math.sin(a) * RR, 0.008 * this.s, 0.85, col, M.BRANCH, 0, 0, 0, 0, 0, 0, (o.bw || 0) * r / rings, o.bp || 0)); }
      }
      for (let q = 0; q < posts; q++) {
        const a = q / posts * TAU + 0.2;
        for (let r = 0; r <= rings * 3; r++) { const t = r / (rings * 3), RR = R * (1 - taper * t); idx.push(this.node(base[0] + Math.cos(a) * RR, base[1] + h * t, base[2] + Math.sin(a) * RR, 0.0095 * this.s, 0.95, col, M.BRANCH, 0, 0, 0, 0, 0, 0, (o.bw || 0) * t, o.bp || 0)); }
      }
      return idx;
    },
    // An ARCH between two points, rising by lift, thicker at the crown.
    arch(a, b, lift, n, r, col, o) {
      o = o || {};
      const idx = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n, bell = Math.sin(t * Math.PI);
        idx.push(this.node(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + bell * lift, a[2] + (b[2] - a[2]) * t, r * (0.8 + 0.4 * bell), 0.9, col, o.m || M.BRANCH, t * 3, o.w || 0, 0, 0, 0, 0, (o.bw || 0) + bell * (o.bwEdge || 0.15), o.bp || 0));
        if (o.mass && k % 2) idx.push(this.node(a[0] + (b[0] - a[0]) * t + (this.rand() - 0.5) * r * 2, a[1] + (b[1] - a[1]) * t + bell * lift - r * 1.2, a[2] + (b[2] - a[2]) * t + (this.rand() - 0.5) * r * 2, r * 0.6, 0.7, col, M.BRANCH, 0, 0, 0, 0, 0, 0, (o.bw || 0) + bell * 0.15, o.bp || 0));
      }
      return idx;
    },
    // A BOOK in three dimensions: two panels of nodes on a spine, closed or a
    // little open, with loose pages if open.
    book(at, w, h, ang, open, col, o) {
      o = o || {};
      const ca = Math.cos(ang), sa = Math.sin(ang), tilt = open ? 0.35 : 0.06, rand = this.rand;
      for (let side = -1; side <= 1; side += 2) for (let u = 0; u < 4; u++) for (let v = 0; v < 3; v++) {
        const lx = side * (u + 0.5) / 4 * w, ly = (v / 2 - 0.5) * h + Math.abs(lx) / w * tilt * h * 1.5 * (open ? 1 : 0), lz = side * (u + 0.5) / 4 * w * tilt;
        this.node(at[0] + lx * ca - lz * sa, at[1] + ly, at[2] + lx * sa + lz * ca, 0.008 * this.s, 0.9, open ? (o.open == null ? 3 : o.open) : col, M.LEAF, ang + u, 0.2, 0, 0, 0, 0, o.bw || 0, o.bp || 0);
      }
      this.node(at[0], at[1], at[2], 0.011 * this.s, 1, col, M.BRANCH, 0, 0, 0, 0, 0, 0, o.bw || 0, o.bp || 0);
      if (open) for (let q = 0; q < 3; q++) this.node(at[0] + (rand() - 0.5) * w, at[1] + 0.03 * this.s, at[2] + (rand() - 0.5) * w, 0.007 * this.s, 0.85, 4, M.PAGE, rand() * TAU, 0.09 * this.s * (0.6 + rand()), 0, 0, 0, rand() * TAU, o.bw || 0, o.bp || 0);
    },
    // Roots: thick near the plant, thinning as they go, a few of them flaring
    // out just under the ground.
    roots(base, n, len, r, col) {
      const rand = this.rand;
      for (let k = 0; k < n; k++) {
        const a = k / n * TAU + rand() * 0.6;
        this.stem([base[0] + Math.cos(a) * r * 0.6, base[1], base[2] + Math.sin(a) * r * 0.6], len * (0.7 + rand() * 0.6), a, 1.35, { r: r * 0.8, lean0: 1.35, taper: 0.7, mass: 1, c: col || 0, step: 0.05, a: 0.8 });
      }
    },
    // A cluster of leaves on a dome around c: broad leaves tilt slowly, edges ripple.
    leaves(c, R, n, lower, col, o) {
      o = o || {};
      const idx = [];
      for (let i = 0; i < n; i++) {
        const y = 1 - (1 + (lower == null ? 0.5 : lower)) * (i + 0.5) / n, rr = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996;
        const px = c[0] + Math.cos(a) * rr * R, py = c[1] + y * R * (o.flat || 1), pz = c[2] + Math.sin(a) * rr * R;
        idx.push(this.node(px, py, pz, (o.r || 0.011 * this.s) * (0.8 + this.rand() * 0.4), o.a || 0.9, col, o.m == null ? M.LEAF : o.m, this.rand() * TAU, rr,
          0, 0, 0, 0, (o.bw || 0) + rr * (o.bwEdge || 0.4), o.bp || 0));
      }
      return idx;
    },
    // A fine frond: light grouped motion cascading to the tip.
    frond(from, len, yaw, bend, col, o) {
      o = o || {};
      return this.stem(from, len, yaw, bend, { r: o.r || 0.009 * this.s, c: col, m: M.FROND, ph: o.ph || this.rand() * TAU, phAlong: 1.6, w0: 0.1, w1: 1, taper: 0.5, step: 0.04, bw: o.bw, bp: o.bp, flex0: o.bw || 0 });
    },
    // A thin vine: flexible along its length, tips more than roots.
    vine(from, len, yaw, bend, col, o) {
      o = o || {};
      return this.stem(from, len, yaw, bend, { r: o.r || 0.009 * this.s, c: col, m: M.VINE, ph: o.ph || this.rand() * TAU, phAlong: 2.2, w0: o.w0 || 0.05, w1: o.w1 == null ? 1 : o.w1, taper: 0.45, step: 0.04, lean0: o.lean0, a: o.a, flex0: o.bw || 0, bp: o.bp });
    },
    // Something hanging: a string of small nodes down from a pivot, then a body.
    // weight: bigger swings less and slower. Returns the body's node indices.
    hang(pivot, L, col, o) {
      o = o || {};
      const s = this.s, ph = this.rand() * TAU, weight = o.weight == null ? 1 : o.weight, idx = [];
      const links = o.links == null ? 2 : o.links;
      for (let k = 1; k <= links; k++) {
        const y = pivot[1] - L * k / (links + 1);
        idx.push(this.node(pivot[0], y, pivot[2], 0.006 * s, 0.7, o.string == null ? 0 : o.string, M.PEND, ph, L, pivot[0], pivot[1], pivot[2], weight, o.bw || 0, o.bp || 0));
      }
      const by = pivot[1] - L, size = o.size || 0.03 * s, kind = o.kind || 'lantern';
      const body = [];
      if (kind === 'lantern') {
        body.push([0, 0, size * 0.55, 1, col]);
        const n = o.n || 6;
        for (let k = 0; k < n; k++) { const a = k / n * TAU; body.push([Math.cos(a) * size * 0.55, Math.sin(a) * size * 0.75 - size * 0.05, size * 0.28, 0.85, col]); }
      } else if (kind === 'fruit') {
        body.push([0, 0, size * 0.6, 1, col]);
        body.push([size * 0.3, -size * 0.25, size * 0.3, 0.7, col]);
      } else if (kind === 'book') {
        for (let k = 0; k < 6; k++) body.push([-size * 0.7 + k * size * 0.28, -size * 0.45 + (k % 2) * size * 0.9, size * 0.22, 0.9, col]);
        body.push([0, 0, size * 0.3, 0.9, col]);
      } else if (kind === 'drop') {
        body.push([0, 0, size * 0.5, 1, col]);
      }
      for (const b of body) idx.push(this.node(pivot[0] + b[0], by + b[1], pivot[2], b[2], b[3], b[4], M.PEND, ph, L, pivot[0], pivot[1], pivot[2], weight, o.bw || 0, o.bp || 0));
      return idx;
    },
    // Something from the world, held out or hung: drawn facing the camera at the anchor node.
    thing(anchor, name, u, o) {
      o = o || {};
      this.things.push({ anchor, pts: object(name || OBJ_NAMES[Math.floor(this.rand() * OBJ_NAMES.length)]), u: u * this.s, dy: (o.dy || 0) * this.s, col: o.col == null ? 2 : o.col, swing: o.swing == null ? 0.06 : o.swing });
    },
    // ── THE SEA ART'S OWN GRAMMAR (sea-art-engine.js: artStations, the
    // sweeps, artScaffold, the orbital profile). A body is a cross-section
    // swept along a path on a transported frame, never a line of dots; a
    // shell keeps its material near its surface; fill is anchored to
    // strokes, so negative space survives; a ring is a band with thickness,
    // not a circle. Every helper returns node indices so light can travel them.
    //
    // SWEEP: a tube (or a blade, o.blade) along a smoothed path, girth a
    // number or [{at, r}]. Stations on a parallel-transported frame, rings
    // staggered, nodes swelling mid-stroke (0.55 + 0.35·sin πs).
    // o: { c | cols (walked root to tip), m, e (pivot), q, mw (fixed w), ph,
    //      bw0, bw (sway growing along), bp, a, r (node size), blade }
    sweep(pts, girth, n, o) {
      o = o || {};
      const s = this.s, rand = this.rand, path = smooth(pts, 10);
      const L = []; let len = 0;
      for (let i = 0; i < path.length; i++) { if (i) len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]); L.push(len); }
      const at = (u) => { const d = u * len; let i = 1; while (i < path.length - 1 && L[i] < d) i++; const k = (d - L[i - 1]) / Math.max(1e-9, L[i] - L[i - 1]); return [0, 1, 2].map((j) => path[i - 1][j] + (path[i][j] - path[i - 1][j]) * k); };
      const gAt = (u) => typeof girth === 'number' ? girth : girthAt(girth, u);
      let mean = 0; for (let k = 0; k <= 8; k++) mean += gAt(k / 8) / 9;
      const ring = Math.max(3, Math.min(24, Math.round(Math.sqrt(n * TAU * mean / Math.max(1e-6, len))))), axial = Math.max(2, Math.floor(n / ring));
      const thin = o.blade ? 0.28 : 1, idx = [], spine = [];
      let N = null;
      for (let j = 0; j < axial; j++) {
        const u = j / (axial - 1), p = at(u), a0 = at(Math.max(0, u - 0.02)), a1 = at(Math.min(1, u + 0.02));
        const T = norm3([a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]]);
        if (!N) { N = cross3(T, [0, 1, 0]); if (Math.hypot(N[0], N[1], N[2]) < 0.1) N = cross3(T, [1, 0, 0]); N = norm3(N); }
        else { const d = N[0] * T[0] + N[1] * T[1] + N[2] * T[2]; N = norm3([N[0] - d * T[0], N[1] - d * T[1], N[2] - d * T[2]]); }
        const Bv = cross3(T, N), r = gAt(u), sw = 0.55 + 0.35 * Math.sin(Math.PI * u);
        const col = o.cols ? o.cols[Math.min(o.cols.length - 1, Math.floor(u * o.cols.length))] : (o.c || 0);
        const bw = (o.bw0 || 0) + (o.bw || 0) * u, w = o.mw == null ? u : o.mw, ph = o.ph == null ? u * 2 : o.ph, e = o.e || [0, 0, 0];
        for (let k = 0; k < ring; k++) {
          const a = (k + (j % 2) * 0.5) / ring * TAU, ca = Math.cos(a) * r, sa = Math.sin(a) * r * thin;
          const id = this.node(p[0] + N[0] * ca + Bv[0] * sa, p[1] + N[1] * ca + Bv[1] * sa, p[2] + N[2] * ca + Bv[2] * sa,
            (o.r || 0.009 * s) * sw * (0.85 + rand() * 0.3), (o.a || 0.95) * (0.8 + 0.2 * sw), col, o.m || M.BRANCH, ph, w, e[0], e[1], e[2], o.q || 0, bw, o.bp || 0);
          idx.push(id);
          if (!k) spine.push(id);
        }
      }
      return { idx, spine, tip: at(1), len };
    },
    // SHELL: a volume whose material hugs its surface (the engine's r^2.2),
    // optionally organic (o.lumpy: a smooth low-order wobble of the radius,
    // never per-point noise), capped (o.cap), squashed. cols: [inner, outer].
    shell(c, R, n, cols, o) {
      o = o || {};
      const rand = this.rand, idx = [], lumpy = o.lumpy || 0, k1 = rand() * TAU, k2 = rand() * TAU, e = o.e || c;
      for (let i = 0; i < n; i++) {
        const y = 1 - 2 * rand(), rr = Math.sqrt(Math.max(0, 1 - y * y)), a = rand() * TAU;
        if (o.cap != null && y < -o.cap) continue;
        const u = (1 - Math.pow(rand(), 2.2) * (o.depth || 0.45)) * (1 + lumpy * (Math.sin(a * 2 + k1) * 0.6 + Math.sin(y * 3 + k2) * 0.4));
        const outer = u > 0.86;
        idx.push(this.node(c[0] + Math.cos(a) * rr * u * R, c[1] + y * u * R * (o.squash || 1), c[2] + Math.sin(a) * rr * u * R,
          (o.r || 0.01 * this.s) * (outer ? 1 : 0.75) * (0.8 + rand() * 0.4), outer ? 0.95 : 0.6, outer ? cols[1] : cols[0],
          o.m == null ? M.LEAF : o.m, o.ph == null ? rand() * TAU : o.ph, o.w == null ? 0.25 * u : o.w, e[0], e[1], e[2], o.q || 0, o.bw || 0, o.bp || 0));
      }
      return idx;
    },
    // A RING WITH BODY that turns on its own axis (M.SPIN): the axis leans
    // `tilt` from vertical toward azimuth `az`; the band has thickness, denser
    // at its middle (the orbital profile), and beads of warm light ride it.
    // o: { c, q (rad/s), band, beads, bw, bp }
    orbitRing(ctr, R, n, tilt, az, o) {
      o = o || {};
      const rand = this.rand, idx = [], ax = [Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az)];
      const U = norm3(cross3(ax, Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), V = cross3(ax, U), every = o.beads ? Math.max(1, Math.round(n / o.beads)) : 0;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU, g = (rand() + rand() + rand() - 1.5) / 1.5, rr = R + g * R * (o.band || 0.05), lift = (rand() - 0.5) * R * 0.04;
        const bead = every && i % every === 0, ca = Math.cos(a) * rr, sa = Math.sin(a) * rr;
        idx.push(this.node(ctr[0] + U[0] * ca + V[0] * sa + ax[0] * lift, ctr[1] + U[1] * ca + V[1] * sa + ax[1] * lift, ctr[2] + U[2] * ca + V[2] * sa + ax[2] * lift,
          0.0085 * this.s * (bead ? 2.2 : 1 - Math.abs(g) * 0.4), bead ? 1 : 0.9 - Math.abs(g) * 0.3, bead ? 4 : (o.c == null ? 2 : o.c), M.SPIN, az, tilt, ctr[0], ctr[1], ctr[2], o.q || 0.2, o.bw || 0, o.bp || 0));
      }
      return idx;
    },
    // INTERIOR FILL, ANCHORED (artScaffold): each fill node picks a stroke
    // node, finds the stroke's direction there, and sits in the plane across
    // it, pulled toward the surface. It inherits its anchor's motion, so it
    // moves as part of the body, and it is always quieter than the linework.
    fill(anchors, n, dMax, o) {
      o = o || {};
      const P = this.P, rand = this.rand;
      for (let i = 0; i < n && anchors.length > 2; i++) {
        const j = 1 + Math.floor(rand() * (anchors.length - 2)), a = anchors[j] * S, pa = anchors[j - 1] * S, pb = anchors[j + 1] * S;
        const T = norm3([P[pb] - P[pa], P[pb + 1] - P[pa + 1], P[pb + 2] - P[pa + 2]]);
        let U = cross3(T, [0, 1, 0]); if (Math.hypot(U[0], U[1], U[2]) < 0.1) U = cross3(T, [1, 0, 0]); U = norm3(U); const V = cross3(T, U);
        let r = rand(); for (let g = 0; g < 8 && rand() > Math.pow(r, 2.2); g++) r = rand();
        const phi = rand() * TAU, d = r * dMax, cu = Math.cos(phi) * d, su = Math.sin(phi) * d;
        this.node(P[a] + U[0] * cu + V[0] * su, P[a + 1] + U[1] * cu + V[1] * su, P[a + 2] + U[2] * cu + V[2] * su,
          P[a + 3] * 0.5, P[a + 4] * 0.55, o.c == null ? 1 : o.c, P[a + 6], P[a + 7], P[a + 8], P[a + 9], P[a + 10], P[a + 11], P[a + 12], P[a + 13], P[a + 14]);
      }
    },
    // A FILAMENT between two points: a fine sagging strand, freest at its
    // middle, beads of light along it. Its sway blends from one end's to the
    // other's, so both ends stay with what they hold.
    filament(a, b, sag, n, o) {
      o = o || {};
      const idx = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n, bell = Math.sin(Math.PI * t), bead = o.beads && k % o.beads === Math.floor(o.beads / 2);
        idx.push(this.node(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * bell, a[2] + (b[2] - a[2]) * t,
          0.0055 * this.s * (bead ? 2 : 1), bead ? 1 : 0.7, bead ? 4 : (o.c || 0), M.VINE, t * 3 + (o.ph || 0), 0.15 * bell,
          0, 0, 0, 0, (o.bw0 || 0) + ((o.bw1 || 0) - (o.bw0 || 0)) * t, (o.bp0 || 0) + ((o.bp1 || 0) - (o.bp0 || 0)) * t));
      }
      return idx;
    },
    flow(idx) { if (idx && idx.length > 3) this.flows.push(idx.slice()); },
    done(extra) {
      const P = this.P;
      // every form began somewhere: three small nodes at its origin that pulse
      // when the garden is asked to show it (the secret scene)
      const c = this.core, s = this.s;
      this.node(c[0], c[1], c[2], 0.02 * s, 1, 4, M.CORE, 0);
      this.node(c[0] - 0.035 * s, c[1] + 0.01 * s, c[2] + 0.02 * s, 0.011 * s, 0.8, 4, M.CORE, 1.1);
      this.node(c[0] + 0.03 * s, c[1] + 0.02 * s, c[2] - 0.02 * s, 0.011 * s, 0.8, 4, M.CORE, 2.3);
      return Object.assign({ P, n: P.length / S, flows: this.flows, things: this.things, core: c, s }, extra || {});
    },
  };

  // ── AMBIENT HABITS: the simpler garden, in the lineage of the earlier
  // plants. Some monochrome, some lightly coloured, some rich. ───────────
  function ambient(rand, kind, s) {
    const B = new Builder(rand, s), yaw = rand() * TAU;
    const objOdds = kind === 'orchard' ? 0.4 : 0.5;
    if (kind === 'orchard') {
      const tr = B.stem([0, 0, 0], (0.85 + rand() * 0.45) * s, yaw, 0.12, { r: 0.014 * s, flex: 0.35, mass: 2 });
      B.flow(tr.idx);
      B.knot(tr.tip, 0.045 * s, 8, 0, 0.35, 0.4);
      B.roots([0, 0, 0], 3, 0.16 * s, 0.012 * s);
      B.canopy(tr.tip, 0.42 * s, 78, 1, { bw: 0.35, bp: 0.4, lobes: 3 });
      const odd = rand() < objOdds, name = OBJ_NAMES[Math.floor(rand() * OBJ_NAMES.length)];
      for (let k = 0; k < 9; k++) {
        const a = rand() * TAU, rr = rand() * 0.32 * s;
        const pv = [tr.tip[0] + Math.cos(a) * rr, tr.tip[1] - 0.06 * s - rand() * 0.14 * s, tr.tip[2] + Math.sin(a) * rr];
        if (odd && k < 4) { const i = B.hang(pv, 0.09 * s, 2, { kind: 'drop', size: 0.01 * s, bw: 0.4, bp: 0.4, links: 1 }); B.thing(i[i.length - 1], name, 0.045, { dy: 0.05 }); }
        else B.hang(pv, (0.05 + rand() * 0.08) * s, 2, { kind: 'fruit', size: (0.02 + rand() * 0.012) * s, weight: 1.4, bw: 0.4, bp: 0.4, links: 1 });
      }
    } else if (kind === 'spiral') {
      const hgt = (1.3 + rand() * 0.5) * s, R = 0.15 * s, n = 52, idx = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, a = t * TAU * 3 + yaw;
        idx.push(B.node(Math.cos(a) * R * (1 - t * 0.35), t * hgt, Math.sin(a) * R * (1 - t * 0.35), 0.012 * s, 1, i % 2, M.TWIST, 0.3, t, 0, 0, 0, 0.12));
        if (i % 9 === 4) B.node(Math.cos(a) * R * 1.5, t * hgt + 0.02 * s, Math.sin(a) * R * 1.5, 0.011 * s, 0.85, 1, M.LEAF, rand() * TAU, 0.6, 0, 0, 0, 0, 0.1 * t);
      }
      B.flow(idx);
      B.node(0, hgt + 0.04 * s, 0, 0.022 * s, 1, 2, M.HEAVY, rand() * TAU, 0.6);
    } else if (kind === 'canopy') {
      const tr = B.stem([0, 0, 0], (1.05 + rand() * 0.4) * s, yaw, 0.06, { r: 0.014 * s, flex: 0.25, mass: 2 });
      B.flow(tr.idx);
      B.knot(tr.tip, 0.05 * s, 9, 0, 0.25, 0.3);
      B.roots([0, 0, 0], 3, 0.16 * s, 0.012 * s);
      const R = 0.6 * s;
      B.canopy([tr.tip[0], tr.tip[1] - 0.04 * s, tr.tip[2]], R * 0.9, 60, 1, { bw: 0.3, bp: 0.3, lobes: 4, squash: 0.45 });
      for (let i = 0; i < 40; i++) {
        const rr = Math.sqrt((i + 0.5) / 56) * R, a = i * 2.39996;
        B.node(tr.tip[0] + Math.cos(a) * rr, tr.tip[1] - (rr / R) ** 2 * 0.14 * s, tr.tip[2] + Math.sin(a) * rr, 0.011 * s, 0.9, 1, M.LEAF, rand() * TAU, rr / R, 0, 0, 0, 0, 0.25 + 0.35 * rr / R, 0.3);
        if (i > 49) B.hang([tr.tip[0] + Math.cos(a) * rr, tr.tip[1] - 0.14 * s, tr.tip[2] + Math.sin(a) * rr], 0.07 * s, 2, { kind: 'fruit', size: 0.018 * s, links: 1, bw: 0.5, bp: 0.3 });
      }
    } else if (kind === 'flower') {
      const tr = B.stem([0, 0, 0], (0.65 + rand() * 0.4) * s, yaw, 0.1, { r: 0.012 * s, flex: 0.3 });
      B.flow(tr.idx);
      const petals = 5 + Math.floor(rand() * 3), c = tr.tip, cyc = 0.3 + rand() * 0.3, cph = rand() * TAU;
      for (let p = 0; p < petals; p++) {
        const a = p / petals * TAU + yaw;
        for (let k = 1; k <= 6; k++) { const t = k / 6; B.node(c[0] + Math.cos(a) * t * 0.26 * s, c[1] + Math.sin(t * 3.1) * 0.1 * s, c[2] + Math.sin(a) * t * 0.26 * s, 0.012 * s * (1.1 - t * 0.4), 0.95, 1, M.PETAL, cph, t, c[0], c[1], c[2], cyc, 0.3, 0.3); }
      }
      for (let k = 0; k < 7; k++) { const a = k * 2.39996, rr = Math.sqrt(k / 7) * 0.05 * s; B.node(c[0] + Math.cos(a) * rr, c[1] + 0.03 * s, c[2] + Math.sin(a) * rr, 0.015 * s, 1, 2, M.PETAL, cph, 0.2, c[0], c[1], c[2], cyc, 0.3, 0.3); }
      for (let k = 0; k < 2; k++) B.frond([0, 0.2 * s + k * 0.15 * s, 0], 0.22 * s, yaw + 1.6 + k * 2.2, 1.3, 1);
    } else if (kind === 'arch') {
      const span = 0.7 * s, hgt = (1.0 + rand() * 0.4) * s, cy = Math.cos(yaw), sy = Math.sin(yaw), idx = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40 * 2 - 1, x = t * span, y = hgt * (1 - t * t), tip = 1 - t * t;
        idx.push(B.node(x * cy, y, x * sy, 0.012 * s, 1, i % 3 === 0 ? 1 : 0, M.VINE, yaw + t * 2, tip * 0.5, 0, 0, 0, 0));
        if (i % 8 === 4) {
          const pv = [x * cy, y - 0.02 * s, x * sy];
          if (rand() < 0.5) { const h = B.hang(pv, 0.12 * s, 2, { kind: 'drop', size: 0.008 * s, bw: tip * 0.3 }); B.thing(h[h.length - 1], null, 0.055, { dy: 0.06 }); }
          else B.hang(pv, (0.1 + rand() * 0.06) * s, 2, { kind: 'lantern', size: 0.024 * s, n: 5, bw: tip * 0.3 });
        }
      }
      B.flow(idx);
      B.core = [-span * cy, 0.02 * s, -span * sy];
    } else if (kind === 'lantern') {
      const fork = B.stem([0, 0, 0], 0.7 * s, yaw, 0.08, { r: 0.014 * s, flex: 0.2, mass: 2 });
      B.knot(fork.tip, 0.04 * s, 8, 0, 0.2, 0);
      const odd = rand() < 0.5;
      for (let j = 0; j < 3; j++) {
        const br = B.stem(fork.tip, (0.35 + rand() * 0.25) * s, yaw + j * 2.1, 0.9, { r: 0.011 * s, flex0: 0.2, flex: 0.5, bp: 0.6 * j });
        B.flow(fork.idx.concat(br.idx));
        const pv = [br.tip[0], br.tip[1] - 0.02 * s, br.tip[2]];
        if (odd) { const h = B.hang(pv, 0.12 * s, 2, { kind: 'drop', size: 0.008 * s, bw: 0.7, bp: 0.6 * j }); B.thing(h[h.length - 1], null, 0.06, { dy: 0.07 }); }
        else { B.hang(pv, 0.09 * s, 2, { kind: 'lantern', size: 0.028 * s, bw: 0.7, bp: 0.6 * j }); B.hang([pv[0] + 0.05 * s, pv[1], pv[2]], 0.13 * s, 3, { kind: 'fruit', size: 0.016 * s, bw: 0.7, bp: 0.6 * j, links: 1 }); }
        for (let k = 1; k <= 4; k++) B.node(br.tip[0] + Math.cos(yaw + j) * k * 0.04 * s, br.tip[1] + 0.02 * s * k, br.tip[2] + Math.sin(yaw + j) * k * 0.04 * s, 0.01 * s, 0.9, 1, M.LEAF, rand() * TAU, 0.5, 0, 0, 0, 0, 0.7, 0.6 * j);
      }
    } else if (kind === 'bearer') {
      const tr = B.stem([0, 0, 0], (0.9 + rand() * 0.5) * s, yaw, 1.1, { r: 0.013 * s, flex: 0.45, mass: 1 });
      B.flow(tr.idx);
      const i = B.node(tr.tip[0], tr.tip[1] - 0.04 * s, tr.tip[2], 0.008 * s, 0.8, 0, M.HEAVY, rand() * TAU, 1, 0, 0, 0, 0, 0.45);
      B.thing(i, null, 0.11, { dy: 0.22, swing: 0.04 });
      for (let k = 0; k < 2; k++) B.frond([0, 0.25 * s + k * 0.2 * s, 0], 0.22 * s, yaw + 1.4 + k * 2.4, 1.2, 1);
    } else if (kind === 'shrub') {
      for (let k = 0; k < 9; k++) {
        const a = k / 9 * TAU + yaw;
        B.frond([Math.cos(a) * 0.05 * s, 0, Math.sin(a) * 0.05 * s], (0.35 + rand() * 0.3) * s, a, 0.7 + rand() * 0.5, k % 3 ? 1 : 0, { ph: k * 0.4 });
      }
      if (rand() < 0.5) B.node(0, 0.42 * s, 0, 0.016 * s, 1, 2, M.HEAVY, rand() * TAU, 0.3);
    } else if (kind === 'orb') {   // a stalk holding up a volume of light: a memory-object bloom
      const tr = B.stem([0, 0, 0], (0.6 + rand() * 0.5) * s, yaw, 0.15, { r: 0.012 * s, flex: 0.35, mass: 1 });
      B.flow(tr.idx);
      B.knot(tr.tip, 0.03 * s, 7, 0, 0.35, 0);
      B.orb([tr.tip[0], tr.tip[1] + 0.2 * s, tr.tip[2]], (0.16 + rand() * 0.1) * s, 70, [2, rand() < 0.5 ? 3 : 1], { core: 0.55, bw: 0.35, bp: 0.2 });
    } else if (kind === 'tower') {   // a lattice tower with a lit crown
      const h = (0.9 + rand() * 0.7) * s;
      B.lattice([0, 0, 0], h, 0.14 * s, 4, 4, 0, { taper: 0.4, bw: 0.2 });
      B.orb([0, h + 0.06 * s, 0], 0.07 * s, 26, [4, 2], { core: 0.5, bw: 0.25 });
      for (let k = 0; k < 4; k++) B.hang([Math.cos(k * 1.57) * 0.1 * s, h * 0.7, Math.sin(k * 1.57) * 0.1 * s], 0.08 * s, 2 + (k % 2), { kind: 'fruit', size: 0.014 * s, links: 1, bw: 0.15 });
    } else if (kind === 'mound') {   // a low mound of blooms, three colours
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * TAU + yaw, tr = B.stem([Math.cos(a) * 0.12 * s, 0, Math.sin(a) * 0.12 * s], (0.2 + rand() * 0.25) * s, a, 0.5, { r: 0.008 * s, flex: 0.4, bp: k });
        const cyc = 0.3 + rand() * 0.3;
        for (let pp = 0; pp < 6; pp++) { const pa = pp / 6 * TAU; for (let q = 1; q <= 2; q++) { const t = q / 2; B.node(tr.tip[0] + Math.cos(pa) * t * 0.06 * s, tr.tip[1] + t * 0.02 * s, tr.tip[2] + Math.sin(pa) * t * 0.06 * s, 0.009 * s, 0.95, 2 + (k % 3 === 2 ? 3 : k % 3), M.PETAL, k, t, tr.tip[0], tr.tip[1], tr.tip[2], cyc, 0.4, k); } }
        B.node(tr.tip[0], tr.tip[1] + 0.01 * s, tr.tip[2], 0.012 * s, 1, 4, M.PETAL, k, 0.1, tr.tip[0], tr.tip[1], tr.tip[2], cyc, 0.4, k);
      }
    // ── THE UPPER AIR: the memory and feeling constellation layer. Large
    // populations of emotionally coloured luminous forms, suspended above the
    // groves, between the towers, beyond the precipice and in the far upper
    // frame, so the world reads as full of lived meaning at every height and
    // there is visibly more of it than the camera has time to show. Each is a
    // volume made the sea art's way (dense core thinning outward, front and
    // back told apart by the renderer, halos under the accents), in two to
    // four related Cosmos colours, with slow internal motion and a slower
    // drift of the whole. Astrolabe's own language: nodes, not sprites. ──
    } else if (kind === 'bloomcloud') {   // hundreds of nodes in an irregular soft volume, pockets of density, slow circulation
      const base = (2.3 + rand() * 1.5) * s, lobes = 3 + Math.floor(rand() * 3);
      for (let l = 0; l < lobes; l++) {
        const a = rand() * TAU, off = l ? (0.18 + rand() * 0.34) * s : 0;
        const c = [Math.cos(a) * off, base + (rand() - 0.5) * 0.34 * s, Math.sin(a) * off];
        B.orb(c, (0.15 + rand() * 0.2) * s, 40 + Math.floor(rand() * 60), [2 + (l % 3), l % 2 ? 5 : 3], { core: 0.5 + rand() * 0.3, w: 0.5 + rand() * 0.5, bw: 0.3, bp: l * 0.7, squash: 0.75 });
      }
      for (let k = 0; k < 8; k++) B.node(0, base, 0, 0.012 * s, 1, 4, M.ORBIT, rand() * TAU, (0.14 + rand() * 0.22) * s, (rand() - 0.5) * 0.3 * s, base + (rand() - 0.5) * 0.4 * s, (rand() - 0.5) * 0.3 * s, (0.035 + rand() * 0.05) * (k % 2 ? 1 : -1));
    } else if (kind === 'memorychain') {   // several luminous volumes joined by thin flexible strands, each with its own colour bias
      const n = 3 + Math.floor(rand() * 3), dir = rand() * TAU; let prev = null;
      for (let k = 0; k < n; k++) {
        const along = (k - (n - 1) / 2) * 0.55 * s + (rand() - 0.5) * 0.2 * s;
        const c = [Math.cos(dir) * along, (2.1 + rand() * 1.7) * s, Math.sin(dir) * along + (rand() - 0.5) * 0.4 * s];
        B.orb(c, (0.08 + rand() * 0.1) * s, 22 + Math.floor(rand() * 30), [2 + (k % 3), 4], { core: 0.55, w: 0.4, bw: 0.25, bp: k });
        if (prev) for (let u = 1; u < 10; u++) { const t = u / 10; B.node(prev[0] + (c[0] - prev[0]) * t, prev[1] + (c[1] - prev[1]) * t - Math.sin(t * Math.PI) * 0.12 * s, prev[2] + (c[2] - prev[2]) * t, 0.005 * s, 0.5, 1, M.VINE, u * 0.7 + k, 0.3 + 0.4 * Math.sin(t * Math.PI), 0, 0, 0, 0, 0.25, k); }
        prev = c;
      }
    } else if (kind === 'nestedorb') {   // one larger volumetric mass with smaller satellites, asymmetrical and organic
      const cy = (2.5 + rand() * 1.6) * s, R = (0.26 + rand() * 0.14) * s, fam = 2 + Math.floor(rand() * 3);
      B.orb([0, cy, 0], R, 110 + Math.floor(rand() * 50), [fam, 1], { core: 0.7, w: 0.35, bw: 0.2, squash: 0.8 + rand() * 0.25 });
      const sats = 3 + Math.floor(rand() * 3);
      for (let k = 0; k < sats; k++) { const a = rand() * TAU, d = R * (1.4 + rand() * 0.9), y = (rand() - 0.3) * R * 1.4; B.orb([Math.cos(a) * d, cy + y, Math.sin(a) * d], R * (0.18 + rand() * 0.22), 12 + Math.floor(rand() * 18), [2 + ((fam + k) % 3), 4], { core: 0.6, w: 0.5, bw: 0.35, bp: k }); }
    } else if (kind === 'bloomswarm') {   // dozens of petal-like clusters over a broad region, each on its own micro-motion, the whole drifting slowly
      const n = 24 + Math.floor(rand() * 16), cy = (2.1 + rand() * 1.4) * s;
      for (let k = 0; k < n; k++) {
        const a = rand() * TAU, rr = Math.sqrt(rand()) * 1.1 * s, c = [Math.cos(a) * rr, cy + (rand() - 0.5) * 0.9 * s, Math.sin(a) * rr];
        const petals = 5 + Math.floor(rand() * 2), pr = (0.03 + rand() * 0.03) * s, cyc = 0.25 + rand() * 0.3, col = 2 + (k % 3), ph = rand() * TAU;
        for (let p = 0; p < petals; p++) { const pa = p / petals * TAU; B.node(c[0] + Math.cos(pa) * pr, c[1] + Math.sin(pa * 2) * pr * 0.3, c[2] + Math.sin(pa) * pr, 0.008 * s, 0.9, col, M.PETAL, ph, 0.8, c[0], c[1], c[2], cyc, 0.5, k * 0.3); }
        B.node(c[0], c[1], c[2], 0.011 * s, 1, 4, M.PETAL, ph, 0.1, c[0], c[1], c[2], cyc, 0.5, k * 0.3);
      }
    } else if (kind === 'hangingcanopy') {   // a canopy overhead with dozens of luminous clusters suspended beneath it, colour and depth varying
      const cy = (2.9 + rand() * 1.2) * s, R = (0.7 + rand() * 0.4) * s;
      B.canopy([0, cy, 0], R, 140, 1, { bw: 0.2, bp: 0.3, lobes: 4, squash: 0.4, lower: 0.2 });
      for (let k = 0; k < 26; k++) {
        const a = rand() * TAU, rr = Math.sqrt(rand()) * R * 0.9, pv = [Math.cos(a) * rr, cy - 0.04 * s, Math.sin(a) * rr];
        const L = (0.12 + rand() * 0.5) * s, what = rand() < 0.4 ? 'lantern' : rand() < 0.5 ? 'fruit' : 'drop';
        B.hang(pv, L, 2 + (k % 3), { kind: what, size: (0.014 + rand() * 0.02) * s, weight: 1 + rand(), links: 2 + Math.floor(L / (0.18 * s)), bw: 0.25, bp: k * 0.4, string: 1 });
        if (what === 'drop' && rand() < 0.5) B.orb([pv[0], pv[1] - L, pv[2]], 0.05 * s, 12, [2 + (k % 3), 4], { core: 0.6, w: 0.3, bw: 0.25, bp: k * 0.4 });
      }
    } else if (kind === 'farlight') {   // a distant constellation: a small luminous mass high in the air, simplified
      const cy = (3.4 + rand() * 3.4) * s;
      B.orb([0, cy, 0], (0.12 + rand() * 0.16) * s, 24 + Math.floor(rand() * 16), [2 + Math.floor(rand() * 3), 4], { core: 0.5, w: 0.3 });
    } else if (kind === 'seedling') {
      const tr = B.stem([0, 0, 0], 0.22 * s, yaw, 0.15, { r: 0.009 * s, flex: 0.6, step: 0.035 });
      B.node(tr.tip[0] - 0.06 * s, tr.tip[1] + 0.02 * s, tr.tip[2], 0.013 * s, 0.9, 1, M.LEAF, rand() * TAU, 0.8, 0, 0, 0, 0, 0.6);
      B.node(tr.tip[0] + 0.06 * s, tr.tip[1] + 0.02 * s, tr.tip[2], 0.013 * s, 0.9, 1, M.LEAF, rand() * TAU + 1, 0.8, 0, 0, 0, 0, 0.6);
    } else {   // reeds: a stand, waves crossing it
      for (let k = 0; k < 7; k++) {
        const a = k / 7 * TAU + yaw, r0 = 0.09 * s, x0 = Math.cos(a) * r0, z0 = Math.sin(a) * r0;
        const st = B.stem([x0, 0, z0], (0.6 + rand() * 0.8) * s, a, 0.22, { r: 0.01 * s, m: M.REED, ph: -x0 * 3, w0: 0, w1: 1, taper: 0.4 });
        B.node(st.tip[0], st.tip[1] + 0.02 * s, st.tip[2], 0.013 * s, 1, 2, M.REED, -x0 * 3, 1.05, 0, 0, 0, 0);
      }
    }
    return B.done({ kind });
  }

  // ── THE GATE: two climbing structures arching overhead, hung with lights.
  function gate(rand, s) {
    const B = new Builder(rand, s);
    for (const side of [-1, 1]) {
      const x0 = side * 1.55, twist = [];
      // the trunk, leaning in, rising, then curving over the way
      let from = [x0, 0, 0], yawIn = side > 0 ? Math.PI : 0, lean = 0;
      for (let seg = 0; seg < 5; seg++) {
        const st = B.stem(from, 0.7 * s, yawIn, 0.36, { r: 0.02 * s, lean0: lean, m: M.TWIST, w0: seg * 0.2, w1: (seg + 1) * 0.2, q: 0.05, ex: x0, ez: 0, taper: 0.1, flex0: seg * 0.06, flex: 0.06, bp: side, mass: seg < 3 ? 3 : 2, twist: 0.5 });
        twist.push(...st.idx); from = st.tip; lean = st.lean;
        // a climbing vine wound round the trunk
        for (let k = 0; k < st.idx.length; k += 2) {
          const o = st.idx[k] * S, a = k * 0.9 + seg * 3 + side;
          B.node(B.P[o] + Math.cos(a) * 0.09 * s, B.P[o + 1], B.P[o + 2] + Math.sin(a) * 0.09 * s, 0.009 * s, 0.9, 1, M.VINE, a, 0.25 + seg * 0.15, 0, 0, 0, 0, seg * 0.06, side);
        }
        // tendrils and hanging lights along the way over
        if (seg >= 2) {
          for (let k = 0; k < 2; k++) {
            const o = st.idx[Math.floor(st.idx.length * (0.3 + k * 0.4))] * S;
            B.vine([B.P[o], B.P[o + 1], B.P[o + 2]], 0.3 * s, yawIn + 1.2 + k * 2, 2.6, 1, { lean0: 1.4, bw: seg * 0.06, bp: side });
            B.hang([B.P[o], B.P[o + 1] - 0.03 * s, B.P[o + 2]], (0.16 + k * 0.08) * s, 2 + k, { kind: 'lantern', size: 0.03 * s, weight: 1.1, bw: seg * 0.08, bp: side + k });
          }
        }
      }
      B.flow(twist);
      if (side < 0) B.core = [x0, 0.02 * s, 0];
    }
    return B.done({ kind: 'gate', hero: true });
  }

  // ── HERO 1: the lantern orchard. Abundance. ──────────────────────────────
  function heroOrchard(rand, s) {
    const B = new Builder(rand, s);
    const tr = B.stem([0, 0, 0], 0.95 * s, 0.4, 0.18, { r: 0.028 * s, taper: 0.35, flex: 0.12, mass: 4, twist: 0.4 });
    B.roots([0, 0, 0], 5, 0.26 * s, 0.024 * s);
    B.knot([0, 0.02 * s, 0], 0.07 * s, 16, 0);
    // a climber that grew up through it: a thin spiral vine with small flowers on its own clock
    for (let i = 0; i <= 44; i++) { const t = i / 44, a = t * TAU * 2.6, rr = 0.045 * s * (1 + 0.3 * (1 - t)); B.node(Math.cos(a) * rr, t * 0.92 * s, Math.sin(a) * rr, 0.007 * s, 0.9, 5, M.VINE, a, 0.15 + 0.5 * t, 0, 0, 0, 0, 0.12 * t); if (i % 8 === 4) for (let q = 0; q < 5; q++) { const pa = q / 5 * TAU; B.node(Math.cos(a) * rr + Math.cos(pa) * 0.02 * s, t * 0.92 * s + Math.sin(pa) * 0.02 * s, Math.sin(a) * rr, 0.006 * s, 0.9, 3, M.PETAL, a, 0.5, Math.cos(a) * rr, t * 0.92 * s, Math.sin(a) * rr, 0.5, 0.12 * t); } }
    const majors = 5;
    for (let j = 0; j < majors; j++) {
      const yaw = j / majors * TAU + 0.5 + rand() * 0.5, at = tr.idx[Math.floor(tr.idx.length * (0.55 + 0.45 * (j / majors)))] * S;
      const from = [B.P[at], B.P[at + 1], B.P[at + 2]];
      B.knot(from, 0.05 * s, 12, 0, 0.12, j * 0.7);
      const br = B.stem(from, (0.55 + rand() * 0.35) * s, yaw, 0.95, { r: 0.016 * s, lean0: 0.9, flex0: 0.12, flex: 0.45, bp: j * 0.7, mass: 2 });
      B.flow(tr.idx.concat(br.idx));
      for (let k = 0; k < 3; k++) {
        const at2 = br.idx[Math.floor(br.idx.length * (0.35 + k * 0.3))] * S, f2 = [B.P[at2], B.P[at2 + 1], B.P[at2 + 2]];
        B.knot(f2, 0.03 * s, 7, 0, 0.3 + k * 0.1, j * 0.7);
        const sec = B.stem(f2, (0.25 + rand() * 0.2) * s, yaw + (k - 1) * 1.1, 0.7, { r: 0.011 * s, lean0: 1.1, flex0: 0.3 + k * 0.1, flex: 0.45, bp: j * 0.7 + 0.8, mass: 1 });
        B.canopy(sec.tip, 0.15 * s, 22, 1, { bw: 0.75, bp: j * 0.7 + 0.8, lobes: 2, r: 0.01 * s });
        B.flow(tr.idx.concat(br.idx, sec.idx));
        // lanterns from the secondary, small and large, jewel colours
        for (let q = 0; q < 3; q++) {
          const a3 = sec.idx[Math.floor(sec.idx.length * (0.3 + q * 0.3))] * S;
          const big = rand() < 0.3;
          B.hang([B.P[a3], B.P[a3 + 1] - 0.015 * s, B.P[a3 + 2]], (0.08 + rand() * 0.16) * s, 2 + Math.floor(rand() * 3), { kind: 'lantern', size: (big ? 0.04 : 0.024) * s, n: big ? 8 : 6, weight: big ? 2.2 : 1, bw: 0.75, bp: j * 0.7 + 0.8, links: big ? 3 : 2 });
          // a filament or two growing round where the lantern hangs, on a smaller clock
          for (let fq = 0; fq < 2; fq++) B.frond([B.P[a3], B.P[a3 + 1], B.P[a3 + 2]], 0.06 * s, yaw + q + fq * 2.4, 1.6, 1, { ph: q * 1.7 + fq, bw: 0.75, bp: j * 0.7 + 0.8, r: 0.006 * s });
        }
      }
      // and along the major itself
      for (let q = 0; q < 3; q++) {
        const a3 = br.idx[Math.floor(br.idx.length * (0.25 + q * 0.25))] * S;
        B.hang([B.P[a3], B.P[a3 + 1] - 0.02 * s, B.P[a3 + 2]], (0.12 + rand() * 0.2) * s, 2 + Math.floor(rand() * 3), { kind: 'lantern', size: 0.03 * s, weight: 1.5, bw: 0.3 + q * 0.1, bp: j * 0.7, links: 3 });
      }
    }
    B.knot(tr.tip, 0.06 * s, 14, 0, 0.12, 0);
    B.canopy(tr.tip, 0.55 * s, 170, 1, { bw: 0.25, bp: 0.2, lobes: 5, squash: 0.6 });
    return B.done({ kind: 'hero-orchard', hero: true, flowRate: 0.55 });
  }

  // ── HERO 2: the library chandelier. Knowledge becoming alive: a thick
  // stem rises to a crown from which three tiers of arms spread, each arm
  // ending in a bloom cluster and a book, the arms joined by arches so every
  // tier reads as a ring of light, drops hanging under it, an orb at the top,
  // pages lifting and returning. Emerged from the stem, not attached to it.
  function heroLibrary(rand, s) {
    const B = new Builder(rand, s);
    const tr = B.stem([0, 0, 0], 1.0 * s, 0, 0.04, { r: 0.03 * s, taper: 0.25, flex: 0.08, mass: 3, twist: 0.3 });
    B.roots([0, 0, 0], 4, 0.22 * s, 0.024 * s);
    B.knot([0, 0.02 * s, 0], 0.08 * s, 16, 0);
    B.knot(tr.tip, 0.09 * s, 20, 0, 0.08, 0);
    const tiers = [{ y: 1.0, R: 0.62, n: 8 }, { y: 1.26, R: 0.44, n: 6 }, { y: 1.48, R: 0.27, n: 4 }];
    tiers.forEach((tier, ti) => {
      const tips = [];
      for (let j = 0; j < tier.n; j++) {
        const yaw = j / tier.n * TAU + ti * 0.4, bp = ti * 0.5 + j * 0.3;
        const arm = B.stem([0, tier.y * s, 0], tier.R * s, yaw, -0.25, { r: 0.013 * s, lean0: 1.35, flex0: 0.08 + ti * 0.05, flex: 0.35, bp, mass: ti === 0 ? 1 : 0 });
        B.flow(tr.idx.concat(arm.idx));
        tips.push(arm.tip);
        B.knot(arm.tip, 0.03 * s, 7, 0, 0.4, bp);
        // a bloom cluster at the tip, in two colours, on its own opening cycle
        const cen = [arm.tip[0], arm.tip[1] + 0.03 * s, arm.tip[2]], petals = 7, cyc = 0.25 + rand() * 0.2, cph = j * 1.1 + ti;
        for (let pp = 0; pp < petals; pp++) { const pa = pp / petals * TAU; for (let k = 1; k <= 3; k++) { const t = k / 3; B.node(cen[0] + Math.cos(pa) * t * 0.09 * s, cen[1] + t * t * 0.04 * s, cen[2] + Math.sin(pa) * t * 0.09 * s, 0.01 * s * (1.1 - t * 0.3), 0.95, k === 3 ? 3 : 2, M.PETAL, cph, t, cen[0], cen[1], cen[2], cyc, 0.4, bp); } }
        B.node(cen[0], cen[1] + 0.01 * s, cen[2], 0.014 * s, 1, 4, M.PETAL, cph, 0.15, cen[0], cen[1], cen[2], cyc, 0.4, bp);
        // a book grown out of the arm, half a step in, closed or a little open
        const bx = arm.tip[0] * 0.72, bz = arm.tip[2] * 0.72;
        B.book([bx, tier.y * s + 0.04 * s, bz], 0.075 * s, 0.05 * s, yaw + 1.2, rand() < 0.5, 5, { open: 4, bw: 0.3, bp });
        // a drop hanging from under the arm, an orb of light on a string
        B.hang([arm.tip[0] * 0.5, tier.y * s - 0.01 * s, arm.tip[2] * 0.5], (0.1 + rand() * 0.14) * s, 2 + (j % 2), { kind: 'lantern', size: 0.022 * s, n: 6, weight: 1.1, bw: 0.25, bp, links: 2 });
      }
      // arches tip to tip: the tier as a ring of light
      for (let j = 0; j < tier.n; j++) B.arch(tips[j], tips[(j + 1) % tier.n], 0.06 * s, 10, 0.008 * s, 1, { bw: 0.35, bp: ti * 0.5 + j * 0.3, mass: true });
    });
    // the crown: an orb of light with a small canopy over it
    B.orb([0, 1.62 * s, 0], 0.11 * s, 60, [4, 2], { core: 0.5, bw: 0.15 });
    B.canopy([0, 1.78 * s, 0], 0.3 * s, 70, 1, { bw: 0.2, bp: 0.3, lobes: 3, squash: 0.5, r: 0.009 * s });
    // a shimmer that travels round the lowest ring
    const ring = [];
    for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; ring.push(B.node(Math.cos(a) * 0.62 * s, 1.0 * s + 0.02 * s, Math.sin(a) * 0.62 * s, 0.006 * s, 0.6, 4, M.BRANCH, 0, 0, 0, 0, 0, 0, 0.3, k)); }
    B.flow(ring);
    return B.done({ kind: 'hero-library', hero: true, flowRate: 0.5, flowDur: 3600 });
  }

  // ── HERO 3: the house on the scaffold. A life or place made over time:
  // vines and a lattice grew up from the ground and the house grew out of the
  // top of them, its windows lit; from its side a long vine arches over the
  // way, hung with lanterns, so we pass beneath the two of them together.
  function heroHouse(rand, s) {
    const B = new Builder(rand, s);
    const hx = 0.45 * s, hz = 0, top = 0.72 * s;
    // the living support: a lattice with three vines wound up through it
    B.lattice([hx, 0, hz], top, 0.3 * s, 5, 6, 0, { taper: 0.25, bw: 0.12 });
    B.roots([hx, 0, hz], 5, 0.22 * s, 0.022 * s);
    B.knot([hx, 0.02 * s, hz], 0.09 * s, 18, 0);
    for (let v = 0; v < 3; v++) {
      let from = [hx + Math.cos(v * 2.1) * 0.28 * s, 0, hz + Math.sin(v * 2.1) * 0.28 * s], lean = 0.4, all = [];
      for (let seg = 0; seg < 3; seg++) {
        const st = B.stem(from, 0.28 * s, v * 2.1 + Math.PI / 2 + seg * 0.9, 0.5, { r: 0.016 * s, lean0: lean, m: M.TWIST, w0: seg * 0.3, w1: (seg + 1) * 0.3, q: 0.02, ex: hx, ez: hz, taper: 0.05, flex0: seg * 0.04, flex: 0.04, bp: v, mass: 2 });
        all.push(...st.idx); from = st.tip; lean = 0.4;
        const o = st.idx[Math.floor(st.idx.length / 2)] * S;
        B.vine([B.P[o], B.P[o + 1], B.P[o + 2]], 0.16 * s, v * 2.1 + seg, 2.0, 1, { lean0: 0.9, bw: seg * 0.04, bp: v });
        for (let k = 0; k < 3; k++) { const o2 = st.idx[Math.floor(st.idx.length * (k + 0.5) / 3)] * S; B.node(B.P[o2] + 0.035 * s, B.P[o2 + 1] + 0.02 * s, B.P[o2 + 2] + (k - 1) * 0.03 * s, 0.011 * s, 0.9, 1, M.LEAF, rand() * TAU, 0.6, 0, 0, 0, 0, seg * 0.04, v); }
      }
      B.flow(all);
    }
    // the house, grown out of the top: walls, a filled roof, a door, windows that breathe, a chimney
    const W = 0.24 * s, H = 0.2 * s, y0 = top;
    const wall = (x0, yy0, z0, x1, yy1, z1, n) => { for (let k = 0; k < n; k++) { const t = k / (n - 1); B.node(x0 + (x1 - x0) * t, yy0 + (yy1 - yy0) * t, z0 + (z1 - z0) * t, 0.009 * s, 0.9, 0, M.BRANCH, 0, 0, 0, 0, 0, 0, 0.1, 0); } };
    for (const dz of [-1, 1]) {
      wall(hx - W, y0, hz + dz * W, hx + W, y0, hz + dz * W, 9); wall(hx - W, y0 + H, hz + dz * W, hx + W, y0 + H, hz + dz * W, 9);
      wall(hx - W, y0, hz + dz * W, hx - W, y0 + H, hz + dz * W, 7); wall(hx + W, y0, hz + dz * W, hx + W, y0 + H, hz + dz * W, 7);
      wall(hx - W, y0 + H, hz + dz * W, hx, y0 + H + 0.17 * s, hz + dz * W, 7); wall(hx + W, y0 + H, hz + dz * W, hx, y0 + H + 0.17 * s, hz + dz * W, 7);
      // wall fill: a sparse inner lattice so the wall reads as a surface
      for (let u = 1; u < 4; u++) for (let v = 1; v < 3; v++) B.node(hx - W + u / 4 * 2 * W, y0 + v / 3 * H, hz + dz * W, 0.006 * s, 0.5, 1, M.BRANCH, 0, 0, 0, 0, 0, 0, 0.1, 0);
    }
    for (const dx of [-1, 1]) { wall(hx + dx * W, y0, hz - W, hx + dx * W, y0, hz + W, 8); wall(hx + dx * W, y0 + H, hz - W, hx + dx * W, y0 + H, hz + W, 8); }
    // the roof, as two filled planes
    for (let u = 0; u <= 6; u++) for (let v = 0; v <= 5; v++) { const t = u / 6, side = v / 5 * 2 - 1; B.node(hx + side * W * (1 - t), y0 + H + t * 0.17 * s, hz - W + v / 5 * 2 * W * 0 + (u % 2 ? 0.01 : -0.01) * s + (v - 2.5) / 2.5 * W, 0.0075 * s, 0.7, 1, M.BRANCH, 0, 0, 0, 0, 0, 0, 0.1, 0); }
    wall(hx, y0 + H + 0.17 * s, hz - W, hx, y0 + H + 0.17 * s, hz + W, 8);
    wall(hx + W * 0.5, y0 + H + 0.08 * s, hz + W * 0.4, hx + W * 0.5, y0 + H + 0.26 * s, hz + W * 0.4, 5);   // the chimney
    for (const [wx, wy, wz] of [[hx - W * 0.45, y0 + H * 0.55, hz + W], [hx + W * 0.45, y0 + H * 0.55, hz + W], [hx, y0 + H * 0.3, hz + W], [hx - W, y0 + H * 0.55, hz], [hx + W, y0 + H * 0.55, hz - W * 0.3]])
      B.node(wx, wy, wz, 0.013 * s, 0.95, 4, M.SHIMMER, rand() * TAU, 0, 0, 0, 0, 0.45);
    // small lights round the house; a few fruit trees on the roofline
    for (let k = 0; k < 7; k++) B.node(hx, y0 + H * 0.7 + k * 0.025 * s, hz, 0.009 * s, 0.9, 4, M.ORBIT, k * 0.9, (0.36 + k * 0.03) * s, hx, y0 + H * 0.7 + k * 0.025 * s, hz, 0.1 + k * 0.03);
    for (let k = 0; k < 3; k++) { const st = B.stem([hx - W + k * W, y0 + H + 0.02 * s, hz - W], 0.1 * s, k, 0.3, { r: 0.006 * s, flex0: 0.1, flex: 0.4, bp: k }); B.orb(st.tip, 0.035 * s, 14, [2, 3], { core: 0.6, bw: 0.4, bp: k }); }
    // the vine over the way: from the house's side, up and across, down to the far ground, lanterns hanging
    const far = [-0.95 * s, 0, 0.1 * s], span = [];
    let from = [hx - W, y0 + H * 0.6, hz], lean = 1.2;
    for (let seg = 0; seg < 4; seg++) {
      const st = B.stem(from, 0.42 * s, Math.PI, seg < 2 ? -0.35 : 0.9, { r: 0.017 * s, lean0: lean, m: M.TWIST, w0: 0.3 + seg * 0.15, w1: 0.45 + seg * 0.15, q: 0.02, ex: hx, ez: hz, taper: 0.05, flex0: 0.12 + seg * 0.05, flex: 0.05, bp: 4, mass: 2 });
      span.push(...st.idx); from = st.tip; lean = st.lean;
      B.hang([from[0], from[1] - 0.02 * s, from[2]], (0.13 + seg * 0.04) * s, 2 + (seg % 3), { kind: 'lantern', size: 0.028 * s, weight: 1.2, bw: 0.15 + seg * 0.06, bp: seg, links: 3 });
      const o = st.idx[Math.floor(st.idx.length / 2)] * S;
      B.vine([B.P[o], B.P[o + 1], B.P[o + 2]], 0.22 * s, seg * 1.7, 2.4, 1, { lean0: 1.6, bw: 0.15 + seg * 0.05, bp: seg });
      for (let k = 0; k < 3; k++) { const o2 = st.idx[Math.floor(st.idx.length * (k + 0.5) / 3)] * S; B.node(B.P[o2] + (k - 1) * 0.03 * s, B.P[o2 + 1] + 0.03 * s, B.P[o2 + 2] + 0.03 * s, 0.011 * s, 0.9, 1, M.LEAF, rand() * TAU, 0.6, 0, 0, 0, 0, 0.15 + seg * 0.05, seg); }
    }
    B.flow(span);
    B.stem([far[0], 0, far[2]], 0.3 * s, 0, 0.2, { r: 0.014 * s, mass: 2, flex: 0.1 });   // where it came back down
    B.core = [hx, 0.02 * s, hz + 0.3 * s];
    return B.done({ kind: 'hero-house', hero: true, flowRate: 0.45 });
  }

  // ── HERO 4: the maker tree. Craft, work, expression. ────────────────────
  function heroMaker(rand, s) {
    const B = new Builder(rand, s);
    const tr = B.stem([0, 0, 0], 1.1 * s, 0.2, 0.22, { r: 0.024 * s, taper: 0.3, flex: 0.15, mass: 3 });
    B.roots([0, 0, 0], 4, 0.2 * s, 0.02 * s);
    const objs = MAKER_OBJ.slice();
    for (let j = 0; j < 7; j++) {
      const yaw = j * 2.4 + 0.3, at = tr.idx[Math.floor(tr.idx.length * (0.3 + 0.7 * j / 7))] * S;
      B.knot([B.P[at], B.P[at + 1], B.P[at + 2]], 0.04 * s, 9, 0, 0.15, j * 0.9);
      const br = B.stem([B.P[at], B.P[at + 1], B.P[at + 2]], (0.35 + rand() * 0.3) * s, yaw, 0.6, { r: 0.013 * s, lean0: 1.0, flex0: 0.15, flex: 0.35, bp: j * 0.9, mass: 1 });
      B.flow(tr.idx.concat(br.idx));
      // the branch thickens into the thing it grew; filaments respond round it
      const name = objs.splice(Math.floor(rand() * objs.length), 1)[0];
      const i = B.node(br.tip[0], br.tip[1] - 0.03 * s, br.tip[2], 0.014 * s, 1, 0, M.HEAVY, rand() * TAU, 1, 0, 0, 0, 0, 0.5, j * 0.9);
      B.node(br.tip[0], br.tip[1] - 0.06 * s, br.tip[2], 0.011 * s, 0.9, 0, M.HEAVY, rand() * TAU, 1, 0, 0, 0, 0, 0.5, j * 0.9);
      B.thing(i, name, 0.09 + rand() * 0.03, { dy: 0.2, swing: 0.035, col: 2 + (j % 3) });
      for (let k = 0; k < 4; k++) B.frond(br.tip, 0.14 * s, yaw + k * 1.6, 1.4 + rand(), 1, { ph: k, bw: 0.5, bp: j * 0.9 });
    }
    B.canopy(tr.tip, 0.32 * s, 60, 1, { bw: 0.3, bp: 0.1, lobes: 3 });
    return B.done({ kind: 'hero-maker', hero: true, flowRate: 0.35 });
  }

  // ── HERO 5: the spiral column. Curiosity: a great triple helix with a
  // second, inner helix for body, rungs between, a domed observatory grown at
  // the top with a slit and a telescope, constellations in its upper reaches,
  // and luminous object-forms orbiting round it on their own tilts and speeds.
  function heroObservatory(rand, s) {
    const B = new Builder(rand, s);
    const hgt = 2.05 * s, R = 0.2 * s, turns = 3.0, n = 104;
    B.roots([0, 0, 0], 5, 0.22 * s, 0.022 * s);
    B.knot([0, 0.03 * s, 0], 0.09 * s, 20, 0);
    for (let h = 0; h < 3; h++) {
      const idx = [], off = h / 3 * TAU;
      for (let i = 0; i <= n; i++) {
        const t = i / n, a = t * TAU * turns + off, rr = R * (1 - t * 0.45);
        idx.push(B.node(Math.cos(a) * rr, t * hgt, Math.sin(a) * rr, (0.014 - t * 0.005) * s, 1, h === 2 ? 1 : 0, M.TWIST, 0.5 + h, t, 0, 0, 0, 0.12));
        // body: a second lane just inside and just outside each strand
        B.node(Math.cos(a + 0.12) * rr * 0.82, t * hgt + 0.01 * s, Math.sin(a + 0.12) * rr * 0.82, (0.009 - t * 0.003) * s, 0.8, 0, M.TWIST, 0.5 + h, t, 0, 0, 0, 0.12);
        if (i % 2) B.node(Math.cos(a - 0.1) * rr * 1.14, t * hgt - 0.01 * s, Math.sin(a - 0.1) * rr * 1.14, (0.008 - t * 0.003) * s, 0.7, 1, M.TWIST, 0.5 + h, t, 0, 0, 0, 0.12);
        if (i % 12 === 6 && h === 0) {
          const a2 = a + TAU / 3;
          for (let k = 1; k <= 4; k++) B.node(Math.cos(a + (a2 - a) * k / 5) * rr, t * hgt + 0.01 * s * k, Math.sin(a + (a2 - a) * k / 5) * rr, 0.007 * s, 0.7, 0, M.TWIST, 0.5, t, 0, 0, 0, 0.12);
          if ((i / 12) % 2) B.node(Math.cos(a) * rr * 1.6, t * hgt + 0.02 * s, Math.sin(a) * rr * 1.6, 0.011 * s, 0.85, 1, M.LEAF, i, 0.6, 0, 0, 0, 0, 0.1 * t);
        }
      }
      B.flow(idx);
    }
    // constellations in the upper reaches: shimmering figures joined by faint lines
    for (let c = 0; c < 4; c++) {
      const cy = hgt * (0.5 + c * 0.11), ca = c * 1.9, cr = (0.34 + c * 0.05) * s, cx = Math.cos(ca) * cr, cz = Math.sin(ca) * cr;
      const pts = [];
      for (let k = 0; k < 5; k++) pts.push([cx + (rand() - 0.5) * 0.18 * s, cy + (rand() - 0.5) * 0.14 * s, cz + (rand() - 0.5) * 0.1 * s]);
      for (let k = 0; k < 5; k++) {
        B.node(pts[k][0], pts[k][1], pts[k][2], 0.012 * s, 1, k % 2 ? 4 : 3, M.SHIMMER, rand() * TAU, 0, 0, 0, 0, 0.7 + rand() * 0.8);
        if (k) for (let u = 1; u < 4; u++) { const t = u / 4; B.node(pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t, pts[k - 1][2] + (pts[k][2] - pts[k - 1][2]) * t, 0.004 * s, 0.35, 4); }
      }
    }
    // the observatory: a dome grown at the top, a slit left open, a telescope looking out of it
    const dy = hgt + 0.02 * s, DR = 0.26 * s;
    B.knot([0, dy - 0.02 * s, 0], 0.1 * s, 22, 0, 0.15, 0);
    for (let k = 0; k < 20; k++) { const a = k / 20 * TAU; B.node(Math.cos(a) * DR, dy, Math.sin(a) * DR, 0.012 * s, 1, 0, M.HEAVY, 0, 0.3, 0, 0, 0, 0, 0.15); }
    for (let i = 0; i < 150; i++) {
      const y = rand() * 0.95, rr = Math.sqrt(1 - y * y), a = rand() * TAU;
      if (a > 0.55 && a < 1.05 && y > 0.25) continue;   // the slit
      B.node(Math.cos(a) * rr * DR, dy + y * DR * 0.85, Math.sin(a) * rr * DR, 0.0085 * s * (0.8 + rand() * 0.4), 0.85, i % 5 ? 0 : 1, M.HEAVY, 0, 0.3, 0, 0, 0, 0, 0.15);
    }
    for (let k = 0; k < 8; k++) { const t = k / 7; B.node(Math.cos(0.8) * (0.1 + t * 0.3) * s, dy + 0.1 * s + t * 0.22 * s, Math.sin(0.8) * (0.1 + t * 0.3) * s, (0.012 - t * 0.004) * s, 1, 3, M.HEAVY, 1, 0.3, 0, 0, 0, 0, 0.15); }   // the telescope
    B.node(Math.cos(0.8) * 0.42 * s, dy + 0.34 * s, Math.sin(0.8) * 0.42 * s, 0.016 * s, 1, 4, M.SHIMMER, 0, 0, 0, 0, 0, 0.4);
    // luminous object-forms orbiting the column, each on its own tilt and speed
    const orbiters = ['star', 'key', 'lantern', 'bulb', 'balloon', 'kite', 'star', 'heart'];
    for (let k = 0; k < 8; k++) {
      const y = hgt * (0.35 + k * 0.075), i = B.node(0, y, 0, 0.012 * s, 1, 2 + (k % 3), M.ORBIT, k * 0.8, (0.42 + (k % 3) * 0.08) * s, 0, y, 0, (0.06 + (k % 4) * 0.025) * (k % 2 ? -1 : 1));
      B.thing(i, orbiters[k], 0.045, { dy: 0.035, swing: 0.03, col: 2 + (k % 3) });
      for (let q = 0; q < 3; q++) B.node(0, y + (q - 1) * 0.01 * s, 0, 0.006 * s, 0.7, 4, M.ORBIT, k * 0.8 - q * 0.12, (0.42 + (k % 3) * 0.08) * s, 0, y, 0, (0.06 + (k % 4) * 0.025) * (k % 2 ? -1 : 1));   // its trail
    }
    for (let k = 0; k < 10; k++) B.node(0, hgt * (0.8 + k * 0.02), 0, 0.012 * s, 1, 2 + (k % 2), M.ORBIT, k * 0.63, (0.28 + k * 0.02) * s, 0, hgt * (0.8 + k * 0.02), 0, (0.12 + k * 0.03) * (k % 2 ? -1 : 1));
    return B.done({ kind: 'hero-observatory', hero: true, flowRate: 0.5, flowDur: 3600 });
  }

  // ── HERO 6: the blooming network. Connection. ───────────────────────────
  function heroNetwork(rand, s) {
    const B = new Builder(rand, s);
    const clusters = [];
    for (let c = 0; c < 12; c++) {
      const a = c * 2.39996, rr = Math.sqrt((c + 0.5) / 12) * 1.05 * s;
      const cx = Math.cos(a) * rr, cz = Math.sin(a) * rr, h = (0.16 + rand() * 0.42) * s;
      const st = B.stem([cx, 0, cz], h, a, 0.2, { r: 0.009 * s, flex: 0.3, bp: c });
      const cen = st.tip, cyc = 0.22 + rand() * 0.2, cph = c * 1.3, col = 2 + (c % 3);
      const petals = 6 + Math.floor(rand() * 3), pr = (0.09 + rand() * 0.06) * s;
      for (let p = 0; p < petals; p++) {
        const pa = p / petals * TAU;
        for (let k = 1; k <= 3; k++) { const t = k / 3; B.node(cen[0] + Math.cos(pa) * t * pr, cen[1] + t * t * pr * 0.35, cen[2] + Math.sin(pa) * t * pr, 0.01 * s * (1.1 - t * 0.3), 0.95, col, M.PETAL, cph, t, cen[0], cen[1], cen[2], cyc, 0.3, c); }
      }
      B.node(cen[0], cen[1] + 0.01 * s, cen[2], 0.014 * s, 1, 4, M.PETAL, cph, 0.15, cen[0], cen[1], cen[2], cyc, 0.3, c);
      clusters.push({ cen, idx: st.idx });
    }
    // fine filaments between neighbouring clusters, and ripples that run along them
    for (let i = 0; i < clusters.length; i++) {
      const near = clusters.map((c, j) => ({ j, d: Math.hypot(c.cen[0] - clusters[i].cen[0], c.cen[2] - clusters[i].cen[2]) })).filter((x) => x.j !== i).sort((a, b) => a.d - b.d).slice(0, 2);
      for (const nb of near) {
        if (nb.j < i) continue;
        const A = clusters[i].cen, Bc = clusters[nb.j].cen, idx = [];
        for (let k = 1; k < 9; k++) { const t = k / 9; idx.push(B.node(A[0] + (Bc[0] - A[0]) * t, A[1] + (Bc[1] - A[1]) * t - Math.sin(t * Math.PI) * 0.05 * s, A[2] + (Bc[2] - A[2]) * t, 0.005 * s, 0.4, 1, M.VINE, k, 0.3, 0, 0, 0, 0)); }
        B.flow(clusters[i].idx.concat(idx, clusters[nb.j].idx.slice().reverse()));
      }
    }
    B.core = [clusters[0].cen[0], 0.02 * s, clusters[0].cen[2]];
    return B.done({ kind: 'hero-network', hero: true, flowRate: 0.7, flowDur: 2600 });
  }

  // ── HERO 7: the impossible one. A tree that grew a village in its tiers,
  // each with its own hanging garden, and a crown of orbiting light. ──────
  function heroImpossible(rand, s) {
    const B = new Builder(rand, s);
    // a twisted double trunk
    const trunk = [];
    for (let h = 0; h < 2; h++) {
      let from = [Math.cos(h * Math.PI) * 0.06 * s, 0, Math.sin(h * Math.PI) * 0.06 * s], lean = 0.15, idx = [];
      for (let seg = 0; seg < 4; seg++) {
        const st = B.stem(from, 0.42 * s, h * Math.PI + seg * 1.4, 0.3, { r: (0.026 - seg * 0.003) * s, lean0: lean, m: M.TWIST, w0: seg * 0.25, w1: (seg + 1) * 0.25, q: 0.03, taper: 0.05, flex0: seg * 0.03, flex: 0.03, mass: 3, twist: 0.3 });
        idx.push(...st.idx); from = st.tip; lean = 0.15;
      }
      trunk.push(idx);
    }
    B.roots([0, 0, 0], 6, 0.3 * s, 0.028 * s);
    B.knot([0, 0.03 * s, 0], 0.1 * s, 24, 0);
    // a second plant that grew up through the first: a climber round the trunk with small blooms
    for (let i = 0; i <= 70; i++) { const t = i / 70, a = t * TAU * 3.4, rr = 0.075 * s; B.node(Math.cos(a) * rr, t * 1.5 * s, Math.sin(a) * rr, 0.007 * s, 0.9, 5, M.VINE, a, 0.1 + 0.4 * t, 0, 0, 0, 0, 0.05 * t); if (i % 10 === 5) for (let q = 0; q < 6; q++) { const pa = q / 6 * TAU; B.node(Math.cos(a) * rr * 1.3 + Math.cos(pa) * 0.025 * s, t * 1.5 * s + Math.sin(pa) * 0.025 * s, Math.sin(a) * rr * 1.3, 0.006 * s, 0.9, 5, M.PETAL, a, 0.5, Math.cos(a) * rr * 1.3, t * 1.5 * s, Math.sin(a) * rr * 1.3, 0.4, 0.05 * t); } }
    const top = 1.6 * s;
    // three tiers: rings of platform nodes, each with small trees, hanging gardens and lanterns
    for (let tier = 0; tier < 3; tier++) {
      const ty = (0.55 + tier * 0.42) * s, tr = (0.62 - tier * 0.13) * s, ringIdx = [];
      B.knot([0, ty, 0], 0.08 * s, 20, 0, 0.05 + tier * 0.04, tier);
      for (let k = 0; k < 30; k++) { const a = k / 30 * TAU + tier + 0.1; B.node(Math.cos(a) * tr * 0.86, ty - 0.02 * s, Math.sin(a) * tr * 0.86, 0.009 * s, 0.8, 0, M.BRANCH, 0, 0, 0, 0, 0, 0, 0.1 + tier * 0.06, tier); }
      for (let k = 0; k < 36; k++) {
        const a = k / 36 * TAU + tier;
        ringIdx.push(B.node(Math.cos(a) * tr, ty, Math.sin(a) * tr, 0.011 * s, 0.9, 0, M.BRANCH, 0, 0, 0, 0, 0, 0, 0.1 + tier * 0.06, tier));
        if (k % 6 === 3) for (let u = 1; u < 4; u++) B.node(Math.cos(a) * tr * u / 4, ty, Math.sin(a) * tr * u / 4, 0.007 * s, 0.6, 0, M.BRANCH, 0, 0, 0, 0, 0, 0, 0.05 + tier * 0.04, tier);
      }
      B.flow(trunk[tier % 2].concat(ringIdx));
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * TAU + tier * 0.7, px = Math.cos(a) * tr * 0.7, pz = Math.sin(a) * tr * 0.7;
        // a small tree standing on the platform, with its own two or three fruit
        const st = B.stem([px, ty, pz], (0.18 + rand() * 0.1) * s, a, 0.2, { r: 0.008 * s, flex0: 0.1 + tier * 0.06, flex: 0.4, bp: tier + k });
        B.leaves(st.tip, 0.09 * s, 12, 0.4, 1 + (k % 2) * 2, { bw: 0.5, bp: tier + k, r: 0.008 * s });
        for (let q = 0; q < 2; q++) B.hang([st.tip[0] + (q - 0.5) * 0.06 * s, st.tip[1] - 0.02 * s, st.tip[2]], 0.04 * s, 2 + ((k + q) % 3), { kind: 'fruit', size: 0.012 * s, links: 1, bw: 0.5, bp: tier + k });
        // a hanging garden below the rim: vines that hang down, tips freest, with small leaves
        const rx = Math.cos(a + 0.4) * tr, rz = Math.sin(a + 0.4) * tr;
        const hv = B.vine([rx, ty, rz], (0.22 + rand() * 0.14) * s, a, 0.2, 1, { lean0: Math.PI, w0: 0.1, w1: 1, bw: 0.1 + tier * 0.06, bp: tier });
        for (let q = 1; q < hv.idx.length; q += 3) { const o = hv.idx[q] * S; B.node(B.P[o] + 0.025 * s, B.P[o + 1], B.P[o + 2], 0.008 * s, 0.85, 1, M.VINE, q, 0.6 + q * 0.05, 0, 0, 0, 0, 0.1 + tier * 0.06, tier); }
        B.hang([Math.cos(a + 0.8) * tr, ty - 0.01 * s, Math.sin(a + 0.8) * tr], (0.12 + rand() * 0.16) * s, 2 + (k % 3), { kind: 'lantern', size: (0.024 + rand() * 0.014) * s, weight: 1.3, bw: 0.15 + tier * 0.06, bp: tier + k, links: 3 });
        // small lights drifting under each tier
        B.node(px, ty - 0.08 * s, pz, 0.007 * s, 0.8, 4, M.ORBIT, k * 1.1 + tier, 0.18 * s, px, ty - 0.08 * s, pz, 0.06 + k * 0.02);
      }
      // arches from tree to tree round the rim, lanterns under each: the tier as a cloister
      const treeAt = (k) => { const a = k / 6 * TAU + tier * 0.7; return [Math.cos(a) * tr * 0.7, ty + 0.16 * s, Math.sin(a) * tr * 0.7]; };
      for (let k = 0; k < 6; k++) {
        B.arch(treeAt(k), treeAt((k + 1) % 6), 0.14 * s, 12, 0.009 * s, k % 2 ? 1 : 0, { bw: 0.12 + tier * 0.05, bp: tier + k, mass: true });
        const mid = treeAt(k + 0.5);
        B.hang([mid[0], mid[1] + 0.1 * s, mid[2]], 0.08 * s, 2 + ((k + tier) % 3), { kind: 'lantern', size: 0.02 * s, n: 5, weight: 1, bw: 0.15 + tier * 0.05, bp: tier + k, links: 1 });
      }
      // a little house on the middle tier, a boat hung under the top one
      if (tier === 1) { const hi = B.node(Math.cos(tier + 2.2) * tr * 0.5, ty + 0.02 * s, Math.sin(tier + 2.2) * tr * 0.5, 0.009 * s, 0.9, 0, M.BRANCH, 0, 0, 0, 0, 0, 0, 0.12, tier); B.thing(hi, 'house', 0.07, { dy: -0.06, swing: 0.01, col: 3 }); }
      if (tier === 2) { const h = B.hang([Math.cos(tier + 4) * tr * 0.9, ty - 0.02 * s, Math.sin(tier + 4) * tr * 0.9], 0.22 * s, 2, { kind: 'drop', size: 0.008 * s, weight: 2.5, links: 3, bw: 0.2, bp: tier }); B.thing(h[h.length - 1], 'boat', 0.08, { dy: 0.07, swing: 0.03, col: 3 }); }
    }
    // the crown: a bright core with orbiting light round it and a canopy above
    B.node(0, top, 0, 0.03 * s, 1, 4, M.SHIMMER, 0, 0, 0, 0, 0, 0.3);
    for (let k = 0; k < 14; k++) B.node(0, top + (k % 3) * 0.04 * s, 0, 0.01 * s, 0.95, k % 2 ? 4 : 2, M.ORBIT, k * 0.45, (0.18 + (k % 4) * 0.06) * s, 0, top + (k % 3) * 0.04 * s, 0, (0.08 + (k % 3) * 0.05) * (k % 2 ? 1 : -1));
    B.knot([0, top - 0.02 * s, 0], 0.07 * s, 16, 0, 0.2, 0);
    B.canopy([0, top + 0.16 * s, 0], 0.55 * s, 210, 1, { bw: 0.25, bp: 0.5, lobes: 5, squash: 0.5, r: 0.01 * s });
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; B.hang([Math.cos(a) * 0.42 * s, top + 0.02 * s, Math.sin(a) * 0.42 * s], (0.18 + (k % 3) * 0.08) * s, 2 + (k % 3), { kind: 'lantern', size: 0.028 * s, weight: 1.2, bw: 0.35, bp: k, links: 3 }); }
    return B.done({ kind: 'hero-impossible', hero: true, flowRate: 0.8 });
  }

  // ── THREE PIECES BUILT THE SEA ART'S WAY (2026-09-24). Each has an anatomy
  // before it has nodes: a primary body, secondary supports, tertiary
  // filaments, a focal bloom, an internal light path, a colour recipe, a
  // front and back, a motion anatomy and one dominant gesture. Swept bodies,
  // surface shells, spinning bands and anchored fill, not a cloud of dots
  // shaped like a thing.

  // THE MAKER BLOOM. Gesture: a living thing opening upward and offering what
  // it made. Primary body: a camera, a real 3D object (a rounded box skin, a
  // swept lens barrel with a luminous glass, a viewfinder, a strap), turning
  // slowly on its own axis so it reads from every side. Supports: three
  // braided swept stems rising from the roots. Filaments: tendrils curling
  // off the braid, a strap hanging in a curve. Focal bloom: a cup of seven
  // swept petal blades that breathe open and closed beneath the camera.
  // Light path: root, up a braid, into a petal, into the lens. Colour: ink
  // body, the first accent walking into the second up the petals, warm light
  // in the glass. Motion: stems sway from the base, petals breathe, the
  // object turns, sparks orbit it.
  function heroMakerBloom(rand, s) {
    const B = new Builder(rand, s);
    B.roots([0, 0, 0], 5, 0.24 * s, 0.024 * s);
    B.knot([0, 0.03 * s, 0], 0.09 * s, 20, 0);
    const top = 1.02 * s, braids = [];
    for (let b = 0; b < 3; b++) {
      const pts = [];
      for (let k = 0; k <= 6; k++) { const t = k / 6, a = b / 3 * TAU + t * TAU * 0.85, r = (0.1 - 0.05 * t + 0.03 * Math.sin(t * Math.PI)) * s; pts.push([Math.cos(a) * r, t * top, Math.sin(a) * r]); }
      const sw = B.sweep(pts, [{ at: 0, r: 0.034 * s }, { at: 0.7, r: 0.02 * s }, { at: 1, r: 0.014 * s }], 180, { c: b === 1 ? 1 : 0, m: M.BRANCH, bw0: 0, bw: 0.25, bp: 0.4, r: 0.009 * s });
      braids.push(sw.spine);
      B.fill(sw.spine, 30, 0.05 * s, { c: 1 });
      // a tendril curling off each braid, freest at its tip
      const o = sw.spine[Math.floor(sw.spine.length * 0.55)] * S, at = [B.P[o], B.P[o + 1], B.P[o + 2]], ta = b / 3 * TAU + 0.8;
      B.sweep([at, [at[0] + Math.cos(ta) * 0.16 * s, at[1] + 0.05 * s, at[2] + Math.sin(ta) * 0.16 * s], [at[0] + Math.cos(ta + 0.9) * 0.22 * s, at[1] + 0.16 * s, at[2] + Math.sin(ta + 0.9) * 0.22 * s], [at[0] + Math.cos(ta + 1.9) * 0.17 * s, at[1] + 0.2 * s, at[2] + Math.sin(ta + 1.9) * 0.17 * s]],
        [{ at: 0, r: 0.009 * s }, { at: 1, r: 0.003 * s }], 60, { c: 1, m: M.VINE, bw0: 0.15, bw: 0.35, bp: 0.4, r: 0.007 * s });
    }
    B.knot([0, top, 0], 0.06 * s, 18, 0, 0.25, 0.4);
    // the cup: seven petal blades curving out and up, breathing about the cup's centre
    const cup = [0, top + 0.02 * s, 0], petals = [];
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU + 0.2, ca = Math.cos(a), sa = Math.sin(a);
      const pts = [[ca * 0.03 * s, top, sa * 0.03 * s], [ca * 0.2 * s, top + 0.08 * s, sa * 0.2 * s], [ca * 0.33 * s, top + 0.25 * s, sa * 0.33 * s], [ca * 0.36 * s, top + 0.42 * s, sa * 0.36 * s]];
      const pe = B.sweep(pts, [{ at: 0, r: 0.02 * s }, { at: 0.55, r: 0.07 * s }, { at: 1, r: 0.012 * s }], 130, { blade: true, cols: [1, 2, 3], m: M.PETAL, e: cup, q: 0.32, ph: k * 0.25, mw: 0.5, bw0: 0.25, bw: 0.1, bp: 0.4, r: 0.008 * s });
      petals.push(pe.spine);
    }
    // THE OBJECT. A camera, the thing this bloom grew, turning slowly about
    // its own vertical axis (M.SPIN through its centre, 0.1 rad/s).
    const C = [0, top + 0.5 * s, 0], W = 0.3 * s, H = 0.2 * s, Dp = 0.15 * s, turn = { m: M.SPIN, e: C, q: 0.1, ph: 0, mw: 0 };
    const body = [];
    for (let i = 0; i < 540; i++) {
      // a rounded box: a point on the cube, pulled toward a superellipsoid so the corners soften
      const f = Math.floor(rand() * 6), u = rand() * 2 - 1, v = rand() * 2 - 1;
      let p = f === 0 ? [1, u, v] : f === 1 ? [-1, u, v] : f === 2 ? [u, 1, v] : f === 3 ? [u, -1, v] : f === 4 ? [u, v, 1] : [u, v, -1];
      const n4 = Math.pow(p[0] ** 4 + p[1] ** 4 + p[2] ** 4, 0.25); p = p.map((x) => x / n4);
      const edge = Math.max(Math.abs(u), Math.abs(v)) > 0.86;
      body.push(B.node(C[0] + p[0] * W, C[1] + p[1] * H, C[2] + p[2] * Dp, 0.0085 * s * (edge ? 1.25 : 0.9), edge ? 1 : 0.72, edge ? 0 : 1, M.SPIN, 0, 0, C[0], C[1], C[2], 0.1, 0, 0));
    }
    // viewfinder hump and shutter button on top, a flash window at the corner
    for (let i = 0; i < 90; i++) { const u = rand() * 2 - 1, v = rand() * 2 - 1, y = rand(); B.node(C[0] - 0.08 * s + u * 0.07 * s, C[1] + H + y * 0.06 * s, C[2] + v * 0.07 * s, 0.007 * s, 0.85, 0, M.SPIN, 0, 0, C[0], C[1], C[2], 0.1, 0, 0); }
    for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; B.node(C[0] + 0.18 * s + Math.cos(a) * 0.025 * s, C[1] + H + 0.015 * s, C[2] + Math.sin(a) * 0.025 * s, 0.007 * s, 1, 2, M.SPIN, 0, 0, C[0], C[1], C[2], 0.1, 0, 0); }
    for (let i = 0; i < 16; i++) B.node(C[0] + 0.2 * s + (i % 4 - 1.5) * 0.018 * s, C[1] + 0.12 * s + (Math.floor(i / 4) - 1.5) * 0.012 * s, C[2] + Dp * 1.02, 0.007 * s, 1, 4, M.SPIN, 0, 0, C[0], C[1], C[2], 0.1, 0, 0);
    // the lens: a swept barrel out of the front, rings stepping down, and a luminous glass
    const lens = B.sweep([[C[0], C[1] - 0.01 * s, C[2] + Dp], [C[0], C[1] - 0.01 * s, C[2] + Dp + 0.09 * s], [C[0], C[1] - 0.01 * s, C[2] + Dp + 0.17 * s]],
      [{ at: 0, r: 0.13 * s }, { at: 0.5, r: 0.12 * s }, { at: 0.55, r: 0.105 * s }, { at: 1, r: 0.1 * s }], 320, Object.assign({ c: 0, r: 0.0085 * s }, turn));
    const glassZ = C[2] + Dp + 0.172 * s, glass = [];
    for (let i = 0; i < 150; i++) {
      const rr = Math.sqrt(rand()) * 0.095 * s, a = rand() * TAU, inner = rr < 0.04 * s;
      glass.push(B.node(C[0] + Math.cos(a) * rr, C[1] - 0.01 * s + Math.sin(a) * rr, glassZ, 0.008 * s * (inner ? 1.3 : 0.8), inner ? 1 : 0.6, inner ? 4 : (i % 3 ? 5 : 2), M.SPIN, 0, 0, C[0], C[1], C[2], 0.1, 0, 0));
    }
    B.node(C[0], C[1] - 0.01 * s, glassZ + 0.005 * s, 0.024 * s, 1, 4, M.SPIN, 0, 0, C[0], C[1], C[2], 0.1, 0, 0);
    // the strap: a sagging filament from one shoulder to the other, turning with the body
    for (let k = 0; k <= 40; k++) { const t = k / 40, x = -W + 2 * W * t, y = C[1] + H - Math.sin(Math.PI * t) * 0.32 * s, z = C[2] - Dp * 0.6 + Math.sin(Math.PI * t) * 0.05 * s; B.node(x, y, z, 0.0065 * s, 0.8, 1, M.SPIN, 0, 0, C[0], C[1], C[2], 0.1, 0, 0); }
    // sparks orbiting the made thing
    for (let k = 0; k < 16; k++) B.node(C[0], C[1] + (k % 4 - 1.5) * 0.08 * s, C[2], 0.009 * s, 0.95, k % 3 ? 4 : 3, M.ORBIT, k * 0.9, (0.42 + (k % 3) * 0.08) * s, C[0], C[1] + (k % 4 - 1.5) * 0.08 * s, C[2], (0.06 + (k % 4) * 0.025) * (k % 2 ? 1 : -1));
    // the light path: root, braid, petal, into the lens and out through the glass
    for (let k = 0; k < 3; k++) B.flow(braids[k].concat(petals[k * 2], lens.spine, glass.slice(0, 12)));
    B.core = [0, 0.02 * s, 0];
    return B.done({ kind: 'hero-makerbloom', hero: true, flowRate: 0.7 });
  }

  // THE MEMORY ARCHIPELAGO. Gesture: a constellation holding itself up in the
  // air. Primary bodies: five suspended organic shells at different heights
  // and depths, each with a warm luminous core and its own colour, two with
  // spinning bands. Supports: one living stem rising from the ground to the
  // lowest island (it grew; it was not hung). Filaments: fine sagging strands
  // between neighbours, beaded with light; tendrils hanging from two
  // islands. Light path: up the stem, island to island along the strands.
  // Colour: each island a different Cosmos accent over ink, warm cores.
  // Motion: every island drifts as one body on its own slow phase, the
  // strands blend between them, the bands turn.
  function heroArchipelago(rand, s) {
    const B = new Builder(rand, s);
    const isles = [
      { c: [-0.35, 1.05, 0.15], R: 0.26, col: 2, ring: true },
      { c: [0.4, 1.6, -0.4], R: 0.33, col: 3 },
      { c: [0.95, 1.15, 0.45], R: 0.2, col: 5 },
      { c: [-0.25, 2.2, 0.55], R: 0.23, col: 3, ring: true },
      { c: [0.6, 2.6, -0.05], R: 0.29, col: 2 },
    ];
    B.roots([0, 0, 0], 5, 0.22 * s, 0.02 * s);
    B.knot([0, 0.03 * s, 0], 0.08 * s, 18, 0);
    const stem = B.sweep([[0, 0, 0], [-0.1 * s, 0.35 * s, 0.05 * s], [-0.3 * s, 0.7 * s, 0.1 * s], [-0.35 * s, 0.85 * s, 0.15 * s]], [{ at: 0, r: 0.03 * s }, { at: 1, r: 0.012 * s }], 200, { c: 0, m: M.BRANCH, bw0: 0, bw: 0.7, bp: 0, r: 0.008 * s });
    const cores = [];
    isles.forEach((I, k) => {
      const c = I.c.map((v) => v * s), R = I.R * s, bw = 0.7 + k * 0.08, bp = k * 1.3;
      I.bw = bw; I.bp = bp; I.at = c;
      const sh = B.shell(c, R, Math.round(300 * I.R / 0.26), [1, I.col], { lumpy: 0.18, squash: 0.8, bw, bp, m: M.LEAF, r: 0.009 * s });
      B.fill(sh, 36, R * 0.3, { c: 1 });
      // the warm core, dense and bright, with a slow shimmer on a few of its nodes
      const core = B.orb(c, R * 0.35, 70, [4, I.col], { core: 0.4, bw, bp, m: M.HEAVY, r: 0.009 * s });
      for (let q = 0; q < 6; q++) B.node(c[0], c[1], c[2], 0.012 * s, 1, 4, M.SHIMMER, q * 1.1, 0, 0, 0, 0, 0.4 + q * 0.07, bw, bp);
      cores.push(core);
      if (I.ring) B.orbitRing(c, R * 1.45, 150, 0.5 + k * 0.3, k * 1.1, { c: I.col === 2 ? 5 : 2, q: k % 2 ? -0.22 : 0.18, beads: 4, bw, bp });
      if (k === 1 || k === 4) for (let q = 0; q < 4; q++) { const a = q / 4 * TAU + k; B.vine([c[0] + Math.cos(a) * R * 0.5, c[1] - R * 0.6, c[2] + Math.sin(a) * R * 0.5], (0.18 + rand() * 0.14) * s, a, 0.1, I.col, { lean0: Math.PI, w0: 0.2, w1: 1, bw, bp }); }
    });
    // strands between neighbours, each blended between the two islands' sway
    const pairs = [[0, 1], [1, 2], [1, 3], [3, 4], [0, 3], [2, 4]], strands = [];
    for (const [a, b] of pairs) {
      const A = isles[a], Bq = isles[b];
      strands.push(B.filament(A.at, Bq.at, 0.1 * s, 34, { c: 1, beads: 7, bw0: A.bw, bw1: Bq.bw, bp0: A.bp, bp1: Bq.bp, ph: a }));
    }
    B.flow(stem.spine.concat(cores[0].slice(0, 6), strands[0], cores[1].slice(0, 6), strands[2], cores[3].slice(0, 6), strands[3]));
    B.flow(cores[1].slice(0, 6).concat(strands[1], cores[2].slice(0, 6), strands[5], cores[4].slice(0, 6)));
    return B.done({ kind: 'hero-archipelago', hero: true, flowRate: 0.9, flowDur: 3600 });
  }

  // THE IMPOSSIBLE MACHINE-GARDEN. Gesture: a trunk holding up a turning
  // heart. Primary body: a luminous core at the top of a swept trunk, inside
  // three nested bands that turn on different tilted axes at different
  // speeds, like a gyroscope that grew. Supports: the trunk with a scaffold
  // round its lower half, and two counterweighted arms crossing at different
  // heights (a heavy shell at one end, hanging blooms at the other).
  // Filaments: lantern strings, satellite lights. Focal: the core. Light
  // path: roots, trunk, into the core, out along an arm. Colour: ink
  // structure, three accents on the three bands, warm core. Motion: the bands
  // turn, the blooms swing, satellites orbit, the whole sways from the base.
  function heroMachineGarden(rand, s) {
    const B = new Builder(rand, s);
    B.roots([0, 0, 0], 6, 0.28 * s, 0.028 * s);
    B.knot([0, 0.03 * s, 0], 0.1 * s, 24, 0);
    const trunk = B.sweep([[0, 0, 0], [0.06 * s, 0.5 * s, 0], [-0.05 * s, 1.0 * s, 0.03 * s], [0, 1.55 * s, 0]], [{ at: 0, r: 0.07 * s }, { at: 0.6, r: 0.045 * s }, { at: 1, r: 0.035 * s }], 480, { c: 0, m: M.BRANCH, bw0: 0, bw: 0.25, bp: 0.2, r: 0.01 * s });
    B.fill(trunk.spine, 90, 0.06 * s, { c: 1 });
    B.lattice([0, 0.05 * s, 0], 0.7 * s, 0.16 * s, 4, 6, 0, { bw: 0.1, bp: 0.2, taper: 0.4 });
    const C = [0, 1.78 * s, 0];
    const heart = B.orb(C, 0.13 * s, 160, [4, 2], { core: 0.35, m: M.HEAVY, bw: 0.25, bp: 0.2, r: 0.011 * s });
    for (let q = 0; q < 8; q++) B.node(C[0], C[1], C[2], 0.014 * s, 1, 4, M.SHIMMER, q * 0.8, 0, 0, 0, 0, 0.35 + q * 0.05, 0.25, 0.2);
    const bands = [
      B.orbitRing(C, 0.3 * s, 130, 0.45, 0.3, { c: 2, q: 0.34, beads: 5, bw: 0.25, bp: 0.2 }),
      B.orbitRing(C, 0.43 * s, 170, 1.1, 2.1, { c: 3, q: -0.21, beads: 6, bw: 0.25, bp: 0.2, band: 0.06 }),
      B.orbitRing(C, 0.57 * s, 210, 1.45, 4.0, { c: 5, q: 0.13, beads: 7, bw: 0.25, bp: 0.2, band: 0.07 }),
    ];
    // two counterweighted arms: a shallow beam across the trunk, a heavy shell
    // at the short end, three hanging blooms along the long one
    const arm = (y, ang, long, short, colW, k) => {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const beam = B.sweep([[-ca * short, y + 0.05 * s, -sa * short], [0, y, 0], [ca * long * 0.5, y + 0.03 * s, sa * long * 0.5], [ca * long, y + 0.1 * s, sa * long]], [{ at: 0, r: 0.022 * s }, { at: 0.35, r: 0.03 * s }, { at: 1, r: 0.012 * s }], 260, { c: 0, m: M.BRANCH, bw0: 0.2, bw: 0.25, bp: 0.2 + k, r: 0.008 * s });
      B.shell([-ca * short, y + 0.02 * s, -sa * short], 0.09 * s, 150, [1, colW], { m: M.HEAVY, bw: 0.3, bp: 0.2 + k, r: 0.009 * s, depth: 0.6 });
      for (let q = 1; q <= 3; q++) {
        const t = q / 3, px = ca * long * t, pz = sa * long * t, py = y + 0.03 * s * t + 0.05 * s * t * t;
        const h = B.hang([px, py, pz], (0.14 + q * 0.07) * s, 2 + ((q + k) % 3), { kind: 'lantern', size: (0.03 + 0.008 * q) * s, n: 7, weight: 1.2, links: 3, bw: 0.3 + 0.1 * t, bp: 0.2 + k });
        // a bloom under each lantern: a small ring of petals hanging with it
        const o = h[h.length - 1] * S;
        for (let r = 0; r < 8; r++) { const a = r / 8 * TAU; B.node(B.P[o] + Math.cos(a) * 0.03 * s, B.P[o + 1] - 0.03 * s, B.P[o + 2] + Math.sin(a) * 0.03 * s, 0.007 * s, 0.9, 5, M.PEND, B.P[o + 7], B.P[o + 8], B.P[o + 9], B.P[o + 10], B.P[o + 11], B.P[o + 12], B.P[o + 13], B.P[o + 14]); }
      }
      return beam.spine;
    };
    const armA = arm(1.2 * s, 0.4, 0.95 * s, 0.4 * s, 3, 0), armB = arm(1.46 * s, 2.3, 0.75 * s, 0.32 * s, 2, 1.5);
    // satellites: small bright bodies orbiting the heart outside the bands
    for (let k = 0; k < 10; k++) B.node(C[0], C[1] + (k % 5 - 2) * 0.07 * s, C[2], 0.012 * s, 1, k % 2 ? 4 : 5, M.ORBIT, k * 0.63, (0.7 + (k % 3) * 0.08) * s, C[0], C[1] + (k % 5 - 2) * 0.07 * s, C[2], (0.05 + (k % 4) * 0.02) * (k % 2 ? 1 : -1));
    // a crown of small blooms above the heart
    B.canopy([0, C[1] + 0.68 * s, 0], 0.26 * s, 110, 5, { bw: 0.35, bp: 0.2, lobes: 4, squash: 0.45, r: 0.009 * s });
    B.flow(trunk.spine.concat(heart.slice(0, 10), bands[0].slice(0, 40)));
    B.flow(trunk.spine.slice(0, Math.floor(trunk.spine.length * 0.78)).concat(armA));
    B.flow(trunk.spine.slice(0, Math.floor(trunk.spine.length * 0.94)).concat(armB));
    return B.done({ kind: 'hero-machinegarden', hero: true, flowRate: 0.8 });
  }

  // ── THE ROOM BY THE FIRE (2026-09-24, hearth first). Where the host sits
  // with you before any journey: a hearth with a living fire, a reading chair
  // the host sits in, a couch with a blanket, a dog asleep on the rug, a lamp,
  // a small table where the seed rests, and on the wall a looking glass.
  // Built with the same grammar as the grown pieces, so the room and the
  // worlds are one material. Each builder faces local -z (toward you).
  function boxSkin(B, c, w, h, d, n, col, o) {
    const rand = B.rand, idx = [];
    for (let i = 0; i < n; i++) {
      const f = Math.floor(rand() * 6), u = rand() * 2 - 1, v = rand() * 2 - 1;
      let p = f === 0 ? [1, u, v] : f === 1 ? [-1, u, v] : f === 2 ? [u, 1, v] : f === 3 ? [u, -1, v] : f === 4 ? [u, v, 1] : [u, v, -1];
      const n4 = Math.pow(p[0] ** 4 + p[1] ** 4 + p[2] ** 4, 0.25); p = p.map((x) => x / n4);
      const edge = Math.max(Math.abs(u), Math.abs(v)) > 0.84;
      idx.push(B.node(c[0] + p[0] * w, c[1] + p[1] * h, c[2] + p[2] * d, (o && o.r || 0.011) * (edge ? 1.2 : 0.85), edge ? 1 : 0.7, edge ? col : (o && o.fill != null ? o.fill : col), (o && o.m) || M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0));
    }
    return idx;
  }
  // THE HEARTH. Gesture: warmth gathering. A stone surround round an opening,
  // a mantel with a few small things, a chimney breast, logs on a grate, and
  // a fire of rising, flickering light (M.FLAME): gold at the root, orange in
  // the body, red at the tips, sparks lifting higher. Colour recipe: ink
  // stone, warm light and the palette's warm accents in the fire.
  function roomHearth(rand) {
    const B = new Builder(rand, 1);
    const W = 0.62, Hh = 0.95;
    // stones: small lumpy bodies round the opening and up the breast
    const stone = (x, y, z, r) => B.shell([x, y, z], r, 18, [1, 0], { lumpy: 0.25, squash: 0.7, m: M.STATIC, r: 0.011, depth: 0.5 });
    for (let k = 0; k <= 9; k++) { const t = k / 9; stone(-W - 0.1, t * Hh, -0.05, 0.09); stone(W + 0.1, t * Hh, -0.05, 0.09); }
    for (let k = 0; k <= 12; k++) { const t = k / 12, a = Math.PI * t; stone(Math.cos(a) * (W + 0.1), Hh + Math.sin(a) * 0.16, -0.05, 0.08); }
    // the mantel, and the chimney breast rising behind it
    boxSkin(B, [0, Hh + 0.26, -0.08], 0.92, 0.05, 0.16, 520, 0, { r: 0.012, fill: 1 });
    // the firelight on the underside of the mantel, flickering with the fire
    for (let k = 0; k < 40; k++) B.node(-0.85 + k * 0.0435, Hh + 0.2, -0.15, 0.011, 1, k % 3 ? 2 : 4, M.SHIMMER, rand() * TAU, 0, 0, 0, 0, 0.6 + rand() * 0.8, 0, 0);
    // a candle at the far end of the mantel from the host's chair, so it never
    // stands behind the host (Dan, 2026-10-04)
    for (const cx of [-0.78]) {
      for (let k = 0; k < 9; k++) B.node(cx, Hh + 0.32 + k * 0.022, -0.1, 0.014, 1, 4, M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0);
      for (let i = 0; i < 26; i++) { const u = rand(); B.node(cx + (rand() - 0.5) * 0.03 * (1 - u), Hh + 0.53 + u * 0.08, -0.1, 0.013 * (1.2 - u * 0.6), 1, u < 0.4 ? 4 : u < 0.75 ? 2 : 3, M.FLAME, rand(), 0.06, 0, 0, 0, 1 + rand() * 0.8, 0, 0); }
    }
    // the back of the firebox, darker
    for (let i = 0; i < 200; i++) B.node((rand() * 2 - 1) * W * 0.9, rand() * Hh * 0.95, 0.12, 0.01, 0.35, 0, M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0);
    // small things on the mantel
    const m1 = B.node(-0.55, Hh + 0.34, -0.1, 0.01, 1, 0, M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0); B.thing(m1, 'lantern', 0.12, { dy: -0.05, swing: 0, col: 4 });
    const m2 = B.node(0.5, Hh + 0.34, -0.1, 0.01, 1, 0, M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0); B.thing(m2, 'cup', 0.09, { dy: -0.04, swing: 0, col: 3 });
    // the grate and the logs
    for (let k = 0; k < 16; k++) B.node(-0.35 + k * 0.047, 0.07, -0.05, 0.009, 0.9, 0, M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0);
    B.sweep([[-0.38, 0.1, -0.02], [0.38, 0.14, 0.02]], 0.055, 220, { c: 1, r: 0.01 });
    B.sweep([[-0.3, 0.12, 0.06], [0.34, 0.1, -0.12]], 0.05, 200, { c: 0, r: 0.01 });
    B.sweep([[-0.2, 0.2, -0.08], [0.25, 0.24, 0.05]], 0.045, 170, { c: 1, r: 0.01 });
    // embers along the logs
    for (let k = 0; k < 40; k++) B.node((rand() * 2 - 1) * 0.36, 0.08 + rand() * 0.14, (rand() - 0.5) * 0.15, 0.012, 1, rand() < 0.5 ? 2 : 3, M.SHIMMER, rand() * TAU, 0, 0, 0, 0, 0.8 + rand() * 1.2, 0, 0);
    // THE FIRE: tongues of rising light. Each node rises through its own band
    // and fades as it rises, then begins again: gold low, orange, red tips.
    const tongues = 9;
    for (let k = 0; k < tongues; k++) {
      const x0 = -0.33 + k / (tongues - 1) * 0.66 + (rand() - 0.5) * 0.05, h = 0.4 + Math.sin(k / (tongues - 1) * Math.PI) * 0.42 + rand() * 0.1;
      for (let i = 0; i < 58; i++) {
        const u = rand(), y0 = 0.14 + u * h * 0.55, spread = 0.07 * (1 - u * 0.7);
        const col = u < 0.3 ? 4 : u < 0.55 ? 5 : u < 0.8 ? 2 : 3;
        B.node(x0 + (rand() - 0.5) * spread * 2, y0, (rand() - 0.5) * 0.1, 0.016 * (1.2 - u * 0.6), 1, col, M.FLAME, rand(), h * 0.5, 0, 0, 0, 0.9 + rand() * 0.8, 0, 0);
      }
    }
    // sparks lifting higher, slower
    for (let k = 0; k < 18; k++) B.node((rand() - 0.5) * 0.4, 0.3 + rand() * 0.2, (rand() - 0.5) * 0.1, 0.008, 1, rand() < 0.5 ? 4 : 2, M.FLAME, rand(), 0.9 + rand() * 0.5, 0, 0, 0, 0.25 + rand() * 0.2, 0, 0);
    B.core = [0, 0.1, 0];
    return B.done({ kind: 'room-hearth', hero: true, flowRate: 0 });
  }
  // THE READING CHAIR (the host's). A deep seat, a tall curved back, rolled
  // arms, short legs, a cushion. Upholstery in one accent, wood in ink.
  function roomChair(rand) {
    const B = new Builder(rand, 1);
    for (const [x, z] of [[-0.28, -0.25], [0.28, -0.25], [-0.28, 0.25], [0.28, 0.25]]) B.sweep([[x, 0, z], [x, 0.2, z]], 0.02, 30, { c: 0, r: 0.009 });
    boxSkin(B, [0, 0.3, 0], 0.34, 0.1, 0.32, 520, 2, { r: 0.011, fill: 1 });
    B.shell([0, 0.44, -0.02], 0.3, 220, [1, 3], { squash: 0.25, m: M.STATIC, r: 0.011, depth: 0.3 });
    for (let k = 0; k < 7; k++) { const x = -0.3 + k * 0.1; B.sweep([[x, 0.36, 0.3], [x * 1.05, 0.8, 0.36], [x * 1.1, 1.18, 0.3]], 0.05, 110, { blade: true, c: 2, r: 0.01 }); }
    for (const side of [-1, 1]) B.sweep([[side * 0.38, 0.32, -0.3], [side * 0.42, 0.58, -0.28], [side * 0.4, 0.62, 0.05], [side * 0.38, 0.56, 0.3]], 0.07, 260, { c: 2, r: 0.01 });
    return B.done({ kind: 'room-chair', flowRate: 0 });
  }
  // THE COUCH, AND ITS BLANKET. A long base, a back, rolled arms, three seat
  // cushions and two at the back; a striped blanket thrown over one arm and
  // across the seat, its fringe loose at the end.
  function roomCouch(rand) {
    const B = new Builder(rand, 1);
    for (const [x, z] of [[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]]) B.sweep([[x, 0, z], [x, 0.12, z]], 0.02, 20, { c: 0, r: 0.009 });
    boxSkin(B, [0, 0.24, 0], 0.88, 0.11, 0.36, 900, 5, { r: 0.011, fill: 1 });
    boxSkin(B, [0, 0.62, 0.3], 0.88, 0.28, 0.07, 700, 5, { r: 0.011, fill: 1 });
    for (const side of [-1, 1]) B.sweep([[side * 0.92, 0.3, -0.34], [side * 0.96, 0.52, -0.3], [side * 0.95, 0.56, 0.1], [side * 0.93, 0.5, 0.34]], 0.09, 300, { c: 5, r: 0.011 });
    for (let k = 0; k < 3; k++) B.shell([-0.56 + k * 0.56, 0.4, -0.04], 0.3, 170, [1, 5], { squash: 0.3, m: M.STATIC, r: 0.011, depth: 0.3 });
    for (let k = 0; k < 2; k++) B.shell([-0.4 + k * 0.8, 0.62, 0.18], 0.28, 140, [1, 5], { squash: 0.55, m: M.STATIC, r: 0.011, depth: 0.3 });
    // the blanket: striped, draped over the left arm and along the seat
    const path = [[-0.96, 0.2, -0.36], [-0.97, 0.58, -0.2], [-0.72, 0.5, -0.12], [-0.3, 0.47, -0.2], [-0.05, 0.43, -0.34], [0.1, 0.25, -0.42]];
    const bl = B.sweep(path, 0.24, 900, { blade: true, cols: [3, 4, 3, 4, 3, 4, 3, 4, 3], r: 0.011, m: M.LEAF, mw: 0.15, bw0: 0, bw: 0.05, bp: 0.4 });
    for (let k = 0; k < 14; k++) { const x = 0.1 + (k - 7) * 0.03, z = -0.42; for (let u = 1; u <= 3; u++) B.node(x, 0.25 - u * 0.03, z, 0.006, 0.8, 3, M.VINE, k, 0.3 + u * 0.2, 0, 0, 0, 0, 0.1, 0.4); }
    B.flow(bl.spine);
    return B.done({ kind: 'room-couch', flowRate: 0 });
  }
  // THE DOG, ASLEEP. Curled nose to tail on the rug by the fire: a swept body
  // round a curl (thick at the chest, thinning to the tail wrapped in front),
  // the head resting on its paws, soft ears, closed eyes. The whole body
  // breathes, slowly (M.BREATHE), and small lights drift up from it.
  // ── THE ROOM WAKES UP. Quirky small things in the room, each asleep (dim,
  // still) until the conversation reaches what it stands for; then it lights
  // and moves (the page decides which, from what the seed holds). A bedtime
  // room in spirit: a window with a moon that rises, a clock that starts to
  // tick, mittens drying on a line by the fire, a little picture, a red
  // balloon, a plant that blooms, a stack of books, a toy house.
  function roomItem(rand, what) {
    const B = new Builder(rand, 1);
    const pt = (x, y, z, r, a, c, m, ph, w, ex, ey, ez, q) => B.node(x, y, z, r, a, c, m || M.STATIC, ph || 0, w || 0, ex || 0, ey || 0, ez || 0, q || 0, 0, 0);
    const rect = (x0, y0, x1, y1, z, n, c, r) => { for (let k = 0; k < n; k++) { const t = k / n, per = 2 * ((x1 - x0) + (y1 - y0)); let d = t * per; let x, y; if (d < x1 - x0) { x = x0 + d; y = y0; } else if ((d -= x1 - x0) < y1 - y0) { x = x1; y = y0 + d; } else if ((d -= y1 - y0) < x1 - x0) { x = x1 - d; y = y1; } else { d -= x1 - x0; x = x0; y = y1 - d; } pt(x, y, z, r, 1, c); } };
    if (what === 'window') {
      // a window in the back wall; the moon rises in it (M.RISE) and the night fills with small lights
      for (const off of [0, 0.03]) rect(-0.52 - off, 1.48 - off, 0.52 + off, 2.52 + off, -0.01, 150, off ? 1 : 0, 0.012);
      for (let k = 0; k < 40; k++) { pt(-0.52 + k / 39 * 1.04, 2.0, 0, 0.01, 0.9, 0); pt(0, 1.48 + k / 39 * 1.04, 0, 0.01, 0.9, 0); }
      for (let k = 0; k < 30; k++) pt(-0.6 + k / 29 * 1.2, 1.44, -0.06, 0.013, 1, 1);   // the sill
      for (let i = 0; i < 260; i++) { const a = rand() * TAU, u = Math.sqrt(rand()); pt(0.18 + Math.cos(a) * u * 0.14, 1.68 + Math.sin(a) * u * 0.14, 0.12, 0.011, u > 0.85 ? 1 : 0.8, u > 0.7 ? 4 : 5, M.RISE, a, 0.4); }
      for (let k = 0; k < 16; k++) pt(-0.46 + rand() * 0.92, 1.55 + rand() * 0.9, 0.1, 0.008, 1, 4, M.SHIMMER, rand() * TAU, 0, 0, 0, 0, 0.5 + rand());
      return B.done({ kind: 'room-window', flowRate: 0 });
    }
    if (what === 'clock') {
      // a small round clock on the mantel: its hands start going round (M.TICK) once there is a first step
      const cy = 1.47, R = 0.13;
      boxSkin(B, [0, cy - 0.02, 0.04], 0.16, 0.17, 0.05, 260, 1, { r: 0.009 });
      for (let k = 0; k < 44; k++) { const a = k / 44 * TAU; pt(Math.cos(a) * R, cy + Math.sin(a) * R, -0.02, 0.011, 1, 0); }
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; pt(Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.8, -0.025, k % 3 ? 0.006 : 0.01, 1, 4); }
      for (let k = 1; k <= 5; k++) pt(0, cy + k * 0.015, -0.03, 0.009, 1, 2, M.TICK, Math.PI / 2, Math.PI / 2, 0, cy, -0.03, -0.06);
      for (let k = 1; k <= 8; k++) pt(0, cy + k * 0.013, -0.032, 0.007, 1, 3, M.TICK, Math.PI / 2, Math.PI / 2, 0, cy, -0.032, -0.7);
      pt(0, cy, -0.035, 0.014, 1, 4);
      return B.done({ kind: 'room-clock', flowRate: 0 });
    }
    if (what === 'mittens') {
      // a line strung in front of the fire, a pair of mittens and a sock hung on it
      B.filament([-0.5, 1.02, 0], [0.5, 1.02, 0], 0.05, 40, { c: 0, bw0: 0, bw1: 0 });
      const hangAt = (x, cols, kind) => {
        const y0 = 1.02 - 0.05 * Math.sin(Math.PI * (x + 0.5)) - 0.01, L = 0.02, ph = rand() * TAU;
        const body = kind === 'sock' ? [[0, -0.04, 0.035], [0, -0.09, 0.033], [0, -0.14, 0.032], [0.03, -0.17, 0.03], [0.06, -0.18, 0.026]] : [[0, -0.04, 0.045], [0, -0.09, 0.05], [0, -0.14, 0.045], [-0.05, -0.08, 0.02], [-0.06, -0.05, 0.016]];
        for (const [dx, dy, r] of body) for (let i = 0; i < 18; i++) { const a = rand() * TAU, u = Math.sqrt(rand()); B.node(x + dx + Math.cos(a) * u * r, y0 + dy + Math.sin(a) * u * r, (rand() - 0.5) * 0.02, 0.009, 0.95, cols[i % cols.length], M.PEND, ph, L, x, y0, 0, 1.4, 0, 0); }
      };
      hangAt(-0.28, [2, 5], 'mitten'); hangAt(-0.08, [2, 5], 'mitten'); hangAt(0.2, [3, 4], 'sock');
      return B.done({ kind: 'room-mittens', flowRate: 0 });
    }
    if (what === 'picture') {
      // a small framed picture: a tiny world with a moon over it
      for (const off of [0, 0.025]) rect(-0.22 - off, 1.58 - off, 0.22 + off, 1.92 + off, -0.01, 110, off ? 1 : 0, 0.01);
      for (let k = 0; k < 36; k++) { const a = k / 36 * TAU; pt(Math.cos(a) * 0.09, 1.73 + Math.sin(a) * 0.09, -0.015, 0.008, 1, 1); }
      for (let i = 0; i < 40; i++) { const a = rand() * TAU, u = Math.sqrt(rand()) * 0.085; pt(Math.cos(a) * u, 1.73 + Math.sin(a) * u, -0.015, 0.008, 0.9, [2, 3, 5][i % 3]); }
      for (let i = 0; i < 12; i++) { const a = rand() * TAU, u = Math.sqrt(rand()) * 0.03; pt(0.14 + Math.cos(a) * u, 1.86 + Math.sin(a) * u, -0.015, 0.008, 1, 4); }
      return B.done({ kind: 'room-picture', flowRate: 0 });
    }
    if (what === 'balloon') {
      // a red balloon tied to the chair's arm: it lifts (M.RISE) when there is somewhere to go
      const top = 0.95, lift = 0.55;
      for (let k = 0; k <= 30; k++) { const f = k / 30; pt(Math.sin(f * 5) * 0.02 * f, 0.02 + f * (top - 0.16), 0, 0.005, 0.8, 0, M.RISE, 1.3, lift * f); }
      B.shell([0, top, 0], 0.14, 260, [2, 2], { squash: 1.18, m: M.RISE, ph: 1.3, w: lift, r: 0.011, depth: 0.35 });
      for (let k = 0; k < 6; k++) pt((rand() - 0.5) * 0.03, top - 0.17 + rand() * 0.02, 0, 0.008, 1, 2, M.RISE, 1.3, lift);
      pt(-0.05, top + 0.07, -0.13, 0.016, 0.9, 4, M.RISE, 1.3, lift);   // the shine
      return B.done({ kind: 'room-balloon', flowRate: 0 });
    }
    if (what === 'plant') {
      // a potted plant by the window: its flowers open (M.BLOOM) with what grows and what rests
      B.shell([0, 0.1, 0], 0.12, 200, [1, 0], { cap: 0.3, squash: 1.1, m: M.STATIC, r: 0.01, depth: 0.25 });
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * TAU + 0.4, h = 0.35 + rand() * 0.25, tip = [Math.cos(a) * 0.12, 0.18 + h, Math.sin(a) * 0.12];
        B.sweep([[0, 0.18, 0], [Math.cos(a) * 0.05, 0.18 + h * 0.5, Math.sin(a) * 0.05], tip], 0.01, 40, { c: 1, r: 0.008, m: M.STATIC });
        for (let l = 0; l < 3; l++) pt(Math.cos(a) * 0.04 + (rand() - 0.5) * 0.06, 0.25 + rand() * h * 0.6, Math.sin(a) * 0.04, 0.012, 0.8, 1);
        for (let p = 0; p < 18; p++) { const b = p / 18 * TAU, rr = 0.045 + (p % 2) * 0.015; pt(tip[0] + Math.cos(b) * rr, tip[1] + 0.01 + Math.sin(b) * rr * 0.5, tip[2] + Math.sin(b) * rr * 0.6, 0.01, 1, p % 2 ? 3 : 5, M.BLOOM, p, 0, tip[0], tip[1], tip[2]); }
        pt(tip[0], tip[1] + 0.01, tip[2], 0.014, 1, 4);
      }
      return B.done({ kind: 'room-plant', flowRate: 0 });
    }
    if (what === 'books') {
      for (let k = 0; k < 5; k++) boxSkin(B, [0.02 * (k % 2) - 0.01, 0.03 + k * 0.045, 0], 0.16 - k * 0.01, 0.02, 0.11, 90, [2, 3, 5, 1, 4][k], { r: 0.009 });
      for (let k = 0; k < 8; k++) pt((rand() - 0.5) * 0.3, 0.3 + rand() * 0.2, (rand() - 0.5) * 0.2, 0.01, 1, 4, M.FLAME, rand(), 0.3, 0, 0, 0, 0.15 + rand() * 0.1);
      return B.done({ kind: 'room-books', flowRate: 0 });
    }
    if (what === 'toyhouse') {
      // a toy house on the floor: its windows light up
      boxSkin(B, [0, 0.12, 0], 0.15, 0.12, 0.13, 320, 1, { r: 0.009 });
      for (const side of [-1, 1]) B.sweep([[side * 0.17, 0.24, -0.15], [0, 0.36, -0.15]], 0.14, 160, { blade: true, c: 2, r: 0.009 });
      B.sweep([[0.08, 0.3, 0.02], [0.08, 0.42, 0.02]], 0.02, 30, { c: 0, r: 0.008 });
      for (const [x, y] of [[-0.07, 0.15], [0.07, 0.15], [-0.07, 0.06]]) for (let i = 0; i < 9; i++) pt(x + (i % 3 - 1) * 0.013, y + (Math.floor(i / 3) - 1) * 0.013, -0.135, 0.009, 1, 4);
      for (let i = 0; i < 12; i++) pt(0.07 + (i % 3 - 1) * 0.012, 0.03 + Math.floor(i / 3) * 0.02, -0.135, 0.008, 1, 0);
      return B.done({ kind: 'room-toyhouse', flowRate: 0 });
    }
  }

  function roomDog(rand) {
    const B = new Builder(rand, 1);
    const C = [0, 0.14, 0], pts = [];
    for (let k = 0; k <= 12; k++) { const a = -0.3 + k / 12 * Math.PI * 1.75, r = 0.25 - k * 0.006; pts.push([Math.cos(a) * r, 0.13 - k * 0.004, Math.sin(a) * r * 0.8]); }
    const body = B.sweep(pts, [{ at: 0, r: 0.12 }, { at: 0.45, r: 0.14 }, { at: 0.8, r: 0.1 }, { at: 1, r: 0.07 }], 900, { cols: [2, 2, 1, 2], m: M.BREATHE, e: C, q: 1.0, ph: 0, mw: 0.035, r: 0.011 });
    B.fill(body.spine, 160, 0.1, { c: 1 });
    // the tail: out from the rump and round the OUTSIDE of the curl, lying on the floor, so when it moves it thumps up and down off the rug rather than through the dog
    // The body's thick end (pts[0]) is the rump; its thin end (pts[12]) is the neck, by the head. The tail
    // grew from the neck until 2026-09-25, so its thin tip lay against the rump and it read backwards (Dan).
    // Now it leaves the rump, thick where it joins, and wraps round the outside toward the nose, thinning.
    const tail = [pts[0]]; for (const [a, r, y] of [[-0.55, 0.3, 0.07], [-0.85, 0.37, 0.05], [-1.12, 0.41, 0.035], [-1.36, 0.42, 0.03]]) tail.push([Math.cos(a) * r, y, Math.sin(a) * r * 0.8]);
    B.sweep(tail, [{ at: 0, r: 0.05 }, { at: 0.6, r: 0.035 }, { at: 1, r: 0.014 }], 190, { c: 2, m: M.WAG, mw: 0.075, r: 0.01 });
    // the head, resting on the paws, near the tail
    const H = [-0.2, 0.13, -0.18];
    B.shell(H, 0.1, 240, [1, 2], { lumpy: 0.15, squash: 0.8, m: M.LIFT, e: C, q: 0, ph: 0, w: 0.1, r: 0.011, depth: 0.5 });
    B.sweep([H, [H[0] + 0.05, H[1] - 0.02, H[2] - 0.12], [H[0] + 0.07, H[1] - 0.03, H[2] - 0.17]], [{ at: 0, r: 0.06 }, { at: 1, r: 0.035 }], 130, { c: 2, m: M.LIFT, e: C, q: 0, ph: 0, mw: 0.1, r: 0.01 });
    B.node(H[0] + 0.07, H[1] - 0.02, H[2] - 0.2, 0.016, 1, 0, M.LIFT, 0, 0.1, C[0], C[1], C[2], 0, 0, 0);
    for (const side of [-1, 1]) B.sweep([[H[0] + side * 0.07, H[1] + 0.05, H[2] + 0.02], [H[0] + side * 0.12, H[1] + 0.0, H[2] - 0.02], [H[0] + side * 0.12, H[1] - 0.07, H[2] - 0.04]], [{ at: 0, r: 0.04 }, { at: 1, r: 0.02 }], 90, { blade: true, c: 1, m: M.LIFT, e: C, q: 0, ph: 0, mw: 0.1, r: 0.009 });
    for (const side of [-1, 1]) for (let k = 0; k < 4; k++) B.node(H[0] + side * 0.035 + k * 0.008 * side, H[1] + 0.02, H[2] - 0.085, 0.005, 1, 0, M.LIFT, 0, 0.1, C[0], C[1], C[2], -1, 0, 0);
    for (const side of [-1, 1]) for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; B.node(H[0] + side * 0.045 + Math.cos(a) * 0.009, H[1] + 0.025 + Math.sin(a) * 0.009, H[2] - 0.09, 0.006, 1, 4, M.LIFT, 0, 0.1, C[0], C[1], C[2], 1, 0, 0); }
    // paws under the chin
    for (const x of [-0.08, -0.28]) B.shell([x, 0.04, -0.3], 0.045, 60, [1, 2], { squash: 0.6, m: M.STATIC, r: 0.009 });
    // sleep: small lights drifting up and fading
    for (let k = 0; k < 5; k++) B.node(H[0] + 0.05, H[1] + 0.12, H[2], 0.012 - k * 0.001, 0.9, 4, M.FLAME, k / 5, 0.55, 0, 0, 0, 0.16, 0, 0);
    B.core = [0, 0.02, 0];
    return B.done({ kind: 'room-dog', flowRate: 0 });
  }
  // THE LOOKING GLASS. A tall oval frame with small curls at its crown and
  // feet, and a surface of faint light that turns slowly in its own plane,
  // like something moving on the other side. You go through it.
  function roomGlass(rand) {
    const B = new Builder(rand, 1);
    const cy = 1.15, rx = 0.62, ry = 0.95, ring = [];
    for (let k = 0; k <= 48; k++) { const a = k / 48 * TAU; ring.push([Math.cos(a) * rx, cy + Math.sin(a) * ry, 0]); }
    B.sweep(ring, 0.05, 1200, { cols: [0, 1, 0, 1], r: 0.011 });
    B.sweep(ring.map((p) => [p[0] * 1.09, cy + (p[1] - cy) * 1.06, 0.02]), 0.018, 500, { c: 2, r: 0.008 });
    for (const [x, y] of [[0, cy + ry + 0.08], [-rx - 0.06, cy], [rx + 0.06, cy], [0, cy - ry - 0.06]]) B.shell([x, y, -0.02], 0.07, 60, [1, 4], { lumpy: 0.3, m: M.STATIC, r: 0.01 });
    for (const side of [-1, 1]) B.sweep([[side * 0.3, 0, 0], [side * 0.34, cy - ry - 0.02, 0]], 0.025, 60, { c: 0, r: 0.009 });
    // the surface: swirling faint light, turning in the glass's own plane
    for (let i = 0; i < 520; i++) {
      const a = rand() * TAU, u = Math.sqrt(rand()) * 0.93;
      B.node(Math.cos(a) * rx * u, cy + Math.sin(a) * ry * u, 0.01, 0.009 * (0.6 + rand()), 0.3 + 0.4 * u, u > 0.6 ? 3 : u > 0.3 ? 5 : 4, M.TICK, Math.PI / 2, Math.PI / 2, 0, cy, 0, (0.3 + u * 0.3) * (i % 2 ? 1 : -1), 0, 0);
    }
    for (let i = 0; i < 160; i++) { const a = rand() * TAU, u = Math.sqrt(rand()) * 0.9; B.node(Math.cos(a) * rx * u, cy + Math.sin(a) * ry * u, 0.03, 0.008 + rand() * 0.008, 1, rand() < 0.3 ? 2 : 4, M.OPEN, rand() * TAU, 0, 0, 0, 0, 0.6 + rand(), 0, 0); }
    B.core = [0, cy, 0];
    return B.done({ kind: 'room-glass', hero: true, flowRate: 0 });
  }
  // the rug, the lamp on its small table, the side table the seed rests on, a stack of books
  function roomSmall(rand, what) {
    const B = new Builder(rand, 1);
    if (what === 'rug') {
      for (let i = 0; i < 800; i++) { const a = rand() * TAU, u = Math.sqrt(rand()), band = Math.floor(u * 6); B.node(Math.cos(a) * u * 1.7, 0.012, Math.sin(a) * u * 1.05, 0.011, 0.55 + (band % 2) * 0.25, [2, 1, 3, 1, 5, 0][band], M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0); }
      for (let k = 0; k < 90; k++) { const a = k / 90 * TAU; B.node(Math.cos(a) * 1.72, 0.014, Math.sin(a) * 1.07, 0.012, 0.9, 2, M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0); }
      return B.done({ kind: 'room-rug', flowRate: 0 });
    }
    if (what === 'lamp') {
      B.sweep([[0, 0, 0], [0, 0.55, 0]], 0.02, 40, { c: 0, r: 0.009 });
      for (let k = 0; k < 40; k++) { const a = k / 40 * TAU; B.node(Math.cos(a) * 0.22, 0.56, Math.sin(a) * 0.22, 0.01, 0.9, 0, M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0); }
      B.sweep([[0, 0.56, 0], [0, 0.95, 0]], 0.018, 40, { c: 0, r: 0.009 });
      B.shell([0, 1.05, 0], 0.2, 240, [4, 5], { cap: 0.1, squash: 0.8, m: M.STATIC, r: 0.011, depth: 0.2 });
      for (let k = 0; k < 6; k++) B.node((rand() - 0.5) * 0.08, 0.98 + rand() * 0.06, (rand() - 0.5) * 0.08, 0.02, 1, 4, M.SHIMMER, k, 0, 0, 0, 0, 0.3, 0, 0);
      return B.done({ kind: 'room-lamp', flowRate: 0 });
    }
    // the small table the seed rests on
    B.sweep([[0, 0, 0], [0, 0.42, 0]], 0.03, 60, { c: 0, r: 0.01 });
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; B.sweep([[0, 0.02, 0], [Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2]], 0.015, 20, { c: 0, r: 0.008 }); }
    for (let i = 0; i < 300; i++) { const a = rand() * TAU, u = Math.sqrt(rand()); B.node(Math.cos(a) * u * 0.28, 0.44, Math.sin(a) * u * 0.28, 0.01, u > 0.9 ? 1 : 0.6, u > 0.9 ? 0 : 1, M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0); }
    return B.done({ kind: 'room-table', flowRate: 0 });
  }
  // THE ROOM, ONE ROW PER THING, in the order it is set out. kind; name, what
  // the host calls it (no name, no touching); make/what/seed, how it is
  // built; x, z (from the back wall), yaw, pal, tone, where it stands; wake
  // (none: it never sleeps), sleepy, hide, acc, how it sleeps; on, the seed's
  // parts or cues that wake it (seed.js); hold (2.8s unless said), to, kick,
  // toggle, also (seed.js), what a touch does. A new thing is a new row.
  const ROOM = [
    { kind: 'room-rug', make: roomSmall, what: 'rug', seed: 301, x: -0.7, z: -1.5, yaw: 0, pal: [7, 1, 11], tone: 'light' },
    { kind: 'room-hearth', name: 'the fire', make: roomHearth, seed: 302, x: -2.0, z: -0.2, yaw: 0, pal: [7, 2, 11], halo: true, wake: 0.4, on: ['root'] },
    // the door where the glass hung (Dan, 2026-10-07): it wakes a level at a time as the seed fills, as the glass did
    // Farther right, so it is its own corner of the room; dark at first
    // (sleepy, with a floor) and brightening as the host leads you over
    { kind: 'room-door', name: 'the door', make: doorFrame, seed: 303, x: 3.5, z: -0.05, yaw: 0, pal: [1, 8, 4], halo: true, wake: 0.08, acc: 0.3, to: 0.55, kick: 3, sleepy: true, floor: 0.22 },
    // sixteen squares: one for each of Dan's pairs (2026-10-08)
    { kind: 'room-doorweb', make: doorWeb, what: 16, seed: 342, x: 3.5, z: -0.05, yaw: 0, pal: [2, 7, 11], wake: 0.08, sleepy: true, floor: 0.38 },
    { kind: 'room-dog', name: 'the dog', make: roomDog, seed: 304, x: -1.45, z: -1.0, yaw: 0.5, pal: [7, 11, 2], tone: 'light', wake: 0, on: ['leaf'] },
    { kind: 'room-chair', name: 'my chair', make: roomChair, seed: 305, x: 0.55, z: -2.2, yaw: -0.34, pal: [4, 7, 1] },
    { kind: 'room-couch', name: 'the couch', make: roomCouch, seed: 306, x: -3.4, z: -2.4, yaw: 1.37, pal: [8, 2, 11] },
    { kind: 'room-lamp', name: 'the lamp', make: roomSmall, what: 'lamp', seed: 308, x: -3.5, z: -1.1, yaw: 0.4, pal: [11, 7, 1], halo: true, wake: 0, sleepy: true, on: ['root'], toggle: true },
    { kind: 'room-window', name: 'the window', make: roomItem, what: 'window', seed: 310, x: 0.15, z: -0.03, yaw: 0, pal: [11, 1, 4], wake: 0, sleepy: true, on: ['light'] },
    { kind: 'room-clock', name: 'the clock', make: roomItem, what: 'clock', seed: 311, x: -2.0, z: -0.34, yaw: 0, pal: [11, 7, 2], wake: 0, sleepy: true, floor: 0.62, on: ['bud', 'ready'], hold: 4200 },
    { kind: 'room-picture', name: 'the picture', make: roomItem, what: 'picture', seed: 313, x: -0.95, z: -0.03, yaw: 0, pal: [1, 3, 8], wake: 0, sleepy: true, floor: 0.6, on: ['leaf', 'connection'] },
    { kind: 'room-balloon', name: 'the balloon', make: roomItem, what: 'balloon', seed: 314, x: -2.85, z: -1.45, yaw: 0, pal: [2, 2, 4], wake: 0, sleepy: true, on: ['light', 'freedom', 'play'] },
    { kind: 'room-plant', name: 'the plant', make: roomItem, what: 'plant', seed: 315, x: 0.95, z: -0.5, yaw: 0, pal: [3, 4, 11], wake: 0, sleepy: true, on: ['nature', 'rest', 'growth'] },
    { kind: 'room-books', name: 'the books', make: roomItem, what: 'books', seed: 316, x: -3.05, z: -0.9, yaw: 0.3, pal: [4, 1, 7], wake: 0, sleepy: true, on: ['learning'] },
    { kind: 'room-toyhouse', name: 'the little house', make: roomItem, what: 'toyhouse', seed: 317, x: -0.35, z: -0.45, yaw: -0.3, pal: [2, 7, 11], wake: 0, sleepy: true, on: ['home', 'making'] },
  ];

  // ── THE DOOR (Dan, 2026-10-07). On the room's back wall, where the looking
  // glass used to hang, there is a door, and it is blocked: a web of notes
  // fills the doorway, every one of them something that gets in the way of a
  // person reaching what they want. Some are a joke everyone recognises; some
  // are entirely real. It is the door in the recurring dream, the one in your
  // own house you have never been through, and you know there is something
  // good behind it. The member can wander over from the fire and point at the
  // knots to read them. It is hard to get through; the host does it easily,
  // and ushers you into a small bare room with the glass alone on its far
  // wall, and through the glass into the field where the lights drift like
  // fireflies. Door space is local: the doorway's centre line is x = 0, its
  // sill y = 0. Same sculpture as the room, so it is the next room of one house.
  const DOOR_W = 0.85, DOOR_H = 2.35;   // half width of the opening, and its height to the top of the arch
  // THE FRAME. Two posts, an arch, small curls at the crown, a sill, in the room's inks.
  function doorFrame(rand) {
    const B = new Builder(rand, 1);
    const post = (x) => B.sweep([[x, 0, 0], [x, (DOOR_H - DOOR_W) * 0.5, 0], [x, DOOR_H - DOOR_W, 0]], 0.06, 520, { cols: [0, 1, 0, 1], r: 0.011 });
    post(-DOOR_W - 0.08); post(DOOR_W + 0.08);
    const arch = []; for (let k = 0; k <= 32; k++) { const a = Math.PI - k / 32 * Math.PI; arch.push([Math.cos(a) * (DOOR_W + 0.08), DOOR_H - DOOR_W + Math.sin(a) * (DOOR_W + 0.08), 0]); }
    B.sweep(arch, 0.06, 760, { cols: [0, 1, 0, 1], r: 0.011 });
    B.sweep(arch.map((p) => [p[0] * 1.07, DOOR_H - DOOR_W + (p[1] - (DOOR_H - DOOR_W)) * 1.07, 0.02]), 0.02, 320, { c: 2, r: 0.008 });
    for (const [x, y] of [[0, DOOR_H + 0.16], [-DOOR_W - 0.18, DOOR_H - DOOR_W], [DOOR_W + 0.18, DOOR_H - DOOR_W]]) B.shell([x, y, -0.02], 0.08, 70, [1, 4], { lumpy: 0.3, m: M.STATIC, r: 0.01 });
    B.sweep([[-DOOR_W - 0.2, 0.02, 0], [0, 0.02, 0], [DOOR_W + 0.2, 0.02, 0]], 0.04, 280, { c: 1, r: 0.01 });
    B.core = [0, DOOR_H / 2, 0];
    return B.done({ kind: 'room-door', hero: true, flowRate: 0 });
  }
  // THE WEB IN THE DOORWAY. `count` large coloured knots across the opening,
  // each an obstacle (marks, in order), wired to a neighbour or two with fine
  // dotted lines, so the doorway is full and nothing can be read at a glance.
  // `pins` remembers where every node began and what each line joins, so the
  // web can part when the host opens the door (openDoor).
  function doorWeb(rand, count) {
    const B = new Builder(rand, 1);
    const pts = [], marks = [], pins = { nodes: [], lines: [] };
    const inArch = (x, y) => y <= DOOR_H - DOOR_W || Math.hypot(x, y - (DOOR_H - DOOR_W)) <= DOOR_W - 0.2;
    for (let i = 0; i < count; i++) {
      // spread over the opening, kept off the frame and off each other, jittered in depth
      let x, y, tries = 0;
      do { x = (rand() * 2 - 1) * (DOOR_W - 0.2); y = 0.3 + rand() * (DOOR_H - 0.5); tries++; }
      while (tries < 40 && (!inArch(x, y) || pts.some((p) => Math.hypot(p[0] - x, p[1] - y) < 0.25)));
      // into the room a little (negative z is the room side of the wall), never through it
      const z = -0.05 - rand() * 0.3, col = [2, 3, 5, 2, 3, 5, 4][Math.floor(rand() * 7)];
      // STOP SIGNS, more of them, smaller, a few big ones among them (Dan, 2026-10-07)
      // big enough that the octagon reads as one from where the camera stops (4.4 units off; seen 2026-10-08)
      const big = rand() < 0.2, rr0 = big ? 0.06 + rand() * 0.016 : 0.03 + rand() * 0.012;
      const id = B.node(x, y, z, rr0, 1, col, M.STOP, rand() * TAU, 0, 0, 0, 0, 0.25 + rand() * 0.25, 0, 0);
      pts.push([x, y, z]); marks.push(id); pins.nodes.push({ id, x, y, z });
      // a few small satellites, so each reads as a knot and not a bead
      const sats = big ? 5 : 2;
      for (let k = 0; k < sats; k++) { const a = rand() * TAU, rr = rr0 * 1.6 + rand() * 0.05, sx = x + Math.cos(a) * rr, sy = y + Math.sin(a) * rr * 0.8, sz = z + (rand() - 0.5) * 0.06; const s = B.node(sx, sy, sz, 0.009, 0.8, col, M.STOP, 0, 1, 0, 0, 0, 0, 0, 0); pins.nodes.push({ id: s, x: sx, y: sy, z: sz, of: i }); }
    }
    for (let i = 0; i < count; i++) {
      const links = rand() < 0.35 ? 2 : 1;
      for (let l = 0; l < links; l++) {
        let j = Math.floor(rand() * count); if (j === i) j = (j + 1) % count;
        const a = pts[i], b = pts[j], len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(4, Math.round(len / 0.05));
        for (let k = 1; k < n; k++) { const t = k / n; const id = B.node(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 0.006, 0.45, 4, M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0); pins.lines.push({ id, i, j, t }); }
      }
    }
    B.core = [0, 0.1, 0];
    return B.done({ kind: 'room-doorweb', hero: true, flowRate: 0, marks, pins });
  }
  // THE RIDGE FIELD (Dan, 2026-10-08): the first thing seen through the
  // looking glass. Not a flat meadow: a rolling ridge rising ahead, tiny
  // ground points with splashes of the globe's kind colours woven in, tiny
  // grass, and the fireflies drifting over it. Field space is local: the
  // glass is behind you at z < 0, the ridge rises toward +z.
  function fieldH(x, z) {
    const u = Math.max(0, Math.min(1, (z - 3) / 10)), s = u * u * (3 - 2 * u);
    return Math.max(0, 2.2 * s - Math.max(0, z - 16) * 0.12 + 0.35 * Math.sin(x * 0.35 + z * 0.12) + 0.2 * Math.sin(z * 0.45 + x * 0.1) + 0.3 * s * Math.sin(x * 0.18));
  }
  // palette for the field: 0 pale, 1 dim pale, 2.. the kind colours
  const FIELD_FWD = 12;
  function fieldGround(rand, nk) {
    const B = new Builder(rand, 1);
    const col = () => rand() < 0.84 ? (rand() < 0.6 ? 0 : 1) : 2 + Math.floor(rand() * nk);
    // THE SLOPE IS THE PICTURE: from where the camera stands, the rise between
    // four and fourteen along is the whole lower half of the frame, so most of
    // the points go there, larger, with contour rows so it reads as a hill and
    // not a band (seen 2026-10-08: the near slope read empty, the crest a line)
    // wide, so the land runs out past both sides of the frame from any pose
    // in it (seen 2026-10-08: cut off on the right), and no longer than
    // forty, so it ends before the first world's ground
    for (let i = 0; i < 22000; i++) {
      const near = rand() < 0.7, z = near ? 2 + 13 * rand() : 15 + 25 * Math.pow(rand(), 1.3), x = (rand() * 2 - 1) * (6 + z * 0.95);
      B.node(x, fieldH(x, z) - 0.03 + rand() * 0.06, z, (near ? 0.011 : 0.008) + rand() * 0.007, 0.45 + rand() * 0.35, col(), M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0);
    }
    // THE GROUND UNDER YOUR FEET (Dan, 2026-10-08): the field has to run out
    // past the bottom and sides of the frame the way land does to the eye, not
    // float. The first eight metres are dense and wide, with larger points.
    for (let i = 0; i < 12000; i++) {
      const z = 8 * Math.pow(rand(), 1.3), x = (rand() * 2 - 1) * (10 + z * 0.9);
      B.node(x, fieldH(x, z) - 0.03 + rand() * 0.06, z, 0.013 + rand() * 0.009, 0.5 + rand() * 0.35, col(), M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0);
    }
    for (let z = 0.5; z < 3; z += 0.5) for (let k = 0; k < 220; k++) { const x = (rand() * 2 - 1) * (7 + z * 0.7), zz = z + (rand() - 0.5) * 0.05; B.node(x, fieldH(x, zz) + 0.01, zz, 0.016, 0.7 + rand() * 0.25, rand() < 0.85 ? 0 : 2 + Math.floor(rand() * nk), M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0); }
    for (let z = 3; z <= 15; z += 1) for (let k = 0; k < 170; k++) { const x = (rand() * 2 - 1) * (4 + z * 0.55), zz = z + (rand() - 0.5) * 0.06; B.node(x, fieldH(x, zz) + 0.01, zz, 0.014, 0.7 + rand() * 0.25, rand() < 0.85 ? 0 : 2 + Math.floor(rand() * nk), M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0); }
    for (let k = 0; k < 420; k++) {
      const z = 0.4 + rand() * 16, x = (rand() * 2 - 1) * (3 + z * 0.45);
      B.stem([x, fieldH(x, z), z], 0.05 + rand() * 0.09, rand() * TAU, 0.4 + rand() * 0.6, { r: 0.0045, c: col(), m: M.BRANCH, lean0: 0.15, taper: 0.6, step: 0.025, a: 0.8, flex0: 0.05, flex: 0.35 });
    }
    B.core = [0, 0, 0.5];
    const f = B.done({ kind: 'field-ground', hero: true, flowRate: 0 });
    // THE FORM'S ORIGIN STANDS AHEAD OF THE CAMERA: a form whose origin is
    // three behind the camera is culled whole (drawForm's pd < -3), and the
    // camera stands a step or two into the field (seen 2026-10-08: the land
    // vanished from the gaze pose). So the field is placed FIELD_FWD along
    // and its nodes shifted back by the same, which changes nothing on screen.
    for (let i = 0; i < f.n; i++) f.P[i * S + 2] -= FIELD_FWD;
    return f;
  }
  // ── THE KEY (Dan, 2026-10-08). The opposite of the stop signs: circles,
  // in the globe's own kind colours, each a note that pulls a person forward
  // (a friend who gets it, the question they keep asking, the tool that
  // finally clicked). They swirl in from all round the door, sparkling, and
  // settle into the shape of a key, which the host turns. Key space is the
  // door's: centre line x = 0, sill y = 0, in front of the door (negative z).
  // THE KEY IS NODE SCULPTURE (Dan, 2026-10-08): built with the room's own
  // builder, as the hearth and the chair are, only with smaller nodes, and
  // lying the way a key lies: the bow a ring on the left (a smaller ring
  // inside it), a collar, the shaft running right, and the bit at the end
  // with three teeth hanging down. Every kind colour, in bands, with depth.
  // It hangs on the wall between the window and the door. (Upright, with
  // the bow on top, it read as a person sitting: Dan, 2026-10-08.)
  const KEY_X = -1.75, KEY_Y = 1.5, KEY_Z = -0.14;
  function keyForm(rand, nk) {
    const B = new Builder(rand, 1);
    const cx = KEY_X, cy = KEY_Y, z0 = KEY_Z, bx = cx - 0.4, bow = 0.2;
    const mixCols = (n) => { const a = []; for (let i = 0; i < n; i++) a.push(Math.floor(rand() * nk)); return a; };
    const tube = (pts, girth, n, cols) => B.sweep(pts, girth, n, { cols, r: 0.0075, m: M.STATIC, mw: 0, a: 0.95 });
    const ring = (r, segs) => { const p = []; for (let k = 0; k <= segs; k++) { const a = k / segs * TAU; p.push([bx + Math.cos(a) * r, cy + Math.sin(a) * r, z0]); } return p; };
    tube(ring(bow, 40), 0.048, 900, mixCols(12));
    tube(ring(0.085, 24), 0.028, 260, mixCols(4));
    tube([[bx + bow - 0.02, cy, z0], [bx + bow + 0.08, cy, z0], [bx + bow + 0.18, cy, z0]], 0.062, 260, mixCols(2));   // the collar
    tube([[bx + bow + 0.1, cy, z0], [cx + 0.16, cy, z0], [cx + 0.52, cy, z0]], 0.04, 700, mixCols(8));           // the shaft
    tube([[cx + 0.3, cy - 0.04, z0], [cx + 0.42, cy - 0.04, z0], [cx + 0.54, cy - 0.04, z0]], 0.036, 200, mixCols(3));   // the bit's bar
    for (const [x, len] of [[cx + 0.33, 0.22], [cx + 0.42, 0.15], [cx + 0.52, 0.22]]) tube([[x, cy - 0.04, z0], [x, cy - 0.04 - len * 0.5, z0], [x, cy - 0.04 - len, z0]], 0.034, 150, mixCols(2));   // the teeth
    B.shell([bx + bow + 0.02, cy, z0], 0.05, 80, [2 % nk, 4 % nk], { lumpy: 0.2, m: M.STATIC, r: 0.008 });
    B.shell([cx + 0.53, cy, z0], 0.045, 70, [3 % nk, 5 % nk], { lumpy: 0.2, m: M.STATIC, r: 0.008 });
    B.core = [cx, cy, z0];
    const f = B.done({ kind: 'room-key', hero: true, flowRate: 0 });
    // THIRTY PLACES on the outline, one per square in the doorway: twelve round
    // the bow, ten along the shaft, eight on the bit
    const centres = [];
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; centres.push([bx + Math.cos(a) * bow, cy + Math.sin(a) * bow, z0]); }
    for (let k = 0; k < 10; k++) centres.push([bx + bow + 0.16 + k * 0.064, cy, z0]);
    for (const [x, y] of [[0.33, -0.12], [0.33, -0.24], [0.42, -0.1], [0.42, -0.18], [0.52, -0.12], [0.52, -0.24], [0.38, -0.04], [0.48, -0.04]]) centres.push([cx + x, cy + y, z0]);
    // THE CIRCLES (Dan, 2026-10-08): one per square, a proper node with its
    // filename beside it. It appears in its own place on the key, glides up
    // and swells to be struck by the write stream, and eases back down to
    // its place at a node's size. The rest of the key has no names: the
    // finishing flurry raises, swells and settles every node in random order
    // under the stream, and the viewer takes the point.
    const P = f.P, sculptN = f.n;
    const fly = centres.map((c, k) => B.node(c[0], c[1], c[2] - 0.25, 0.06, 0, k % nk, M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0));
    f.P = B.P; f.n = B.P.length / S;
    // the snapshot keeps the sculpture's real alphas (the flurry multiplies from it); the live array starts dark
    f.P0 = f.P.slice(); f.centres = centres; f.sculptN = sculptN; f.fly = fly;
    for (let i = 0; i < sculptN; i++) { const o = i * S; if (f.P[o + 6] !== M.CORE) f.P[o + 4] = 0; }
    f.flyState = centres.map((c) => ({ phase: 'off', t0: 0, to: c }));
    f.cue = new Float32Array(sculptN);
    for (let i = 0; i < sculptN; i++) f.cue[i] = rand() * 0.78;
    f.flurry = null;
    return f;
  }

  // ── THREE MORE, FOR THE WORLDS' OWN REGIONS (2026-09-24, the globe tour).
  // Same grammar: a primary body, supports, filaments, a focal bloom, a light
  // path, a colour recipe, a motion anatomy and one gesture.

  // THE BOOK OF BIRDS ("What I'm learning"). Gesture: what you read lifts off
  // the page. Primary body: an open book of swept page blades on a spine, the
  // pages riffling open and closed. Support: a living stem into a cupped
  // lectern. Focal: a spiral of birds leaving the pages, each a small rigid
  // body (two swept wings and a body) circling up round the book at its own
  // radius and speed, smaller and brighter as they rise. Light path: stem,
  // spine, into the birds. Colour: ink pages, the first accent walking into
  // the second up the birds, warm light at the top.
  function heroBookOfBirds(rand, s) {
    const B = new Builder(rand, s);
    B.roots([0, 0, 0], 4, 0.18 * s, 0.018 * s);
    const stem = B.sweep([[0, 0, 0], [0.04 * s, 0.35 * s, 0], [-0.03 * s, 0.7 * s, 0.02 * s], [0, 0.9 * s, 0]], [{ at: 0, r: 0.035 * s }, { at: 1, r: 0.018 * s }], 200, { c: 0, bw0: 0, bw: 0.2, bp: 0.3, r: 0.008 * s });
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; B.sweep([[0, 0.9 * s, 0], [Math.cos(a) * 0.12 * s, 0.93 * s, Math.sin(a) * 0.12 * s], [Math.cos(a) * 0.18 * s, 1.0 * s, Math.sin(a) * 0.18 * s]], [{ at: 0, r: 0.014 * s }, { at: 1, r: 0.006 * s }], 40, { c: 1, bw0: 0.2, bw: 0.1, bp: 0.3, r: 0.007 * s }); }
    // the open book: a spine, and page blades fanning out to either side
    const top = 1.02 * s, spineIdx = [];
    for (let k = 0; k <= 16; k++) spineIdx.push(B.node(0, top + 0.01 * s, -0.16 * s + k * 0.02 * s, 0.009 * s, 1, 0, M.BRANCH, 0, 0, 0, 0, 0, 0, 0.25, 0.3));
    const pages = [];
    for (let side = -1; side <= 1; side += 2) for (let l = 0; l < 5; l++) {
      const lift = 0.05 + l * 0.05, out = 0.3 - l * 0.02;
      const pg = B.sweep([[0, top, 0], [side * out * 0.5 * s, top + lift * 0.6 * s, 0], [side * out * s, top + lift * s, 0]], [{ at: 0, r: 0.15 * s }, { at: 1, r: 0.14 * s }], 110, { blade: true, c: l === 4 ? 4 : l % 2, m: M.PETAL, e: [0, top, 0], q: 0.25 + l * 0.04, ph: side + l * 0.5, mw: 0.4, bw0: 0.25, bw: 0.1, bp: 0.3, r: 0.0065 * s, a: 0.85 });
      pages.push(pg.spine);
    }
    // loose pages lifting off
    for (let q = 0; q < 6; q++) B.node((rand() - 0.5) * 0.4 * s, top + 0.05 * s, (rand() - 0.5) * 0.3 * s, 0.008 * s, 0.9, 4, M.PAGE, rand() * TAU, 0.22 * s * (0.6 + rand()), 0, 0, 0, rand() * TAU, 0.25, 0.3);
    // the birds: small rigid bodies circling up round the book
    const birdIdx = [];
    for (let b = 0; b < 14; b++) {
      const u = b / 13, R = (0.28 + 0.22 * Math.sin(u * 5) + u * 0.25) * s, h = top + (0.18 + u * 1.25) * s, a0 = b * 2.1, sc = (1.1 - u * 0.5) * s;
      const cx = Math.cos(a0) * R, cz = Math.sin(a0) * R, tx = -Math.sin(a0), tz = Math.cos(a0);   // facing along its circle
      const col = u < 0.35 ? 2 : u < 0.7 ? 3 : 4, speed = 0.18 + (b % 4) * 0.05;
      for (const side of [-1, 1]) for (let k = 0; k <= 7; k++) {
        const t = k / 7, wx = cx + (-tz * side) * t * 0.07 * sc - tx * t * 0.02 * sc, wy = h + Math.sin(t * Math.PI) * 0.02 * sc + t * 0.012 * sc, wz = cz + (tx * side) * t * 0.07 * sc - tz * t * 0.02 * sc;
        const id = B.node(wx, wy, wz, 0.006 * s * (1.2 - t * 0.5), 1, col, M.SPIN, 0, 0, 0, h, 0, speed, 0, 0);
        if (!k && side < 0) birdIdx.push(id);
      }
      B.node(cx + tx * 0.015 * sc, h, cz + tz * 0.015 * sc, 0.009 * s, 1, col, M.SPIN, 0, 0, 0, h, 0, speed, 0, 0);
    }
    B.flow(stem.spine.concat(spineIdx, pages[4], birdIdx.slice(0, 6)));
    B.flow(stem.spine.concat(spineIdx.slice().reverse(), pages[9], birdIdx.slice(6)));
    return B.done({ kind: 'hero-bookofbirds', hero: true, flowRate: 0.7 });
  }

  // THE LONG ROAD ("Running"). Gesture: a way that keeps going up. Primary
  // body: a wide ribbon road (a swept blade) spiralling up from the ground
  // and widening, with mile-marker lights along its edge. Supports: three
  // slender posts. Filaments: the lane line down its middle. Focal: light
  // running the road, root to crest, again and again (the flows are the
  // runner). Colour: ink road, accent markers, warm crest.
  function heroLongRoad(rand, s) {
    const B = new Builder(rand, s);
    B.roots([0, 0, 0], 4, 0.16 * s, 0.018 * s);
    const pts = [];
    for (let k = 0; k <= 10; k++) { const t = k / 10, a = t * TAU * 1.35, r = (0.12 + 0.42 * t) * s; pts.push([Math.cos(a) * r, (0.04 + t * 1.5) * s, Math.sin(a) * r]); }
    const road = B.sweep(pts, [{ at: 0, r: 0.03 * s }, { at: 0.5, r: 0.07 * s }, { at: 1, r: 0.1 * s }], 900, { blade: true, cols: [0, 1, 1, 0], bw0: 0, bw: 0.35, bp: 0.6, r: 0.0075 * s });
    // the lane line and the mile markers: beads of light on the edge
    const lane = B.sweep(pts, 0.004 * s, 90, { c: 4, bw0: 0, bw: 0.35, bp: 0.6, r: 0.006 * s, a: 0.9 });
    for (let k = 1; k < 10; k++) { const p = pts[k], a = Math.atan2(p[2], p[0]); B.node(p[0] + Math.cos(a) * 0.08 * s * (0.4 + k / 10), p[1] + 0.03 * s, p[2] + Math.sin(a) * 0.08 * s * (0.4 + k / 10), 0.012 * s, 1, 2 + (k % 3 === 0 ? 3 : k % 2), M.SHIMMER, k, 0, 0, 0, 0, 0.6 + k * 0.05, 0.35 * k / 10, 0.6); }
    // the posts holding it up
    for (const k of [3, 6, 9]) { const p = pts[k]; B.sweep([[p[0], 0, p[2]], [p[0] * 1.02, p[1] * 0.5, p[2] * 1.02], [p[0], p[1] - 0.02 * s, p[2]]], [{ at: 0, r: 0.018 * s }, { at: 1, r: 0.01 * s }], 90, { c: 0, bw0: 0, bw: 0.3 * k / 10, bp: 0.6, r: 0.007 * s }); }
    // the crest: a small bloom where the road goes on into the air
    const tip = pts[pts.length - 1];
    B.orb(tip, 0.07 * s, 60, [4, 3], { core: 0.4, m: M.HEAVY, bw: 0.35, bp: 0.6, r: 0.008 * s });
    for (let k = 0; k < 7; k++) B.node(tip[0], tip[1] + 0.05 * s, tip[2], 0.008 * s, 1, k % 2 ? 4 : 2, M.ORBIT, k, (0.12 + (k % 3) * 0.04) * s, tip[0], tip[1] + 0.05 * s, tip[2], 0.08 * (k % 2 ? 1 : -1));
    B.flow(road.spine); B.flow(lane.spine);
    return B.done({ kind: 'hero-longroad', hero: true, flowRate: 1.6, flowDur: 3200 });
  }

  // THE RESONATOR ("The band"). Gesture: sound going out in rings. Primary
  // body: a drum, a squat shell on three legs, with a tuning fork rising
  // from it. Supports: the legs. Filaments: strings from the drum's rim to a
  // crown ring above. Focal: rings of sound turning slowly on near-vertical
  // tilts round the fork, and bright notes orbiting. Light path: legs, drum,
  // up the fork, out into the rings. Colour: ink drum, three accents on the
  // rings, warm notes.
  function heroResonator(rand, s) {
    const B = new Builder(rand, s);
    const dy = 0.42 * s;
    const legs = [];
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + 0.3; legs.push(B.sweep([[Math.cos(a) * 0.3 * s, 0, Math.sin(a) * 0.3 * s], [Math.cos(a) * 0.24 * s, dy * 0.5, Math.sin(a) * 0.24 * s], [Math.cos(a) * 0.2 * s, dy, Math.sin(a) * 0.2 * s]], [{ at: 0, r: 0.012 * s }, { at: 1, r: 0.02 * s }], 70, { c: 0, bw0: 0, bw: 0.15, bp: 0.2, r: 0.007 * s }).spine); }
    const drum = B.shell([0, dy + 0.08 * s, 0], 0.26 * s, 520, [1, 0], { squash: 0.45, m: M.HEAVY, ph: 0.4, bw: 0.15, bp: 0.2, r: 0.008 * s, depth: 0.25 });
    // the fork: two tines from a stem, a U
    const f0 = dy + 0.2 * s;
    const stem = B.sweep([[0, f0, 0], [0, f0 + 0.25 * s, 0]], 0.022 * s, 90, { c: 0, bw0: 0.15, bw: 0.1, bp: 0.2, r: 0.008 * s });
    const tines = [];
    for (const side of [-1, 1]) tines.push(B.sweep([[0, f0 + 0.25 * s, 0], [side * 0.08 * s, f0 + 0.32 * s, 0], [side * 0.09 * s, f0 + 0.6 * s, 0], [side * 0.085 * s, f0 + 0.95 * s, 0]], [{ at: 0, r: 0.02 * s }, { at: 1, r: 0.014 * s }], 220, { c: 1, m: M.FROND, ph: side, mw: 0.35, bw0: 0.2, bw: 0.25, bp: 0.2, r: 0.008 * s }).spine);
    // rings of sound, turning on near-vertical tilts round the fork
    const rings = [];
    for (let k = 0; k < 4; k++) rings.push(B.orbitRing([0, f0 + 0.55 * s, 0], (0.3 + k * 0.16) * s, 110 + k * 40, 1.35 + k * 0.05, k * 0.8, { c: [2, 3, 5, 2][k], q: (k % 2 ? -1 : 1) * (0.12 + k * 0.03), beads: 3 + k, band: 0.03, bw: 0.25, bp: 0.2 }));
    // strings from the drum's rim to a crown ring above
    const crownY = f0 + 1.1 * s;
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; B.filament([Math.cos(a) * 0.25 * s, dy + 0.1 * s, Math.sin(a) * 0.25 * s], [Math.cos(a) * 0.18 * s, crownY, Math.sin(a) * 0.18 * s], 0.01 * s, 30, { c: 1, beads: 10, bw0: 0.15, bw1: 0.3, bp0: 0.2, bp1: 0.2, ph: k }); }
    B.orbitRing([0, crownY, 0], 0.18 * s, 70, 0.1, 0, { c: 4, q: 0.3, beads: 5, bw: 0.3, bp: 0.2 });
    // notes: bright bodies orbiting out beyond the rings
    for (let k = 0; k < 12; k++) B.node(0, f0 + (0.2 + (k % 4) * 0.25) * s, 0, 0.012 * s, 1, k % 3 ? 4 : 5, M.ORBIT, k * 0.53, (0.85 + (k % 3) * 0.12) * s, 0, f0 + (0.2 + (k % 4) * 0.25) * s, 0, (0.07 + (k % 4) * 0.02) * (k % 2 ? 1 : -1));
    B.flow(legs[0].concat(drum.slice(0, 8), stem.spine, tines[0], rings[0].slice(0, 30)));
    B.flow(legs[1].concat(drum.slice(8, 16), stem.spine, tines[1], rings[2].slice(0, 30)));
    return B.done({ kind: 'hero-resonator', hero: true, flowRate: 0.9 });
  }

  // ── THE BUILDER'S PLANET AND THE GARDENS IN MID-SPACE (Dan, 2026-09-25) ──
  // A straight run of structure nodes, a little jittered so it reads as built
  // by hand rather than ruled.
  function girder(B, a, b, n, r, c) {
    const idx = [];
    for (let k = 0; k <= n; k++) { const t = k / n; idx.push(B.node(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, r * (0.85 + B.rand() * 0.3), 0.95, c, M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0)); }
    return idx;
  }
  // THE CRANE. Gesture: something is about to be built here. A lattice mast
  // (four posts, zigzag bracing), a long jib and a short counter-jib braced
  // to a peak, a cab, and a cable from the trolley to a hook with a small
  // blueprint roll hanging from it that swings. Structural ink, green where
  // it is braced, the load in blueprint blue, one warm light in the cab.
  function heroCrane(rand, s) {
    const B = new Builder(rand, s), w = 0.05 * s, H = 1.55 * s, r = 0.009 * s;
    const post = [[-w, -w], [w, -w], [w, w], [-w, w]];
    const spine = [];
    for (const [x, z] of post) spine.push(...girder(B, [x, 0, z], [x, H, z], 36, r, 0));
    for (let j = 0; j < 12; j++) {
      const y0 = j / 12 * H, y1 = (j + 1) / 12 * H;
      for (let f = 0; f < 4; f++) { const p0 = post[f], p1 = post[(f + 1) % 4]; const up = (j + f) % 2; girder(B, [p0[0], up ? y0 : y1, p0[1]], [p1[0], up ? y1 : y0, p1[1]], 5, r * 0.8, 2); }
    }
    // the slewing head: jib forward, counter-jib back, a peak with ties
    const jy = H + 0.02 * s, jl = 1.05 * s, cl = 0.38 * s, pk = [0, jy + 0.32 * s, 0];
    for (const dz of [-w, w]) { girder(B, [-cl, jy, dz], [jl, jy, dz], 60, r, 0); girder(B, [-cl, jy + 0.07 * s, 0], [jl * 0.92, jy + 0.07 * s, 0], 50, r * 0.8, 0); }
    for (let k = 0; k < 16; k++) { const x0 = -cl + (jl + cl) * k / 16, x1 = -cl + (jl + cl) * (k + 1) / 16; girder(B, [x0, jy, k % 2 ? -w : w], [x1, jy + 0.07 * s, 0], 4, r * 0.7, 2); }
    girder(B, [0, jy, 0], pk, 14, r, 0);
    girder(B, pk, [jl * 0.7, jy + 0.07 * s, 0], 30, r * 0.7, 1);
    girder(B, pk, [-cl, jy + 0.07 * s, 0], 16, r * 0.7, 1);
    // the counterweight, and the cab with its light on
    B.shell([-cl + 0.05 * s, jy - 0.05 * s, 0], 0.07 * s, 90, [0, 1], { squash: 0.8, m: M.STATIC, r: 0.008 * s });
    B.shell([0.09 * s, jy - 0.07 * s, 0], 0.05 * s, 70, [1, 0], { m: M.STATIC, r: 0.008 * s });
    B.node(0.1 * s, jy - 0.07 * s, 0.03 * s, 0.02 * s, 1, 4, M.SHIMMER, 0.4, 0, 0, 0, 0, 0.3, 0, 0);
    // the trolley, the cable, the hook, and a rolled blueprint swinging from it
    const tx = jl * 0.72, hy = jy - 0.72 * s;
    girder(B, [tx, jy - 0.01 * s, 0], [tx, hy, 0], 26, r * 0.55, 0);
    const hook = B.node(tx, hy - 0.02 * s, 0, 0.016 * s, 1, 0, M.HEAVY, 0.3, 1, 0, 0, 0, 0, 0.6, 0.2);
    // the roll: rings of blueprint blue along a short cylinder, hanging crosswise under the hook
    for (let j = 0; j < 9; j++) for (let k = 0; k < 14; k++) { const a = k / 14 * TAU, z = (j / 8 - 0.5) * 0.44 * s; B.node(tx + Math.cos(a) * 0.03 * s, hy - 0.09 * s + Math.sin(a) * 0.03 * s, z, 0.008 * s, 0.9, j === 0 || j === 8 ? 4 : 5, M.HEAVY, 0.3, 1, 0, 0, 0, 0, 0.6, 0.2); }
    // a footing plate
    for (let k = 0; k < 60; k++) { const a = B.rand() * TAU, u = Math.sqrt(B.rand()) * 0.16 * s; B.node(Math.cos(a) * u, 0.005 * s, Math.sin(a) * u, 0.009 * s, 0.8, 1, M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0); }
    B.flow(spine.slice(0, 36).concat([hook]));
    B.core = [0, 0.02 * s, 0];
    return B.done({ kind: 'hero-crane', hero: true, flowRate: 0.6, flowDur: 3200 });
  }
  // A BLUEPRINT: a sheet standing in its own plane, a border, a fine grid,
  // and a simple drawing on it (a floor plan, a gear, a screen with a chart),
  // in blueprint blue with white lines.
  function blueprint(rand, s, what) {
    const B = new Builder(rand, s), wd = 0.5 * s, ht = 0.36 * s, y0 = 0.04 * s, r = 0.006 * s;
    const P = (x, y) => [x * wd - wd / 2, y0 + y * ht, 0];
    for (let i = 0; i < 220; i++) { const x = rand(), y = rand(); B.node(P(x, y)[0], P(x, y)[1], -0.002 * s, 0.007 * s, 0.35, 5, M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0); }
    const edge = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
    for (let k = 0; k < 4; k++) girder(B, P(...edge[k]), P(...edge[k + 1]), k % 2 ? 14 : 20, r * 1.2, 4);
    for (let k = 1; k < 8; k++) girder(B, P(k / 8, 0), P(k / 8, 1), 10, r * 0.6, 3);
    for (let k = 1; k < 6; k++) girder(B, P(0, k / 6), P(1, k / 6), 14, r * 0.6, 3);
    if (what === 'plan') {
      const room = [[0.15, 0.2], [0.85, 0.2], [0.85, 0.8], [0.15, 0.8], [0.15, 0.2]];
      for (let k = 0; k < 4; k++) girder(B, P(...room[k]), P(...room[k + 1]), 12, r, 4);
      girder(B, P(0.5, 0.2), P(0.5, 0.55), 6, r, 4); girder(B, P(0.5, 0.8), P(0.5, 0.68), 3, r, 4);
    } else if (what === 'gear') {
      for (let k = 0; k < 40; k++) { const a = k / 40 * TAU, rr = (k % 4 < 2 ? 0.32 : 0.26); B.node(P(0.5 + Math.cos(a) * rr * 0.72, 0.5 + Math.sin(a) * rr)[0], P(0.5, 0.5 + Math.sin(a) * rr)[1], 0, r, 1, 4, M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0); }
      for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; B.node(P(0.5 + Math.cos(a) * 0.08, 0.5)[0], P(0.5, 0.5 + Math.sin(a) * 0.11)[1], 0, r, 1, 4, M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0); }
    } else {
      const sc = [[0.2, 0.25], [0.8, 0.25], [0.8, 0.8], [0.2, 0.8], [0.2, 0.25]];
      for (let k = 0; k < 4; k++) girder(B, P(...sc[k]), P(...sc[k + 1]), 10, r, 4);
      const bars = [0.3, 0.5, 0.42, 0.65]; bars.forEach((h, k) => girder(B, P(0.3 + k * 0.13, 0.3), P(0.3 + k * 0.13, 0.3 + h * 0.6), 6, r * 1.3, 2));
    }
    // two legs, leaning it back a little on its easel
    girder(B, P(0.1, 0), [-wd / 2 + 0.1 * wd, 0, 0.1 * s], 5, r, 0); girder(B, P(0.9, 0), [wd / 2 - 0.1 * wd, 0, 0.1 * s], 5, r, 0);
    B.core = [0, 0.02 * s, 0];
    return B.done({ kind: 'blueprint', flowRate: 0 });
  }
  // ── THE WORLD ────────────────────────────────────────────────────────────
  const HUES = [18, 85, 165, 220, 260, 300, 340];
  // what each atmosphere brightens, by the kind of thing grown
  const LEAN = {
    rest: ['bloomcloud', 'hangingcanopy', 'canopy', 'orb', 'nestedorb'],
    nature: ['hero-orchard', 'orchard', 'canopy', 'reeds', 'flower', 'shrub', 'seedling'],
    making: ['hero-makerbloom', 'hero-maker', 'hero-machinegarden', 'lantern', 'bearer'],
    connection: ['memorychain', 'nestedorb', 'hero-network', 'hero-archipelago'],
    learning: ['hero-library', 'hero-observatory', 'spiral', 'tower'],
    home: ['hero-house', 'arch', 'mound', 'lantern'],
    freedom: ['farlight', 'bloomswarm', 'hero-impossible', 'bloomcloud'],
    play: ['bloomswarm', 'flower', 'spiral', 'orb'],
  };
  const CLEAR = { x: 0, z: 29.5, r: 2.4 };
  const HEROES = [
    { make: heroOrchard, x: -2.1, z: 7.6, s: 2.4, yaw: 0.3, cos: [2, 5, 0] },
    { make: heroLibrary, x: 2.7, z: 10.8, s: 2.2, yaw: 2.1, cos: [5, 4, 1] },
    { make: heroHouse, x: 0.35, z: 13.9, s: 2.5, yaw: 0, cos: [7, 5, 3] },
    { make: heroMaker, x: 2.4, z: 16.9, s: 2.3, yaw: 4.2, cos: [4, 1, 5] },
    { make: heroObservatory, x: -2.9, z: 19.7, s: 2.8, yaw: 1, cos: [1, 0, 5] },
    { make: heroNetwork, x: 2.7, z: 20.9, s: 2.4, yaw: 0.6, cos: [4, 11, 3] },
    { make: heroImpossible, x: -0.7, z: 23.9, s: 3.6, yaw: 0.2, cos: [7, 9, 8] },
    // the three built the sea art's way: suspended over the first descent, grown beside the montage, turning near the clearing
    { make: heroArchipelago, x: 3.0, z: 6.0, s: 1.6, yaw: 0.4, cos: [3, 6, 1] },
    { make: heroMakerBloom, x: -2.7, z: 12.4, s: 2.3, yaw: 3.9, cos: [2, 5, 4] },
    { make: heroMachineGarden, x: 3.4, z: 26.0, s: 2.1, yaw: 1.2, cos: [1, 4, 6] },
  ];
  // camera poses for the scene board: x, y, z (world), yaw (left/right),
  // pitch (up +), hz (horizon height on screen), roll (a gentle bank, radians,
  // positive leans the horizon clockwise; never more than about 0.12).
  //
  // CAMERA GRAMMAR (Dan, 2026-09-24): height, depth, flight. The world has a
  // ground, a middle, a canopy and an upper air, and the camera visits all
  // four: it climbs to crest the precipice, dives, weaves between a branch and
  // a suspended cluster, looks up from under the chandelier, rises alongside
  // the column and comes out above it, approaches the cathedral from below,
  // travels down the huge form to its origin, threads a dense band and drops
  // into the clearing. Flight, then composition, then a breath, then flight.
  const POSE = {
    dark: { x: 0, y: 0.55, z: -4.6, yaw: 0, pitch: 0, hz: 0.5 },
    invite: { x: 0, y: 0.6, z: -3.1, yaw: 0, pitch: 0.05, hz: 0.5 },
    approach: { x: 0.15, y: 0.5, z: -1.6, yaw: -0.04, pitch: 0.16, hz: 0.56, roll: 0.02 },
    gate: { x: 0, y: 0.6, z: -0.5, yaw: 0, pitch: 0.14, hz: 0.55 },
    under: { x: -0.1, y: 0.7, z: 1.7, yaw: 0.05, pitch: 0.1, hz: 0.55, roll: -0.03 },
    // the precipice: climb, crest, reveal, settle
    climb: { x: 0.1, y: 2.4, z: 2.3, yaw: 0, pitch: 0.18, hz: 0.58, roll: 0.03 },
    crest: { x: 0, y: 4.9, z: 3.0, yaw: 0, pitch: -0.06, hz: 0.5, roll: 0.05 },
    vista: { x: 0, y: 4.3, z: 3.5, yaw: 0, pitch: -0.3, hz: 0.42, roll: -0.02 },
    // the breath over the vista is a slow glide, not a stop: it is already turning toward the islands
    vista2: { x: 0.3, y: 4.05, z: 3.8, yaw: 0.14, pitch: -0.26, hz: 0.43, roll: -0.03 },
    // the dive and the weave: a branch, a suspended cluster, a spiral, a grove
    // through the suspended islands, banking right beneath them
    islands: { x: 0.6, y: 2.2, z: 4.2, yaw: 0.72, pitch: 0.2, hz: 0.52, roll: 0.06 },
    dive: { x: -0.9, y: 1.7, z: 6.0, yaw: -0.12, pitch: -0.24, hz: 0.46, roll: -0.12 },
    weave1: { x: 0.95, y: 1.05, z: 8.7, yaw: 0.28, pitch: 0.02, hz: 0.5, roll: 0.12 },
    weave2: { x: -0.55, y: 2.0, z: 9.9, yaw: -0.36, pitch: 0.18, hz: 0.56, roll: -0.08 },
    // the montage: below the chandelier, round the scaffold, up the column, past a cluster
    underChandelier: { x: 1.9, y: 0.45, z: 10.5, yaw: 0.5, pitch: 0.58, hz: 0.66, roll: 0.04 },
    // the camera the maker bloom grew, turning in its cup
    makerBloom: { x: -0.55, y: 2.1, z: 10.7, yaw: -0.82, pitch: 0.16, hz: 0.52, roll: -0.05 },
    roundScaffold: { x: -0.95, y: 1.25, z: 13.1, yaw: -0.58, pitch: 0.14, hz: 0.55, roll: -0.1 },
    roundScaffold2: { x: -0.5, y: 0.9, z: 15.1, yaw: 0.62, pitch: 0.08, hz: 0.52, roll: 0.09 },
    riseColumn: { x: -1.25, y: 0.8, z: 18.5, yaw: -0.48, pitch: 0.42, hz: 0.62, roll: 0.0 },
    columnTop: { x: -1.0, y: 5.0, z: 19.2, yaw: -0.62, pitch: 0.04, hz: 0.5, roll: 0.07 },
    clusterPass: { x: 1.7, y: 3.7, z: 21.5, yaw: 0.42, pitch: -0.14, hz: 0.48, roll: 0.1 },
    // the spectacle: from below, then the reveal
    secretLow: { x: 1.7, y: 0.55, z: 21.4, yaw: -0.42, pitch: 0.5, hz: 0.64, roll: 0.03 },
    secret: { x: 1.45, y: 2.3, z: 21.3, yaw: -0.38, pitch: 0.2, hz: 0.55, roll: -0.03 },
    secret2: { x: 1.3, y: 2.75, z: 21.55, yaw: -0.44, pitch: 0.12, hz: 0.54, roll: -0.02 },
    // the origin: down the huge form to the tiny beginning
    originsHigh: { x: 0.45, y: 5.1, z: 22.1, yaw: -0.55, pitch: -0.36, hz: 0.5, roll: 0.02 },
    originsBase: { x: 0.65, y: 0.45, z: 22.9, yaw: -0.72, pitch: -0.24, hz: 0.4, roll: -0.02 },
    // density to calm: a dense band, a drop, a narrowing, the clearing
    // the machine-garden's turning heart, from below and beside
    machinePass: { x: 0.9, y: 2.3, z: 23.7, yaw: 0.8, pitch: 0.28, hz: 0.56, roll: 0.05 },
    band: { x: -0.85, y: 1.6, z: 25.2, yaw: 0.16, pitch: -0.04, hz: 0.5, roll: 0.08 },
    drop: { x: 0.2, y: 0.5, z: 26.3, yaw: 0.02, pitch: 0.03, hz: 0.5, roll: 0.0 },
    clearing: { x: 0, y: 0.72, z: 26.9, yaw: 0, pitch: -0.08, hz: 0.38 },
    seedClose: { x: 0, y: 0.7, z: 27.25, yaw: 0, pitch: -0.1, hz: 0.38 },
    seedWide: { x: 0, y: 0.8, z: 26.6, yaw: 0, pitch: -0.04, hz: 0.4 },
    table: { x: 0, y: 0.85, z: 26.9, yaw: 0, pitch: 0.04, hz: 0.42 },
    // the world reveals its shape: rise, then lift until the garden is a ball
    rise: { x: 0, y: 4.6, z: 22.4, yaw: 0, pitch: -0.42, hz: 0.5 },
    lift: { x: 0, y: 11.0, z: 15.0, yaw: 0, pitch: -0.86, hz: 0.5 },
    // kept for the old scene board
    descend: { x: 0.25, y: 1.05, z: 4.9, yaw: -0.08, pitch: -0.04, hz: 0.5 },
    orchard: { x: -0.4, y: 0.95, z: 7.9, yaw: -0.32, pitch: 0.24, hz: 0.6 },
    library: { x: 0.2, y: 1.15, z: 10.9, yaw: 0.44, pitch: 0.1, hz: 0.55 },
    house: { x: -0.2, y: 0.85, z: 14.4, yaw: -0.3, pitch: 0.06, hz: 0.52 },
    bearer: { x: 0.5, y: 1.0, z: 17.1, yaw: 0.46, pitch: 0.12, hz: 0.55 },
    grove1: { x: 0.4, y: 1.05, z: 19.5, yaw: -0.52, pitch: 0.14, hz: 0.55 },
    grove2: { x: 0.7, y: 1.1, z: 21.0, yaw: 0.2, pitch: 0.08, hz: 0.53 },
    originsTop: { x: 1.0, y: 1.2, z: 22.3, yaw: -0.42, pitch: 0.5, hz: 0.6 },
    passage: { x: 0.3, y: 0.85, z: 25.9, yaw: 0, pitch: 0, hz: 0.5 },
  };
  // a narrow screen frames one thing at a time: closer, straighter, less bank
  const NARROW = {
    vista: { y: 5.0, z: 2.9, pitch: -0.34, roll: 0 },
    dive: { x: -0.5, roll: -0.06 },
    weave1: { x: 0.6, roll: 0.06 },
    underChandelier: { x: 1.4, yaw: 0.65, pitch: 0.62 },
    roundScaffold: { x: -0.6, yaw: -0.7, roll: -0.05 },
    columnTop: { x: -0.6, yaw: -0.75 },
    secret: { x: 1.0, yaw: -0.5, z: 21.0 },
    originsHigh: { yaw: -0.65, z: 21.8 },
    orchard: { x: -0.9, yaw: -0.5, z: 7.4 },
    library: { x: 0.7, yaw: 0.6, z: 10.6 },
    bearer: { x: 1.0, yaw: 0.6, z: 16.8 },
    grove1: { x: -0.2, yaw: -0.65, z: 19.3 },
    originsTop: { pitch: 0.6, z: 22.0 },
  };

  function make(canvas, opts) {
    const ctx = canvas.getContext('2d');
    const rand = rng(1717);
    const ink = opts.ink, dark = !!opts.dark, pen = opts.pen;
    const still = !!opts.still;
    const forms = [];
    const tour = !!opts.tour, TS = tour ? 0.7 : 1;
    // THE COSMOS PALETTE. The kind colours and the land colours the globe
    // itself wears, handed in by the page from the theme's tokens (falling
    // back to the old hue families if not). A form's palette is a recipe:
    // structural ink, a supporting mid-value (ink toward its first accent),
    // two or three luminous accents, a warm light. Near nodes get a lighter
    // variant (the sea art's rule: nearer is lighter), far ones the base.
    const COS = (opts.cosmos && opts.cosmos.length >= 6) ? opts.cosmos : HUES.map((h) => oklchRgb(dark ? 0.8 : 0.6, 0.15, h));
    const light = dark ? [255, 250, 235] : [255, 245, 220];
    const palette = (acc, mono) => {
      const pick = (i) => COS[((i % COS.length) + COS.length) % COS.length];
      const a0 = pick(acc[0]), a1 = pick(acc[1] == null ? acc[0] + 3 : acc[1]), a2 = pick(acc[2] == null ? acc[0] + 7 : acc[2]);
      const tone = mono === 'mono' ? 0.12 : mono === 'light' ? 0.28 : 0.5, sat = mono === 'mono' ? 0.55 : mono === 'light' ? 0.8 : 0.94;
      const base = [ink, mix(ink, a0, tone), mix(ink, a0, sat), mix(ink, a1, sat), mix(ink, light, 0.9), mix(ink, a2, sat)];
      return { col: base.map(rgb), near: base.map((c) => rgb(dark ? mix(c, light, 0.22) : mix(c, [0, 0, 0], 0.14))) };
    };
    // THE OLD GARDEN'S LIFE (plant.js at 63e5488): every grown thing turned
    // slowly on its own axis, like a turntable, and bent as one body from its
    // base. That is most of what made the potted garden feel alive while the
    // camera held still: constant soft parallax, and a sway you read as a
    // whole thing breathing rather than dots jittering. Heroes turn slower.
    const place = (f, x, z, yaw, pal) => {
      const hero = !!f.hero, dir = rand() < 0.5 ? -1 : 1;
      forms.push(Object.assign(f, { x, z, yaw, c1: Math.cos(yaw), s1: Math.sin(yaw), col: pal.col, near: pal.near, pulses: [], nextFlow: 0,
        spin: dir * (hero ? 0.006 + rand() * 0.008 : 0.02 + rand() * 0.04), bend: hero ? 0.012 : 0.022 + rand() * 0.014, bph: rand() * TAU }));
    };

    // ── THE TOUR (opts.tour): other people's worlds, then yours ───────────
    //
    // Instead of a garden, a few well-populated globes in the shape the
    // landing page's hero globe wears (the app's own globe: a sea, regions
    // outlined in the land colours, notes as dots in the kind colours, names
    // in the land-label colour), with the same grown node art standing in
    // their regions and small things growing in their seas. The host flies
    // us over them like satellites; the regions twinkle as we pass the way a
    // region does when you choose it in the rail. One of them is drawn in
    // another hand (the landing page's ink: "The same place, in another
    // hand."). Then a small, young globe that is yours.
    const planets = [];
    const TPOSE = {};
    // the poses that belong to whichever young world is theirs, and which it is
    const PATHED = ['approachD', 'clearing', 'seedClose', 'table', 'rise', 'lift'];
    const youngs = { d: null, h: null };
    let yours = null;
    const GLASS_Z = -37, roomForms = [], ANCHOR = {};
    // the door in the room's back wall, the glass room beyond it, the field beyond the glass (Dan, 2026-10-07)
    const fieldForms = [], flies = [], obstacles = [], keys = [];
    let web = null, doorOpen = null, key = null, keyAnim = null, obstacleHoverId = -1;
    // the glass room's far wall, where the looking glass hangs now; the field begins past it
    // the glass hangs a step to the right of the door's line, so the doorway
    // shows the dark room first and the glass is found, not framed (seen 2026-10-07)
    const DX = 3.5, GX = DX + 1.0, GZ2 = GLASS_Z + 4, FZ0 = GZ2 + 1.5;
    const G = opts.globe || {};
    const KINDC = (G.kinds && G.kinds.length >= 6 ? G.kinds : null);
    const LANDS = (G.lands && G.lands.length >= 8 ? G.lands : null);
    const n3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const x3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    // a direction on a globe: θ along the way we fly (0 faces where we come from, π the far side, over the top), φ to the side
    const dirOf = (th, ph) => n3([Math.sin(ph), Math.sin(th) * Math.cos(ph), -Math.cos(th) * Math.cos(ph)]);
    function frameAt(d, yaw) {
      let e = x3([0, 1, 0], d); if (Math.hypot(e[0], e[1], e[2]) < 0.2) e = x3([0, 0, 1], d); e = n3(e);
      let nn = x3(d, e);
      const c = Math.cos(yaw || 0), s = Math.sin(yaw || 0);
      const ex = [e[0] * c + nn[0] * s, e[1] * c + nn[1] * s, e[2] * c + nn[2] * s];
      nn = x3(d, ex);
      return [ex[0], ex[1], ex[2], d[0], d[1], d[2], nn[0], nn[1], nn[2]];
    }
    // a grown thing standing on a globe, its up the globe's normal there
    const placeOn = (f, pl, d, yaw, pal, o) => {
      const at = pl.R * ((o && o.lift) || 1.0);
      f.B = frameAt(d, yaw); f.px = pl.C[0] + d[0] * at; f.py = pl.C[1] + d[1] * at; f.pz = pl.C[2] + d[2] * at;
      f.x = f.px; f.z = f.pz; f.pl = pl.i;
      place(f, f.px, f.pz, 0, pal);
      if (pl.ink) f.noHalo = true;
      pl.forms.push(forms.length - 1);
    };
    // the globe's own surface marks: the sea's faint lattice, a region's notes and threads
    const surfForm = (pl, P, n, kind, col) => {
      const f = { P, n, flows: [], things: [], core: [0, 0, 0], s: 1, kind, hero: false, surf: true, rigid: true };
      f.B = [1, 0, 0, 0, 1, 0, 0, 0, 1]; f.px = pl.C[0]; f.py = pl.C[1]; f.pz = pl.C[2]; f.x = f.px; f.z = f.pz; f.pl = pl.i;
      forms.push(Object.assign(f, { yaw: 0, c1: 1, s1: 0, col, near: col, pulses: [], nextFlow: 0, spin: 0, bend: 0, bph: 0 }));
      pl.forms.push(forms.length - 1);
      return f;
    };
    const cssCols = (arr) => arr.map((c) => (typeof c === 'string' ? c : rgb(c)));
    // the builder's planet: structural green, and blueprint blue
    const GREEN = oklchRgb(dark ? 0.8 : 0.56, 0.15, 150), BLUE = oklchRgb(dark ? 0.72 : 0.52, 0.13, 245), GREEN_CSS = rgb(GREEN);
    const greenPal = () => {
      const base = [ink, mix(ink, GREEN, 0.55), GREEN, mix(GREEN, light, 0.35), mix(ink, light, 0.9), BLUE];
      return { col: base.map(rgb), near: base.map((c) => rgb(dark ? mix(c, light, 0.22) : mix(c, [0, 0, 0], 0.14))) };
    };
    function buildPlanet(spec) {
      const pl = Object.assign({ i: planets.length, forms: [], regions: [] }, spec);
      planets.push(pl);
      const R = pl.R, pr = rng(Math.round(pl.C[2] * 31 + R * 7));
      // the sea's lattice: a golden-angle sphere of faint points
      const P = [], N = Math.round(pl.sea * R * R);
      for (let k = 0; k < N; k++) {
        const y = 1 - 2 * (k + 0.5) / N, rr = Math.sqrt(1 - y * y), a = k * 2.39996;
        P.push(Math.cos(a) * rr * R, y * R, Math.sin(a) * rr * R, 0.011 * R / 6, pl.ink ? 0.35 : 0.28, 0, M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0);
      }
      surfForm(pl, P, N, 'sea', cssCols([pl.ink ? (G.ink3 || rgb(ink)) : (G.pip || rgb(ink))]));
      // the regions: a coast, notes as dots in the kinds' colours, a few threads between them
      for (const rg of pl.regionsSpec) {
        const d = dirOf(rg.th * Math.PI, rg.ph), fr = frameAt(d, 0), e1 = [fr[0], fr[1], fr[2]], e2 = [fr[6], fr[7], fr[8]];
        const k1 = pr() * TAU, k2 = pr() * TAU, a = rg.a;
        const edge = (w) => a * (1 + 0.16 * Math.sin(3 * w + k1) + 0.09 * Math.sin(5 * w + k2));
        const onS = (w, rho, lift) => { const c = Math.cos(rho), s = Math.sin(rho), cw = Math.cos(w), sw = Math.sin(w); const v = n3([d[0] * c + (e1[0] * cw + e2[0] * sw) * s, d[1] * c + (e1[1] * cw + e2[1] * sw) * s, d[2] * c + (e1[2] * cw + e2[2] * sw) * s]); return [v[0] * R * lift, v[1] * R * lift, v[2] * R * lift]; };
        const RP = [], dots = [];
        const nn = rg.notes || 60;
        for (let k = 0; k < nn; k++) {
          const w = pr() * TAU, rho = edge(w) * Math.sqrt(pr()) * 0.92, p = onS(w, rho, 1.004);
          dots.push(p);
          RP.push(p[0], p[1], p[2], (0.02 + pr() * 0.012) * R / 6, 1, pl.ink ? 0 : Math.floor(pr() * 7), M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0);
        }
        // THE WEB, AS IN THE APP: notes linked to near notes (the way related
        // notes sit near each other), a few long threads across the region,
        // and one or two out to a neighbouring region; drawn as fine arcs in drawTour
        const links = [];
        for (let k = 0; k < dots.length; k++) {
          if (pr() < 0.45) continue;
          let best = -1, bd = 1e9;
          for (let j = 0; j < dots.length; j++) { if (j === k) continue; const dd = (dots[j][0] - dots[k][0]) ** 2 + (dots[j][1] - dots[k][1]) ** 2 + (dots[j][2] - dots[k][2]) ** 2; if (dd < bd && pr() < 0.8) { bd = dd; best = j; } }
          if (best >= 0) links.push([dots[k], dots[best]]);
        }
        for (let k = 0; k < Math.round(nn / 12); k++) links.push([dots[Math.floor(pr() * dots.length)], dots[Math.floor(pr() * dots.length)]]);
        const kinds = pl.ink ? [G.ink2 || rgb(ink)] : (KINDC || COS.slice(0, 7).map(rgb));
        const landCol = pl.ink ? (G.ink2 || rgb(ink)) : (LANDS ? LANDS[rg.land % 8] : rgb(COS[rg.land % COS.length]));
        const rf = surfForm(pl, RP, RP.length / S, 'region', cssCols(kinds.concat([landCol])));
        rf.region = true; rf.spark = 0; rf.seed = pl.i * 97 + pl.regions.length * 13;
        const coast = []; for (let k = 0; k < 64; k++) { const w = k / 64 * TAU; coast.push(onS(w, edge(w), 1.003)); }
        const label = onS(0, 0, 1.02);
        pl.regions.push({ name: rg.name, d, coast, label, col: landCol, form: rf, spark: 0, links, dots });
        // the grown piece at its heart, and a few smaller things round it
        if (rg.piece) placeOn(rg.piece(rng(Math.round((rg.th + 3) * 1000 + pl.i * 17)), rg.s), pl, n3(onS(0.7, a * 0.18, 1)), rg.yaw || 0, palette(rg.cos || [rg.land, rg.land + 3, rg.land + 6], pl.ink ? 'mono' : false));
        for (let k = 0; k < (rg.small || 2); k++) {
          const w = pr() * TAU, amb = AMB[Math.floor(pr() * AMB.length)];
          placeOn(ambient(pr, amb, (0.35 + pr() * 0.3) * R / 6), pl, n3(onS(w, edge(w) * (0.5 + pr() * 0.35), 1)), pr() * TAU, palette([rg.land + k, rg.land + 4, rg.land + 7], pl.ink ? 'mono' : (pr() < 0.3 ? 'light' : false)));
        }
      }
      for (let i = 1; i < pl.regions.length; i++) {
        const a = pl.regions[i - 1], b = pl.regions[i];
        for (let k = 0; k < 2; k++) a.links.push([a.dots[Math.floor(pr() * a.dots.length)], b.dots[Math.floor(pr() * b.dots.length)], true]);
      }
      // small things growing in the sea, between the regions
      for (let k = 0, tries = 0; k < pl.seaThings && tries < 200; tries++) {
        const d = dirOf(pr() * Math.PI, (pr() * 2 - 1) * 1.2);
        if (pl.regions.some((r) => r.d[0] * d[0] + r.d[1] * d[1] + r.d[2] * d[2] > Math.cos(0.42))) continue;
        const amb = SEA[Math.floor(pr() * SEA.length)];
        placeOn(ambient(pr, amb, (0.3 + pr() * 0.3) * R / 6), pl, d, pr() * TAU, palette([k, k + 3, k + 6], pl.ink ? 'mono' : (pr() < 0.4 ? 'light' : false)));
        k++;
      }
      return pl;
    }
    // EVERY GROWN THING FROM THE EARLIER GARDENS (the potted garden, the storied
    // garden behind the gate) has somewhere to stand on the worlds: the grove
    // kinds in the regions, the upper air's floating kinds out in the seas
    const AMB = ['flower', 'seedling', 'orb', 'lantern', 'spiral', 'shrub', 'reeds', 'arch', 'canopy', 'orchard', 'bearer', 'tower', 'mound'];
    const SEA = ['seedling', 'reeds', 'flower', 'orb', 'bloomcloud', 'shrub', 'nestedorb', 'memorychain', 'bloomswarm', 'hangingcanopy', 'farlight'];
    function buildTour() {
      // somebody's world, in colour: the landing page's own region names
      const A = buildPlanet({ key: 'a', C: [0, 0, 20], R: 6, sea: 26, seaThings: 9, regionsSpec: [
        { name: 'Things I’m building', th: 0.22, ph: -0.42, a: 0.36, land: 0, piece: heroMakerBloom, s: 0.95, yaw: 0.6, notes: 80 },
        { name: 'Home', th: 0.35, ph: 0.46, a: 0.3, land: 2, piece: heroHouse, s: 0.8, notes: 55 },
        { name: 'People I care about', th: 0.48, ph: -0.36, a: 0.34, land: 5, piece: heroArchipelago, s: 0.72, notes: 70 },
        { name: 'What I’m learning', th: 0.61, ph: 0.4, a: 0.32, land: 7, piece: heroBookOfBirds, s: 0.95, notes: 64 },
        { name: 'Ideas worth returning to', th: 0.74, ph: -0.3, a: 0.3, land: 3, piece: heroOrchard, s: 0.72, notes: 58 },
        { name: 'Maybe someday', th: 0.9, ph: 0.5, a: 0.26, land: 6, notes: 34, small: 3 },
      ] });
      // the same kind of place, in another hand: ink
      const B = buildPlanet({ key: 'b', C: [-9, 5, 50], R: 5, sea: 30, seaThings: 7, ink: true, regionsSpec: [
        { name: 'Client work', th: 0.24, ph: 0.4, a: 0.32, land: 1, piece: heroLibrary, s: 0.72, notes: 70 },
        { name: 'The shed', th: 0.42, ph: -0.42, a: 0.3, land: 4, piece: heroMachineGarden, s: 0.68, notes: 48 },
        { name: 'Letters to Ada', th: 0.57, ph: 0.36, a: 0.28, land: 2, piece: heroObservatory, s: 0.55, notes: 44 },
        { name: 'Running', th: 0.71, ph: -0.34, a: 0.3, land: 6, piece: heroLongRoad, s: 0.85, notes: 52 },
        { name: 'Reading', th: 0.86, ph: 0.3, a: 0.26, land: 3, notes: 40, small: 3 },
      ] });
      // a big, busy world, where the spectacle and its beginning are
      const Cw = buildPlanet({ key: 'c', C: [10, -3, 80], R: 7.5, sea: 22, seaThings: 11, regionsSpec: [
        { name: 'The band', th: 0.3, ph: 0.4, a: 0.3, land: 4, piece: heroResonator, s: 1.05, notes: 60 },
        { name: 'The company', th: 0.5, ph: 0.2, a: 0.38, land: 0, piece: heroImpossible, s: 1.45, yaw: 0.4, notes: 110 },
        { name: 'Health', th: 0.44, ph: -0.42, a: 0.28, land: 3, piece: heroMaker, s: 0.8, notes: 46 },
        { name: 'Travel', th: 0.7, ph: -0.3, a: 0.3, land: 6, piece: heroArchipelago, s: 0.8, notes: 56 },
        { name: 'The move north', th: 0.84, ph: 0.35, a: 0.26, land: 1, notes: 38, small: 3 },
      ] });
      // yours: small, young, nothing on it yet but its sea and one quiet place
      const D = buildPlanet({ key: 'd', C: [0, 1, 108], R: 3.2, sea: 40, seaThings: 3, young: true, regionsSpec: [] });
      // THE BUILDER'S PLANET: young too, but outlined in structural green,
      // meridians and parallels like scaffolding, a crane standing ready by
      // the clearing, blueprints on easels round it (Dan, 2026-09-25)
      const Hb = buildPlanet({ key: 'h', C: [11, 3, 110], R: 3.2, sea: 16, seaThings: 0, young: true, build: true, regionsSpec: [] });
      {
        const S3 = [], R = Hb.R * 1.006;
        for (let m = 0; m < 14; m++) { const ph = m / 14 * Math.PI; for (let k = 0; k < 90; k++) { const t = k / 90 * TAU; S3.push(Math.cos(ph) * Math.sin(t) * R, Math.cos(t) * R, Math.sin(ph) * Math.sin(t) * R, 0.014 * R / 6, 0.8, 0, M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0); } }
        for (let p = 1; p < 9; p++) { const la = p / 9 * Math.PI, rr = Math.sin(la) * R, y = Math.cos(la) * R, n = Math.round(110 * Math.sin(la)) + 12; for (let k = 0; k < n; k++) { const t = k / n * TAU; S3.push(Math.cos(t) * rr, y, Math.sin(t) * rr, 0.014 * R / 6, 0.8, 0, M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0); } }
        surfForm(Hb, S3, S3.length / S, 'scaffold', [GREEN_CSS]);
        const gp = greenPal();
        placeOn(heroCrane(rng(911), 0.62), Hb, dirOf(0.34 * Math.PI, 0.2), 2.2, gp);
        placeOn(blueprint(rng(912), 0.62, 'plan'), Hb, dirOf(0.3 * Math.PI, -0.2), 0.3, gp);
        placeOn(blueprint(rng(913), 0.5, 'gear'), Hb, dirOf(0.37 * Math.PI, -0.14), -0.4, gp);
        placeOn(blueprint(rng(914), 0.46, 'screen'), Hb, dirOf(0.24 * Math.PI, 0.24), 0.6, gp);
        placeOn(ambient(rng(915), 'tower', 0.5), Hb, dirOf(0.45 * Math.PI, 0.05), 0, gp);
        placeOn(ambient(rng(916), 'lantern', 0.4), Hb, dirOf(0.2 * Math.PI, -0.12), 0, gp);
      }
      // mid-space: no islands (Dan, 2026-09-25); the host asks while the camera
      // glides on between the busy world and the two young ones
      const MC = [3, 1, 95];
      // other worlds in your sky while you talk: far, lived in, quiet
      buildPlanet({ key: 'e', C: [-15, 14, 150], R: 4.2, sea: 18, seaThings: 3, regionsSpec: [
        { name: 'The garden', th: 0.1, ph: -0.3, a: 0.4, land: 7, piece: gate, s: 0.9, notes: 50, small: 4 },
        { name: 'Mum', th: 0.3, ph: 0.35, a: 0.34, land: 5, piece: heroHouse, s: 0.7, notes: 40, small: 2 },
        { name: 'Night classes', th: 0.2, ph: 0.9, a: 0.3, land: 2, piece: heroLibrary, s: 0.65, notes: 36, small: 2 },
      ] });
      buildPlanet({ key: 'f', C: [19, 15, 150], R: 5.2, sea: 16, seaThings: 3, ink: true, regionsSpec: [
        { name: 'The novel', th: 0.12, ph: 0.2, a: 0.42, land: 3, piece: heroBookOfBirds, s: 0.95, notes: 60, small: 3 },
        { name: 'Teaching', th: 0.28, ph: -0.5, a: 0.34, land: 1, piece: heroObservatory, s: 0.7, notes: 44, small: 2 },
      ] });
      buildPlanet({ key: 'g', C: [-2, 24, 160], R: 3.6, sea: 18, seaThings: 2, regionsSpec: [
        { name: 'The shop', th: 0.08, ph: 0.1, a: 0.44, land: 0, piece: heroMakerBloom, s: 0.75, notes: 48, small: 3 },
        { name: 'Pricing', th: 0.24, ph: 0.6, a: 0.3, land: 4, piece: heroMachineGarden, s: 0.6, notes: 30, small: 2 },
      ] });
      // two more, off to the sides of the way: seen, never visited
      buildPlanet({ key: 'i', C: [-24, -9, 124], R: 4.6, sea: 18, seaThings: 5, regionsSpec: [
        { name: 'The allotment', th: 0.12, ph: 0.35, a: 0.4, land: 3, piece: heroOrchard, s: 0.85, notes: 54, small: 4 },
        { name: 'Choir', th: 0.3, ph: -0.2, a: 0.32, land: 4, piece: heroResonator, s: 0.8, notes: 40, small: 2 },
        { name: 'The kids', th: 0.22, ph: 0.95, a: 0.34, land: 5, piece: heroNetwork, s: 0.75, notes: 46, small: 3 },
      ] });
      buildPlanet({ key: 'j', C: [30, -14, 142], R: 5, sea: 16, seaThings: 5, ink: true, regionsSpec: [
        { name: 'The long walk', th: 0.1, ph: -0.4, a: 0.4, land: 6, piece: heroLongRoad, s: 0.9, notes: 50, small: 3 },
        { name: 'Tinkering', th: 0.28, ph: 0.3, a: 0.34, land: 1, piece: heroMaker, s: 0.75, notes: 42, small: 3 },
        { name: 'Someday', th: 0.2, ph: 1.0, a: 0.3, land: 7, piece: heroImpossible, s: 0.9, notes: 30, small: 2 },
      ] });
      // the camera's waypoints, computed from the globes
      const V = (p, tgt, up, hz, roll) => { const u = n3(up); return { x: p[0], y: p[1], z: p[2], tx: tgt[0], ty: tgt[1], tz: tgt[2], ux: u[0], uy: u[1], uz: u[2], hz: hz == null ? 0.5 : hz, roll: roll || 0 }; };
      const at = (pl, d, h) => [pl.C[0] + d[0] * (pl.R + h), pl.C[1] + d[1] * (pl.R + h), pl.C[2] + d[2] * (pl.R + h)];
      // skimming: over θ, looking a little ahead and down, the globe's normal for up
      const over = (pl, th, ph, alt, ahead, roll) => { const d = dirOf(th * Math.PI, ph), dt = dirOf((th + (ahead || 0.15)) * Math.PI, ph * 0.7); return V(at(pl, d, alt), at(pl, dt, -0.15), d, 0.44, roll); };
      // looking at the whole globe from outside
      const view = (pl, th, ph, dist, toward, roll) => { const d = dirOf(th * Math.PI, ph), p = [pl.C[0] + d[0] * dist, pl.C[1] + d[1] * dist, pl.C[2] + d[2] * dist]; const tg = toward || pl.C; return V(p, tg, dirOf((th + 0.5) * Math.PI, ph), 0.5, roll); };
      const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      // the spectacle: where the big piece stands on the third world
      const big = Cw.regions[1], bd = big.d, bf = frameAt(bd, 0);
      const bigAt = (h, side, back) => [Cw.C[0] + bd[0] * (Cw.R + h) + bf[0] * side - bf[6] * back, Cw.C[1] + bd[1] * (Cw.R + h) + bf[1] * side - bf[7] * back, Cw.C[2] + bd[2] * (Cw.R + h) + bf[2] * side - bf[8] * back];
      Object.assign(TPOSE, {
        dark: V([0, 2, -16], A.C, [0, 1, 0], 0.5),
        invite: V([0, 2.4, -11], A.C, [0, 1, 0], 0.5),
        approachA: V(at(A, dirOf(0.02 * Math.PI, 0.05), 5.5), at(A, dirOf(0.2 * Math.PI, 0), 0), dirOf(0.02 * Math.PI, 0.05), 0.46, 0.02),
        skimA1: over(A, 0.14, 0.02, 1.8, 0.16, -0.04),
        skimA2: over(A, 0.3, 0.1, 1.3, 0.15, 0.06),
        skimA3: over(A, 0.46, -0.06, 1.4, 0.16, -0.05),
        vistaA: view(A, 0.6, 0.18, A.R + 8.5, null, -0.02),
        vistaA2: view(A, 0.72, 0.26, A.R + 10.5, mix3(A.C, B.C, 0.22), -0.03),
        transitB: V(mix3(at(A, dirOf(0.85 * Math.PI, 0.3), 8), at(B, dirOf(0.02 * Math.PI, 0), 7), 0.5), B.C, [0, 1, 0], 0.5, 0.05),
        approachB: V(at(B, dirOf(0.04 * Math.PI, -0.05), 4.6), at(B, dirOf(0.22 * Math.PI, 0), 0), dirOf(0.04 * Math.PI, 0), 0.46, -0.03),
        skimB1: over(B, 0.22, 0.04, 1.4, 0.16, 0.05),
        skimB2: over(B, 0.4, -0.08, 1.1, 0.15, -0.07),
        skimB3: over(B, 0.57, 0.06, 1.25, 0.16, 0.06),
        skimB4: over(B, 0.73, -0.04, 1.7, 0.16, -0.03),
        riseB: view(B, 0.88, 0.12, B.R + 6.5, mix3(B.C, Cw.C, 0.35), 0.02),
        transitC: V(mix3(at(B, dirOf(0.95 * Math.PI, 0), 7), at(Cw, dirOf(0.1 * Math.PI, 0.1), 7), 0.5), Cw.C, [0, 1, 0], 0.5, -0.05),
        approachC: V(bigAt(0.5, 1.6, 5.2), bigAt(2.4, 0, 0), bd, 0.62, 0.03),
        secret: V(bigAt(1.6, 1.3, 4.6), bigAt(2.2, 0, 0), bd, 0.55, -0.02),
        secret2: V(bigAt(2.4, 1.1, 4.4), bigAt(2.4, 0, 0), bd, 0.54, -0.02),
        originsHigh: V(bigAt(6.2, 0.9, 2.0), bigAt(0.4, 0, 0), bd, 0.5, 0.02),
        originsBase: V(bigAt(0.5, 0.8, 1.9), bigAt(0.08, 0, 0), bd, 0.42, -0.02),
        leaveC: view(Cw, 0.66, 0.2, Cw.R + 5.5, mix3(Cw.C, D.C, 0.5), 0.04),
        transitD: V(mix3(at(Cw, dirOf(0.9 * Math.PI, 0.1), 8), at(D, dirOf(0.02 * Math.PI, 0), 6), 0.55), D.C, [0, 1, 0], 0.5, 0),
        approachD: V(at(D, dirOf(0.06 * Math.PI, 0), 4.2), at(D, dirOf(0.24 * Math.PI, 0), 0), dirOf(0.06 * Math.PI, 0), 0.48, 0),
        clearing: over(D, 0.2, 0, 1.5, 0.17, 0),
        seedClose: over(D, 0.23, 0, 1.15, 0.15, 0),
        table: over(D, 0.22, 0, 1.3, 0.16, 0),
        rise: view(D, 0.3, 0, D.R + 4.2, at(D, dirOf(0.36 * Math.PI, 0), -1.2), 0),
        lift: view(D, 0.34, 0, D.R + 9.5, D.C, 0),
      });
      // the one quiet place on your globe, where the seed will go
      const cd = dirOf(0.27 * Math.PI, 0);
      D.clearing = [D.C[0] + cd[0] * D.R, D.C[1] + cd[1] * D.R, D.C[2] + cd[2] * D.R, cd];
      Hb.clearing = [Hb.C[0] + cd[0] * Hb.R, Hb.C[1] + cd[1] * Hb.R, Hb.C[2] + cd[2] * Hb.R, cd];
      // mid-space: in among the islands from the busy world's side, a rest
      // with both young worlds ahead (yours on the left, the green one on the
      // right), and out toward whichever they chose
      const toward = (pl, k) => mix3(MC, pl.C, k);
      Object.assign(TPOSE, {
        midIn: V([MC[0] + 2.2, MC[1] + 1.4, MC[2] - 8], [MC[0], MC[1], MC[2] + 4], [0, 1, 0], 0.5, 0.03),
        midspace: V([MC[0] + 0.2, MC[1] + 0.3, MC[2] - 1.6], [MC[0] + 1.2, MC[1] + 0.4, MC[2] + 12], [0, 1, 0], 0.5, 0),
        midOut_D: V(toward(D, 0.42), D.C, [0, 1, 0], 0.5, -0.02),
        midOut_H: V(toward(Hb, 0.42), Hb.C, [0, 1, 0], 0.5, 0.02),
        approachD_H: V(at(Hb, dirOf(0.06 * Math.PI, 0), 4.2), at(Hb, dirOf(0.24 * Math.PI, 0), 0), dirOf(0.06 * Math.PI, 0), 0.48, 0),
        clearing_H: over(Hb, 0.2, 0, 1.5, 0.17, 0),
        seedClose_H: over(Hb, 0.23, 0, 1.15, 0.15, 0),
        table_H: over(Hb, 0.22, 0, 1.3, 0.16, 0),
        rise_H: view(Hb, 0.3, 0, Hb.R + 4.2, at(Hb, dirOf(0.36 * Math.PI, 0), -1.2), 0),
        lift_H: view(Hb, 0.34, 0, Hb.R + 9.5, Hb.C, 0),
      });
      for (const n of PATHED) TPOSE[n + '_D'] = TPOSE[n + '_D'] || TPOSE[n];
      TPOSE.midOut = TPOSE.midOut_D;
      youngs.d = D; youngs.h = Hb;
      // ── the room by the fire, before the glass. The back wall is at
      // GLASS_Z; beyond it is space. Nothing in the room turns or bends.
      const RZ = GLASS_Z - 3;
      const room = (f, x, z, yaw, pal, r) => { place(f, x, z, yaw, pal); f.spin = 0; f.bend = 0; f.room = true; f.row = r; if (!(r && r.halo)) f.noHalo = true; roomForms.push(forms.length - 1); return f; };
      for (const r of ROOM) {
        // a row may bring its own colours (the doorway's web wears the Malice palette: plums and violets, the odd orange eye)
        const pal = r.cols ? { col: r.cols.map(rgb), near: r.cols.map((c) => rgb(dark ? mix(c, light, 0.22) : mix(c, [0, 0, 0], 0.14))) } : palette(r.pal, r.tone);
        const f = room(r.make(rng(r.seed), r.what), r.x, GLASS_Z + r.z, r.yaw, pal, r);
        if (r.wake != null) Object.assign(f, { wake: r.wake, wakeWant: r.wake, acc: 0, sleepy: r.sleepy, sleepFloor: r.floor, hideAsleep: r.hide, accBase: r.acc });
      }
      // a faint back wall, open where the looking glass is
      { const WP = []; const wr = rng(309);
        // open where the door is (an arch), and where the window is
        const inDoor = (x, y) => { const dx = x - DX; return Math.abs(dx) < DOOR_W + 0.1 && (y < DOOR_H - DOOR_W || Math.hypot(dx, y - (DOOR_H - DOOR_W)) < DOOR_W + 0.1); };
        for (let i = 0; i < 1200; i++) { const x = (wr() * 2 - 1) * 5, y = wr() * 3.2; if (inDoor(x, y)) continue; if (Math.abs(x - 0.15) < 0.56 && y > 1.44 && y < 2.56) continue; WP.push(x, y, 0, 0.012, 0.22 + wr() * 0.12, 0, M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0); }
        const wall = { P: WP, n: WP.length / S, flows: [], things: [], core: [0, 0, 0], s: 1, kind: 'room-wall', hero: false, rigid: true };
        room(wall, 0, GLASS_Z + 0.05, 0, palette([0, 0, 0], 'mono')); }
      // THE GLASS ROOM (Dan, 2026-10-07): through the door, a small bare room,
      // darker, with the looking glass alone on its far wall. It hung on the
      // room's back wall before; here it is earned. Three faint walls in the
      // dark, open where the glass is.
      { const GP = [], gr = rng(345), hw = 2.3;
        for (let i = 0; i < 900; i++) { const x = (gr() * 2 - 1) * hw, y = gr() * 3.2; const ex = (x - (GX - DX)) / 0.64, ey = (y - 1.15) / 0.98; if (ex * ex + ey * ey < 1) continue; GP.push(x, y, 0, 0.011, 0.14 + gr() * 0.1, 0, M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0); }
        for (const side of [-1, 1]) for (let i = 0; i < 520; i++) { const z = -(GZ2 - GLASS_Z) + 0.1 + gr() * (GZ2 - GLASS_Z - 0.2), y = gr() * 3.2; GP.push(side * hw, y, z, 0.011, 0.1 + gr() * 0.08, 0, M.STATIC, 0, 0, 0, 0, 0, 0, 0, 0); }
        const gwall = { P: GP, n: GP.length / S, flows: [], things: [], core: [0, 0, 0], s: 1, kind: 'room-glasswall', hero: false, rigid: true };
        // nothing of this room shows through the doorway until you are through it (Dan, 2026-10-07)
        room(gwall, DX, GZ2 + 0.05, 0, palette([0, 0, 0], 'mono')).glassRoom = true;
        room(roomGlass(rng(303)), GX, GZ2 - 0.05, 0, palette([1, 8, 4]), { halo: true }).glassRoom = true;
        // the web in the doorway, for the page: its knots are the obstacles, in order
        web = forms.find((f) => f.kind === 'room-doorweb') || null;
        if (web) for (const k of web.marks) obstacles.push({ i: forms.indexOf(web), k, read: false });
        // the key, in every kind colour, hidden until the host calls it
        // THE GLOBE'S OWN SEVEN, as the vault globe wears them in the dark cosmos
        // (tokens.css, the night set), whatever theme the page is in, so the
        // key's circles are as vibrant as the notes on the globe (Dan, 2026-10-08)
        const KIND_NIGHT = [[157, 123, 255], [91, 200, 245], [232, 106, 106], [52, 211, 153], [244, 114, 182], [240, 228, 66], [122, 136, 136]];
        const kpal = { col: KIND_NIGHT.map(rgb), near: KIND_NIGHT.map((c) => rgb(mix(c, light, 0.18))) };
        // no glow on the key in the room (Dan, 2026-10-08); its colours glow once they are through the glass
        key = room(keyForm(rng(346), KIND_NIGHT.length), DX, GLASS_Z - 0.05, 0, kpal, {});
        key.keyHidden = true;
        key.centres.forEach((c, k) => keys.push(k)); }
      // where the host sits, where the seed rests (world points, for the page)
      ANCHOR.chair = [0.55, 0.62, RZ + 0.85];
      ANCHOR.moon = [0.33, 2.08, GLASS_Z + 0.09];
      ANCHOR.table = [0.25, 0.46, RZ + 0.5];
      Object.assign(TPOSE, {
        roomDark: V([0.2, 2.0, RZ - 8.0], [-0.35, 0.95, RZ + 1.8], [0, 1, 0], 0.5),
        roomWide: V([0.1, 1.8, RZ - 6.6], [-0.35, 0.95, RZ + 1.8], [0, 1, 0], 0.5),
        hearth: V([0.0, 1.55, RZ - 5.4], [-0.35, 0.95, RZ + 1.8], [0, 1, 0], 0.5),
        // "I like to begin by the fire": nearer the hearth, the dog and the
        // couch, with the chair (and the host in it) still well inside the
        // frame on a landscape screen: the chair lands about 70% across at
        // 16:9 and 77% at 4:3, the couch 19% and 8% (projected, never watched)
        fireside: V([-0.6, 1.35, RZ - 3.7], [-1.05, 0.8, RZ + 1.7], [0, 1, 0], 0.5),
        // "come a little closer": a quarter nearer the host than the fireside,
        // the chair where it was on screen (70% at 16:9, 77% at 4:3), the fire
        // and the dog still in view, the couch left behind (projected, never watched)
        closer: V([-0.45, 1.25, RZ - 2.4], [-0.6, 0.8, RZ + 1.8], [0, 1, 0], 0.5),
        // the door: from across the room, and a stop before the web; then through it
        // aimed a little left of the door, so the wall where the lines stack has room (seen 2026-10-08: names ran into the arch)
        doorNear: V([DX - 0.1, 1.3, GLASS_Z - 4.4], [DX - 0.35, 1.5, GLASS_Z], [0, 1, 0], 0.5, 0),
        doorThrough: V([DX, 1.25, GLASS_Z + 0.5], [GX - 0.3, 1.15, GZ2], [0, 1, 0], 0.5, 0.01),
        // the looking glass, in its own room now: toward it, into it, and out the other side
        glassNear: V([GX - 0.25, 1.2, GZ2 - 2.2], [GX, 1.12, GZ2 + 2], [0, 1, 0], 0.5, 0.02),
        glassIn: V([GX, 1.15, GZ2 - 0.35], [GX, 1.15, GZ2 + 6], [0, 1, 0], 0.5, -0.03),
        glassOut: V([GX - 0.65, 1.6, GZ2 + 5], [0, 0, 20], [0, 1, 0], 0.5, 0.02),
      });
      // ── the field beyond the glass (Dan, 2026-10-07)
      const standing = (list, f, x, z, pal, o) => { place(f, x, z, 0, pal); Object.assign(f, { spin: 0, bend: 0, noHalo: true, rigid: true }, o || {}); list.push(forms.length - 1); return f; };
      { const fc = [mix(ink, light, 0.9), mix(ink, light, 0.55)].concat(COS);
        standing(fieldForms, fieldGround(rng(343), COS.length), GX, FZ0 + FIELD_FWD, { col: fc.map(rgb), near: fc.map((c) => rgb(dark ? mix(c, light, 0.22) : mix(c, [0, 0, 0], 0.14))) }, { rigid: false, bend: 0.004 }); }
      // THE FIREFLIES. Gold, mostly, a few in other colours, low over the grass
      // and drifting, each on its own slow loop, blinking. A place you want to be.
      { const fr = rng(344), gold = oklchRgb(dark ? 0.86 : 0.7, 0.14, 88);
        // most of them near, where they are big enough to feel like company (a thin far row read as distant, 2026-10-07)
        for (let k = 0; k < 110; k++) {
          const z = 1.2 + 50 * Math.pow(fr(), 2.2), x = (fr() * 2 - 1) * (4 + z * 0.55);
          flies.push({ x: GX + x, y: fieldH(x, z) + 0.15 + fr() * 1.3, z: FZ0 + z, ph: fr() * TAU, w: 0.25 + fr() * 0.35, blink: 0.6 + fr() * 1.1, tint: fr() < 0.8 ? gold : COS[Math.floor(fr() * COS.length)] });
        } }
      Object.assign(TPOSE, {
        // in the field: low, among the lights, the horizon far off
        // on the ridge field: the rise ahead fills the lower half of the frame, the sky the upper
        // lower, and looking a little down, so the ground runs out under the bottom of the frame (Dan, 2026-10-08)
        fieldStand: V([GX + 0.3, 1.6, FZ0 + 1.5], [GX + 1.0, 1.75, FZ0 + 12], [0, 1, 0], 0.5, 0),
        fieldGaze: V([GX + 0.9, 1.7, FZ0 + 3.0], [GX + 2.4, 1.95, FZ0 + 14], [0, 1, 0], 0.46, -0.02),
        // and off, up and out toward the first world
        liftoff: V([DX + 2.5, 10.5, GLASS_Z + 22], [2, 6, GLASS_Z + 60], [0, 1, 0], 0.5, 0.03),
      });
      for (const pl of planets) pl.forms.sort((a, b) => a - b);
    }
    // the far stars
    const stars = [];
    if (tour) for (let k = 0; k < 700; k++) { const d = n3([rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1]), r = 260 + rand() * 120; stars.push(d[0] * r, d[1] * r + 20, d[2] * r + 60, 0.4 + rand() * 0.9, rand() * TAU); }
    if (tour) buildTour(); else {
    place(gate(rand, 2.3), 0, 0, 0, palette([8, 7, 1]));
    const bubbles = [];
    for (const h of HEROES) {
      place(h.make(rng(h.z * 100), h.s), h.x, h.z, h.yaw, palette(h.cos));
      bubbles.push({ x: h.x, z: h.z, r: h.s * 0.75 });
    }
    // GROVES, NOT WALLPAPER. The garden alternates density, opening, density,
    // revelation: clusters gathered along both sides of the way (one near each
    // hero, so the heroes stand in company rather than in a void), low forms
    // right at the edge of the way that sweep past the lens, a thinner
    // passage before the clearing, a backdrop grove behind it so the
    // conversation sits inside the garden, and a scatter of far silhouettes.
    const KINDS = ['orchard', 'spiral', 'canopy', 'flower', 'arch', 'lantern', 'reeds', 'bearer', 'shrub', 'shrub', 'seedling', 'seedling', 'flower', 'reeds', 'orb', 'orb', 'tower', 'mound', 'mound', 'orb'];
    const LOW = ['reeds', 'shrub', 'flower', 'seedling', 'reeds', 'shrub'];
    const blocked = (x, z, gap) => (Math.abs(x) < 1.0 && z < 27.5 && z > -3.5)
      || (x - CLEAR.x) ** 2 + (z - CLEAR.z) ** 2 < CLEAR.r * CLEAR.r
      || bubbles.some((b) => (b.x - x) ** 2 + (b.z - z) ** 2 < b.r * b.r)
      || forms.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < gap);
    const grow = (kind, x, z, sMul, tone) => {
      const s = ((kind === 'orchard' || kind === 'canopy' ? 1.1 : kind === 'seedling' || kind === 'shrub' ? 0.6 : 0.8) + rand() * 0.8) * (sMul || 1);
      const fam = Math.floor(rand() * COS.length);
      const t = tone == null ? rand() : tone;
      const mono = t < 0.18 ? 'mono' : t < 0.42 ? 'light' : false;
      place(ambient(rand, kind, s), x, z, rand() * TAU, palette([fam, fam + 2 + Math.floor(rand() * 5), fam + 6 + Math.floor(rand() * 5)], mono));
    };
    // cluster centres: along both sides, beside each hero, and behind the clearing
    const centres = [];
    for (let z = 1; z < 24; z += 2.6) for (const side of [-1, 1]) if (rand() < 0.8) centres.push({ x: side * (2.2 + rand() * 4.5), z: z + rand() * 1.5, n: 6 + Math.floor(rand() * 8), r: 1.6 + rand() * 1.0 });
    for (const h of HEROES) centres.push({ x: h.x + (h.x > 0 ? 1 : -1) * (h.s * 0.9 + 0.6), z: h.z + (rand() - 0.5) * 2, n: 7 + Math.floor(rand() * 5), r: 1.8 });
    for (let k = 0; k < 6; k++) centres.push({ x: -7 + k * 2.8 + (rand() - 0.5), z: 32.5 + rand() * 3.5, n: 8 + Math.floor(rand() * 6), r: 1.8 });   // the backdrop grove
    for (const c of centres) {
      for (let i = 0, tries = 0; i < c.n && tries < 60; tries++) {
        const a = rand() * TAU, rr = Math.sqrt(rand()) * c.r, x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr;
        if (z < -2 || blocked(x, z, 0.55)) continue;
        grow(KINDS[Math.floor(rand() * KINDS.length)], x, z, z > 31 ? 1.15 : 1);
        i++;
      }
    }
    // foreground: low forms right at the edge of the way, sweeping past the lens
    for (let z = -1.5; z < 26; z += 1.1) for (const side of [-1, 1]) {
      if (rand() < 0.45) continue;
      const x = side * (0.95 + rand() * 0.5);
      if (bubbles.some((b) => (b.x - x) ** 2 + (b.z - z) ** 2 < b.r * b.r * 0.5)) continue;
      grow(LOW[Math.floor(rand() * LOW.length)], x, z + rand() * 0.8, 0.9);
    }
    // the passage thins, and pales
    for (let k = 0; k < 8; k++) { const x = (rand() < 0.5 ? -1 : 1) * (1.6 + rand() * 3), z = 24 + rand() * 4.2; if (!blocked(x, z, 0.8)) grow(LOW[Math.floor(rand() * LOW.length)], x, z, 0.9, 0.3); }
    // far silhouettes, wide and deep: many simplified settlements and groves
    for (let k = 0, tries = 0; k < 104 && tries < 1400; tries++) {
      const z = 2 + 46 * rand(), x = (rand() * 2 - 1) * Math.min(18, 3 + z * 0.6);
      if (Math.abs(x) < 2.5 + z * 0.05 || blocked(x, z, 1.0)) continue;
      grow(KINDS[Math.floor(rand() * KINDS.length)], x, z, 1.1);
      k++;
    }
    // THE UPPER AIR (ambient(): bloomcloud, memorychain, nestedorb, bloomswarm,
    // hangingcanopy). Above the groves, beside every hero, between the towers,
    // beyond the precipice, over the backdrop grove behind the clearing, and
    // distant constellations in the far upper frame. Nothing hangs over the
    // way below head height, so the camera flies under and between them.
    const SKY = ['bloomcloud', 'memorychain', 'nestedorb', 'bloomswarm', 'hangingcanopy'];
    let skyN = 0;
    const sky = (kind, x, z, sMul) => {
      const s = (1.0 + rand() * 0.6) * (sMul || 1), fam = Math.floor(rand() * COS.length);
      place(ambient(rand, kind, s), x, z, rand() * TAU, palette([fam, fam + 1 + Math.floor(rand() * 3), fam + 5 + Math.floor(rand() * 4)]));
      skyN++;
    };
    for (const h of HEROES) sky(SKY[skyN % SKY.length], h.x + (h.x > 0 ? -1 : 1) * (1.7 + rand() * 1.3), h.z + (rand() - 0.5) * 3, 1.0);
    for (let z = 3; z < 26; z += 3.4) for (const side of [-1, 1]) if (rand() < 0.75) sky(SKY[Math.floor(rand() * SKY.length)], side * (3.4 + rand() * 4), z + rand() * 2, 1.1);
    for (let k = 0; k < 8; k++) sky(SKY[Math.floor(rand() * SKY.length)], (rand() * 2 - 1) * 14, 27 + rand() * 17, 1.5);
    for (let k = 0; k < 4; k++) sky(SKY[(k + 1) % SKY.length], -5 + k * 3.3 + (rand() - 0.5), 33 + rand() * 4, 1.2);
    for (let k = 0; k < 24; k++) sky('farlight', (rand() * 2 - 1) * 20, 6 + rand() * 42, 1.6);
    // a few grown things stand far behind the clearing too: what the member
    // will see over the seed's shoulder while they talk
    place(heroObservatory(rng(77), 2.2), -3.4, 34.5, 0.8, palette([1, 0, 5]));
    place(heroOrchard(rng(78), 1.9), 3.6, 33.2, 2.4, palette([2, 5, 0]));
    place(heroLibrary(rng(79), 1.8), 0.4, 36.5, 1.2, palette([5, 4, 1]));
    place(heroMakerBloom(rng(80), 1.7), 5.2, 35.8, 3.4, palette([4, 2, 5]));
    forms.sort((a, b) => b.z - a.z);
    }
    // the ground: a faint lattice, denser along the way
    const ground = [];
    if (!tour) for (let z = -6; z < 50; z += 1.1) for (let x = -18; x <= 18; x += 1.1) ground.push(x + (rand() - 0.5) * 0.7, z + (rand() - 0.5) * 0.7, 0.6 + rand() * 0.4);
    if (!tour) for (let z = -4; z < 28; z += 0.35) for (const x of [-0.55, 0.55]) ground.push(x + (rand() - 0.5) * 0.2, z, 1.6);
    const ringL = [];
    if (!tour) for (let k = 0; k < 20; k++) { const a = k / 20 * TAU; ringL.push(CLEAR.x + Math.cos(a) * CLEAR.r * 0.8, CLEAR.z + Math.sin(a) * CLEAR.r * 0.8, rand() * TAU); }

    // ── camera and mood ─────────────────────────────────────────────────
    const cam = Object.assign({ roll: 0 }, tour ? TPOSE.roomDark : POSE.dark);
    const away = (q) => tour ? Math.hypot(cam.x - (q.px == null ? q.x : q.px), cam.y - (q.py || 0), cam.z - (q.pz == null ? q.z : q.pz)) : Math.abs(q.z - cam.z);
    let raf = 0, began = performance.now(), last = 0;
    // ── THE FLIGHT. One authored course, not a chain of poses. ────────────
    // The camera used to ease from pose to pose with a cubic that starts and
    // ends at zero speed, so every waypoint was a brake to a stop and a
    // launch: keyframes, not flight. Now every move, the authored opening
    // and any later go(), is a cubic Hermite course through keys with
    // TANGENTS: the velocity leaving one key is the velocity entering the
    // next, so position, direction and speed are continuous everywhere. A
    // key's tangent is the time-weighted average of the chords either side
    // (Bessel's rule, which does not overshoot when legs differ in length);
    // `ease` scales it (1 flows straight through, lower slows into it, 0 is
    // a true rest, used only at the very start and the very end).
    const CHAN = tour ? ['x', 'y', 'z', 'tx', 'ty', 'tz', 'ux', 'uy', 'uz', 'hz', 'roll'] : ['x', 'y', 'z', 'yaw', 'pitch', 'hz', 'roll'];
    const LOOK = tour ? { tx: 1, ty: 1, tz: 1, ux: 1, uy: 1, uz: 1, hz: 1 } : { yaw: 1, pitch: 1, hz: 1 };
    const LEAD = 420;     // ms: the look leads the body, so it turns toward what is coming while it is still leaving what was
    let fl = null;        // { keys: [{t, v, m, frame, fd}], end }
    const prevCam = Object.assign({}, cam);
    const frameOff = { x: 0, yaw: 0 }, frameWant = { x: 0, yaw: 0 };
    function tangents(keys) {
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (k.m) continue;
        k.m = {};
        const a = keys[i - 1], b = keys[i + 1];
        for (const c of CHAN) {
          let m = 0;
          if (a && b) {
            const h0 = k.t - a.t, h1 = b.t - k.t, d0 = (k.v[c] - a.v[c]) / h0, d1 = (b.v[c] - k.v[c]) / h1;
            m = (d0 * h1 + d1 * h0) / (h0 + h1);
            // a local extreme (the crest, the bottom of a dive) keeps a little of its sweep rather than overshooting it
            if (d0 * d1 < 0) m *= 0.35;
          }
          k.m[c] = m * (k.ease == null ? 1 : k.ease);
        }
      }
    }
    function sample(keys, t, c) {
      if (t <= keys[0].t) return keys[0].v[c];
      const n = keys.length;
      if (t >= keys[n - 1].t) return keys[n - 1].v[c];
      let i = 0;
      while (i < n - 2 && t > keys[i + 1].t) i++;
      const a = keys[i], b = keys[i + 1], h = b.t - a.t, u = (t - a.t) / h, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * a.v[c] + (u3 - 2 * u2 + u) * h * a.m[c] + (-2 * u3 + 3 * u2) * b.v[c] + (u3 - u2) * h * b.m[c];
    }
    const mood = { rate: 0, flow: 0, lit: 0.12, dim: 0, secret: 0, K: 0, drift: 0 };
    const want = Object.assign({}, mood);
    let waveF = null, quietFn = null, qz = null, frameN = 0, leaning = false;
    const tw = new Map();
    const HALO = new Float32Array(5 * 6000);
    const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    let CW = 0, CH = 0, dpr = 1, narrow = false;
    function fit() { dpr = Math.min(2, window.devicePixelRatio || 1); CW = canvas.clientWidth; CH = canvas.clientHeight; narrow = CW < 720; canvas.width = Math.round(CW * dpr); canvas.height = Math.round(CH * dpr); }
    function poseOf(name) {
      const p = typeof name === 'string' ? (tour ? TPOSE[name] : POSE[name]) : name;
      if (!p) return null;
      const o = narrow && typeof name === 'string' && NARROW[name] ? Object.assign({ roll: 0 }, p, NARROW[name]) : Object.assign({ roll: 0 }, p);
      if (still) o.roll = 0;   // less motion asked for: a level horizon, always
      return o;
    }

    // ── motion: what each class does with time ──────────────────────────
    const out = [0, 0, 0];
    let curWake = 1, curAcc = 0;   // the form being drawn: how awake it is, and its own clock
    function motion(P, o, t, A) {
      let dx = 0, dy = 0, dz = 0;
      const bw = P[o + 13];
      if (bw) { const bp = P[o + 14]; dx += A * bw * Math.sin(t * 0.45 + bp); dz += A * bw * 0.55 * Math.cos(t * 0.37 + bp * 1.3); }
      const m = P[o + 6], ph = P[o + 7], w = P[o + 8];
      switch (m) {
        case M.PEND: {
          const L = w, q = P[o + 12] || 1, freq = Math.min(1.0, 1.1 / Math.sqrt(Math.max(0.03, L / 0.12)) / Math.sqrt(q)), amp = 0.2 / q;
          const a1 = amp * Math.sin(t * freq + ph), a2 = amp * 0.5 * Math.sin(t * freq * 0.83 + ph + 1.3);
          const ox = P[o] - P[o + 9], oy = P[o + 1] - P[o + 10], oz = P[o + 2] - P[o + 11];
          // rotate the rest offset about the pivot: a little in x, a little in z
          const rx = ox + oy * Math.sin(a1), rz = oz + oy * Math.sin(a2), ry = oy * Math.cos(a1) * Math.cos(a2);
          dx += rx - ox; dy += ry - oy; dz += rz - oz;
          break;
        }
        case M.VINE: dx += A * 1.3 * w * Math.sin(t * 0.8 + ph); dz += A * 0.7 * w * Math.sin(t * 0.55 + ph * 2); dy += A * 0.25 * w * Math.sin(t * 1.1 + ph); break;
        case M.LEAF: dy += A * 0.6 * w * Math.sin(t * 0.4 + ph) + A * 0.08 * w * Math.sin(t * 1.1 + ph * 3); dx += A * 0.22 * w * Math.sin(t * 0.33 + ph); break;
        case M.FROND: dx += A * 1.1 * w * Math.sin(t * 0.85 + ph); dz += A * 0.5 * w * Math.cos(t * 0.62 + ph); break;
        case M.REED: { const k = w * w; dx += A * 1.6 * k * Math.sin(t * 1.0 + ph); dz += A * 0.5 * k * Math.sin(t * 0.7 + ph * 0.5); break; }
        case M.PETAL: {
          const q = P[o + 12], open = q ? 0.5 + 0.5 * Math.sin(t * q + ph) : 1, g = (0.78 + 0.22 * open) + 0.01 * Math.sin(t * 1.6 + ph * 5 + w * 9);
          dx += (P[o] - P[o + 9]) * (g - 1); dy += (P[o + 1] - P[o + 10]) * (g - 1) * 0.6; dz += (P[o + 2] - P[o + 11]) * (g - 1);
          break;
        }
        case M.TWIST: {
          const q = P[o + 12] || 0.1, th = q * w * Math.sin(t * 0.25 + ph), c = Math.cos(th), s = Math.sin(th);
          const rx = P[o] - P[o + 9], rz = P[o + 2] - P[o + 11];
          dx += rx * c - rz * s - rx; dz += rx * s + rz * c - rz; dy += A * 0.2 * w * Math.sin(t * 0.3 + ph);
          break;
        }
        case M.HEAVY: dx += A * 0.3 * Math.sin(t * 0.3 + ph); dy += A * 0.12 * Math.sin(t * 0.43 + ph); break;
        case M.ORBIT: { const sp = P[o + 12], a = t * sp * 2 + ph, tilt = 0.25 * Math.sin(ph); dx += P[o + 9] + Math.cos(a) * w - P[o]; dz += P[o + 11] + Math.sin(a) * w * Math.cos(tilt) - P[o + 2]; dy += Math.sin(a) * w * Math.sin(tilt); break; }
        case M.FLAME: {
          // rising through its band and starting again, wavering as it goes
          const u = (t * P[o + 12] + ph) % 1;
          dy += w * u * (0.55 + 0.45 * curWake); dx += 0.035 * u * Math.sin(t * 4.2 + ph * 17); dz += 0.02 * u * Math.cos(t * 3.1 + ph * 11);
          break;
        }
        // a lying dog's tail: it lifts off the floor and flops back, more toward the tip; awake it thumps, asleep it twitches now and then
        case M.WAG: { const beat = curWake * (0.5 + 0.5 * Math.sin(t * 6.5)) + (1 - curWake) * 0.35 * Math.pow(Math.max(0, Math.sin(t * 0.55)), 8); dy += w * ph * beat; break; }
        case M.LIFT: dy += w * curWake + 0.004 * Math.sin(t + ph); dz -= w * 0.35 * curWake; break;
        case M.RISE: dy += w * curWake + 0.02 * curWake * Math.sin(t * 0.9 + ph); dx += 0.015 * curWake * Math.sin(t * 0.6 + ph); break;
        case M.BLOOM: { const g = 0.25 + 0.75 * curWake + 0.03 * curWake * Math.sin(t * 1.2 + ph); dx += (P[o] - P[o + 9]) * (g - 1); dy += (P[o + 1] - P[o + 10]) * (g - 1); dz += (P[o + 2] - P[o + 11]) * (g - 1); break; }
        case M.SCURRY: dx += w * Math.sin(curAcc * 1.1 + ph) - w; dy += 0.012 * Math.abs(Math.sin(curAcc * 9)) * curWake; break;
        case M.TICK: {
          const nx = Math.sin(w) * Math.cos(ph), ny = Math.cos(w), nz = Math.sin(w) * Math.sin(ph);
          const th = curAcc * P[o + 12], c = Math.cos(th), sn = Math.sin(th);
          const vx = P[o] - P[o + 9], vy = P[o + 1] - P[o + 10], vz = P[o + 2] - P[o + 11], dot = nx * vx + ny * vy + nz * vz;
          dx += vx * c + (ny * vz - nz * vy) * sn + nx * dot * (1 - c) - vx;
          dy += vy * c + (nz * vx - nx * vz) * sn + ny * dot * (1 - c) - vy;
          dz += vz * c + (nx * vy - ny * vx) * sn + nz * dot * (1 - c) - vz;
          break;
        }
        case M.BREATHE: { const k = w * Math.sin(t * P[o + 12] + ph); dx += (P[o] - P[o + 9]) * k; dy += (P[o + 1] - P[o + 10]) * k * 0.6; dz += (P[o + 2] - P[o + 11]) * k; break; }
        case M.SPIN: {
          // a rigid turn about an axis through the pivot: tilt w from vertical, toward azimuth ph, at q rad/s
          const nx = Math.sin(w) * Math.cos(ph), ny = Math.cos(w), nz = Math.sin(w) * Math.sin(ph);
          const th = t * P[o + 12], c = Math.cos(th), sn = Math.sin(th);
          const vx = P[o] - P[o + 9], vy = P[o + 1] - P[o + 10], vz = P[o + 2] - P[o + 11], dot = nx * vx + ny * vy + nz * vz;
          dx += vx * c + (ny * vz - nz * vy) * sn + nx * dot * (1 - c) - vx;
          dy += vy * c + (nz * vx - nx * vz) * sn + ny * dot * (1 - c) - vy;
          dz += vz * c + (nx * vy - ny * vx) * sn + nz * dot * (1 - c) - vz;
          break;
        }
        case M.PAGE: { const lift = Math.max(0, Math.sin(t * 0.21 + P[o + 12])) ** 10 * w; dx += A * 0.3 * Math.sin(t * 1.2 + ph) + lift * 0.5 * Math.sin(t * 0.9 + ph); dy += lift; break; }
        default: break;
      }
      out[0] = dx; out[1] = dy; out[2] = dz;
      return out;
    }

    function frame(now) {
      raf = 0;
      if (!canvas.isConnected) return;
      if (!CW) fit();
      const dt = Math.min(0.1, (now - last) / 1000) || 0.016;
      const flying = !!fl && now < fl.end;
      if (fl) {
        for (const c of CHAN) cam[c] = sample(fl.keys, LOOK[c] ? Math.min(fl.end, now + LEAD) : now, c);
        // BANK FROM THE TURN. On top of each key's authored roll, the camera
        // leans into its own change of heading, the way anything that flies
        // does; restrained, and never under reduced motion.
        const yawRate = tour ? 0 : (sample(fl.keys, Math.min(fl.end, now + LEAD + 120), 'yaw') - sample(fl.keys, Math.min(fl.end, now + LEAD), 'yaw')) / 120;
        cam.roll += Math.max(-0.07, Math.min(0.07, yawRate * 260));
        // FRAMED RESTS, CONTINUOUSLY. A key marked `frame` is where the host
        // stands in front of the world; the quietest nearby framing for it is
        // measured once, a few seconds out, and the camera eases toward that
        // small offset and away again, so composition is a drift, never a jump.
        if (!tour && (frameN % 15) === 0) {
          let want = null;
          for (const k of fl.keys) {
            if (!k.frame || now < k.t - 3200 || now > k.t + (k.hold || 2500)) continue;
            if (!k.fd) { try { const b = framed(k.v); k.fd = { x: b.x - k.v.x, yaw: b.yaw - k.v.yaw }; } catch (_) { k.fd = { x: 0, yaw: 0 }; } }
            want = k.fd; break;
          }
          frameWant.x = want ? want.x : 0; frameWant.yaw = want ? want.yaw : 0;
        }
      }
      frameOff.x += (frameWant.x - frameOff.x) * Math.min(1, dt * 0.9);
      frameOff.yaw += (frameWant.yaw - frameOff.yaw) * Math.min(1, dt * 0.9);
      cam.x += frameOff.x; cam.yaw += frameOff.yaw;
      if (tour) for (const pl of planets) {
        const dx = cam.x - pl.C[0], dy = cam.y - pl.C[1], dz = cam.z - pl.C[2], dl = Math.hypot(dx, dy, dz), min = pl.R + 0.45;
        if (dl < min && dl > 1e-6) { cam.x = pl.C[0] + dx / dl * min; cam.y = pl.C[1] + dy / dl * min; cam.z = pl.C[2] + dz / dl * min; }
      }
      for (const key in want) mood[key] += (want[key] - mood[key]) * Math.min(1, dt * (key === 'K' ? 1.2 : 0.9));
      if (tour) for (const i of roomForms) { const p = forms[i]; if (p.wakeWant == null) continue; const goal = p.nudgeUntil && now < p.nudgeUntil ? Math.max(p.wakeWant, p.nudgeTo || 1) : p.wakeWant; p.wake += (goal - p.wake) * Math.min(1, dt * (goal > p.wake ? 1.6 : 0.7)); p.acc = (p.acc || 0) + dt * (p.accRate || 1) * (p.accBase || 0) + dt * (p.accRate || 1) * p.wake; }
      if (leaning) { let moving = false; for (const p of forms) { const g = p.glowWant || 1; if (Math.abs((p.glow || 1) - g) > 0.003) { p.glow = (p.glow || 1) + (g - (p.glow || 1)) * Math.min(1, dt * 0.6); moving = true; } } if (!moving) leaning = false; }
      const t = (now - began) / 1000;
      // THE DRIFT NEVER STOPS (the potted garden's one camera habit): a slow
      // breath of position and heading under everything, so the world is never
      // frozen, even at a rest. `drift` in the mood widens it.
      if (!still) {
        const dr = 0.18 + mood.drift;
        cam.x += Math.sin(t * 0.09) * 0.16 * dr;
        cam.y += Math.sin(t * 0.07 + 1.3) * 0.06 * dr;
        cam.yaw += Math.sin(t * 0.05 + 0.4) * 0.018 * dr;
      }
      for (const c of CHAN) prevCam[c] = cam[c];
      // twinkle: rare, asynchronous, more in the reveal
      if (mood.rate > 0.05 && !still) {
        const wantHits = mood.rate * dt;
        for (let i = 0; i < 4 && rand() < wantHits - i; i++) {
          const p = Math.floor(rand() * forms.length), f = forms[p];
          if (away(f) > 26) continue;
          tw.set(p * 65536 + Math.floor(rand() * f.n), { t: now, glow: rand() < 0.4 });
        }
      }
      // a wave passing through a grove
      if (waveF && !still) {
        const u = (now - waveF.t0) / waveF.dur;
        if (u > 1) waveF = null;
        else {
          const fx = -9 + 18 * u;
          forms.forEach((f, p) => { if (f.z >= waveF.z0 && f.z <= waveF.z1 && Math.abs(f.x - fx) < 1.4 && rand() < 0.5) tw.set(p * 65536 + Math.floor(rand() * f.n), { t: now, glow: true }); });
        }
      }
      // energy travelling through the heroes: root, trunk, branch, fruit
      if (mood.flow > 0.05 && !still) {
        forms.forEach((f, p) => {
          if (!f.flows.length || !f.hero) return;
          if (now > f.nextFlow && away(f) < 12) {
            f.pulses.push({ path: f.flows[Math.floor(rand() * f.flows.length)], t0: now, dur: f.flowDur || 2600 });
            f.nextFlow = now + (1400 + rand() * 3000) / Math.max(0.2, mood.flow * (f.flowRate || 0.5) * 2);
          }
          f.pulses = f.pulses.filter((pu) => now - pu.t0 < pu.dur);
          for (const pu of f.pulses) {
            const head = Math.floor((now - pu.t0) / pu.dur * pu.path.length);
            for (let j = Math.max(0, head - 1); j <= Math.min(pu.path.length - 1, head + 1); j++) { const key = p * 65536 + pu.path[j]; if (!tw.has(key)) tw.set(key, { t: now, glow: j === head }); }
          }
        });
      }
      last = now;
      if ((frameN++ % 6) === 0) { try { qz = quietFn ? quietFn() : null; } catch (_) { qz = null; } }
      draw(now, t);
      if (!still || flying || Math.abs(mood.K - want.K) > 0.002) raf = requestAnimationFrame(frame);
    }

    // ── the projection camera. Normally `cam`; a framing search (below) sets a
    // trial pose here, measures, and sets `cam` back. The trig is computed once
    // per camera, never per node. ─────────────────────────────────────────
    const pt = [0, 0, 0];
    let pc = cam, f = 1, cx = 0, hy = 0, pcy = 1, psy = 0, pcp = 1, psp = 0, pcr = 1, psr = 0, K = 0;
    let pRx = 1, pRy = 0, pRz = 0, pUx = 0, pUy = 1, pUz = 0, pFx = 0, pFy = 0, pFz = 1;
    function setCam(c) {
      pc = c; f = CH * 1.05; cx = CW / 2; hy = CH * (c.hz == null ? 0.5 : c.hz);
      pcy = Math.cos(c.yaw); psy = Math.sin(c.yaw); pcp = Math.cos(c.pitch); psp = Math.sin(c.pitch);
      const r = c.roll || 0; pcr = Math.cos(r); psr = Math.sin(r);
      if (tour) {
        const F = n3([c.tx - c.x, c.ty - c.y, c.tz - c.z]);
        let Rv = x3([c.ux, c.uy, c.uz], F); if (Math.hypot(Rv[0], Rv[1], Rv[2]) < 1e-3) Rv = x3([0, 1, 0], F); if (Math.hypot(Rv[0], Rv[1], Rv[2]) < 1e-3) Rv = [1, 0, 0];
        Rv = n3(Rv); const U = x3(F, Rv);
        pRx = Rv[0]; pRy = Rv[1]; pRz = Rv[2]; pUx = U[0]; pUy = U[1]; pUz = U[2]; pFx = F[0]; pFy = F[1]; pFz = F[2];
      }
    }
    // world → screen, through the curve of the world when it is bending into a
    // sphere, then through the camera's bank
    const project = (wx, wy, wz) => {
      if (tour) {
        const dx = wx - pc.x, dy = wy - pc.y, dz = wz - pc.z;
        const vx = dx * pRx + dy * pRy + dz * pRz, vy = dx * pUx + dy * pUy + dz * pUz, d = dx * pFx + dy * pFy + dz * pFz;
        const sx = vx * f / d, sy2 = -vy * f / d;
        pt[0] = cx + sx * pcr - sy2 * psr; pt[1] = hy + sx * psr + sy2 * pcr; pt[2] = d;
        return pt;
      }
      if (K > 1e-4) {
        const rx = wx - CLEAR.x, rz = wz - CLEAR.z, rho = Math.hypot(rx, rz), th = rho * K;
        if (th > 2.6) { pt[2] = -1; return pt; }
        const cth = Math.cos(th), sth = Math.sin(th), Rr = 1 / K;
        const y2 = (cth - 1) * Rr + wy * cth, rho2 = sth * Rr + wy * sth, u = rho > 1e-6 ? rho2 / rho : 0;
        wx = CLEAR.x + rx * u; wz = CLEAR.z + rz * u; wy = y2;
      }
      const dx = wx - pc.x, dz = wz - pc.z, vy0 = wy - pc.y;
      const vx = dx * pcy - dz * psy, d0 = dx * psy + dz * pcy;
      const vy = vy0 * pcp - d0 * psp, d = vy0 * psp + d0 * pcp;
      const sx = vx * f / d, sy2 = -vy * f / d;
      pt[0] = cx + sx * pcr - sy2 * psr; pt[1] = hy + sx * psr + sy2 * pcr; pt[2] = d;
      return pt;
    };
    // ── level of detail that answers the machine, not a guess about it (the
    // gallery renderer's rung, sea-art-dev.js): the draw is timed, and when its
    // recent p95 crosses the budget the far tiers thin and the small halos go;
    // when it comes back under, they return. The close-up can be expensive;
    // the whole world cannot. ─────────────────────────────────────────────
    const lod = { rung: 0, haloMinR: 0.9, farStride: 1, motionEdge: 1, times: [], at: 0 };
    const LOD_BUDGET = 11;   // ms of script per frame, before rasterisation
    function lodTick(ms) {
      lod.times[lod.at++ % 40] = ms;
      if (lod.at % 40 !== 0) return;
      const s = lod.times.slice().sort((a, b) => a - b), p95 = s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
      if (p95 > LOD_BUDGET && lod.rung < 2) { lod.rung++; }
      else if (p95 < LOD_BUDGET * 0.6 && lod.rung > 0) { lod.rung--; }
      lod.haloMinR = lod.rung === 0 ? 0.9 : lod.rung === 1 ? 1.6 : 3;
      lod.farStride = lod.rung === 0 ? 1 : lod.rung === 1 ? 2 : 3;
      // a struggling machine also animates a shorter way out (the fade keeps it from popping)
      lod.motionEdge = lod.rung === 0 ? 1 : lod.rung === 1 ? 0.8 : 0.62;
    }
    // HOW CLUTTERED IS THIS WINDOW FROM THIS POSE. A coarse sample of the
    // world projected through a trial camera: nodes that fall inside the
    // circle count, accents and heroes count more, so a bright focal point
    // behind the host's head weighs more than a quiet trunk.
    function clutter(trial, zone) {
      setCam(trial);
      let sum = 0;
      const far = 8 + 16 * mood.lit;
      for (const p of forms) {
        const q0 = project(p.x, 0, p.z);
        if (q0[2] < -3 || q0[2] > far + 8) continue;
        const P = p.P, c1 = p.c1, s1 = p.s1, w = p.hero ? 1.6 : 1, stride = Math.max(4, Math.floor(p.n / 60));
        for (let k = 0; k < p.n; k += stride) {
          const o = k * S, lx = P[o], ly = P[o + 1], lz = P[o + 2];
          const q = project(p.x + lx * c1 - lz * s1, ly, p.z + lx * s1 + lz * c1);
          if (q[2] < 0.25) continue;
          const dq = Math.hypot(q[0] - zone.x, q[1] - zone.y);
          if (dq < zone.r) sum += w * (P[o + 5] >= 2 ? 2 : 1) * (1 - 0.5 * dq / zone.r) * stride * Math.min(1, 6 / q[2]);
        }
      }
      setCam(cam);
      return sum;
    }

    // ── drawing the tour: stars, then each globe far to near: its body and
    // limb, its coasts, its grown things far to near, then its names ──────
    // THE RAIL'S TWINKLE, IN FLIGHT (globe.js sparkOf): waves every 460ms, a
    // fixed 16% of a region's notes take part in each, each lasting 460ms on a
    // sine, starting within 600ms of its wave, growing to 1.75 times; 30% of
    // those glow. A region twinkles while we are over it, fading in faster
    // than it fades out, exactly as when it is chosen in the rail.
    const hr = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    function sparkAmp(seed, el) {
      const w0 = Math.floor(el / 460); let amp = 0, glow = false;
      for (let w = Math.max(0, w0 - 2); w <= w0; w++) {
        if (hr(seed, w, 0) >= 0.16) continue;
        const tt = (el - w * 460 - hr(seed, w, 1) * 600) / 460;
        if (tt > 0 && tt < 1) { const a = Math.sin(Math.PI * tt); if (a > amp) { amp = a; glow = hr(seed, w, 2) < 0.3; } }
      }
      SPK[0] = amp; SPK[1] = glow ? 1 : 0;
      return SPK;
    }
    const SPK = [0, 0];
    let tourLast = 0;
    function body(pl, d) {
      if (pl.void) return;
      const C = pl.C, R = pl.R;
      if (d <= R * 1.002) return;
      const v = [(cam.x - C[0]) / d, (cam.y - C[1]) / d, (cam.z - C[2]) / d], k = R / d;
      const cc = [C[0] + v[0] * R * k, C[1] + v[1] * R * k, C[2] + v[2] * R * k], rh = R * Math.sqrt(1 - k * k);
      let e1 = x3(v, [0, 1, 0]); if (Math.hypot(e1[0], e1[1], e1[2]) < 0.2) e1 = x3(v, [1, 0, 0]); e1 = n3(e1); const e2 = x3(v, e1);
      const pts = []; let vis = 0;
      for (let i = 0; i < 120; i++) {
        const a = i / 120 * TAU, c = Math.cos(a) * rh, s = Math.sin(a) * rh;
        const q = project(cc[0] + e1[0] * c + e2[0] * s, cc[1] + e1[1] * c + e2[1] * s, cc[2] + e1[2] * c + e2[2] * s);
        const ok = q[2] > 0.05; if (ok) vis++;
        pts.push([q[0], q[1], ok]);
      }
      if (!vis) return;
      const lit = mood.lit;
      ctx.beginPath();
      let arc = pts.filter((p) => p[2]);
      if (vis === pts.length) { pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); }
      else {
        // close to the surface: the horizon is an arc, and the globe is below it
        arc = arc.sort((a, b) => a[0] - b[0]);
        ctx.moveTo(-40, arc[0][1]); arc.forEach((p) => ctx.lineTo(p[0], p[1])); ctx.lineTo(CW + 40, arc[arc.length - 1][1]); ctx.lineTo(CW + 40, CH + 40); ctx.lineTo(-40, CH + 40); ctx.closePath();
      }
      if (!pl.ink) {
        const q0 = project(C[0], C[1], C[2]), cx0 = q0[2] > 0 ? q0[0] : CW / 2, cy0 = q0[2] > 0 ? q0[1] : CH;
        let rr = 0; for (const p of arc) rr = Math.max(rr, Math.hypot(p[0] - cx0, p[1] - cy0));
        const g = ctx.createRadialGradient(cx0 - rr * 0.18, cy0 - rr * 0.22, rr * 0.05, cx0, cy0, Math.max(1, rr));
        if (pl.build) { g.addColorStop(0, 'rgba(' + mix(GREEN, [30, 40, 60], 0.55).join(',') + ',.45)'); g.addColorStop(0.62, 'rgba(' + mix(GREEN, [20, 28, 44], 0.7).join(',') + ',.5)'); g.addColorStop(1, 'rgba(' + mix(GREEN, [16, 20, 36], 0.78).join(',') + ',.58)'); }
        else { g.addColorStop(0, G.core || 'rgba(60,70,140,.5)'); g.addColorStop(0.62, G.mid || 'rgba(43,43,98,.55)'); g.addColorStop(1, G.edge || 'rgba(30,30,70,.6)'); }
        ctx.globalAlpha = Math.min(1, lit * 1.1) * (pl.young ? 0.8 : 1);
        ctx.fillStyle = g; ctx.fill();
      }
      // the limb: a thin rim of light round the visible edge
      ctx.globalAlpha = Math.min(1, lit * 1.2) * (pl.ink ? 0.8 : 0.7);
      ctx.strokeStyle = pl.build ? GREEN_CSS : pl.ink ? (G.ink3 || rgb(ink)) : (G.limb || G.rim || rgb(ink)); ctx.lineWidth = pl.ink ? 1 : pl.build ? 2 : 1.6;
      ctx.beginPath();
      let pen0 = false;
      for (const p of (vis === pts.length ? pts.concat([pts[0]]) : arc)) { if (!pen0) { ctx.moveTo(p[0], p[1]); pen0 = true; } else ctx.lineTo(p[0], p[1]); }
      ctx.stroke();
    }
    const facingAt = (pl, p) => { const lx = cam.x - pl.C[0] - p[0], ly = cam.y - pl.C[1] - p[1], lz = cam.z - pl.C[2] - p[2], dl = Math.hypot(lx, ly, lz) || 1; return (p[0] * lx + p[1] * ly + p[2] * lz) / (pl.R * dl); };
    function coasts(pl) {
      for (const rg of pl.regions) {
        // the fill first: only when the whole coast faces us, the way the app fills a land
        const pts = [];
        let all = true;
        for (const p of rg.coast) { const fa = facingAt(pl, p); if (fa <= 0.02) { all = false; break; } const q = project(pl.C[0] + p[0], pl.C[1] + p[1], pl.C[2] + p[2]); if (q[2] < 0.1) { all = false; break; } pts.push([q[0], q[1]]); }
        if (all && pts.length) {
          ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath();
          ctx.globalAlpha = Math.min(1, mood.lit) * (pl.ink ? 0.05 : 0.1 + 0.08 * rg.spark);
          ctx.fillStyle = pl.ink ? (G.ink3 || rgb(ink)) : (G.coastFill || rg.col); ctx.fill();
        }
        ctx.strokeStyle = rg.col; ctx.lineWidth = pl.ink ? 1 : 1.5;
        if (pl.ink) ctx.setLineDash([5, 6]);
        let open = false, lastA = 0;
        ctx.beginPath();
        for (let i = 0; i <= rg.coast.length; i++) {
          const p = rg.coast[i % rg.coast.length], fa = facingAt(pl, p);
          if (fa <= 0.02) { open = false; continue; }
          const q = project(pl.C[0] + p[0], pl.C[1] + p[1], pl.C[2] + p[2]);
          if (q[2] < 0.1) { open = false; continue; }
          if (!open) { ctx.moveTo(q[0], q[1]); open = true; } else ctx.lineTo(q[0], q[1]);
          lastA = Math.max(lastA, fa);
        }
        ctx.globalAlpha = Math.min(1, mood.lit) * (0.35 + 0.45 * Math.min(1, lastA * 1.6)) * (0.6 + 0.4 * rg.spark);
        ctx.stroke();
        if (pl.ink) ctx.setLineDash([]);
      }
    }
    // the connections, as fine arcs lifted a little off the surface, a touch soft;
    // in ink they are the pen's own line, thinner and more of them visible
    function webs(pl) {
      ctx.lineWidth = pl.ink ? 0.7 : 0.8;
      for (const rg of pl.regions) {
        ctx.strokeStyle = pl.ink ? (G.ink2 || rgb(ink)) : rg.col;
        ctx.globalAlpha = Math.min(1, mood.lit) * (pl.ink ? 0.32 : 0.2 + 0.18 * rg.spark);
        ctx.beginPath();
        for (const [A, B, far] of rg.links) {
          if (facingAt(pl, A) <= 0.05 || facingAt(pl, B) <= 0.05) continue;
          const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, mz = (A[2] + B[2]) / 2, ml = Math.hypot(mx, my, mz) || 1, lift = pl.R * (far ? 1.06 : 1.015) / ml;
          const a = project(pl.C[0] + A[0], pl.C[1] + A[1], pl.C[2] + A[2]); const ax = a[0], ay = a[1], az = a[2];
          const m = project(pl.C[0] + mx * lift, pl.C[1] + my * lift, pl.C[2] + mz * lift); const cx2 = m[0], cy2 = m[1];
          const b = project(pl.C[0] + B[0], pl.C[1] + B[1], pl.C[2] + B[2]);
          if (az < 0.1 || b[2] < 0.1) continue;
          ctx.moveTo(ax, ay); ctx.quadraticCurveTo(cx2, cy2, b[0], b[1]);
        }
        ctx.stroke();
      }
    }
    function names(pl) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const rg of pl.regions) {
        const fa = facingAt(pl, rg.label);
        if (fa < 0.2) continue;
        const q = project(pl.C[0] + rg.label[0], pl.C[1] + rg.label[1], pl.C[2] + rg.label[2]);
        if (q[2] < 0.3 || q[2] > 70) continue;
        const px = Math.max(11, Math.min(22, f * 0.24 / q[2]));
        const a = Math.min(1, mood.lit) * Math.min(1, (fa - 0.2) * 3) * Math.min(1, (70 - q[2]) / 25) * (1 - 0.6 * mood.dim);
        if (a < 0.03) continue;
        ctx.font = px.toFixed(1) + 'px ' + (G.font || 'sans-serif');
        ctx.globalAlpha = a * 0.9; ctx.lineWidth = 3.5; ctx.strokeStyle = G.paper || 'rgba(0,0,0,.6)'; ctx.lineJoin = 'round';
        ctx.strokeText(rg.name, q[0], q[1] - px * 0.9);
        ctx.globalAlpha = a; ctx.fillStyle = pl.ink ? (G.ink2 || rgb(ink)) : (G.landLab || rgb(ink));
        ctx.fillText(rg.name, q[0], q[1] - px * 0.9);
      }
    }
    function drawTour(drawForm, now, t) {
      const dt = Math.min(0.1, (now - (tourLast || now)) / 1000); tourLast = now;
      // THE WEB PARTS when the host opens the door: each knot slides out
      // toward the frame and a little into the wall, fading, its satellites
      // with it, the lines following their ends. Done here, before the room
      // is drawn, because the door is one of the room's own things.
      // THE KEY swirls in from all round the door and settles into its shape,
      // then turns toward the lock: slides to the right post, shrinks, and
      // fades as the door gives.
      // THE KEY, FRAME BY FRAME (Dan, 2026-10-08). The circles: up out of
      // their own places on the key, swelling, then easing back down. The
      // sculpture: nothing until the flurry, then every node on its own cue,
      // rising and swelling as it fades in and settling back. The lock: the
      // whole key slides along the wall to the right post, shrinks and fades
      // as the door gives.
      if (key && !key.keyHidden) {
        const P = key.P, P0 = key.P0;
        let tx = 0, ty = 0, tz = 0, sc = 1, fade = 1;
        if (keyAnim) {
          const u = Math.max(0, Math.min(1, (now - keyAnim.t0) / keyAnim.dur)), e = u * u * (3 - 2 * u);
          sc = 1 - 0.65 * e; fade = 1 - Math.max(0, (u - 0.6) / 0.4);
          tx = (DOOR_W + 0.08 - KEY_X) * e; ty = (1.0 - KEY_Y) * e; tz = -0.5 * Math.sin(Math.PI * u);
          if (u >= 1) { key.keyHidden = true; keyAnim = null; }
        }
        const lock = (x, y, z) => [KEY_X + (x - KEY_X) * sc + tx, KEY_Y + (y - KEY_Y) * sc + ty, z + tz];
        if (key.flurry || keyAnim) {
          const age = key.flurry ? (now - key.flurry.t0) / key.flurry.dur : 2;
          for (let i = 0; i < key.sculptN; i++) {
            const o = i * S;
            if (P0[o + 6] === M.CORE) continue;
            // its moment: fades in as it rises and swells, then settles back where it belongs
            const v = key.flurry ? Math.max(0, Math.min(1, (age - key.cue[i]) / 0.2)) : 1, bump = Math.sin(Math.PI * v);
            let x = P0[o], y = P0[o + 1] + 0.07 * bump, z = P0[o + 2] - 0.06 * bump, r = P0[o + 3] * (1 + 1.6 * bump);
            if (keyAnim) { const q = lock(x, y, z); x = q[0]; y = q[1]; z = q[2]; r *= (0.6 + 0.4 * sc); }
            P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = r;
            P[o + 4] = P0[o + 4] * Math.min(1, v * 2.5) * fade;
          }
          if (key.flurry && age >= 1.05) key.flurry = null;
        }
        key.flyState.forEach((s, k) => {
          const o = key.fly[k] * S, age = now - s.t0;
          if (s.phase === 'off') { P[o + 4] = 0; return; }
          const top = [s.to[0], s.to[1] + 0.24, s.to[2] - 0.3];
          let x, y, z, r, a = 1;
          if (s.phase === 'up') {
            const u = Math.min(1, age / 650), e = u * u * (3 - 2 * u);
            x = s.to[0] + (top[0] - s.to[0]) * e; y = s.to[1] + (top[1] - s.to[1]) * e; z = s.to[2] + (top[2] - s.to[2]) * e; r = 0.02 + 0.05 * e; a = Math.min(1, age / 250);
          } else if (s.phase === 'down') {
            const u = Math.min(1, age / 900), e = u * u * (3 - 2 * u);
            x = top[0] + (s.to[0] - top[0]) * e; y = top[1] + (s.to[1] - top[1]) * e; z = top[2] + (s.to[2] - top[2]) * e; r = 0.07 + (0.02 - 0.07) * e;
            if (u >= 1) s.phase = 'landed';
          } else { x = s.to[0]; y = s.to[1]; z = s.to[2]; r = 0.02; }
          if (keyAnim) { const q = lock(x, y, z); x = q[0]; y = q[1]; z = q[2]; r *= (0.6 + 0.4 * sc); }
          P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = r; P[o + 4] = a * fade;
        });
      }
      if (doorOpen && web) {
        const u = Math.max(0, Math.min(1, (now - doorOpen.t0) / doorOpen.dur)), e = u * u * (3 - 2 * u), P = web.P, pins = web.pins;
        const ends = pins.nodes.filter((n) => n.of == null);
        const at = (n) => { const dx = n.x, dy = n.y - DOOR_H * 0.5, L = Math.hypot(dx, dy) || 1, k = e * (DOOR_W + 0.7); return [n.x + dx / L * k, n.y + dy / L * k * 0.6, n.z + e * 0.3]; };
        const moved = ends.map(at);
        for (const n of pins.nodes) { const src = n.of == null ? n : ends[n.of], to = n.of == null ? at(n) : moved[n.of], o = n.id * S; P[o] = n.x + (to[0] - src.x); P[o + 1] = n.y + (to[1] - src.y); P[o + 2] = n.z + (to[2] - src.z); P[o + 4] = (n.of == null ? 0.4 : 0.32) * (1 - 0.85 * e); }
        for (const l of pins.lines) { const a = moved[l.i], b = moved[l.j], o = l.id * S; P[o] = a[0] + (b[0] - a[0]) * l.t; P[o + 1] = a[1] + (b[1] - a[1]) * l.t; P[o + 2] = a[2] + (b[2] - a[2]) * l.t; P[o + 4] = 0.22 * (1 - e); }
        if (u >= 1) doorOpen = null;
      }
      // IN THE GLASS ROOM AND THE FIELD you are still on the ground: the sky,
      // the fireflies and the worlds wait for the glass and the liftoff. The
      // field comes up out of the dark as you pass through the glass.
      const inField = cam.z > GLASS_Z - 0.02 && cam.z < FZ0 + 30 && cam.y < 7;
      // the glass room is dark through the doorway, and comes up as you cross the threshold
      const glassRoomGlow = Math.max(0, Math.min(1, (cam.z - (GLASS_Z - 0.5)) / 0.7));
      const fieldGlow = Math.max(0, Math.min(1, (cam.z - GZ2 + 0.5) / 0.9));
      // the sky comes up through the glass rather than switching on, and the
      // worlds come up as the camera lifts off the field rather than popping
      // in (Dan, 2026-10-08: the flight out "fading weirdly in places")
      const skyIn = Math.max(0, Math.min(1, (cam.z - (GZ2 - 0.6)) / 0.9));
      const planetGlow = cam.z <= GLASS_Z ? 1 : Math.max(Math.max(0, Math.min(1, (cam.y - 4.5) / 5)), Math.max(0, Math.min(1, (cam.z - (FZ0 + 22)) / 10)));
      ctx.fillStyle = rgb(ink);
      for (let i = 0; i < stars.length; i += 5) {
        const q = project(stars[i], stars[i + 1], stars[i + 2]);
        if (q[2] < 1 || q[0] < 0 || q[0] > CW || q[1] < 0 || q[1] > CH) continue;
        // a fuller sky over the field: the stars are the field's ceiling there
        ctx.globalAlpha = (0.16 + 0.12 * Math.sin(t * 0.6 + stars[i + 4])) * Math.min(1, mood.lit * 1.4 + 0.25) * (dark ? 1 : 0.7) * skyIn * (1 + 1.2 * (1 - planetGlow));
        const r = stars[i + 3]; ctx.fillRect(q[0] - r / 2, q[1] - r / 2, r, r);
      }
      if (cam.z < GLASS_Z - 0.02) {
        const list = roomForms.map((i) => [i, away(forms[i])]).sort((a, b) => b[1] - a[1]);
        for (const [i] of list) { if (forms[i].keyHidden) continue; if (forms[i].glassRoom) { if (glassRoomGlow < 0.01) continue; forms[i].glow = glassRoomGlow; } drawForm(forms[i], i); }
        return;
      }
      if (cam.z < GLASS_Z + 8) {
        // just through the glass: the room falls away behind, the glass's frame last
        const list = roomForms.map((i) => [i, away(forms[i])]).sort((a, b) => b[1] - a[1]);
        for (const [i] of list) { if (forms[i].keyHidden) continue; if (forms[i].glassRoom) { if (glassRoomGlow < 0.01) continue; forms[i].glow = glassRoomGlow; } drawForm(forms[i], i); }
      }
      // THE FIREFLIES: gold lights low over the field, drifting and blinking,
      // each on its own slow loop. Seen through the doorway before it opens;
      // all around you once you are through; left behind as you lift off.
      if (fieldGlow > 0 && flies.length) {
        // the lights go with the land: they stay as the camera climbs and fall behind as it flies on, never fading with height
        const vis = fieldGlow * (cam.z < FZ0 + 28 ? 1 : Math.max(0, 1 - (cam.z - (FZ0 + 28)) / 14));
        if (vis > 0.01) for (const g of flies) {
          let wx = g.x + Math.sin(t * g.w + g.ph) * 0.7 + Math.sin(t * g.w * 2.3 + g.ph * 2) * 0.2, wy = g.y + Math.sin(t * g.w * 1.6 + g.ph * 3) * 0.35, wz = g.z + Math.cos(t * g.w * 0.8 + g.ph) * 0.7;
          let flare = 0;
          if (g.born) {
            // the key's colours, bursting from a point ahead and settling over the ridge
            const u = Math.max(0, Math.min(1, (now - g.born) / g.dur)), e = 1 - Math.pow(1 - u, 3);
            wx = g.from[0] + (wx - g.from[0]) * e; wy = g.from[1] + (wy - g.from[1]) * e; wz = g.from[2] + (wz - g.from[2]) * e;
            flare = 1 - u;
            // and then they do not stay in the grass: over the half minute after they land they float up into the stars (Dan, 2026-10-08)
            const up = Math.max(0, (now - g.born - g.dur) / 1000); wy += up * up * 0.045; wz += up * 0.35;
          }
          const q = project(wx, wy, wz);
          if (q[2] < 0.5 || q[0] < -40 || q[0] > CW + 40 || q[1] < -40 || q[1] > CH + 40) continue;
          // tiny: a firefly right by the camera is small and faint, not a bokeh orb (seen 2026-10-07)
          const blink = Math.max(flare, 0.45 + 0.55 * Math.pow(Math.max(0, Math.sin(t * g.blink + g.ph * 5)), 2)), r = Math.min(4, Math.max(1.4, 0.026 * f / q[2])), nearFade = Math.max(0, Math.min(1, (q[2] - 0.8) / 1.6));
          ctx.fillStyle = rgb(g.tint);
          // a small soft glow, never a bokeh orb (seen 2026-10-08)
          ctx.globalAlpha = vis * nearFade * blink * 0.08; ctx.beginPath(); ctx.arc(q[0], q[1], r * 2.8, 0, TAU); ctx.fill();
          ctx.globalAlpha = vis * nearFade * blink * 0.22; ctx.beginPath(); ctx.arc(q[0], q[1], r * 1.8, 0, TAU); ctx.fill();
          ctx.globalAlpha = vis * nearFade * Math.min(1, blink * 1.1); ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      const order = planets.map((pl) => ({ pl, d: Math.hypot(cam.x - pl.C[0], cam.y - pl.C[1], cam.z - pl.C[2]) })).sort((a, b) => b.d - a.d);
      for (const { pl, d } of order) {
        if (d > 150) continue;
        if (planetGlow < 0.02) continue;
        // a world coming up out of the field's sky: everything of it at planetGlow (its body and marks read mood.lit, its grown things their glow)
        const litSave = mood.lit; if (planetGlow < 1) mood.lit = litSave * planetGlow;
        body(pl, d);
        const camDir = [(cam.x - pl.C[0]) / d, (cam.y - pl.C[1]) / d, (cam.z - pl.C[2]) / d];
        for (const rg of pl.regions) {
          const fa = rg.d[0] * camDir[0] + rg.d[1] * camDir[1] + rg.d[2] * camDir[2];
          const want = still ? 0 : ((fa > 0.5 && d < pl.R * 3.4) || (pl.boost && now < pl.boost)) ? 1 : 0;
          rg.spark += (want - rg.spark) * Math.min(1, dt * (want ? 3.4 : 1.6));
          rg.form.spark = rg.spark;
        }
        coasts(pl);
        webs(pl);
        const list = pl.forms.map((i) => { const p = forms[i]; return [i, Math.hypot(cam.x - p.px, cam.y - p.py, cam.z - p.pz)]; }).sort((a, b) => b[1] - a[1]);
        for (const [i] of list) { if (planetGlow < 1) forms[i].glow = planetGlow; else if ((forms[i].glow || 1) < 1) forms[i].glow = 1; drawForm(forms[i], i); }
        names(pl);
        mood.lit = litSave;
      }
      // THE FIELD, nearest of all, so last. It comes up out of the dark as you
      // pass through the glass, and the ground fades as you lift off.
      if (fieldGlow > 0 && cam.z < FZ0 + 40) {
        // THE LAND FLIES AWAY WITH THE CAMERA (Dan, 2026-10-08): it is drawn
        // all through the climb and slides out of the bottom of the frame as
        // the camera lifts off, fading only as the camera flies on past it
        const groundGlow = fieldGlow * (cam.z < FZ0 + 28 ? 1 : Math.max(0, 1 - (cam.z - (FZ0 + 28)) / 12));
        for (const i of fieldForms) { forms[i].glow = groundGlow; if (groundGlow > 0.01) drawForm(forms[i], i); }
      }
    }
    function draw(now, t) {
      const tDraw = performance.now();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, CW, CH);
      K = mood.K;
      setCam(cam);
      const lit = mood.lit, dim = mood.dim, secret = mood.secret;
      const fogFar = (8 + 16 * lit) * (tour ? 3.2 : 1);
      const fog = (d) => Math.max(0.06, Math.min(1, 1.15 - d / fogFar)) * (d < 0.9 ? Math.max(0, (d - 0.25) / 0.65) : 1) * lit;
      const inkCss = rgb(ink);
      ctx.fillStyle = inkCss;
      for (let i = 0; i < ground.length; i += 3) {
        const q = project(ground[i], 0, ground[i + 1]);
        if (q[2] < 0.3) continue;
        const sx = q[0], sc = q[1];
        if (sx < -4 || sx > CW + 4 || sc > CH + 4 || sc < -4) continue;
        ctx.globalAlpha = fog(q[2]) * 0.1 * ground[i + 2];
        const r = Math.max(0.5, 0.008 * f / q[2]);
        ctx.fillRect(sx - r, sc - r * 0.5, r * 2, r);
      }
      ctx.fillStyle = pen;
      for (let i = 0; i < ringL.length; i += 3) {
        const q = project(ringL[i], 0.02, ringL[i + 1]);
        if (q[2] < 0.3) continue;
        ctx.globalAlpha = fog(q[2]) * (0.35 + 0.3 * Math.sin(t * 0.9 + ringL[i + 2]));
        ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(0.8, 0.014 * f / q[2]), 0, TAU); ctx.fill();
      }
      const pulse = 0.65 + 0.35 * Math.sin(t * 1.6);
      const drawForm = (p, pi) => {
        const q0 = p.B ? project(p.px, p.py, p.pz) : project(p.x, 0, p.z);
        const pd = q0[2];
        if (pd < -3 || pd > fogFar + 8) return;
        // on a globe: a piece whose base faces away from the camera is behind its planet
        if (p.B && !p.surf && !p.float) { const ux = cam.x - p.px, uy = cam.y - p.py, uz = cam.z - p.pz, dl = Math.hypot(ux, uy, uz) || 1; if ((ux * p.B[3] + uy * p.B[4] + uz * p.B[5]) / dl < -0.12) return; }
        const cxl = p.surf ? cam.x - p.px : 0, cyl = p.surf ? cam.y - p.py : 0, czl = p.surf ? cam.z - p.pz : 0;
        // three tiers: foreground (full structure, full motion), midground
        // (every second node, motion kept), background (every fourth, still, paler)
        const tier = pd < (p.hero ? 8 : 5) * TS ? 0 : pd < (p.hero ? 16 : 11) * TS ? 1 : 2;
        // while the world bends into a sphere every node pays for the curve, and
        // the camera is far above all of it: the ambient forms thin by half
        const near = tier < 2, stride = p.surf || p.room ? (pd > 45 ? 2 : 1) : (still ? (tier ? 3 : 1) : tier === 0 ? 1 : tier === 1 ? (p.hero ? 2 : 3) : (p.hero ? 4 : 7)) * (tier === 2 ? lod.farStride : 1) * (K > 1e-4 && !p.hero && tier ? tier + 1 : 1);
        // the whole body turns and bends (see place()); the per-node motion
        // fades out toward the far tier instead of switching off at it, so
        // nothing pops from alive to frozen as the camera passes
        const yw = still ? p.yaw : p.yaw + p.spin * t, c1 = Math.cos(yw), s1 = Math.sin(yw);
        const edge = (p.hero ? 16 : 11) * TS * lod.motionEdge, A = 0.05 * p.s * Math.max(0, Math.min(1, (edge - pd) / 4));
        const bx = still ? 0 : p.bend * Math.sin(t * 0.5 + p.bph), bz = still ? 0 : p.bend * 0.6 * Math.cos(t * 0.37 + p.bph * 1.7);
        const breath = still || p.rigid ? 1 : 1 + 0.014 * Math.sin(t * 0.6 + p.bph * 2.3);
        const P = p.P;
        const heroDim = dim * (p.hero ? 0.55 : 0.4);
        const cols = tier === 0 && fog(pd) > 0.72 ? p.near : p.col;
        curWake = p.wake == null ? 1 : p.wake; curAcc = p.acc || 0;
        const floor = p.sleepFloor != null ? p.sleepFloor : 0.3;
        const wakeA = p.sleepy ? floor + (1 - floor) * curWake : 1;
        const haloOn = tier < 2 && !still && (!p.noHalo || (p.sleepy && curWake > 0.55));
        const el = now - began;
        let fill = -1, hn = 0;
        for (let k = 0; k < p.n; k += stride) {
          const o = k * S, m = P[o + 6];
          let lx = P[o] * breath, ly = P[o + 1] * breath, lz = P[o + 2] * breath;
          if (!still && !p.rigid && ((near && A > 0) || m === M.SPIN || m === M.ORBIT)) { const d = motion(P, o, t, A); lx += d[0]; ly += d[1]; lz += d[2]; }
          if (ly > 0) { lx += ly * bx; lz += ly * bz; }
          if (p.surf && (lx * (cxl - lx) + ly * (cyl - ly) + lz * (czl - lz)) < 0) continue;   // the far side of a globe
          const wx = lx * c1 - lz * s1, wz = lx * s1 + lz * c1;
          const q = p.B ? project(p.px + p.B[0] * wx + p.B[3] * ly + p.B[6] * wz, p.py + p.B[1] * wx + p.B[4] * ly + p.B[7] * wz, p.pz + p.B[2] * wx + p.B[5] * ly + p.B[8] * wz) : project(p.x + wx, ly, p.z + wz);
          const d = q[2];
          if (d < 0.25) continue;
          const sx = q[0], sc = q[1];
          if (sx < -40 || sx > CW + 40 || sc < -40 || sc > CH + 40) continue;
          let r = P[o + 3] * f / d;
          let a = P[o + 4] * fog(d) * (tier === 2 ? 0.75 : 1) * (p.glow || 1);
          if (m === M.CORE) a *= (0.12 + 0.88 * secret) * (0.55 + 0.45 * Math.sin(t * 1.3 + P[o + 7] + p.z));
          else if (m === M.SHIMMER) a *= 0.5 + 0.5 * Math.sin(t * (P[o + 12] || 0.5) * 2 + P[o + 7]);
          else if (m === M.STOP && !P[o + 8]) a *= 0.62 + 0.38 * Math.sin(t * (P[o + 12] || 0.5) * 2 + P[o + 7]);
          else if (m === M.OPEN) a *= Math.max(0, Math.min(1, (curWake - 0.8) * 5)) * (0.6 + 0.4 * Math.sin(t * (P[o + 12] || 1) * 2 + P[o + 7]));
          else if (m === M.LIFT && P[o + 12]) a *= P[o + 12] > 0 ? curWake : 1 - curWake;
          else if (m === M.FLAME) { const u = still ? 0.3 : (t * P[o + 12] + P[o + 7]) % 1; a = P[o + 4] * Math.min(1, 1.2 - d / fogFar) * Math.max(0.35, mood.lit) * (1 - u) * (0.78 + 0.22 * Math.sin(t * 11 + P[o + 7] * 29)) * (p.kind === 'room-dog' ? 1 - curWake : p.kind === 'room-hearth' ? 0.55 + 0.45 * curWake : curWake); r *= 1 - 0.45 * u; }
          if (wakeA !== 1) a *= wakeA;
          if (p.hideAsleep) a *= curWake;
          else if (heroDim) a *= 1 - heroDim;
          // front and back of the same body: nearer than the form's centre reads larger and brighter
          const dl = d - pd, fb = dl > 0 ? 1 - Math.min(0.32, dl / (p.s * 1.4) * 0.32) : 1 + Math.min(0.1, -dl / p.s * 0.1);
          r *= fb; a *= fb;
          // the window behind the host: quieter, so its porous silhouette reads
          if (qz) { const dq = Math.hypot(sx - qz.x, sc - qz.y); if (dq < qz.r) a *= 0.22 + 0.78 * (dq / qz.r) ** 2; }
          if (r < 0.45) { a *= r / 0.45; r = 0.45; }
          if (p.region && p.spark > 0.01) {
            const sp = sparkAmp(p.seed * 7919 + k, el);
            if (sp[0] > 0) {
              r *= 1 + 0.75 * sp[0] * p.spark;
              if (sp[1]) { ctx.globalAlpha = 0.35 * sp[0] * p.spark * a; ctx.fillStyle = cols[P[o + 5]] || cols[0]; fill = -1; ctx.beginPath(); ctx.arc(sx, sc, r * 2.6, 0, TAU); ctx.fill(); }
            }
          }
          if (a < 0.012) continue;
          const hit = tw.get(pi * 65536 + k);
          if (hit) {
            const u = (now - hit.t) / 700;
            if (u >= 1) tw.delete(pi * 65536 + k);
            else if (u > 0) {
              const w = Math.sin(u * Math.PI);
              if (hit.glow) { ctx.globalAlpha = 0.3 * w * a; ctx.fillStyle = pen; fill = -1; ctx.beginPath(); ctx.arc(sx, sc, r * (1 + 0.75 * w) * 2.6, 0, TAU); ctx.fill(); }
              r *= 1 + 0.75 * w; a = Math.min(1, a + 0.4 * w);
            }
          }
          const c = P[o + 5];
          if (c !== fill) { ctx.fillStyle = cols[c] || cols[0]; fill = c; }
          ctx.globalAlpha = Math.min(1, a);
          if (r < 0.7) ctx.fillRect(sx - r, sc - r, r * 2, r * 2);
          else if (m === M.STOP) {
            // a flat square with a pale rim: an octagon this small still read as a disc (Dan, 2026-10-08)
            const R = r * 0.95; ctx.fillRect(sx - R, sc - R, R * 2, R * 2);
            if (R > 3) { ctx.lineWidth = Math.max(1, R * 0.22); ctx.strokeStyle = cols[4] || cols[0]; ctx.strokeRect(sx - R, sc - R, R * 2, R * 2); }
          }
          else { ctx.beginPath(); ctx.arc(sx, sc, r, 0, TAU); ctx.fill(); }
          // the sea art's rule: points of light in haze, not flat discs. Accents
          // and the near structure of a hero get a soft halo, drawn after the cores.
          if (haloOn && r > lod.haloMinR && hn < HALO.length - 5 && (c >= 2 || (p.hero && tier === 0 && (k & 3) === 0))) { HALO[hn++] = sx; HALO[hn++] = sc; HALO[hn++] = r; HALO[hn++] = a; HALO[hn++] = c; }
        }
        if (hn) {
          ctx.globalCompositeOperation = dark ? 'lighter' : 'multiply';
          const ha = dark ? 0.16 : 0.09;
          for (let i = 0; i < hn; i += 5) {
            ctx.fillStyle = cols[HALO[i + 4]] || cols[0];
            ctx.globalAlpha = HALO[i + 3] * ha * 1.3;
            ctx.beginPath(); ctx.arc(HALO[i], HALO[i + 1], HALO[i + 2] * 2.3, 0, TAU); ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over';
        }
        if ((!near && pd > 20) || K > 1e-4) return;   // no hung objects while the world bends: too small to read from up there
        // the things it grew, facing you, hanging from where they grew
        for (const th of p.things) {
          const o = th.anchor * S;
          let lx = P[o] * breath, ly = P[o + 1] * breath, lz = P[o + 2] * breath;
          if (!still && ((near && A > 0) || P[o + 6] === M.SPIN)) { const d = motion(P, o, t, A); lx += d[0]; ly += d[1]; lz += d[2]; }
          if (ly > 0) { lx += ly * bx; lz += ly * bz; }
          const wx = lx * c1 - lz * s1, wz = lx * s1 + lz * c1, hy = ly - th.dy;
          const q = p.B ? project(p.px + p.B[0] * wx + p.B[3] * hy + p.B[6] * wz, p.py + p.B[1] * wx + p.B[4] * hy + p.B[7] * wz, p.pz + p.B[2] * wx + p.B[5] * hy + p.B[8] * wz) : project(p.x + wx, hy, p.z + wz);
          const d = q[2];
          if (d < 0.25) continue;
          const ax = q[0], ay = q[1], u = th.u * f / d;
          if (u < 1.2 || ax < -60 || ax > CW + 60 || ay < -60 || ay > CH + 60) continue;
          const swing = still ? 0 : Math.sin(t * 0.9 + P[o + 7]) * th.swing, cs = Math.cos(swing), sn = Math.sin(swing);
          const a0 = fog(d) * Math.min(1, (u - 1.2) / 2) * (heroDim ? 1 - heroDim : 1);
          ctx.fillStyle = cols[th.col] || cols[2];
          for (const qq of th.pts) {
            const qx = qq[0] * cs - qq[1] * sn, qy = qq[0] * sn + qq[1] * cs;
            ctx.globalAlpha = a0 * qq[3];
            ctx.beginPath(); ctx.arc(ax + qx * u, ay + qy * u, Math.max(0.5, qq[2] * u * 0.12), 0, TAU); ctx.fill();
          }
        }
      };
      if (tour) drawTour(drawForm, now, t, fog); else forms.forEach(drawForm);
      // when the world is bending into a sphere, its limb: a faint ring of ground light
      if (K > 0.02) {
        const Rr = 1 / K;
        ctx.fillStyle = inkCss;
        for (let i = 0; i < 160; i++) {
          const a = i / 160 * TAU, th = 1.45;
          const q = project(CLEAR.x + Math.cos(a) * th / K, 0, CLEAR.z + Math.sin(a) * th / K);
          if (q[2] < 0.3) continue;
          ctx.globalAlpha = 0.12 * Math.min(1, (K - 0.02) * 12) * lit;
          const r = Math.max(0.6, 0.02 * f / q[2] * Rr / 6);
          ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, TAU); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      lodTick(performance.now() - tDraw);
    }

    // ── the controls seed.js uses ───────────────────────────────────────
    // COMPOSITION FIRST, SUPPRESSION SECOND. A pose the camera will REST on
    // with the host in frame (`frame` set) is checked before it is committed:
    // the window behind the host's head is measured from the target pose and
    // from a few small yaw and lateral offsets, and the least cluttered of
    // them is the one flown to, provided it is meaningfully quieter. The alpha
    // suppression in draw() stays as the safety net for what remains; it is
    // no longer the only thing between the host and a masterpiece.
    function framed(target) {
      const zone = quietFn ? quietFn() : null;
      if (!zone || !zone.r) return target;
      const base = clutter(target, zone);
      if (base < 4) return target;
      let best = target, bestC = base;
      for (const [dyaw, dx] of [[-0.05, 0], [0.05, 0], [-0.1, 0], [0.1, 0], [0, -0.3], [0, 0.3], [-0.06, 0.25], [0.06, -0.25]]) {
        const t = Object.assign({}, target, { yaw: target.yaw + dyaw, x: target.x + dx });
        const c = clutter(t, zone);
        if (c < bestC) { best = t; bestC = c; }
      }
      return bestC < base * 0.7 ? best : target;
    }
    function cut(target) {
      // less motion asked for: a cut with a short dissolve, never a flight
      canvas.classList.add('cut');
      setTimeout(() => { fl = null; Object.assign(cam, target); Object.assign(prevCam, cam); if (!CW) fit(); draw(performance.now(), 0); canvas.classList.remove('cut'); }, 240);
    }
    // the camera's present, as a key: where it is (without the drift and the
    // framing offset, which are added on top every frame) and how fast it is going
    function here(now) {
      const v = {}, m = {};
      for (const c of CHAN) {
        v[c] = fl ? sample(fl.keys, LOOK[c] ? Math.min(fl.end, now + LEAD) : now, c) : cam[c] - (c === 'x' ? frameOff.x : c === 'yaw' ? frameOff.yaw : 0);
        m[c] = fl && now < fl.end ? (sample(fl.keys, Math.min(fl.end, now + 16), c) - sample(fl.keys, now, c)) / 16 : 0;
      }
      return { t: now, v, m };
    }
    // ONE MOVE, CONTINUOUS WITH WHATEVER WAS HAPPENING: it leaves at the
    // speed and heading the camera already had, and arrives at rest.
    function go(name, ms, rest) {
      const target = poseOf(name);
      if (!target) return;
      if (still) { cut(rest ? (() => { try { return framed(target); } catch (_) { return target; } })() : target); return; }
      const now = performance.now(), dur = Math.max(1, ms || 1);
      const keys = [here(now), { t: now + dur, v: target, ease: 0, frame: !!rest, hold: 4000 }];
      tangents(keys);
      fl = { keys, end: now + dur };
      if (!raf) raf = requestAnimationFrame(frame);
    }
    // THE AUTHORED COURSE. `course` is [[pose, atMs, opts]], times from now;
    // opts: `ease` (how much of the through-speed it keeps: 1 flows, 0.3
    // slows right down into it, 0 is a true rest), `frame` (the host rests
    // in front of the world here), `hold` (how long that framing lasts).
    // The course begins from wherever the camera is, at the speed it has.
    function fly(course) {
      const now = performance.now();
      if (still) {
        // reduced motion: a cut to each framed rest, in time, and nothing between
        for (const [name, at, o] of course) if (o && (o.frame || o.cut)) setTimeout(() => { const p = poseOf(name); if (p) cut(p); }, at);
        return;
      }
      const keys = [here(now)];
      for (const [name, at, o] of course) {
        const v = poseOf(name);
        if (!v || at <= 0) continue;
        keys.push(Object.assign({ t: now + at, v }, o || {}));
      }
      if (keys.length < 2) return;
      keys[keys.length - 1].ease = 0;
      tangents(keys);
      fl = { keys, end: keys[keys.length - 1].t };
      if (!raf) raf = requestAnimationFrame(frame);
    }
    function setMood(o) { Object.assign(want, o || {}); if (still) { Object.assign(mood, want); draw(performance.now(), 0); } else if (!raf) raf = requestAnimationFrame(frame); }
    const onResize = () => { fit(); draw(performance.now(), (performance.now() - began) / 1000); };
    window.addEventListener('resize', onResize);
    // the canvas can change size without the window doing so (a pane opens beside it): refit then too
    let ro = null;
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => { if (canvas.clientWidth !== CW || canvas.clientHeight !== CH) onResize(); }); ro.observe(canvas); }
    fit();
    draw(performance.now(), 0);
    if (!still) raf = requestAnimationFrame(frame);
    return {
      go, fly, mood: setMood,
      camera() { return Object.assign({}, cam); },
      tour,
      // where a world point lands on screen from the current camera (a check, not a feature)
      // WHAT IS UNDER THE POINTER. Each thing in the room is sampled and
      // projected, and the smallest one whose outline holds the point wins.
      pick(x, y) {
        if (!tour || cam.z > GLASS_Z) return null;
        // POINTER TO PICTURE: the picture is laid out in CW by CH, which can
        // lag the canvas's real size when the page around it reflows without a
        // resize event (the chat pane opening); a pointer compared to it
        // unscaled misses by the difference (Dan, 2026-10-07: no titles on hover)
        const r = canvas.getBoundingClientRect(), kx = CW / (r.width || CW), ky = CH / (r.height || CH);
        x = (x - r.left) * kx; y = (y - r.top) * ky;
        setCam(cam);
        let best = null, bestA = Infinity;
        for (const i of roomForms) {
          const p = forms[i];
          if (!p.row || !p.row.name || (p.hideAsleep && p.wake < 0.3)) continue;
          const P = p.P, step = Math.max(1, Math.floor(p.n / 80));
          let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
          for (let k = 0; k < p.n; k += step) {
            const o = k * S, lx = P[o], ly = P[o + 1], lz = P[o + 2];
            if (P[o + 6] === M.CORE) continue;   // a form's origin marks sit on the floor; they are not its body
            const q = project(p.x + lx * p.c1 - lz * p.s1, ly, p.z + lx * p.s1 + lz * p.c1);
            if (q[2] < 0.1) continue;
            if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1];
          }
          if (x < x0 - 10 || x > x1 + 10 || y < y0 - 10 || y > y1 + 10) continue;
          const a = (x1 - x0 + 20) * (y1 - y0 + 20);
          if (a < bestA) { bestA = a; best = p.kind; }
        }
        return best;
      },
      // A TOUCH: the thing wakes for a moment and does what it does (the fire
      // flares, the dog stirs and wags, the balloon bobs up, the clock ticks,
      // the plant blooms, the glass ripples), with a
      // flurry of light through it. The lamp stays on once switched on.
      poke(kind, soft) {
        if (!tour) return;
        const now = performance.now();
        forms.forEach((p, pi) => {
          if (p.kind !== kind || !p.room) return;
          const n = soft ? 8 : 36;
          for (let k = 0; k < n; k++) tw.set(pi * 65536 + Math.floor(rand() * p.n), { t: now + k * (soft ? 30 : 22), glow: !soft });
          if (soft || p.wakeWant == null) return;
          if (p.row.toggle) { p.wakeWant = p.wakeWant > 0.5 ? 0 : 1; return; }
          p.nudgeUntil = now + (p.row.hold || 2800);
          p.nudgeTo = p.row.to || 1;
          if (p.row.kick) p.acc += p.row.kick;
        });
        if (!raf) raf = requestAnimationFrame(frame);
      },
      // THE HOST OPENS THE DOOR: the web parts to the sides over `ms`
      openDoor(ms) {
        if (!tour || !web) return;
        doorOpen = { t0: performance.now(), dur: Math.max(1, ms || 1800) };
        if (still) doorOpen.t0 -= doorOpen.dur;
        if (!raf) raf = requestAnimationFrame(frame);
      },
      // WHAT IS IN THE WAY, UNDER THE POINTER. The nearest obstacle knot within
      // reach of the pointer: its id (an index into the page's titles), where
      // it is on screen, and whether it has been read. Null when none is.
      pickObstacle(x, y) {
        if (!tour || !obstacles.length || cam.z > GLASS_Z - 0.3) return null;   // from the room side of the door only
        // POINTER TO PICTURE: the picture is laid out in CW by CH, which can
        // lag the canvas's real size when the page around it reflows without a
        // resize event (the chat pane opening); a pointer compared to it
        // unscaled misses by the difference (Dan, 2026-10-07: no titles on hover)
        const r = canvas.getBoundingClientRect(), kx = CW / (r.width || CW), ky = CH / (r.height || CH);
        x = (x - r.left) * kx; y = (y - r.top) * ky;
        setCam(cam);
        let best = null, bestD = 36;
        obstacles.forEach((ob, id) => {
          const p = forms[ob.i], o = ob.k * S, P = p.P;
          const q = project(p.x + P[o], P[o + 1], p.z + P[o + 2]);
          if (q[2] < 0.3) return;
          const d = Math.hypot(q[0] - x, q[1] - y);
          if (d < bestD) { bestD = d; best = { id, x: q[0] / kx + r.left, y: q[1] / ky + r.top, read: ob.read }; }
        });
        return best;
      },
      // an obstacle that has been read stays read: steady, brighter, a little larger, and it twinkles once
      readObstacle(id) {
        const ob = obstacles[id];
        if (!ob) return;
        const p = forms[ob.i], o = ob.k * S;
        tw.set(ob.i * 65536 + ob.k, { t: performance.now(), glow: true });
        if (!ob.read) { ob.read = true; p.P[o + 4] = 1; p.P[o + 8] = 1; }   // w = 1: read, so it stops breathing and stays a stop sign
        if (!raf) raf = requestAnimationFrame(frame);
      },
      // THE SQUARE UNDER THE POINTER SWELLS (Dan, 2026-10-08), the way a hero
      // line's point does on the landing page; a read one stays a little larger
      obstacleHover(id) {
        obstacleHoverId = id == null ? -1 : id;
        obstacles.forEach((ob, i) => { const p = forms[ob.i], o = ob.k * S; if (ob.r0 == null) ob.r0 = p.P[o + 3]; p.P[o + 3] = ob.r0 * (ob.read ? 1.3 : 1) * (i === obstacleHoverId ? 1.7 : 1); });
        if (!raf) raf = requestAnimationFrame(frame);
      },
      obstacleCount() { return obstacles.length; },
      // the circle for square k set straight down in its place on the key (the page's own line has played above it)
      keyLand(k) { const s = key && key.flyState[k]; if (!s) return; s.phase = 'landed'; s.t0 = performance.now(); key.keyHidden = false; if (!raf) raf = requestAnimationFrame(frame); },
      // where the page stacks its lines: the empty wall above the key, in CSS pixels
      keyAnchor() {
        if (!tour || !key) return null;
        const r = canvas.getBoundingClientRect(), kx = CW / (r.width || CW), ky = CH / (r.height || CH);
        setCam(cam);
        // from near the top of the wall (seen 2026-10-08: on a taller window the stack began halfway down and ran off the bottom)
        // project() hands back one shared buffer: copy the first point before asking for the second (seen 2026-10-08: the stack landed at the lower point)
        const p0 = project(key.x + KEY_X - 1.25, 2.95, key.z + KEY_Z - 0.3), q = [p0[0], p0[1], p0[2]], q2 = project(key.x + KEY_X - 1.25, 1.3, key.z + KEY_Z - 0.3);
        if (q[2] < 0.3) return null;
        return { x: q[0] / kx + r.left, y: q[1] / ky + r.top, h: Math.abs(q2[1] - q[1]) / ky };
      },
      // THE KEY: called in (it swirls together over `ms`), turned in the lock, and its circles under the pointer
      // THE KEY: a square's circle up beside it (keyWrite), sent out into
      // its place (keyFly), where it is on screen for the page's write stream
      // and its title (keyScreen), a point along the key's outline for the
      // flurry's stream (keySpot), the flurry itself (keyFlurry), the colour
      // of a circle (keyColour), and the key turned in the lock (keyUnlock)
      keyWrite(k) {
        if (!tour || !key) return false;
        const s = key.flyState[k];
        if (!s || s.phase !== 'off') return false;
        s.phase = 'up'; s.t0 = performance.now();
        key.keyHidden = false;
        if (!raf) raf = requestAnimationFrame(frame);
        return true;
      },
      keyFly(k) { const s = key && key.flyState[k]; if (!s || s.phase !== 'up') return; s.phase = 'down'; s.t0 = performance.now(); if (still) { s.phase = 'landed'; } if (!raf) raf = requestAnimationFrame(frame); },
      keySettle() {},
      keyScreen(k) {
        if (!tour || !key || key.keyHidden) return null;
        const o = key.fly[k] * S, P = key.P;
        const r = canvas.getBoundingClientRect(), kx = CW / (r.width || CW), ky = CH / (r.height || CH);
        setCam(cam);
        const q = project(key.x + P[o], P[o + 1], key.z + P[o + 2]);
        if (q[2] < 0.3) return null;
        return { x: q[0] / kx + r.left, y: q[1] / ky + r.top, r: Math.max(2, P[o + 3] * f / q[2] / kx) };
      },
      keySpot(u) {
        if (!tour || !key) return null;
        const cs = key.centres, t = Math.max(0, Math.min(0.999, u)) * (cs.length - 1), i = Math.floor(t), w = t - i, a = cs[i], b = cs[i + 1] || a;
        const r = canvas.getBoundingClientRect(), kx = CW / (r.width || CW), ky = CH / (r.height || CH);
        setCam(cam);
        const q = project(key.x + a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, key.z + a[2] + (b[2] - a[2]) * w);
        if (q[2] < 0.3) return null;
        return { x: q[0] / kx + r.left, y: q[1] / ky + r.top, colour: key.col[i % key.col.length] };
      },
      keyFlurry(ms) {
        if (!tour || !key) return;
        key.keyHidden = false;
        key.flurry = { t0: performance.now(), dur: Math.max(1, ms || 3200) };
        if (still) key.flurry.t0 -= key.flurry.dur * 1.2;
        const ki = forms.indexOf(key);
        for (let j = 0; j < 160; j++) tw.set(ki * 65536 + Math.floor(rand() * key.sculptN), { t: performance.now() + rand() * (ms || 3200), glow: false });
        if (!raf) raf = requestAnimationFrame(frame);
      },
      keyColour(k) { return key ? key.col[k % key.col.length] : null; },
      keyWritten() { return key ? key.flyState.filter((s) => s.phase !== 'off').length : 0; },
      keyUnlock(ms) { if (!tour || !key) return; keyAnim = { t0: performance.now(), dur: Math.max(1, ms || 1600) }; if (still) keyAnim.t0 -= keyAnim.dur; if (!raf) raf = requestAnimationFrame(frame); },
      pickKey(x, y) {
        if (!tour || !key || key.keyHidden || cam.z > GLASS_Z - 0.3) return null;
        const r = canvas.getBoundingClientRect(), kx = CW / (r.width || CW), ky = CH / (r.height || CH);
        x = (x - r.left) * kx; y = (y - r.top) * ky;
        setCam(cam);
        let best = null, bestD = 30;
        key.flyState.forEach((s, id) => {
          if (s.phase === 'off') return;
          const o = key.fly[id] * S, P = key.P;
          const q = project(key.x + P[o], P[o + 1], key.z + P[o + 2]);
          if (q[2] < 0.3) return;
          const d = Math.hypot(q[0] - x, q[1] - y);
          if (d < bestD) { bestD = d; best = { id, x: q[0] / kx + r.left, y: q[1] / ky + r.top }; }
        });
        return best;
      },
      keyCount() { return key ? key.centres.length : 0; },
      keyCount() { return key ? key.centres.length : 0; },
      keyCount() { return keys.length; },
      keyCount() { return keys.length; },
      // THE KEY'S COLOURS SPILL INTO THE FIELD: a burst of lights in the kind
      // colours from a point ahead, settling over the ridge as drifting lights
      keyBurst(ms) {
        if (!tour) return;
        const br = rng(Math.floor(performance.now()) & 0xffff), from = [cam.x + 1.2, 2.8, cam.z + 7];
        for (let k = 0; k < 140; k++) {
          const z = 1 + 40 * Math.pow(br(), 1.3), x = (br() * 2 - 1) * (3 + z * 0.5);
          flies.push({ x: GX + x, y: fieldH(x, z) + 0.2 + br() * 1.4, z: FZ0 + z, ph: br() * TAU, w: 0.3 + br() * 0.4, blink: 1.2 + br() * 1.6, tint: COS[k % COS.length], born: performance.now(), dur: Math.max(1, ms || 2600), from });
        }
        if (!raf) raf = requestAnimationFrame(frame);
      },
      // wake the room: { kind: 0..1 }. The page decides from what the seed holds.
      roomWake(map) { if (!tour || !map) return; for (const i of roomForms) { const p = forms[i]; if (map[p.kind] != null && p.wakeWant != null) p.wakeWant = map[p.kind]; } if (!raf) raf = requestAnimationFrame(frame); },
      anchor(name) { const a = tour && ANCHOR[name]; if (!a) return null; setCam(cam); const q = project(a[0], a[1], a[2]); return q[2] > 0.1 ? [q[0], q[1]] : null; },
      probe(x, y, z) { setCam(cam); const q = project(x, y, z); return [q[0], q[1], q[2]]; },
      clearing() { const D = yours || youngs.d || planets.find((p) => p.young); return D ? D.clearing : null; },
      // WHICH YOUNG WORLD IS THEIRS (the fork in mid-space): the green one for a builder, the quiet one for a mind to map
      path(p) { if (!tour) return; const k = p === 'build' ? 'H' : 'D'; for (const n of PATHED) if (TPOSE[n + '_' + k]) TPOSE[n] = TPOSE[n + '_' + k]; TPOSE.midOut = TPOSE['midOut_' + k]; yours = p === 'build' ? youngs.h : youngs.d; },
      // the page tells the world where the host stands (viewport px, and a radius); the world keeps that window quiet
      quiet(fn) { quietFn = typeof fn === 'function' ? fn : null; },
      // a pose is a one-key course, not fl = null: frame() adds the drift on top
      // of cam every frame, so with no course re-setting the base it adds up and the camera wanders off
      pose(name) { const p = poseOf(name); if (p) { fl = { keys: [{ t: 0, v: p }], end: 0 }; Object.assign(cam, p); Object.assign(prevCam, cam); } },
      // THE WORLD LEANS TOWARD WHAT THEY MEAN. Only on a confirmed meaning with a
      // clear atmosphere: the grown things that share it brighten a little and
      // light runs through them once, and everything else is left alone. The
      // seed is the feedback; this is weather.
      lean(cue) {
        const kinds = LEAN[cue];
        if (!kinds || still) return;
        const now = performance.now();
        forms.forEach((p, pi) => {
          const hit = kinds.includes(p.kind);
          p.glowWant = hit ? 1.45 : 1;
          if (!hit || away(p) > 34) return;
          for (let k = 0; k < 24; k++) tw.set(pi * 65536 + Math.floor(rand() * p.n), { t: now + k * 60, glow: true });
          if (p.hero && p.flows.length) p.nextFlow = now;
        });
        leaning = true;
        if (!raf) raf = requestAnimationFrame(frame);
      },
      wave(z0, z1, ms) {
        if (tour) { const pl = planets.slice().sort((a, b) => away({ px: a.C[0], py: a.C[1], pz: a.C[2] }) - away({ px: b.C[0], py: b.C[1], pz: b.C[2] }))[0]; if (pl) pl.boost = performance.now() + (ms || 3000); return; } if (!still) waveF = { z0, z1, t0: performance.now(), dur: ms || 3000 }; },
      // the garden resolves into a sphere: the ground bends, the far groves
      // go over the horizon, the camera lifts to see it whole
      // THE WORLD REVEALS ITS SHAPE. Two moves, one breath: the camera rises
      // off the clearing while the near garden still reads as landscape, then
      // lifts hard until the curvature is unmistakable, the far groves
      // compress into constellated regions, the upper-air colour clusters
      // become world-scale lights and the ground lattice bends round a ball.
      // The curvature ramps under the whole move (the mood smoothing carries
      // K), so nothing snaps from flat to round.
      resolve(ms) {
        const total = Math.max(600, ms || 6000);
        // one course: rising off the clearing flows straight into the lift
        if (still) { go('lift', total); }
        else fly([['rise', total * 0.42, { ease: 0.9 }], ['lift', total]]);
        setMood({ K: tour ? 0 : 1 / 7.5, rate: 3.5, flow: 0.4, secret: 0, dim: 0, drift: 0, lit: 1 });
      },
      settled() { this.pose('table'); setMood({ lit: 0.9, dim: 0.3, rate: 1.2, flow: 0.5, drift: 0.12 }); },
      stop() { if (raf) cancelAnimationFrame(raf); raf = 0; window.removeEventListener('resize', onResize); if (ro) ro.disconnect(); },
      count() { return forms.reduce((n, f) => n + f.n, 0); },
      forms() { return forms; },
      heroes() { return forms.filter((f) => f.hero).map((f) => ({ kind: f.kind, n: f.n, flows: f.flows.length, things: f.things.length })); },
    };
  }

  // Builder, M, S and oklchRgb are shared with course art (course-art.js):
  // a course's landmark is built from the garden's own parts, so it belongs
  // to the same world as everything the member met on their first day.
  window.SeedWorld = { make, POSE, CLEAR, ROOM, Builder, M, S, oklchRgb };
})();
