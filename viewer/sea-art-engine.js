// Sea art, phase 3: the engine.
// Brief: docs/SEA-ART-EMERGENCE-ANALYSIS.md (frozen v3.1) and
// docs/SEA-ART-3D-NODE-MODELING-BRIEF.md Parts B, D and E.
// Tracker: docs/SEA-ART-BUILD-TRACKER.md.
//
// This file turns residue into a piece and a piece into per-frame presentation
// overrides. It is the translation of Dan's kinetic sculpture spec
// (2026-08-30) into this codebase's law, and where the two disagreed the law
// won; every deviation is recorded in the 3D brief's Part E. The load-bearing
// ones: a piece HOLDS indefinitely once settled (the spec's fixed 12-second
// cycle would have the art perform its own disappearance at nobody, which
// discover-only forbids), Release fires on retirement rather than on a clock,
// suppression hides a piece without destroying it (the yield law: it comes
// back exactly as it was), containment is validated as rejection because the
// generators do not know where land is, and tint legality is measured as true
// perceptual distance in OKLab against the theme's resolved kind tokens
// rather than as a hue list.
//
// Like sea-art.js, nothing here writes anything, reaches for the network, or
// touches the DOM. The theme's kind colours are HANDED IN (the page reads the
// tokens; this file only does arithmetic on them). The only nondeterminism
// allowed in the whole file is the seed the caller chooses: generation uses a
// seeded PRNG and the animation resolver is a pure function of piece, time
// and yield state, so the same corpus, seed and clock reproduce the same
// frame, which is what makes any of this testable.

// sea-art.js is this file's one dependency. In the browser both are classic
// scripts and sea-art.js loads first, so its helpers are already globals; under
// node this file is required standalone, so it requires them.
const seaArtLib = (typeof module !== 'undefined' && module.exports) ? require('./sea-art.js') : null;
const vUnit = seaArtLib ? seaArtLib.artUnit : artUnit;
const vDot = seaArtLib ? seaArtLib.artDot : artDot;
const vCross = seaArtLib ? seaArtLib.artCross : artCross;
const vAngle = seaArtLib ? seaArtLib.artAngle : artAngle;
const vContains = seaArtLib ? seaArtLib.artSeaContains : artSeaContains;

// ── the aesthetic parameter ledger ───────────────────────────────────────────
// Dan's ledger (3D brief Part E), adopted as the engine's single source of
// bounds. Every generator, the validator and the runtime read THESE, so a
// tuning conversation is an edit to one object rather than a hunt.
const ART_RIG = {
  nodeCap: 48,            // members per piece: the sea shares its frame with truth
  maxDisplacement: 0.18,  // rad: past this a node loses its neighbourhood context
  maxAltitude: 0.26,      // radius fraction: readable ridges without swallowing the frame
  sizeMin: 0.78,          // below the envelope size stops reading as texture
  sizeMax: 1.32,          // above it size starts reading as selection
  focusShare: 0.68,       // an art radius never exceeds this share of the node's own focus radius
  voidRadius: 0.035,      // rad: protected negative space, the eye constructs the form
  cycleMs: 12000,         // the entrance choreography's full length (Gather..Settle at 80%)
  stagger: 0.35,          // how much of the reveal is spent flowing across the piece
  maxChroma: 0.14,        // OKLCH ceiling: atmosphere, never a synthetic UI badge
  minKindDistance: 0.09,  // OKLab: a tint must sit at least this far from every kind colour
  maxPieceEnergy: 40,     // the whole piece's salience budget (3D brief D.2)
  discoverMin: 12,        // fewer gathered residue nodes than this and no piece wants to exist
  discoverRadius: 0.40,   // rad: how close to the residue's centre material must sit to count as gathered
  sustainShare: 0.6,      // below this share of original members, a composition cannot sustain itself
  flourishMs: 2600,       // the one bounded expressive animation: a breath, not a show (brief 11)
  flourishLift: 0.035,    // radius fraction: the ripple's altitude crest, well inside maxAltitude
};

// ── spherical and tangent-space geometry ─────────────────────────────────────
// The sphere is the gallery wall, not the coordinate system the artist thinks
// in (3D brief D.4): forms are composed in an ordinary 2D tangent plane at a
// chosen sea centre and mapped back onto the sphere afterward.

function artBasis(center) {
  const c = vUnit(center);
  const up = Math.abs(c.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const e = vUnit(vCross(up, c));
  const n = vCross(c, e);
  return { c, e, n };
}

// (u, v) in the tangent plane, in radians of arc, onto the unit sphere via the
// exponential map: exact rather than projected, so a form keeps its proportions
// at any size the displacement budget allows.
function artOnSphere(basis, u, v) {
  const r = Math.hypot(u, v);
  if (r < 1e-9) return { x: basis.c.x, y: basis.c.y, z: basis.c.z };
  const sinR = Math.sin(r), cosR = Math.cos(r);
  const du = u / r, dv = v / r;
  return {
    x: basis.c.x * cosR + (basis.e.x * du + basis.n.x * dv) * sinR,
    y: basis.c.y * cosR + (basis.e.y * du + basis.n.y * dv) * sinR,
    z: basis.c.z * cosR + (basis.e.z * du + basis.n.z * dv) * sinR,
  };
}

function artSlerp(a, b, t) {
  const d = Math.max(-1, Math.min(1, vDot(a, b)));
  const omega = Math.acos(d);
  if (omega < 1e-6) return { x: a.x, y: a.y, z: a.z };
  const so = Math.sin(omega);
  const s0 = Math.sin((1 - t) * omega) / so;
  const s1 = Math.sin(t * omega) / so;
  return { x: a.x * s0 + b.x * s1, y: a.y * s0 + b.y * s1, z: a.z * s0 + b.z * s1 };
}

// The displacement budget as geometry: a target past the budget is pulled back
// along the geodesic toward the truth until it obeys. Applied at generation AND
// per frame, so no intermediate state can exceed what the endpoints promise.
function artClampDisp(source, target, maxAngle) {
  const d = vAngle(source, target);
  if (d <= maxAngle) return target;
  return artSlerp(source, target, maxAngle / d);
}

// ── the deterministic PRNG ───────────────────────────────────────────────────
// An LCG, because the requirement is reproducibility rather than quality: the
// same seed must make the same piece on every machine, forever. Generation may
// draw from this; the animation resolver may not draw random numbers at all.
function artPrng(seed) {
  let s = seed >>> 0;
  const next = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  next.range = (min, max) => min + next() * (max - min);
  return next;
}

// ── the salience budget (3D brief D.2, invariant 15's model) ─────────────────
// Perception does not care that each channel obeyed its own cap, so a node's
// expressiveness sums to one number. Each channel is normalized by its own
// ledger maximum and the weights sum to 1, so a node inside every cap scores
// at most 1.0 by construction, and the piece budget is what stops a
// composition from being loud everywhere at once.
function artEnergy(dispAngle, altitude, sizeMult, motionShare, rig) {
  const R = rig || ART_RIG;
  const disp = dispAngle / R.maxDisplacement;
  const alt = Math.abs(altitude) / R.maxAltitude;
  const size = Math.abs(sizeMult - 1) / (R.sizeMax - 1);
  // motion is priced perceptually (motion brief B.7): a share of amplitude
  // weighted by act density, additive because a moving node genuinely costs
  // more attention than the same node holding still
  const motion = motionShare || 0;
  return disp * 0.45 + alt * 0.35 + size * 0.20 + motion * 0.10;
}

// ── colour: OKLab arithmetic and the perceptual palette ──────────────────────
// Palettes are semantic descriptors, resolved against the theme at hand (3D
// brief D.5). Legality is perceptual: a tint must keep a minimum OKLab
// distance from every kind colour AS CURRENTLY RESOLVED, which covers the six
// chromatic kinds by hue and the achromatic seventh (idea) by chroma and
// lightness in the same test, with no forbidden-hue list to go stale.

const ART_PALETTES = {
  'moonlit-coral': { family: 'moonlit-coral', baseHue: 18, chroma: 0.12, lightness: 0.74, hueVariance: 15 },
  'deep-current': { family: 'deep-current', baseHue: 220, chroma: 0.08, lightness: 0.65, hueVariance: 20 },
  'bioluminescence': { family: 'bioluminescence', baseHue: 165, chroma: 0.14, lightness: 0.82, hueVariance: 10 },
  'stormglass': { family: 'stormglass', baseHue: 260, chroma: 0.06, lightness: 0.68, hueVariance: 25 },
  'porcelain-wave': { family: 'porcelain-wave', baseHue: 60, chroma: 0.03, lightness: 0.88, hueVariance: 5 },
};

// A CSS colour (#rgb, #rrggbb, rgb(), rgba()) to OKLab {L, a, b}, or null for
// anything unparseable, which the distance check simply skips: an exotic token
// should degrade to "no constraint from this one" rather than to a crash in
// the render path.
function artOklabOf(css) {
  const s = String(css || '').trim();
  let r, g, b;
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) { r = parseInt(m[1][0] + m[1][0], 16); g = parseInt(m[1][1] + m[1][1], 16); b = parseInt(m[1][2] + m[1][2], 16); }
  if (!m) {
    m = /^#([0-9a-f]{6})/i.exec(s);
    if (m) { r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4, 6), 16); }
  }
  if (!m) {
    m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(s);
    if (m) { r = parseFloat(m[1]); g = parseFloat(m[2]); b = parseFloat(m[3]); }
  }
  if (!m) return null;
  const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const rl = lin(r), gl = lin(g), bl = lin(b);
  const l_ = Math.cbrt(0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl);
  const m_ = Math.cbrt(0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl);
  const s_ = Math.cbrt(0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl);
  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

// One tint for one node: the family's hue walked by the node's phase, the
// lightness flipped for a light theme, and then the legality loop, which
// shifts hue until the tint clears every kind colour or settles for the
// farthest it found. Deterministic: no randomness, same inputs same tint.
function artTintResolve(palette, phase, dark, kindLabs, rig) {
  const R = rig || ART_RIG;
  let h = ((palette.baseHue + (phase - 0.5) * palette.hueVariance) % 360 + 360) % 360;
  const l = dark ? palette.lightness : Math.max(0.25, Math.min(0.95, 1 - palette.lightness * 0.75));
  const c = Math.min(palette.chroma * (R.chromaBoost || 1), R.maxChroma);
  const labs = Array.isArray(kindLabs) ? kindLabs.filter(Boolean) : [];
  const de = (hue) => {
    const rad = hue * Math.PI / 180;
    const a = c * Math.cos(rad), b = c * Math.sin(rad);
    let min = Infinity;
    for (const k of labs) min = Math.min(min, Math.hypot(l - k.L, a - k.a, b - k.b));
    return min;
  };
  let best = { h, d: de(h) };
  for (let i = 0; i < 12 && best.d < R.minKindDistance; i++) {
    h = (h + 30) % 360;
    const d = de(h);
    if (d > best.d) best = { h, d };
  }
  return { l, c, h: best.h, css: 'oklch(' + l.toFixed(3) + ' ' + c.toFixed(3) + ' ' + best.h.toFixed(1) + ')' };
}

// ── the generators ───────────────────────────────────────────────────────────
// Each is a pure function (nodes, center, seed) -> piece, where nodes are the
// RESIDUE (the caller filters through artResidue; a generator never decides
// eligibility) and a piece is an immutable set of per-node targets. Targets
// are already clamped to the displacement budget here, and validated against
// land afterward by artValidate, because a generator knows form and knows
// nothing about geography. `phase` is the piece's own choreography (3D brief
// D.6): reveal order belongs to the artwork, never to array order.

function artTargets() { return new Map(); }

function artNearest(nodes, center, cap) {
  return nodes
    .map((n) => ({ n, d: vAngle(n.at, center) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.min(nodes.length, cap))
    .map((x) => x.n);
}

const ART_FORMS = {
  // A curved, tapered body with a dorsal spine: gathers at the tail, reads as
  // a school resting on the swell. Reveal runs tail to head.
  shoal(nodes, center, seed) {
    const rng = artPrng(seed);
    const basis = artBasis(center);
    const curvature = rng.range(0.8, 1.4);
    const length = rng.range(0.24, 0.38);
    const targets = artTargets();
    const pool = artNearest(nodes, basis.c, 36);
    const count = pool.length;
    pool.forEach((n, i) => {
      const u = (i / count - 0.5) * length;
      const taper = Math.cos((u / length) * Math.PI);
      const v = Math.sin(u * curvature * 4.0) * 0.08 * taper + rng.range(-0.015, 0.015);
      const want = artOnSphere(basis, u, v);
      const target = artClampDisp(n.at, want, 0.16);
      const distFromAxis = Math.abs(v);
      targets.set(n.id, {
        id: n.id,
        sourceAt: { x: n.at.x, y: n.at.y, z: n.at.z },
        targetAt: target,
        altitude: Math.max(0, (0.18 - distFromAxis * 1.2) * taper),
        sizeMultiplier: 0.85 + taper * 0.40,
        phase: i / count,
      });
    });
    return { id: 'shoal-' + seed, name: 'Shoal', form: 'shoal', seed, center: basis.c,
      palette: ART_PALETTES['bioluminescence'], targets };
  },

  // A radial spiral with petal ridges around a deliberately empty eye: the
  // void is the piece's negative space, protected by the ledger. Reveal runs
  // centre to perimeter.
  tidalBloom(nodes, center, seed) {
    const rng = artPrng(seed);
    const basis = artBasis(center);
    const petals = Math.floor(rng.range(4, 7));
    const maxRadius = rng.range(0.18, 0.28);
    const targets = artTargets();
    const pool = artNearest(nodes, basis.c, 42);
    const count = pool.length;
    pool.forEach((n, i) => {
      const progress = i / count;
      const theta = progress * Math.PI * 2 * 2.2;
      const r = ART_RIG.voidRadius + (maxRadius - ART_RIG.voidRadius) * Math.sqrt(progress);
      const finalR = r + Math.sin(theta * petals) * 0.025;
      const want = artOnSphere(basis, Math.cos(theta) * finalR, Math.sin(theta) * finalR);
      targets.set(n.id, {
        id: n.id,
        sourceAt: { x: n.at.x, y: n.at.y, z: n.at.z },
        targetAt: artClampDisp(n.at, want, ART_RIG.maxDisplacement),
        altitude: Math.sin(progress * Math.PI) * 0.22,
        sizeMultiplier: 0.82 + Math.sin(progress * Math.PI) * 0.35,
        phase: progress,
      });
    });
    return { id: 'bloom-' + seed, name: 'Tidal Bloom', form: 'tidalBloom', seed, center: basis.c,
      palette: ART_PALETTES['moonlit-coral'], targets };
  },

  // An asymmetric rolling crest that steepens and drops off into a few sparse
  // spray nodes: the spray is the moment of surprise. Reveal follows the roll.
  breaker(nodes, center, seed) {
    const rng = artPrng(seed);
    const basis = artBasis(center);
    const arcSpan = rng.range(0.25, 0.36);
    const targets = artTargets();
    const pool = artNearest(nodes, basis.c, 32);
    const count = pool.length;
    pool.forEach((n, i) => {
      const t = i / count;
      const u = (t - 0.5) * arcSpan;
      const crest = Math.pow(Math.sin(t * Math.PI * 0.85), 2.5);
      const v = crest * 0.12 + rng.range(-0.01, 0.01);
      const want = artOnSphere(basis, u, v);
      targets.set(n.id, {
        id: n.id,
        sourceAt: { x: n.at.x, y: n.at.y, z: n.at.z },
        targetAt: artClampDisp(n.at, want, 0.17),
        altitude: t > 0.8 ? rng.range(0.04, 0.08) : crest * ART_RIG.maxAltitude,
        sizeMultiplier: t > 0.8 ? 0.78 : 0.90 + crest * 0.38,
        phase: t,
      });
    });
    return { id: 'breaker-' + seed, name: 'Breaker', form: 'breaker', seed, center: basis.c,
      palette: ART_PALETTES['stormglass'], targets };
  },

  // Sparse and almost still: a handful of nodes nudged into balance, negative
  // space dominant, size never touched. The quietest thing the engine makes.
  constellation(nodes, center, seed) {
    const rng = artPrng(seed);
    const basis = artBasis(center);
    const targets = artTargets();
    // sorted BEFORE the slice: without it the pool followed input order, and
    // the same sea loaded in a different order made a different constellation,
    // which invariant 9 (choice stable across reload) forbids
    const pool = nodes
      .map((n) => ({ n, d: vAngle(n.at, basis.c) }))
      .filter((x) => x.d < 0.35)
      .sort((a, b) => a.d - b.d)
      .slice(0, 14)
      .map((x) => x.n);
    const count = pool.length || 1;
    pool.forEach((n, i) => {
      const angle = (i / count) * Math.PI * 2;
      const rad = 0.12 + rng.range(-0.03, 0.03);
      const want = artOnSphere(basis, Math.cos(angle) * rad, Math.sin(angle) * rad);
      targets.set(n.id, {
        id: n.id,
        sourceAt: { x: n.at.x, y: n.at.y, z: n.at.z },
        targetAt: artClampDisp(n.at, want, 0.06),
        altitude: rng.range(0.02, 0.06),
        sizeMultiplier: 1.0,
        phase: i / count,
      });
    });
    return { id: 'constellation-' + seed, name: 'Constellation', form: 'constellation', seed,
      center: basis.c, palette: ART_PALETTES['porcelain-wave'], targets };
  },
};

// ── the score compiler: agent-composed gesture pieces (tracker 3.2) ─────────
// The four ART_FORMS above are the reference works. This is the instrument an
// agent actually plays: it emits one small JSON SCORE in the gesture
// vocabulary (docs/SEA-ART-PROTOCOL.md is the hand-to-agent contract), and
// this compiler turns the score into a piece deterministically. The division
// of labour is the whole point of the protocol's token budget: the agent
// spends tokens on CHOICES (which gestures, where, why, and what the piece
// reads as) and zero tokens on geometry, easing, colour math or law. And the
// law cannot be delegated away: a compiled piece goes through artValidate
// like any other, and every parameter is clamped to the ledger here first, so
// a wild score degrades to a legal piece and an ill-formed one is refused
// with reasons the agent can read and retry on.
//
// Grammar (3D brief D.1, enforced as rejection): exactly one dominant
// gesture, at most two supporting gestures, at most one surprise.

const ART_GESTURES = {
  // dominants lay the form down; each assigns every working node a place,
  // a phase (its moment in the reveal) and a first pass at height and size.
  // trace is the open end of the vocabulary: the agent draws its own line as
  // a handful of points, and the engine makes it lawful. It is where the
  // remarkable lives; the other eight are where the reliable lives.
  dominant: ['gather', 'curl', 'fan', 'ridge', 'bloom', 'shoal', 'constellate', 'silhouette', 'trace'],
  // supports reshape what the dominant made; ridge is in both lists because
  // a crest can be the form or can be weather on someone else's form
  support: ['taper', 'hollow', 'fold', 'counterweight', 'ridge'],
};

// A trace's drawing, reduced to the points that are actually points. Shared
// by the grammar check (which refuses a drawing with fewer than three) and
// the compiler (which then never sees an invalid one).
function artTracePoints(g) {
  return (Array.isArray(g.points) ? g.points : [])
    .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

// A pose, resampled the way the trace op samples its drawing (recentre, fit
// to span, walk by arc length) but with no jitter: pose correspondence wants
// clean geometry, and the jitter that keeps a drawn line from being sterile
// lives in pose zero's compiled targets and rides every morph unchanged.
function artPoseResample(g, count, spanRad, dirDeg) {
  const raw = artTracePoints(g).slice(0, 24);
  let mu = 0, mv = 0;
  for (const p of raw) { mu += p[0]; mv += p[1]; }
  mu /= raw.length; mv /= raw.length;
  let reach = 0;
  const pts = raw.map((p) => {
    const u = p[0] - mu, v = p[1] - mv;
    reach = Math.max(reach, Math.hypot(u, v));
    return { u, v };
  });
  const k = reach > 1e-9 ? (spanRad * 0.5) / reach : 0;
  for (const p of pts) { p.u *= k; p.v *= k; }
  if (g.close) pts.push({ u: pts[0].u, v: pts[0].v });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].u - pts[i - 1].u, pts[i].v - pts[i - 1].v));
  }
  const total = cum[cum.length - 1] || 1e-9;
  const crest = Math.max(0, Math.min(1, g.crest != null ? g.crest : 0.4));
  const th = (dirDeg || 0) * Math.PI / 180;
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0;
    const d = t * total;
    let seg = 1;
    while (seg < cum.length - 1 && cum[seg] < d) seg++;
    const segLen = cum[seg] - cum[seg - 1] || 1e-9;
    const f = Math.max(0, Math.min(1, (d - cum[seg - 1]) / segLen));
    let u = pts[seg - 1].u + (pts[seg].u - pts[seg - 1].u) * f;
    let v = pts[seg - 1].v + (pts[seg].v - pts[seg - 1].v) * f;
    if (th) { const cu = u * Math.cos(th) - v * Math.sin(th); v = u * Math.sin(th) + v * Math.cos(th); u = cu; }
    out.push({ u, v, alt: Math.sin(Math.PI * t) * 0.16 * crest });
  }
  return out;
}

// The keyframe correspondence gate (motion brief Part F.5): keyframes may
// change pose, not topology, and when correspondence is uncertain the gate
// refuses beautifully rather than morphing badly. Reversal is detected (a
// tail-to-head pose never pairs against head-to-tail: the orientation with
// the smaller total correspondence distance wins, deterministically), pose
// distance is capped so the form stays one creature, and interior blends are
// checked so the morph never folds the form through itself.
function artKeyframeGate(dom, poses, count) {
  const spanRad = Math.min(Math.abs(dom.span != null ? dom.span : 0.28), 0.34);
  const A = artPoseResample(dom, count, spanRad, dom.dir);
  const deltas = [];
  for (const g of poses) {
    const pose = Object.assign({}, g, { close: dom.close });
    const fwd = artPoseResample(pose, count, spanRad, dom.dir);
    const rev = fwd.slice().reverse();
    const dist = (B) => {
      let s = 0;
      for (let i = 0; i < count; i++) s += Math.hypot(B[i].u - A[i].u, B[i].v - A[i].v);
      return s;
    };
    const B = dist(rev) < dist(fwd) ? rev : fwd;
    let maxDelta = 0;
    const d = [];
    for (let i = 0; i < count; i++) {
      const du = B[i].u - A[i].u, dv = B[i].v - A[i].v, dAlt = B[i].alt - A[i].alt;
      maxDelta = Math.max(maxDelta, Math.hypot(du, dv));
      d.push({ du, dv, dAlt });
    }
    if (maxDelta > spanRad * 0.5) {
      return { ok: false, why: 'keyframes: poses too far apart to morph honestly (' +
        maxDelta.toFixed(3) + ' rad against a limit of ' + (spanRad * 0.5).toFixed(3) + ')' };
    }
    // interior blends must not collapse neighbours: the fold check. Linear
    // blending is sampled at the quarter points; a gap that pinches below a
    // small share of its endpoint gaps means the morph passes through itself.
    for (let i = 0; i + 1 < count; i++) {
      const gapEnd = Math.min(
        Math.hypot(A[i].u - A[i + 1].u, A[i].v - A[i + 1].v),
        Math.hypot(B[i].u - B[i + 1].u, B[i].v - B[i + 1].v));
      if (gapEnd < 1e-6) continue;
      for (const w of [0.25, 0.5, 0.75]) {
        const gu = (A[i].u + d[i].du * w) - (A[i + 1].u + d[i + 1].du * w);
        const gv = (A[i].v + d[i].dv * w) - (A[i + 1].v + d[i + 1].dv * w);
        if (Math.hypot(gu, gv) < gapEnd * 0.15) {
          return { ok: false, why: 'keyframes: the morph would fold the form through itself' };
        }
      }
    }
    deltas.push({ d, maxDelta });
  }
  return { ok: true, deltas, spanRad };
}

// Working items are plain records in the tangent plane: {n, u, v, alt, size,
// phase}. Dominants may return a smaller array (constellate wants sparseness);
// supports mutate in place. Angles arrive in degrees because that is what a
// model writes without thinking; spans arrive in radians of arc like the rig.
function artGestureOps() {
  const rad = (deg) => (deg || 0) * Math.PI / 180;
  const span = (g, fallback) => Math.min(Math.abs(g.span != null ? g.span : fallback), 0.34);
  const bell = (t) => Math.sin(Math.max(0, Math.min(1, t)) * Math.PI);
  const turn = (w, theta) => {
    const cu = w.u * Math.cos(theta) - w.v * Math.sin(theta);
    const cv = w.u * Math.sin(theta) + w.v * Math.cos(theta);
    w.u = cu; w.v = cv;
  };
  return {
    // a population pulled toward a shared centre: a soft Fermat disc,
    // revealed from the middle outward
    gather(working, g, rng) {
      const s = span(g, 0.14);
      working.forEach((w, i) => {
        const th = i * 2.399963;
        const r = s * Math.sqrt((i + 0.5) / working.length);
        w.u = Math.cos(th) * r; w.v = Math.sin(th) * r;
        w.alt = 0.03 * (1 - r / s);
        w.phase = r / s;
      });
      return working;
    },
    // an arc that tightens: a spiral path walked tail to head, with a gentle
    // crest at the middle of the journey
    curl(working, g, rng) {
      const s = span(g, 0.30);
      const turns = g.turns != null ? Math.max(0.2, Math.min(2.5, g.turns)) : 1.1;
      const width = 0.03;
      working.forEach((w, i) => {
        const t = i / working.length;
        const ang = rad(g.dir) + turns * Math.PI * 2 * t;
        const r = s * 0.5 * (0.15 + 0.85 * t);
        w.u = Math.cos(ang) * r + rng.range(-width, width);
        w.v = Math.sin(ang) * r + rng.range(-width, width);
        w.alt = 0.10 * bell(t);
        w.phase = t;
      });
      return working;
    },
    // rays opening around an axis, revealed around the sweep
    fan(working, g, rng) {
      const s = span(g, 0.28);
      const spread = rad(g.spread != null ? g.spread : 110);
      const rays = Math.max(3, Math.min(9, Math.round(g.rays || 5)));
      const steps = Math.ceil(working.length / rays);
      working.forEach((w, i) => {
        const k = i % rays, step = Math.floor(i / rays);
        const ang = rad(g.dir) - spread / 2 + spread * (rays > 1 ? k / (rays - 1) : 0.5);
        const r = s * (0.2 + 0.8 * (step + 1) / steps) + rng.range(-0.008, 0.008);
        w.u = Math.cos(ang) * r; w.v = Math.sin(ang) * r;
        w.alt = 0.04 * (r / s);
        w.phase = (rays > 1 ? k / (rays - 1) : 0.5) * 0.8 + 0.2 * (step / steps);
      });
      return working;
    },
    // a line with a crest: as a dominant it IS the form, revealed end to end
    ridge(working, g, rng) {
      const s = span(g, 0.30);
      working.forEach((w, i) => {
        const t = i / working.length;
        const along = (t - 0.5) * s;
        const perp = rng.range(-0.02, 0.02);
        w.u = along; w.v = perp;
        turn(w, rad(g.dir));
        w.alt = bell(t) * 0.20;
        w.size = 0.9 + bell(t) * 0.3;
        w.phase = t;
      });
      return working;
    },
    // a spiral around a protected empty eye, revealed centre to perimeter
    bloom(working, g, rng) {
      const s = span(g, 0.24);
      const petals = Math.max(3, Math.min(8, Math.round(g.petals || 5)));
      working.forEach((w, i) => {
        const t = i / working.length;
        const theta = t * Math.PI * 2 * 2.2 + rad(g.dir);
        const r = ART_RIG.voidRadius + (s * 0.5 - ART_RIG.voidRadius) * Math.sqrt(t)
          + Math.sin(theta * petals) * 0.02;
        w.u = Math.cos(theta) * r; w.v = Math.sin(theta) * r;
        w.alt = bell(t) * 0.20;
        w.size = 0.85 + bell(t) * 0.3;
        w.phase = t;
      });
      return working;
    },
    // a curved tapered body: the school resting on the swell, tail to head
    shoal(working, g, rng) {
      const s = span(g, 0.30);
      working.forEach((w, i) => {
        const t = i / working.length;
        const along = (t - 0.5) * s;
        const taper = Math.cos((along / s) * Math.PI);
        const off = Math.sin(along * 4.5) * 0.07 * taper + rng.range(-0.012, 0.012);
        w.u = along; w.v = off;
        turn(w, rad(g.dir));
        w.alt = Math.max(0, (0.16 - Math.abs(off) * 1.2) * taper);
        w.size = 0.85 + 0.3 * taper;
        w.phase = t;
      });
      return working;
    },
    // sparse and almost still: a handful nudged into a ring of balance. The
    // one dominant allowed to shrink the working set.
    constellate(working, g, rng) {
      const s = span(g, 0.24);
      const count = Math.max(5, Math.min(working.length, Math.round(g.count || 12)));
      const kept = working.slice(0, count);
      kept.forEach((w, i) => {
        const ang = (i / count) * Math.PI * 2 + rad(g.dir);
        const r = s * 0.5 + rng.range(-0.03, 0.03);
        w.u = Math.cos(ang) * r; w.v = Math.sin(ang) * r;
        w.alt = rng.range(0.02, 0.06);
        w.phase = i / count;
      });
      return kept;
    },
    // a closed suggestive outline, interior deliberately empty: from across
    // the room a creature, up close just notes (3D brief D.8)
    silhouette(working, g, rng) {
      const s = span(g, 0.28);
      const p1 = rng.range(0, Math.PI * 2), p2 = rng.range(0, Math.PI * 2);
      working.forEach((w, i) => {
        const t = i / working.length;
        const theta = t * Math.PI * 2 + rad(g.dir);
        const r = s * 0.5 * (0.62 + 0.23 * Math.sin(2 * theta + p1) + 0.15 * Math.sin(3 * theta + p2));
        w.u = Math.cos(theta) * r; w.v = Math.sin(theta) * r;
        w.alt = 0.05;
        w.phase = t;
      });
      return working;
    },
    // the agent's own drawn line: 3 to 24 points in ANY units (the engine
    // recentres the sketch and fits it to span, so "[[0,0],[2,3],[5,2]]" is a
    // legal drawing), resampled evenly by arc length so node count never
    // distorts the shape, revealed along the stroke the way it was drawn.
    // This is how a piece gets to be a heron rather than a spiral: the eight
    // named dominants are the reliable vocabulary, trace is the open one.
    trace(working, g, rng) {
      const s = span(g, 0.28);
      const raw = artTracePoints(g).slice(0, 24);
      // recentre on the sketch's own centroid, then fit its reach to span
      let mu = 0, mv = 0;
      for (const p of raw) { mu += p[0]; mv += p[1]; }
      mu /= raw.length; mv /= raw.length;
      let reach = 0;
      const pts = raw.map((p) => {
        const u = p[0] - mu, v = p[1] - mv;
        reach = Math.max(reach, Math.hypot(u, v));
        return { u, v };
      });
      const k = reach > 1e-9 ? (s * 0.5) / reach : 0;
      for (const p of pts) { p.u *= k; p.v *= k; }
      if (g.close) pts.push({ u: pts[0].u, v: pts[0].v });
      const cum = [0];
      for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(pts[i].u - pts[i - 1].u, pts[i].v - pts[i - 1].v));
      }
      const total = cum[cum.length - 1] || 1e-9;
      const crest = Math.max(0, Math.min(1, g.crest != null ? g.crest : 0.4));
      working.forEach((w, i) => {
        const t = working.length > 1 ? i / (working.length - 1) : 0;
        const d = t * total;
        let seg = 1;
        while (seg < cum.length - 1 && cum[seg] < d) seg++;
        const segLen = cum[seg] - cum[seg - 1] || 1e-9;
        const f = Math.max(0, Math.min(1, (d - cum[seg - 1]) / segLen));
        w.u = pts[seg - 1].u + (pts[seg].u - pts[seg - 1].u) * f + rng.range(-0.008, 0.008);
        w.v = pts[seg - 1].v + (pts[seg].v - pts[seg - 1].v) * f + rng.range(-0.008, 0.008);
        if (g.dir) turn(w, rad(g.dir));
        w.alt = bell(t) * 0.16 * crest;
        w.phase = t;
      });
      return working;
    },
    // ── supports ────────────────────────────────────────────────────────────
    // size diminishing toward a direction: the form thins out where it points
    taper(working, g) {
      const th = rad(g.toward != null ? g.toward : g.dir);
      const amt = Math.max(0, Math.min(1, g.amount != null ? g.amount : 0.6));
      let lo = Infinity, hi = -Infinity;
      for (const w of working) {
        const p = w.u * Math.cos(th) + w.v * Math.sin(th);
        if (p < lo) lo = p; if (p > hi) hi = p;
      }
      const range = Math.max(1e-6, hi - lo);
      for (const w of working) {
        const p01 = ((w.u * Math.cos(th) + w.v * Math.sin(th)) - lo) / range;
        w.size *= (1 + 0.12 * amt) - 0.42 * amt * p01;
      }
    },
    // negative space carved and protected: nodes inside the void step out to
    // its rim, and the eye constructs what is missing
    hollow(working, g) {
      const cu = g.at ? g.at[0] || 0 : 0, cv = g.at ? g.at[1] || 0 : 0;
      const r = Math.min(Math.abs(g.radius != null ? g.radius : ART_RIG.voidRadius * 2), 0.12);
      for (const w of working) {
        const d = Math.hypot(w.u - cu, w.v - cv);
        if (d < r) {
          const scale = (r + 0.008) / Math.max(d, 1e-6);
          w.u = cu + (w.u - cu) * scale;
          w.v = cv + (w.v - cv) * scale;
        }
      }
    },
    // the form parted along an axis, a seam of sea showing through
    fold(working, g) {
      const th = rad(g.dir);
      const gap = Math.min(Math.abs(g.gap != null ? g.gap : 0.05), 0.10) / 2;
      const px = -Math.sin(th), py = Math.cos(th);
      for (const w of working) {
        const s = w.u * px + w.v * py;
        const shift = s >= 0 ? gap : -gap;
        w.u += px * shift; w.v += py * shift;
      }
    },
    // a small mass placed against the main one, so the composition balances
    // instead of listing; its members arrive late in the reveal
    counterweight(working, g, rng) {
      const cu = g.at ? g.at[0] || 0 : -0.16, cv = g.at ? g.at[1] || 0 : -0.10;
      const frac = Math.max(0.05, Math.min(0.25, g.fraction != null ? g.fraction : 0.12));
      const k = Math.max(2, Math.round(working.length * frac));
      const picked = working.slice().sort((a, b) => b.phase - a.phase).slice(0, k);
      picked.forEach((w, j) => {
        w.u = cu + rng.range(-0.03, 0.03);
        w.v = cv + rng.range(-0.03, 0.03);
        w.alt = Math.min(w.alt, 0.05);
        w.size = Math.min(w.size, 1.0);
        w.phase = 0.80 + 0.15 * (j / k);
      });
    },
    // as a support, ridge is weather: a crest of height added along an axis
    ridgeSupport(working, g) {
      const th = rad(g.dir);
      const amt = Math.max(0, Math.min(1, g.amount != null ? g.amount : 0.6));
      let lo = Infinity, hi = -Infinity;
      for (const w of working) {
        const p = w.u * Math.cos(th) + w.v * Math.sin(th);
        if (p < lo) lo = p; if (p > hi) hi = p;
      }
      const range = Math.max(1e-6, hi - lo);
      for (const w of working) {
        const p01 = ((w.u * Math.cos(th) + w.v * Math.sin(th)) - lo) / range;
        w.alt += bell(p01) * 0.14 * amt;
      }
    },
  };
}

// Tattoo linework (apc-ai-course#186): several strokes laid as ink. One
// shared fit (the whole drawing's centroid and reach), so every stroke keeps
// its proportion to the others; ink is distributed by length times weight,
// so a bold stroke gets more nodes as well as larger ones, which is how
// node DENSITY becomes the shading. Each node's phase is its ink order
// (stroke by stroke, along the stroke), so the reveal draws the tattoo the
// way an artist would, and motion travels the linework in drawing order.
// Layers lift into relief; taper breathes the weight out at stroke ends.
// Mutates `working` in place, deterministically.
//
// Phase 8.1 generalizes the channel into object space WITHOUT moving the flat
// path one bit (build plan 4.1): a point may be [u,v] or [u,v,w], w joins the
// shared fit so the drawing normalizes as one volume, and per-stroke `depth`
// and `smooth` are opt-ins. A FLAT score takes exactly the arithmetic it took
// in 7.3, in the same order, drawing the same rng values -- including the
// two-argument Math.hypot, which is NOT bit-identical to the three-argument
// form with a zero third term (measured: they disagree on ~1.2% of inputs).
// `volume` is the piece-level block, or null for a flat piece.
// The shared fit, factored out in 8.6 so the SKELETON can be built from the
// same centrelines the ink is laid on. Bones are structure and must not be
// re-derived from the sampled cloud, nor fitted a second time by a copy of this
// arithmetic that could drift from it. Returns the fitted polylines in piece
// units, in authored stroke order.
function artFitStrokes(strokes, spanAsk, volume) {
  const span = Math.min(Math.abs(spanAsk != null ? spanAsk : 0.8), 1.2);
  const solid = !!volume;
  const pts = strokes.map((g) => {
    const raw = artTracePoints(g).slice(0, 64)
      .map((p) => ({ u: p[0], v: p[1], w: Number.isFinite(p[2]) ? p[2] : 0 }));
    if (g.close && raw.length > 2) raw.push({ u: raw[0].u, v: raw[0].v, w: raw[0].w });
    return g.smooth === true ? artSmoothPoly(raw) : raw;
  });
  let mu = 0, mv = 0, mw = 0, np = 0;
  for (const sp of pts) for (const p of sp) { mu += p.u; mv += p.v; mw += p.w; np++; }
  mu /= np; mv /= np; mw /= np;
  let reach = 1e-9;
  for (const sp of pts) {
    for (const p of sp) {
      reach = Math.max(reach, solid
        ? Math.hypot(p.u - mu, p.v - mv, p.w - mw)
        : Math.hypot(p.u - mu, p.v - mv));
    }
  }
  const k = (span * 0.5) / reach;
  for (const sp of pts) {
    for (const p of sp) { p.u = (p.u - mu) * k; p.v = (p.v - mv) * k; p.w = (p.w - mw) * k; }
  }
  return pts;
}

// Does this score speak the semantic vocabulary? Any importance, or any
// thread, puts the whole score on semantic allocation.
function artSemantic(strokes) {
  return (strokes || []).some((g) => g && (ART_IMPORTANCE[g.importance] || g.section === 'thread'));
}
function artImportanceOf(stroke) {
  if (stroke && ART_IMPORTANCE[stroke.importance]) return stroke.importance;
  return stroke && stroke.section === 'thread' ? 'detail' : 'secondary';
}
// MATERIAL BY MEANING, NOT AREA. A thread takes what its length needs at a
// filament's spacing (capped). The rest is shared among solids by the square
// root of their surface demand (so a long thin part cannot win on length
// alone) times their importance weight, then held between each importance's
// floor and cap by water-filling: excess over a cap flows to parts still under
// theirs, and a primary part never starves below its floor.
function artSemanticCounts(meta, strokes, demand, total) {
  const n = meta.length;
  const counts = new Array(n).fill(0);
  const threads = [], solids = [];
  meta.forEach((m, i) => ((m.sec && m.sec.kind === 'thread') ? threads : solids).push(i));
  let left = total;
  for (const i of threads) {
    const want = Math.max(ART_THREAD.min, Math.round(meta[i].len / ART_THREAD.spacing));
    counts[i] = Math.max(2, Math.min(want, Math.floor(total * ART_THREAD.cap)));
    left -= counts[i];
  }
  if (!solids.length) {
    // all threads: whatever is left thickens the lines evenly
    let k = 0;
    while (left > 0 && threads.length) { counts[threads[k++ % threads.length]]++; left--; }
    return counts;
  }
  const imp = solids.map((i) => ART_IMPORTANCE[artImportanceOf(strokes[i])]);
  const raw = solids.map((i, k) => Math.sqrt(Math.max(demand[i], 1e-9)) * imp[k].w);
  const floorN = imp.map((p) => Math.max(p.min || 2, Math.round(total * p.floor)));
  const capN = imp.map((p, k) => Math.max(floorN[k], Math.floor(total * p.cap)));
  const share = new Array(solids.length).fill(0);
  const fixed = new Array(solids.length).fill(false);
  let pool = Math.max(0, left);
  for (let pass = 0; pass < 8; pass++) {
    let wsum = 0;
    for (let k = 0; k < solids.length; k++) if (!fixed[k]) wsum += raw[k];
    if (!(wsum > 0)) break;
    let changed = false;
    for (let k = 0; k < solids.length; k++) {
      if (fixed[k]) continue;
      share[k] = pool * raw[k] / wsum;
      if (share[k] > capN[k]) { share[k] = capN[k]; fixed[k] = true; changed = true; }
      else if (share[k] < floorN[k]) { share[k] = floorN[k]; fixed[k] = true; changed = true; }
    }
    if (!changed) break;
    pool = Math.max(0, left - share.reduce((a, s, k) => a + (fixed[k] ? s : 0), 0));
  }
  solids.forEach((i, k) => { counts[i] = Math.max(2, Math.floor(share[k])); });
  return counts;
}

function artStrokesLay(working, strokes, spanAsk, rng, volume) {
  const span = Math.min(Math.abs(spanAsk != null ? spanAsk : 0.8), 1.2);
  const solid = !!volume;
  const pts = artFitStrokes(strokes, spanAsk, volume);
  const meta = pts.map((sp, i) => {
    const cum = [0];
    for (let j = 1; j < sp.length; j++) {
      cum.push(cum[j - 1] + Math.hypot(sp[j].u - sp[j - 1].u, sp[j].v - sp[j - 1].v));
    }
    const w = strokes[i].weight != null ? strokes[i].weight : 1;
    // stroke-level depth, else the piece's volume profile, else flat
    // (captured spec 3.4): a stroke may always overrule the block above it
    const dp = strokes[i].depth || null;
    const profile = dp && dp.profile ? dp.profile : (volume ? volume.profile : 'flat');
    const dScale = dp && dp.scale != null ? Math.max(0, Math.min(2, dp.scale))
      : (volume ? volume.depthScale : 0);
    return { sp, cum, len: cum[cum.length - 1] || 1e-9, w, layer: strokes[i].layer || 0,
      profile: profile || 'flat', dScale: dScale || 0, sec: artSectionOf(strokes[i]) };
  });
  // A swept stroke is a SURFACE and an ink stroke is a LINE, so they cannot ask
  // for material in the same units. The boost converts a sweep's circumference
  // into ink-line widths, which is the one currency both understand. Critically
  // it is 1 for every ink stroke, so a score with no sections allocates exactly
  // as it did before, byte for byte.
  const demand = meta.map((m) => {
    if (!m.sec) return m.len * m.w;
    const boost = Math.max(1, Math.min(ART_SWEEP.boostMax,
      (2 * Math.PI * m.sec.mean) / (ART_SWEEP.lineWidth * Math.max(m.w, 0.05))));
    return m.len * m.w * boost;
  });
  let inkTotal = 0;
  for (const d of demand) inkTotal += d;
  const semantic = artSemantic(strokes);
  const counts = semantic
    ? artSemanticCounts(meta, strokes, demand, working.length)
    : meta.map((m, i) => Math.max(2, Math.floor(working.length * (demand[i] / inkTotal))));
  let used = counts.reduce((a, b) => a + b, 0);
  // rounding drift is absorbed by the boldest strokes, never below 2 a stroke
  // (semantic: drift goes to the most important solids, never to a thread or
  // a detail that has already had its share)
  const semW = (i) => (meta[i].sec && meta[i].sec.kind === 'thread') ? 0 : ART_IMPORTANCE[artImportanceOf(strokes[i])].w;
  const order = semantic
    ? meta.map((m, i) => i).filter((i) => semW(i) >= 0.55).sort((a, b) => semW(b) - semW(a) || demand[b] - demand[a])
    : meta.map((m, i) => i).sort((a, b) => demand[b] - demand[a]);
  if (!order.length) meta.forEach((m, i) => order.push(i));
  let oi = 0;
  while (used < working.length) { counts[order[oi % order.length]]++; used++; oi++; }
  while (used > working.length) {
    const i = order[oi % order.length];
    if (counts[i] > 2) { counts[i]--; used--; }
    oi++;
  }
  let idx = 0;
  meta.forEach((m, si) => {
    // ── the swept path: this stroke is a bone, not a line ───────────────────
    // Station-major order, so the reveal inks the body from root to tip the way
    // an artist would build it, and so motion travelling the drawing order
    // travels the anatomy.
    //
    // Every node keeps its PROVENANCE (stroke, station s, ring angle, radius).
    // That is not bookkeeping: it is what lets motion deform the SKELETON and
    // have the skin follow. Feed a tube's dots independently through a
    // deformation field and the rings shear, the cross-sections squash and a
    // wing tears into a soft cloud. Articulation, not distortion.
    if (m.sec) {
      const n = counts[si];
      const isThread = m.sec.kind === 'thread';
      const { ring, axial } = isThread ? { ring: 1, axial: Math.max(2, n) } : artSweepSplit(n, m.len, m.sec.mean);
      const stations = artStations(m.sp, axial);
      const thin = m.sec.kind === 'blade' ? ART_BLADE_THIN : m.sec.kind === 'box' ? m.sec.thick : 1;
      const box = m.sec.kind === 'box';
      for (let k = 0; k < n; k++, idx++) {
        const w = working[idx];
        const si2 = Math.min(stations.length - 1, Math.floor(k / ring));
        const j = k % ring;
        const st = stations[si2];
        const r = isThread ? 0 : artGirthAt(m.sec.girth, st.s);
        // a box's end stations are its lids: their ring is laid on nested
        // rectangles, so the ends read as solid faces rather than open pipes
        const fill = box && (si2 === 0 || si2 === stations.length - 1) ? ART_BOX_LID[j % ART_BOX_LID.length] : 1;
        const { cw, cd } = artSectionXY(j / ring, r, thin, box, fill);
        w.u = st.p.x + st.N.x * cw + st.B.x * cd;
        w.v = st.p.y + st.N.y * cw + st.B.y * cd;
        w.w = st.p.z + st.N.z * cw + st.B.z * cd;
        w.size = m.w * (0.55 + 0.35 * Math.sin(Math.PI * st.s));
        w.alt = 0.012 + m.layer * 0.05;
        w.phase = idx;
        // the station INDEX and the ring size ride along with the parameter,
        // not instead of it: reskinning from a float `s` would land near where
        // the node started, and the REST invariant needs exactly where.
        w.sweep = { stroke: si, s: st.s, si: si2, axial: stations.length, ring, ang: j / ring, r,
          thin, kind: m.sec.kind, box, fill };
      }
      return;
    }
    for (let j = 0; j < counts[si]; j++, idx++) {
      const w = working[idx];
      const t = counts[si] > 1 ? j / (counts[si] - 1) : 0;
      const d = t * m.len;
      let seg = 1;
      while (seg < m.cum.length - 1 && m.cum[seg] < d) seg++;
      const segLen = m.cum[seg] - m.cum[seg - 1] || 1e-9;
      const f = Math.max(0, Math.min(1, (d - m.cum[seg - 1]) / segLen));
      // jitter scales with weight: a bold stroke's ink spreads a little,
      // a fine one stays crisp
      w.u = m.sp[seg - 1].u + (m.sp[seg].u - m.sp[seg - 1].u) * f + rng.range(-0.004, 0.004) * m.w;
      w.v = m.sp[seg - 1].v + (m.sp[seg].v - m.sp[seg - 1].v) * f + rng.range(-0.004, 0.004) * m.w;
      w.size = m.w * (0.6 + 0.6 * Math.sin(Math.PI * t));
      w.alt = 0.012 + m.layer * 0.05 + rng.range(0, 0.004);
      w.phase = idx;
      // depth: the authored w, plus the layer read as relief the way 7.3
      // already reads it (schema section 3: layer keeps its meaning as a w
      // baseline offset), plus the stroke's profile. All of it zero, and the
      // whole channel absent, on a flat piece.
      if (solid) {
        w.w = m.sp[seg - 1].w + (m.sp[seg].w - m.sp[seg - 1].w) * f + m.layer * 0.05;
        artApplyDepth(w, m.sp[seg - 1], m.sp[seg], t, idx, m.profile, m.dScale, span * 0.5);
      }
    }
  });
  const denom = Math.max(1, working.length - 1);
  for (const w of working) w.phase = (w.phase / denom) * 0.99;
  return working;
}

// ── the skeleton (phase 8.6.1) ───────────────────────────────────────────────
//
//   CADENCE BELONGS TO THE PIECE. RESPONSE BELONGS TO THE BONE.
//
// 8.5 gave the engine an authored skeleton in everything but name. This reads
// it. Built from BONE INSTANCES, on the fitted centrelines, before any ring or
// scaffold sampling: the skeleton is a property of the bones, never of the
// cloud they generate.
//
// Everything here is inference, so everything here declares confidence and
// fails closed. The engine never pretends to see a skeleton it cannot see, and
// an ambiguous topology must never fall back to deforming the skin, because
// that is the behaviour this phase exists to retire.
const ART_SKEL = {
  // a child endpoint counts as attached within this many local girths of a
  // parent station. Girth-relative rather than absolute, so a thick torso and a
  // hair-thin leg are judged on the same terms.
  joinGirths: 2.2,
  // and only if the best candidate beats the runner-up by this ratio. A neck
  // that merely passes near a wing in 3D must not silently attach to it.
  //
  // 1.45 was originally a guess. Measured against every candidate comparison
  // the fixtures actually produce (dev/sea-art-joint-margins.js, 2026-08-31):
  // 21 attachments, of which 6 are unopposed, and the contested ones span 1.365
  // to 25.067. The threshold sits in a real GAP between 1.365 (the wing trying
  // to attach at its far end, correctly refused, since it already attaches at
  // the other) and 1.573 (the neck to the body, correctly kept). So it is
  // earned rather than intuited, but earned by ONE contested case: re-run the
  // study when a genuinely harder skeleton exists before trusting it further.
  margin: 1.45,
  // how hard structural mass pulls a parent choice. Bones hang off substantial
  // bones, so a thick long candidate beats a thin one at the same distance.
  // Deliberately gentle: it is a tie-breaker between near-equal distances, not
  // a licence for a distant torso to steal a joint from an adjacent wing.
  massBias: 0.35,
  stations: 24,
};

function artBoneLen(sp) {
  let d = 0;
  for (let i = 1; i < sp.length; i++) {
    d += Math.hypot(sp[i].u - sp[i - 1].u, sp[i].v - sp[i - 1].v, (sp[i].w || 0) - (sp[i - 1].w || 0));
  }
  return d;
}

// The closest point on a bone to a probe, as { s, at, d }.
function artNearestStation(bone, probe) {
  const st = artStations(bone.sp, ART_SKEL.stations);
  let best = null;
  for (const s of st) {
    const d = Math.hypot(s.p.x - probe.u, s.p.y - probe.v, s.p.z - (probe.w || 0));
    if (!best || d < best.d) best = { s: s.s, at: s, d };
  }
  return best;
}

// The skeleton, as a FOREST rather than a tree. Disconnected structural
// components are perfectly ordinary (a floating element, a mark made of several
// bodies), and each connected component gets its own root. Making that a
// retrofit later would be an annoying one.
function artSkeleton(bones) {
  const list = (bones || []).filter((b) => b && b.sp && b.sp.length >= 2 && b.section);
  const out = { bones: list, joints: new Map(), components: [], confidence: 0,
    ambiguous: new Set(), supported: true, why: null };
  if (!list.length) { out.why = 'no structural bones'; return out; }

  for (const b of list) { b.len = artBoneLen(b.sp); b.ends = [b.sp[0], b.sp[b.sp.length - 1]]; }

  // ── attachments, UNDIRECTED first ─────────────────────────────────────────
  // Direction is not a property of an attachment. It is a consequence of which
  // bone turns out to be the root, and deciding it too early is a real bug
  // rather than a tidiness point: giving every bone a parent up front made the
  // heron's body a child of one of its own children, which reads as a cycle and
  // failed the entire sculpture. The visualiser caught it on its first run,
  // which is exactly why the visualiser ships in step one.
  // ONE ATTACHMENT PER END, not one per bone. A bone in the middle of a chain
  // attaches at both of its ends, and allowing it a single edge orphaned the
  // heron: the neck's nearest neighbour is the beak at distance exactly zero
  // (they share a coordinate), so neck and beak nominated each other, formed an
  // isolated two-bone component, and left the body unconnected beside them.
  // Proposing per end lets the neck hold the beak at its tip AND the body at
  // its root, which is what a neck does.
  const edges = new Map();
  for (let i = 0; i < list.length; i++) {
    const child = list[i];
    for (let e = 0; e < 2; e++) {
      const cand = [];
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const near = artNearestStation(list[j], child.ends[e]);
        const girth = Math.max(artGirthAt(list[j].girth, near.s), 1e-6);
        // Distance alone cannot tell a torso from a wing lying along it, and
        // that is not a hypothetical: the heron's neck sits 0.41 girths from
        // the body and 0.51 from the wing, a margin too thin to call, so a
        // distance-only rule failed closed and orphaned the neck. The missing
        // evidence is that BONES HANG OFF SUBSTANTIAL BONES. Weighting the
        // candidate by its structural mass encodes the asymmetry a wing and a
        // torso genuinely have, and leaves the margin free to keep meaning
        // "this is too close to call" rather than "I lack information".
        const mass = list[j].len * Math.max(artGirthMean(list[j].girth), 1e-6);
        // TWO numbers, deliberately. `ratio` is honest girth-relative distance
        // and answers "is this even touching", so the cap stays in the units it
        // was written in. `score` adds the mass weighting and answers "which of
        // these is the parent". Collapsing them into one number would silently
        // turn the cap into a mass threshold.
        cand.push({ other: j, end: e, s: near.s, frame: near.at,
          ratio: near.d / girth,
          score: (near.d / girth) / Math.pow(Math.max(mass, 1e-9), ART_SKEL.massBias) });
      }
      cand.sort((a, b) => a.score - b.score);
      const best = cand[0];
      if (!best || best.ratio > ART_SKEL.joinGirths) continue;
      const rival = cand.find((c) => c.other !== best.other);
      const margin = rival ? rival.score / Math.max(best.score, 1e-9) : Infinity;
      // Ambiguity is recorded per END. A bone whose root is unclear but whose
      // tip is certain is not an ambiguous bone; it is a bone with one good
      // attachment, and refusing the whole thing would throw away real evidence.
      if (margin < ART_SKEL.margin) { out.ambiguous.add(i); continue; }
      const key = Math.min(i, best.other) + '|' + Math.max(i, best.other);
      const prev = edges.get(key);
      if (!prev || best.score < prev.ratio) {
        edges.set(key, { a: i, b: best.other, hit: best, ratio: best.score,
          confidence: Math.max(0, Math.min(1, (margin - 1) / (ART_SKEL.margin - 1 + 1e-9))) });
      }
    }
  }

  const adj = list.map(() => []);
  for (const e of edges.values()) { adj[e.a].push(e.b); adj[e.b].push(e.a); }
  const edgeAt = (x, y) => edges.get(Math.min(x, y) + '|' + Math.max(x, y));
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    if (seen.has(i)) continue;
    const members = [];
    const stack = [i];
    while (stack.length) {
      const n = stack.pop();
      if (seen.has(n)) continue;
      seen.add(n); members.push(n);
      for (const m of adj[n]) if (!seen.has(m)) stack.push(m);
    }
    let root = members[0], bestKey = null;
    for (const m of members) {
      const degree = adj[m].length;
      let ecc = 0;
      const dist = new Map([[m, 0]]);
      const q = [m];
      while (q.length) {
        const n = q.shift();
        for (const k of adj[n]) if (!dist.has(k)) { dist.set(k, dist.get(n) + 1); ecc = Math.max(ecc, dist.get(k)); q.push(k); }
      }
      const mass = list[m].len * Math.max(artGirthMean(list[m].girth), 1e-6);
      const key = [degree, -ecc, mass];
      if (!bestKey || key[0] > bestKey[0]
        || (key[0] === bestKey[0] && key[1] > bestKey[1])
        || (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] > bestKey[2])) {
        bestKey = key; root = m;
      }
    }
    // ── orient away from the root, and only NOW can a cycle be seen ─────────
    // A tree over n members has exactly n-1 edges. More than that is a genuine
    // loop, which is unsupported rather than arbitrarily spanned: picking a
    // spanning tree would be the engine pretending to see a skeleton it cannot
    // see. Failing at the smallest safe scope, so one cyclic component does not
    // take a confident one down with it.
    const inComponent = new Set(members);
    let edgeCount = 0;
    for (const e of edges.values()) if (inComponent.has(e.a) && inComponent.has(e.b)) edgeCount++;
    if (edgeCount > members.length - 1) {
      out.components.push({ root, members, supported: false,
        why: 'these bones form a cycle' });
      out.supported = false;
      out.why = 'a component of the skeleton forms a cycle';
      continue;
    }
    const visited = new Set([root]);
    const queue = [root];
    while (queue.length) {
      const p = queue.shift();
      for (const c of adj[p]) {
        if (visited.has(c)) continue;
        visited.add(c);
        const e = edgeAt(p, c);
        // the attachment was measured from whichever bone probed the other, so
        // re-measure from the CHILD onto the parent now that direction is known
        const near = artNearestStation(list[p], list[c].ends[0].u != null
          && artNearestStation(list[p], list[c].ends[0]).d
             <= artNearestStation(list[p], list[c].ends[1]).d
          ? list[c].ends[0] : list[c].ends[1]);
        const hit = { other: p, s: near.s, frame: near.at, ratio: e ? e.ratio : 0 };
        out.joints.set(c, {
          child: c, parent: p, s: near.s,
          bind: artBindTransform(list[c], hit),
          confidence: e ? e.confidence : 0,
          hinge: artHingeAxis(list[c], list[p], hit),
        });
        queue.push(c);
      }
    }
    out.components.push({ root, members, supported: true });
  }
  // Ambiguity only counts against a bone that NEEDS a parent. The creature's
  // torso was flagged because its own best attachment was too close to call,
  // and then it turned out to be the root, where having no parent is the
  // correct answer rather than a failure. A root that carries its children
  // confidently is not an ambiguous bone.
  for (const c of out.components) out.ambiguous.delete(c.root);
  // Nor does it count against a bone that ended up attached anyway: the flag
  // was raised at one end, and the other end may have answered cleanly.
  for (const child of out.joints.keys()) out.ambiguous.delete(child);

  const confs = [...out.joints.values()].map((j) => j.confidence);
  out.confidence = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 1;
  return out;
}

// The bind pose (8.6.2): the child's rest POSITION AND ORIENTATION relative to
// its parent's attachment frame. Runtime is then
//
//   worldChild = parentAttachmentPose x bind x localArticulation
//
// A displacement alone is not enough and the difference is visible: if the neck
// bends, a head that only translates to the new neck tip keeps pointing the way
// it always did, like a hat sliding along a pole. The head's whole frame has to
// turn with the neck. So bind carries both the offset and the full rotation,
// each expressed in the parent's attachment basis, which is what makes the
// child keep the angle the artist actually drew instead of snapping into
// alignment with whatever direction the parent's transported frame points.
function artBindTransform(child, hit) {
  const c = artStations(child.sp, 3)[0];
  const P = hit.frame;
  const inP = (v) => ({ t: vDot(v, P.T), n: vDot(v, P.N), b: vDot(v, P.B) });
  const d = { x: c.p.x - P.p.x, y: c.p.y - P.p.y, z: c.p.z - P.p.z };
  return {
    at: { x: P.p.x, y: P.p.y, z: P.p.z },
    offset: inP(d),                 // where the child's root sits, in parent terms
    rot: { T: inP(c.T), N: inP(c.N), B: inP(c.B) },   // and how it is turned
  };
}

// ── the articulated evaluator (8.6.2) ────────────────────────────────────────
// No articulation yet, on purpose. This phase exists to prove the rig does not
// ALTER the sculpture before anything is allowed to move it:
//
//   REST: traversing the articulated skeleton with zero articulation
//         reconstructs the authored swept sculpture exactly.
//
// That invariant is worth more than it sounds. Every later primitive composes
// on top of this traversal, so a rig that quietly shifts a bone at rest would
// put a permanent error underneath every pose the artist ever authors.

// A bone's stations expressed in its OWN root frame. Precomputed once, so
// placing a bone is a single frame composition rather than a re-solve.
function artBoneLocal(bone, count) {
  const st = artStations(bone.sp, count);
  const R = st[0];
  const inR = (v) => ({ t: vDot(v, R.T), n: vDot(v, R.N), b: vDot(v, R.B) });
  return st.map((s) => {
    const d = { x: s.p.x - R.p.x, y: s.p.y - R.p.y, z: s.p.z - R.p.z };
    return { s: s.s, pos: inR(d), T: inR(s.T), N: inR(s.N), B: inR(s.B) };
  });
}

// Apply a frame { p, T, N, B } to a vector expressed in that frame's basis.
function artFromFrame(F, c) {
  return {
    x: F.T.x * c.t + F.N.x * c.n + F.B.x * c.b,
    y: F.T.y * c.t + F.N.y * c.n + F.B.y * c.b,
    z: F.T.z * c.t + F.N.z * c.n + F.B.z * c.b,
  };
}

// ── the articulation vocabulary (8.6.3) ──────────────────────────────────────
//
//   CADENCE BELONGS TO THE PIECE. RESPONSE BELONGS TO THE BONE.
//
// The piece owns the phrase: when it acts, how often, how long it rests. Each
// bone owns its response WITHIN that shared phrase. There are no bone clocks.
//
// `follow` is internal: it is what an unlabelled bone becomes once ANY bone in
// the piece has opted in, so an articulated piece never falls back to warping
// skin independently. `hinge` and `pulse` arrive with their own steps.
const ART_MOVES = ['still', 'sway', 'hinge', 'pulse'];
const ART_ARTIC = {
  // Piece amplitude is an ENERGY ALLOWANCE, never a shared physical unit: each
  // primitive converts it into its own geometry-relative bounded act. A sway is
  // an angle swept root to tip; a pulse will be a radius fraction. Without that
  // rule somebody eventually reads `amplitude: 0.06` as 0.06 radians for one
  // primitive and 0.06 local units for another.
  swayMax: 0.55,      // radians of total bend, root to tip, at full allowance
  hingeMax: 0.62,     // radians of root rotation at full allowance
  // Hinge means ROOT-DOMINANT rotation, not mathematically rigid rotation: a
  // perfectly stiff blade reads mechanical, and overlap and follow-through have
  // been the house position since 7.1. But compliance is a property of the
  // material rather than a knob. A broad wing flexes toward its tip; a short
  // jaw essentially does not. Section decides how much, length decides whether
  // the bone is long enough for flex to be visible at all.
  flexBlade: 0.34,
  flexTube: 0.11,
  flexLenRef: 0.42,
  // pulse converts the same energy allowance into a RADIUS FRACTION, which is
  // the clearest case for the rule that piece amplitude is an allowance rather
  // than a shared physical unit: 0.06 is an angle for sway and a proportion
  // here, and nothing but the rule keeps those from being read as the same.
  pulseMax: 0.18,
};

function artMovesOf(stroke) {
  const m = stroke && stroke.moves;
  return m && ART_MOVES.includes(m) ? m : null;
}

// Does this score articulate at all? ONE `moves` anywhere puts the whole
// skeleton on the articulated path, because annotating the neck beautifully
// while the unlabelled head still deformed through the old point-cloud field
// would be the worst of both worlds.
function artArticulated(score) {
  return (Array.isArray(score && score.strokes) ? score.strokes : []).some((g) => artMovesOf(g));
}

// One bone's world stations, given where its root frame ended up.
//
// With no articulation this is a pure rigid placement, which is why REST holds.
// With articulation the bend is applied INCREMENTALLY along the bone: each
// station's authored step is carried through the rotation accumulated so far,
// so segment lengths are preserved exactly. That is not a nicety. Rotating each
// station about the root instead would stretch the bone as it bent, and a neck
// that grows longer when it leans is precisely the distortion this phase is
// named against.
function artBonePose(bone, rootFrame, count, artic) {
  const local = artBoneLocal(bone, count);
  const kind = artic && artic.kind;
  // `still` and `follow` add nothing of their own, and zero means zero. A
  // planted leg gets no decorative settle to prove the engine is alive: a
  // living heron can have a completely motionless foot, and stillness is part
  // of the performance.
  const amount = artic && artic.amount == null ? 1 : (artic && artic.amount) || 0;
  const act = (artic && artic.activation) || 0;
  const total = kind === 'sway' ? ART_ARTIC.swayMax * amount * act : 0;
  // PULSE moves no centreline at all. One coherent factor for the whole bone,
  // applied to the girth at skinning time, so a body swells without its neck
  // or its legs going anywhere: joints live on centrelines, not on skin, and
  // that is what keeps a breathing torso from dragging its children around.
  const radiusScale = kind === 'pulse' ? 1 + ART_ARTIC.pulseMax * amount * act : 1;

  // ── hinge: root-dominant rotation about a DERIVED axis ───────────────────
  // The grammar refuses agent-authored axes, so the engine answers, and it must
  // be able to say it cannot. A hinge with no axis (a colinear joint has no
  // plane to swing in) or no joint at all (a root has nothing to hinge against)
  // FAILS CLOSED to stillness rather than picking an axis, because an arbitrary
  // axis is exactly how a jaw ends up flapping sideways.
  let F = { p: rootFrame.p, T: rootFrame.T, N: rootFrame.N, B: rootFrame.B };
  let flexPer = 0;
  if (kind === 'hinge') {
    const hx = artic && artic.hinge;
    if (hx && hx.axis && hx.confidence > 0) {
      const th = ART_ARTIC.hingeMax * amount * act * hx.confidence;
      F = { p: F.p, T: vUnit(artRotAxis(F.T, hx.axis, th)),
        N: vUnit(artRotAxis(F.N, hx.axis, th)), B: vUnit(artRotAxis(F.B, hx.axis, th)) };
      const base = bone.section === 'blade' ? ART_ARTIC.flexBlade : ART_ARTIC.flexTube;
      const lenFactor = Math.min(1, (bone.len || artBoneLen(bone.sp)) / ART_ARTIC.flexLenRef);
      flexPer = th * base * lenFactor;
    }
  }

  const out = [];
  for (let i = 0; i < local.length; i++) {
    const l = local[i];
    if (i > 0) {
      const q = local[i - 1];
      // the authored step, expressed in the previous local frame, carried
      // through whatever rotation has accumulated
      const w = artFromFrame(F, { t: l.pos.t - q.pos.t, n: l.pos.n - q.pos.n, b: l.pos.b - q.pos.b });
      F = { p: { x: F.p.x + w.x, y: F.p.y + w.y, z: F.p.z + w.z }, T: F.T, N: F.N, B: F.B };
      if (total) {
        // curvature growing toward the tip, so the root holds and the tip
        // travels most, which is what a neck does. About B, the depth axis, so
        // a planar bone bends within its own drawing plane.
        const step = (l.s - q.s) * total * 2 * l.s;
        F = { p: F.p, T: vUnit(artRotAxis(F.T, F.B, step)),
          N: vUnit(artRotAxis(F.N, F.B, step)), B: F.B };
      }
      if (flexPer) {
        // the follow-through a stiff blade would lack: the same incremental
        // walk, about the same hinge axis, growing toward the tip so the root
        // stays where the joint put it
        const step = (l.s - q.s) * flexPer * 2 * l.s;
        const ax = artic.hinge.axis;
        F = { p: F.p, T: vUnit(artRotAxis(F.T, ax, step)),
          N: vUnit(artRotAxis(F.N, ax, step)), B: vUnit(artRotAxis(F.B, ax, step)) };
      }
    }
    out.push({
      s: l.s, p: F.p,
      T: artFromFrame(F, l.T), N: artFromFrame(F, l.N), B: artFromFrame(F, l.B),
      radiusScale,
    });
  }
  return out;
}

// The whole skeleton, walked root-first so a child is always placed against a
// parent that has already been placed. Returns a Map of bone index to its posed
// stations. `articulate` is the seam 8.6.3 fills; passing nothing is REST.
// `opts.counts` maps a bone index to how many stations that bone was LAID with,
// and it is load-bearing rather than a detail. The layout picks a per-bone
// axial count from that bone's own aspect (a long thin leg wants length, a fat
// body wants ring), so posing everything at one resolution puts station 7 of
// the rig somewhere station 7 of the skin never was. Exact reconstruction needs
// the rig sampled exactly where the skin was sampled.
function artPose(skel, opts) {
  const o = opts || {};
  const countFor = (i) => (o.counts && o.counts.get(i)) || o.stations || ART_SKEL.stations;
  // Per-bone response, driven by the PIECE phrase: one cadence, many answers.
  // An unlabelled bone in an articulated piece is FOLLOW, inheriting its parent
  // attachment frame and adding nothing of its own, which is how an articulated
  // piece avoids ever falling back to warping skin independently.
  const articFor = (i) => {
    const m = o.moves && o.moves.get(i);
    if (!m) return null;
    const j = skel.joints.get(i);
    return { kind: m, activation: o.activation == null ? 0 : o.activation,
      amount: o.amount == null ? 1 : o.amount,
      // the hinge axis belongs to the JOINT, because a bone hinges against its
      // parent. A root has no joint and therefore no axis, and a hinge with no
      // axis fails closed to stillness.
      hinge: j ? j.hinge : null };
  };
  const out = new Map();
  const children = new Map();
  for (const [c, j] of skel.joints) {
    if (!children.has(j.parent)) children.set(j.parent, []);
    children.get(j.parent).push(c);
  }
  // The REST configuration first, at each bone's OWN station count, because the
  // bind pose has to be derived against the very frames the pose will use.
  // Deriving it in artSkeleton instead (at a fixed 24 stations) meant the offset
  // was measured from one point on the parent and applied at another, and the
  // rig shifted the sculpture by 5.4e-3 before anything had moved. A bind pose
  // is a property of the rest configuration, so it is computed where the rest
  // configuration is known.
  const rest = new Map();
  for (const comp of skel.components) {
    if (comp.supported === false) continue;
    for (const m of comp.members) rest.set(m, artStations(skel.bones[m].sp, countFor(m)));
  }
  const attachIndex = (arr, s) => Math.max(0, Math.min(arr.length - 1, Math.round(s * (arr.length - 1))));
  const bindAt = new Map();
  for (const [c, j] of skel.joints) {
    const P = rest.get(j.parent), C = rest.get(c);
    if (!P || !C) continue;
    const A = P[attachIndex(P, j.s)];
    const inA = (v) => ({ t: vDot(v, A.T), n: vDot(v, A.N), b: vDot(v, A.B) });
    const d = { x: C[0].p.x - A.p.x, y: C[0].p.y - A.p.y, z: C[0].p.z - A.p.z };
    bindAt.set(c, { offset: inA(d), rot: { T: inA(C[0].T), N: inA(C[0].N), B: inA(C[0].B) } });
  }

  for (const comp of skel.components) {
    if (comp.supported === false) continue;
    const queue = [comp.root];
    // a root stands where it was drawn: its own station-0 frame, untouched
    const rc = countFor(comp.root);
    const rootSt = rest.get(comp.root)[0];
    out.set(comp.root, artBonePose(skel.bones[comp.root], rootSt, rc, articFor(comp.root)));
    while (queue.length) {
      const p = queue.shift();
      for (const c of (children.get(p) || [])) {
        const j = skel.joints.get(c);
        const parentPose = out.get(p);
        // the parent's frame AT THE ATTACHMENT, after whatever the parent did
        const at = parentPose[attachIndex(parentPose, j.s)];
        // compose: attachment frame x bind. The child's root frame is the bind
        // rotation carried into the parent's current orientation, and its root
        // position is the attachment plus the bind offset in those same terms.
        const bind = bindAt.get(c) || j.bind;
        const off = artFromFrame(at, bind.offset);
        const rootFrame = {
          p: { x: at.p.x + off.x, y: at.p.y + off.y, z: at.p.z + off.z },
          T: artFromFrame(at, bind.rot.T),
          N: artFromFrame(at, bind.rot.N),
          B: artFromFrame(at, bind.rot.B),
        };
        out.set(c, artBonePose(skel.bones[c], rootFrame, countFor(c), articFor(c)));
        queue.push(c);
      }
    }
  }
  return out;
}

// Skin one node from its sweep provenance against a posed bone. The node is
// placed relative to its DEFORMED station, never warped independently, which is
// the difference between rigging a body and wobbling a point cloud.
function artSkinNode(posed, sweep) {
  if (!posed || !sweep) return null;
  const i = Math.max(0, Math.min(posed.length - 1, sweep.si));
  const st = posed[i];
  const r = sweep.r * (st.radiusScale == null ? 1 : st.radiusScale);
  const { cw, cd } = artSectionXY(sweep.ang, r, sweep.thin == null ? 1 : sweep.thin, !!sweep.box, sweep.fill == null ? 1 : sweep.fill);
  return {
    x: st.p.x + st.N.x * cw + st.B.x * cd,
    y: st.p.y + st.N.y * cw + st.B.y * cd,
    z: st.p.z + st.N.z * cw + st.B.z * cd,
  };
}

// Around WHAT does a bone hinge? The grammar refuses agent-authored axes, so
// the engine has to answer, and "use the transported frame" is not an answer
// because that frame has three axes in it. A blade's own section plane is the
// strongest evidence there is: a wing hinges about the axis its breadth lies
// across. For a tube, the plane containing the parent and child tangents is the
// better guess. Ambiguity is declared rather than resolved arbitrarily, because
// an arbitrary axis is how a jaw ends up flapping sideways.
function artHingeAxis(child, parent, hit) {
  const st = artStations(child.sp, 3);
  const t = st[0].T;
  if (child.section === 'blade') {
    // a blade is thin through B, so it swings about its own breadth axis
    return { axis: st[0].N, basis: 'section', confidence: 0.9 };
  }
  const cross = vCross(hit.frame.T, t);
  const mag = Math.hypot(cross.x, cross.y, cross.z);
  if (mag < 0.15) {
    // parent and child are nearly colinear: there is no plane to hinge in and
    // any axis we pick would be invented
    return { axis: null, basis: 'colinear', confidence: 0 };
  }
  return { axis: vUnit(cross), basis: 'parent-child plane', confidence: Math.min(1, mag) };
}

// ── object space: the piece as a thing with a body (phase 8.1) ───────────────
// Build plan sections 4.1 through 4.4. The governing law, new in this phase:
//
//   Decoration may enrich structure; it may not define structure.
//
// So the order below is not a convenience, it is the law made procedural:
// authored strokes -> symmetry -> canonical frame + anatomy -> normalize ->
// scaffold, generated last, inside a frame it cannot touch.

const ART_DEPTH_PROFILES = ['flat', 'ribbon', 'shell', 'orbital', 'dome'];
const ART_SYMMETRIES = ['none', 'bilateral_x', 'bilateral_y', 'radial_3', 'radial_4'];

// ── the sweep: the artist draws the bones, the engine gives them body ────────
// Phase 8.5, and the law it adds explains every earlier mistake in object space:
//
//   VOLUME FOLLOWS STRUCTURE; IT DOES NOT SUBSTITUTE FOR STRUCTURE.
//   The artist draws the bones. The engine gives them body.
//
// Before this the grammar could express exactly three things: a flat drawing; a
// flat drawing bent onto a dome (`shell` and `dome` are functions of a point's
// 2D radius, so they curve a decal); and a flat drawing repeated in-plane
// (every artSymmetrize mode writes only u and v, and copies w). None of the
// three is a body. That is why more nodes never helped and why an edge-on view
// collapsed to a line: the piece really was a drawing.
//
// The fix is not to push dots backward. It is to ask the agent for the one
// thing it is genuinely good at, a meaningful axis and a sense of thickness
// along it, and have the engine solve the geometry. Agent grammar: `section`
// and `girth`. Compiler terminology, kept deliberately distinct so the model
// can grow: SWEEP, CROSS-SECTION, STATION, TRANSPORTED FRAME.
//
// Two vocabulary items only, until real pieces argue for a third:
//   tube    roughly circular section: necks, legs, tails, bodies
//   blade   broad across the stroke, thin through depth: wings, fins, leaves
//
// `section` is OPT-IN and that is load-bearing. A stroke without it is ink and
// takes exactly the arithmetic it took before, byte for byte, because sweeping
// every stroke would turn an outlined bird into a bird outlined in sausages.
// Ink describes a visible line; a section describes a body axis. The grammar
// must never blur the two.
// `thread` (2026-09-26): a luminous filament. A bone with no skin: one node
// per station on the centreline, so it still carries provenance (stroke, s,
// station) and articulates, travels and thins like any bone, but costs a line
// of nodes rather than a tube of rings. Cables, wires, stems, rays, orbits.
// `box` (2026-10-06): a rectangular section, width `girth` across the stroke
// in the drawing plane and depth `thick` times that through it, with solid
// lids at both ends. Books, bricks, crates, planks, a table top, a building's
// block: anything with corners, which a tube rounds into a sausage.
const ART_SECTIONS = ['tube', 'blade', 'thread', 'box'];
const ART_BOX_LID = [1, 0.66, 0.33, 0.84, 0.5];
// One node's offset across its section, from its place round the ring (0..1).
// A round or blade section is an ellipse; a box walks the rectangle's
// perimeter at an even pace, so its corners stay sharp and its faces even.
function artSectionXY(a01, r, thin, box, fill) {
  if (!box) { const ang = a01 * Math.PI * 2; return { cw: Math.cos(ang) * r, cd: Math.sin(ang) * r * thin }; }
  const w = r * fill, d = r * thin * fill, per = 4 * (w + d) || 1e-9;
  let t = (((a01 % 1) + 1) % 1) * per;
  if (t < 2 * w) return { cw: -w + t, cd: d };
  t -= 2 * w; if (t < 2 * d) return { cw: w, cd: d - t };
  t -= 2 * d; if (t < 2 * w) return { cw: w - t, cd: -d };
  t -= 2 * w; return { cw: -w, cd: -d + t };
}
// IMPORTANCE (2026-09-26): what a part is worth to RECOGNITION, said by the
// author and turned into material by the engine. Present on any stroke (or a
// thread anywhere), it replaces surface-area allocation for the whole score;
// absent, allocation is byte-for-byte what it always was.
const ART_IMPORTANCE = {
  //            weight  floor share  cap share
  primary:   { w: 1.0,  floor: 0.08,  cap: 0.34 },
  secondary: { w: 0.55, floor: 0.04,  cap: 0.22 },
  detail:    { w: 0.28, floor: 0.015, cap: 0.12, min: 10 },
  accent:    { w: 0.1,  floor: 0.008, cap: 0.045, min: 12 },
};
const ART_THREAD = { spacing: 0.035, min: 6, cap: 0.08 };
const ART_BLADE_THIN = 0.28;   // a blade's depth as a share of its width
const ART_SWEEP = {
  ringMin: 3, ringMax: 24,     // samples around one cross-section
  axialMin: 2,
  lineWidth: 0.02,             // the fitted width of a weight-1 ink line, so a
                               // sweep's surface area and a line's are
                               // comparable in one currency for the allocator
  boostMax: 10,
};

// Rodrigues rotation of v about unit axis k by angle th.
function artRotAxis(v, k, th) {
  const c = Math.cos(th), s = Math.sin(th);
  const kv = k.x * v.x + k.y * v.y + k.z * v.z;
  return {
    x: v.x * c + (k.y * v.z - k.z * v.y) * s + k.x * kv * (1 - c),
    y: v.y * c + (k.z * v.x - k.x * v.z) * s + k.y * kv * (1 - c),
    z: v.z * c + (k.x * v.y - k.y * v.x) * s + k.z * kv * (1 - c),
  };
}

// Stations along a centreline, each carrying a PARALLEL-TRANSPORTED frame.
//
// Deliberately not a Frenet frame. Frenet flips its normal through an
// inflection and is undefined where curvature vanishes, and an agent-drawn
// stroke has both. The artistic symptom would be a wing that mysteriously
// twists halfway along, which reads as bad sculpture while actually being
// differential geometry. Transport carries one frame forward by the minimal
// rotation taking each tangent to the next, so it cannot flip.
function artStations(sp, count) {
  const pts = sp.map((p) => ({ x: p.u, y: p.v, z: p.w || 0 }));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x,
      pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z));
  }
  const total = cum[cum.length - 1] || 1e-9;
  const at = (d) => {
    let seg = 1;
    while (seg < cum.length - 1 && cum[seg] < d) seg++;
    const segLen = cum[seg] - cum[seg - 1] || 1e-9;
    const f = Math.max(0, Math.min(1, (d - cum[seg - 1]) / segLen));
    const a = pts[seg - 1], b = pts[seg];
    return { p: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f },
      t: { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z } };
  };
  const out = [];
  let N = null, T = null;
  // The tangent is a CENTRAL DIFFERENCE across neighbouring stations, not the
  // raw segment tangent. A polyline's segment tangent is piecewise constant, so
  // at a corner the frame turns the entire corner angle in a single station:
  // correct transport, but it leaves a visible crease where the agent drew a
  // bend. Sampling the curve either side spreads that turn over the stations
  // near the corner, which is what a swept body should do.
  //
  // The window is a fixed fraction of ARC LENGTH, never a fraction of the
  // station count. A tangent is a property of the curve and must not change
  // because somebody sampled it more finely. When it did, the bind pose
  // (computed at one resolution) and the posed bone (computed at another)
  // disagreed about which way a bone pointed, and the rig shifted the sculpture
  // by 5.7e-3 at rest. Caught by the REST invariant, which is precisely the
  // class of error it exists to catch.
  const eps = Math.max(total * 0.02, 1e-6);
  for (let i = 0; i < count; i++) {
    const s = count > 1 ? i / (count - 1) : 0;
    const d = s * total;
    const st = at(d);
    const a0 = at(Math.max(0, d - eps)).p, b0 = at(Math.min(total, d + eps)).p;
    const t = vUnit({ x: b0.x - a0.x, y: b0.y - a0.y, z: b0.z - a0.z })
      || vUnit(st.t) || T || { x: 1, y: 0, z: 0 };
    if (!N) {
      // the first frame's width axis comes from the DRAWING PLANE, so a planar
      // stroke gets its width in the plane and its depth out of it, which is
      // what an agent means when it calls a wing broad
      let n = vCross(t, { x: 0, y: 0, z: 1 });
      if (Math.hypot(n.x, n.y, n.z) < 1e-6) n = vCross(t, { x: 0, y: 1, z: 0 });
      N = vUnit(n);
    } else {
      const axis = vCross(T, t);
      const sn = Math.hypot(axis.x, axis.y, axis.z);
      if (sn > 1e-9) {
        N = vUnit(artRotAxis(N, vUnit(axis),
          Math.atan2(sn, Math.max(-1, Math.min(1, vDot(T, t))))));
      }
    }
    T = t;
    out.push({ s, p: st.p, T: t, N, B: vUnit(vCross(t, N)) });
  }
  return out;
}

// The girth profile, owned by the engine so an agent never has to answer "what
// radius at s = 0.376". A number is constant girth; a list of { at, r }
// interpolates smoothly (smoothstep, so the body has no creases) and holds
// flat outside the authored range.
function artGirthAt(girth, s) {
  if (typeof girth === 'number') return Math.max(0, girth);
  const g = (Array.isArray(girth) ? girth : []).filter((x) => x && Number.isFinite(x.r))
    .map((x) => ({ at: Math.max(0, Math.min(1, Number(x.at) || 0)), r: Math.max(0, x.r) }))
    .sort((a, b) => a.at - b.at);
  if (!g.length) return 0;
  if (s <= g[0].at) return g[0].r;
  const last = g[g.length - 1];
  if (s >= last.at) return last.r;
  for (let i = 1; i < g.length; i++) {
    if (s <= g[i].at) {
      const span = g[i].at - g[i - 1].at || 1e-9;
      const t = (s - g[i - 1].at) / span;
      return g[i - 1].r + (g[i].r - g[i - 1].r) * (t * t * (3 - 2 * t));
    }
  }
  return last.r;
}

function artGirthMean(girth) {
  let sum = 0;
  for (let i = 0; i <= 8; i++) sum += artGirthAt(girth, i / 8);
  return sum / 9;
}

// A stroke's declared section, or null for ink. The presence of a VALID
// `section` is the opt-in; `girth` alone is ignored rather than guessed at,
// because guessing is how ink quietly becomes sausage.
function artSectionOf(stroke) {
  const kind = stroke && stroke.section;
  if (!kind || !ART_SECTIONS.includes(kind)) return null;
  // a thread has no skin; its girth only tells the rig how substantial it is
  if (kind === 'thread') return { kind, girth: stroke.girth || 0.004, mean: Math.max(1e-4, artGirthMean(stroke.girth || 0.004)) };
  const mean = artGirthMean(stroke.girth);
  if (!(mean > 0)) return null;
  if (kind === 'box') {
    const thick = Math.max(0.1, Math.min(12, Number(stroke.thick) || 1));
    // the ring is spread over the perimeter, so the allocator sees its true size
    return { kind, girth: stroke.girth, mean: mean * (1 + thick) / 2, thick };
  }
  return { kind, girth: stroke.girth, mean };
}

// How many samples along the stroke and how many around it. A long thin leg
// wants axial resolution and almost no ring; a fat body wants both. Split by
// the shape's own aspect rather than a constant, with floors, so neither
// degenerates. Ends are tapered by the girth profile itself rather than capped,
// so a sweep never reads as an open pipe.
function artSweepSplit(count, len, meanR) {
  const circumference = 2 * Math.PI * Math.max(meanR, 1e-6);
  const aspect = circumference / Math.max(len, 1e-6);
  let ring = Math.round(Math.sqrt(Math.max(1, count) * Math.max(aspect, 1e-6)));
  ring = Math.max(ART_SWEEP.ringMin, Math.min(ART_SWEEP.ringMax, ring));
  const axial = Math.max(ART_SWEEP.axialMin, Math.floor(count / ring));
  return { ring, axial };
}

// Catmull-Rom densification, behind per-stroke `smooth`. Default OFF FOREVER
// (build plan section 2, resolved question 4): linear resampling stays the
// default because byte compatibility is a law and an explicit score semantic
// beats a hidden contextual default. The protocol tells an agent when to opt
// in -- organic continuous ink yes; architecture, corners, symbols and
// deliberate line breaks no.
function artSmoothPoly(sp) {
  if (sp.length < 3) return sp;
  const at = (i) => sp[Math.max(0, Math.min(sp.length - 1, i))];
  const out = [];
  for (let i = 0; i + 1 < sp.length; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let s = 0; s < 8; s++) {
      const t = s / 8, t2 = t * t, t3 = t2 * t;
      const c0 = -0.5 * t3 + t2 - 0.5 * t;
      const c1 = 1.5 * t3 - 2.5 * t2 + 1;
      const c2 = -1.5 * t3 + 2 * t2 + 0.5 * t;
      const c3 = 0.5 * t3 - 0.5 * t2;
      out.push({ u: p0.u * c0 + p1.u * c1 + p2.u * c2 + p3.u * c3,
        v: p0.v * c0 + p1.v * c1 + p2.v * c2 + p3.v * c3,
        w: p0.w * c0 + p1.w * c1 + p2.w * c2 + p3.w * c3 });
    }
  }
  const last = sp[sp.length - 1];
  out.push({ u: last.u, v: last.v, w: last.w });
  return out;
}

// A depth profile shapes the MATERIAL AROUND THE DRAWING (build plan 4.4),
// never a fill across it. `ribbon` gives a stroke width in its own plane;
// `shell` and `dome` lift the drawing off that plane; `orbital` walks it
// around. Every offset is expressed in units of the drawing's own reach, so
// a profile means the same thing at any span, and every one of them leaves
// negative space exactly where the artist left it.
function artApplyDepth(w, a, b, s, idx, profile, scale, reach) {
  if (!profile || profile === 'flat' || !(scale > 0)) return;
  const R = reach || 1e-9;
  const nu = w.u / R, nv = w.v / R;
  if (profile === 'ribbon') {
    let tu = b.u - a.u, tv = b.v - a.v;
    const tl = Math.hypot(tu, tv) || 1e-9;
    tu /= tl; tv /= tl;
    const k = Math.sin(Math.PI * s) * scale * R * 0.25 * (idx % 2 === 0 ? 1 : -1);
    w.u += -tv * k; w.v += tu * k;
  } else if (profile === 'shell') {
    w.w += scale * R * Math.sqrt(Math.max(0, 1 - (nu * nu + nv * nv)));
  } else if (profile === 'orbital') {
    const theta = Math.atan2(nv, nu) + s * Math.PI * 2;
    w.u += scale * R * 0.25 * Math.cos(theta);
    w.w += scale * R * Math.sin(theta);
  } else if (profile === 'dome') {
    w.w += scale * R * Math.max(0, 1 - (nu * nu + nv * nv));
  }
}

// Objecthood is OPT-IN (build plan 4.1), and this is the whole of the test:
// a `volume` block, a stroke point carrying a non-zero third component, or a
// stroke declaring its own `depth`. Everything else is FLAT, forever --
// [u,v] -> [u,v,0] through the entire 3D pipeline, byte-identical, and
// genuinely edge-on when you turn it, because that is the truth about a
// drawing. Flat art is paper-like; volumetric art has body; neither is ever
// silently upgraded into the other.
function artObjecthood(score) {
  const s = score || {};
  if (s.volume && typeof s.volume === 'object') return true;
  for (const g of (Array.isArray(s.strokes) ? s.strokes : [])) {
    if (!g) continue;
    if (g.depth && typeof g.depth === 'object') return true;
    // a declared section IS an authored body, and the loudest opt-in there is
    if (artSectionOf(g)) return true;
    for (const p of (Array.isArray(g.points) ? g.points : [])) {
      if (Array.isArray(p) && Number.isFinite(p[2]) && p[2] !== 0) return true;
    }
  }
  return false;
}

// The volume block, clamped to its ledger. Returns null for a flat piece, so
// every downstream `if (volume)` is also the objecthood test.
function artVolumeOf(score, volumetric) {
  if (!volumetric) return null;
  const v = (score && score.volume) || {};
  const profile = v.profile == null ? 'flat' : v.profile;
  const symmetry = v.symmetry == null ? 'none' : v.symmetry;
  return {
    profile, symmetry,
    depthScale: Math.max(0, Math.min(2, v.depthScale != null ? v.depthScale : 0.2)),
    scaffold: Math.max(0, Math.min(512, Math.round(v.scaffold || 0))),
  };
}

function artSymmetryFold(mode) {
  return { none: 1, bilateral_x: 2, bilateral_y: 2, radial_3: 3, radial_4: 4 }[mode] || 1;
}

// Symmetry is AUTHORED structure, so it runs before the canonical frame: the
// drawing is laid into the first 1/fold of the ink and its images fill the
// rest, which makes a bilateral piece one drawing seen twice rather than two
// drawings that happen to match. An image inherits its source's phase, so
// symmetric partners are inked together, the way a hand draws a symmetric
// form. `bilateral_x` mirrors ACROSS the v axis (u -> -u, left to right);
// `bilateral_y` mirrors across the u axis. Depth is never mirrored away: w
// rides every image unchanged, because a mirrored wing has the same body.
function artSymmetrize(ink, baseCount, mode) {
  const fold = artSymmetryFold(mode);
  if (fold < 2 || baseCount < 1) return ink;
  for (let i = baseCount; i < ink.length; i++) {
    const src = ink[(i - baseCount) % baseCount];
    const image = 1 + Math.floor((i - baseCount) / baseCount);
    const w = ink[i];
    if (mode === 'bilateral_x') { w.u = image % 2 ? -src.u : src.u; w.v = src.v; }
    else if (mode === 'bilateral_y') { w.u = src.u; w.v = image % 2 ? -src.v : src.v; }
    else {
      const th = (image % fold) * Math.PI * 2 / fold;
      w.u = src.u * Math.cos(th) - src.v * Math.sin(th);
      w.v = src.u * Math.sin(th) + src.v * Math.cos(th);
    }
    w.w = src.w || 0;
    w.alt = src.alt; w.size = src.size; w.phase = src.phase;
  }
  return ink;
}

// A symmetric 3x3 eigendecomposition by cyclic Jacobi rotations: no
// dependency, no library, and deterministic to the bit for a given matrix.
// Returns eigenvalues descending with their eigenvectors, which is what an
// anatomy contract needs and all it needs.
function artJacobi3(m) {
  const a = [[m[0][0], m[0][1], m[0][2]], [m[1][0], m[1][1], m[1][2]], [m[2][0], m[2][1], m[2][2]]];
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 24; sweep++) {
    let off = 0;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) off += a[p][q] * a[p][q];
    if (off < 1e-24) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-18) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]);
  return {
    values: order.map((i) => a[i][i]),
    vectors: order.map((i) => ({ x: v[0][i], y: v[1][i], z: v[2][i] })),
  };
}

// The canonical frame (build plan 4.3): origin at the ink's own weighted
// centroid, scale normalizing the authored linework to the unit bounding
// sphere. AUTHORED LINEWORK ONLY -- the caller hands in ink and only ink,
// and the scaffold is generated afterward inside the frame this returns.
// Ink count already encodes weight (a bold stroke gets more nodes as well as
// larger ones), so the plain mean of the ink points IS the density-weighted
// visual centroid; there is no second weighting to apply.
//
// The thickness floor lives here because it must land BEFORE normalization,
// where the eigen ratio is measured and the piece still has its own units.
// It fires only for a volumetric piece whose own authoring left it below the
// floor, and what it adds is a structured micro-thickness -- one smooth,
// signed, ink-ordered fold along V3 -- never independent per-point noise.
// Static jitter is still noise on the dots, philosophically (build plan 4.1).
function artPieceFrame(ink, volumetric, seed) {
  const n = ink.length || 1;
  let cu = 0, cv = 0, cw = 0;
  for (const w of ink) { cu += w.u; cv += w.v; cw += (w.w || 0); }
  cu /= n; cv /= n; cw /= n;
  const P = ink.map((w) => ({ x: w.u - cu, y: w.v - cv, z: (w.w || 0) - cw }));
  if (volumetric) {
    let sxx = 0, sxy = 0, sxz = 0, syy = 0, syz = 0, szz = 0, reach = 1e-9;
    for (const p of P) {
      sxx += p.x * p.x; sxy += p.x * p.y; sxz += p.x * p.z;
      syy += p.y * p.y; syz += p.y * p.z; szz += p.z * p.z;
      reach = Math.max(reach, Math.hypot(p.x, p.y, p.z));
    }
    const eig = artJacobi3([[sxx / n, sxy / n, sxz / n], [sxy / n, syy / n, syz / n],
      [sxz / n, syz / n, szz / n]]);
    const l1 = Math.max(eig.values[0], 1e-30);
    if (eig.values[2] / l1 < 0.05) {
      // a gentle fold, not a haze: one low-frequency signed wave along the
      // ink order, sigma-equivalent 0.02 of the piece's own reach
      const V3 = eig.vectors[2];
      const phase = ((seed >>> 0) % 997) / 997 * Math.PI * 2;
      P.forEach((p, i) => {
        const s = P.length > 1 ? i / (P.length - 1) : 0;
        const d = 0.02 * reach * Math.sin(Math.PI * 2 * (1.5 * s) + phase);
        p.x += V3.x * d; p.y += V3.y * d; p.z += V3.z * d;
      });
    }
  }
  let maxR = 1e-9;
  for (const p of P) maxR = Math.max(maxR, Math.hypot(p.x, p.y, p.z));
  const scale = 1 / maxR;
  ink.forEach((w, i) => {
    w.px = P[i].x * scale; w.py = P[i].y * scale; w.pz = P[i].z * scale;
  });
  return { cu, cv, cw, scale };
}

// Scaffold: near-stroke, NEVER a hull (build plan 4.4). Every candidate is
// anchored to an authored ink point and offset along that stroke's own local
// normal and the piece's depth axis, with a profile-shaped distance drawn by
// seeded rejection. Negative space is preserved BY CONSTRUCTION: no scaffold
// point exists that is not within reach of a line the artist drew, so the
// space between the heron's legs stays empty and the heron never becomes
// bird-shaped fog.
//
//   Volume supports the drawing; it never fills across meaningful voids
//   unless the score explicitly asks it to.
//
// Scaffold points are real material -- they count in the node cap, the
// render and the motion envelope -- and they are structurally invisible:
// generated after the frame, excluded from centroid, normalization, axes and
// anatomy. Weight 0.5, so the linework always outshines the fill.
function artScaffold(fill, ink, volume, frame, rng) {
  if (!fill.length || !ink.length) return fill;
  const depth = volume.depthScale;
  // the depth axis in the fixed frame: the ink's own third eigenvector, which
  // the frame already established and which no scaffold point may move
  const dMax = 0.35 * Math.max(0.05, depth);
  const shape = (r) => {
    if (volume.profile === 'shell') return Math.pow(r, 2.2);          // material near the surface
    if (volume.profile === 'dome') return 1 - Math.pow(r, 1.6);       // material near the drawing
    if (volume.profile === 'orbital') return Math.exp(-Math.pow((r - 0.7) / 0.22, 2)); // a ring
    if (volume.profile === 'ribbon') return 1 - r;                    // hugging the line
    return 1 - r * 0.5;
  };
  fill.forEach((w, i) => {
    const ai = Math.min(ink.length - 1, Math.floor(rng() * ink.length));
    const a = ink[ai], b = ink[Math.min(ink.length - 1, ai + 1)];
    // the stroke's local direction, so "normal" means normal to the LINE
    let tx = b.px - a.px, ty = b.py - a.py, tz = b.pz - a.pz;
    const tl = Math.hypot(tx, ty, tz);
    if (tl < 1e-9) { tx = 1; ty = 0; tz = 0; } else { tx /= tl; ty /= tl; tz /= tl; }
    // seeded rejection against the profile's own distance distribution
    let r = 0;
    for (let k = 0; k < 8; k++) { const c = rng(); if (rng() < shape(c)) { r = c; break; } r = c; }
    const phi = rng() * Math.PI * 2;
    // an orthonormal pair spanning the plane perpendicular to the stroke
    const up = Math.abs(ty) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    let n1 = vUnit(vCross(up, { x: tx, y: ty, z: tz })) || { x: 0, y: 0, z: 1 };
    const n2 = vCross({ x: tx, y: ty, z: tz }, n1);
    const d = r * dMax;
    w.px = a.px + (n1.x * Math.cos(phi) + n2.x * Math.sin(phi)) * d;
    w.py = a.py + (n1.y * Math.cos(phi) + n2.y * Math.sin(phi)) * d;
    w.pz = a.pz + (n1.z * Math.cos(phi) + n2.z * Math.sin(phi)) * d;
    w.scaffold = true;
    // back through the fixed frame, so the stage-sphere path can draw it too
    w.u = w.px / frame.scale + frame.cu;
    w.v = w.py / frame.scale + frame.cv;
    w.w = w.pz / frame.scale + frame.cw;
    w.size = 0.5;
    w.alt = a.alt;
    // the fill materializes with the linework it belongs to, never ahead of it
    w.phase = a.phase;
  });
  return fill;
}

// The score, checked and compiled. Returns { ok, problems, piece }: grammar
// violations reject with reasons (an agent may read them and retry once);
// everything numeric is clamped to the ledger, so a legal-grammar score
// ALWAYS compiles to a piece that individually obeys every cap. artValidate
// still runs afterward, because only it knows where land is.
function artPerform(score, nodes, stage) {
  // the piece's ledger: the sea unless a stage commissions it (Part C).
  // Same grammar, same laws, its own constants, carried on the piece.
  // the gallery and the world are both STAGES: same grammar, same object
  // space, their own constants. The sea is the one that is not, because it
  // shares its frame with canonical truth.
  const onStage = stage === 'gallery' || stage === 'world';
  const ST = ART_STAGES[onStage ? stage : 'sea'];
  const R = ST.rig, M = ST.motion;
  const problems = [];
  const s = score || {};
  if (!Number.isInteger(s.seed)) problems.push('seed: required, an integer (it is the piece\'s identity)');
  const gestures = Array.isArray(s.gestures) ? s.gestures : [];
  const dom = gestures.filter((g) => g && g.role === 'dominant');
  const sup = gestures.filter((g) => g && g.role === 'support');
  const sur = gestures.filter((g) => g && g.role === 'surprise');
  if (dom.length + sup.length + sur.length !== gestures.length) {
    problems.push('role: every gesture needs one of dominant | support | surprise');
  }
  // the multi-stroke channel (apc-ai-course#186): tattoo linework as several
  // traces with layer depth, weight and taper, the gallery's own figurative
  // grammar. A stroked piece IS its strokes: the ink order is its
  // choreography, so the gesture grammar and the strokes never mix. At sea
  // it does not exist at all; the sea's law is one dominant gesture.
  const strokes = Array.isArray(s.strokes) ? s.strokes : null;
  const inked = !!(onStage && strokes && strokes.length);
  if (strokes && strokes.length && !onStage) {
    problems.push('strokes: the multi-stroke channel belongs to a stage; at sea a piece is one gesture grammar');
  }
  if (inked) {
    if (gestures.length) problems.push('strokes: a stroked piece is its strokes; gestures and strokes do not mix');
    if (strokes.length > 16) problems.push('strokes: at most 16 strokes; past that the linework stops being drawing');
    strokes.forEach((g, i) => {
      if (artTracePoints(g || {}).length < 2) problems.push('strokes[' + i + ']: needs at least 2 [u,v] points');
      if ((g && g.weight != null) && !(g.weight > 0)) problems.push('strokes[' + i + ']: weight must be positive');
      if (g && g.depth && !ART_DEPTH_PROFILES.includes(g.depth.profile == null ? 'flat' : g.depth.profile)) {
        problems.push('strokes[' + i + '].depth.profile: "' + g.depth.profile + '" is not one of '
          + ART_DEPTH_PROFILES.join(' | '));
      }
    });
  } else if (dom.length !== 1) {
    problems.push('grammar: exactly one dominant gesture (got ' + dom.length + ')');
  }
  // ── object space (phase 8.1): objecthood is opt-in, and it is a stage
  // concept. The sea composes in a tangent plane on a sphere it shares with
  // canonical truth; a volume block there is a category error, not a tuning
  // problem. Everything else 3D rides on `strokes`, which the sea already
  // refuses outright.
  const volumetric = onStage && artObjecthood(s);
  const volume = artVolumeOf(s, volumetric);
  if (s.volume != null && !onStage) {
    problems.push('volume: object space belongs to the gallery stage; at sea a piece is a drawing in a tangent plane');
  }
  if (volume) {
    if (!ART_DEPTH_PROFILES.includes(volume.profile)) {
      problems.push('volume.profile: "' + volume.profile + '" is not one of ' + ART_DEPTH_PROFILES.join(' | '));
    }
    if (!ART_SYMMETRIES.includes(volume.symmetry)) {
      problems.push('volume.symmetry: "' + volume.symmetry + '" is not one of ' + ART_SYMMETRIES.join(' | '));
    }
    // a degenerate volume: fill with nowhere to be. Scaffold is generated
    // near the linework and off its plane, so a flat profile with no depth
    // gives every candidate the drawing's own position, which is fog where
    // the drawing already is rather than material around it.
    if (volume.scaffold > 0 && (volume.profile === 'flat' || volume.depthScale <= 0)) {
      problems.push('volume: scaffold needs somewhere to be; give the volume a profile and a depthScale, or drop the scaffold');
    }
  }
  if (sup.length > 2) problems.push('grammar: at most two supporting gestures (got ' + sup.length + ')');
  if (sur.length > 1) problems.push('grammar: at most one surprise (got ' + sur.length + ')');
  for (const g of dom) {
    if (!ART_GESTURES.dominant.includes(g.kind)) problems.push('kind: "' + g.kind + '" is not a dominant gesture');
    else if (g.kind === 'trace' && artTracePoints(g).length < 3) {
      problems.push('trace: needs at least 3 [u,v] points to be a drawing');
    }
  }
  for (const g of sup) {
    if (!ART_GESTURES.support.includes(g.kind)) problems.push('kind: "' + g.kind + '" is not a supporting gesture');
  }
  const palette = ART_PALETTES[s.palette || 'deep-current'];
  if (!palette) problems.push('palette: "' + s.palette + '" is not one of ' + Object.keys(ART_PALETTES).join(' | '));
  if (!Array.isArray(nodes) || nodes.length < 5) problems.push('sea: fewer than 5 residue nodes to work with');
  // the motion program (motion brief Part C): kind, tempo, amplitude, all
  // optional; the vocabulary is closed (Part F.7). Keyframes (7.2) change
  // pose, never topology: they require a traced dominant (the drawing IS
  // pose zero), one or two further poses, and the correspondence gate below.
  let motion = null;
  if (s.motion != null) {
    const mo = s.motion || {};
    if (mo.kind === 'keyframes') {
      if (!dom.length || dom[0].kind !== 'trace') {
        problems.push('motion.kind: keyframes need a traced dominant; the drawing is pose zero');
      }
      const poses = Array.isArray(mo.poses) ? mo.poses : [];
      if (poses.length < 1 || poses.length > 2) {
        problems.push('motion.poses: one or two further poses of the same drawing');
      }
      for (const p of poses) {
        if (artTracePoints(p || {}).length < 3) {
          problems.push('motion.poses: every pose needs at least 3 [u,v] points');
        }
        if (dom.length && dom[0].kind === 'trace' && !!(p && p.close) !== !!dom[0].close) {
          problems.push('keyframes: poses must share topology; a pose may not open or close the form');
        }
      }
    } else if (!M.kinds.includes(mo.kind)) {
      problems.push('motion.kind: "' + mo.kind + '" is not one of ' + M.kinds.join(' | ') + ' | keyframes');
    }
    const tempo = mo.tempo == null ? 'steady' : mo.tempo;
    if (!M.tempos[tempo]) {
      problems.push('motion.tempo: "' + mo.tempo + '" is not one of ' + Object.keys(M.tempos).join(' | ') + ' (tempo changes temperament, not frame rate)');
    }
    if (mo.amplitude != null && (typeof mo.amplitude !== 'number' || mo.amplitude <= 0)) {
      problems.push('motion.amplitude: a positive number in radians, at most ' + M.ampMax);
    }
    if (!problems.length || problems.every((p) => !p.startsWith('motion') && !p.startsWith('keyframes'))) {
      motion = mo.kind === 'keyframes'
        ? { kind: 'keyframes', tempo, poses: mo.poses }
        : { kind: mo.kind, tempo,
            amplitude: Math.min(mo.amplitude != null ? mo.amplitude : 0.02, M.ampMax) };
    }
  }
  if (problems.length) return { ok: false, problems, piece: null };

  const rng = artPrng(s.seed);
  // the piece stands where the residue already gathers: its centroid, so the
  // displacement budget does most of the containment work before validation
  let cx = 0, cy = 0, cz = 0;
  for (const n of nodes) { cx += n.at.x; cy += n.at.y; cz += n.at.z; }
  const basis = artBasis({ x: cx, y: cy, z: cz });
  const cap = Math.max(8, Math.min(R.nodeCap, Math.round(s.size || 32)));
  const pool = artNearest(nodes, basis.c, cap);
  let working = pool.map((n, i) => ({ n, u: 0, v: 0, alt: 0, size: 1, phase: i / pool.length }));

  // scaffold is reserved off the top of the budget (captured spec 3.2): it is
  // real material and pays for itself in nodes, but it is never linework, so
  // the ink allocation below never sees it.
  const scaffoldCount = volume ? Math.min(volume.scaffold, Math.max(0, working.length - 8)) : 0;
  const inkCount = working.length - scaffoldCount;

  if (inked) {
    if (inkCount < strokes.length * 2) {
      return { ok: false, problems: ['strokes: ' + strokes.length + ' strokes need at least '
        + strokes.length * 2 + ' nodes of ink; this piece has ' + inkCount
        + (scaffoldCount ? ' after ' + scaffoldCount + ' go to scaffold' : '')
        + ' (raise size, or lower volume.scaffold)'], piece: null };
    }
    const ink = working.slice(0, inkCount);
    // symmetry is AUTHORED structure, so it lays before the frame: the
    // drawing goes into the first 1/fold of the ink and its images fill the
    // rest (build plan 4.3's ordering, symmetry ahead of the canonical frame)
    const fold = volume ? artSymmetryFold(volume.symmetry) : 1;
    const baseCount = fold > 1
      ? Math.max(strokes.length * 2, Math.floor(inkCount / fold)) : inkCount;
    artStrokesLay(ink.slice(0, baseCount), strokes, s.span, rng, volume);
    if (fold > 1) artSymmetrize(ink, baseCount, volume.symmetry);
  } else {
    const ops = artGestureOps();
    working = ops[dom[0].kind](working, dom[0], rng) || working;
    for (const g of sup) {
      if (g.kind === 'ridge') ops.ridgeSupport(working, g);
      else ops[g.kind](working, g, rng);
    }
  }
  // the surprise: at most three nodes placed deliberately apart, arriving at
  // the very end of the reveal. The "oh" the brief asks every piece to keep.
  if (sur.length) {
    const g = sur[0];
    const cu = g.at ? g.at[0] || 0 : 0.16, cv = g.at ? g.at[1] || 0 : 0.10;
    const k = Math.max(1, Math.min(3, Math.round(g.count || 1)));
    const picked = working.slice().sort((a, b) => b.phase - a.phase).slice(0, k);
    picked.forEach((w, j) => {
      w.u = cu + rng.range(-0.015, 0.015);
      w.v = cv + rng.range(-0.015, 0.015);
      w.alt = Math.min(w.alt + 0.04, R.maxAltitude);
      w.size = 1.12;
      w.phase = 0.97 + 0.01 * j;
    });
  }

  // ── the canonical frame, then and only then the scaffold (build plan 4.3) ──
  // Object space is a stage concept: the sea's coordinate system is a tangent
  // plane on a sphere it shares with truth, and it has no body to have. On
  // stage every piece gets a frame, flat ones included, because a flat piece
  // in object space is a real answer ([u,v] -> [u,v,0]) rather than an
  // absence. The frame comes from AUTHORED LINEWORK ONLY and is fixed before
  // any scaffold exists, so adding, removing or resizing fill moves no
  // centroid, no axis, no normalization and no anatomy.
  let frame = null;
  if (onStage) {
    // re-reserved against the FINAL working set, because one dominant
    // (constellate) is allowed to shrink it and the fill must come off the
    // top of what actually exists rather than what was asked for
    const fill = volume ? Math.min(volume.scaffold, Math.max(0, working.length - 8)) : 0;
    const ink = fill ? working.slice(0, working.length - fill) : working;
    frame = artPieceFrame(ink, volumetric, s.seed >>> 0);
    if (fill) artScaffold(working.slice(working.length - fill), ink, volume, frame, rng);
  }

  // keyframes run their correspondence gate BEFORE the ledger, because a
  // node that intends to morph must reserve exactly the room its own delta
  // needs (per node, not a flat share): clamped to cap minus |delta|, the
  // far pose is inside the cap by construction, and the morph plays at its
  // full compiled reach instead of being scaled to a mumble. A surprise
  // node left its spine seat, so it sits the morph out.
  let kfGate = null;
  const kfSkip = new Set();
  if (motion && motion.kind === 'keyframes') {
    if (sur.length) {
      const k = Math.max(1, Math.min(3, Math.round(sur[0].count || 1)));
      for (const w of working.slice().sort((a, b) => b.phase - a.phase).slice(0, k)) kfSkip.add(w.n.id);
    }
    kfGate = artKeyframeGate(dom[0], motion.poses, working.length);
    if (!kfGate.ok) return { ok: false, problems: [kfGate.why], piece: null };
    let maxDelta = 0;
    for (const pose of kfGate.deltas) maxDelta = Math.max(maxDelta, pose.maxDelta);
    if (maxDelta > R.maxDisplacement * 0.5) {
      return { ok: false, problems: ['keyframes: the morph wants more room (' + maxDelta.toFixed(3) +
        ' rad) than the ' + (onStage ? 'stage' : 'sea') + ' can give this piece; refused rather than mumbled'], piece: null };
    }
  }

  // the ledger applied unconditionally: whatever a gesture (or a wild
  // parameter) produced, what leaves this function obeys every cap. A piece
  // that intends to move reserves its motion room HERE, at compile time, so
  // the performance runs at its asked amplitude instead of being attenuated
  // to nothing by a member the gestures had already stretched to the budget
  // (Part F.2: attenuation is the safety net, never the choreographer).
  const mDisp = motion && ART_MOTION_LATERAL[motion.kind] ? motion.amplitude : 0;
  const mAlt = motion && ART_MOTION_VERTICAL[motion.kind] ? motion.amplitude : 0;
  const targets = artTargets();
  working.forEach((w, i) => {
    let disp = R.maxDisplacement - mDisp;
    let altLo = 0, altHi = R.maxAltitude - mAlt;
    if (kfGate && !kfSkip.has(w.n.id)) {
      for (const pose of kfGate.deltas) {
        const d = pose.d[i];
        disp = Math.min(disp, R.maxDisplacement - Math.hypot(d.du, d.dv));
        if (d.dAlt > 0) altHi = Math.min(altHi, R.maxAltitude - d.dAlt);
        else altLo = Math.max(altLo, -d.dAlt);
      }
    }
    const want = artOnSphere(basis, w.u, w.v);
    const t = {
      id: w.n.id,
      sourceAt: { x: w.n.at.x, y: w.n.at.y, z: w.n.at.z },
      targetAt: artClampDisp(w.n.at, want, disp),
      altitude: Math.max(altLo, Math.min(altHi, w.alt)),
      sizeMultiplier: Math.max(R.sizeMin, Math.min(R.sizeMax, w.size)),
      phase: Math.max(0, Math.min(0.99, w.phase)),
    };
    // piece space rides ALONGSIDE the sphere mapping, never instead of it:
    // the stage-sphere path keeps working untouched through 8.2, and 8.4
    // deletes it once the direct renderer has passed its own gates.
    if (frame) t.pieceAt = { x: w.px, y: w.py, z: w.pz };
    if (w.scaffold) t.scaffold = true;
    // sweep provenance rides onto the target (8.5): which bone this node
    // belongs to, where along it, and where around the ring. This is what lets
    // motion deform the SKELETON and have the skin follow, instead of warping
    // each dot independently and shearing the rings apart.
    if (w.sweep) t.sweep = w.sweep;
    targets.set(w.n.id, t);
  });
  // ── the rig rides on the piece (8.6.6) ──────────────────────────────────
  // Built once, here, because everything downstream that has to price or draw
  // an articulated piece needs the same skeleton, and building it twice is how
  // two answers to one question start disagreeing. Attached only when the score
  // actually articulates, so a legacy piece carries nothing extra.
  //
  // It also stops the `sweep` provenance repeating its own history: that sat on
  // every node for a whole phase with nothing able to read it. A rig nobody can
  // reach is a rig that does not exist.
  let rig = null;
  if (inked && artArticulated(s)) {
    const fitted = artFitStrokes(strokes, s.span, volume);
    const rigBones = strokes.map((g, i) => {
      const sec = artSectionOf(g);
      return sec ? { i, sp: fitted[i], section: sec.kind, girth: sec.girth } : null;
    }).filter(Boolean);
    const strokeToBone = new Map();
    rigBones.forEach((b, bi) => strokeToBone.set(b.i, bi));
    const counts = new Map(), moves = new Map();
    for (const [, t] of targets) {
      if (t.sweep) counts.set(strokeToBone.get(t.sweep.stroke), t.sweep.axial);
    }
    rigBones.forEach((b, bi) => { const m = artMovesOf(strokes[b.i]); if (m) moves.set(bi, m); });
    rig = { bones: rigBones, skel: artSkeleton(rigBones), strokeToBone, counts, moves };
  }

  const formKind = inked ? 'strokes' : dom[0].kind;
  const piece = {
    rig,
    id: 'score-' + formKind + '-' + s.seed,
    name: typeof s.reading === 'string' && s.reading ? s.reading : 'Untitled (' + formKind + ')',
    form: 'score:' + formKind,
    seed: s.seed,
    center: basis.c,
    palette,
    targets,
    // carried for phase 4's sketchbook: the reading is the creative act
    score: { reading: s.reading || null, intent: s.intent || null,
      gestures: inked ? ['strokes:' + strokes.length] : gestures.map((g) => g.kind + ':' + g.role) },
  };
  // the stage rides the piece, so validation and the runtime apply the same
  // laws under the right constants without being told twice
  if (onStage) piece.stage = stage;
  // object space rides it too: the frame so a mount can convert either way,
  // the volume so the renderer knows what kind of thing it is holding
  if (frame) piece.frame = frame;
  if (volume) piece.volume = volume;
  if (kfGate) {
    // room was reserved per node above, so the deltas ride at full compiled
    // reach: scale stays 1 by construction, recorded for the inspector
    const poseDelta = new Map();
    let amplitude = 0;
    working.forEach((w, i) => {
      if (kfSkip.has(w.n.id)) return;
      poseDelta.set(w.n.id, kfGate.deltas.map((pose) => ({
        du: pose.d[i].du, dv: pose.d[i].dv, dAlt: pose.d[i].dAlt })));
    });
    for (const pose of kfGate.deltas) amplitude = Math.max(amplitude, pose.maxDelta);
    piece.poseDelta = poseDelta;
    piece.motion = { kind: 'keyframes', tempo: motion.tempo, amplitude, scale: 1 };
  } else if (motion) {
    piece.motion = motion;
  }
  return { ok: true, problems: [], piece };
}

// ── discovery and reevaluation: when a piece wants to exist (tracker 3.2's
// second half, 3.4, 3.5; brief 6.1, 9, 10.1) ─────────────────────────────────
// Discovery is deterministic and runs on corpus events, never on a timer (a
// picture that improves overnight while the notes sit untouched is a
// screensaver). It emits FORM, never subject: the cheapest legal arrangement
// of the residue as it actually lies, which is find-and-lean as arithmetic.
// The agent's reading of what the form IS arrives in phase 4; nothing here
// knows what a shoal looks like.

// The piece's identity is the corpus: the same residue produces the same
// seed, so the same sea makes the same choice on every reload (invariant 9's
// deterministic half). FNV-1a over the sorted ids.
function artSeedOf(ids) {
  let h = 2166136261 >>> 0;
  for (const id of [...ids].sort()) {
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 10; h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// Does a piece want to exist, and which one? Null is the common answer and
// costs nothing. The conditions are the brief's: enough material, gathered
// enough to be one thing rather than weather, and at least one form that is
// legal against the current coastline. Among legal candidates the CHEAPEST
// wins, cost being mean displacement from truth, because the piece the sea
// was already almost making is the one the agent is helping along rather
// than imposing. Ties break by name, so the choice is total and stable.
function artDiscover(residue, lands, opts) {
  // canonical order first: float addition is not associative, so summing the
  // centroid in load order would make reload produce a piece identical only
  // to machine precision. Sorting by id makes the choice identical to the
  // byte, which is what "stable across reload" should mean.
  const nodes = (Array.isArray(residue) ? residue : []).slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (nodes.length < ART_RIG.discoverMin) return null;
  let cx = 0, cy = 0, cz = 0;
  for (const n of nodes) { cx += n.at.x; cy += n.at.y; cz += n.at.z; }
  const center = vUnit({ x: cx, y: cy, z: cz });
  if (!center) return null;
  const gathered = nodes.filter((n) => vAngle(n.at, center) <= ART_RIG.discoverRadius);
  if (gathered.length < ART_RIG.discoverMin) return null;
  const seed = artSeedOf(nodes.map((n) => n.id));
  const candidates = [];
  for (const form of Object.keys(ART_FORMS)) {
    const piece = ART_FORMS[form](nodes, center, seed);
    const verdict = artValidate(piece, lands || [], opts);
    let cost = Infinity;
    if (piece.targets.size) {
      cost = 0;
      for (const [, t] of piece.targets) cost += vAngle(t.sourceAt, t.targetAt);
      cost /= piece.targets.size;
    }
    candidates.push({ form, cost: Math.round(cost * 10000) / 10000,
      ok: verdict.ok, why: verdict.ok ? null : verdict.problems[0] });
  }
  const legal = candidates.filter((c) => c.ok);
  if (!legal.length) return null;
  legal.sort((a, b) => (a.cost - b.cost) || (a.form < b.form ? -1 : 1));
  // regenerate rather than cache: same inputs, same piece, and the candidates
  // list stays a plain report (phase 4's agent reads it to author the reading)
  return { piece: ART_FORMS[legal[0].form](nodes, center, seed), seed,
    cost: legal[0].cost, candidates };
}

// Reevaluation, with keep-unchanged as the default winner (brief 9.1) and
// change cost enforced as an absence (9.2, tracker 3.4): there is no code
// path here that returns modified targets, so settled material CANNOT be
// rearranged to improve a score. The permissible outcomes in v1 are exactly
// two: keep (the common case, zero visible change by construction) and
// dissolve (the composition can no longer sustain itself within its hard
// constraints, measured against the CURRENT coastline because a relayout
// moves the map under a standing piece, and against surviving membership
// because the art is made of transients and dissolves as they find homes).
// Absorb and partial re-settle are phase 4+ outcomes, deliberately absent.
function artReevaluate(piece, residue, lands, opts) {
  if (!piece || !piece.targets || !piece.targets.size) return { outcome: 'none', why: 'no piece' };
  const truth = new Map((residue || []).map((n) => [n.id, n.at]));
  const born = piece.born || piece.targets.size;
  let standing = 0;
  for (const [id, t] of piece.targets) {
    const at = truth.get(id);
    // gone from the residue or moved by truth: no longer material. Not a
    // verdict by itself; the runtime evicts it and the count below decides.
    if (!at || vAngle(at, t.sourceAt) > 0.001) continue;
    if ((lands || []).length) {
      if (!vContains(t.targetAt, lands, opts).contained) {
        return { outcome: 'dissolve', why: id + ': target ashore against the current coastline' };
      }
      const mid = artSlerp(t.sourceAt, t.targetAt, 0.5);
      if (!vContains(mid, lands, opts).contained) {
        return { outcome: 'dissolve', why: id + ': journey crosses the current coastline' };
      }
    }
    standing++;
  }
  if (standing < Math.ceil(born * ART_RIG.sustainShare)) {
    return { outcome: 'dissolve',
      why: 'the composition cannot sustain itself: ' + standing + ' of ' + born + ' members remain' };
  }
  return { outcome: 'keep', standing,
    why: 'nothing has broken, and settled material is never moved to improve a score' };
}

// ── the performance system (motion brief v3, frozen 2026-08-30): phase 7.1 ──
// form -> anatomy -> motion phrase -> performance. The three laws: the shape
// persists, its parts perform; motion reveals structure; nothing moves merely
// because it can. And beneath them: articulation, not distortion.
//
// Everything below is a pure function of (piece, clock). Part F.1 is the
// architecture: variation may never create an event chain that must be
// simulated forward, so phrase timing lives in a bounded deterministic
// supercycle (the seed generates a fixed set of phrase envelopes, their total
// defines the cycle) and any t maps to its frame by one modulo and one
// cumulative lookup. Where the fish is at t = 4 hours costs the same
// arithmetic as t = 4 seconds.

const ART_MOTION = {
  ampMax: 0.035,          // rad laterally, radius fraction in altitude: peak excursion
  phraseFloorMs: 20000,   // the MACRO phrase floor: acts inside are much faster (Part F, time hierarchy)
  phraseCount: 8,         // envelopes per supercycle: long-lived irregularity, zero state
  imperfection: 0.05,     // ±5%: variation in the performance, never noise on the dots
  quietShare: 0.35,       // the structural quiet default's share of ampMax
  confidenceFloor: 0.35,  // below this the engine does not pretend to see anatomy
  confidenceFull: 0.60,   // above this the full anatomical performance runs
  kinds: ['swim', 'beat', 'orbit', 'ripple', 'breathe'],
  // an act keeps its anatomical duration at every tempo (Part F.3): tempo
  // changes temperament, not frame rate. A convincing downstroke is ~2s
  // whether the phrase around it is lazy or eager.
  actMs: { swim: 2800, beat: 2000, orbit: 6000, ripple: 2400, breathe: 5200, keyframes: 3200 },
  tempos: {
    lazy:   { actsLo: 1, actsHi: 1, gap: 1.6 },
    steady: { actsLo: 1, actsHi: 2, gap: 1.0 },
    eager:  { actsLo: 2, actsHi: 3, gap: 0.55 },
  },
};

// ── the stages: one engine, two ledgers (motion brief Part C) ────────────────
// The gallery law: the globe practices restraint because motion competes
// with truth; the gallery practices range because the artwork owns the
// stage. Same budget GRAMMAR everywhere, different constants; the numbers
// are PROTOTYPE STARTING VALUES, never aesthetic commitments (Part E.4):
// range is permission, never pressure for spectacle. A piece carries its
// stage, so a sea piece and a gallery piece can perform at the same moment
// under their own laws.
//
// The tattoo inverts the sea's restraint ON PURPOSE (apc-ai-course#186): a
// sea piece shares its frame with canonical truth, so it is quiet by law;
// a tattoo lives on its own stage where the art IS the point. Density goes
// up an order of magnitude (nodes are ink, not notes: from across the room
// a heron, up close individual points of light, like a drone show
// resolving), the salience ceiling comes off, displacement stops meaning
// anything (ink has no filed truth to stay plausible to), and the palette
// is allowed to be an accent family rather than weather.
const GALLERY_RIG = Object.assign({}, ART_RIG, {
  nodeCap: 2048,          // drone-show density; the frame rate is measured, not assumed
  maxDisplacement: Math.PI, // unbound in practice: ink goes where the drawing needs it
  maxAltitude: 0.30,      // relief depth for layered linework
  sizeMin: 0.5,           // ink weight range: fine shading dots to bold stroke cores
  sizeMax: 2.4,
  maxChroma: 0.30,        // the accent family may actually read as colour here
  chromaBoost: 2.2,       // the same palettes, lifted from atmosphere to ink accent
  maxPieceEnergy: Infinity, // no salience ceiling: nothing on stage competes with truth
});
const GALLERY_MOTION = Object.assign({}, ART_MOTION, {
  ampMax: ART_MOTION.ampMax * 3,  // Part C: amplitude x3
  phraseFloorMs: 8000,            // Part C: ~8s macro floor
});
// ── the world stage (phase 8.3): a piece mounted on the globe ────────────────
// The third regime, and the reason it is not just "the gallery, smaller":
// CAPACITY AND SALIENCE ARE DIFFERENT BUDGETS. Up to four mounts of 512 nodes
// may be persisted, and at most ONE of them performs in the foreground at a
// time; the rest hold quiet. More art is not more alive.
//
// A mounted piece is a modest presence at a place on the map. Its own room is
// the exploration you click into, which compiles the same score under the
// GALLERY ledger: more ink, more chroma, more range. Same score, two readings,
// each honest about where it is standing.
const WORLD_RIG = Object.assign({}, GALLERY_RIG, {
  nodeCap: 512,           // a prototype ceiling, not a promise
  maxChroma: 0.20,        // louder than the sea, quieter than the gallery
  chromaBoost: 1.5,
  maxAltitude: 0.18,      // relief depth is small against a whole globe
});
const WORLD_MOTION = Object.assign({}, ART_MOTION, {
  ampMax: 0.06,           // local radians: a mount performs, it does not wave
  phraseFloorMs: 14000,   // between the sea's patience and the stage's range
});
const ART_STAGES = {
  sea: { rig: ART_RIG, motion: ART_MOTION },
  gallery: { rig: GALLERY_RIG, motion: GALLERY_MOTION },
  world: { rig: WORLD_RIG, motion: WORLD_MOTION },
};
function artStageOf(piece) {
  return ART_STAGES[(piece && piece.stage) || 'sea'] || ART_STAGES.sea;
}

// Anatomy is derived, never authored, and it declares its confidence (brief
// B.3): principal-axis analysis of the settled pose in the piece's own
// tangent plane. s runs 0..1 along the spine (tail to head), w is signed
// distance from the spine normalized to the widest member. The engine should
// never pretend to understand anatomy it cannot actually see, so the
// classification is conservative and 'ambiguous' is a common, honest answer.
function artAnatomy(piece) {
  const members = [];
  // scaffold is real material and structurally invisible (build plan 4.3):
  // it gets a role below so it deforms with the piece, and it never gets a
  // vote on the centroid, the axis or the confidence. A piece with no
  // scaffold -- which is every piece before 8.1 -- takes exactly the
  // arithmetic it always took, in the same order.
  const ink = [];
  let cx = 0, cy = 0, cz = 0;
  for (const [id, t] of piece.targets) {
    members.push({ id, t });
    if (t.scaffold) continue;
    ink.push(members[members.length - 1]);
    cx += t.targetAt.x; cy += t.targetAt.y; cz += t.targetAt.z;
  }
  members.sort((a, b) => (a.id < b.id ? -1 : 1));
  ink.sort((a, b) => (a.id < b.id ? -1 : 1));
  const n = ink.length || 1;
  const basis = artBasis({ x: cx, y: cy, z: cz });
  let mu = 0, mv = 0;
  for (const m of members) {
    m.u = vDot(m.t.targetAt, basis.e);
    m.v = vDot(m.t.targetAt, basis.n);
  }
  for (const m of ink) { mu += m.u; mv += m.v; }
  mu /= n; mv /= n;
  let sxx = 0, sxy = 0, syy = 0, span = 0;
  for (const m of ink) {
    const du = m.u - mu, dv = m.v - mv;
    sxx += du * du; sxy += du * dv; syy += dv * dv;
    span = Math.max(span, Math.hypot(du, dv));
  }
  sxx /= n; sxy /= n; syy /= n;
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ax = Math.cos(theta), ay = Math.sin(theta);
  let sLo = Infinity, sHi = -Infinity, wMax = 1e-9;
  for (const m of members) {
    m.sRaw = (m.u - mu) * ax + (m.v - mv) * ay;
    m.wRaw = -(m.u - mu) * ay + (m.v - mv) * ax;
  }
  for (const m of ink) {
    if (m.sRaw < sLo) sLo = m.sRaw;
    if (m.sRaw > sHi) sHi = m.sRaw;
    if (Math.abs(m.wRaw) > wMax) wMax = Math.abs(m.wRaw);
  }
  const sRange = Math.max(1e-9, sHi - sLo);
  const roles = new Map();
  let left = 0, right = 0;
  for (const m of members) {
    // the range comes from ink alone, so a scaffold point can sit just past
    // either end; s is clamped because the fields raise (1 - s) to a
    // fractional power. A no-op for every piece without scaffold, which is
    // every piece before 8.1.
    const s = Math.max(0, Math.min(1, (m.sRaw - sLo) / sRange));
    roles.set(m.id, { s, w: m.wRaw / wMax, u: m.u - mu, v: m.v - mv });
  }
  for (const m of ink) { if ((m.sRaw - sLo) / sRange < 0.5) left++; else right++; }
  const elong = Math.sqrt(l1 / Math.max(l2, 1e-12));
  const balance = Math.min(left, right) / Math.max(left, right, 1);

  let topology, confidence;
  if (n < 6) { topology = 'ambiguous'; confidence = 0.15; }
  else if (span < 0.05) { topology = 'clustered'; confidence = 0.7; }
  else if (elong >= 3.0) { topology = 'linear'; confidence = Math.min(1, 0.6 + (elong - 3) * 0.15); }
  else if (elong >= 1.8) { topology = 'elongated'; confidence = Math.min(0.9, 0.5 + (elong - 1.8) * 0.35); }
  else if (elong <= 1.3) { topology = 'radial'; confidence = 0.55; }
  else if (balance >= 0.65) { topology = 'bilateral'; confidence = 0.5 + 0.3 * balance * ((elong - 1.3) / 0.5); }
  else { topology = 'ambiguous'; confidence = 0.25; }
  // a traced piece drew its own spine: the drawing order IS the anatomy.
  // Stroked linework (the gallery's channel) is the same law: ink order is
  // the spine, so motion travels the tattoo the way it was drawn.
  if (piece.form === 'score:trace' || piece.form === 'score:strokes') {
    for (const [id, t] of piece.targets) {
      const r = roles.get(id);
      if (r) r.s = t.phase;
    }
    topology = 'linear';
    confidence = Math.max(confidence, 0.85);
  }
  confidence *= Math.min(1, 0.6 + n / 30);
  return { topology, confidence, basis, span: Math.max(span, 1e-9), elong, roles,
    axis: { u: ax, v: ay }, perp: { u: -ay, v: ax } };
}

// The bounded deterministic supercycle (Part F.1). The seed generates
// phraseCount envelopes, each with its own duration, act placement, strength
// and asymmetry; their total defines the supercycle; superT = t % total and
// one cumulative walk gives the current phrase. Rest is guaranteed real: the
// acts are confined to the front half of every phrase, so at least 40% of
// each phrase is genuine stillness. Tempo acts through act density and gap,
// never through the physical duration of an act.
function artPhrases(seed, kind, tempo, motionCfg) {
  const M = motionCfg || ART_MOTION;
  const kindHash = { swim: 11, beat: 23, orbit: 37, ripple: 53, breathe: 71, keyframes: 89 }[kind] || 3;
  const rng = artPrng(((seed >>> 0) ^ (kindHash * 2654435761)) >>> 0);
  const tm = M.tempos[tempo] || M.tempos.steady;
  const actMs = M.actMs[kind] || 2600;
  const phrases = [];
  let total = 0;
  for (let i = 0; i < M.phraseCount; i++) {
    const dur = Math.round(M.phraseFloorMs * (1 + rng() * 1.4));
    let acts = tm.actsLo + Math.round(rng() * (tm.actsHi - tm.actsLo));
    const gapMs = actMs * tm.gap;
    while (acts > 1 && acts * actMs + (acts - 1) * gapMs > dur * 0.5) acts--;
    const strength = 0.8 + rng() * 0.4;
    const asym = rng.range(-0.15, 0.15);
    const list = [];
    let at = 600 + rng() * actMs * 0.4;
    for (let k = 0; k < acts; k++) {
      list.push({ start: at, strength: strength * (k === acts - 1 ? 1 + asym : 1) });
      at += actMs + gapMs * (0.8 + rng() * 0.4);
    }
    phrases.push({ start: total, dur, acts: list });
    total += dur;
  }
  return { phrases, total, actMs, kind, tempo };
}

// One act's envelope: prepare -> act -> follow through, then nothing. The
// anticipation dips slightly negative (the head draws back before the turn),
// the action rises fast, the follow-through decays without snapping. x is
// progress through the act's own anatomical duration.
function artActCurve(x) {
  if (x <= 0 || x >= 1) return 0;
  if (x < 0.12) return -0.15 * Math.sin(Math.PI * (x / 0.12));
  if (x < 0.55) { const p = (x - 0.12) / 0.43; return p * p * (3 - 2 * p); }
  const p = (x - 0.55) / 0.45;
  return 0.5 * (1 + Math.cos(Math.PI * p));
}

// The frame's phrase state, directly addressable from (program, t): which
// phrase, how far into it, the summed act activation and the stroke progress
// of the currently active act (the wave phase the fields ride).
function artPhraseEval(program, tArt) {
  const total = program.total;
  const sT = ((tArt % total) + total) % total;
  let phrase = program.phrases[0];
  for (const p of program.phrases) { if (sT >= p.start && sT < p.start + p.dur) { phrase = p; break; } }
  const localT = sT - phrase.start;
  let activation = 0, act = 0, actIdx = 0;
  for (let k = 0; k < phrase.acts.length; k++) {
    const a = phrase.acts[k];
    const x = (localT - a.start) / program.actMs;
    const e = artActCurve(x) * a.strength;
    if (Math.abs(e) > Math.abs(activation)) {
      activation = e;
      act = Math.max(0, Math.min(1, x));
      actIdx = k;
    }
  }
  return { localT, activation, act, actIdx, phrase };
}

// The deformation fields: a primitive does not move nodes, it deforms the
// anatomy, and the anatomy carries the nodes (brief B.1). Offsets are in
// normalized units (magnitude <= ~1), scaled later by the piece's single
// coherent amplitude. Roots stay rooted, flexibility grows toward tips, and
// the whole field breathes with one activation, which is what keeps the body
// articulate rather than rubbery.
function artMotionField(kind, role, anat, ph) {
  const du = { du: 0, dv: 0, dAlt: 0 };
  if (kind === 'swim') {
    // head (s=1) leads, the impulse rolls backward, the tail sweeps widest
    const lag = (1 - role.s) * 2.4;
    const bend = 0.3 + 0.7 * Math.pow(1 - role.s, 1.6);
    const lat = Math.sin(ph.act * Math.PI * 2 - lag) * bend * ph.activation;
    du.du = anat.perp.u * lat; du.dv = anat.perp.v * lat;
  } else if (kind === 'beat') {
    // wings hinge from the core: extremity along the spine flaps, the body
    // recoils a little, tips trail the stroke
    const hinge = Math.pow(Math.abs(2 * role.s - 1), 1.5);
    const stroke = ph.activation;
    du.dAlt = stroke * hinge - 0.10 * stroke * (1 - hinge);
    const inward = -Math.sign(2 * role.s - 1) * 0.12 * hinge * Math.max(0, stroke);
    du.du = anat.axis.u * inward; du.dv = anat.axis.v * inward;
  } else if (kind === 'orbit') {
    const ru = role.u / anat.span, rv = role.v / anat.span;
    const eps = 0.5 * ph.activation;
    du.du = -rv * eps; du.dv = ru * eps;
  } else if (kind === 'ripple') {
    const pos = ph.act * 1.4 - 0.2;
    const d = (role.s - pos) / 0.18;
    du.dAlt = Math.exp(-d * d) * ph.activation;
  } else if (kind === 'breathe') {
    const ru = role.u / anat.span, rv = role.v / anat.span;
    const k = ph.activation;
    du.du = ru * 0.5 * k; du.dv = rv * 0.5 * k; du.dAlt = 0.2 * Math.max(0, k);
  }
  return du;
}

// The structural quiet default (brief B.8): derived from what the geometry
// actually is, at a fraction of the budget, and refused honestly when the
// geometry says nothing. Ambiguous forms rest; a mysterious form barely
// orbiting beats a confident flap of the wrong appendage.
function artQuietDefault(anat, motionCfg) {
  const M = motionCfg || ART_MOTION;
  if (anat.topology === 'ambiguous') return null;
  if (anat.confidence < M.confidenceFloor) {
    return { kind: 'breathe', tempo: 'lazy', amplitude: M.ampMax * M.quietShare * 0.6 };
  }
  const map = { linear: 'ripple', elongated: 'swim', bilateral: 'beat', radial: 'orbit', clustered: 'breathe' };
  return { kind: map[anat.topology], tempo: 'lazy', amplitude: M.ampMax * M.quietShare };
}

// Constraint attenuation before hard clamping (Part F.2): one scalar for the
// whole piece, computed from the member with the least room, so a beat that
// would overstretch a wing becomes the whole wing performing a coherently
// smaller beat. The per-frame geodesic clamp remains downstream as an
// emergency numerical backstop that should essentially never be visible.
// The check is axis-honest: a kind that never lifts is not attenuated by a
// tall crest, and a kind that never sweeps is not attenuated by a stretched
// member. No kind given checks both, conservatively.
const ART_MOTION_LATERAL = { swim: true, beat: true, orbit: true, breathe: true };
const ART_MOTION_VERTICAL = { beat: true, ripple: true, breathe: true };
function artMotionAttenuation(piece, amp, kind) {
  if (amp <= 0) return 0;
  const R = artStageOf(piece).rig;
  const lateral = kind == null || !!ART_MOTION_LATERAL[kind];
  const vertical = kind == null || !!ART_MOTION_VERTICAL[kind];
  let att = 1;
  for (const [, t] of piece.targets) {
    if (lateral) {
      const room = R.maxDisplacement - vAngle(t.sourceAt, t.targetAt);
      if (room < amp) att = Math.min(att, Math.max(0, room / amp));
    }
    if (vertical) {
      const altRoom = R.maxAltitude - t.altitude;
      if (altRoom < amp) att = Math.min(att, Math.max(0, altRoom / amp));
    }
  }
  return att;
}

// The plan: everything the resolver needs, computed once per piece as a pure
// function of the piece itself. Confidence gates the performance (brief B.3):
// full anatomy above confidenceFull, simplified articulation (choreography
// phase stands in for the spine) in the middle band, and below the floor the
// piece gracefully falls back to structural quiet motion or stillness.
function artMotionPlan(piece) {
  const ST = artStageOf(piece);
  const R = ST.rig, M = ST.motion;
  const anat = artAnatomy(piece);
  const imperfPhase = ((piece.seed >>> 0) % 997) / 997 * Math.PI * 2;
  // keyframes (7.2): the correspondence gate already vouched for the poses
  // at compile time, and pose zero is a trace whose anatomy is its drawing
  // order anyway, so confidence gating does not apply. The deltas carry
  // their own magnitude (they were scaled coherently into the budgets when
  // the piece compiled), so amp is the identity here.
  if (piece.motion && piece.motion.kind === 'keyframes' && piece.poseDelta) {
    const program = artPhrases(piece.seed >>> 0, 'keyframes', piece.motion.tempo || 'lazy', M);
    return { anat, kind: 'keyframes', tempo: program.tempo, amp: 1, att: 1, program,
      simplified: false, imperfPhase, deltas: piece.poseDelta, basis: artBasis(piece.center),
      energyShare: Math.min(1, (piece.motion.amplitude || 0) / R.maxDisplacement * 3) };
  }
  let m = piece.motion || null;
  let simplified = false;
  if (anat.confidence < M.confidenceFloor) m = artQuietDefault(anat, M);
  else if (!m) m = artQuietDefault(anat, M);
  else if (anat.confidence < M.confidenceFull) simplified = true;
  if (!m) return null;
  const askAmp = Math.min(Math.abs(m.amplitude != null ? m.amplitude : 0.02), M.ampMax);
  const att = artMotionAttenuation(piece, askAmp, m.kind);
  if (askAmp * att < 1e-5) return null;
  const program = artPhrases(piece.seed >>> 0, m.kind, m.tempo || 'lazy', M);
  // deterministic imperfection rides a second, non-harmonic timescale
  // (total/pi is irrational relative to the supercycle) and modulates the
  // performance, never the dots (Part F): the same t gives the same mod
  let actsPerPhrase = 0;
  for (const p of program.phrases) actsPerPhrase += p.acts.length;
  actsPerPhrase /= program.phrases.length;
  return { anat, kind: m.kind, tempo: program.tempo, amp: askAmp * att, att, program,
    simplified, imperfPhase, basis: anat.basis,
    energyShare: (askAmp * att / M.ampMax) * Math.min(1, actsPerPhrase / 3) };
}

// The per-node, per-frame offset: pure in (plan, target, tArt), normalized
// units out (keyframe deltas carry radians and amp is 1 for them, so the
// contract holds either way). Simplified articulation swaps the inferred
// spine for the choreography phase, which every piece carries honestly.
// phOverride is the accent seam (Part F.4): recognition temporarily selects
// a phrase inside this same resolver, never a separate effect layer.
function artMotionEval(plan, target, tArt, phOverride) {
  const ph = phOverride || artPhraseEval(plan.program, tArt);
  const mod = 1 + ART_MOTION.imperfection *
    Math.sin((tArt / (plan.program.total / Math.PI)) * Math.PI * 2 + plan.imperfPhase);
  if (plan.kind === 'keyframes') {
    const d = plan.deltas.get(target.id);
    if (!d) return null;
    const pose = d[(ph.actIdx || 0) % d.length];
    const w = Math.max(0, ph.activation);
    return { du: pose.du * w * mod, dv: pose.dv * w * mod, dAlt: pose.dAlt * w * mod };
  }
  let role = plan.anat.roles.get(target.id);
  if (!role) return null;
  if (plan.simplified) role = { s: target.phase, w: role.w, u: role.u, v: role.v };
  const f = artMotionField(plan.kind, role, plan.anat, ph);
  return { du: f.du * mod, dv: f.dv * mod, dAlt: f.dAlt * mod };
}

// ── the anatomy contract in three dimensions (phase 8.1, build plan 4.2) ─────
// 7.1's law, carried into object space with its honesty intact: the engine
// never pretends to see anatomy it cannot see. PCA is allowed to DESCRIBE a
// shape without pretending to UNDERSTAND it, so this returns three things and
// all three are load-bearing -- canonicalized axes, per-band confidence, and
// a declared degeneracy. A radial piece does not get a spine here. It gets
// told that it has none.
//
// Gallery only. The sea keeps its 2D tangent-plane anatomy byte for byte.

// How far from equal two eigenvalues must be before the smaller axis is a
// real distinction rather than measurement noise in a symmetric blob.
const ART_DEGENERATE_RATIO = 0.8;
// Below this depth ratio a 3D deformation component would be inventing a
// dimension the piece does not have, so the fields fade theirs out.
const ART_DEPTH_FULL = 0.15;

function artAnatomy3d(piece) {
  if (!piece || !piece.targets || !piece.targets.size) return null;
  const all = [];
  const ink = [];
  for (const [id, t] of piece.targets) {
    if (!t.pieceAt) continue;
    all.push({ id, t });
    // SCAFFOLD IS EXCLUDED FROM ANATOMY (build plan 4.3). It is real material
    // and it will be given a role below so it deforms with the piece, but it
    // never gets a vote on what the axes are. The scaffold follows the
    // sculpture; the sculpture never follows the scaffold.
    if (!t.scaffold) ink.push({ id, t });
  }
  if (ink.length < 3) return null;
  // canonical order before any float summation: reload must reproduce the
  // frame to the byte, not merely to machine precision (invariant 9)
  all.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  ink.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const n = ink.length;
  let mx = 0, my = 0, mz = 0;
  for (const m of ink) { mx += m.t.pieceAt.x; my += m.t.pieceAt.y; mz += m.t.pieceAt.z; }
  mx /= n; my /= n; mz /= n;
  let sxx = 0, sxy = 0, sxz = 0, syy = 0, syz = 0, szz = 0, reach = 1e-9;
  for (const m of ink) {
    const dx = m.t.pieceAt.x - mx, dy = m.t.pieceAt.y - my, dz = m.t.pieceAt.z - mz;
    sxx += dx * dx; sxy += dx * dy; sxz += dx * dz;
    syy += dy * dy; syz += dy * dz; szz += dz * dz;
    reach = Math.max(reach, Math.hypot(dx, dy, dz));
  }
  const eig = artJacobi3([[sxx / n, sxy / n, sxz / n], [sxy / n, syy / n, syz / n],
    [sxz / n, syz / n, szz / n]]);
  const l1 = Math.max(eig.values[0], 1e-30);
  const l2 = Math.max(eig.values[1], 0), l3 = Math.max(eig.values[2], 0);
  let V1 = eig.vectors[0], V2 = eig.vectors[1];

  // ── sign canonicalization ──────────────────────────────────────────────
  // An eigenvector's sign is arbitrary to the math and NOT arbitrary to the
  // art: if V1 flipped between compiles, a swim would run head-first one
  // reload and tail-first the next. So V1 FOLLOWS THE INK -- first mark to
  // last mark, which is ink order for a stroked piece and choreography phase
  // order for anything else, the same quantity either way. V2 follows the
  // authored +u convention (piece-space +x IS the u the artist drew in), and
  // V3 is V1 x V2 always, so the frame is right-handed by construction.
  let first = ink[0], last = ink[0];
  for (const m of ink) {
    if (m.t.phase < first.t.phase) first = m;
    if (m.t.phase > last.t.phase) last = m;
  }
  const ax = last.t.pieceAt.x - first.t.pieceAt.x;
  const ay = last.t.pieceAt.y - first.t.pieceAt.y;
  const az = last.t.pieceAt.z - first.t.pieceAt.z;
  if (V1.x * ax + V1.y * ay + V1.z * az < 0) V1 = { x: -V1.x, y: -V1.y, z: -V1.z };
  // ties (a V2 exactly perpendicular to +x) fall through to +y then +z, so
  // the choice is total rather than left to floating-point luck
  const pick = Math.abs(V2.x) > 1e-9 ? V2.x : (Math.abs(V2.y) > 1e-9 ? V2.y : V2.z);
  if (pick < 0) V2 = { x: -V2.x, y: -V2.y, z: -V2.z };
  const V3 = vCross(V1, V2);

  const r21 = l2 / l1, r31 = l3 / l1;
  const degeneracy = r31 > ART_DEGENERATE_RATIO ? 'isotropic'
    : r21 > ART_DEGENERATE_RATIO ? 'radial'
    : r31 < 0.05 ? 'planar' : 'none';
  const confidence = {
    primary: Math.max(0, Math.min(1, 1 - r21)),   // is there a spine at all
    secondary: Math.max(0, Math.min(1, 1 - (l2 > 0 ? l3 / l2 : 1))), // is there a sheet
    depth: Math.max(0, Math.min(1, r31)),          // is there genuine body
  };
  // roles for EVERY point, ink and scaffold alike: s runs 0..1 along V1, a
  // and b are the V2 and V3 coefficients normalized to the piece's reach.
  // Scaffold gets a role because it must deform with the sculpture; it did
  // not get a vote in computing the axes it is now projected onto.
  let sLo = Infinity, sHi = -Infinity;
  for (const m of ink) {
    const dx = m.t.pieceAt.x - mx, dy = m.t.pieceAt.y - my, dz = m.t.pieceAt.z - mz;
    const s = dx * V1.x + dy * V1.y + dz * V1.z;
    if (s < sLo) sLo = s;
    if (s > sHi) sHi = s;
  }
  const sRange = Math.max(1e-9, sHi - sLo);
  const roles = new Map();
  for (const m of all) {
    const dx = m.t.pieceAt.x - mx, dy = m.t.pieceAt.y - my, dz = m.t.pieceAt.z - mz;
    const s = dx * V1.x + dy * V1.y + dz * V1.z;
    roles.set(m.id, {
      s: Math.max(0, Math.min(1, (s - sLo) / sRange)),
      a: (dx * V2.x + dy * V2.y + dz * V2.z) / reach,
      b: (dx * V3.x + dy * V3.y + dz * V3.z) / reach,
      c: s / reach,
      scaffold: !!m.t.scaffold,
    });
  }
  return { axes: { V1, V2, V3 }, values: { l1: eig.values[0], l2, l3 },
    confidence, degeneracy, roles, reach, center: { x: mx, y: my, z: mz } };
}

// The deformation output generalized (build plan section 2): 7.1's fields are
// KEPT WHOLE -- phrases, acts, lag, hinge, bell -- and only their output
// changes shape, from tangent-plane {du, dv, dAlt} to piece-space {d1, d2,
// d3} on the anatomy axes. The correspondence is exact and not a coincidence:
// the 2D lateral IS V2, the 2D along-spine IS V1, and the 2D altitude (out of
// the drawing's plane) IS V3.
//
// The extra dimension 8.1 buys is spent honestly. A component that only
// exists in three dimensions -- swim's roll, breathe's depth swell -- is
// gated by the piece's DECLARED depth confidence, so a flat piece performs
// exactly the motion 7.1 gave it and a piece with a body gets the rest. The
// engine adds a dimension to the performance only when the artwork has one.
function artMotionField3d(kind, role, anat3, ph) {
  const d = { d1: 0, d2: 0, d3: 0 };
  const body = Math.min(1, anat3.confidence.depth / ART_DEPTH_FULL);
  if (kind === 'swim') {
    const lag = (1 - role.s) * 2.4;
    const bend = 0.3 + 0.7 * Math.pow(1 - role.s, 1.6);
    d.d2 = Math.sin(ph.act * Math.PI * 2 - lag) * bend * ph.activation;
    d.d3 = Math.cos(ph.act * Math.PI * 2 - lag) * bend * ph.activation * 0.5 * body;
  } else if (kind === 'beat') {
    const hinge = Math.pow(Math.abs(2 * role.s - 1), 1.5);
    const stroke = ph.activation;
    d.d3 = stroke * hinge - 0.10 * stroke * (1 - hinge);
    d.d1 = -Math.sign(2 * role.s - 1) * 0.12 * hinge * Math.max(0, stroke);
  } else if (kind === 'orbit') {
    // about V1, the spine (captured spec 3.2, adopted): a first-order
    // rotation of the section perpendicular to the axis, which is the same
    // arithmetic 7.1's in-plane orbit used, one axis over
    const eps = 0.5 * ph.activation;
    d.d2 = -role.b * eps; d.d3 = role.a * eps;
  } else if (kind === 'ripple') {
    const pos = ph.act * 1.4 - 0.2;
    const x = (role.s - pos) / 0.18;
    d.d3 = Math.exp(-x * x) * ph.activation;
  } else if (kind === 'breathe') {
    const k = ph.activation;
    d.d1 = role.c * 0.5 * k;
    d.d2 = role.a * 0.5 * k;
    d.d3 = 0.2 * Math.max(0, k) + role.b * 0.5 * k * body;
  }
  return d;
}

// The structural quiet default, in three dimensions: derived from what the
// geometry ACTUALLY IS, which now includes the honest answer "this piece has
// no spine". A radial or isotropic form breathes; a planar one ripples along
// the order it was drawn in. Nothing here invents an axis.
function artQuietDefault3d(anat3, motionCfg) {
  const M = motionCfg || ART_MOTION;
  const kind = anat3.degeneracy === 'planar' ? 'ripple' : 'breathe';
  return { kind, tempo: 'lazy', amplitude: M.ampMax * M.quietShare };
}

// Spine-dependent kinds, per the anatomy contract: these two read the V1 axis
// as an anatomical claim, so a piece with no spine may not perform them at
// full confidence. The other three are radial and stay fully available.
const ART_MOTION_SPINEBOUND = { swim: true, orbit: true };

// The object-space plan: 7.1's plan whole (phrases, imperfection, coherent
// attenuation, keyframes, lifecycle), plus the 3D anatomy and the one gate
// the anatomy contract demands. A spine-dependent kind on a piece whose first
// two eigenvalues are indistinguishable does not get a fake spine; it
// degrades through the SAME confidence bands 7.1 already uses for an
// unreadable 2D form -- simplified articulation in the middle band, the
// structural quiet default below the floor.
function artMotionPlan3d(piece) {
  const base = artMotionPlan(piece);
  const anat3 = artAnatomy3d(piece);
  if (!anat3) return base;
  if (!base) return null;
  const M = artStageOf(piece).motion;
  if (base.kind === 'keyframes' || !ART_MOTION_SPINEBOUND[base.kind]) {
    return Object.assign({}, base, { anat3 });
  }
  const c = anat3.confidence.primary;
  if (c >= M.confidenceFull) return Object.assign({}, base, { anat3 });
  if (c >= M.confidenceFloor) {
    return Object.assign({}, base, { anat3, simplified: true });
  }
  const quiet = artQuietDefault3d(anat3, M);
  const amp = Math.min(quiet.amplitude, M.ampMax);
  const att = artMotionAttenuation(piece, amp, quiet.kind);
  if (amp * att < 1e-5) return null;
  return Object.assign({}, base, {
    anat3, kind: quiet.kind, tempo: quiet.tempo, simplified: false,
    amp: amp * att, att, degraded: base.kind,
    program: artPhrases(piece.seed >>> 0, quiet.kind, quiet.tempo, M),
  });
}

// The per-node, per-frame offset in piece space. Same contract as 7.1's
// resolver -- pure in (plan, target, clock), normalized units out, the accent
// seam honoured -- with keyframe deltas mapped onto the anatomy axes so a
// morph authored in the drawing's plane still means the same thing when the
// drawing is a body.
function artMotionEval3d(plan, target, tArt, phOverride) {
  if (!plan || !plan.anat3) return null;
  const ph = phOverride || artPhraseEval(plan.program, tArt);
  const mod = 1 + ART_MOTION.imperfection *
    Math.sin((tArt / (plan.program.total / Math.PI)) * Math.PI * 2 + plan.imperfPhase);
  if (plan.kind === 'keyframes') {
    const d = plan.deltas.get(target.id);
    if (!d) return null;
    const pose = d[(ph.actIdx || 0) % d.length];
    const w = Math.max(0, ph.activation);
    // a pose delta was authored as (du, dv, dAlt) in the drawing's own plane:
    // du runs along the drawing, dv across it, dAlt out of it, which is
    // exactly the V1/V2/V3 reading of the same three numbers
    return { d1: pose.du * w * mod, d2: pose.dv * w * mod, d3: pose.dAlt * w * mod };
  }
  let role = plan.anat3.roles.get(target.id);
  if (!role) return null;
  if (plan.simplified) role = Object.assign({}, role, { s: target.phase });
  const f = artMotionField3d(plan.kind, role, plan.anat3, ph);
  return { d1: f.d1 * mod, d2: f.d2 * mod, d3: f.d3 * mod };
}

// ── validation: hard constraints as rejection (tracker 3.3) ─────────────────
// A generator knows form; this knows law. Containment is checked at every
// target AND at the geodesic midpoint of every node's journey, because the
// animation travels the geodesic and a path that nicks a promontory halfway is
// the same lie as a target ashore. One bad node rejects the piece: containment
// is never a weighted term.
function artValidate(piece, lands, opts) {
  const o = opts || {};
  const problems = [];
  let energy = 0;
  if (!piece || !piece.targets || !piece.targets.size) {
    return { ok: false, problems: ['no targets'], energy: 0 };
  }
  // the law under the piece's own ledger: a gallery piece is checked against
  // the stage's constants, a sea piece against the sea's, same grammar
  const ST = artStageOf(piece);
  const R = ST.rig, M = ST.motion;
  // the sweeping motion envelope (motion brief B.6): containment holds over
  // everywhere the performance can reach, not just the mean pose, checked as
  // the four tangent extremes at the piece's EFFECTIVE amplitude (after
  // coherent attenuation). Motion also joins the salience price per node.
  let effAmp = 0, motionShare = 0, envBasis = null;
  const kf = piece.motion && piece.motion.kind === 'keyframes' && piece.poseDelta ? piece.poseDelta : null;
  if (kf) {
    // keyframes sweep a directed path, not a disc: containment is checked
    // along each pose blend below, and the pose distance prices the motion
    motionShare = Math.min(1, (piece.motion.amplitude || 0) / R.maxDisplacement * 3);
    envBasis = artBasis(piece.center);
  } else if (piece.motion) {
    const asked = Math.min(Math.abs(piece.motion.amplitude || 0.02), M.ampMax);
    effAmp = asked * artMotionAttenuation(piece, asked, piece.motion.kind);
    motionShare = effAmp / M.ampMax;
    envBasis = artBasis(piece.center);
  }
  for (const [id, t] of piece.targets) {
    const len = Math.hypot(t.targetAt.x, t.targetAt.y, t.targetAt.z);
    if (Math.abs(len - 1) > 1e-6) problems.push(id + ': target is not a unit vector');
    const d = vAngle(t.sourceAt, t.targetAt);
    if (d > R.maxDisplacement + 1e-6) problems.push(id + ': displacement ' + d.toFixed(3) + ' exceeds budget');
    if (t.altitude < 0) problems.push(id + ': altitude submerges below the surface');
    if (t.altitude > R.maxAltitude + 1e-6) problems.push(id + ': altitude exceeds the ledger');
    if (t.sizeMultiplier < R.sizeMin - 1e-6 || t.sizeMultiplier > R.sizeMax + 1e-6) {
      problems.push(id + ': size ' + t.sizeMultiplier.toFixed(2) + ' outside the envelope');
    }
    const e = artEnergy(d, t.altitude, t.sizeMultiplier, motionShare, R);
    if (e > 1 + 1e-6) problems.push(id + ': node energy ' + e.toFixed(2) + ' exceeds 1.0');
    energy += e;
    const landsIn = lands || [];
    if (landsIn.length) {
      if (!vContains(t.targetAt, landsIn, o).contained) problems.push(id + ': target ashore');
      const mid = artSlerp(t.sourceAt, t.targetAt, 0.5);
      if (!vContains(mid, landsIn, o).contained) problems.push(id + ': journey crosses land');
      if (kf && kf.has(id)) {
        // every pose the node can reach, and the halfway blends it morphs
        // through, must stay at sea: same law as the journey midpoint
        outer:
        for (const d of kf.get(id)) {
          for (const w of [0.5, 1]) {
            const ext = vUnit({
              x: t.targetAt.x + (envBasis.e.x * d.du + envBasis.n.x * d.dv) * w,
              y: t.targetAt.y + (envBasis.e.y * d.du + envBasis.n.y * d.dv) * w,
              z: t.targetAt.z + (envBasis.e.z * d.du + envBasis.n.z * d.dv) * w,
            });
            if (!vContains(ext, landsIn, o).contained) {
              problems.push(id + ': motion envelope crosses land');
              break outer;
            }
          }
        }
      } else if (effAmp > 0) {
        for (const [su, sv] of [[effAmp, 0], [-effAmp, 0], [0, effAmp], [0, -effAmp]]) {
          const ext = vUnit({
            x: t.targetAt.x + envBasis.e.x * su + envBasis.n.x * sv,
            y: t.targetAt.y + envBasis.e.y * su + envBasis.n.y * sv,
            z: t.targetAt.z + envBasis.e.z * su + envBasis.n.z * sv,
          });
          if (!vContains(ext, landsIn, o).contained) {
            problems.push(id + ': motion envelope crosses land');
            break;
          }
        }
      }
    }
  }
  if (energy > R.maxPieceEnergy) problems.push('piece energy ' + energy.toFixed(1) + ' exceeds ' + R.maxPieceEnergy);
  return { ok: problems.length === 0, problems, energy: Math.round(energy * 100) / 100 };
}

// ── the runtime: one piece, resolved deterministically in time ───────────────
// Gather -> Reveal -> Settle -> Hold -> Release (3D brief D.6). Two deliberate
// departures from the spec this was translated from, both recorded in Part E:
// Hold is INDEFINITE (a clock that releases the piece by itself is the art
// performing its own disappearance at nobody, which discover-only forbids;
// release comes from retirement, eviction or dissolution), and suppression
// pauses the piece's clock without destroying anything, so it comes back
// exactly as it was, which is what the yield law promised in phase 1.
//
// One active piece, enforced here by construction: start() while a piece is
// live is refused, not queued. That is invariant 7's subject.
function artRuntime() {
  let piece = null;
  let t0 = 0;
  let calm = false;
  let state = 'idle';
  let stillAt = null;      // suppress: when the clock stopped
  let stillFor = 0;        // total suppressed time, credited back to the clock
  let releaseAt = null;    // retire: when the release began
  let flourishAt = null;   // the one bounded expressive animation's start, or null
  let flourished = false;  // once per piece, by construction
  let dark = true;
  let kindLabs = [];
  let tints = null;        // per-node resolved tint cache, dropped on theme change
  let plan;                // the motion plan, computed once per piece (pure in the piece)
  let planFor = null;
  let plan3;               // its object-space twin, computed only if anyone asks
  let plan3For = null;
  let handAt = null;       // manipulation: when the hand took hold, or null
  let handOff = null;      // when it let go (the restore eases from here)

  // the piece's own ledger (Part C: one engine, two stages); sea until start()
  let R = ART_RIG, M = ART_MOTION, RELEASE_MS = Math.round(ART_RIG.cycleMs * 0.08);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  // manipulation outranks performance, gracefully (Part C): while the hand
  // holds the stage the performance eases toward this share of itself, and
  // eases back after release. Never a snap in either direction.
  const HAND_SHARE = 0.6, HAND_EASE_MS = 600, HAND_RESTORE_MS = 900;

  // the manipulation gain right now: 1 untouched, easing to HAND_SHARE under
  // the hand, easing home after release. Pure in (handAt, handOff, now).
  function handFactor(now) {
    if (handAt == null) return 1;
    const drop = Math.min(1, Math.max(0, ((handOff == null ? now : handOff) - handAt) / HAND_EASE_MS));
    const held = 1 - (1 - HAND_SHARE) * ease(drop);
    if (handOff == null) return held;
    const back = Math.min(1, Math.max(0, (now - handOff) / HAND_RESTORE_MS));
    return held + (1 - held) * ease(back);
  }

  function tintOf(target) {
    if (!tints) {
      tints = new Map();
      for (const [id, t] of piece.targets) tints.set(id, artTintResolve(piece.palette, t.phase, dark, kindLabs, R));
    }
    return tints.get(target.id);
  }

  return {
    // one piece at a time, by construction
    start(p, now, reducedMotion) {
      if (piece) return false;
      piece = p;
      // original membership, so dissolution is measured against what the
      // piece was born with rather than against whatever eviction left behind
      if (p && p.targets && p.born == null) p.born = p.targets.size;
      const ST = artStageOf(p);
      R = ST.rig; M = ST.motion;
      RELEASE_MS = Math.round(R.cycleMs * 0.08);
      t0 = now;
      calm = !!reducedMotion;
      state = 'gather';
      stillAt = null; stillFor = 0; releaseAt = null; tints = null;
      flourishAt = null; flourished = false;
      plan = undefined; planFor = null;
      plan3 = undefined; plan3For = null;
      handAt = null; handOff = null;
      return true;
    },
    // suppression: the view is owed the space, the piece is not lost. The
    // clock pauses so a course put down mid-reveal resumes the reveal at the
    // exact frame it left, never further along.
    still(on, now) {
      if (!piece) return false;
      if (on && stillAt == null) stillAt = now;
      else if (!on && stillAt != null) { stillFor += now - stillAt; stillAt = null; }
      return stillAt != null;
    },
    // retirement: the beginning of Release, not an instant vanish
    retire(now) {
      if (!piece || releaseAt != null) return false;
      releaseAt = now;
      return true;
    },
    // ── the one bounded expressive animation (brief 11, tracker 6.1) ────────
    // The runtime is the LAST line of the conjunction: the page checks that
    // legibility is high, noticed_at is set, the member is attending and the
    // globe is actually being viewed; the rig refuses everything the page
    // cannot know from out there. Refused under reduced motion (never a
    // degraded version, simply none), refused while yielded, refused during
    // release, refused before the piece has settled into Hold (a flourish
    // mid-reveal would be the choreography arguing with itself), and refused
    // forever after the first: once per piece, by construction. What plays
    // is a single breath, a ripple crossing the piece in its own choreography
    // order, altitude only (the primary brush's quiet half), decaying to
    // exactly the stillness it started from.
    flourish(now) {
      if (!piece || calm || stillAt != null || releaseAt != null || flourished) return false;
      // recognition stays sea-art-only (Part C): a tattoo is commissioned,
      // not discovered, so there is no "noticed" moment for it to answer
      if (piece.stage === 'gallery') return false;
      if (state !== 'hold') return false;
      flourishAt = now;
      flourished = true;
      return true;
    },
    // ── the hand (Part C, 7.3): manipulation outranks performance ───────────
    // A boolean input like still(), but easing a gain instead of stopping a
    // clock: while held, motionGain eases toward HAND_SHARE of itself; on
    // release it eases back to full. The art clock never pauses (the piece
    // keeps living under the hand, just more quietly), and the response is
    // deterministic in the input times, so two rigs given the same touches
    // on the same clock still agree byte for byte.
    hand(on, now) {
      if (!piece) return false;
      if (on && (handAt == null || handOff != null)) {
        // a re-grab mid-restore must not snap: backdate the new hold so its
        // ease-in curve passes through the factor the piece is showing NOW
        const f = handFactor(now);
        if (f < 1 - 1e-9) {
          const want = (1 - f) / (1 - HAND_SHARE);
          let lo = 0, hi = 1;
          for (let i = 0; i < 24; i++) {
            const mid = (lo + hi) / 2;
            if (ease(mid) < want) lo = mid; else hi = mid;
          }
          handAt = now - ((lo + hi) / 2) * HAND_EASE_MS;
        } else {
          handAt = now;
        }
        handOff = null;
      } else if (!on && handAt != null && handOff == null) {
        handOff = now;
      }
      return handAt != null && handOff == null;
    },
    theme(t) {
      dark = t && t.dark != null ? !!t.dark : dark;
      kindLabs = (t && t.kindColors ? t.kindColors : []).map(artOklabOf).filter(Boolean);
      tints = null;
    },
    state() { return state; },
    piece() { return piece; },
    // ── the lifecycle, computed once and composed twice (phase 8.2) ────────
    // Gather, Reveal, Settle, Hold, Release, motionGain, the hand, the accent
    // seam: all of it is the piece's own clock and none of it is geometry, so
    // it is resolved HERE and handed to whichever composition is asking. The
    // sphere path and object space are two readings of one performance, not
    // two performances -- if this lived twice, the stage and the globe would
    // eventually disagree about what the piece was doing.
    lifecycle(target, now) {
      // release: decay whatever the channels currently hold, then dissolve
      let decay = 1;
      if (releaseAt != null) {
        const rt = (now - releaseAt) / RELEASE_MS;
        if (rt >= 1) { piece = null; state = 'idle'; return null; }
        state = 'release';
        decay = 1 - ease(Math.max(0, Math.min(1, rt)));
      }

      let posT, altT, sizeT, colT;
      // motionGain (motion brief B.5): life is not switched on after Settle,
      // it emerges during Reveal, reaches most of itself through Settle, and
      // is full in the Alive hold. Reduced motion is zero, not slower. Release
      // decays it with everything else.
      let mGain = 0;
      if (calm) {
        // reduced motion: the settled piece, no choreography, never withheld
        posT = 1; altT = 1; sizeT = 1; colT = 1;
        if (releaseAt == null) state = 'hold';
      } else {
        const normT = Math.max(0, (now - t0 - stillFor)) / R.cycleMs;
        mGain = normT < 0.45 ? 0
          : normT < 0.65 ? ((normT - 0.45) / 0.2) * 0.35
          : normT < 0.8 ? 0.35 + ((normT - 0.65) / 0.15) * 0.45
          : 1;
        if (normT < 0.15) {
          if (releaseAt == null) state = 'gather';
          const g = normT / 0.15;
          posT = 0.1 * g * g; altT = 0; sizeT = 0; colT = 0;
        } else if (normT < 0.65) {
          if (releaseAt == null) state = 'reveal';
          // the piece's own choreography: each node's reveal begins at its
          // phase (tail to head, centre to perimeter), never at its index
          const rp = (normT - 0.15) / 0.5;
          const nt = Math.max(0, Math.min(1, (rp - target.phase * R.stagger) / (1 - R.stagger)));
          posT = 0.1 + 0.9 * ease(nt);
          altT = Math.pow(nt, 1.4);       // height arrives after position
          sizeT = nt;
          colT = nt * nt;                 // colour arrives later still
        } else if (normT < 0.8) {
          if (releaseAt == null) state = 'settle';
          posT = 1; altT = 1; sizeT = 1; colT = 1;
        } else {
          // and then stillness, for as long as the piece lives (Part E: the
          // spec's self-timed release is the one thing not carried over)
          if (releaseAt == null) state = 'hold';
          posT = 1; altT = 1; sizeT = 1; colT = 1;
        }
      }

      posT *= decay; altT *= decay; sizeT *= decay; colT *= decay;

      // recognition (7.2, motion brief Part F.4): the response to being
      // seen is an accent phrase temporarily selected INSIDE the resolver,
      // never a separate effect layer. A piece with an authored program
      // answers in its own vocabulary (the fish sweeps, the heron beats its
      // wings once), at its ordinary amplitude, staggered by its own phase
      // order. A piece with no program keeps the phase 6 ripple: a quiet
      // piece's honest response is its quiet breath, altitude only.
      let lift = 0, accentPh = null;
      if (flourishAt != null) {
        const ft = (now - flourishAt) / R.flourishMs;
        if (ft >= 1) flourishAt = null;
        else {
          // the breath is a state of its own so an observer (dev handle,
          // inspector, a live proof) can see it happen and see it end
          if (releaseAt == null) state = 'flourish';
          const nt = Math.max(0, Math.min(1,
            (ft * (1 + R.stagger) - target.phase * R.stagger)));
          if (piece.motion) {
            if (planFor !== piece) { plan = artMotionPlan(piece); planFor = piece; }
          }
          if (piece.motion && plan) {
            accentPh = { activation: Math.sin(Math.PI * nt), act: nt, actIdx: 0 };
          } else {
            lift = Math.sin(Math.PI * Math.max(0, Math.min(1, nt))) * R.flourishLift * decay;
          }
        }
      }

      // the performance (motion brief, phase 7.1): the shape persists, its
      // parts perform. Offsets ride the piece's ART clock (yield froze it;
      // a hidden tab did not: no performance is rendered or simulated while
      // unseen, phase advances analytically with the wall clock), scaled by
      // the plan's coherently attenuated amplitude and the lifecycle gain.
      mGain *= decay;
      // the hand: manipulation eases the performance toward a share of
      // itself and releases it back (Part C). The clock keeps running; the
      // factor is pure in the touch times, and fully restored hands reset
      // so a long-lived piece never accumulates stale touch state.
      if (handAt != null) {
        mGain *= handFactor(now);
        if (handOff != null && now - handOff >= HAND_RESTORE_MS) { handAt = null; handOff = null; }
      }
      return { decay, posT, altT, sizeT, colT, mGain, lift, accentPh,
        tArt: now - t0 - stillFor };
    },
    // The resolver (3D brief D.7): a pure function of piece, truth, time and
    // yield state. Returns null for "no override", which costs the render
    // loop nothing further.
    evaluate(id, truthAt, depth, now) {
      if (!piece || stillAt != null) return null;
      const target = piece.targets.get(id);
      if (!target) return null;
      // eviction by truth: the note moved (retag, promotion), so it has left
      // the piece. Same law as phase 1's artEvicts, applied geometrically.
      if (vAngle(truthAt, target.sourceAt) > 0.001) { piece.targets.delete(id); return null; }
      const L = this.lifecycle(target, now);
      if (!L) return null;

      const cur = artSlerp(truthAt, target.targetAt, L.posT);
      let at = artClampDisp(truthAt, cur, R.maxDisplacement);
      let altitude = Math.min(target.altitude * L.altT + L.lift, R.maxAltitude);
      const sizeMultiplier = 1 + (target.sizeMultiplier - 1) * L.sizeT;

      // The geodesic clamp below is the emergency backstop that attenuation
      // should keep invisible.
      let motionShare = 0;
      if (L.mGain > 0.001) {
        if (planFor !== piece) { plan = artMotionPlan(piece); planFor = piece; }
        if (plan) {
          const off = artMotionEval(plan, target, L.tArt, L.accentPh);
          if (off) {
            const a = plan.amp * L.mGain;
            const b = plan.basis || plan.anat.basis;
            const moved = vUnit({
              x: at.x + (b.e.x * off.du + b.n.x * off.dv) * a,
              y: at.y + (b.e.y * off.du + b.n.y * off.dv) * a,
              z: at.z + (b.e.z * off.du + b.n.z * off.dv) * a,
            });
            at = artClampDisp(truthAt, moved, R.maxDisplacement);
            altitude = Math.max(0, Math.min(R.maxAltitude, altitude + off.dAlt * a));
            // keyframe deltas carry radians (amp is the identity for them),
            // so their perceptual price is the compiled share, not amp/cap
            motionShare = Math.min(1, plan.kind === 'keyframes'
              ? plan.energyShare : plan.amp / M.ampMax) * L.mGain;
          }
        }
      }
      const ink = this.tintAt(target, L.colT);
      return {
        at, altitude, sizeMultiplier, tint: ink ? ink.css : null,
        energy: artEnergy(vAngle(truthAt, at), altitude, sizeMultiplier, motionShare, R),
      };
    },
    // ── the object-space resolver (phase 8.2) ─────────────────────────────
    // The same performance, composed in the piece's own frame instead of on
    // the sphere. There is no member truth on a stage and no coastline, so
    // what the sphere path spends on geodesics and displacement clamps, this
    // spends on nothing: a piece-space offset is just an offset.
    //
    // The reveal reads as INK ARRIVING. On the sphere a node travels from
    // where the note actually sits to where the drawing wants it; in object
    // space there is no "where it was", so the analogue is the piece drawing
    // itself outward from its own centre, in the ink order it was authored
    // in. Same choreography, same phase stagger, same law.
    //
    // Amplitudes convert through the frame: the plan's amp is in radians of
    // arc (the sea's unit) and piece space is normalized to the unit bounding
    // sphere, so one piece-space unit is 1/scale radians. Without this the
    // stage and the globe would perform the same score at different sizes.
    evaluate3d(id, now) {
      if (!piece || stillAt != null) return null;
      const target = piece.targets.get(id);
      if (!target || !target.pieceAt) return null;
      const L = this.lifecycle(target, now);
      if (!L) return null;

      const grow = 0.1 + 0.9 * L.posT;
      let at = { x: target.pieceAt.x * grow, y: target.pieceAt.y * grow, z: target.pieceAt.z * grow };
      const sizeMultiplier = 1 + (target.sizeMultiplier - 1) * L.sizeT;
      const toPiece = (piece.frame && piece.frame.scale) || 1;

      if (L.mGain > 0.001) {
        if (plan3For !== piece) { plan3 = artMotionPlan3d(piece); plan3For = piece; }
        if (plan3 && plan3.anat3) {
          const off = artMotionEval3d(plan3, target, L.tArt, L.accentPh);
          if (off) {
            const a = plan3.amp * L.mGain * toPiece;
            const A = plan3.anat3.axes;
            at.x += (A.V1.x * off.d1 + A.V2.x * off.d2 + A.V3.x * off.d3) * a;
            at.y += (A.V1.y * off.d1 + A.V2.y * off.d2 + A.V3.y * off.d3) * a;
            at.z += (A.V1.z * off.d1 + A.V2.z * off.d2 + A.V3.z * off.d3) * a;
          }
        }
      }
      if (L.lift) {
        // the quiet breath, if a piece ever gets one here: out of the
        // drawing's own plane, which is what altitude means in object space
        if (plan3For !== piece) { plan3 = artMotionPlan3d(piece); plan3For = piece; }
        const V3 = plan3 && plan3.anat3 ? plan3.anat3.axes.V3 : { x: 0, y: 0, z: 1 };
        const d = L.lift * toPiece;
        at.x += V3.x * d; at.y += V3.y * d; at.z += V3.z * d;
      }
      const ink = this.tintAt(target, L.colT);
      return { at, sizeMultiplier, tint: ink ? ink.css : null, ink,
        phase: target.phase, scaffold: !!target.scaffold };
    },
    // colour arrives by saturating: the resolved hue held steady, chroma
    // scaled by the channel, so a tint fades in as weather rather than
    // switching on. The numbers come back alongside the string because the
    // drone-show renderer buckets stamps by hue and lightness, and re-parsing
    // 2048 colour strings a frame to get them back would be silly.
    tintAt(target, colT) {
      if (!(colT > 0.02)) return null;
      const t = tintOf(target);
      const c = t.c * colT;
      return { l: t.l, c, h: t.h,
        css: 'oklch(' + t.l.toFixed(3) + ' ' + c.toFixed(3) + ' ' + t.h.toFixed(1) + ')' };
    },
  };
}

// ── the gallery stage (Part C, 7.3): commissioned pieces on synthetic nodes ──
// A tattoo is commissioned, not discovered: its material is synthetic nodes
// that represent the accomplishment being tattooed, not live notes, so
// nothing here touches the vault, the sea, the sketchbook or eligibility.
// The stage has no coastline and no member truth; what remains of the law
// is everything else: budgets, salience, determinism, one piece per stage.

// The stage's material: a deterministic scatter in the stage's own frame.
// Same seed, same nodes, forever; the ids name the stage so a stage node
// can never be mistaken for (or evict) a note.
function artStageNodes(seed, count) {
  const n = Math.max(8, Math.min(GALLERY_RIG.nodeCap, Math.round(count || 36)));
  const rng = artPrng(((seed >>> 0) ^ 0x57a9e) >>> 0);
  const basis = artBasis({ x: 0, y: 0, z: 1 });
  const nodes = [];
  for (let i = 0; i < n; i++) {
    const th = i * 2.399963 + rng.range(-0.25, 0.25);
    const r = 0.42 * Math.sqrt((i + 0.5) / n);
    nodes.push({
      id: 'stage/' + (seed >>> 0) + '/' + i,
      at: artOnSphere(basis, Math.cos(th) * r, Math.sin(th) * r),
      depth: (i % 10) / 10,
      synthetic: true,
    });
  }
  return nodes;
}

// One seam for a commission: material, compile under the gallery ledger,
// validate under the same law (no coastline on a stage). Returns the nodes
// too, because the mount needs the truths the resolver will be asked about.
function artCommission(score, stage) {
  const s = score || {};
  const st = stage === 'world' ? 'world' : 'gallery';
  const nodes = artStageNodes(s.seed == null ? 42 : s.seed, s.size);
  const out = artPerform(s, nodes, st);
  if (!out.ok) return { ok: false, problems: out.problems, piece: null, nodes: null };
  const verdict = artValidate(out.piece, []);
  if (!verdict.ok) return { ok: false, problems: verdict.problems, piece: null, nodes: null };
  return { ok: true, problems: [], piece: out.piece, nodes, energy: verdict.energy };
}

// ── world embedding: a piece mounted at a place on the globe (phase 8.3) ─────
// Dan's model, which replaces the captured spec's drag-the-art-in-place: the
// globe is a MAP OF PLACES, a mount is a thing with body standing at one of
// them, and clicking it opens the piece's own 3D exploration. So what the
// world mount owes is presence and a hit test, not a second gallery.

// Quaternions, scalar-first, only as much as a mount needs. Orientation is
// mutable member state (they can turn a piece), so it lives in the record and
// is excluded from both identities.
function artQuatUnit(q) {
  const a = Array.isArray(q) && q.length === 4 ? q : [1, 0, 0, 0];
  const n = Math.hypot(a[0], a[1], a[2], a[3]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n, a[3] / n];
}
function artQuatApply(q, p) {
  const [w, x, y, z] = artQuatUnit(q);
  // p' = p + 2 * cross(qv, cross(qv, p) + w * p)
  const tx = 2 * (y * p.z - z * p.y), ty = 2 * (z * p.x - x * p.z), tz = 2 * (x * p.y - y * p.x);
  return {
    x: p.x + w * tx + (y * tz - z * ty),
    y: p.y + w * ty + (z * tx - x * tz),
    z: p.z + w * tz + (x * ty - y * tx),
  };
}

// The mount basis, decided by eyes rather than prose (build plan 4.5) and
// picked by Dan on 2026-08-30 from the arrow prototype:
//
//   RELIEF IS THE DEFAULT. Piece +Z -> globe normal, +Y -> local north: the
//   artwork faces outward, like a tattoo on skin. When the member orbits to
//   a region, that region faces them, so relief points the artwork at the
//   camera. Objecthood is opt-in and most pieces are flat drawings, and a
//   flat drawing seen edge-on is nothing at all.
//
//   FIGURINE IS OPT-IN, per mount (`stand: true`). Piece +Y -> globe normal,
//   +Z -> local north: the sculpture stands on the globe. It costs
//   legibility from directly above and buys the reading of an object living
//   in the world rather than a decal on it, which is worth having for a
//   piece with a genuine body.
//
// Local north is undefined at the poles and falls back deterministically, so
// a mount at 90 degrees is a legal mount rather than a NaN.
function artMountFrame(anchor, stand) {
  const a = vUnit(anchor) || { x: 0, y: 0, z: 1 };
  const up = { x: 0, y: 1, z: 0 };
  const d = vDot(a, up);
  let north = { x: up.x - a.x * d, y: up.y - a.y * d, z: up.z - a.z * d };
  north = Math.hypot(north.x, north.y, north.z) < 1e-4
    ? vUnit(vCross({ x: 0, y: 0, z: 1 }, a)) : vUnit(north);
  if (stand) { const Y = a, Z = north; return { X: vCross(Y, Z), Y, Z, north, anchor: a }; }
  const Z = a, Y = north;
  return { X: vCross(Y, Z), Y, Z, north, anchor: a };
}

// The maximum motion envelope (build plan 4.7), in piece-space units, with
// ONE definition and three consumers: the hit radius, globe clearance, and
// the rigidity invariant's wording. Computed from the compiled piece and its
// plan, never guessed from the mean pose, because a wingtip at full reach is
// still part of the artwork and still has to be grabbable and still has to
// not be inside the planet.
// The two halves are returned separately as well as summed, because the three
// consumers need different ones and computing the split twice is how they drift
// apart. The hit radius wants the TOTAL (a wingtip at full reach is grabbable).
// Globe clearance wants only the MOTION half, because each point contributes
// its own static position already and adding the static maximum on top of it
// would refuse mounts that never come near the ground.
// How far an ARTICULATED piece actually reaches, measured rather than derived.
//
// A child's displacement is not its own articulation: it is its parent's
// movement at the attachment, plus the parent's frame rotation, plus its own
// response, plus everything inherited below. Summing those analytically would
// be both harder and more conservative than simply evaluating the composed pose
// at the moments it is most extended, which is what the phrase resolver already
// gives for free. Prepare dips negative, so it is sampled too: a bone drawing
// back before an act is displaced just as truly as one swinging forward.
const ART_PHRASE_EXTREMA = [-0.15, 0.42, 1];
function artArticulatedReach(piece) {
  const rig = piece && piece.rig;
  if (!rig || !rig.skel || rig.skel.supported === false) return 0;
  const base = artPose(rig.skel, { counts: rig.counts, moves: rig.moves, activation: 0 });
  let reach = 0;
  for (const a of ART_PHRASE_EXTREMA) {
    const at = artPose(rig.skel, { counts: rig.counts, moves: rig.moves, activation: a, amount: 1 });
    for (const [, t] of piece.targets) {
      if (!t.sweep) continue;
      const bi = rig.strokeToBone.get(t.sweep.stroke);
      const p0 = artSkinNode(base.get(bi), t.sweep);
      const p1 = artSkinNode(at.get(bi), t.sweep);
      if (!p0 || !p1) continue;
      reach = Math.max(reach, Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z));
    }
  }
  return reach;
}

function artEnvelopeParts(piece) {
  if (!piece || !piece.targets || !piece.targets.size) return { base: 0, motion: 0, total: 0 };
  let base = 0;
  for (const [, t] of piece.targets) {
    if (!t.pieceAt) continue;
    base = Math.max(base, Math.hypot(t.pieceAt.x, t.pieceAt.y, t.pieceAt.z));
  }
  // An articulated piece is priced on what it ACTUALLY does. Its bones move by
  // their own vocabulary rather than by a field amplitude, so the plan's `amp`
  // says nothing useful about how far the beak travels.
  if (piece.rig) {
    const motion = artArticulatedReach(piece);
    return { base, motion, total: base + motion };
  }
  const toPiece = (piece.frame && piece.frame.scale) || 1;
  const plan = artMotionPlan3d(piece);
  let reach = 0;
  if (plan) {
    if (plan.kind === 'keyframes' && plan.deltas) {
      for (const [, d] of plan.deltas) {
        for (const pose of d) reach = Math.max(reach, Math.hypot(pose.du, pose.dv, pose.dAlt));
      }
      reach *= toPiece;
    } else {
      // the fields emit normalized units of magnitude <= ~1 on each axis, so
      // the amplitude after coherent attenuation IS the reach
      reach = plan.amp * toPiece * Math.sqrt(3);
    }
  }
  return { base, motion: reach, total: base + reach };
}
function artEnvelope(piece) { return artEnvelopeParts(piece).total; }

// A mount record, resolved into everything a renderer and a hit test need.
// Rigidity is BY CONSTRUCTION: one rigid transform applied after deformation,
// so for the same evaluated pose every pairwise distance is preserved up to
// the uniform scale. Deformation across time is motion, not a rigidity
// violation, which is the distinction 4.7 insists on.
const ART_MOUNT = {
  maxMounts: 4,         // capacity, not salience: only one performs at a time
  scaleMin: 0.05,
  scaleMax: 0.5,
  altitudeMax: 0.5,
  clearance: 0.01,      // the horizon culler must never hide geometry inside the world
  hitPad: 0.15,         // a moving wingtip is grabbable
  // the quiet state's share of a foreground mount (build plan 8.3.1). NOT zero:
  // a mount that stops dead reads as broken, and a quiet piece is still alive,
  // just not the one being attended to.
  quietMotion: 0.22,
  quietScaffold: 0.45,
};

// ── capacity is not salience (build plan 8.3.1) ──────────────────────────────
// The rule that stops four mounted sculptures becoming a crafting system. Four
// may EXIST; at most one PERFORMS in the foreground at a time, with full motion
// gain and full scaffold draw. The rest hold quiet until approached or
// deliberately inspected.
//
//   More art is not more alive.
//
// Pure and deterministic like everything else here: same mounts, same focus,
// same eye, same answer. Selection is a LADDER rather than a heuristic, so a
// member's own act always outranks the geometry:
//
//   1. deliberate inspection — a mount the member opened or grabbed
//   2. approach — the mount nearest the eye, which is what walking up to a
//      thing means on a globe you are turning
//   3. a stable fallback (lowest mount id) so an idle scene has exactly one
//      performer rather than none, and the same one on every reload
function artForeground(mounts, opts) {
  const o = opts || {};
  const list = (mounts || []).filter((m) => m && m.mountId);
  const out = { focus: null, gains: new Map() };
  if (!list.length) return out;
  let focus = null;
  if (o.focus && list.some((m) => m.mountId === o.focus)) focus = o.focus;
  if (!focus && o.eye) {
    const eye = vUnit(o.eye);
    let best = null;
    for (const m of list) {
      const at = m.at && vUnit(m.at);
      if (!at || !eye) continue;
      const d = vAngle(at, eye);
      // ties break by id, so the answer is total rather than array-order luck
      if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) <= 1e-9 && m.mountId < best.id)) {
        best = { id: m.mountId, d };
      }
    }
    if (best) focus = best.id;
  }
  if (!focus) focus = list.map((m) => m.mountId).sort()[0];
  out.focus = focus;
  for (const m of list) {
    const fore = m.mountId === focus;
    out.gains.set(m.mountId, {
      foreground: fore,
      motionGain: fore ? 1 : ART_MOUNT.quietMotion,
      scaffoldDraw: fore ? 1 : ART_MOUNT.quietScaffold,
    });
  }
  return out;
}

function artMount(record) {
  const r = record || {};
  const problems = [];
  const anchor = vUnit(r.anchor && r.anchor.unitVector ? r.anchor.unitVector : r.anchor);
  if (!anchor) problems.push('anchor: a mount needs a unit vector naming its place on the globe');
  const altitude = Math.max(0, Math.min(ART_MOUNT.altitudeMax,
    (r.anchor && r.anchor.altitude != null ? r.anchor.altitude : r.altitude) || 0));
  const scale = Math.max(ART_MOUNT.scaleMin, Math.min(ART_MOUNT.scaleMax,
    r.scale != null ? r.scale : 0.18));
  const policy = (r.orientation && r.orientation.policy) || 'surface';
  if (policy !== 'surface' && policy !== 'free') {
    problems.push('orientation.policy: "' + policy + '" is not one of surface | free'
      + ' (billboard is deferred: a sculpture that always faces the camera stops being an object in the world)');
  }
  const compiled = artCommission(r.pieceScore || r.score, 'world');
  if (!compiled.ok) problems.push.apply(problems, compiled.problems);
  if (problems.length) return { ok: false, problems, mount: null };

  const piece = compiled.piece;
  const stand = !!(r.orientation && r.orientation.stand);
  const frame = artMountFrame(anchor, stand);
  const rot = artQuatUnit(r.orientation && r.orientation.rotation);
  const envelopeParts = artEnvelopeParts(piece);
  const envelope = envelopeParts.total;

  const k = 1 + altitude;
  const toWorld = (p) => {
    // ONE rigid transform, applied AFTER deformation, which is what makes
    // rigidity true by construction rather than by care.
    const q = artQuatApply(rot, p);
    // `surface` composes the member's turn with the anchor's own basis;
    // `free` is already a world orientation and takes no basis at all
    const v = policy === 'free' ? q : {
      x: frame.X.x * q.x + frame.Y.x * q.y + frame.Z.x * q.z,
      y: frame.X.y * q.x + frame.Y.y * q.y + frame.Z.y * q.z,
      z: frame.X.z * q.x + frame.Y.z * q.y + frame.Z.z * q.z,
    };
    return { x: v.x * scale + anchor.x * k, y: v.y * scale + anchor.y * k, z: v.z * scale + anchor.z * k };
  };

  // Globe clearance (4.7), PER POINT rather than as a bounding sphere. A
  // sphere about the anchor is wildly conservative for the common case: a
  // relief mount lays the drawing in the tangent plane, and a plane tangent
  // to a sphere lies entirely outside it, so the bounding-sphere test would
  // refuse a mount that never comes near the ground. Each point carries its
  // own motion reach as a margin, which is what "the static + motion
  // envelope" means. The horizon culler must never hide geometry that is
  // physically inside the world.
  const reach = scale * envelopeParts.motion;
  let nearest = Infinity, worstId = null;
  for (const [id, t] of piece.targets) {
    if (!t.pieceAt) continue;
    const w = toWorld(t.pieceAt);
    const d = Math.hypot(w.x, w.y, w.z) - reach;
    if (d < nearest) { nearest = d; worstId = id; }
  }
  if (nearest < 1 + ART_MOUNT.clearance) {
    return { ok: false, mount: null, problems: ['mount: ' + worstId + ' would sit inside the globe ('
      + nearest.toFixed(4) + ' against a floor of ' + (1 + ART_MOUNT.clearance).toFixed(4)
      + '); raise the altitude, reduce the scale, or refuse the mount'] };
  }

  return { ok: true, problems: [], mount: {
    piece, nodes: compiled.nodes, anchor, altitude, scale, policy, stand, rotation: rot,
    frame, envelope, toWorld,
    at: { x: anchor.x * (1 + altitude), y: anchor.y * (1 + altitude), z: anchor.z * (1 + altitude) },
    hitRadius: scale * (envelope + ART_MOUNT.hitPad),
    clearance: nearest - 1,
  } };
}

// Is a mounted point hidden behind the world? The ray-sphere test from the
// captured spec 5.1, which is the one piece of its geometry we adopt whole.
// Returns the depth of the occlusion so the caller can fade at the
// silhouette instead of popping.
function artOccluded(p, eye) {
  const dx = p.x - eye.x, dy = p.y - eye.y, dz = p.z - eye.z;
  const L = Math.hypot(dx, dy, dz) || 1e-9;
  const d = { x: dx / L, y: dy / L, z: dz / L };
  const tProj = -(eye.x * d.x + eye.y * d.y + eye.z * d.z);
  if (tProj <= 0) return { occluded: false, fade: 1 };
  const perp2 = (eye.x * eye.x + eye.y * eye.y + eye.z * eye.z) - tProj * tProj;
  if (perp2 >= 1) return { occluded: false, fade: 1 };
  const tHit = tProj - Math.sqrt(1 - perp2);
  if (!(tHit > 0 && tHit < L)) return { occluded: false, fade: 1 };
  // within a hair of the silhouette, fade rather than pop
  return { occluded: true, fade: Math.max(0, Math.min(1, (tHit - L) / 0.06 + 1)) };
}

// The smallest positive ray root against a mount's hit sphere, or null. The
// closest hit wins the pointer, which is what lets overlapping mounts behave.
function artMountHit(mount, eye, dir) {
  const ox = eye.x - mount.at.x, oy = eye.y - mount.at.y, oz = eye.z - mount.at.z;
  const b = 2 * (ox * dir.x + oy * dir.y + oz * dir.z);
  const c = ox * ox + oy * oy + oz * oz - mount.hitRadius * mount.hitRadius;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / 2, t2 = (-b + s) / 2;
  const t = t1 > 0 ? t1 : (t2 > 0 ? t2 : null);
  return t;
}

// ── identities (build plan 4.6) ──────────────────────────────────────────────
// Two of them, because they answer different questions. FNV means IDENTITY
// AND CACHE SEMANTICS ONLY: if provenance integrity is ever claimed, that is
// platform SHA-256 outside the render loop, under a different field with a
// different name, added then. Nothing here is a tamper-resistance promise.
function artCanonicalJson(v) {
  // Numbers are quantized before they are printed, and this is the half that
  // is easy to leave out (build plan 4.6). Keys sorted and arrays left alone
  // make the SHAPE canonical; without a number rule the VALUES still are not,
  // because 0.1 + 0.2 prints as 0.30000000000000004 and a score that has been
  // round-tripped through arithmetic stops matching the one an agent authored.
  // Six places is far finer than any span, weight or coordinate this grammar
  // uses, so it cannot merge two scores a person would call different.
  // Landing it NOW matters: quantization changes signatures, and nothing has
  // persisted one yet. After the first mount record is written to disk this
  // becomes a migration instead of a one-line fix.
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return 'null';
    const q = Number(v.toFixed(6));
    return JSON.stringify(Object.is(q, -0) ? 0 : q);
  }
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(artCanonicalJson).join(',') + ']';
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + artCanonicalJson(v[k])).join(',') + '}';
}
function artFnv(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h >>> 0).toString(16).padStart(8, '0');
}
// what artwork is this: stable forever, and two mounts of one heron share it
function artPieceSignature(score) { return 'p_' + artFnv(artCanonicalJson(score || {})); }
// which placement instance: persisted, never re-derived. Orientation and
// scale are mutable member state and are deliberately NOT in here.
function artMountIdOf(pieceSignature, mountedAt, ordinal) {
  return 'm_' + artFnv(pieceSignature + '|' + mountedAt + '|' + (ordinal || 0));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ART_RIG, ART_PALETTES, ART_FORMS, ART_GESTURES, ART_MOTION, artPrng, artEnergy,
    artBasis, artOnSphere, artSlerp, artClampDisp, artOklabOf, artTintResolve, artPerform, artValidate,
    artRuntime, artSeedOf, artDiscover, artReevaluate, artAnatomy, artPhrases, artPhraseEval,
    artActCurve, artMotionField, artQuietDefault, artMotionAttenuation, artMotionPlan, artMotionEval,
    artPoseResample, artKeyframeGate,
    GALLERY_RIG, GALLERY_MOTION, ART_STAGES, artStageOf, artStageNodes, artCommission,
    // phase 8.1: object space
    ART_DEPTH_PROFILES, ART_SYMMETRIES, artObjecthood, artVolumeOf, artSmoothPoly,
    artSymmetryFold, artSymmetrize, artJacobi3, artPieceFrame, artScaffold,
    ART_SECTIONS, ART_IMPORTANCE, ART_THREAD, ART_SWEEP, ART_BLADE_THIN, ART_SKEL, ART_MOVES, ART_ARTIC,
    artMovesOf, artArticulated, artStations, artGirthAt, artGirthMean,
    artFitStrokes, artSkeleton, artBoneLen, artNearestStation, artHingeAxis, artBindTransform,
    artBoneLocal, artBonePose, artPose, artSkinNode, artFromFrame, artStrokesLay,
    artSectionOf, artSweepSplit, artRotAxis,
    artAnatomy3d, artMotionField3d, artQuietDefault3d, artMotionPlan3d, artMotionEval3d,
    // phase 8.3: world embedding
    WORLD_RIG, WORLD_MOTION, ART_MOUNT, artQuatUnit, artQuatApply, artMountFrame,
    artEnvelope, artEnvelopeParts, artArticulatedReach, ART_PHRASE_EXTREMA, artMount, artForeground, artOccluded, artMountHit,
    artCanonicalJson, artFnv, artPieceSignature, artMountIdOf };
}
