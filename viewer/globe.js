'use strict';
// The globe (layer: app). Every note the member has, as points on a turning
// sphere, in the right column. Design: vault
// projects/second-brain-dashboard/2026-08-22-the-globe-and-the-first-session.md
//
// Two rules the whole file follows.
//
//   COLOUR IS DECLARED, POSITION IS COMPUTED. A node's kind colours it, which
//   is a human decision and should be legible at a glance. Its embedding
//   places it, so things that mean similar things sit near each other whether
//   or not anybody filed them together. That is Danny's steer (2026-08-20)
//   and it is the only reason this is a globe rather than a list.
//
//   THE TURN IS TRIGGERED BY WRITING, NOT BY CLICKING. Clicking on the left
//   opens a scoped chat tab and the sky holds still. The globe moves when the
//   conversation starts touching files, so the motion means work is happening
//   rather than meaning a button was pressed.
//
// No dependencies, deliberately: the repo's efficiency value covers its own
// plumbing. PCA is forty lines, a quaternion slerp is thirty, and Canvas 2D
// carries a few thousand points at sixty frames. SVG stops being smooth around
// two hundred, which is why the mockups were only ever mockups.

// ── placement ─────────────────────────────────────────────────────────────

// Power iteration rather than a full eigendecomposition: we need the top three
// components of a covariance we never have to store, and starting from a fixed
// vector makes the same vault produce the same globe every time. A member who
// learns where their own things are must not have them move on reload.
function principalAxes(vectors, k, iters) {
  const n = vectors.length;
  if (!n) return [];
  const d = vectors[0].length;
  const mean = new Array(d).fill(0);
  for (const v of vectors) for (let i = 0; i < d; i++) mean[i] += v[i] / n;
  const centred = vectors.map((v) => v.map((x, i) => x - mean[i]));

  const axes = [];
  for (let a = 0; a < (k || 3); a++) {
    // a fixed, non-degenerate start, so this is deterministic across runs
    let u = new Array(d).fill(0).map((_, i) => Math.sin((i + 1) * (a + 1) * 0.7));
    for (let it = 0; it < (iters || 24); it++) {
      const next = new Array(d).fill(0);
      for (const c of centred) {
        let dot = 0;
        for (let i = 0; i < d; i++) dot += c[i] * u[i];
        for (let i = 0; i < d; i++) next[i] += dot * c[i];
      }
      for (const prev of axes) { // deflate: stay orthogonal to what we found
        let dot = 0;
        for (let i = 0; i < d; i++) dot += next[i] * prev[i];
        for (let i = 0; i < d; i++) next[i] -= dot * prev[i];
      }
      let norm = Math.hypot.apply(null, next);
      if (!norm || !isFinite(norm)) break;
      u = next.map((x) => x / norm);
    }
    axes.push(u);
  }
  return { axes, mean };
}

// Reduce to three dimensions, then push every point out to the surface. The
// sphere is the point: a cloud would let dense regions hide behind each other,
// and the first thing a member should feel is how much there is.
function placeOnSphere(vectors) {
  const n = vectors.length;
  if (!n) return [];
  if (n < 4) { // too few to have principal anything; spread them evenly
    return fibonacciSphere(n);
  }
  const { axes, mean } = principalAxes(vectors, 3);
  const pts = vectors.map((v) => {
    const c = v.map((x, i) => x - mean[i]);
    const p = axes.map((ax) => {
      let s = 0;
      for (let i = 0; i < c.length; i++) s += c[i] * ax[i];
      return s;
    });
    const len = Math.hypot(p[0], p[1], p[2]);
    return len > 1e-9 ? { x: p[0] / len, y: p[1] / len, z: p[2] / len } : null;
  });
  // a vector that reduced to the origin has no direction to be placed in; give
  // it a seat rather than dropping it, because a missing note is a lie
  const spare = fibonacciSphere(pts.filter((p) => !p).length || 1);
  let s = 0;
  return pts.map((p) => p || spare[s++]);
}

function fibonacciSphere(n) {
  const out = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = ga * i;
    out.push({ x: Math.cos(th) * r, y: y, z: Math.sin(th) * r });
  }
  return out;
}

// ── the turn ──────────────────────────────────────────────────────────────

function normalise(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function centroid(points) {
  if (!points.length) return { x: 0, y: 0, z: 1 };
  const s = points.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y, z: a.z + p.z }), { x: 0, y: 0, z: 0 });
  const c = { x: s.x / points.length, y: s.y / points.length, z: s.z / points.length };
  return Math.hypot(c.x, c.y, c.z) < 1e-9 ? { x: 0, y: 0, z: 1 } : normalise(c);
}

// the shortest rotation taking one direction to another, as a quaternion. The
// shortest one is what makes the turn read as a globe finding a place rather
// than as a spin that happens to end somewhere.
function quatFromTo(from, to) {
  const a = normalise(from), b = normalise(to);
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  if (dot > 0.999999) return { w: 1, x: 0, y: 0, z: 0 };
  if (dot < -0.999999) { // antipodal: any perpendicular axis, half turn
    let axis = Math.abs(a.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const p = normalise(cross(a, axis));
    return { w: 0, x: p.x, y: p.y, z: p.z };
  }
  const c = cross(a, b);
  const q = { w: 1 + dot, x: c.x, y: c.y, z: c.z };
  const l = Math.hypot(q.w, q.x, q.y, q.z);
  return { w: q.w / l, x: q.x / l, y: q.y / l, z: q.z / l };
}

function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function qmul(a, b) {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
  };
}

function slerp(q0, q1, t) {
  let dot = q0.w * q1.w + q0.x * q1.x + q0.y * q1.y + q0.z * q1.z;
  let b = q1;
  if (dot < 0) { b = { w: -q1.w, x: -q1.x, y: -q1.y, z: -q1.z }; dot = -dot; }
  if (dot > 0.9995) { // close enough that the arc is a straight line
    const r = { w: q0.w + (b.w - q0.w) * t, x: q0.x + (b.x - q0.x) * t,
                y: q0.y + (b.y - q0.y) * t, z: q0.z + (b.z - q0.z) * t };
    const l = Math.hypot(r.w, r.x, r.y, r.z) || 1;
    return { w: r.w / l, x: r.x / l, y: r.y / l, z: r.z / l };
  }
  const th0 = Math.acos(Math.min(1, dot)), th = th0 * t;
  const s0 = Math.cos(th) - dot * Math.sin(th) / Math.sin(th0);
  const s1 = Math.sin(th) / Math.sin(th0);
  return { w: q0.w * s0 + b.w * s1, x: q0.x * s0 + b.x * s1,
           y: q0.y * s0 + b.y * s1, z: q0.z * s0 + b.z * s1 };
}

function rotate(q, v) {
  const t = cross({ x: q.x, y: q.y, z: q.z }, v);
  const t2 = { x: t.x * 2, y: t.y * 2, z: t.z * 2 };
  const c = cross({ x: q.x, y: q.y, z: q.z }, t2);
  return { x: v.x + q.w * t2.x + c.x, y: v.y + q.w * t2.y + c.y, z: v.z + q.w * t2.z + c.z };
}

function axisAngle(axis, angle) {
  const a = normalise(axis), h = angle / 2, s = Math.sin(h);
  return { w: Math.cos(h), x: a.x * s, y: a.y * s, z: a.z * s };
}

// Heavy on the tail. The arrival is the part that carries the feeling, so the
// curve spends its last third barely moving: a large mass settling rather than
// a value reaching a number.
// Orthographic projection draws a disc with dots on it. A little perspective
// is what makes the near face read as nearer: points toward the middle swell,
// points toward the rim compress, and the eye reads a ball without being told.
// camZ is how far away the viewer stands; smaller is more dramatic.
function project(v, R, cx, cy, camZ) {
  const z = camZ || 3.5;
  const p = z / (z - v.z);
  return { x: cx + v.x * R * p, y: cy - v.y * R * p, z: v.z, p: p };
}

function easeOutQuint(t) {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 5);
}


// ── the renderer ──────────────────────────────────────────────────────────
// Canvas 2D with a painter's sort. Browser only; the maths above is what the
// tests hold, because the maths is the half that can be wrong without anybody
// seeing it. A turn that takes the long way round still arrives.

// Where on the sphere lands in the middle of the canvas. Standing near the
// surface puts the sphere's centre below the frame, so the direction that
// projects to the middle is up on the shoulder rather than dead front. The
// flat version of this, (cy - h/2) / R, ignores perspective, and perspective is
// exactly what moves a point up the screen as it comes toward the viewer.
// Getting it wrong parked every held node off frame with its threads running
// away to nowhere, so it is solved rather than approximated.
// `rad` is the radius the MARK is drawn at, which is not 1 and not a detail.
// A lit node is lifted off the ball twice, by the lens (`lift`, 8%) and by its
// own height (`tall` x depth), and at camZ 1.95 an 8% lift is 130 pixels up a
// 419px canvas: measured on the live page, the lead stop of a course sat at
// y=82 where the aim had carefully put it at y=208. Solving the aim on the
// surface and then drawing the mark above it is a silent error of a third of
// the panel. Defaults to 1, so every existing caller is unchanged.
// `ty` is the screen height the mark should settle at, as a fraction of the
// canvas; unsaid it is the middle, so every existing caller is unchanged.
function solveFace(R, h, camZ, arcTop, rad, ty) {
  const cy = h * arcTop + R;
  const k = rad == null ? 1 : rad;
  const target = h * (ty == null ? 0.5 : ty);
  let lo = -0.95, hi = 0.95;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const z = Math.sqrt(Math.max(0, 1 - mid * mid)) * k;
    const py = cy - mid * k * R * 0.9 * (camZ / Math.max(0.05, camZ - z));
    if (py > target) lo = mid; else hi = mid;
  }
  const fy = (lo + hi) / 2;
  return { x: 0, y: fy, z: Math.sqrt(Math.max(0, 1 - fy * fy)) };
}

// How far to stand back so a patch of a given angular radius fits in the frame.
//
// Clicking a project has to SHOW the project, and it was not: apc-ai-course
// spans 58 degrees of sphere from its own middle, which at the close-in focus
// camera puts most of it past the edge, so the panel showed three of seven
// notes and a bundle of threads running off the bottom. Measured, not guessed
// (the seven notes are spread across daily, intelligence and the project folder
// itself, and a folder is not a neighbourhood).
//
// This is the framing half and magnify() is the legibility half. Framing moves
// the camera, which changes nothing about the globe; magnifying opens the patch
// out locally. Neither one re-lays anything out, which is the whole point.
function fitZoom(angle, w, h, opts) {
  const o = opts || {};
  const focusR = o.focusR == null ? 1.44 : o.focusR;
  const camZ = o.focusCam == null ? 1.95 : o.focusCam;
  const arcTop = o.arcTop == null ? 0.13 : o.arcTop;
  if (!(angle > 0)) return 1;
  const pad = 0.1 * Math.min(w, h);
  const fits = (m) => {
    const R = Math.min(w, h) * focusR * m;
    const f = solveFace(R, h, camZ, arcTop);
    const cx = w * (o.cxFrac == null ? 0.5 : o.cxFrac), cy = h * arcTop + R;
    // the patch's edge in the four directions that can leave the frame: tipped
    // toward and away from the viewer, and swung left and right
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const pts = [
      { x: 0, y: f.y * ca + f.z * sa, z: f.z * ca - f.y * sa },
      { x: 0, y: f.y * ca - f.z * sa, z: f.z * ca + f.y * sa },
      { x: f.z * sa, y: f.y, z: f.z * ca },
      { x: -f.z * sa, y: f.y, z: f.z * ca }
    ];
    for (const p of pts) {
      // Past the horizon there is nothing to frame. Standing back does not
      // change which points are on the near face, so a patch this wide simply
      // cannot be fitted and the answer is to show as much of it as possible.
      // Without this the projection wraps a far-side point back into the frame
      // and the search happily reports that a 75-degree patch fits.
      if (p.z <= 1 / camZ) return false;
      const q = project(p, R * 0.9, cx, cy, camZ);
      if (q.x < pad || q.x > w - pad || q.y < pad || q.y > h - pad) return false;
    }
    return true;
  };
  if (fits(1)) return 1;
  let lo = 0.18, hi = 1;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

// ── geography ────────────────────────────────────────────────────────────────
//
// A project was never a place, and that was the whole problem. Position came
// from path tokens, so apc-ai-course sprawled 58 degrees across the sphere and
// every gesture that tried to show it was compensating: the lens magnified a
// patch that was not a patch, and the camera pulled back to frame something
// that had no frame. Regions fix it at the root. Declare where a note belongs
// and it goes there, and then "show me this project" is one move to a place
// with a centre and a radius.
//
// Three rules, and the order matters:
//
//   1. WHERE comes from the member. A region is declared, never inferred.
//   2. WHERE INSIDE comes from meaning. Within a region the embedding still
//      decides, so the unexpected-neighbour property survives at close range,
//      which is the range where it was ever any use.
//   3. A region's home is a fact about its NAME. Not its size, not its index in
//      a list, not when it was made. Add a seventh region and the other six do
//      not move, because the one thing a map has to do is stay put.
// The lattice regions are hashed onto, sized to how many there are.
//
// A fixed 256 was the first version and it starved small vaults: six regions
// dropped at random onto a fine lattice land close together often enough that
// most of them ended up clamped to a fifth of the ground they had earned. A
// coarse lattice has the separation built in, because two DIFFERENT slots on a
// 32-point Fibonacci sphere are about 0.6 rad apart no matter which two.
//
// It steps rather than scales, so it changes almost never: crossing into a
// twenty-fifth region is a real event in somebody's life and is allowed to
// redraw the map, while writing a note is not.
function regionSlots(count) {
  if (count <= 24) return 32;
  if (count <= 48) return 64;
  return 128;
}
const REGION_SLOTS = 32;

// Hashing the name into a fixed lattice is what buys rule 3. The alternative,
// laying regions out by their position in a sorted list, reshuffles the whole
// world every time somebody starts something new. Slots are a Fibonacci sphere
// so they spread evenly; a collision probes forward, which is the only case
// where one region's home depends on another's.
// Astrolabe 4.1: similar regions near each other, and the similarity is
// DECLARED rather than computed.
//
// The ask was for regions that mean similar things to sit together. The
// obvious implementation is an embedding, and at this scale it is the wrong
// one: a member has five to ten regions, they named every one of them, and
// nothing a model infers about `apc` and `membership` beats the fact that Dan
// wrote them next to each other in his own file. So the order in regions.md
// is the geography. One file now authors the rail AND the world.
//
// The catch, and it is the reason this is not a one-liner. Consecutive points
// on a Fibonacci sphere are NOT neighbours: each step turns by the golden
// angle, roughly 137 degrees of longitude, which is exactly what makes the
// lattice spread evenly and exactly what makes index order useless as an
// order. So the points are re-threaded into a path first, nearest to nearest,
// and the declared list is laid along THAT.
//
// Deterministic: same count in, same tour out, so a vault draws the same world
// twice. Starting from index 0 rather than a search, because a better tour is
// not worth a placement that depends on which region happened to be first.
function regionOrbit(n) {
  const pts = fibonacciSphere(n);
  if (n <= 2) return pts;
  const left = pts.map((_, i) => i);
  const tour = [left.shift()];
  while (left.length) {
    const from = pts[tour[tour.length - 1]];
    let best = 0, bestD = -2;
    for (let i = 0; i < left.length; i++) {
      const p = pts[left[i]];
      const d = from.x * p.x + from.y * p.y + from.z * p.z;  // bigger dot = closer
      if (d > bestD) { bestD = d; best = i; }
    }
    tour.push(left.splice(best, 1)[0]);
  }
  return tour.map((i) => pts[i]);
}

function regionHome(name, slots) {
  const n = slots || REGION_SLOTS;
  let h = 5381;
  const s = String(name);
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h % n;
}

// How much sphere a region gets: its share of the notes, by AREA rather than by
// angle. A cap of angular radius t covers 2*pi*(1 - cos t), so equal area per
// note falls straight out of the arithmetic. PACK leaves the rest as sea,
// because regions that touch everywhere have no edges, and edges are most of
// what makes a map readable.
const REGION_PACK = 0.55;
// How far apart two centres must be, as a multiple of the sum of their radii.
// Above 1 there is open sea between every pair of regions.
//
// Both numbers were swept rather than picked, across five vault shapes (one
// dominant region, five even ones, one plus a long tail, two big plus a scrap,
// ten of assorted size). At clear = 1.0 every shape overlapped somewhere, by
// five to ten degrees: not occasional, systematic, because caps allowed to
// touch will touch. 0.55 / 1.1 is the first pair that clears all five with
// margin (0.05 to 0.15 rad of sea) while still spending most of the sphere.
// Packing tighter buys nothing: the notes only fill their cap to about the
// 90th percentile anyway, so a bigger allotment mostly draws bigger gaps.
const REGION_CLEAR = 1.1;

// The share is QUANTISED before it becomes a radius, and that one line is what
// makes the map hold still.
//
// A region's share is its note count over the vault's, so writing a single note
// anywhere changes EVERY region's share by a hair, every radius by a hair, and
// then any placement decision that was close flips. That is how adding a
// three-note region used to throw an unrelated region 53 degrees across the
// sphere: nothing about it had changed except the denominator. Rounding to 24
// steps means the ordinary act of writing changes nothing at all, and a region
// only claims new ground when it has grown enough to deserve it. Twelve steps
// rather than twenty-four: coarser means a note crosses a boundary less often,
// and the boundary is the only moment anything moves at all.
const REGION_STEPS = 12;

// FIXED 2026-08-23, and it had been annihilating most regions on a real vault.
// Rounding the share LINEARLY means every share below half a step, 1/24 or
// 4.2%, rounds to zero and the region gets a radius of zero degrees. On Dan's
// vault that was four of his five: brain (22 notes), membership (20), book
// (10) and life (3) all quantised to nothing and survived only on the 0.05 rad
// floor beneath, so a twenty-note region and a three-note region drew at
// exactly the same size. Size means substance everywhere else in this globe;
// here it silently meant nothing.
//
// The fix is to step in ROOT-share space. Cap area is linear in share and
// radius goes as its root, so stepping there puts the resolution where real
// regions actually sit instead of spending eleven of twelve steps on sizes no
// vault ever has. Same twelve steps and the same stillness argument. And the
// floor is one step rather than zero, because a region that exists is never
// nothing.
function regionRadius(share, pack) {
  const s = Math.max(0, Math.min(1, share));
  if (s <= 0) return 0;
  const step = Math.max(1, Math.round(Math.sqrt(s) * REGION_STEPS)) / REGION_STEPS;
  const q = step * step;
  const p = pack == null ? REGION_PACK : pack;
  return Math.acos(Math.max(-1, 1 - 2 * p * q));
}

// A frame at a point on the sphere, picked deterministically: the world axis
// least aligned with the centre, so the cross products never degenerate.
function tangentFrame(c) {
  const ax = Math.abs(c.x), ay = Math.abs(c.y), az = Math.abs(c.z);
  const seed = ax <= ay && ax <= az ? { x: 1, y: 0, z: 0 }
    : (ay <= az ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 });
  const u = normalise(cross(seed, c));
  return { u: u, v: cross(c, u) };
}

// Walk out from a centre along the surface: the exponential map, which is the
// honest way to lay a flat arrangement onto a sphere. a and b are a point in
// the unit disc, t is how far the disc reaches, in radians.
function onCap(c, frame, a, b, t) {
  const r = Math.hypot(a, b);
  if (r < 1e-9 || t < 1e-9) return { x: c.x, y: c.y, z: c.z };
  const ang = t * Math.min(1, r);
  const ux = a / r, uy = b / r;
  const co = Math.cos(ang), si = Math.sin(ang);
  const dx = frame.u.x * ux + frame.v.x * uy;
  const dy = frame.u.y * ux + frame.v.y * uy;
  const dz = frame.u.z * ux + frame.v.z * uy;
  return { x: c.x * co + dx * si, y: c.y * co + dy * si, z: c.z * co + dz * si };
}

// Flatten a group's meaning vectors into the unit disc. Scaled by the 90th
// percentile rather than the maximum, because one outlier otherwise pulls
// everything else into a dot at the centre, which is the same failure the node
// sizes had when they scaled by raw length.
function discOf(vectors) {
  if (vectors.length === 1) return [[0, 0]];
  // Vectors arrive in mixed lengths: a vault laid out with no search bridge
  // carries [0] placeholders, while a single note fetched at birth brings a
  // real embedding. Mean and axes then index past the short ones, one
  // undefined poisons the dot products, and the born node's position is NaN,
  // so it never appears on the globe at all — no node, no flare, no click
  // (found in the apc #129 dogfood). Pad to one shared length first.
  const dim = Math.max(...vectors.map((v) => v.length));
  vectors = vectors.map((v) =>
    v.length === dim ? v : Array.from({ length: dim }, (_, i) => v[i] || 0));
  const pca = principalAxes(vectors, 2, 24);
  const flat = vectors.map((v) => {
    const d = v.map((x, i) => x - pca.mean[i]);
    return pca.axes.map((ax) => d.reduce((s, x, i) => s + x * ax[i], 0));
  });
  const radii = flat.map((p) => Math.hypot(p[0], p[1] || 0)).sort((a, b) => a - b);
  const p90 = radii[Math.min(radii.length - 1, Math.floor(0.9 * (radii.length - 1)))] || 1;
  return flat.map((p) => [p[0] / p90, (p[1] || 0) / p90]);
}

// Which continent a note's region actually folds to, which is not always the
// region written on the note. Extracted from placeInRegions 2026-08-30 so that
// there is exactly ONE definition of what counts as sea. Anything that needs
// to know whether a note is in open water (the coastlines, and now the art
// layer's eligibility filter) must ask this rather than re-deriving the fold,
// because two implementations that disagree by one line would let something be
// treated as sea while it draws on land.
function regionRoot(region, declaredSet) {
  const root = String(region || "").split("/")[0] || "elsewhere";
  if (declaredSet && declaredSet.size && !declaredSet.has(root)) return "unfiled";
  return root;
}

// Put every note on the globe: continent by name, neighbourhood inside it,
// meaning inside that. Returns unit vectors in the input order.
function placeInRegions(nodes, opts) {
  const o = opts || {};
  const pack = o.pack == null ? REGION_PACK : o.pack;
  const clear = o.clear == null ? REGION_CLEAR : o.clear;
  const total = nodes.length || 1;
  const taken = new Map();
  const index = new Map();
  nodes.forEach((n, i) => index.set(n, i));

  // Once a member has DECLARED their regions, everything they have not named
  // is one place rather than forty-two.
  //
  // The folder fallback is right for a vault that declares nothing: the
  // folders are the only structure it has. It is wrong the moment a real map
  // exists beside it. Measured on Dan's vault with a hundred notes tagged: the
  // five he named plus forty-two folder-shaped leftovers made forty-seven caps
  // crowding one sphere, and the clearance step squeezed `apc` down to eleven
  // degrees of spread. His own continent was a speck, and the specks around it
  // were called things like `context` and `canvases`.
  //
  // Folding them into one `unfiled` continent gives the named regions their
  // real share and tells the truth at the same time: 85% of that vault is not
  // on the map, and the map should look like it. The rail already says so in
  // one row; this is the globe agreeing with it.
  const declaredSet = new Set(o.declared || []);
  const roots = new Map();
  for (const n of nodes) {
    const root = regionRoot(n.region, declaredSet);
    if (!roots.has(root)) roots.set(root, []);
    roots.get(root).push(n);
  }
  // Where a continent sits is its NAME. How big it draws is its share of the
  // vault, shrunk only where a neighbour is close, and shrunk in PROPORTION.
  //
  // Separating those two is the whole trick and it took four wrong versions to
  // see it. Every earlier attempt let one region's SIZE influence another
  // region's POSITION, through a clearance test, and size depends on the note
  // count, and the note count changes whenever anybody writes anything. So the
  // map rearranged itself while you used it: adding a three-note region once
  // threw an unrelated continent 53 degrees across the sphere for no reason a
  // member could ever have seen.
  //
  // The share is quantised (see regionRadius) so ordinary writing changes
  // nothing at all, and where two caps would meet, each gives up a share of the
  // gap in proportion to what it wanted. Both sides compute the same number, so
  // they end up exactly touching rather than one swallowing the other. A
  // symmetric half-and-half split was the version before this, and it starved
  // big regions to make room for scraps.
  const rootNames = [...roots.keys()].sort();
  const slots = regionSlots(rootNames.length);
  const slotDir = fibonacciSphere(slots);
  const home = new Map();
  const want = new Map();
  // Declared regions are laid along the orbit in the member's own order, so
  // what they put next to each other ends up next to each other. Everything
  // else keeps the hash lattice, which is the point: a tagging pass changes the
  // set of UNDECLARED regions constantly, and if that reshuffled the world the
  // map would churn for exactly as long as somebody was tidying it. Dan's five
  // hold still while the noise around them resolves.
  // A declared region with no members yet still EXISTS. It takes its seat on
  // the orbit the day it is named, for two reasons found on the first real
  // multi-store draw (2026-08-28, seven lands declared, zero tagged): dropped
  // lands meant the freshly approved map showed nothing at all, and a seat
  // assigned only on first member meant every land's home shifted each time
  // another land filled — the orbit length kept changing under them. Named is
  // seated; empty is just a fact about the population.
  for (const r of (o.declared || [])) if (!roots.has(r)) roots.set(r, []);
  const declared = (o.declared || []).filter((r) => roots.has(r));
  const orbit = declared.length ? regionOrbit(declared.length) : [];
  declared.forEach((name, i) => {
    home.set(name, { c: orbit[i], t: 0 });
    want.set(name, regionRadius(roots.get(name).length / total, pack));
    // reserve the lattice slot nearest this home so a hashed region cannot land
    // on top of a declared one
    let near = 0, nearD = -2;
    for (let k = 0; k < slots; k++) {
      const d = orbit[i].x * slotDir[k].x + orbit[i].y * slotDir[k].y + orbit[i].z * slotDir[k].z;
      if (d > nearD) { nearD = d; near = k; }
    }
    taken.set(near, name);
  });
  for (const name of rootNames) {
    if (home.has(name)) continue;
    let slot = regionHome(name, slots);
    for (let i = 0; i < slots && taken.has(slot); i++) slot = (slot + 1) % slots;
    taken.set(slot, name);
    home.set(name, { c: slotDir[slot], t: 0 });
    want.set(name, regionRadius(roots.get(name).length / total, pack));
  }
  // Unfiled is the SEA, not a continent, and it is the only thing on the
  // sphere that does not push anyone around.
  //
  // Folding the unnamed regions into one place fixed `apc` and broke the other
  // four. 569 of 670 notes is 85% of the vault, so as a cap it wants a radius
  // of about 124 degrees, and the clearance test then squeezed every named
  // region it stood near down to two or three degrees of spread. The named
  // places got crushed by the pile of things that have no name.
  //
  // So it is excluded from clearance in both directions. Named regions sit on
  // top of it and overlap it freely, which is Dan's own call from the same
  // day: "it's fine if regions overlap a bit, I think that's kind of the
  // point." Overlapping open water costs nothing, and as tagging goes on the
  // sea recedes on its own without ever having shoved a coastline.
  const SEA = 'unfiled';
  for (const name of rootNames) {
    const spot = home.get(name);
    const mine = want.get(name);
    let t = mine;
    if (name !== SEA) {
      for (const other of rootNames) {
        if (other === name || other === SEA) continue;
        const o = home.get(other).c;
        const d = Math.acos(Math.max(-1, Math.min(1, spot.c.x * o.x + spot.c.y * o.y + spot.c.z * o.z)));
        const room = d * mine / (clear * (mine + want.get(other)));
        if (room < t) t = room;
      }
    }
    spot.t = Math.max(0.05, t);
  }

  const at = new Array(nodes.length);
  for (const name of rootNames) {
    const group = roots.get(name);
    const spot = home.get(name);
    const frame = tangentFrame(spot.c);

    // neighbourhoods: apc/ai-course inside apc. One level, because a continent
    // holding neighbourhoods holding notes is as deep as a map can go before it
    // stops being a map.
    const subs = new Map();
    for (const n of group) {
      const parts = String(n.region || "").split("/");
      const sub = parts.length > 1 ? parts.slice(1).join("/") : "";
      if (!subs.has(sub)) subs.set(sub, []);
      subs.get(sub).push(n);
    }
    const subNames = [...subs.keys()].sort();
    const single = subNames.length === 1;

    for (const sub of subNames) {
      const members = subs.get(sub);
      let cc = spot.c, tt = spot.t, ff = frame;
      if (!single) {
        const share = members.length / group.length;
        const slot = regionHome(name + "/" + sub, 64);
        const a = Math.cos(slot * 2.399963) * 0.55;
        const b = Math.sin(slot * 2.399963) * 0.55;
        cc = onCap(spot.c, frame, a, b, spot.t);
        tt = spot.t * Math.max(0.18, Math.sqrt(share) * 0.72);
        ff = tangentFrame(cc);
      }
      const disc = discOf(members.map((n) => n.vec || [0]));
      for (let i = 0; i < members.length; i++) at[index.get(members[i])] = onCap(cc, ff, disc[i][0], disc[i][1], tt);

      // The corridor, inside the neighbourhood. Same rule as the region
      // corridor below and for the same reason, one level down: a sub-region
      // that charted its own course has ALL its stops in this one disc, so the
      // hash had them in an order that knew nothing about the voyage and the
      // route drawn through them crossed itself every time. Laid on the sub's
      // own arc they read as a line, which is what Dan asked for on 2026-08-24
      // looking at website-refresh.
      //
      // Bounded by `tt`, the sub's own radius, not the region's, so the voyage
      // stays inside the neighbourhood it belongs to rather than sprawling
      // across the continent the way an unbounded walk used to.
      const subKey = name + "/" + sub;
      const chart = [];
      for (const n of members) {
        const c = o.course && o.course[n.id];
        if (c && c.n > 0 && c.slug === subKey) chart.push({ n: n, at: c.n, of: c.of || 0 });
      }
      if (chart.length > 1) {
        chart.sort((a, b) => a.at - b.at);
        const span = Math.max(1, (chart[0].of || chart.length) - 1);
        const reach = Math.min(tt * 0.82, 0.28);
        for (let i = 0; i < chart.length; i++) {
          const s = Math.max(0, Math.min(1, (chart[i].at - 1) / span));
          at[index.get(chart[i].n)] =
            onCap(cc, ff, (s - 0.5) * 2, Math.sin(s * Math.PI) * 0.34, reach);
        }
      }
    }

    // THE COURSE IS A CORRIDOR, and it overrides the hash.
    //
    // Dan, 2026-08-23: "I don't want to see a course that crosses back over its
    // dotted line path." It always did, and no amount of drawing could fix it.
    // A stop inherits its note's position, note positions come from a path
    // token hash, and a hash knows nothing about the order of a course, so a
    // line drawn through four stops in order doubled back every time. Measured
    // on the real roadmap: 360,182 then 227,313 then 61,244 then 190,129, which
    // is right, down-left, left, then back up over itself.
    //
    // You can have "the stop is exactly where the note lives" or "the route
    // never crosses itself", not both, because the positions do not cooperate.
    // So the course wins, and it wins the same way regions.md already wins one
    // level up (4.1: the order a member writes their regions in IS the
    // geography). A course is a declaration too, and the strongest one a member
    // makes about their own work, so it gets the same authority: its landfalls
    // lay along an arc across the region in course order, and everything else
    // in the region keeps the hash.
    //
    // Monotone along `u` by construction, so it cannot self-cross. The gentle
    // bow across `v` is what stops it reading as a ruler; because the bow is a
    // single half sine it never doubles back either.
    //
    // The cost, said out loud rather than discovered: charting a course MOVES
    // those notes, and a member is learning where their things are. That is the
    // right cost because charting is a deliberate act invoked by name. You
    // rearranged your priorities and the world rearranged to match, which is
    // the same contract as moving a heading in regions.md.
    // `c.slug === name` matters and it is not belt and braces. A course item
    // may name a note that lives in somebody else's region: Dan's brain course
    // sails its second stop to a note tagged `membership/dashboard`, because
    // the dashboard really is membership work. Without this test that note
    // would be laid on MEMBERSHIP's corridor carrying BRAIN's stop number, and
    // it happens to be a 2, so it would have fought membership's own second
    // stop for the same place on the arc. A stop outside its course's region
    // keeps the position it already had, which is the honest answer: the map
    // then says out loud that this item happens over there.
    const ordered = [];
    for (const n of group) {
      const c = o.course && o.course[n.id];
      if (c && c.n > 0 && c.slug === name) ordered.push({ n: n, at: c.n, of: c.of || 0 });
    }
    if (ordered.length > 1) {
      ordered.sort((a, b) => a.at - b.at);
      // Long enough to read as a voyage, short enough that the camera does not
      // have to retreat to the whole ball to see it. Two limits, and whichever
      // bites first wins: stay inside the region's own coast, and stay inside
      // what the surface camera can frame. The first version had only the coast
      // limit and APC, the largest region, immediately spread its four stops
      // across 1.6 radians and drove the camera to its floor. A course that
      // fills the frame is the whole point of 7.14; a corridor that undoes it
      // has traded one unreadable view for another.
      const reach = Math.min(spot.t * 0.82, 0.28);
      // Spaced by each stop's place in the WHOLE course rather than by its rank
      // among the ones that happen to have notes. A course of four whose second
      // item has no landfall should leave a GAP where that item belongs, so the
      // stop at sea drops into it and the whole thing reads in sequence. Dan,
      // 2026-08-23: "just all the nodes need to be well laid out in sequence."
      const span = Math.max(1, (ordered[0].of || ordered.length) - 1);
      for (let i = 0; i < ordered.length; i++) {
        const s = Math.max(0, Math.min(1, (ordered[i].at - 1) / span));
        const u = (s - 0.5) * 2;                        // -1 at the first stop, +1 at the last
        const v = Math.sin(s * Math.PI) * 0.34;         // one shallow bow, never a second
        at[index.get(ordered[i].n)] = onCap(spot.c, frame, u, v, reach);
      }
    }
  }
  for (let i = 0; i < at.length; i++) if (!at[i]) at[i] = { x: 0, y: 0, z: 1 };
  return at;
}

// Cut a title to the width available rather than to a character count. A
// monospace guess is wrong the moment the theme, the dpr or the panel changes,
// and the failure is a title that reads "The dashboard, and givi…" beside three
// inches of empty gutter.
function fitText(ctx, text, maxW) {
  const t = String(text || '');
  if (ctx.measureText(t).width <= maxW) return t;
  let lo = 0, hi = t.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(t.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1;
  }
  return lo > 0 ? t.slice(0, lo).replace(/[\s,;:.-]+$/, '') + '…' : '…';
}

// The corner caption as a picture: right-aligned text and its glow, drawn once
// per (text, font, ink, glow) and reused. `right` and `base` are where the
// text's right edge and baseline sit inside it. Null without a canvas (tests).
const capStamps = new Map();
function capStamp(text, font, track, ink, glow, blur, size) {
  const key = text + '|' + font + '|' + track + '|' + ink + '|' + glow + '|' + blur;
  let s = capStamps.get(key);
  if (s !== undefined) return s;
  if (capStamps.size > 24) capStamps.clear();
  s = null;
  try {
    const c = document.createElement('canvas');
    const x = c.getContext('2d');
    if (x) {
      x.font = font; if (track) x.letterSpacing = track;
      const tw = x.measureText(text).width;
      const m = Math.ceil(blur * 2 + 4);
      c.width = Math.ceil(tw + 2 * m);
      c.height = Math.ceil(size * 1.6 + 2 * m);
      // a resize resets the context, so the state is set again after it
      x.font = font; if (track) x.letterSpacing = track;
      x.textAlign = 'right'; x.textBaseline = 'alphabetic';
      x.fillStyle = ink; x.shadowColor = glow; x.shadowBlur = blur;
      const right = c.width - m, base = m + size * 1.15;
      x.fillText(text, right, base);
      s = { c, right, base };
    }
  } catch (_) { s = null; }
  capStamps.set(key, s);
  return s;
}

// How much of the canvas the label ladder owns down the left side.
//
// ONE function, because the framing has to keep the route out of exactly the
// column the labels stand in, and two expressions for that would drift apart
// the first time either was tuned. Before this the ladder was clamped hard
// against the left edge at 10px with no gutter at all, and every title was cut
// to 24 characters whether or not there was room for more.
// `rows` is how many labels will actually stand there. It is optional, and
// omitting it keeps the old full-width answer, which is right for a ladder
// whose size is unknown.
//
// WHY IT NOW ASKS. Measured 2026-09-05, and it was the whole framing problem:
// the gutter takes 30% of the canvas — 344px of 1140 — and `frameCourse` keeps
// the route out of it. Client-portal's course cleared that column by ELEVEN
// PIXELS, so the fit test failed and the camera fell back to its zoom floor,
// which is why the course sat at 24% x 43% of the frame while the brief asked
// for 70-80%, and why 107 stations had nowhere to be discrete. Nothing else
// moved it: shrinking the swept-disc ring did nothing, cutting the margins did
// nothing, because neither of them was what the fit was failing on.
//
// The ladder that column was sized for is gone. It names INTERCHANGES only now
// — four rows on this course, nine at the authoring ceiling — so it was asking
// for a third of the surface to stand four lines of text in. A ladder gets the
// room its rows need and no more; a long title still gets a real column, and
// `fitText` was always going to cut whatever does not fit.
function ladderGutter(w, dpr, rows) {
  const k = dpr || 1;
  const full = Math.max(120 * k, Math.min(0.30 * w, 340 * k));
  if (rows == null) return full;
  if (rows <= 0) return 0;
  // Four to nine rows is a caption down the side, not a column of prose.
  return Math.min(full, Math.max(120 * k, 0.18 * w));
}

// The axis to turn about so that one place stays exactly where it is.
//
// The idle turn runs about the screen's vertical, which is right when the
// whole ball is the subject and wrong the moment a region is. Dan, 2026-08-23:
// after flying into a region the view should orbit THAT "instead of continuing
// to fly around the globe." Turning about the world axis slid the region he
// had just asked for out of frame, which is the globe walking away mid-
// sentence.
//
// A rotation leaves its own axis fixed, so the axis IS the answer: turn about
// the focused region's own direction in camera space and that region does not
// move at all while everything else swings around it. Same one line, same
// rate, no second motion system and nothing to keep in sync.
function orbitAxis(orient, at) {
  if (!at) return { x: 0, y: 1, z: 0 };
  const a = rotate(orient, at);
  const l = Math.hypot(a.x, a.y, a.z);
  if (!(l > 1e-9)) return { x: 0, y: 1, z: 0 };
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

// ── a point between two points ──────────────────────────────────────────────
// Point-space slerp: one step of great-circle arithmetic. slerp() above is
// for QUATERNIONS (w,x,y,z) - handing it plain positions computes with an
// undefined w and yields NaN, which cost a live bug: gliding nodes vanished
// mid-transit and popped at their destination, reading as the exact jerk the
// glide existed to remove
function slerpPoint(a, b, t) {
  const d = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
  const ang = Math.acos(d);
  if (!(ang > 1e-6)) return b;
  const sn = Math.sin(ang);
  const k0 = Math.sin((1 - t) * ang) / sn;
  const k1 = Math.sin(t * ang) / sn;
  return normalise({ x: a.x * k0 + b.x * k1, y: a.y * k0 + b.y * k1, z: a.z * k0 + b.z * k1 });
}

// ── coastlines ──────────────────────────────────────────────────────────────
// A region drawn as a shape you could point at, rather than as a scatter you
// have to infer. Dan asked for "line drawn country or oceanic region outlines
// that do a nice job of containing those nodes."
//
// The obvious implementation is the cap: every region already has a centre and
// an angular radius, so stroke that circle and stop. Two things are wrong with
// it. A perfect circle does not read as a country, it reads as a selection
// tool. And more seriously it would CUT the region: a sub-region sits at 0.55
// of the radius and spreads up to 0.72 of it again, so a node reaches 1.27
// radii out, and the nominal cap has never been where the land ends.
//
// So the coast is measured from the notes themselves. For each bearing around
// the centre, how far out does this region actually reach? That gives an
// irregular closed curve which contains every node BY CONSTRUCTION rather than
// by a fudge factor, and which is irregular for a reason: the shape is a fact
// about where somebody's work sits, so two regions never look alike and the
// same vault draws the same coast every time.
const COAST_BEARINGS = 96;

function coastRadii(c, pts, opts) {
  const o = opts || {};
  const B = o.bearings || COAST_BEARINGS;
  const margin = o.margin == null ? 0.22 : o.margin;
  const floor = o.floor == null ? 0.05 : o.floor;
  const frame = tangentFrame(c);
  const raw = new Array(B).fill(0);
  for (const p of pts) {
    const d = Math.max(-1, Math.min(1, c.x * p.x + c.y * p.y + c.z * p.z));
    const ang = Math.acos(d);
    if (!(ang > 1e-9)) continue;
    // the bearing of this note around the centre, in the tangent plane
    const a = frame.u.x * p.x + frame.u.y * p.y + frame.u.z * p.z;
    const b = frame.v.x * p.x + frame.v.y * p.y + frame.v.z * p.z;
    let th = Math.atan2(b, a);
    if (th < 0) th += Math.PI * 2;
    const i = Math.floor(th / (Math.PI * 2) * B) % B;
    if (ang > raw[i]) raw[i] = ang;
  }
  // A bearing with nothing on it is not an inlet cutting to the centre, it is
  // simply coast between two headlands. Empty bins take the larger of their
  // nearest occupied neighbours so the outline stays a coast rather than
  // collapsing into a starfish.
  const occupied = raw.map((r) => r > 0);
  if (!occupied.some(Boolean)) return raw.map(() => floor);
  const filled = raw.slice();
  for (let i = 0; i < B; i++) {
    if (occupied[i]) continue;
    let back = 0, fwd = 0;
    for (let k = 1; k <= B; k++) { const j = (i - k + B * 2) % B; if (occupied[j]) { back = raw[j]; break; } }
    for (let k = 1; k <= B; k++) { const j = (i + k) % B; if (occupied[j]) { fwd = raw[j]; break; } }
    filled[i] = Math.max(back, fwd);
  }
  // Smooth it, or the coast is a saw. A circular moving average, so there is no
  // seam where the loop closes.
  const win = o.smooth == null ? 7 : o.smooth;
  const soft = new Array(B);
  for (let i = 0; i < B; i++) {
    let sum = 0, n = 0;
    for (let k = -win; k <= win; k++) { sum += filled[(i + k + B * 2) % B]; n++; }
    soft[i] = sum / n;
  }
  // Then put the land back. Smoothing can pull the curve INSIDE a headland it
  // just averaged away, which would leave a note sitting in the sea, and a
  // border that does not contain its own nodes is the one thing this had to
  // get right. So every bearing takes the greater of the smoothed value and
  // its own measured reach, and only then is the margin added.
  const out = new Array(B);
  for (let i = 0; i < B; i++) {
    out[i] = Math.min(Math.PI * 0.47, Math.max(soft[i], raw[i]) * (1 + margin) + floor * 0.4);
  }
  return out;
}

// The coast as directions on the sphere, closed, ready to stroke.
function regionCoast(c, pts, opts) {
  const r = coastRadii(c, pts, opts);
  const B = r.length;
  const frame = tangentFrame(c);
  const loop = new Array(B);
  for (let i = 0; i < B; i++) {
    const th = i / B * Math.PI * 2;
    loop[i] = onCap(c, frame, Math.cos(th), Math.sin(th), r[i]);
  }
  return loop;
}

// The type size a land's name is set at, in CSS px before dpr. Half a step
// under the ladder's 11 and the same as the hover plaque's second line, which
// is the quietest text this canvas already draws.
const LAND_LABEL = 9.5;

// ── the land in view (Dan, 2026-09-02) ─────────────────────────────────────
// The first cut set each name INSIDE its own territory and revealed all of
// them together on hover. Two problems with that, both only visible once it
// was on screen: eight names at once is the busy map the brief forbade, and a
// name lying on the terrain competes with the notes drawn over it however
// quiet the type is.
//
// So the name leaves the map and becomes a CAPTION, one at a time, in the
// upper right of the globe, and what decides which name is showing is where
// the camera is pointed. Turn toward a land and its name fades up there and
// its coastline comes up with it; turn away and both go. The map stops
// labelling itself and starts answering the one question a member actually
// has, which is "what am I looking at."
//
// `face` is the region's own direction against the view axis: +1 dead ahead,
// 0 at the limb. Taken from the mean of its outline's rotated vectors, so it
// moves as smoothly as the globe does and a big land does not flicker on one
// stray point the way a max would.
// The window is deliberately narrow and high: a land only begins to answer
// once it is genuinely turned toward you, and it does not reach full strength
// until its middle is near the middle of the view. A wide window is what made
// the first cut read as no change at all, because at any moment half the map
// sat in the same lukewarm middle of the range.
const LAND_NEAR_LO = 0.58;      // still edge-on: unnamed, and nearly unlit
const LAND_NEAR_HI = 0.97;      // its centre at the centre of the view
// Vibrancy is `near` on a curve, so the top of the range does the work: the
// approach stays dark for most of the turn and then arrives.
const LAND_VIB_POW = 1.7;
// ── and the notes inside them do the same (Dan, 2026-09-03) ───────────────
// "The nodes themselves need to come into focus and be sharp and not blurred
// at all when the camera is closer to that region." They were drawn at a FLAT
// level wherever they sat, so a note edge-on at the limb and a note dead in
// the middle of the view were the same: the borders lit as you came in and the
// field inside them stayed soft, which is a border announcing a thing that
// never arrives.
//
// The SAME nearness() window as the lands, on purpose, so the coast and its
// notes come up together and read as one thing coming into focus rather than
// two effects that happen to overlap.
//
// Two differences, both deliberate. A gentler curve, because a note should
// start answering a little before its land is squarely faced. And a much
// higher floor, because a coastline may fade almost out at the limb and a NOTE
// may not: the one thing this globe exists to show is how much else there is,
// and a limb that goes dark answers the sharpness question by deleting the
// answer. Same reason orphans are dust rather than hidden.
const NODE_VIB_POW = 1.25;
// Level at the limb. HIGH, because at rest nothing should read as blurred:
// Dan, 2026-09-03, on the first cut of this — the turn-toward-it sharpening is
// worth keeping, but a resting globe "none of the nodes should appear kind of
// blurry like they do". Softness is for nodes that have been pushed back by
// something (a note in play, a held node, a course), never the resting state.
const NODE_DIM = 0.75;          // level at the limb; a full 1 at the middle
// And the OTHER half of what read as blur, which level alone cannot fix.
//
// Size runs 0.5x to 2.5x on weight, so a heavy note is drawn about 13px across.
// At full strength that is a hub reading as a hub, which is what the range is
// for; at partial strength it is a large soft disc, and Dan's words for the
// first cut were that the blurred-out nodes "get way too large". A big dim dot
// IS a blur, whatever its alpha says.
//
// So a node away from the middle of the view gives up DIAMETER as well as
// level, and gets it back as the camera turns toward it. That keeps the weight
// hierarchy intact everywhere (every node scales by the same factor at the
// same facing) while making the difference between "over there" and "here"
// something you can see in the shape rather than only in the wash.
const NODE_FAR_R = 0.66;        // size at the limb, as a share of full
// ── the resting size, pinned to the shimmering one (Dan, 2026-09-04) ───────
// "The nodes, when at rest, when turning the globe need to be similar sized as
// when sparkling, so much smaller."
//
// Which makes the shimmer register the reference and the resting one the thing
// that had to move. Worth writing the arithmetic down, because these two sizes
// are computed in different branches and nothing else would keep them near
// each other:
//
//   shimmering, at full strength   NODE_SPARK_R                = 1.43 x weight
//   resting, at the middle of view NODE_R * (0.72 + 0.28 * p)
//
// `p` is the perspective swell, camZ / (camZ - z). A node on the near face at
// the sidebar's camera distance sits around 1.56, so that bracket is about
// 1.16, and 1.43 / 1.16 lands on 1.23. Rounded to 1.25, which puts a resting
// node at the middle of the view within a couple of percent of the same note
// mid-shimmer — near enough that turning the globe does not change how big the
// world is, which is the whole of the ask.
//
// The old value was 2.4, so this is a little over half. The back face keeps
// its old ratio to the front (1.5 / 2.4) rather than being picked again.
const NODE_R = 1.25, NODE_R_BACK = 0.78;
// The resting web (o.web). A trace is gone a little BEFORE its foot reaches
// the limb, because a line drawn edge-on is a line drawn at full length across
// a point, which reads as a stray stroke rather than as a shape turning away.
const WEB_LIMB = 0.11, WEB_FLOOR = 0.16;
const STALK_LIMB = 0.12;        // below this the stalk is edge-on and reads as litter
// ── the activated register: a note IN PLAY (Dan, 2026-09-04) ──────────────
// Half of what it was, "but still larger noticeably than the other nodes not
// in play". 2.1 against a resting 1.45 at the middle of the view is about one
// and a half times — and an active note also carries full opacity and a halo
// that a resting one does not, so three signals say it together where one used
// to say it at three times the size.
//
// NODE_SPARK_R is what a note in a SHIMMERING region is drawn at, and it is
// pinned to the resting size on purpose (see NODE_R: 1.43 is what resting
// works out to at the middle of the view). It is stated as its own number
// rather than as a share of the lit size, which is the trap this edit walked
// into: the shimmer used to be `4.2 * 0.34`, so halving the lit size would
// silently have halved the shimmer with it and undone yesterday's match. The
// share is DERIVED from the two now, so changing one cannot move the other.
const NODE_LIT_R = 2.45;        // a note in play
const NODE_SPARK_R = 1.43;      // a note in a shimmering region
const NODE_LIT_BREATH = 0.9;    // how much it swells while being written into
const NODE_LIT_GLOW = 6;        // halved with the dot, or the halo outgrows it
// ── a spotlight on forty things is daylight (Dan, 2026-09-04) ─────────────
// The in-play register is EMPHASIS, and emphasis does not survive being
// applied to everything. A turn that reads thirty files lit thirty notes at
// full size with a halo each, and where those halos overlapped the colour
// saturated to white: a blown-out mass with no shape in it. Dan, holding up a
// screenshot of exactly that: "this is never a view of all those really large
// nodes that I ever want to see."
//
// So the emphasis eases back as the set grows. A handful of notes in play are
// spotlights; a burst is a lit CLUSTER, which is the truer thing to say about
// a burst anyway — thirty notes at once is one act of reading, not thirty
// separate events worth thirty separate marks.
//
// The glow goes with it and is the half that matters most: a soft halo is what
// actually washes the picture out when it is drawn thirty times over, and it
// is the reason overlapping discs went white rather than merely crowded.
const PLAY_FEW = 5, PLAY_MANY = 26;
// how much of the full in-play emphasis survives at PLAY_MANY. Not zero: a
// note in play still outranks a resting one, or the register would stop
// meaning anything at exactly the moment there is most to say.
const PLAY_FLOOR = 0.75;
// And a slow, shallow pulse while pieces are in play (Dan, 2026-09-04: "a
// little larger visually and pulse a bit, slow"). It rides the sphere's own
// breath, the same ~5.7s clock the written-to node uses, so the globe keeps
// one heartbeat instead of gaining a second at a nearly-equal period.
//
// Scaled by `few` along with everything else in this register: a handful of
// pieces breathing together reads as a set being held, and thirty doing it in
// unison would be the wall this falloff exists to prevent, moving.
const PLAY_PULSE = 0.09;        // +-9% of the in-play radius
function playEase(n) {
  const t = Math.max(0, Math.min(1, (n - PLAY_FEW) / (PLAY_MANY - PLAY_FEW)));
  return 1 - t * t * (3 - 2 * t);   // 1 with a few, 0 with many, smooth between
}
// Below about two thirds of a pixel a dot stops being a small dot and becomes
// a grey smudge: antialiasing spreads it over four pixels and takes its colour
// with it. That is the blur at the middle of the view that no amount of alpha
// can fix, so the radius gets a floor that rises with nearness.
const NODE_SHARP_R = 0.6, NODE_SHARP_GAIN = 0.3;
const LAND_DARK_SHADE = 0.16;   // at rest: the hue, at almost no level
const LAND_LIVE_SHADE = 1.0;    // at the centre of the view: the token itself
const LAND_ON_SHADE = 1.0;      // the one in hand is always fully itself

// A darker shade of a token colour, for lands at rest. Multiplying the channels
// keeps the hue exactly, which matters here: the coastline, the rail dot and
// the caption's dot all have to stay recognisably the same land.
function shade(css, k) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(String(css == null ? '' : css).trim());
  if (!m) return css;
  const n = parseInt(m[1], 16);
  return 'rgb(' + Math.round(((n >> 16) & 255) * k) + ','
    + Math.round(((n >> 8) & 255) * k) + ','
    + Math.round((n & 255) * k) + ')';
}

// The same colour at a fraction of its opacity, for gradient ramps that have
// to reach nothing without reaching a DIFFERENT colour on the way. Canvas
// interpolates an `rgba(x,y,z,0)` stop honestly and the keyword `transparent`
// as transparent BLACK, which is what puts a grey bruise between a tinted stop
// and the end of a falloff. Handles the two forms the tokens actually use.
function softenColor(css, k) {
  const s = String(css == null ? '' : css).trim();
  const rgba = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(s);
  if (rgba) {
    const a = rgba[4] == null ? 1 : parseFloat(rgba[4]);
    return `rgba(${rgba[1]},${rgba[2]},${rgba[3]},${(a * k).toFixed(3)})`;
  }
  const hex = /^#([0-9a-fA-F]{6})$/.exec(s);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${k.toFixed(3)})`;
  }
  return s;
}

// ── the limb, rendered once ──────────────────────────────────────────────
// The rim's thickness in CSS PIXELS: the grazing light just inside the
// surface, and the scatter just outside it. Screen-space on purpose. A limb is
// a thin thing however big the planet is, and as fractions of R these were a
// 120px band around a 300px sphere on the store hero: a second, blurred circle
// behind the world rather than an edge on it.
const LIMB_IN = 14;
const LIMB_OUT = 36;
// Where the light comes from, as canvas conic angles (0 is three o'clock,
// clockwise). Each stop is [degrees, which colour, how much of it]. The crest
// sits at upper-left, where the body gradient's own highlight already is, so
// the two agree about the sun; the plum is a much weaker second source toward
// upper-right; and across the lower right there is almost nothing, so the
// circumference cannot be traced and the sphere is allowed to disappear into
// the dark on that side. The colours are the STORE'S, never a category's.
const LIMB_LIGHT = [
  [0, 'rim', 0.03], [40, 'rim', 0], [100, 'deep', 0], [140, 'deep', 0.12],
  [180, 'rim', 0.4], [222, 'rim', 0.72], [262, 'rim', 0.34], [300, 'warm', 0.17],
  [335, 'warm', 0.06], [360, 'rim', 0.03],
];
// One offscreen layer holding the whole limb: a concentric radial profile
// (crest exactly on the surface, which is what an offset gradient centre never
// managed: it floats the crest off the top of the sphere as a separate arc,
// tried twice) multiplied by the conic above through `source-in`, which keeps
// the profile's alpha and takes the cone's colour. Rebuilt only when the
// radius or the palette changes; one drawImage a frame otherwise, which is
// cheaper than the full-disc gradient fill it replaces.
// A NODE'S GLOW AS A STAMP (2026-10-10). `shadowBlur` on a disc is a blur
// pass per node per frame, paid on the GPU where the frame-time governor
// cannot see it. A soft dot painted once per colour and stamped with
// drawImage reads as the same light for the cost of a copy. Null where no
// canvas can be made (a test sandbox), and the caller falls back to the blur.
const glowSprites = new Map();
function glowSprite(col) {
  let c = glowSprites.get(col);
  if (c !== undefined) return c;
  if (glowSprites.size > 96) glowSprites.clear();
  c = null;
  try {
    const s = document.createElement('canvas');
    s.width = s.height = 64;
    const x = s.getContext('2d');
    if (x) {
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,.7)');
      g.addColorStop(0.3, 'rgba(255,255,255,.42)');
      g.addColorStop(0.62, 'rgba(255,255,255,.12)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = col; x.fillRect(0, 0, 64, 64);
      c = s;
    }
  } catch (_) { c = null; }
  glowSprites.set(col, c);
  return c;
}

function buildLimb(R, inner, reach, rim, warm, deep, key) {
  // capped: on a 4K hero the layer would pass 2500px square, and a soft glow
  // survives a half-resolution render without anyone seeing it
  const full = Math.ceil(reach * 2) + 2;
  const scale = Math.min(1, 1600 / full);
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(full * scale);
  const g = c.getContext('2d');
  g.setTransform(scale, 0, 0, scale, 0, 0);
  const half = full / 2;
  // the crest, as a share of the band: rises from nothing inside the face,
  // peaks at the surface, and most of the exterior energy is spent in the
  // first third of the reach so the tail is felt rather than seen
  const p = (R - inner) / (reach - inner);
  const prof = g.createRadialGradient(half, half, inner, half, half, reach);
  const stops = [[0, 0], [p * 0.4, 0.14], [p * 0.75, 0.5], [p, 1], [p + (1 - p) * 0.12, 0.56],
                 [p + (1 - p) * 0.36, 0.24], [p + (1 - p) * 0.68, 0.08], [1, 0]];
  for (const [s, a] of stops) prof.addColorStop(Math.max(0, Math.min(1, s)), 'rgba(255,255,255,' + a + ')');
  g.fillStyle = prof;
  g.beginPath();
  g.arc(half, half, reach, 0, Math.PI * 2);
  g.arc(half, half, inner, 0, Math.PI * 2, true);
  g.fill();
  if (g.createConicGradient) {
    g.globalCompositeOperation = 'source-in';
    const cone = g.createConicGradient(0, half, half);
    const col = { rim: rim, warm: warm, deep: deep };
    for (const [deg, which, k] of LIMB_LIGHT) cone.addColorStop(deg / 360, softenColor(col[which], k));
    g.fillStyle = cone;
    g.fillRect(0, 0, full, full);
    g.globalCompositeOperation = 'source-over';
  }
  return { c: c, key: key, half: half, full: full };
}

function nearness(face) {
  const t = (face - LAND_NEAR_LO) / (LAND_NEAR_HI - LAND_NEAR_LO);
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);   // smoothstep: no hard edge at either end
}

// A magnifier over one patch of the sphere, and deliberately not a re-layout.
// Each point is pushed away from the centre of the patch, along the surface,
// by an amount that falls off with angular distance, then lifted clear of the
// skin. A Gaussian rather than a hard radius, so there is no edge where the
// effect stops; the point AT the centre does not slide sideways at all, it only
// rises, which is why the piece being written stays where you left it while
// everything around it opens out.
//
// Why this and not a globe of its own for each project: position here is
// computed once across every note, which is what lets an unexpected neighbour
// turn up and what lets somebody learn where their own things are. Re-embedding
// a project into its own space would make a note's position a fact about the
// view rather than a fact about the note, and the same note would sit in two
// places depending on how you arrived. This is the same globe seen closer.
function magnify(at, c, amount, opts) {
  const o = opts || {};
  const k0 = o.magnify == null ? 0.7 : o.magnify;
  const fall0 = o.falloff == null ? 0.62 : o.falloff;
  const lift0 = o.lift == null ? 0.08 : o.lift;
  if (!c || !amount) return at;
  const dot = Math.max(-1, Math.min(1, at.x * c.x + at.y * c.y + at.z * c.z));
  const fall = Math.exp(-Math.pow(Math.acos(dot) / fall0, 2));
  const k = k0 * amount * fall;
  const p = normalise({ x: at.x + (at.x - c.x) * k,
    y: at.y + (at.y - c.y) * k, z: at.z + (at.z - c.z) * k });
  const up = 1 + lift0 * amount * fall;
  return { x: p.x * up, y: p.y * up, z: p.z * up };
}

// How far back to stand so the entire sphere sits in the frame. The globe's
// body is drawn at exactly R, and the horizon is pinned by arcTop, so this is
// arithmetic rather than a search: the binding constraint is whichever runs out
// first, the panel's narrow side or the room left under the pinned horizon.
function wholeFit(w, h, opts) {
  const o = opts || {};
  const focusR = o.focusR == null ? 1.44 : o.focusR;
  const arcTop = o.arcTop == null ? 0.13 : o.arcTop;
  const m = Math.min(w, h);
  const pad = 0.04 * m;
  const R = Math.min(m / 2 - pad, (h * (1 - arcTop) - pad) / 2);
  return Math.max(0.05, R / (m * focusR));
}

// ── FLOWN IN: the altitude the full-screen chart is never allowed to leave ──
//
// 1.1, and it is a floor rather than a camera move because the camera already
// works. `frameCourse` solves a zoom for the COURSE box; nothing in that solve
// has an opinion about the HORIZON, so how big the sphere ends up is a
// side-effect of how long the course happened to be. A short course flies in
// hard and looks magnificent; a long one stands back, and at `zoomFloor` the
// whole ball closes inside the frame and the chart quietly becomes the ledger's
// marble at four times the size. 1R.6 caught the same camera sitting at that
// floor once already.
//
// So the rule gets stated instead of hoped for: **on the flown surface the
// sphere's disc must not close inside the frame.** Expressed against the
// DIAGONAL, not the short side, because that is the only measure that survives
// a window shape change — a disc 1.6x the short side of a 16:9 window still
// shows both its left and right edges, and two visible edges is a ball, not a
// world. `wholeFit` is the opposite bound (the zoom where everything fits) and
// is built the same way so the two cannot drift apart.
//
// Today's near-square chart canvas already clears this comfortably, so on this
// layout it changes nothing. That is what a floor is for: it is not a look, it
// is the promise that the look survives a wide window.
function flownFloor(w, h, opts, margin) {
  const o = opts || {};
  const focusR = o.focusR == null ? 1.44 : o.focusR;
  const k = margin == null ? 0.95 : margin;
  const m = Math.max(1, Math.min(w, h));
  const diag = Math.hypot(w, h);
  return Math.max(0.05, (diag * k / 2) / (m * focusR));
}

// One drag step, as the trackball applies it. Exported so the direction is
// under test: the failure is silent, because a globe rotating the wrong way
// still rotates.
function dragTurn(orient, dx, dy, k) {
  const step = k == null ? 0.005 : k;
  return qmul(axisAngle({ x: 0, y: 1, z: 0 }, dx * step),
    qmul(axisAngle({ x: 1, y: 0, z: 0 }, dy * step), orient));
}

// HOW FAST A PIXEL OF DRAG TURNS THE SPHERE, and it is a function of altitude
// rather than a constant. Extracted and exported on 2026-09-08 so the rule is
// testable, because the four previous attempts at it were all a number typed at
// the call site and judged by eye once.
//
// The bug this closes: the gain used to be a constant, so a drag turned the
// sphere by the same ANGLE however close the camera was, and at 8x zoom that
// same angle sweeps eight times the arc across the screen. Dan reported it
// three times (0.0022 -> 0.0009 -> 0.0002) and each fix was another constant,
// which cannot work: no single number is right at two altitudes. The comment at
// the old call site had already worked this out and named the fix. It just had
// not been made.
//
// So: divide by the zoom. A pixel of drag now moves roughly the same distance
// ACROSS THE SURFACE however close you are, which is what a hand on a globe
// does.
//
// Divided by `max(1, userZoom)`, never by `userZoom` raw, and that guard is
// load-bearing: `zoomFloor` lets the camera sit BELOW 1 when it pulls back to
// fit a long course, and a raw division would make the drag nearly twice as
// fast out there. Strictly slower or unchanged at every altitude is the only
// shape of this change that cannot surprise anybody.
function dragGain(route, userZoom) {
  const base = route ? 0.0001 : 0.005;
  const z = userZoom == null ? 1 : userZoom;
  return base / Math.max(1, z);
}

// A SCULPTURE'S DETAIL TIER, with hysteresis that holds (shared-world 4.7e).
// `want` is the share of body points the piece's projected size can show as
// distinct points; the tier steps up once `want` passes 1.25 times the tier
// it has, as before. It used to step down below 0.8 times its own tier, which
// for neighbours more than 1.56 apart (0.06 to 0.12, 0.12 to 0.2) sat ABOVE
// the step up, so a piece at those sizes flipped tier every frame and its
// points blinked (Dan, on the tour's slow zoom over a bridge: "some nodes on
// the tilikum bridge blink rapidly"). It now steps down only once `want`
// falls below 0.9 of the point where the tier below would have stepped up,
// so every band between a step up and a step down is open.
const ART_TIERS = [0.06, 0.12, 0.2, 0.3, 0.45, 0.65, 1];
function artLodStep(lod, want) {
  const i = ART_TIERS.indexOf(lod);
  const idx = i < 0 ? 3 : i;
  const cur = ART_TIERS[idx];
  if (want > cur * 1.25 && idx < ART_TIERS.length - 1) return ART_TIERS[idx + 1];
  if (idx > 0 && want < ART_TIERS[idx - 1] * 1.25 * 0.9) return ART_TIERS[idx - 1];
  return cur;
}

// TOUCH, for a world opened on a phone (shared-world 1.8). Both are pure and
// used only behind the `pinch` and `inertia` mount options, which the
// dashboard never passes, so the member's own globe is untouched.
//
// Two fingers spreading by a ratio zoom by the same ratio; the clamp stays in
// zoomTo, so a pinch can never pass the wheel's ceiling or the solver's floor.
function pinchZoom(startZoom, startDist, dist) {
  if (!(startDist > 0) || !(dist > 0)) return startZoom;
  return startZoom * dist / startDist;
}

// A released drag keeps turning and slows to rest. Velocity is CSS px per ms,
// and the decay is exponential in TIME, so a 120 Hz phone and a 30 Hz one
// coast the same distance. A coast never reverses: each step only shrinks it.
const INERTIA_START = 0.08;   // px/ms at release below which nothing coasts
const INERTIA_REST = 0.01;    // px/ms below which the coast stops
const INERTIA_MAX = 3;        // px/ms, a flick's ceiling, so a coast ends inside ~1.2 s
const INERTIA_TAU = 210;      // ms, the decay's time constant
function inertiaStep(v, dt) {
  const k = Math.exp(-Math.max(0, dt) / INERTIA_TAU);
  const vx = v.vx * k, vy = v.vy * k;
  return Math.hypot(vx, vy) < INERTIA_REST ? { vx: 0, vy: 0 } : { vx, vy };
}

// A FONT SET THAT CHANGES NOTHING IS SKIPPED (2026-10-09). The browser resolves
// a canvas font against the canvas element's computed style, so every set paid
// a style pass, about 20 ms each on a page whose chat is streaming, and the
// same value cost exactly as much as a new one. The layers set the font per
// label per frame and 86% of those sets repeated it: profiled at rest, a third
// of a core went to this alone. Tracked per context across save/restore, and
// forgotten when a resize resets the context's state
function memoFont(c) {
  const d = typeof CanvasRenderingContext2D === 'function' && Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font');
  if (!d || !d.set || !c || !c.canvas) return;
  let cur = null, stack = [], w = -1, h = -1;
  const fresh = () => {
    if (c.canvas.width !== w || c.canvas.height !== h) { w = c.canvas.width; h = c.canvas.height; cur = null; stack = []; }
  };
  Object.defineProperty(c, 'font', {
    configurable: true,
    get() { fresh(); return cur != null ? cur : d.get.call(c); },
    set(v) { fresh(); if (v === cur) return; d.set.call(c, v); cur = v; },
  });
  // the same words in the same font measure the same, and a measure re-checks
  // the canvas's style just as a set did: the labels re-measure every frame
  const measure = c.measureText, widths = new Map();
  c.measureText = function (text) {
    fresh();
    if (cur == null) return measure.call(c, text);
    const key = cur + '\u0000' + (c.letterSpacing || '') + '\u0000' + text;
    let m = widths.get(key);
    if (!m) {
      if (widths.size > 4000) widths.clear();
      m = measure.call(c, text);
      widths.set(key, m);
    }
    return m;
  };
  const save = c.save, restore = c.restore;
  c.save = function () { fresh(); stack.push(cur); return save.call(c); };
  c.restore = function () { fresh(); cur = stack.length ? stack.pop() : null; return restore.call(c); };
}

function mountGlobe(canvas, nodes, opts) {
  if (typeof window === 'undefined' || !canvas) return null;
  // Close to the surface, and slow. Seeing the whole ball at once makes every
  // node a speck; standing near it means the arc of the horizon crosses the
  // top and the individual notes are legible. The idle turn is slow enough
  // that somebody reading beside it never catches motion in the corner of
  // their eye, and the focus zoom leans in further still.
  const o = Object.assign({
    // Slow, and then slower. A globe turning in the corner of the eye while
    // somebody reads is motion they cannot switch off, and the complaint it
    // produces is not "too fast", it is vertigo and a vague wish to look away.
    // 0.007 rad/s is about a quarter of an hour for one turn: perceptible if
    // you watch for it, invisible if you are working. The move to a focused
    // note is long enough to follow with the eye rather than to be jumped.
    idleRate: 0.007, turnMs: 2600, dpr: window.devicePixelRatio || 1,
    idleR: 1.22, focusR: 1.44,      // sphere radius as a multiple of the canvas
    idleCam: 2.2, focusCam: 1.95,   // how near the viewer stands
    arcTop: 0.13,                   // where the horizon crosses, as a fraction of height
    explore: false,                 // drag to turn and wheel to zoom: the full view only
    // Whether the wheel is the globe's. In its own panel it is; laid across a
    // page that scrolls (the store hero) it must not be, or the wheel over the
    // world zooms the world and the member cannot get past the hero. Off, the
    // browser keeps the wheel and the page moves as a page should.
    wheel: true,
    caption: true,                  // the region name in the corner; off for the share card
    captionScale: 1,                // its size; a display screen is read from across a room
    snap: false,                    // jump straight to the framing instead of easing there
    slow: 0.05,                     // while a node is held it all but stops
    // How much is IN a note, as height above the surface.
    //
    // Dan asked for this as depth below the surface, and below is the one
    // direction it cannot go: a stalk running from a front-facing node toward
    // the centre of the sphere is pointed straight at the viewer, so it
    // foreshortens to nothing exactly where you are looking. Height is the same
    // fact in the direction that can be seen. A note somebody has worked for
    // months stands up off the ball; a line they jotted lies flat on it, and
    // the result reads as a skyline over the places doing the most work.
    tall: 0.055,
    // Below this, a note is dust. An orphan with nothing linking it is usually
    // an artefact rather than a thought (a draft email, a stray export), and at
    // full size several hundred of them drown the structure the globe exists to
    // show. They stay visible, because pretending they are not there is how a
    // vault rots quietly, but they stop competing.
    dust: 0.5,
    // ── the same sphere, seen from a different distance ─────────────────
    // A vault globe is read close up with hundreds of notes on it. The store
    // atlas is read from across a hero with thirty-six, and at that distance
    // the vault's own sizes land as specks and its links never draw at all.
    // These three are the projection parameters that are allowed to differ by
    // context; the GEOMETRY is still shared, and every default here is the
    // vault's current behaviour exactly, so nothing moves unless a caller asks.
    nodeScale: 1,   // resting/lit node radius, as a multiple of the vault's
    web: 0,         // strength of the resting link traces; 0 draws none at all
    halo: 0,        // how far the limb dissolves into the page behind it
    // WHERE THE SPHERE SITS IN ITS CANVAS, and how much of it it takes.
    //
    // Both exist for the same reason: a canvas that is exactly the size of the
    // sphere has nowhere to put the air around it. `wholeFit` sizes the ball to
    // fill about 92% of the short side, which is right when the canvas IS the
    // globe's panel and wrong when the canvas is a whole hero the globe lives
    // in. Give it a wider canvas and the ball centres itself in the middle of
    // the page; give it room to breathe and there is nothing to breathe with.
    //
    // `cxFrac` moves the centre across the width (0.5 is the middle, and the
    // vault's). `sphere` scales the drawn radius after the fit solve, so a
    // caller can hand the renderer more canvas than sphere on purpose.
    cxFrac: 0.5,
    sphere: 1,
    // The lens. Focusing a project does not open a second world underneath this
    // one: it magnifies the patch of THIS sphere the project already occupies.
    // That matters more than it sounds. Position on the globe is computed once
    // across everything, which is what lets an unexpected neighbour turn up and
    // what lets somebody learn where their own things are. Re-laying a project
    // out in its own space would make a note's position a fact about the view
    // rather than a fact about the note, and the same note would sit in two
    // places depending on how you arrived. So the focused notes fan out from
    // the middle of their own group and lift off the surface, the effect dies
    // away with distance, and everything keeps its arrangement and its
    // neighbours. Nothing has to be relearned, because nothing moved.
    lift: 0.08,                     // how far a focused note rises off the surface
    magnify: 0.7,                   // how far the patch under focus fans out
    falloff: 0.62,                  // radians: how much of the sphere the lens covers
    recede: 0.4,                    // what the rest of the vault dims to meanwhile
    // How many parts of the brain have to pull on a note before it counts as
    // connective tissue: its own home plus three others. Measured against Dan's
    // 665-note vault rather than picked, because the obvious threshold is wrong.
    // "More than one area" marks 59% of the vault and 5 notes out of 5 in
    // apc-crm, which is not a signal, it is a texture. Four marks 30% overall
    // and lands at 2 of 5, 4 of 10, 4 of 7, 1 of 6 across four real projects,
    // which is the useful shape: a minority you can point at.
    connective: 4
  }, opts || {});
  const ctx = canvas.getContext('2d');
  memoFont(ctx);
  // THE PALETTE IS READ AT THE CANVAS, NOT AT THE ROOT (2026-09-20). Custom
  // properties inherit, so at the canvas every token resolves to exactly what
  // it resolves to at the root unless an ancestor between them says otherwise,
  // and that "otherwise" is the point: one world can wear daybreak, or a
  // member's own overlay, inside a page that stays night. The app is
  // unaffected (nothing between its root and its canvases re-declares a globe
  // token) and a member's `.dashboard-custom.css` gains per-canvas looks for
  // free. The theme watcher below still observes the root, because that is
  // where the toggle writes and a computed style is live either way.
  const css = getComputedStyle(canvas);
  // Remembered between theme changes: about twenty of these were read on every
  // frame, and a computed-style read per colour per frame was a tenth of the
  // globe's whole cost (profiled 2026-10-07). repalette() forgets them all
  const tokSeen = new Map();
  const tok = (n, fallback) => {
    let v = tokSeen.get(n);
    if (v === undefined) { v = (css.getPropertyValue(n) || '').trim(); tokSeen.set(n, v); }
    return v || fallback;
  };
  // The palette is re-read whenever the theme changes rather than captured at
  // mount. It used to be captured, so toggling to daybreak left the globe
  // painting in night colours until the page was reloaded: pale rings on a pale
  // sphere, which is exactly the state where a visibility mark disappears. The
  // toggle sets data-theme on the root, and the system setting moves without
  // touching the DOM at all, so both are watched.
  // The order a legend reads in, which is not alphabetical and not the order
  // the palette literal happens to be written in. It runs from the most
  // concrete thing a vault holds to the least: a person, then a day, then a
  // thing that was settled, then what happens next, then what is being made,
  // then what stays true, and last the thing nobody has committed to.
  const KIND_ORDER = ['person', 'session', 'decision', 'plan', 'craft', 'reference', 'idea'];
  let KIND, SEE_TRUSTED, SEE_PUBLIC, PIP, LANDMARK, BLOOM = 0, COAST_GLOW = 1, STROKE_W = 0, STROKE_COL = 'transparent';
  function repalette() {
    tokSeen.clear();
    STROKE_W = Math.max(0, parseFloat(tok('--node-stroke-w', '0')) || 0);
    STROKE_COL = tok('--node-stroke', 'transparent');
    { const g = parseFloat(tok('--coast-glow', '1')); COAST_GLOW = Number.isFinite(g) ? Math.max(0, g) : 1; }
    BLOOM = Math.max(0, Math.min(1, parseFloat(tok('--node-bloom', '0')) || 0));
    KIND = {
      person: tok('--kind-person', '#9d7bff'), session: tok('--kind-session', '#5BC8F5'),
      decision: tok('--kind-decision', '#E86A6A'), plan: tok('--kind-plan', '#34D399'),
      craft: tok('--kind-craft', '#F472B6'), reference: tok('--kind-reference', '#F0E442'),
      // The seventh, and the only achromatic one. An idea is the node that has
      // not taken a colour yet, and it sits below the six in lightness so an
      // uncommitted thought is never the loudest thing on the map. It shares
      // the pale axis with the visibility marks below and does not collide with
      // them, because a kind is a fill and a mark is a stroke outside it: there
      // is no state where one reads as the other.
      idea: tok('--kind-idea', '#7A8888')
    };
    // A caller may name kinds the VAULT does not have. The store's open
    // department is the case: everywhere else in this app orange means open,
    // and the atlas drew it in the plan green because `open` was not one of
    // the seven and the fallback swallowed it, so the rail dot and the
    // formation for the same department disagreed on screen. Merged after the
    // seven and re-merged on every theme change, so an extra kind tracks the
    // palette instead of being captured once at mount.
    if (o.kinds) {
      for (const k of Object.keys(o.kinds)) {
        KIND[k] = tok(o.kinds[k], KIND[k] || KIND.plan);
      }
    }
    // Deliberately not from the kind palette and never the orange: a visibility
    // mark that borrowed a meaning-carrying colour would read as a sixth kind.
    SEE_TRUSTED = tok('--see-trusted', 'rgba(233,236,255,.42)');
    SEE_PUBLIC = tok('--see-public', 'rgba(233,236,255,.85)');
    PIP = tok('--pip', 'rgba(255,255,255,.92)');
    LANDMARK = tok('--landmark', PIP);
    { const m = parseFloat(tok('--globe-marble', '0')); MARBLE = Number.isFinite(m) ? Math.max(0, Math.min(1, m)) : 0; }
    VEIN = tok('--globe-vein', 'rgba(235,228,215,.5)');
    DESK_SHADOW = tok('--globe-shadow', '');
    DESK_RINGS = tok('--globe-rings', '');
    deskLayer = null;
  }
  // ── THE DESK (Daybreak, Dan 2026-09-27) ─────────────────────────────────
  // In a light room the globe is not a planet in space, it is an instrument
  // on a table: a stone that rests on paper. So two things are drawn around
  // it, both static, because the frame of an astrolabe does not turn with
  // the world inside it. A soft shadow falling below and a little right, so
  // the stone sits ON something. And the instrument's limb: two faint
  // engraved rings with a graduated scale between them, five-degree ticks and
  // a longer one every thirty, in the room's ink. This is what stands in for
  // stars in a room that has no night. Both baked into one layer, rebuilt only
  // when the radius or the palette moves. --globe-shadow and --globe-rings are
  // empty in night and on every other room, so nothing else draws them. Only
  // on a globe big enough to carry it; a thumbnail keeps a bare sphere.
  let DESK_SHADOW = '', DESK_RINGS = '', deskLayer = null;
  function buildDesk(R) {
    const pad = Math.ceil(R * 0.32);
    const full = Math.ceil(R * 2 + pad * 2), half = full / 2;
    const c = document.createElement('canvas');
    c.width = c.height = full;
    const x = c.getContext('2d');
    if (DESK_SHADOW) {
      // the shadow alone: the disc is drawn far off the layer and only its
      // shadow is offset back onto it
      const off = full * 2;
      x.save();
      x.shadowColor = DESK_SHADOW;
      x.shadowBlur = R * 0.16;
      x.shadowOffsetX = off + R * 0.035;
      x.shadowOffsetY = R * 0.07;
      x.fillStyle = '#000';
      x.beginPath(); x.arc(half - off, half, R * 0.985, 0, Math.PI * 2); x.fill();
      x.restore();
    }
    if (DESK_RINGS) {
      const r1 = R * 1.075, r2 = R * 1.125, dpr = o.dpr;
      x.strokeStyle = DESK_RINGS;
      x.lineWidth = Math.max(1, 0.9 * dpr);
      x.beginPath(); x.arc(half, half, r1, 0, Math.PI * 2); x.stroke();
      x.lineWidth = Math.max(1, 0.6 * dpr);
      x.beginPath(); x.arc(half, half, r2, 0, Math.PI * 2); x.stroke();
      for (let d = 0; d < 360; d += 5) {
        const a = d * Math.PI / 180, long = d % 30 === 0;
        const ra = r1, rb = long ? r2 : r1 + (r2 - r1) * 0.45;
        x.lineWidth = Math.max(1, (long ? 0.8 : 0.5) * dpr);
        x.beginPath();
        x.moveTo(half + Math.cos(a) * ra, half + Math.sin(a) * ra);
        x.lineTo(half + Math.cos(a) * rb, half + Math.sin(a) * rb);
        x.stroke();
      }
    }
    return { c, half, full, key: Math.round(R) + '|' + DESK_SHADOW + '|' + DESK_RINGS };
  }
  // A disc with its glow, the glow stamped rather than blurred (glowSprite).
  // `fill` defaults to the glow's own colour. Leaves shadowBlur at 0.
  function glowDisc(x, y, r, blur, col, fill) {
    const s = blur > 0.5 ? glowSprite(col) : null;
    if (s) {
      const e = r + blur * 1.05;
      ctx.shadowBlur = 0;
      ctx.drawImage(s, x - e, y - e, e * 2, e * 2);
    } else { ctx.shadowBlur = blur; ctx.shadowColor = col; }
    ctx.fillStyle = fill || col;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
  function drawDesk(cx, cy, R) {
    const key = Math.round(R) + '|' + DESK_SHADOW + '|' + DESK_RINGS;
    if (!deskLayer || deskLayer.key !== key) deskLayer = buildDesk(R);
    ctx.drawImage(deskLayer.c, cx - deskLayer.half, cy - deskLayer.half);
  }
  // ── THE MARBLE (Daybreak's ebony globe, Dan 2026-09-26: "ebony marbled
  // slightly") ─────────────────────────────────────────────────────────────
  // Veins that live ON the sphere and turn with it, so the stone is the world's
  // own material rather than a sheen laid over the canvas. Each vein is a slow
  // random walk along the surface, seeded, so the same world always wears the
  // same stone. Drawn twice: a wide faint pass that reads as cloud in the
  // stone, then the fine line. --globe-marble is 0 everywhere else, so no
  // other room enters this code.
  let MARBLE = 0, VEIN = 'rgba(235,228,215,.5)', veins = null;
  function buildVeins() {
    let s = 0x5eed1234;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const any = () => normalise({ x: rnd() * 2 - 1, y: rnd() * 2 - 1, z: rnd() * 2 - 1 });
    const out = [];
    for (let k = 0; k < 18; k++) {
      let p = any();
      let t = normalise(cross(p, any()));
      const n = 40 + Math.floor(rnd() * 110), pts = [p];
      const w = 0.35 + rnd() * rnd() * 1.6;
      let bend = (rnd() - 0.5) * 0.3;
      for (let i = 0; i < n; i++) {
        bend = (bend + (rnd() - 0.5) * 0.14) * 0.9;
        const b = cross(p, t);
        t = normalise({ x: t.x + b.x * bend, y: t.y + b.y * bend, z: t.z + b.z * bend });
        p = normalise({ x: p.x + t.x * 0.028, y: p.y + t.y * 0.028, z: p.z + t.z * 0.028 });
        const d = t.x * p.x + t.y * p.y + t.z * p.z;
        t = normalise({ x: t.x - d * p.x, y: t.y - d * p.y, z: t.z - d * p.z });
        pts.push(p);
      }
      out.push({ pts, w });
    }
    return out;
  }
  function drawMarble(cx, cy, R, camZ) {
    if (!veins) veins = buildVeins();
    const scale = o.dpr * Math.max(1, R / (260 * o.dpr));
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = VEIN; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalAlpha = MARBLE * (pass ? 0.9 : 0.16);
      for (const v of veins) {
        ctx.lineWidth = (pass ? v.w : v.w * 6) * scale;
        ctx.beginPath();
        let pen = false;
        for (const p of v.pts) {
          const g = rotate(orient, p);
          if (g.z < 0.04) { pen = false; continue; }
          const q = project(g, R, cx, cy, camZ);
          if (pen) ctx.lineTo(q.x, q.y); else { ctx.moveTo(q.x, q.y); pen = true; }
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  repalette();
  const themeWatch = new MutationObserver(repalette);
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  let scheme = null;
  try {
    scheme = window.matchMedia('(prefers-color-scheme: dark)');
    scheme.addEventListener('change', repalette);
  } catch (_) {}

  let orient = { w: 1, x: 0, y: 0, z: 0 };
  let turn = null;            // { from, to, start, ms? } — ms defaults to o.turnMs
  // ── going to look at a newborn note (Dan, 2026-08-29) ───────────────────
  // The bolt already struck. What was missing was everything after it: the
  // globe stayed wherever it was and the note named itself in the strip below
  // while the eye was still somewhere else on the sphere. So the camera now
  // sails to the point that was struck, leans in while the note breathes and
  // says its name, and stands back off.
  //
  // `visitBack` is the view to return to, captured once per visit rather than
  // per arrival: two notes landing eight seconds apart must both return to the
  // view the MEMBER had, never to the first arrival's close-up.
  let visiting = null;        // the id breathing under the lens right now
  let visitT = null;          // the timer that ends the visit
  let visitBack = null;       // { lit, gravAt, fitAngle, whole, userZoom }
  const VISIT_MS = 1500;      // the flight itself: a swoop, not the 2.6s survey turn
  // How wide to frame, and how far to lean in. Both measured on the live page
  // rather than picked, because the first pair (0.16 / 1.9) put the camera
  // INSIDE the sphere: a correct aim at a note filling the frame with unlit
  // dark, no horizon, no neighbours, nothing to say where the note had landed.
  // A visit has to show the note IN ITS PLACE, so the frame keeps a horizon and
  // the notes around it, and the leaning-in is what makes it a visit.
  const VISIT_ANGLE = 0.34;
  const VISIT_ZOOM = 1.35;
  // A BIRTH leans in nearer than an ordinary visit. Dan, 2026-09-07: a note
  // nothing links to yet is drawn at dust size, which is right for the map and
  // wrong for its own arrival — the camera flew the whole way to a speck. It
  // stays small; the camera just comes closer, so the first sight of a new note
  // is of a note rather than of the place one landed. Deliberately still well
  // short of the 0.16 / 1.9 pair above, which is where the camera ends up
  // inside the sphere with no horizon and no neighbours: an arrival that cannot
  // say where it arrived is the failure this pair exists between.
  const ARRIVE_ANGLE = 0.24;
  const ARRIVE_ZOOM = 1.62;
  // WATCHING THE WORK (Dan, 2026-10-05: "the globe turns so that the camera is
  // in a nice position to see the edit animation take place"). The write
  // gesture rises off the sphere and a stream pours onto it from above the
  // frame, so a note being written is set LOW in the frame rather than in the
  // middle: the open sky above it is where the stalk rises and the stream
  // falls. A touch wider than a visit, so the whole performance fits.
  const WATCH_ANGLE = 0.38;
  const WATCH_ZOOM = 1.28;
  const WATCH_TY = 0.64;
  // The coastlines, one per region: { slug, c, loop }. Computed once when the
  // layout is, because they depend only on where the notes sit and that does
  // not change while somebody looks at it.
  let coasts = o.coasts || [];
  // The camera the last drawn frame used, for `screenOfPoint`. Null until the
  // first frame has been painted.
  let lastCam = null;
  // Which coast is being pointed at from the rail. Named rather than a set:
  // one region is in hand at a time, which is what makes the highlight mean
  // anything.
  let coastLit = null;
  // The sea-art debug field: id -> unit vector (or a channel record carrying
  // .at), handed in through artDebug(). Developer instrument only; when null,
  // which is always outside development, the overlay costs one check per frame
  // and draws nothing.
  let artDebugField = null;
  // Landmarks: small persistent things the member grew here (the plant,
  // plant.js). Each is a fixed point on the sphere and a handful of dots in
  // its own upright units. See landmarks() below.
  let landmarkList = [];
  const LANDMARK_SIZE = 0.0009;   // sphere radii per landmark unit
  // The artist: (node, now) -> { at, altitude, sizeMultiplier, tint } or null,
  // handed in through art(). This is the composition's ONLY entrance to the
  // renderer; when null (no piece, art disabled, art deleted) every seam is a
  // no-op and the globe is byte-for-byte its pre-art self.
  let artist = null;
  // ── the layer seam: what a layer above this renderer may add ────────────
  //
  // The core names MOMENTS, never an implementation. At mount it fires
  // `globe:mount` (app/ext.js) with an env `g` (built at the bottom of this
  // function), and a layer that cares answers by registering against it:
  //
  //   g.draw(moment, fn)   a draw pass, run every frame at that moment with
  //                        the frame's own numbers { now, w, h, R, camZ, cx,
  //                        cy, lensing }.
  //                        'beneath': under the notes, beside the other canvas
  //                        performances. 'overlay': over the notes and the held
  //                        note's threads, under the hovered note's name.
  //   g.hit(fn)            (ev, out) -> index of a drawn mark under the pointer,
  //                        or -1; `out.d` is its distance. Nearest of that and
  //                        the node test wins, as it always has.
  //   g.press(fn)          (index) -> true when a press on that mark was taken.
  //   g.scene(name, fn)    one more named canvas scene, beside CANVAS_SCENES.
  //   g.debug(fn)          () -> fields merged into debug().
  //   g.methods(obj)       methods added to the returned view.
  //   g.claim(state, ids, done)
  //                        the layer CLAIMS the view (or lets go with null):
  //                        { only, flown, mini, count, points }, plus the note
  //                        ids it stands on and those of them it calls done.
  //
  // With no layer installed nothing registers, `claim` stays null and every
  // branch below that asks about it takes the path it takes for a vault with
  // nothing claimed, which is how this renderer drew before any layer existed.
  let claim = null;
  let claimIds = new Set();
  let claimDone = new Set();
  const layerDraw = { beneath: [], overlay: [] };
  const layerHit = [], layerPress = [], layerDebug = [];
  // a layer saying its own animation is playing (g.playing), so the rest
  // gate draws its frames at full rate: repo-draw.js pours its own stream
  const layerPlaying = [];
  let layerComplained = false;
  // A pass that throws is reported once and skipped for that frame, so a
  // broken layer can never take the core's own drawing down with it.
  function runLayer(moment, fe) {
    for (const fn of layerDraw[moment]) {
      try { fn(fe); } catch (e) {
        if (!layerComplained) { layerComplained = true; console.error('[globe] layer ' + moment + ':', e); }
      }
    }
  }
  // which fine-grain mark the pointer is over, as the index a layer's hit
  // test answered. Separate from `hover`, which names a NODE: a drawn mark has
  // no node, and conflating the two would have the sphere claim a note that
  // does not exist.
  let hoverMark = -1;
  // ── how young is this vault? (Astrolabe 5.11) ───────────────────────────
  //
  // Two of this renderer's rules quietly punish a brand new brain for being
  // new, and together they drew it as nothing at all.
  //
  // ORPHANS ARE DUST, which is right in a vault of seven hundred notes where a
  // handful of unlinked strays are genuinely stragglers. In a vault of eight,
  // where nobody has written a single wikilink yet, EVERY note is an orphan and
  // the whole map is dust. Being unlinked is only remarkable when it is
  // unusual, so the penalty now scales with how unusual it actually is.
  //
  // WEIGHT IS A RANK, and a rank across eight notes of similar length gives
  // every one of them 0. Size is `0.5 + 2 * weight`, so they all drew at the
  // smallest size the renderer has.
  //
  // Measured on a week-old brain: eight notes, every weight 0, every degree 0,
  // radius 0.675px at 37% alpha. Sub-pixel dots on a dark sphere, which is
  // exactly the "didn't render all that well" Dan saw.
  // MEASURED AGAIN WHENEVER THE VAULT CHANGES SIZE, not once at mount, and that
  // is not tidiness. Both of these were `const`, computed from the node list the
  // globe happened to mount with — which was fine while a globe only ever
  // mounted over an existing vault, and wrong the moment first light mounted one
  // over an EMPTY one. Zero notes means orphanShare 0, which means "orphans are
  // unusual here, dim them", applied to a world where every note is going to be
  // an orphan for the next ten minutes. The first light a member ever made drew
  // at half size and 37% alpha: a sub-pixel speck, which is the exact defect
  // 5.11 was written to fix, reintroduced through the back door of an empty
  // mount. Same arithmetic, called again when the answer can have changed.
  let orphanShare = 0, dustAt = 0, densityScale = 1, flatWeights = false;
  function measureSparsity() {
    orphanShare = nodes.length
      ? nodes.filter((n) => (n.degree || 0) === 0).length / nodes.length : 0;
    // Nothing is a straggler in a vault where being unlinked is the norm. Fades
    // back in as the vault grows its own connections.
    dustAt = orphanShare > 0.6 ? 1 : (orphanShare > 0.3 ? 0.75 : 0);
    // A rank across eight notes of similar length gives every one of them the
    // same number, and `0.5 + 2 * weight` then draws them all at the smallest
    // size there is. When every weight agrees, weight is carrying no
    // information and the marks stop reading it.
    const w = (n) => (n.weight == null ? 0.5 : n.weight);
    flatWeights = nodes.length > 1 && nodes.every((n) => w(n) === w(nodes[0]));
    // A mark tuned for a dense sky reads as a dim speck when there are two dozen
    // notes, not six hundred. Scale the marks up while the vault is sparse and
    // ease back to 1 as it fills, so an early globe is vibrant and a full one is
    // not crowded. Purely a size lever; brightness is handled at the mark itself.
    //
    // 1.7x at 30 notes or fewer, 1.0x (the original dense tuning) at 250 or
    // more, and a SMOOTHSTEP between the two rather than a straight line, so the
    // slope is zero at both ends: adding one note never produces a visible step
    // in size, at any count. Each note in the middle moves it by about three
    // thousandths.
    const d = Math.max(0, Math.min(1, (nodes.length - 30) / (250 - 30)));
    densityScale = 1.7 - 0.7 * (d * d * (3 - 2 * d));
  }
  measureSparsity();

  // ── a star is born, and a star is written to (Astrolabe 9.1) ─────────────
  //
  // One-shot flares, never a loop. This build's motion rule is that the globe
  // WAITS for writing and then moves, so a flare is exactly the allowed kind of
  // motion: it is caused by something real happening, it happens once, and it
  // is over. Nothing here breathes on a timer.
  //
  // Dan, 2026-08-23: nodes should "pulse in a satisfying way when they're
  // written to and created fresh, (almost like when a star is born animation
  // - think nasa)". A birth is the bigger event and gets the longer, brighter
  // one; a write is a beat.
  let flares = new Map();   // id -> { at: ms, born: bool }
// ── the departure (Dan, 2026-09-01) ────────────────────────────────────────
// Notes that just left this machine: a push, a backup, the cloud. The birth
// spectacle is a bolt coming DOWN out of the dark into a point; this is its
// mirror, a column of light standing up off the surface, in the note's own
// colour.
//
// Three phases, and the middle one is the point. The first cut was a streak
// that launched and was gone, so a push read as a flicker, and a second send
// arriving mid-flight threw the beam back to zero and started the climb over.
// Now it BURSTS up from altitude zero at the node, STANDS at full reach for as
// long as notes keep going, then settles back down into the node it came from.
// A later send extends the hold rather than restarting the climb, so a long
// push is one continuous column instead of a stutter.
//
// Staggered on the way up, because a push is a flight of them and twelve
// columns rising on one frame is a flash rather than a departure. The stagger
// compresses as the set grows: three notes get three distinct launches, two
// hundred go up as a swarm over about a second.
const SEND_RISE_MS = 520;
const SEND_HOLD_MS = 900;
const SEND_SETTLE_MS = 760;
const SEND_SPREAD_MS = 900;
const SEND_MAX = 120;
let sends = new Map();    // id -> { at: when it leaves, hold: until when it stands }
  const BORN_MS = 2200, WRITE_MS = 900;
  // ── a note that was READ ───────────────────────────────────────────────
  // Deliberately NOT a flare. Reads and writes are a paired state, and the
  // house rule is that a pair gets two different gestures rather than one
  // gesture in two colours. A write changes the world and earns a ring and the
  // camera; a read is ambient observation and earns a brightening that fades.
  //
  // It also has to survive volume. Answering one question can read a dozen
  // files inside a second, so a dozen rings would be a strobe and a dozen
  // flights would be motion sickness with a legend. A decaying set instead
  // reads as a sweep passing across the surface, which is what it was.
  let skims = new Map();    // id -> ms
  const SKIM_MS = 450;
  // A preview is the camera following the member's arrow keys through a result
  // list. It comes in less far and moves faster than a committed land, because
  // it is a look rather than an arrival and the next one may be 200ms away.
  const PREVIEW_MS = 520, PREVIEW_ANGLE = 0.42, PREVIEW_ZOOM = 1.18;

  // The shared body of land() and preview(): aim at one note and stay there.
  // It is visit() with the three refusals and the return flight removed, which
  // is the whole difference between a camera move the machine decided on and
  // one the member asked for. Kept as one function so the two can never drift
  // in how they solve the settled face, which is the part that has been got
  // wrong three times (see solveFace's note under visit).
  // Returns the flight time in ms, or 0 if there was nothing to fly to. The
  // caller needs the duration to say the note's name WHEN THE CAMERA ARRIVES
  // rather than the instant the file appeared, which used to put the words in
  // the strip below while the eye was still somewhere else on the sphere.
  function aimAt(id, angle, zoomAt, ms, ty) {
    const n = nodes.find((x) => x.id === id);
    if (!n || !n.at) return 0;
    stirred();   // the camera is going to ONE note: that is not a region view
    // Cancel any return flight an earlier autonomous visit still owed. Flying
    // the member back to where they were before they asked to be here would
    // quietly undo the thing they just did.
    clearTimeout(visitT);
    visitT = null; visiting = null; visitBack = null;
    aimId = id;
    lit = new Set([id]);
    gravAt = normalise(n.at);
    fitAngle = angle;
    whole = false;
    userZoom = zoomAt;
    const cw = canvas.width, ch = canvas.height;
    const m = fitZoom(fitAngle, cw, ch, o);
    const settled = solveFace(Math.min(cw, ch) * o.focusR * userZoom * m, ch, o.focusCam, o.arcTop,
      drawnRadius(n.at, n.depth), ty);
    // never zero: the frame loop divides by this
    const flight = calm ? 1 : ms;
    turn = { from: orient, to: qmul(quatFromTo(rotate(orient, gravAt), settled), orient),
      start: performance.now(), ms: flight };
    return flight;
  }
  // A note that changes place GLIDES there. moved() used to teleport the
  // node and let the flare explain it, which read fine one note at a time
  // and as jerks in a mass retag (Danny, 2026-08-28: "the transitions are
  // now jerky... they should smoothly transition"). The transit slerps along
  // the sphere's surface — the geodesic, so a crossing note travels the way
  // a ship would — and n.at stays the OLD truth until arrival, when it is
  // assigned once. Reduced motion keeps the instant move.
  const transits = new Map();  // id -> { from, to, start, ms }
  const TRANSIT_MS = 700, SWEEP_TRANSIT_MS = 900;
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function transitPos(n, now) {
    const tr = transits.get(n.id);
    if (!tr) return n.at;
    const t = (now - tr.start) / tr.ms;
    if (t >= 1) { n.at = tr.to; transits.delete(n.id); return n.at; }
    return slerpPoint(tr.from, tr.to, easeInOutCubic(Math.max(0, t)));
  }
  // The birth spectacle (apc #129). Danny, 2026-08-24: a birth should be
  // unmissable — an entrance, a hold, and an exit, with "shadow/gradient/
  // laser/lightning/fog", visible from any orientation (the node flare above
  // skips the far side entirely). Same motion rule: one real arrival, one
  // performance, over. Members asking for reduced motion keep the quiet
  // flare only.
  const SPECTACLE_MS = 5200;
  const calm = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // How many nodes may carry a real shadow blur before the highlight switches
  // to size-and-brightness for all of them (#192). Guessed from the device
  // ONCE, at boot, on purpose: the dpr governor below is reactive and needs
  // ~1.5s of visible jank before it acts, which is fine for a sustained state
  // and useless for a burst of typing — the member has already felt it. A
  // phone should not have to earn its way down through that every session.
  // Both signals are advisory and absent on Safari, hence the ?? defaults.
  const GLOW_BUDGET = glowBudget(
    typeof navigator !== 'undefined' ? navigator : null,
    typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  let spectacles = new Map();   // id -> ms of arrival
  // Draw-the-map has two acts and both were invisible (#177 family): the agent
  // reading the world, then the lines landing. `surveyOn` is act one — a slow
  // sweep roves the sphere and notes brighten as it passes, the map being
  // READ. `coastReveal` is act two — freshly declared coasts draw themselves
  // point by point like a pen, staggered one land after the next, instead of
  // blinking in finished. Both are performances over real state, same rule as
  // the spectacle: they change what a moment looks like, never what is true.
  // Members asking for reduced motion keep the plain versions.
  let surveyOn = null;      // ms the survey began, or null
  let coastReveal = null;   // ms the coasts were handed in with reveal, or null
  const COAST_DRAW_MS = 1400, COAST_STAGGER_MS = 220;
  // The canvas scene table: every named performance this globe can play, in
  // one place. A scene changes what a moment looks like, never what is true,
  // and each entry only flips state the render loop already honors — which is
  // what keeps the library extensible without becoming a second renderer.
  // Names, not functions, cross the API: that is the seam a member-authored
  // overlay can eventually reach through (SEEDS), because a name can be
  // validated and a function cannot be undone.
  // Acts three and four, from the first real run (2026-08-28): the pen
  // finished in seconds but the ritual kept working for minutes, and the
  // silence read as the animation breaking. `finalizingOn` is the long tail —
  // a glint travels each coastline, the map being polished. `completeAt` is
  // the closeout — one swell of every coast and a ring out to the rim, then
  // rest. One beat, over, same rule as the spectacle.
  let finalizingOn = null;  // ms the finalizing glints began, or null
  let completeAt = null;    // ms the closeout began, or null
  const COMPLETE_MS = 2400, GLINT_MS = 2600;
  const CANVAS_SCENES = {
    'map-survey':         () => { if (!surveyOn) surveyOn = performance.now(); },
    'map-survey-end':     () => { surveyOn = null; },
    'map-drawn':          () => { coastReveal = coasts.length ? performance.now() : null; },
    'map-finalizing':     () => { if (!finalizingOn) finalizingOn = performance.now(); },
    'map-finalizing-end': () => { finalizingOn = null; },
    'map-complete':       () => {
      surveyOn = null; finalizingOn = null;
      completeAt = coasts.length ? performance.now() : null;
    },
  };
  let lit = new Set();        // ids of the cluster in focus
  // Which kinds are being asked for. null means all of them, which is the
  // resting state and not a filter with everything ticked: an empty selection
  // and a full one look identical and mean opposite things, so one of them
  // has to be null.
  let only = null;
  let writing = null;         // the single id breathing right now
  // THE WRITE GESTURE (Dan, 2026-10-05, brought over from the repository
  // world): a note the AGENT is writing rises off the sphere and grows, a
  // wavy particle stream pours onto it from a wand out of sight above, and
  // when the work goes quiet a fountain of sparks plays as it settles back.
  // `forge` is that note, set only by the agent's work (writing(id, true)),
  // never by the region path that also uses writing() for its lead; `settle`
  // is the note just finished, for its fountain and its way back down.
  // app/write-stream.js draws the particles; without it nothing here runs.
  let forge = null, settle = null;
  // THE NOTE BEING READ rises too (Dan, 2026-10-05): open a note, or follow a
  // link to one, and it lifts off the sphere and grows the way a written note
  // does; open another and the first eases back down as the new one rises.
  // No stream and no sparks: those say the agent is working. hold(id) sets it.
  let held = null;
  const ws = window.WriteStream ? window.WriteStream.create() : null;
  const riseOf = window.WriteStream ? window.WriteStream.riser() : () => 0;
  const wsPos = new Map(), wsDrip = new Map();
  let wsIds = null, wsIdsAt = -1;
  const WRITE_RISE = 0.11;    // how far a note rises to be written, in radii
  // how wide the write stream's cone opens over a note, against the landing
  // hero's 1 (write-stream.js "THE CONE"); a mount may pass o.streamSpread
  const STREAM_SPREAD = 2.2;
  let raf = null, last = 0, frames = 0;
  // A mounted globe used to run until the tab closed, which was right while
  // there was exactly one of them and it was the page. The store mounts a
  // second scene and leaves it, and a hidden canvas still drawing is a
  // requestAnimationFrame loop painting something nobody can see for as long
  // as the tab is open. `stop()` below is the way out; every frame checks it.
  let stopped = false;
  let frameMs = 0, frameWorst = 0;  // smoothed and worst frame time, for debug()
  // The resolution governor. Danny's Mac hides every sin; a member's
  // Chromebook or phone renders the same 2,000 notes on a fraction of the
  // GPU, and fill rate is what buries them — a retina canvas is 4x the
  // pixels of a plain one. So the globe governs itself with the frame-time
  // instrument: sustained slow frames step the render scale down a notch
  // (floor 1, never blurrier than CSS pixels), a long stretch of easy ones
  // steps it back up toward native. Every size in the file multiplies o.dpr,
  // so one knob scales the whole drawing consistently.
  const nativeDpr = o.dpr;
  let govHot = 0, govCool = 0;
  // TWO reasons to yield the frames, one flag each, OR'd into the one the draw
  // loop reads (#192). The composer's focus and blur own the first; the
  // governor owns the second, and on a 1x display it is the only knob it has
  // left. A single variable could not tell a blur from a release: whichever
  // handler ran last won, and on the machines that complain that was the blur.
  let easyFocus = false, easyGov = false;
  let easyOn = false;
  function setEasy() { easyOn = easyFocus || easyGov; }
  function governDpr() {
    const was = o.dpr;
    const next = governStep({ hot: govHot, cool: govCool, dpr: was, easy: easyGov }, frameMs, nativeDpr);
    govHot = next.hot; govCool = next.cool;
    if (next.dpr !== was || next.easy !== easyGov) frameMs = 20;  // re-measure honestly
    if (next.dpr !== was) { o.dpr = next.dpr; box = size(); proj = []; }
    if (next.easy !== easyGov) { easyGov = next.easy; setEasy(); }
  }
  let proj = [];
  // the painter's order, kept between frames (see `drawn` in the frame)
  let drawnBuf = null, drawnSrc = null;
  let zoom = 0;
  // Where on the sphere the viewer is actually looking. Standing near the
  // surface puts the centre below the canvas, so the visible band is up on the
  // shoulder rather than dead front. Aiming a turn at the front would park the
  // cluster off-screen underneath, which is what happened the first time.
  let face = { x: 0, y: 0, z: 1 };
  let userZoom = 1;      // what the wheel has asked for
  let dragging = null;   // the last pointer position while turning by hand
  let coast = null;      // a released drag still turning (o.inertia only)
  let idleAt = 0;        // when the hands last moved, for fading the controls
  // A held node: centred, its own links drawn, and the world almost stopped
  // around it. Reading is not something to do on a moving platform.
  let selected = null;
  // In the sidebar only the pieces in play can be clicked. The rest of the
  // sphere is there to be felt, not browsed: somebody mid-sentence does not
  // want to discover they have opened a note from March. The full view is
  // where everything becomes reachable.
  // SCULPTURES: node art standing in this world (id -> { at, front, alt,
  // size, art, alpha, amount }). See `sculpture()` and the pass in the frame.
  const sculpts = new Map();
  let sPool = null;          // reused per-frame point arrays, grown as needed
  // IN HAND, EASED: how far each home's piece is presented (0 honest, 1 in
  // hand), keyed by its home so the same piece eases out as it is released
  // even though the globe then holds it under a different id
  const sPresent = new Map();
  let sPresentAt = 0;
  let sScratch = null;       // per-piece projected nodes, for its lines
  let hover = null;  // The captioned land, PER GLOBE. These lived at module scope for one build
  // and the rail's globe and the full view's globe — two mounted instances —
  // overwrote each other's answer every frame, so the name flickered and then
  // stopped appearing at all. Anything eased toward a target belongs to the
  // instance doing the easing.
  let landCap = '';
  let landCapAlpha = 0;
  let landCapTone = null;
  let landCapSlug = null;
  // Which land the chat on screen is WORKING in, or null. Handed in by the
  // page (workingLand), never inferred here: the globe cannot see a tab, and a
  // renderer guessing at conversation state is how two surfaces start
  // disagreeing about whether anything is happening. Dan, 2026-09-04.
  let workLand = null;

  // The land names wait to be wanted. At rest they are absent entirely; the
  // pointer entering the globe is the wanting, and they breathe in rather
  // than pop (Danny, 2026-08-31: present while you mouse around, invisible
  // while you read). The member's OWN land - the one in hand - stays named
  // regardless, because grabbing it was the asking.
  let picked = null;
  let released = null;
  // pressing bare sphere, which is how somebody says "not this" to whatever
  // currently owns the view
  let empty = null;
  let opened = null;   // a double press: give this node the whole surface
  // a press on the COURSE's own fine grain: a station or a waypoint, which is a
  // checkbox in somebody's tracker and has no note to open
  let marked = null;

  // ── the region shimmer (Dan, 2026-09-03) ──────────────────────────────────
  // Clicking a region in the rail lights every note in it, and the lit register
  // draws a node at 4.2px times its weight — which at a region's worth of notes
  // is a wall of fat dots, "way too large and a little overwhelming". So the
  // region view has its own register: the same colours, the same relative
  // sizes, scaled right down, and the life put back in as motion instead of
  // area.
  //
  // The motion is the WORDMARK'S, not a second invention. Same share of nodes
  // per wave, same wave length, same peak, same glow share as nodetype.js's
  // sparkleIn() and ribbon.css's al-twinkle, so the mark in the corner and the
  // sphere in the rail are visibly one gesture. Change a number there and
  // change it here; they are quoted from that file on purpose.
  // A LEVEL rather than a switch, and that is the whole of Dan's 2026-09-03
  // correction. Turning it off outright dropped the shrink in a single frame,
  // so every note in the region jumped from 0.46 to full size at the exact
  // moment the member reached for something else: the gesture that means "calm
  // down" was the one that made the sphere shout. It ramps both ways now, and
  // it leaves more slowly than it arrives, because a shimmer that stops dead
  // reads as a bug and one that thins out reads as an answer.
  //
  // `sparkSet` is held through the fade and is deliberately NOT the lit set:
  // letting go of a region empties `lit` immediately (which is what un-blurs
  // the rest of the globe), and if the twinkle were gated on `lit` the fade
  // would have nothing left to play over and would vanish on the same frame.
  let sparkAt = 0;              // when this shimmer began, for the wave clock
  let sparkWant = 0;            // 1 while it is wanted, 0 while it is leaving
  let sparkLevel = 0;           // 0..1, eased — what is actually drawn
  let sparkSet = null;          // the ids it plays over, kept through the fade
  // The three timings were quoted from nodetype.js and ribbon.css so the mark
  // in the corner and the sphere in the rail would be one gesture. They are
  // now the same gesture RUN FASTER, at 0.66x of the wordmark's clock, and all
  // three moved together on purpose (Dan, 2026-09-03: "a little faster").
  //
  // Moving them together is what keeps the shimmer continuous. `sparkOf` looks
  // back three waves, which is only enough if a twinkle cannot outlive them:
  // the longest a node can still be lit is SPREAD + LIFE, and that has to stay
  // under 3 x WAVE. It was 1600 against 2100; it is 1060 against 1380. Change
  // one of these alone and the tail of the shimmer starts getting clipped, in
  // a way that reads as nodes blinking out rather than settling.
  // DERIVED, never typed: the shimmer size is pinned to the RESTING size and
  // the lit size moves independently of both, so this share has to follow them
  // rather than be a third number free to disagree with either.
  const SPARK_SHRINK = NODE_SPARK_R / NODE_LIT_R;
  const SPARK_WAVE = 460;       // ms between waves (nodetype WAVE_MS x 0.66)
  const SPARK_LIFE = 460;       // ms one twinkle lasts (ribbon .al-tw x 0.66)
  const SPARK_SHARE = 0.16;     // share of nodes a wave picks (nodetype 0.16)
  const SPARK_GLOW = 0.3;       // share of THOSE that also shine (TWINKLE_GLOW)
  const SPARK_SPREAD = 600;     // per-node delay spread (nodetype 0.9s x 0.66)
  const SPARK_PEAK = 0.75;      // grows to 1.75x (ribbon al-twinkle scale(1.75))
  // Deterministic per node per wave, so a node's twinkle does not jump when the
  // ball turns and nothing has to be stored per frame. Hashing the id every
  // frame would be hundreds of string walks a frame; the id is hashed once into
  // `_sk` and everything after that is arithmetic.
  function sparkSeed(n) {
    if (n._sk != null) return n._sk;
    let h = 2166136261;
    const s = String(n.id);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    n._sk = (h >>> 0) % 100000;
    return n._sk;
  }
  function sparkRand(seed, w, k) {
    const x = Math.sin(seed * 0.0129898 + w * 78.233 + k * 37.719) * 43758.5453;
    return x - Math.floor(x);
  }
  // ── anything else moving puts the shimmer down (Dan, 2026-09-03) ──────────
  // "The shimmer should only be there after the user clicks on a region in the
  // left sidebar, and if there's movement elsewhere on the globe for any reason
  // — whether that is the user manipulating the globe or clicking other nodes
  // or the agent reading, writing, anything — that shimmer should ease away."
  //
  // That is a rule about CAUSE, not about a list of gestures, so it is hung on
  // the renderer's own doors rather than on the callers that use them. Chasing
  // call sites is exactly how this gets missed: the camera scheduler alone
  // reaches the globe through land(), preview() and frame(); a write arrives
  // through pulse() and writing(); a member's hands come in through whole() and
  // the drag handler; and the next route in would be added by somebody who
  // never read this comment.
  //
  // So every door drops it, and the ONE caller that wants it says so afterwards
  // by calling sparkle(true) LAST. That ordering is the whole contract, and it
  // is why the region path sets its focus and its lead node before it asks for
  // the shimmer rather than after.
  //
  // It sets the WANT to zero rather than the level, so this is always the ease
  // rather than a cut.
  function stirred() { sparkWant = 0; }
  // How bright this node is in the shimmer right now, 0 to 1, and whether it is
  // one of the few carrying a halo. Three waves are consulted because the delay
  // spread (900ms) plus the life (700ms) outruns the wave interval (700ms), so
  // a twinkle started two waves ago can still be running. The brightest wins,
  // which is what makes overlapping waves read as one continuous shimmer rather
  // than as a node restarting.
  function sparkOf(n, now) {
    if (!sparkAt) return null;
    const seed = sparkSeed(n);
    const w0 = Math.floor((now - sparkAt) / SPARK_WAVE);
    let best = 0, halo = false;
    for (let k = 0; k < 3; k++) {
      const w = w0 - k;
      if (w < 0) continue;
      if (sparkRand(seed, w, 0) >= SPARK_SHARE) continue;
      const start = sparkAt + w * SPARK_WAVE + sparkRand(seed, w, 1) * SPARK_SPREAD;
      const t = (now - start) / SPARK_LIFE;
      if (t <= 0 || t >= 1) continue;
      const amp = Math.sin(Math.PI * t);   // 0 → 1 → 0, the ease-in-out curve
      if (amp > best) { best = amp; halo = sparkRand(seed, w, 2) < SPARK_GLOW; }
    }
    return best > 0 ? { amp: best, halo: halo } : null;
  }

  // 0 to 1: how far open the lens is. Eased rather than switched, because the
  // point of the gesture is that the room leans toward what you are doing
  // instead of cutting to a different room.
  let grav = 0;
  let gravAt = null;   // middle of the focused group, before any rotation
  // Which note gravAt is actually pointing at, when it is pointing at one. Only
  // debug() reads it, and it earns its keep there: "did the camera land on the
  // thing it aimed at" is unanswerable from the lit set, because the first lit
  // node in the projection is usually NOT the one that was aimed at, and the
  // wrong node's coordinates look exactly like a broken aim.
  let aimId = null;
  const lens = (at) => magnify(at, gravAt, grav, o);
  // The radius a lit mark is actually DRAWN at: the lens lift first, then the
  // note's own height. solveFace takes this as `rad` for one reason — aiming at
  // the surface and then drawing the mark above it walks the target off the
  // frame, silently, and every camera in here has made that mistake at least
  // once. Solved at a fully open lens (amount 1) rather than today's `grav`,
  // because the aim is for where the camera SETTLES, not where it is now.
  const drawnRadius = (at, depth) => {
    const v = magnify(normalise(at), gravAt, 1, o);
    const a = 1 + o.tall * (depth || 0);
    return Math.hypot(v.x * a, v.y * a, v.z * a);
  };
  // the framing, kept apart from userZoom so the wheel and the conversation are
  // not fighting over one number
  let fit = 1, fitWant = 1, fitAngle = 0, fitKey = '';
  // A layer that stages its own entrance (a repository world flying in) asks
  // for the next frame to land on the framing outright, so the sphere it
  // placed is the sphere that stays rather than one still easing toward it.
  // a shared world starts at its fitted frame (o.settled): its first frame
  // already has the zoom and the fit it would ease into, so nothing catches the ease
  let settleNext = !!o.settled;
  // the rendered limb, kept across frames until the radius or palette moves
  let limbLayer = null;
  // Standing right back to see the whole ball. A view rather than a state: it
  // does not change what is lit, what is held, or where anything is.
  //
  // It is where the globe STARTS now (Dan, 2026-08-23). The surface was the
  // old default and it shows a horizon and a handful of notes, which is a
  // detail before anybody has been shown the thing the detail belongs to. The
  // whole ball says "this is all of it, and it is yours" in one look, and then
  // clicking a region is the move that earns the close-up.
  let whole = o.whole == null ? true : !!o.whole;

  // How far back the camera is allowed to stand. 0.55 was the surface camera's
  // own limit and it is kept, but a COURSE can be wider than the surface camera
  // can show: the aim that centres a patch sits about 27 degrees up the
  // shoulder, and the horizon eats what is more than about 35 degrees beyond
  // it, so a route spanning more than roughly 70 degrees cannot be framed
  // without leaving the surface. Two of Dan's five courses are that wide, and
  // at a hard 0.55 floor they simply hung off the canvas. A region keeps the
  // surface because a region is ground you are standing near; a course is a
  // line you want whole, so it may walk backwards until the whole line is in
  // view, and the furthest that can ever mean is the whole ball. Never ABOVE
  // 0.55, so nothing that fits the surface camera today moves.
  // How far back the camera may ever stand. On the flown surface (1.1) the
  // horizon has a say as well: never far enough for the limb to close inside
  // the frame. `Math.max`, so this only ever holds the camera IN — a floor that
  // could lower the existing one would be a licence, not a floor.
  //
  // TWO FLOORS, AND THE FLOWN ONE YIELDS (13.5). The flown floor exists to stop
  // the camera standing back for NO REASON — a short course would otherwise
  // frame itself tight and leave the whole ball closed inside the frame, which
  // turns the chart into the ledger's marble at four times the size. It was
  // never meant to stop the camera standing back for a reason, and on a sparse
  // vault it does exactly that: three landfalls spread very wide, the course
  // runs 95px off the right edge, and `applyAim`'s step-back cannot move
  // because it is already sitting on this floor. Measured on the 12.1 fixture,
  // 1080x1069: `flownFloor` returns 0.6619 and the settled `userZoom` was
  // 0.6619 — the same signature 1R.6 read the first time this camera was
  // pinned. 1.1's own note lists this as one of the three ways out.
  // So the hard floor is the whole ball (`base`) and the flown floor is a
  // preference on top of it. `hard: true` is passed by the one caller that has
  // OBSERVED the course leaving the frame; everything else still gets the
  // higher floor, so a course that frames correctly today cannot move.
  const zoomFloor = (hard) => {
    const base = Math.min(0.55, wholeFit(canvas.width, canvas.height, o));
    if (hard || !(claim && claim.flown)) return base;
    return Math.max(base, flownFloor(canvas.width, canvas.height, o));
  };

  function size() {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * o.dpr));
    canvas.height = Math.max(1, Math.round(r.height * o.dpr));
    return r;
  }
  let box = size();

  function frame(now) {
    frames++;
    // capped well above the resting gaps (restGap) so a slow-drawn drift keeps
    // its speed, and still low enough that a tab coming back is not a lurch
    const dt = last ? Math.min(0.2, (now - last) / 1000) : 0;
    last = now;
    // Before the drawing, so a resolution step lands on THIS frame. After it,
    // the canvas resize that a step performs would clear what was just drawn
    // and the member would see the flash. And never while the composer holds
    // easy mode: the glow is off then by design, so what those frames cost is
    // no evidence about the device at rest.
    // Nor while a push's beams are up (Dan, 2026-10-05: "after the push
    // animation is complete, the globe kind of jutters"). A few seconds of
    // spectacle is the frame's choice, not the device's limit, and judging the
    // device by it latched easy mode, which holds for the mount: the globe went
    // on turning at half its frames long after the beams had settled.
    if (!easyFocus && !sends.size) governDpr();

    if (turn) {
      // per-turn duration, because a visit to one newborn note is a swoop and
      // the survey turn is a voyage; they should not share a clock
      const t = easeOutExpo((now - turn.start) / (turn.ms || o.turnMs));
      orient = slerp(turn.from, turn.to, t);
      if (t >= 1) turn = null;
    } else {
      // it never fully stops: a still globe reads as a picture. But while a
      // node is being read it slows to a drift, because text on a turning
      // surface is text you stop trusting yourself to have read.
      const rate = o.idleRate * (selected ? o.slow : 1);
      // About the world's vertical when the whole ball is the subject, about
      // the region itself the moment one is. Holding a place is the same
      // motion as turning the world, pointed at a different axis.
      const axis = (lit.size && gravAt) ? orbitAxis(orient, gravAt) : { x: 0, y: 1, z: 0 };
      orient = qmul(axisAngle(axis, rate * dt), orient);
    }
    // a flicked world coasts to rest (o.inertia, shared-world 1.8)
    if (o.inertia && coast) {
      const ms = dt * 1000;
      orient = dragTurn(orient, coast.vx * ms, coast.vy * ms, dragGain(claim, userZoom));
      coast = inertiaStep(coast, ms);
      if (!coast.vx && !coast.vy) coast = null;
      idleAt = now;
    }

    const w = canvas.width, h = canvas.height;
    // zoom follows the same curve as the turn, so leaning in and turning are
    // one gesture rather than two things happening near each other
    //
    // A live route counts as holding something, even when NOTHING is lit. Two
    // of Dan's five courses have no landfall at any stop, so their whole voyage
    // is out at sea and the lit set is empty: keyed on `lit.size` alone the
    // camera fell back to idle underneath a route it was actively drawing, and
    // the framing solved for one camera while another one drew.
    const holding = lit.size || (claim && claim.count);
    const target = (holding || whole) ? 1 : 0;
    zoom += (target - zoom) * Math.min(1, dt * 2.2);
    grav += (((holding && gravAt) ? 1 : 0) - grav) * Math.min(1, dt * 3.0);
    // The shimmer's ramp, on the same clock as the lens. A course outranks it,
    // and that is asked HERE rather than at the moment a region is clicked, so
    // a route arriving late thins the shimmer out instead of cutting it.
    // Asymmetric on purpose: 3.4 in, 1.6 out. Arriving wants to feel like an
    // answer to the click; leaving wants to feel like the room settling.
    const sparkTarget = claim ? 0 : sparkWant;
    sparkLevel += (sparkTarget - sparkLevel) * Math.min(1, dt * (sparkTarget ? 3.4 : 1.6));
    // Below a fortieth it is invisible, so stop paying for it and let go of the
    // id set it was playing over. Only on the way OUT: snapping to zero while
    // something still wants it would kill the shimmer the frame it began.
    if (!sparkTarget && sparkLevel < 0.025) { sparkLevel = 0; sparkAt = 0; sparkSet = null; }
    // How far back to stand so the whole patch in focus is inside the frame.
    // Recomputed only when the patch or the panel changes, because it nests a
    // bisection inside a bisection and this runs sixty times a second.
    if (fitKey !== fitAngle + ':' + w + ':' + h + ':' + whole) {
      fitKey = fitAngle + ':' + w + ':' + h + ':' + whole;
      fitWant = whole ? wholeFit(w, h, o) : (fitAngle ? fitZoom(fitAngle, w, h, o) : 1);
    }
    fit += (fitWant - fit) * (o.snap ? 1 : Math.min(1, dt * 2.2));
    if (settleNext) { settleNext = false; zoom = target; fit = fitWant; }
    easing = Math.abs(target - zoom) > 0.002 || Math.abs(fitWant - fit) > 0.002 * (fitWant || 1)
      || Math.abs((((holding && gravAt) ? 1 : 0)) - grav) > 0.002 || Math.abs(sparkTarget - sparkLevel) > 0.01;
    const R = Math.min(w, h) * (o.idleR + (o.focusR - o.idleR) * zoom) * userZoom * fit * o.sphere;
    const camZ = o.idleCam + (o.focusCam - o.idleCam) * zoom;
    // Pinning the CENTRE and growing the radius pushes the horizon off the top
    // the moment you zoom. Pinning the horizon instead and letting the centre
    // fall away keeps the arc exactly where it was: zooming reads as walking
    // toward the surface rather than as the picture sliding.
    const cx = w * o.cxFrac, cy = h * o.arcTop + R;
    // The camera this frame, kept for `screenOfPoint`. The renderer does not
    // read it; it exists so a caller laying DOM over the canvas can ask where
    // an arbitrary point of the sphere is being drawn, the way `screenOf`
    // already answers that for a node. Written here rather than recomputed
    // there so the answer can never disagree with the picture.
    lastCam = { R: R, camZ: camZ, cx: cx, cy: cy };
    face = solveFace(R, h, camZ, o.arcTop);
    ctx.clearRect(0, 0, w, h);
    if ((DESK_SHADOW || DESK_RINGS) && R > 110 * o.dpr) drawDesk(cx, cy, R);

    // the ghost volume: a body that occludes the far side without drawing one
    const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
    g.addColorStop(0, tok('--globe-core', 'rgba(43,43,98,.55)'));
    g.addColorStop(0.65, tok('--globe-mid', 'rgba(23,23,66,.5)'));
    g.addColorStop(1, tok('--globe-edge', 'rgba(10,10,36,.55)'));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    if (MARBLE > 0) drawMarble(cx, cy, R, camZ);

    // The air above the limb. Without it the sphere ends at a mathematically
    // perfect circle, which is the single strongest tell that a canvas has
    // been pasted over a page rather than belonging to it. Off by default:
    // the vault globe fills its panel and has no page showing around it.
    //
    // THREE LAYERS. The body above is the first and stays dark. The second is
    // the grazing light just inside the surface, a few pixels that show the
    // curvature where the environment's light reaches the edge. The third is
    // the scatter just outside it, fainter and a little wider, dying into the
    // store's own sky. Their thickness is LIMB_IN and LIMB_OUT in screen
    // pixels (see buildLimb), which is what stops the rim growing into a
    // second circle as the sphere grows; and their direction is the conic in
    // LIMB_LIGHT, so a stretch of the edge catches light and the rest is
    // allowed to go dark. Both are baked into one layer, rebuilt only when
    // the radius or the palette moves. The light lives in screen space, so a
    // drag turns the world under it, which is right: the store is lighting
    // the globe.
    //
    // THE ATMOSPHERE MUST DIE INSIDE ITS OWN CANVAS, and getting that wrong is
    // how an earlier pass put a seam down the store hero: a soft glow cut flat
    // down 825px of height is a straight vertical line however faint it is. So
    // the reach is the smaller of what the limb wants and the room it HAS on
    // the left and top. The right and the bottom are left out of that measure:
    // this globe is composed to run off both (the hero's own crop, panels.css),
    // and a crop at the frame's edge is the crop we asked for. The bottom
    // joined the right on 2026-09-18, when the hero came down to the visible
    // viewport and the sphere was scaled back up through it; a guard that
    // asked for room below drew no limb at all. With no room on the left or
    // top it draws nothing rather than a hard ring.
    if (o.halo > 0) {
      const lin = Math.min(LIMB_IN * o.dpr, R * 0.06);
      const lout = Math.min(LIMB_OUT * o.dpr, R * 0.2);
      const reach = Math.min(R + lout, cx, cy);
      if (reach > R + 3 * o.dpr) {
        const rim = tok('--globe-limb', tok('--globe-rim', 'rgba(150,175,255,.22)'));
        const warm = tok('--globe-limb-warm', rim);
        const deep = tok('--globe-limb-deep', rim);
        const key = Math.round(R) + '|' + Math.round(reach) + '|' + Math.round(lin) + '|' + rim + warm + deep;
        if (!limbLayer || limbLayer.key !== key) limbLayer = buildLimb(R, R - lin, reach, rim, warm, deep, key);
        ctx.save();
        ctx.globalAlpha = o.halo;
        ctx.drawImage(limbLayer.c, cx - limbLayer.half, cy - limbLayer.half, limbLayer.full, limbLayer.full);
        ctx.restore();
      }
    }

    // reused across frames: 700 object literals per frame per canvas is the
    // kind of waste that only shows up on somebody else's laptop
    if (proj.length !== nodes.length) {
      proj = nodes.map(() => ({ n: null, x: 0, y: 0, z: 0, p: 1, r: 0, gx: 0, gy: 0 }));
    }
    const lensing = grav > 0.002 && gravAt;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      // in transit, the position is time-resolved; settled, it is n.at and
      // costs one Map.get. Time-based, so easy mode's skipped frames only
      // skip renders of the glide, never the glide itself
      const at = transits.size ? transitPos(n, now) : n.at;
      // ── the sea-art seams (hard rule 1; 3D brief Parts B and E) ──────────
      // One lookup per node per frame, null for almost every node in every
      // frame. Position replaces `at` BEFORE rotate() so the painter sort,
      // hover, labels and hit-testing all follow the picture automatically;
      // altitude joins depth's own term so the stalk and the camera treat art
      // height as height. n.at itself is never written.
      const art = artist ? artist(n, now) : null;
      const atP = art && art.at ? art.at : at;
      const ground = rotate(orient, lensing && lit.has(n.id) ? lens(atP) : atP);
      const up = riseOf(n.id, n.id === forge || n.id === held || !!(settle && settle.id === n.id && now - settle.at < WRITE_MS), now);
      const alt = 1 + o.tall * (n.depth == null ? 0 : n.depth) + (art ? art.altitude : 0) + up * WRITE_RISE;
      const v = { x: ground.x * alt, y: ground.y * alt, z: ground.z * alt };
      const q = project(v, R * 0.9, cx, cy, camZ);
      const g = project(ground, R * 0.9, cx, cy, camZ);
      const d = proj[i];
      d.n = n; d.x = q.x; d.y = q.y; d.z = q.z; d.p = q.p;
      d.gx = g.x; d.gy = g.y; d.art = art; d.up = up;
      // How squarely this note is being faced, as a true cosine. NOT `d.z`,
      // which is the same number multiplied by the node's own height (depth
      // plus any art altitude) and so runs past 1 for a tall note standing at
      // the middle of the view. This is the point-sized version of exactly what
      // the coastlines measure with `gz / glen`, normalised the same way so the
      // lens lifting a lit node cannot inflate it either.
      const glen = Math.hypot(ground.x, ground.y, ground.z) || 1;
      d.f = ground.z / glen;
    }
    // painter: far side first. Kept from the last frame and insertion-sorted,
    // because a turning ball barely reorders its 2,000 notes between frames:
    // nearly sorted is linear, where a fresh copy and a full sort every frame
    // was a twentieth of the main thread (2026-10-10, profiled).
    if (drawnSrc !== proj || drawnBuf.length !== proj.length) { drawnBuf = proj.slice(); drawnSrc = proj; }
    for (let k = 1; k < drawnBuf.length; k++) {
      const it = drawnBuf[k], z = it.z;
      let m = k - 1;
      while (m >= 0 && drawnBuf[m].z > z) { drawnBuf[m + 1] = drawnBuf[m]; m--; }
      drawnBuf[m + 1] = it;
    }
    const drawn = drawnBuf.slice();  // a copy: insideBall below may drop from it
    // NOTHING DRAWS OUTSIDE THE BALL (shared-world 2.6). The ball is filled as
    // a disc of radius R, but the sphere is projected at 0.9R from a camera
    // about two radii away, so its true outline runs to about 1.05R: a land low
    // on the FACING side (facing 0.3 to 0.7, measured) is drawn past the disc,
    // its lights loose on the sky. No facing cut catches that without hiding
    // half the face, so `insideBall` tests where a node actually lands: one
    // drawn beyond the disc is dropped from the list every node pass reads.
    // The dashboard never passes it; its zoomed horizon is off-screen anyway.
    if (o.insideBall) for (let k = drawn.length - 1; k >= 0; k--) if (Math.hypot(drawn[k].x - cx, drawn[k].y - cy) > R) drawn.splice(k, 1);

    // ── the resting web ─────────────────────────────────────────────────
    // A node's own `links` are drawn on selection and on hover and at no other
    // time, which is right for a vault: six hundred notes joined at rest is a
    // hairball. It is wrong for an atlas of eight formations, where the trace
    // between two points is the thing that makes them ONE shape rather than
    // two specks that happen to be near each other.
    //
    // Drawn here, under the dots and over the sphere, in the painter's own
    // order so the far side's threads pass behind the near side's. Depth-aware:
    // a trace fades as its shallower end turns toward the limb and is gone
    // before it reaches the far side, so a formation disappears around the
    // curve as a whole rather than leaving its wiring behind.
    if (o.web > 0) {
      const byId = new Map();
      for (const d of proj) byId.set(d.n.id, d);
      ctx.lineCap = 'round';
      for (const d of drawn) {
        const ls = d.n.links;
        if (!ls || !ls.length) continue;
        for (const other of ls) {
          const e = byId.get(other);
          if (!e) continue;
          // the dimmer end governs: a trace is only as present as its far foot
          const face = Math.min(d.f, e.f);
          if (face <= WEB_LIMB) continue;
          const t = Math.min(1, (face - WEB_LIMB) / (1 - WEB_LIMB));
          ctx.globalAlpha = o.web * (WEB_FLOOR + (1 - WEB_FLOOR) * t * t);
          ctx.strokeStyle = KIND[d.n.kind] || KIND.plan;
          ctx.lineWidth = Math.max(1, 1.15 * o.dpr * (0.55 + 0.45 * t));
          ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(e.x, e.y); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.lineCap = 'butt';
    }

    // the cluster's threads, drawn under its points. One hub, spokes out to the
    // rest: every-pair turns into a hairball the moment a cluster has more than
    // about six things in it, and the hub is the piece being written, which is
    // the thing the member is actually looking for
    //
    // NOT while a course owns the view. Dan, 2026-08-23: in a course "we
    // needn't be distracted by connector lines to other non pictured nodes
    // that aren't part of the course being viewed (or to out of sequence nodes
    // within the course)". The hub bundle is exactly that second thing: it
    // joins the hub to every other lit node at once, so on a course it drew a
    // fan across the stops in no order at all, arguing with the route running
    // through the same points in the right one. The route IS the connection
    // here, and one drawing of it is enough.
    const front = (claim && claim.only) ? []
      : drawn.filter((d) => lit.has(d.n.id) && d.z > -0.2);
    const hub = front.find((d) => d.n.id === writing) || front[front.length - 1];
    if (hub) {
      ctx.lineWidth = 1 * o.dpr;
      ctx.strokeStyle = (KIND[hub.n.kind] || KIND.plan) + '4d';
      ctx.beginPath();
      for (const d of front) {
        if (d === hub) continue;
        ctx.moveTo(hub.x, hub.y); ctx.lineTo(d.x, d.y);
      }
      ctx.stroke();
    }

    // ── the coastlines ──────────────────────────────────────────────────
    // Under the notes and over the sphere, so a region reads as ground the
    // notes are standing on rather than as a ring drawn around them.
    //
    // Regions are allowed to overlap. Dan, 2026-08-23: "it's fine if regions
    // overlap a bit, I think that's kind of the point." He is right, and it is
    // why no coast is clipped against its neighbours: where two coasts cross,
    // that is work that genuinely belongs to both, and the map saying so is
    // more useful than a tidy border that says nothing.
    let coastIdx = -1;
    // Each land's name, gathered as its coast is drawn and set down after all
    // of them, so a name can never land on top of a neighbour's coastline.
    // An exponential approach rather than a clock: frame-rate independent
    // enough at this size, and it settles instead of arriving.
    // (the hover ease that used to reveal every name at once retired with
    // them: the caption follows the camera now, not the pointer)
    // The sphere's one heartbeat. Declared up here rather than beside the node
    // loop because the land caption's busy dot rides it too, and one clock
    // shared is the whole point: two sine waves at nearly the same period beat
    // against each other and read as a fault rather than as a pulse.
    const breath = 0.5 + 0.5 * Math.sin(now / 900);
    const named = [];
    for (const coast of coasts) {
      coastIdx++;
      // act two of draw-the-map: a freshly declared coast draws itself point
      // by point, one land after the next, instead of blinking in finished.
      // frac is how much of the pen stroke has happened; 1 means done, and
      // when every coast is done the reveal retires itself. Reduced motion
      // skips straight to the finished map.
      let frac = 1;
      if (coastReveal && !calm) {
        const t = (now - coastReveal - coastIdx * COAST_STAGGER_MS) / COAST_DRAW_MS;
        if (t <= 0) continue;              // this land's turn has not come yet
        frac = t >= 1 ? 1 : easeOutQuint(t);
        if (coastIdx === coasts.length - 1 && t >= 1) coastReveal = null;
      }
      const on = coastLit === coast.slug;
      const pts = [];
      let anyFront = false;
      // the mean of the outline's rotated vectors: the land's own direction,
      // which is what "how close the camera is to it" actually means on a ball
      let gx = 0, gy = 0, gz = 0;
      for (const d of coast.loop) {
        const ground = rotate(orient, lensing && coast.slug === coastLit ? lens(d) : d);
        const q = project(ground, R * 0.9, cx, cy, camZ);
        // NO COAST PAST THE BALL either (shared-world backlog, 2026-10-10): the
        // same projection that put a rim land's lights on the sky ran its coast
        // a few pixels past the disc. With `insideBall` a point beyond the disc
        // is drawn on its edge instead, and the strokes below are clipped to it
        if (o.insideBall) {
          const dx = q.x - cx, dy = q.y - cy, r = Math.hypot(dx, dy);
          if (r > R) { q.x = cx + dx * R / r; q.y = cy + dy * R / r; }
        }
        pts.push({ x: q.x, y: q.y, z: ground.z });
        gx += ground.x; gy += ground.y; gz += ground.z;
        if (ground.z > 0) anyFront = true;
      }
      if (!anyFront) continue;   // wholly round the back
      const glen = Math.hypot(gx, gy, gz) || 1;
      const near = nearness(gz / glen);
      const vib = on ? 1 : Math.pow(near, LAND_VIB_POW);
      // Drawn in runs of front-facing points rather than as one closed path.
      // A coast that crosses the horizon would otherwise get a chord ruled
      // straight across the face of the globe, which is the single most
      // obvious way a sphere stops looking like one.
      // Each region strokes in its own colour, the same one the rail puts in a
      // dot beside its row, so pointing at a row and recognising a coastline
      // are the same act. The colour is CARRIED on the coast (`tone`) rather
      // than recomputed here: the painter must not be able to disagree with
      // the rail about which land is which.
      //
      // Resting coasts sit low so eight of them read as terrain rather than as
      // eight competing claims; the one in hand goes to full strength and
      // gains the glow, which is what makes pointing legible.
      const land = typeof coast.tone === 'number'
        ? tok('--land-' + ((coast.tone % 8) + 1), null) : null;
      // the closeout swell: for one beat every coast rises to full strength
      // together and settles — the map saying it is finished. doneT runs 0→1
      // and the boost eases away with it.
      let swell = 0;
      if (completeAt && !calm) {
        const dt = (now - completeAt) / COMPLETE_MS;
        if (dt >= 1) completeAt = null;
        else swell = 1 - easeOutQuint(dt);
      }
      // Everything about a coastline now rides how squarely you are facing it,
      // and all four levers move together, because moving one of them was the
      // version Dan could not tell apart from no change (2026-09-02). Level,
      // opacity, weight and glow: dark, thin and flat out at the limb; the
      // token's own colour, thicker, and glowing at the middle of the view.
      // The hue never moves, only its level, so a coastline, its rail dot and
      // its caption dot stay recognisably the same land.
      ctx.lineWidth = ((on ? 1.7 : 0.8 + 1.4 * vib) + 0.9 * swell) * o.dpr;
      ctx.strokeStyle = land
        ? shade(land, on ? LAND_ON_SHADE : LAND_DARK_SHADE + (LAND_LIVE_SHADE - LAND_DARK_SHADE) * vib)
        : (on ? tok('--coast-on', 'rgba(233,236,255,.62)') : tok('--coast', 'rgba(233,236,255,.17)'));
      const lit = on ? 1 : 0.16 + 0.84 * vib;
      // `coastCalm` scales a RESTING coast back, and only a resting one: a
      // land in hand still answers at full strength, because that is what
      // makes pointing at it legible. Default 1, so nothing in the app moves.
      //
      // It exists for the public landing page, where one land fills a third of
      // a 900px sphere and the four levers above put a glowing outline on the
      // screen louder than the page's only action. Inside the app the same
      // numbers are right: the globe is smaller, several lands share the face,
      // and a member is looking for their regions rather than reading a
      // headline beside them.
      // THE WORLD IS ATMOSPHERE, THE ROUTE IS INFORMATION (course pass,
      // 2026-09-25). While a course owns the full view the land in hand was
      // the brightest line on the screen, brighter than the route it carries.
      // Every coast steps back behind a course, the one in hand included; the
      // shapes stay, so the member still knows where on their world they are.
      const courseK = (claim && claim.only && (claim.flown || claim.mini)) ? 0.32 : 1;
      const calmK = (on ? 1 : (o.coastCalm == null ? 1 : o.coastCalm)) * courseK;
      ctx.globalAlpha = Math.min(1, ((land ? lit : 1)) + 0.45 * swell) * calmK;
      // a claim (named, still empty) is drawn as a survey line: dashed, and
      // fainter than a lived-in coast. The first three notes turn it solid.
      if (coast.claim) { ctx.setLineDash([4 * o.dpr, 5 * o.dpr]); ctx.globalAlpha *= 0.55; }
      // --coast-glow scales the halo per room: 1 in night, where a lit coast
      // on navy is the look, and well under that in the reading room, where
      // the same blur in a mineral hue read as a neon tube (2026-09-26).
      // THE HALO WITHOUT A BLUR (2026-10-10). This was `shadowBlur`, on every
      // coast, every frame, resting or not: a blur pass over each land's whole
      // bounding box, which the GPU pays and the frame-time governor never
      // sees, because the JS has returned long before the raster runs. Two
      // wide faint strokes of the same path under the line read as the same
      // light at no blur cost at all.
      const halo = ((on ? 8 : 9 * vib) * o.dpr + 14 * o.dpr * swell) * calmK * COAST_GLOW;
      const path = new Path2D();
      let drawing = false;
      // Mid-reveal the stroke stops at the pen: only the first frac of the
      // loop exists yet, and the wrap-around point (i === pts.length) is the
      // stroke closing, which only a finished coast has earned
      const penLimit = frac >= 1 ? pts.length : Math.floor(frac * pts.length) - 1;
      let pen = null;
      for (let i = 0; i <= penLimit; i++) {
        const p = pts[i % pts.length];
        if (p.z > 0.02) {
          if (drawing) path.lineTo(p.x, p.y); else { path.moveTo(p.x, p.y); drawing = true; }
          pen = p;
        } else drawing = false;
      }
      // (`insideBall`: the line's width and its halo end at the disc too; the
      // state set above is what restore returns to, so nothing after moves)
      if (o.insideBall) { ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip(); }
      if (halo > 0.5 * o.dpr) {
        const lw = ctx.lineWidth, ga = ctx.globalAlpha;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.lineWidth = lw + halo * 1.15; ctx.globalAlpha = ga * 0.11; ctx.stroke(path);
        ctx.lineWidth = lw + halo * 0.5;  ctx.globalAlpha = ga * 0.2;  ctx.stroke(path);
        ctx.lineWidth = lw; ctx.globalAlpha = ga;
        ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
      }
      ctx.stroke(path);
      if (o.insideBall) ctx.restore();
      ctx.setLineDash([]);
      // a shared world's land is a place, not an outline (o.landFill): its tone,
      // faint, and fainter as the land turns toward the rim
      if (o.landFill && land && frac >= 1) {
        const facing = Math.max(0, gz / glen);
        ctx.save();
        ctx.globalAlpha = o.landFill * facing;
        ctx.shadowBlur = 0;
        ctx.fillStyle = land;
        ctx.beginPath();
        let started = false;
        for (const p of pts) {
          if (p.z <= 0.02) continue;
          if (started) ctx.lineTo(p.x, p.y); else { ctx.moveTo(p.x, p.y); started = true; }
        }
        if (started) { ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
      // the pen's nib: a bright point riding the leading edge of the stroke
      if (frac < 1 && pen) {
        ctx.globalAlpha = 0.9;
        ctx.shadowBlur = 10 * o.dpr; ctx.shadowColor = ctx.strokeStyle;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.arc(pen.x, pen.y, 2.2 * o.dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      // act three, the finalizing glint: a soft point travels each coastline
      // while the long tail of the ritual works — the map being polished,
      // quieter than the nib and looping where the nib arrives once. Offset
      // per land so eight glints never march in step.
      if (finalizingOn && !calm && frac >= 1 && pts.length) {
        const gp = ((now - finalizingOn) / GLINT_MS + coastIdx / Math.max(1, coasts.length)) % 1;
        const g = pts[Math.floor(gp * pts.length) % pts.length];
        if (g.z > 0.02) {
          ctx.globalAlpha = 0.55;
          ctx.shadowBlur = 8 * o.dpr; ctx.shadowColor = ctx.strokeStyle;
          ctx.fillStyle = ctx.strokeStyle;
          ctx.beginPath();
          ctx.arc(g.x, g.y, 1.7 * o.dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.shadowBlur = 0;
      // A wash inside the one in hand, so the rail and the map are obviously
      // the same thing being pointed at. Only the region in hand gets it: a
      // filled every region is a quilt, and a quilt has no figure.
      // (never mid-reveal: a half-drawn loop closed and filled is a torn flag)
      if (on && frac >= 1 && !coast.claim) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = tok('--coast-fill', 'rgba(233,236,255,.06)');
        ctx.beginPath();
        let started = false;
        for (const p of pts) {
          if (p.z <= 0.02) continue;
          if (started) ctx.lineTo(p.x, p.y); else { ctx.moveTo(p.x, p.y); started = true; }
        }
        if (started) { ctx.closePath(); ctx.fill(); }
      }
      // The land's name, centred IN the land (Danny, 2026-08-31, after seeing
      // the offshore placement live: the name belongs to the territory, not
      // the sea beside it). Anchored on the centroid of the front-facing
      // points, which moves smoothly as the globe turns. The notes still
      // paint OVER the name — terrain lettering under the cities, exactly how
      // a paper map does it. Never mid-reveal: the pen has not finished the
      // land yet.
      // The name is COLLECTED here and drawn once, in the corner, after the
      // loop. Only the nearest land gets captioned, so the map never carries
      // eight words at once. A land in hand wins outright: pointing at a rail
      // row is a stronger statement of interest than the camera happening to
      // face somewhere.
      const label = frac >= 1 && (coast.name || coast.slug);
      if (label && (near > 0 || on)) {
        named.push({ text: label, tone: land, on: on, slug: coast.slug,
          rank: (on ? 2 : 0) + vib * (coast.claim ? 0.6 : 1) });
      }
    }
    // ── and the one name, in the corner ─────────────────────────────────
    // Upper right of the globe, one land at a time, cross-fading as the camera
    // turns. Dan, 2026-09-02. It is off the terrain entirely now, so it can
    // never sit on a note and the paint-order trick that used to keep it clear
    // is no longer load-bearing.
    //
    // The swap is two-stage on purpose: the outgoing name fades to nothing
    // BEFORE the incoming one is adopted, so two words never dissolve through
    // each other into an unreadable blend halfway between "Astrolabe" and
    // "Membership".
    {
      let best = null;
      // `nameCorner: false` turns the corner caption off for a caller that
      // writes the land names itself. The public landing page does: it stands
      // three of them ON the world in the rail's grammar, because a stranger
      // gets four seconds and one small word in a corner will not form the
      // sentence "this is a map of somebody's work" in that time. Inside the
      // app the corner is right and stays the default.
      if (o.nameCorner === false) named.length = 0;
      for (const nm of named) if (!best || nm.rank > best.rank) best = nm;
      const want = best && best.rank > 0.06 ? best.text : '';
      if (want !== landCap) {
        landCapAlpha += (0 - landCapAlpha) * 0.22;
        if (landCapAlpha < 0.05) {
          landCap = want;
          landCapTone = best ? best.tone : null;
          landCapSlug = best ? best.slug : null;
          landCapAlpha = 0;
        }
      } else {
        if (best) { landCapTone = best.tone; landCapSlug = best.slug; }
        const target = best ? Math.min(1, best.on ? 1 : best.rank) : 0;
        landCapAlpha += (target - landCapAlpha) * 0.16;
      }
      if (o.caption && landCap && landCapAlpha > 0.02) {
        const wasAlign = ctx.textAlign, wasBase = ctx.textBaseline, wasTrack = ctx.letterSpacing;
        const size = LAND_LABEL * o.dpr * o.captionScale;
        const pad = 12 * o.dpr * o.captionScale;
        ctx.font = size + 'px ' + tok('--data', 'monospace');
        // .12em, the tracking the CSS gives these labels. ctx.letterSpacing is
        // real where it exists and an ignored assignment where it is not, so an
        // older browser gets an untracked name rather than an error.
        ctx.letterSpacing = (size * 0.12).toFixed(2) + 'px';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        const t = fitText(ctx, String(landCap).toLowerCase(), w * 0.5);
        const y = pad + size;
        // The name brightens on the way in, the same as its coastline does.
        // Alpha alone was not enough to read as arriving: a dim grey at 90%
        // and a dim grey at 40% are the same dim grey. The LEVEL moves too,
        // from the quiet label colour out at the limb to the bright one when
        // the land's middle is in the middle of the view. Dan, 2026-09-02.
        ctx.globalAlpha = Math.min(1, 0.25 + 0.75 * landCapAlpha);
        // The corner is OFF the sphere, on the page itself, so on daybreak it
        // reads in ink rather than in the pale the lands wear on the sea; the
        // --land-cap pair is set there and unset in night, where the land
        // names already sit on dark. No glow on paper: a halo behind ink on
        // bone is a smudge. Dan, 2026-09-27.
        const capOn = tok('--land-cap-on', ''), onPaper = !!capOn;
        ctx.fillStyle = landCapAlpha > 0.72
          ? (capOn || tok('--land-lab-on', '#eef0ff'))
          : tok('--land-cap', tok('--land-lab', '#8f93b8'));
        // DRAWN ONCE, STAMPED AFTER (2026-10-10). A blurred fillText every
        // frame was 16% of the page's main thread while notes were read and
        // written (profiled on Dan's 1,955 notes): text shadows rasterize on
        // the CPU. The name, its ink and its glow (in whole-pixel steps) key a
        // small cache; the alpha is the stamp's, so a fade costs nothing.
        const capGlow = landCapTone || tok('--land-lab-on', '#eef0ff');
        const capBlur = onPaper ? 0 : Math.round(10 * Math.max(0, (landCapAlpha - 0.55) / 0.45)) * o.dpr;
        const capImg = capStamp(t, ctx.font, ctx.letterSpacing, ctx.fillStyle, capGlow, capBlur, size);
        if (capImg) ctx.drawImage(capImg.c, w - pad - capImg.right, y - capImg.base);
        else {
          ctx.shadowColor = capGlow; ctx.shadowBlur = capBlur;
          ctx.fillText(t, w - pad, y);
          ctx.shadowBlur = 0;
        }
        // A dot in the land's own colour, ahead of the name. The caption is off
        // the map now, so unlike the version that sat in its own territory it
        // has nothing around it to say WHICH land it belongs to; this is the
        // same dot-and-name the region menu and the rail already use.
        if (landCapTone) {
          // WORKING HERE: the chat on screen is running, and it is running in
          // this land. The dot goes to full colour, grows, and takes a real
          // halo. Dan, 2026-09-04, having just given the rail's dot the same
          // treatment: the two dots mean the same thing in two places and
          // should answer the same way.
          //
          // Level, size and glow together, which is the lesson the coastlines
          // already paid for on 2026-09-02: moving one of them alone reads as
          // no change at all.
          //
          // AND IT BREATHES, which the rail's dot deliberately does not (Dan,
          // 2026-09-04, ruling on each separately). The two are the same fact
          // in two places and the difference is the surface: the rail is a
          // list read PAST, where a pulse in the corner of the eye never
          // resolves, and this is a caption on a globe already full of motion,
          // where holding perfectly still is what would look wrong.
          //
          // On the sphere's own breath, the same clock the written-to node
          // uses, so the globe has one heartbeat rather than two nearly-equal
          // ones. Stilled at the midpoint under reduced motion.
          const hot = !!workLand && landCapSlug === workLand;
          const pulse = hot ? (calm ? 0.5 : breath) : 0;
          const tw = ctx.measureText(t).width;
          const capFill = shade(landCapTone, hot ? 1 : 0.45 + 0.55 * landCapAlpha);
          glowDisc(w - pad - tw - 7 * o.dpr * o.captionScale, y - size * 0.32,
            (2.2 + 0.8 * landCapAlpha) * (hot ? 1.36 + 0.28 * pulse : 1) * o.dpr * o.captionScale,
            (hot ? 11 + 7 * pulse : 8) * o.dpr * (hot ? Math.max(0.8, landCapAlpha) : landCapAlpha),
            landCapTone, capFill);
          ctx.fillStyle = capFill;
        }
        ctx.letterSpacing = wasTrack;
        ctx.textAlign = wasAlign;
        ctx.textBaseline = wasBase;
      }
    }
    ctx.globalAlpha = 1;

    // A course is a plan, so its stops read as one. Dan, 2026-08-23: "the node
    // colors for course nodes should probably be unified to the plan color,
    // since the course represents a plan so we have a unified look". The kind
    // of the note underneath is a true fact and the wrong one to be shouting
    // while somebody is reading a route: a course drawn half yellow and half
    // green looks like two things rather than one voyage. The colour comes back
    // the moment the course is put down.
    // AND THAT UNIFIED COLOUR IS NOW THE ANCHOR, NOT PLAN GREEN (13.6).
    //
    // This line is why "the phase nodes are green" survived making the phase
    // MARK blue, and it took a pixel scan to see: a stop is a note as well as a
    // point on a line, so two marks stand at that one place — the course's
    // interchange bead underneath and the node's own dot on top. Painting the
    // dot `KIND.plan` put green back in the middle of every blue phase, which
    // read as exactly the thing Dan reported, one layer up from where it was
    // fixed. A success in one renderer is not evidence about the picture.
    //
    // The reasoning that chose green still holds and points here now: the nodes
    // on a course should be ONE colour rather than half yellow and half green,
    // and the colour a phase is, is the anchor. The kind colour comes back the
    // moment the course is put down.
    // TWO colours now, not one, and they are the two the course marks use
    // (13.7): a stop is blue while its phase is unfinished and green once it is
    // done, so the dot agrees with the mark drawn around it instead of putting
    // a contradicting core in the middle of it. Still ONE vocabulary across the
    // whole route — the original reasoning, that a course drawn half yellow and
    // half green looks like two things rather than one voyage, is untouched.
    // The kind colour comes back the moment the course is put down.
    const courseCol = (claim && claim.only) ? tok('--course-anchor', '#8fa6ff') : null;
    const courseColDone = (claim && claim.only) ? (KIND.plan || '') : null;
    // the closeout's ring: one circle from the heart of the ball out past the
    // rim, fading as it goes — the beat that says the map is finished. Rides
    // the same clock as the coast swell and leaves with it.
    if (completeAt && !calm) {
      const dt = (now - completeAt) / COMPLETE_MS;
      if (dt > 0 && dt < 1) {
        const e = easeOutQuint(dt);
        ctx.globalAlpha = 0.5 * (1 - e);
        ctx.lineWidth = 1.6 * o.dpr;
        ctx.strokeStyle = tok('--coast-on', 'rgba(233,236,255,.62)');
        ctx.shadowBlur = 12 * o.dpr * (1 - e);
        ctx.shadowColor = ctx.strokeStyle;
        ctx.beginPath();
        ctx.arc(cx, cy, R * (0.15 + 0.95 * e), 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
    }
    // A layer's moment BENEATH the notes (see "the layer seam"). The frame's
    // own numbers are handed over once, so every pass reads the same camera
    // the core is drawing with rather than solving its own.
    const fe = (layerDraw.beneath.length || layerDraw.overlay.length)
      ? { now: now, w: w, h: h, R: R, camZ: camZ, cx: cx, cy: cy, lensing: lensing } : null;
    if (fe && layerDraw.beneath.length) runLayer('beneath', fe);
    // act one's beam: a soft trailing arc at the rim, so the survey reads as a
    // sweep even where there are no notes to catch it. Three segments fading
    // behind the leading edge — the same restraint as the coast stroke, and
    // the coast's own token, because the beam is reading the land, not adding
    // a new colour to the map
    if (surveyOn && !calm) {
      const sa = ((now - surveyOn) / 2600) % (Math.PI * 2) - Math.PI;
      ctx.lineWidth = 1.4 * o.dpr;
      ctx.strokeStyle = tok('--coast-on', 'rgba(233,236,255,.62)');
      for (let k = 0; k < 3; k++) {
        ctx.globalAlpha = 0.22 * (1 - k / 3);
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.93, sa - 0.16 * (k + 1), sa - 0.16 * k);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // ── the glow budget (#192) ──────────────────────────────────────────
    // `ctx.shadowBlur` is the most expensive call in the canvas 2D API: it
    // costs a blur pass PER DRAW, so N glowing nodes is N blur passes every
    // frame. The survey sweep already learned this the hard way and answers it
    // with size and brightness only (see the comment further down) — but the
    // highlight path never got the same treatment, so lighting a large cluster
    // put hundreds of shadowed draws in front of the member's next keystroke.
    // That is what Danny hit on 2026-08-30, on the fastest machine we have.
    //
    // All-or-nothing per frame, deliberately, rather than glowing the first N:
    // which nodes are "first" changes as the ball turns, so a subset budget
    // shimmers. Above the budget every highlight trades its blur for radius and
    // alpha, which reads nearly the same and costs nothing.
    const glowOff = massGlow(lit.size, GLOW_BUDGET, easyOn);
    // A course owning the view outranks the shimmer: a route is a sequence to
    // be read in order, and shrinking its stops into a twinkle would bury the
    // one thing that view exists to say. Decided HERE, once per frame, rather
    // than at the moment a region is clicked — the course arrives from a fetch
    // and the region fly-in runs on a 620ms timer, so a gate evaluated once at
    // click time is a coin toss on which landed first. Caught live: stepping
    // from a region with a course straight to one without it left the new
    // region drawn in the old register, because the old route had not been
    // cleared yet when the question was asked. The route gate lives in the ramp
    // above now, so a course arriving thins the shimmer out instead of cutting.
    //
    // 0 to 1, not a flag: every use below LERPS by it, so the register slides
    // between ordinary and shimmering instead of jumping between them.
    const spark = sparkLevel;
    // ── SCULPTURES IN THE WORLD (Dan, 2026-09-26: "The art isn't displayed
    // on Astrolabe's globe. It lives there.") ─────────────────────────────
    // Each piece stands at its home on the sphere in a local frame: up is
    // the surface normal, front a tangent chosen once when the home was
    // made, right completes it. Its points go through the same turn,
    // perspective and radius as every note, so as the world rotates the
    // piece shows its front, three-quarter, side, and foreshortens at the
    // limb. Never billboarded. The frame is rotated once per piece and each
    // point is a linear combination of it, so no per-point allocation.
    // Drawn INTERLEAVED with the notes by depth (the note loop below flushes
    // every sculpture point further back than the note it is about to draw),
    // under the route and every promoted attention cue, which draw later.
    let sN = 0;
    const Rs = R * 0.9;
    if (sculpts.size) {
      let total = 0, most = 0;
      for (const s of sculpts.values()) {
        const k = s.art.n + (s.art.lines ? s.art.lines.length / 3 : 0);
        total += k; most = Math.max(most, s.art.n);
      }
      if (!sPool || sPool.X.length < total) {
        const m = Math.max(total, 512);
        // K: 0 a node, 1 a filament (thread), 2 a faint contour; E its far end
        sPool = { X: new Float32Array(m), Y: new Float32Array(m), Z: new Float32Array(m), Rr: new Float32Array(m),
          A: new Float32Array(m), C: new Array(m), G: new Float32Array(m * 2), E: new Float32Array(m * 2),
          K: new Uint8Array(m), order: new Int32Array(m) };
      }
      if (!sScratch || sScratch.x.length < most) {
        const m = Math.max(most, 512);
        sScratch = { x: new Float32Array(m), y: new Float32Array(m), z: new Float32Array(m), a: new Float32Array(m), c: new Array(m) };
      }
      const pl = sPool, sc = sScratch;
      const tS = now / 1000;
      const dtP = sPresentAt ? Math.min(0.1, (now - sPresentAt) / 1000) : 0;
      sPresentAt = now;
      // promoted notes (lit, held, skimmed) are never covered by art: active
      // information outranks physical depth
      const holes = [];
      const promote = (d) => { holes.push(d.x, d.y, (NODE_LIT_R * 1.6 + 2) * o.nodeScale * o.dpr); };
      if (lit.size <= 80) for (const d of drawn) { if (lit.has(d.n.id) || d.n.id === selected || skims.has(d.n.id)) promote(d); }
      else for (const d of drawn) { if (d.n.id === selected || skims.has(d.n.id)) promote(d); }
      for (const s of sculpts.values()) {
        const art = s.art, n = art.n;
        // the frame at home, turned with the world
        const up = s.at, fr = s.front;
        const rt = { x: up.y * fr.z - up.z * fr.y, y: up.z * fr.x - up.x * fr.z, z: up.x * fr.y - up.y * fr.x };
        let U = rotate(orient, up), F = rotate(orient, fr), Rt = rotate(orient, rt);
        const U0 = U;                                     // the true normal: where the foot stands
        const fA = U.z;                                   // how squarely the home faces us
        s.box = null;
        if (fA < -0.45) continue;                         // well round the back: not drawn at all
        // PRESENTED IN HAND: ease toward the asked presentation, then lean
        // the frame about the piece's own foot toward screen-up (CourseArt
        // .presentLean). Geography stays true at rest; in hand the sculpture
        // turns toward you without leaving its place.
        const pKey = up.x.toFixed(4) + ',' + up.y.toFixed(4) + ',' + up.z.toFixed(4);
        const pWant = calm ? (s.present ? 1 : 0) : (s.present || 0);
        let pNow = sPresent.has(pKey) ? sPresent.get(pKey) : pWant;
        pNow += (pWant - pNow) * (calm ? 1 : Math.min(1, dtP * 2.6));
        if (Math.abs(pWant - pNow) < 0.002) pNow = pWant;
        sPresent.set(pKey, pNow);
        const CA = typeof window !== 'undefined' ? window.CourseArt : null;
        if (pNow > 0 && CA && CA.presentLean && fA > 0) {
          const ease = pNow * pNow * (3 - 2 * pNow);
          const lean = CA.presentLean(U, F, Rt, ease, art.intent && art.intent.view, s.upright);
          if (lean) { U = lean.U; F = lean.F; Rt = lean.Rt; }
        }
        // the base rides the same lens as the land it stands on (the region
        // in hand lifts and fans; its landmark goes with it, not on its own)
        let alt = s.alt || 1, Ux = U0.x, Uy = U0.y, Uz = U0.z;
        if (lensing) {
          const L = rotate(orient, lens(up));
          const ll = Math.hypot(L.x, L.y, L.z) || 1;
          alt *= ll; Ux = L.x / ll; Uy = L.y / ll; Uz = L.z / ll;
        }
        const Ax = Ux * alt, Ay = Uy * alt, Az = Uz * alt;
        const gR = alt / (s.alt || 1);                    // the ground radius under it
        const pA = camZ / (camZ - Az);
        // SIZE LIKE GEOGRAPHY, with a guardrail: the piece has a real size on
        // the sphere, so descending toward it makes it larger; only at the
        // extremes is it held between a legible floor and a ceiling that
        // keeps it under the route and the current work
        // IN HAND IT COMES FORWARD: `grow` is how much larger the piece is
        // when presented (about 0.45 of the radius for a region's piece),
        // eased with the presentation
        const size0 = s.size * (1 + ((s.grow || 1) - 1) * pNow * pNow * (3 - 2 * pNow));
        const pxU = size0 * Rs * pA;                      // screen px per local unit, near the base
        const hPx = art.extent.h * pxU, wPx = art.extent.w * pxU;
        // guarded by WIDTH as well as height: a wide bridge must not become
        // tiny because its height clears the floor
        const lo = 64 * o.dpr, loW = 110 * o.dpr, hi = 0.42 * Math.min(w, h), hiW = 0.62 * Math.min(w, h);
        let guard = 1;
        if (hPx < lo || wPx < loW) guard = Math.min(1.8, Math.max(lo / Math.max(1, hPx), loW / Math.max(1, wPx)));
        if (hPx * guard > hi || wPx * guard > hiW) guard = Math.min(hi / Math.max(1, hPx), hiW / Math.max(1, wPx));
        const sz = size0 * guard;
        // the material: the globe's own resting register at this place
        const vibA = fA <= 0 ? 0 : Math.pow(nearness(fA), NODE_VIB_POW);
        const rRest = NODE_R * o.nodeScale * o.dpr * (0.72 + 0.28 * pA) * 1.5 * densityScale * (NODE_FAR_R + (1 - NODE_FAR_R) * vibA);
        const reg = [0.95, 0.8, 0.56, 0.46];             // anchor, skeleton, body, scaffold: relative to resting
        const rBody = Math.max(1.1 * o.dpr, rRest * reg[2]);
        // PERCEPTUAL LOD: how many body points this projected size can hold
        // as distinct points (about 3.2 radii of room each), quantised to
        // steady tiers with hysteresis so the piece never fizzes as it turns
        const areaPx = art.extent.w * art.extent.h * (sz * Rs * pA) * (sz * Rs * pA) * 0.5;
        const want = Math.min(1, areaPx / ((4 * rBody) * (4 * rBody)) / Math.max(1, art.bodyN || (art.bodyN = art.tier.reduce((c, t) => c + (t >= 2 ? 1 : 0), 0))));
        const lod = s.lod = artLodStep(s.lod || 0.3, want);
        // POSED AT 20 A SECOND, PROJECTED EVERY FRAME (2026-10-10). The pose
        // is the piece's own slow life (a sway, a flicker); the turn of the
        // world is the projection below. Posing every frame was a tenth of
        // the main thread under a build's reads and writes, for motion that
        // moves a fraction of a pixel between frames. Copied, because a pose
        // may hand back a buffer it reuses.
        const amt = calm ? 0 : (s.amount == null ? 1 : s.amount);
        if (!s.posed || s.posed.lod !== lod || s.posed.amt !== amt || Math.abs(now - s.posed.at) > 50) {
          const fresh = art.pose(tS, amt, lod);
          const buf = s.posed && s.posed.pts.length === fresh.length ? s.posed.pts : new Float32Array(fresh.length);
          buf.set(fresh);
          s.posed = { at: now, lod, amt, pts: buf };
        }
        const pts = s.posed.pts;
        const base = art.base;
        let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
        const depthRange = Math.max(0.2, art.extent.d) * sz;
        const lines = art.lines, thr = art.thread;
        if (lines) sc.a.fill(0, 0, n);
        for (let i = 0; i < n; i++) {
          const t = art.tier[i];
          if (t >= 2 && art.rank[i] >= lod) continue;
          const lx = pts[i * 3] * sz, ly = pts[i * 3 + 1] * sz, lz = pts[i * 3 + 2] * sz;
          const X = Ax + Rt.x * lx + U.x * ly + F.x * lz;
          const Y = Ay + Rt.y * lx + U.y * ly + F.y * lz;
          const Z = Az + Rt.z * lx + U.z * ly + F.z * lz;
          const p = camZ / (camZ - Z);
          const x = cx + X * Rs * p, y = cy - Y * Rs * p;
          // physically behind the ball: inside the disc and on the far side.
          // Smooth across the horizon and limb so moving art nodes do not pop or flicker.
          let b = 0;
          if (Z < 0) {
            const d = Math.hypot(x - cx, y - cy);
            const margin = 8 * o.dpr;
            const dFade = Math.max(0, Math.min(1, (R - d) / margin));
            const zFade = Math.max(0, Math.min(1, -Z / 0.06));
            b = dFade * zFade;
          }
          const behind = b >= 0.5;
          const soft = art.soft[i] === 1;
          let r = rRest * (soft ? 0.9 : reg[t]);
          if (t >= 2) r = Math.max(rBody, r);
          if (b > 0) r *= 1 - b * (1 - NODE_R_BACK / NODE_R);
          let a;
          const aFront = (NODE_DIM + (1 - NODE_DIM) * vibA) *
            (t >= 2 ? (0.72 + 0.28 * Math.max(0, Math.min(1, 0.5 + (Z - Az) / depthRange))) : 1);
          a = aFront + (0.2 - aFront) * b;
          // LIT AS A MATERIAL (Dan, 2026-09-26: "feels more like a real
          // rendering"): each node's surface normal, turned with the piece,
          // picks a step on its colour's OKLCH lightness ramp, so a tube
          // rounds off into shadow and catches light along one side while
          // every node stays a crisp, opaque jewel. A thread is a filament:
          // bright and even, its nodes small punctuation along the line.
          const ci = art.col[i];
          let fill = art.cols[ci] || art.cols[0];
          const nv = art.normal, ramp = art.shades && art.shades[ci];
          if (thr && thr[i]) { if (ramp) fill = ramp[5]; if (t >= 1) r *= 0.62; }
          // fire is light, not a surface: its own full colour low (the top of the
          // ramp is pale and reads as sand), deepening toward the tips as it rises,
          // shrinking and fading
          else if (art.fire && art.fire[i]) { if (ramp) fill = ramp[art.size[i] > 0.85 ? 4 : art.size[i] > 0.7 ? 3 : 2]; r *= art.size[i]; a *= art.fade[i]; }
          else if (nv && ramp && !behind && !soft) {
            const nx = nv[i * 3], ny = nv[i * 3 + 1], nz = nv[i * 3 + 2];
            const Nx = Rt.x * nx + U.x * ny + F.x * nz, Ny = Rt.y * nx + U.y * ny + F.y * nz, Nz = Rt.z * nx + U.z * ny + F.z * nz;
            let k = CA && CA.shadeStep ? CA.shadeStep(Nx, Ny, Nz) : 4;
            if (art.accent && art.accent[i]) k = Math.max(k, 4);
            fill = ramp[k];
            if (t >= 2) r *= 0.9 + 0.04 * k;
          }
          // a `dot` is one bigger light, a `shell`'s spare nodes are not drawn (2026-10-10)
          if (art.formed && art.formed[i]) { r *= art.size[i] || 1; a *= art.fade[i]; }
          if (soft && !calm) a *= 0.85 + 0.15 * Math.sin(tS * 0.7 + i);
          r = Math.max(r, (NODE_SHARP_R + NODE_SHARP_GAIN * vibA) * o.dpr);
          a *= s.alpha == null ? 1 : s.alpha;
          // never over a promoted note
          let hid = false;
          for (let hI = 0; hI < holes.length; hI += 3) {
            const dx = x - holes[hI], dy = y - holes[hI + 1];
            if (dx * dx + dy * dy < holes[hI + 2] * holes[hI + 2]) { hid = true; break; }
          }
          if (hid || a < 0.02) continue;
          if (lines) { sc.x[i] = x; sc.y[i] = y; sc.z[i] = Z; sc.a[i] = a * (1 - b); sc.c[i] = fill; }
          if (thr && thr[i] === 1) continue;             // a filament between joints: its line carries it
          const j = sN++;
          pl.X[j] = x; pl.Y[j] = y; pl.Z[j] = Z; pl.Rr[j] = r; pl.A[j] = a;
          pl.C[j] = fill; pl.K[j] = 0;
          pl.G[j * 2] = NaN;
          // WHERE IT MEETS THE LAND: the globe's own stalk grammar, from each
          // base point down to its ground point on the sphere
          // (a piece that floats, `float` on its score, has none: it hovers, 2026-10-10)
          if (fA > STALK_LIMB && !behind && !(art.float > 0) && base.indexOf(i) >= 0) {
            // (to the ground as the lens has it: a lifted land lifts its roots)
            const l = (Math.hypot(X, Y, Z) || 1) / gR;
            const pg = camZ / (camZ - Z / l);
            pl.G[j * 2] = cx + (X / l) * Rs * pg; pl.G[j * 2 + 1] = cy - (Y / l) * Rs * pg;
          }
          if (t <= 1) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
        }
        // FILAMENTS: the piece's lines between nodes drawn this frame, in the
        // nodes' own colour and level, sorted by depth with everything else
        if (lines) {
          for (let m = 0; m < lines.length; m += 3) {
            const i1 = lines[m], i2 = lines[m + 1];
            const a1 = sc.a[i1], a2 = sc.a[i2];
            if (!(a1 > 0) || !(a2 > 0)) continue;
            const kind = lines[m + 2];
            const j = sN++;
            pl.X[j] = sc.x[i1]; pl.Y[j] = sc.y[i1]; pl.E[j * 2] = sc.x[i2]; pl.E[j * 2 + 1] = sc.y[i2];
            pl.Z[j] = (sc.z[i1] + sc.z[i2]) / 2 - 1e-4;   // just behind its own nodes
            pl.K[j] = kind;
            // 1 a filament, 3 a quieter filament (a detail), 2 a faint contour
            pl.A[j] = Math.min(a1, a2) * (kind === 1 ? 0.85 : kind === 3 ? 0.5 : 0.32);
            pl.Rr[j] = kind === 2 ? Math.max(0.6, 0.3 * rRest) : Math.max(0.9, 0.5 * rRest);
            pl.C[j] = sc.c[i1];
            pl.G[j * 2] = NaN;
          }
        }
        if (bx1 >= bx0) s.box = { x0: bx0, y0: by0, x1: bx1, y1: by1, f: fA };
      }
      const ord = pl.order;
      for (let j = 0; j < sN; j++) ord[j] = j;
      const Zs = pl.Z;
      ord.subarray(0, sN).sort((a, b) => Zs[a] - Zs[b]);
    }
    let sI = 0;
    const drawSculptTo = (zMax) => {
      if (sI >= sN) return;
      const pl = sPool, ord = pl.order;
      const sw = Math.max(1, 0.8 * o.dpr);
      while (sI < sN && pl.Z[ord[sI]] <= zMax) {
        const j = ord[sI++];
        if (pl.K[j]) {
          ctx.globalAlpha = pl.A[j];
          ctx.strokeStyle = pl.C[j];
          ctx.lineWidth = pl.Rr[j];
          const cap0 = ctx.lineCap;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(pl.X[j], pl.Y[j]); ctx.lineTo(pl.E[j * 2], pl.E[j * 2 + 1]); ctx.stroke();
          ctx.lineCap = cap0;
          continue;
        }
        ctx.globalAlpha = pl.A[j];
        ctx.fillStyle = pl.C[j];
        if (pl.G[j * 2] === pl.G[j * 2]) {
          ctx.globalAlpha = pl.A[j] * 0.4;
          ctx.strokeStyle = pl.C[j];
          ctx.lineWidth = sw;
          ctx.beginPath(); ctx.moveTo(pl.G[j * 2], pl.G[j * 2 + 1]); ctx.lineTo(pl.X[j], pl.Y[j]); ctx.stroke();
          ctx.globalAlpha = pl.A[j];
        }
        ctx.beginPath(); ctx.arc(pl.X[j], pl.Y[j], pl.Rr[j], 0, Math.PI * 2); ctx.fill();
      }
    };
    for (const d of drawn) {
      if (sI < sN) { ctx.shadowBlur = 0; drawSculptTo(d.z); }
      const on = lit.has(d.n.id);
      // The colour hierarchy is a stack (3D brief B.1): a course owning the
      // view outranks art, and art outranks the kind colour only while a
      // piece holds the node. Kind is never overwritten, only outvoted.
      const col = (courseCol && claimIds.has(d.n.id))
        ? (claimDone.has(d.n.id) ? courseColDone : courseCol)
        : (d.art && d.art.tint ? d.art.tint : ((o.tintNodes && d.n.tint) || KIND[d.n.kind] || KIND.plan));
      const back = d.z <= 0;
      // How squarely this note is faced, on a curve, 0 at the limb and 1 at the
      // middle of the view. Computed up here because it drives SIZE as well as
      // level, and the size term has to be in the resting radius below rather
      // than bolted on afterwards — the lit and writing registers replace `r`
      // outright, so a node the member has actually activated keeps its own
      // full-strength shape and is never shrunk by where it happens to sit.
      const vib = back ? 0 : Math.pow(nearness(d.f), NODE_VIB_POW);
      // the far side dims and never disappears: the point of the whole thing
      // is how much else there is
      // A note somebody has worked for months should not be the same speck as
      // a line they jotted. Weight is a rank rather than a ratio, so the sizes
      // spread evenly whatever the spread of the underlying lengths.
      // Size is DEGREE, and the range is wide on purpose. At 0.66 to 1.51 the
      // difference between a note everything hangs off and a note nothing
      // points at was a couple of pixels, which is a fact nobody can read. The
      // hub of a project should be obviously the hub.
      // A rank that came back flat says nothing about this note, so it gets the
      // middle rather than the floor: eight notes of similar length are not
      // eight of the least important notes in the vault.
      const w0 = flatWeights ? 0.5 : (d.n.weight == null ? 0.5 : d.n.weight);
      const wgt = 0.5 + 2.0 * w0;
      // An orphan in a vault of orphans is not an orphan, it is a Tuesday.
      const orphan = d.n.degree === 0 && dustAt < 1;
      // Asked for, or filtered out. A kind that is switched off does NOT
      // vanish, for the same reason orphans are dust rather than hidden: the
      // one thing this globe exists to show is how much else there is, and a
      // filter that empties the sky answers the legibility question by
      // destroying the answer. So it recedes hard and stays on the map.
      let wanted = !only || only.has(d.n.kind);
      // A course that owns the view pushes everything else right back. Not
      // away: the map still has to say how much else there is, which is the
      // one thing it exists for. Just far enough that the route is the only
      // thing the eye lands on.
      const offCourse = claim && claim.only && !claimIds.has(d.n.id);
      let r = (back ? NODE_R_BACK : NODE_R) * o.nodeScale * o.dpr * (0.72 + 0.28 * d.p) * wgt * densityScale * (orphan ? (o.dust + (1 - o.dust) * dustAt) : 1)
        * (back ? 1 : NODE_FAR_R + (1 - NODE_FAR_R) * vib);
      // The art size seam, with the perceptual ceiling from 3D brief C.2: an
      // art radius never exceeds 0.68 of what THIS node's focus radius would
      // be. The multiplier envelope alone cannot promise that, because the
      // perspective swell above has no counterpart in the focus register, so
      // near the camera 1.32x can reach 93% of focus size. The clamp holds
      // under every combination of degree, perspective, density and DPR, and
      // a genuinely focused node never reaches this line (the focus branch
      // below replaces r outright, so the functional UI wins by construction).
      if (d.art) r = Math.min(r * d.art.sizeMultiplier, 0.68 * NODE_LIT_R * o.nodeScale * o.dpr * wgt * densityScale);
      // Front nodes are vibrant at rest: the dimming is for the far side of the
      // ball (depth) and for a course pushing everything else back, NOT for the
      // ordinary resting view, where 0.68 read as a whole sky of half-lit specks.
      //
      // And now the resting level RIDES THE CAMERA, the way every coastline
      // already does. It was flat 0.79 at every position on the front face, so
      // coming closer to a region lit its border and left its notes exactly as
      // soft as they had been from across the ball. Full strength at the middle
      // of the view, NODE_DIM at the limb — and that floor is high on purpose,
      // because a RESTING globe should not look soft anywhere. The dimming that
      // is allowed to be obvious belongs to nodes something has pushed back:
      // notes in play, a held node, a course owning the view.
      let alpha = (back ? 0.2 : NODE_DIM + (1 - NODE_DIM) * vib) * (orphan ? 0.6 : 1);
      let glow = 0;
      if (on && !back && wanted) {
        // The shimmer register: much smaller, no standing glow, the life put
        // back as motion below. `wgt` is still the multiplier, so the hub of a
        // region is still visibly the hub — the whole set just stops shouting.
        // `few` is 1 for a handful in play and 0 for a burst; the size keeps a
        // floor and the glow does not, because the halo is what blows out.
        const few = playEase(lit.size);
        // The pulse. Held at the midpoint under reduced motion, and faded out
        // by `spark` so a shimmering region twinkles instead of also breathing
        // — those are two different things to be saying and one node should
        // only ever be saying one of them.
        const beat = 1 + PLAY_PULSE * ((calm ? 0.5 : breath) - 0.5) * 2 * few * (1 - spark);
        r = NODE_LIT_R * o.nodeScale * (PLAY_FLOOR + (1 - PLAY_FLOOR) * few) * beat
          * o.dpr * wgt * densityScale * (1 - (1 - SPARK_SHRINK) * spark);
        alpha = 1;
        // over budget: the blur is what goes, never the highlight itself.
        // The shimmer takes the halo down with it, which is the "blur" Dan
        // wants gone once a region is no longer being looked at — it fades on
        // the same ramp as the size rather than being switched off under it.
        glow = glowOff ? 0 : NODE_LIT_GLOW * o.dpr * (1 - spark) * few;
        if (glowOff) r *= 1 + 0.22 * (1 - spark);
      }
      // Everything else steps back rather than leaving. Dimming to nothing
      // would answer the legibility problem and destroy the only thing the
      // globe was ever for, which is how much else there is.
      else if (grav > 0.002) { alpha *= 1 - (1 - o.recede) * grav; r *= 1 - 0.2 * grav; }
      // 7.3 and 7.12, finally applied. `offCourse` was computed here and then
      // read by nothing at all, so the one thing those items promised, that
      // the route is the only thing the eye lands on, had never once happened
      // on screen. Dan asked for it again on 2026-08-23 having watched it not
      // happen. 22% alpha and just over half size: back, not gone, because the
      // map still has to say how much else there is.
      // the same breath serves a note being written to and a newborn under the
      // lens: in both cases the eye has been sent here and wants something
      // alive when it arrives, rather than a dot that is merely bigger
      if ((d.n.id === writing || d.n.id === visiting) && !back && wanted) {
        r = (NODE_LIT_R + breath * NODE_LIT_BREATH) * o.nodeScale * o.dpr * wgt * densityScale * (1 - (1 - SPARK_SHRINK) * spark);
        glow = (NODE_LIT_GLOW + breath * 8) * o.dpr * (1 - 0.5 * spark);
        // A newborn note is a SHORT note, and `wgt` is length, so the thing the
        // camera has just crossed the world to look at arrives as one of the
        // smallest dots on the sphere. Under a visit it gets a floor: what you
        // flew to see should be legible when you get there, not a speck in the
        // middle of an empty frame.
        // Halved along with the register it is a floor UNDER. Left at 7 it
        // would have become the thing it was protecting against from the other
        // direction: a floor bigger than the size it floors is not a floor, it
        // is the size, and every visited note would have been drawn at one.
        if (d.n.id === visiting) {
          r = Math.max(r, (3.5 + breath * 1.3) * o.dpr);
          glow = (10 + breath * 9) * o.dpr;
        }
      }
      // act one of draw-the-map: the survey sweep finds this node. Bearing is
      // screen-space on purpose — the scan reads the map the member sees, and
      // a note lights as the beam crosses it, then settles. Never on the far
      // side (the beam is in front of the ball) and never under reduced motion.
      // Size and brightness ONLY, never shadowBlur: the first cut glowed every
      // node in the beam's band and at 2,000 notes that was hundreds of
      // shadowed draws per frame — canvas shadows are the most expensive
      // stroke there is, and the sweep itself was the chop it caused
      if (surveyOn && !calm && !back && wanted) {
        const sa = ((now - surveyOn) / 2600) % (Math.PI * 2);
        let da = Math.abs(Math.atan2(d.y - cy, d.x - cx) - (sa - Math.PI));
        if (da > Math.PI) da = Math.PI * 2 - da;
        const f = Math.max(0, 1 - da / 0.55);
        if (f > 0) {
          r += 2.2 * o.dpr * f * f;
          alpha = Math.min(1, alpha + 0.6 * f);
        }
      }
      // The region shimmer, over the shrunk mark. A scatter of the lit set
      // grows in place and settles, the way the wordmark's nodes do, and a
      // third of those carry the node's OWN colour as a halo rather than the
      // pen's — the mark is one brand object and this is a map, so the depth
      // is the same gesture in the note's own hue.
      //
      // The halo is affordable at any region size without a second budget: a
      // wave picks 16% and 30% of those shine, so under 5% of the lit set is
      // ever shadowed at once. Checked against the same GLOW_BUDGET the
      // highlight path answers to rather than assumed.
      // Gated on `sparkSet`, NOT on `lit`. Letting go of a region empties the
      // lit set on the spot, which is exactly what brings the rest of the
      // globe back to ordinary vibrancy — but a fade gated on `lit` would have
      // nothing left to play over and would vanish in the same frame instead
      // of thinning out. The set the shimmer was started with outlives the
      // focus by exactly as long as the ramp takes.
      if (spark > 0.004 && sparkSet && sparkSet.has(d.n.id) && !back && wanted && !calm) {
        const sp = sparkOf(d.n, now);
        if (sp) {
          const amp = sp.amp * spark;
          r *= 1 + SPARK_PEAK * amp;
          if (sp.halo && sparkSet.size * SPARK_SHARE * SPARK_GLOW <= GLOW_BUDGET) {
            glow = Math.max(glow, 7 * o.dpr * amp);
          }
        }
      }
      // applied last, so nothing above can light a node the member switched off
      if (!wanted) { alpha *= presence(d.n.kind, only); r *= o.dust; glow = 0; }
      if (offCourse) { alpha *= 0.22; r *= 0.55; glow = 0; }
      // A NOTE ON THE ROUTE IS ALREADY DRAWN BY THE ROUTE (course pass). In the
      // full view its own lit disc sat under the course mark at three times
      // the size, so every finished course read as a green blob and the marks
      // that actually carry state were buried in it. The route mark is the
      // note's picture here; the disc underneath becomes a pinprick.
      else if (claim && claim.only && claim.flown && claimIds.has(d.n.id) && !back) {
        r = Math.min(r, 1.6 * o.dpr); alpha *= 0.35; glow = 0;
      }
      // THE SHARPNESS FLOOR, and it is the other half of "not blurred at all".
      // Level alone does not make a dot crisp: a radius under about two thirds
      // of a pixel is spread across four of them by antialiasing, so it lands
      // as a soft grey bloom in roughly the node's colour however opaque it is
      // meant to be. Weighted by nearness, so what the camera has come close to
      // is a hard little disc and the limb keeps its softness.
      //
      // Only where a node is meant to be READ. A kind switched off is dust and
      // an off-course node is pushed back, both deliberately, and a floor that
      // ignored that would quietly undo the two strongest recedes on the globe.
      if (!back && wanted && !offCourse) {
        r = Math.max(r, (NODE_SHARP_R + NODE_SHARP_GAIN * vib) * o.dpr);
      }
      // the write gesture: a risen note is a bigger one, and while the agent
      // works on it the stream pours; the fountain plays as it settles
      if (d.up > 0) r *= 1 + 0.55 * d.up;
      if (ws && !back) {
        const id = d.n.id, floor = Math.max(4 * o.dpr, d.gy - d.y);
        if (id === forge && d.up > 0.6 && now - (wsDrip.get(id) || 0) > 14) { wsDrip.set(id, now); ws.strike(id, d.y, floor, col, o.dpr, o.streamSpread || STREAM_SPREAD); }
        if (settle && settle.id === id && !settle.burst) { settle.burst = true; ws.burst(id, 30, floor, col, o.dpr, 1.1); }
        if (wsIdsAt !== now) { wsIdsAt = now; wsIds = ws.busy() ? ws.marks() : null; }
        if (d.up > 0 || (wsIds && wsIds.has(id))) wsPos.set(id, { x: d.x, y: d.y, facing: d.f });
      }
      ctx.globalAlpha = alpha;
      // a node that paints itself keeps the real blur (its own shape decides
      // what glows); a plain disc takes the stamp, drawn under it below
      const stamp = glow > 0 && !o.paint ? glowSprite(col) : null;
      ctx.shadowBlur = stamp ? 0 : glow;
      // a colour assignment is a parse; only a blur that will run needs one
      if (!stamp && glow) ctx.shadowColor = col;
      ctx.fillStyle = col;
      // A NODE THAT BRINGS ITS OWN SHAPE (2026-09-27). A caller that mounts a
      // world of its own (a repository's files, not a vault's notes) may paint
      // each facing node itself: `o.paint` answers true when it drew the node,
      // stalk and all, and the disc, bloom and keyline below are skipped. It
      // may move `d.x`/`d.y` to where it drew the head, and hit testing follows.
      // Absent, nothing here changes.
      const painted = !back && o.paint ? o.paint(ctx, d, r, col, alpha, { now, R, dpr: o.dpr, vib }) : false;
      if (!painted) {
      // the stalk it stands on, so height reads as height rather than as a node
      // that happens to be drawn slightly off its own position. Art height
      // earns a stalk on the same terms as depth height (3D brief C.3): a
      // raised node with no stem reads as an error, not as sculpture.
      // `d.f > STALK_LIMB` for the same reason the resting web has a cutoff: a
      // stalk near the limb is drawn almost edge-on, so instead of reading as
      // height it reads as a stray horizontal dash lying beside a dot. Height
      // is only legible where there is some face to stand it on.
      if (!back && d.f > STALK_LIMB && ((d.n.depth || 0) > 0.45 || (d.art && d.art.altitude > 0.02) || d.up > 0.02)) {
        ctx.globalAlpha = alpha * 0.4;
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1, 0.8 * o.dpr);
        ctx.beginPath(); ctx.moveTo(d.gx, d.gy); ctx.lineTo(d.x, d.y); ctx.stroke();
        ctx.globalAlpha = alpha;
      }
      // THE LOCAL BLOOM (reading room, 2026-09-26). The mineral palette is
      // calmer than neon, so a tiny resting node gets a little light of its own
      // instead of a brighter core: two faint discs in its own hue, the way a
      // small lit object reads against dark water. Two flat fills, not a blur,
      // so it costs nothing at any vault size. Only where a node is meant to be
      // read and is not already glowing. --node-bloom is 0 in night, so Cosmos
      // never enters this branch.
      if (BLOOM > 0 && !glow && !back && wanted && !offCourse) {
        ctx.globalAlpha = alpha * BLOOM * 0.55;
        ctx.beginPath(); ctx.arc(d.x, d.y, r * 3.1, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = alpha * BLOOM;
        ctx.beginPath(); ctx.arc(d.x, d.y, r * 1.9, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = alpha;
      }
      if (stamp) {
        // a blur of `glow` spreads about that far past the disc's edge
        const s = r + glow * 1.05;
        ctx.drawImage(stamp, d.x - s, d.y - s, s * 2, s * 2);
      }
      ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, Math.PI * 2); ctx.fill();
      // THE KEYLINE (reading room, 2026-09-26). A node raised past the limb
      // lands on mint paper, where a mid-tone mineral dot has no edge and
      // melts. A hairline in the sea's own green-black gives it one; over the
      // water the same line is dark on dark and disappears, so only the dots
      // that need a shape get one. --node-stroke-w is 0 in night.
      if (STROKE_W > 0 && !back && wanted) {
        const sb = ctx.shadowBlur; ctx.shadowBlur = 0;
        ctx.strokeStyle = STROKE_COL;
        ctx.lineWidth = STROKE_W * o.dpr;
        ctx.beginPath(); ctx.arc(d.x, d.y, r + ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = sb;
      }
      }
      d.r = r;   // the mark pass at the end needs to clear it

      // The skim: the note brightens and settles, no ring, no growth, no
      // camera. Drawn over the mark rather than instead of it, so a note being
      // read stays exactly the size and colour it already was and only gains
      // light. That is the difference a member should be able to feel without
      // being told: something was looked at, versus something changed.
      const sk = skims.get(d.n.id);
      if (sk != null && !back) {
        const t = (now - sk) / SKIM_MS;
        if (t >= 1) skims.delete(d.n.id);
        else {
          const fade = 1 - easeOutQuint(t);
          ctx.globalAlpha = 1;
          glowDisc(d.x, d.y, r * (1 + 0.25 * fade), 12 * o.dpr * fade, col);
          ctx.globalAlpha = alpha;
        }
      }

      // ── the progress wheel (Dan, 2026-09-01) ────────────────────────────
      // While words are landing in this note, a ring turns around it in the
      // note's OWN colour. It exists because the camera used to answer a
      // write-read-write loop by flying back to the same node on every save:
      // three flights to a place it had never left, which reads as the globe
      // twitching rather than as work happening. The work is here, so the globe
      // says so here, and the camera holds until attention moves somewhere else.
      //
      // Three quarters of a turn, not a full circle: the gap is what makes the
      // rotation legible at seven pixels. A faint full track behind it so the
      // moving arc reads as a dial rather than as a stray stroke near a dot.
      // (the write gesture replaces the wheel wherever its particles can play)
      if (d.n.id === writing && !back && !calm && wanted && !o.noWheel && !(ws && d.n.id === forge)) {
        const rr = r + 5.5 * o.dpr;
        const spin = (now / 820) % (Math.PI * 2);
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1, 1.5 * o.dpr);
        ctx.globalAlpha = 0.16;
        ctx.beginPath(); ctx.arc(d.x, d.y, rr, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.85;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(d.x, d.y, rr, spin, spin + Math.PI * 1.5); ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.globalAlpha = alpha;
      }
      // The flare, over the mark and only while it lasts. Two rings expanding
      // out of the point and fading as they go, plus a core that starts hot and
      // settles back to the node's own size. That reads as something arriving
      // rather than something blinking: the ring is what says a place appeared,
      // and the settle is what says it is now an ordinary part of the map.
      const fl = flares.get(d.n.id);
      if (fl && !back) {
        const life = fl.born ? BORN_MS : WRITE_MS;
        // `now` is the frame's start time but `fl.at` is performance.now() from
        // whenever the note arrived, which can land a hair later in the same
        // frame: t goes slightly negative and a negative radius throws
        const t = Math.max(0, (now - fl.at) / life);
        if (t >= 1) flares.delete(d.n.id);
        else {
          const e = easeOutQuint(t);
          const rings = (fl.born || fl.moved) ? 2 : 1;
          for (let k = 0; k < rings; k++) {
            const lag = k * 0.22;
            const tk = (t - lag) / (1 - lag);
            if (tk <= 0 || tk >= 1) continue;
            const ek = easeOutQuint(tk);
            ctx.globalAlpha = (1 - ek) * (fl.born ? 0.75 : 0.5);
            ctx.strokeStyle = col;
            ctx.lineWidth = Math.max(1, (fl.born ? 1.8 : 1.2) * o.dpr * (1 - ek));
            ctx.beginPath();
            ctx.arc(d.x, d.y, r + ek * (fl.born ? 34 : 16) * o.dpr, 0, Math.PI * 2);
            ctx.stroke();
          }
          // the core: hot at the moment of arrival, settling into an ordinary
          // node. A birth ALSO grows from nothing, because a place that was
          // never there should not simply be there the next frame.
          const grow = fl.born ? Math.min(1, t / 0.18) : 1;
          ctx.globalAlpha = 1;
          glowDisc(d.x, d.y, r * grow * (1 + (fl.born ? 1.5 : 0.7) * (1 - e)), (fl.born ? 26 : 14) * o.dpr * (1 - e), col);
          ctx.globalAlpha = alpha;
        }
      }
    }
    // the nearest sculpture points, in front of every note
    ctx.shadowBlur = 0;
    drawSculptTo(Infinity);
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;

    // ── the departures: beams out into space ──────────────────────────────
    // Drawn after the nodes and before the birth spectacle, so a beam leaves
    // from over its own mark and still passes UNDER a birth if the two ever
    // land in the same frame: something arriving outranks something leaving.
    for (const [sid, snd] of sends) {
      const el = now - snd.at;
      if (el < 0) continue;                     // still waiting its turn to go
      // altitude: 0 at the node, 1 at full reach. Rise, stand, settle.
      let alt, phase;
      if (el < SEND_RISE_MS) { alt = easeOutQuint(el / SEND_RISE_MS); phase = 'rise'; }
      else if (now < snd.hold) { alt = 1; phase = 'hold'; }
      else {
        const sv = (now - snd.hold) / SEND_SETTLE_MS;
        if (sv >= 1) { sends.delete(sid); continue; }
        // smoothstep on the way down: it lets go gently and arrives gently,
        // which is the difference between settling and dropping
        alt = 1 - (sv * sv * (3 - 2 * sv));
        phase = 'settle';
      }
      const d = drawn.find((q) => q.n && q.n.id === sid);
      if (!d || !isFinite(d.x) || !isFinite(d.y)) continue;
      if (d.z <= 0) continue;                   // it left from the far side
      const col = KIND[d.n.kind] || KIND.plan;
      const dx = d.x - cx, dy = d.y - cy;
      const len = Math.hypot(dx, dy) || 0;
      ctx.save();
      if (len > R * 0.18) {
        // The column rides the node's own outward normal, which in screen space
        // is the line from the sphere's centre out through the node. Rooted at
        // the mark at both ends of its life: it grows out of the note and comes
        // back down into it.
        const ux = dx / len, uy = dy / len;
        const head = alt * R * 1.15;
        const x1 = d.x + ux * head, y1 = d.y + uy * head;
        const g = ctx.createLinearGradient(d.x, d.y, x1, y1);
        g.addColorStop(0, col + '00');
        g.addColorStop(0.3, col + '88');
        g.addColorStop(1, col + 'ee');
        ctx.globalAlpha = phase === 'hold' ? 0.92 : 1;
        ctx.strokeStyle = g;
        ctx.lineWidth = Math.max(1.4, 3 * o.dpr * (0.55 + 0.45 * alt));
        ctx.lineCap = 'round';
        ctx.shadowColor = col; ctx.shadowBlur = 20 * o.dpr * alt;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y); ctx.lineTo(x1, y1);
        ctx.stroke();
        // the cap: a hot point at the top, so the column has a tip rather than
        // fading out into an ambiguous smudge
        ctx.globalAlpha = alt;
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 16 * o.dpr * alt;
        ctx.beginPath(); ctx.arc(x1, y1, Math.max(1, 2.1 * o.dpr * alt), 0, Math.PI * 2); ctx.fill();
        // while it stands, a bright parcel runs up it. A held column with
        // nothing moving inside it reads as a drawn line; this is the thing
        // that says data is going somewhere, and it is the only motion in the
        // hold.
        if (phase === 'hold') {
          const p = ((now - snd.at) % 620) / 620;
          const sx = d.x + ux * head * p, sy = d.y + uy * head * p;
          ctx.globalAlpha = 0.85 * Math.max(0, 1 - Math.abs(p - 0.5) * 1.2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = Math.max(1, 1.6 * o.dpr);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + ux * 16 * o.dpr, sy + uy * 16 * o.dpr);
          ctx.stroke();
        }
      } else {
        // A note facing the viewer leaves TOWARD them, and that has no
        // direction on screen. A ring standing open at the same altitude is the
        // honest projection of it, rather than a column pointed in a made-up
        // direction.
        ctx.globalAlpha = 0.9 * (0.35 + 0.65 * alt);
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1.2, 2.4 * o.dpr * alt);
        ctx.shadowColor = col; ctx.shadowBlur = 18 * o.dpr * alt;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 3 * o.dpr + alt * 30 * o.dpr, 0, Math.PI * 2);
        ctx.stroke();
      }
      // the launch: one white flash at the mark as it goes, brief enough to be
      // the moment of leaving rather than a second state the node sits in
      if (el < 200) {
        ctx.globalAlpha = 1 - el / 200;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = col; ctx.shadowBlur = 20 * o.dpr;
        ctx.beginPath(); ctx.arc(d.x, d.y, 3.4 * o.dpr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;

    // ── the birth spectacle (apc #129) ────────────────────────────────────
    // Three acts over the whole canvas: a bolt strikes the point (entrance),
    // lightning flickers out of it under a fog that dims the room (hold), and
    // one shock ring crosses the sphere as everything eases away (exit). A
    // far-side birth plays at the nearest rim point and lights the rim on its
    // bearing, so no arrival ever celebrates to nobody. The node-local flare
    // above stays on as the settle tail.
    for (const [sid, spec] of spectacles) {
      const sat = spec.at;
      const st = (now - sat) / SPECTACLE_MS;
      if (st >= 1) { spectacles.delete(sid); continue; }
      const d = drawn.find((q) => q.n && q.n.id === sid);
      // a just-born node has no projection until the next layout frame, and a
      // non-finite coordinate poisons createRadialGradient for the whole tick
      if (!d || !isFinite(d.x) || !isFinite(d.y)) continue;
      const col = KIND[d.n.kind] || KIND.plan;
      // where the performance plays: the node when it faces us, the nearest
      // rim point when it was born on the far side
      let px = d.x, py = d.y;
      const far = d.z <= 0;
      if (far) {
        const dx = d.x - cx, dy = d.y - cy, len = Math.hypot(dx, dy) || 1;
        px = cx + (dx / len) * R; py = cy + (dy / len) * R;
      }
      // one envelope for the three acts: rise, hold, ease away
      const env = st < 0.12 ? st / 0.12 : st > 0.62 ? Math.max(0, (1 - st) / 0.38) : 1;
      // fog: the room dims so the arrival owns it
      const veil = ctx.createRadialGradient(px, py, R * 0.25, px, py, Math.max(w, h));
      veil.addColorStop(0, 'rgba(0,0,0,0)');
      veil.addColorStop(1, 'rgba(4,4,18,' + (0.38 * env).toFixed(3) + ')');
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, w, h);
      // the halo: a gradient bloom that says LOOK HERE from across the room
      const halo = ctx.createRadialGradient(px, py, 0, px, py, R * 0.55);
      halo.addColorStop(0, col + 'aa');
      halo.addColorStop(0.35, col + '44');
      halo.addColorStop(1, col + '00');
      ctx.globalAlpha = env;
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(px, py, R * 0.55, 0, Math.PI * 2); ctx.fill();
      // the entrance: a bolt from above strikes the point
      if (st < 0.2) {
        const tb = st / 0.2, drop = easeOutQuint(Math.min(1, tb * 1.4));
        const bx = px + R * 0.12, by = -20;
        ctx.globalAlpha = 1 - tb * tb;
        ctx.strokeStyle = '#ffffff';
        ctx.shadowColor = col; ctx.shadowBlur = 22 * o.dpr;
        ctx.lineWidth = 2.4 * o.dpr;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(px + (bx - px) * (1 - drop), py + (by - py) * (1 - drop));
        ctx.stroke();
      }
      // the hold: two fixed arcs of energy travel out of the point and
      // shimmer gently — geometry rolled once at birth, never per frame
      if (st > 0.1 && st < 0.62 && spec.forks) {
        const reach = easeOutQuint(Math.min(1, (st - 0.1) / 0.25));
        ctx.shadowColor = col; ctx.shadowBlur = 12 * o.dpr;
        ctx.lineWidth = 1.2 * o.dpr;
        spec.forks.forEach((pts, f) => {
          const upto = 1 + Math.floor(reach * (pts.length - 1));
          ctx.globalAlpha = env * (0.45 + 0.2 * Math.sin(now / 260 + f * 2.1));
          ctx.strokeStyle = col;
          ctx.beginPath();
          for (let s = 0; s < upto; s++) {
            const gx = px + pts[s][0] * R, gy = py + pts[s][1] * R;
            if (s === 0) ctx.moveTo(gx, gy); else ctx.lineTo(gx, gy);
          }
          ctx.stroke();
        });
      }
      // the exit carries the shock ring: one wave across the whole sphere
      const tr = (st - 0.1) / 0.9;
      if (tr > 0 && tr < 1) {
        const er = easeOutQuint(tr);
        ctx.globalAlpha = (1 - er) * 0.8;
        ctx.strokeStyle = col;
        ctx.shadowColor = col; ctx.shadowBlur = 18 * o.dpr * (1 - er);
        ctx.lineWidth = Math.max(1, 3 * o.dpr * (1 - er));
        ctx.beginPath(); ctx.arc(px, py, 6 + er * R * 1.05, 0, Math.PI * 2); ctx.stroke();
      }
      // far side: the rim itself glows on the birth's bearing
      if (far) {
        const ang = Math.atan2(py - cy, px - cx);
        ctx.globalAlpha = env * 0.9;
        ctx.strokeStyle = col;
        ctx.shadowColor = col; ctx.shadowBlur = 26 * o.dpr;
        ctx.lineWidth = 3 * o.dpr;
        ctx.beginPath(); ctx.arc(cx, cy, R, ang - 0.5, ang + 0.5); ctx.stroke();
      }
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }

    // a held node keeps its threads showing, so you can read the note beside
    // it without having to keep the cursor parked on a dot
    //
    // Silent under a course, and this was the third separate drawing doing the
    // thing Dan asked to be rid of. The hub bundle and the hover threads were
    // the two obvious ones; this is the one that survived both fixes, because
    // a course stop is a HELD node, so opening a course drew every wikilink
    // out of the stop you were reading to notes that had been dimmed to dust a
    // moment earlier. Hunting it took three passes and a screenshot each time,
    // which is the argument for grepping every stroke in the renderer rather
    // than fixing the one you happen to think of.
    if (selected && selected !== hover && !(claim && claim.only)) {
      const sN = drawn.find((d) => d.n && d.n.id === selected);
      if (sN && sN.z > 0) {
        const links = sN.n.links || [];
        ctx.lineWidth = 1 * o.dpr;
        ctx.strokeStyle = (KIND[sN.n.kind] || KIND.plan) + '55';
        ctx.beginPath();
        for (const id of links) {
          const t = drawn.find((d) => d.n && d.n.id === id);
          if (!t || t.z <= 0) continue;
          ctx.moveTo(sN.x, sN.y); ctx.lineTo(t.x, t.y);
        }
        ctx.stroke();
        for (const id of links) {
          const t = drawn.find((d) => d.n && d.n.id === id);
          if (!t || t.z <= 0) continue;
          ctx.fillStyle = KIND[t.n.kind] || KIND.plan;
          ctx.beginPath(); ctx.arc(t.x, t.y, 3.4 * o.dpr, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1; ctx.shadowBlur = 12 * o.dpr;
        ctx.shadowColor = KIND[sN.n.kind] || KIND.plan;
        ctx.fillStyle = KIND[sN.n.kind] || KIND.plan;
        ctx.beginPath(); ctx.arc(sN.x, sN.y, 5.4 * o.dpr, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // A layer's moment OVER the notes and the held note's threads, and under
    // the hovered note's name, so a name the member is pointing at always wins.
    if (fe && layerDraw.overlay.length) runLayer('overlay', fe);
    // the write gesture's particles, over the notes
    if (ws) { ws.step(ctx, now, o.dpr, (id) => wsPos.get(id) || null); if (!ws.busy() && !forge) wsPos.clear(); }
    if (settle && now - settle.at > WRITE_MS + 2000) settle = null;
    // the hovered node says its own name, once, beside the point
    if (hover) {

      const hgt = canvas.height;
      const h = drawn.find((d) => d.n && d.n.id === hover);
      if (h && h.z > 0) {
        // the hovered node's own wikilinks, which are the only edges in here
        // anybody drew on purpose. Everything else the globe shows is computed.
        //
        // Silent while a course owns the view. Dan, 2026-08-23: hovering a stop
        // should not pull "connector lines to other non pictured nodes that
        // aren't part of the course being viewed". A stop's note is usually the
        // best-linked thing in its region, so hovering one threw a dozen lines
        // out to notes that had been deliberately dimmed to dust a moment
        // earlier, and each line ended at a dot bright enough to look clickable
        // when it is not. The route is what the course is; nothing else here is
        // an edge worth drawing over it.
        const links = (claim && claim.only) ? [] : (h.n.links || []);
        if (links.length) {
          ctx.lineWidth = 1 * o.dpr;
          ctx.strokeStyle = (KIND[h.n.kind] || KIND.plan) + '66';
          ctx.beginPath();
          for (const id of links) {
            const t = drawn.find((d) => d.n && d.n.id === id);
            if (!t || t.z <= 0) continue;
            ctx.moveTo(h.x, h.y); ctx.lineTo(t.x, t.y);
          }
          ctx.stroke();
          for (const id of links) {
            const t = drawn.find((d) => d.n && d.n.id === id);
            if (!t || t.z <= 0) continue;
            ctx.fillStyle = KIND[t.n.kind] || KIND.plan;
            ctx.beginPath(); ctx.arc(t.x, t.y, 3.6 * o.dpr, 0, Math.PI * 2); ctx.fill();
          }
        }
        // a hovered node lifts a little, so the name has something to point at
        ctx.globalAlpha = 1; ctx.shadowBlur = 10 * o.dpr;
        ctx.shadowColor = KIND[h.n.kind] || KIND.plan;
        ctx.fillStyle = KIND[h.n.kind] || KIND.plan;
        ctx.beginPath(); ctx.arc(h.x, h.y, 4.6 * o.dpr, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        // `nodeNames: false` (a published world, 4.7a D2): a node there has
        // only an internal id ("light-44"), and a land names itself through its
        // place card, so the hovered node lifts and says nothing. The
        // dashboard never passes it.
        // 4.9b: on a published world a light that holds a public note (`n.tip`,
        // its member-approved title) says it on hover; every other light stays silent
        if (o.nodeNames !== false || (o.lightNotes && h.n.tip)) {
        const name = o.nodeNames === false ? String(h.n.tip) : String(h.n.id).split('/').pop().replace(/[.]md$/i, '');
        // A ring with no explanation is a puzzle, and a puzzle about who can
        // see your notes is the wrong kind. The second line says in words what
        // the geometry says in marks, and appears only when there is something
        // to explain, so an ordinary private note still gets a bare name.
        const marks = [];
        if (h.n.see === 'public') marks.push('anyone can see this');
        else if (h.n.see === 'trusted') marks.push('shared with people you trust');
        if (h.n.shared >= o.connective) {
          marks.push((h.n.shared - 1) + ' other parts of your brain link here');
        }
        const sub = marks.join('   ');
        const big = (11 * o.dpr) + 'px ' + tok('--data', 'monospace');
        const small = (9.5 * o.dpr) + 'px ' + tok('--data', 'monospace');
        ctx.textAlign = 'center';
        ctx.font = big;
        const w1 = ctx.measureText(name).width;
        ctx.font = small;
        const w2 = sub ? ctx.measureText(sub).width : 0;
        const bw = Math.max(w1, w2);
        // Keep the whole label inside the canvas. In a sidebar this narrow a
        // two-mark label is wider than the panel, and the first thing it clips
        // is the beginning of "anyone can see this", which is the half that
        // matters most. Slide the box in rather than letting it run off, and
        // flip it under the node when there is no room above.
        const boxW = bw + 14 * o.dpr;
        const boxH = (sub ? 31 : 18) * o.dpr;
        const pad = 4 * o.dpr;
        const bx = Math.max(pad, Math.min(w - boxW - pad, h.x - boxW / 2));
        const above = h.y - (sub ? 40 : 27) * o.dpr;
        const below = h.y + 12 * o.dpr;
        const top = above < pad ? Math.min(below, hgt - boxH - pad) : above;
        const mid = bx + boxW / 2;
        ctx.globalAlpha = .93;
        ctx.fillStyle = tok('--paper-up', '#1e1e4a');
        ctx.fillRect(bx, top, boxW, boxH);
        ctx.globalAlpha = 1;
        ctx.font = big;
        ctx.fillStyle = tok('--ink', '#eef0ff');
        ctx.fillText(name, mid, top + 13 * o.dpr);
        if (sub) {
          ctx.font = small;
          ctx.fillStyle = tok('--ink-3', '#8f93b8');
          ctx.fillText(sub, mid, top + 26 * o.dpr);
        }
        ctx.textAlign = 'start';
        }
      }
    }

    // The marks go on last, so nothing can bury them. Held and hovered nodes
    // are overdrawn with a larger disc and a glow, sitting exactly where the
    // visibility ring goes, which meant the one mark on screen that must never
    // be missed was the one most likely to be hidden. Ordering is not a detail
    // when the mark says who else can read this.
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    for (const d of drawn) {
      if (d.z <= 0 || !d.n) continue;
      const marked = d.n.see && d.n.see !== 'private';
      const tissue = d.n.shared >= o.connective && (lit.has(d.n.id) || d.n.id === hover);
      if (!marked && !tissue) continue;
      // clear of whichever disc was actually drawn, including the overdraws
      const rr = Math.max(d.r || 0,
        (d.n.id === selected || d.n.id === hover) ? 5.8 * o.dpr : 0);
      if (marked) {
        ctx.strokeStyle = d.n.see === 'public' ? SEE_PUBLIC : SEE_TRUSTED;
        ctx.lineWidth = Math.max(1, 1.1 * o.dpr);
        const rings = d.n.see === 'public' ? 2 : 1;
        for (let k = 0; k < rings; k++) {
          ctx.beginPath();
          ctx.arc(d.x, d.y, rr + (2.8 + k * 2.6) * o.dpr, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      if (tissue) {
        ctx.fillStyle = PIP;
        ctx.beginPath();
        ctx.arc(d.x, d.y, Math.max(1, rr * 0.34), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // A crescent, not a ring. A full circle reads as an outline somebody drew;
    // an arc reads as light falling on one side of something round.
    //
    // Not when there is an atmosphere, though. The stroke and the halo are two
    // answers to one question, and drawn together the scattering makes the
    // edge soft and then a 1.2px line puts a drawn edge back on top of it,
    // which is the worse of the two readings winning. Where `halo` is on, the
    // limb comes from light and falloff alone.
    if (!(o.halo > 0)) {
      ctx.strokeStyle = tok('--globe-rim', 'rgba(150,175,255,.22)');
      ctx.lineWidth = 1.2 * o.dpr;
      ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
    }

    // ── the sea-art debug overlay (developer-only, sea-art brief 18.4) ─────
    // Semantic-to-presentation vectors: a dashed line from where a node's
    // truth stands to where a displacement field would draw it, with a hollow
    // ring at the destination. On top of everything and unmistakably an
    // instrument, because it exists to be read during development and must
    // never be mistaken for the artwork it is measuring. It draws only when a
    // field has been handed in through artDebug(); the resting cost is one
    // null check per frame. Nothing here displaces anything: the nodes stand
    // wherever the frame put them, and the overlay only says where the field
    // WOULD put them, which is what lets phase 2 prove the instrument before
    // phase 3 gives it something real to show.
    // A landmark stands upright on its point, in the globe's own ink, and its
    // dots grow with the world: far off it is one small bright cluster, near
    // to it the shape resolves. Round the back it is simply not drawn.
    if (landmarkList.length) {
      ctx.save();
      ctx.fillStyle = LANDMARK;
      for (const lm of landmarkList) {
        const g = rotate(orient, lm.at);
        if (g.z <= 0.05) continue;
        const q = project(g, R * 0.9, cx, cy, camZ);
        const k = R * 0.9 * q.p * LANDMARK_SIZE;
        const fade = Math.min(1, (g.z - 0.05) / 0.25) * lm.alpha;
        for (const d of lm.dots) {
          // a dot may carry its own colour (the seed's commemorative art, seed.js);
          // without one it is the globe's landmark ink like everything else
          ctx.fillStyle = d[4] || LANDMARK;
          ctx.globalAlpha = fade * (d[3] == null ? 1 : d[3]);
          ctx.beginPath();
          ctx.arc(q.x + d[0] * k, q.y + d[1] * k, Math.max(0.6 * o.dpr, d[2] * k), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    if (artDebugField) {
      ctx.save();
      ctx.setLineDash([4 * o.dpr, 4 * o.dpr]);
      ctx.lineWidth = Math.max(1, o.dpr);
      ctx.strokeStyle = PIP;
      for (const d of proj) {
        if (!d.n) continue;
        const entry = artDebugField.get(d.n.id);
        if (!entry) continue;
        // a bare unit vector, or a 3D-brief channel record carrying .at
        const want = entry.at || (isFinite(entry.x) ? entry : null);
        if (!want || !isFinite(want.x)) continue;
        const g2 = rotate(orient, normalise(want));
        if (d.z <= 0.02 && g2.z <= 0.02) continue;  // both ends on the far side
        const q2 = project(g2, R * 0.9, cx, cy, camZ);
        ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.moveTo(d.gx, d.gy); ctx.lineTo(q2.x, q2.y); ctx.stroke();
        ctx.beginPath(); ctx.arc(q2.x, q2.y, 2.6 * o.dpr, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    raf = requestAnimationFrame(tick);
  }

  // A throw inside a requestAnimationFrame callback kills the loop and says
  // nothing: the canvas keeps showing its last frame, so a dead globe looks
  // exactly like a still one. That has now cost three separate debugging
  // sessions. It reports once and keeps turning, because a globe with one
  // broken feature beats a photograph of a globe.
  let complained = false;
  // The resting rate (2026-10-07). An idle drift moves a few pixels a second,
  // and every frame still repainted the whole ball: a tab left open overnight
  // held Chrome's renderer and GPU near a fifth of a core each while the
  // member only read chat. So full rate is for when something moves (a turn,
  // a push, the mouse on the ball in the last few seconds); a drift draws at
  // 20 a second, and a window that is not in front draws at 8. dt in frame()
  // already follows the clock, so the spin keeps its speed at 20.
  let lastStir = 0, lastDrawn = 0, prevDrawn = 0, prevFull = false;
  function stir() { lastStir = performance.now(); }
  // Full rate is sixty, not the display's rate (2026-10-10). On a 120 or 144Hz
  // screen "every frame" was two to two and a half times the paint for motion
  // nobody can tell apart. The tick's `gap - 4` slack keeps a 60Hz display on
  // every frame.
  const FULL_GAP = 1000 / 60;
  // Something on the globe is PLAYING, not drifting (2026-10-10). The rest
  // gate used to wake only for a turn, a push or the member's hand, so a
  // note's write stream, its flare, a glide home and the lens easing in all
  // played at the resting 12 to 20 frames a second. Under paired
  // orchestration writes land every few seconds, so most of what the member
  // saw move was moving at rest rate: that was the chunkiness, not the drift.
  let easing = false;   // set by frame(): zoom, fit, lens or shimmer still settling
  // Every clock below is bounded by its own length, because several are only
  // cleared where they are DRAWN: a flare on a note round the back, or a
  // closeout with every coast behind the ball, would otherwise hold the globe
  // at full rate for as long as the tab is open.
  function playing(now) {
    if (easing || transits.size || forge || (ws && ws.busy())) return true;
    if (settle && now - settle.at < WRITE_MS + 2000) return true;
    if (completeAt && now - completeAt < COMPLETE_MS) return true;
    if (coastReveal && now - coastReveal < COAST_DRAW_MS + COAST_STAGGER_MS * coasts.length) return true;
    if (finalizingOn && now - finalizingOn < 60000) return true;
    for (const fl of flares.values()) if (now - fl.at < Math.max(BORN_MS, WRITE_MS)) return true;
    // an agent reading notes skims them, a dozen at a time in a build
    for (const at of skims.values()) if (now - at < SKIM_MS) return true;
    for (const fn of layerPlaying) { try { if (fn()) return true; } catch (_) {} }
    // `playing`, a mount option the dashboard never passes: a shared world's
    // tour moves the camera from outside (its zoom, its reveal), and resting
    // at 20 a second under that motion sampled a sculpture's flicker into a
    // blink (shared-world 4.7f, Dan: "the nodes in the bridge stop being so
    // annoyingly flashing" the moment a touch woke the globe)
    if (typeof o.playing === 'function') { try { if (o.playing()) return true; } catch (_) {} }
    return false;
  }
  function restGap(now) {
    // an idle turn is a drift that steers itself one frame at a time (the
    // course globe's sway); a turn that goes somewhere wants every frame
    if ((turn && !turn.idle) || sends.size || now - lastStir < 3000 || playing(now)) return FULL_GAP;
    // untouched half a minute: the deep rest, a drift at 12 a second (6 with
    // the window behind another), still moving, never a photograph
    const deep = now - lastStir > 30000;
    if (typeof document.hasFocus !== 'function' || document.hasFocus()) return deep ? 83 : 50;
    return deep ? 166 : 125;
  }
  function tick(now) {
    if (stopped) return;
    const gap = restGap(now);
    if (gap && now - lastDrawn < gap - 4) { raf = requestAnimationFrame(tick); return; }
    lastDrawn = now;
    // While the member is typing, the globe yields: every other frame is
    // skipped, halving its main-thread cost. The composer is the interaction;
    // the globe is ambience, and ambience that lags a keystroke has its
    // priorities inverted. The page flips this via easy() on composer focus.
    //
    // Halving the frame COUNT is only half of it, and was the half that let
    // #192 through: one 40ms frame still blocks a keypress whether or not the
    // next frame is skipped. easyOn also drops the highlight glow (see the
    // glow budget in the draw loop), which is what makes the frame itself
    // cheap rather than merely rarer.
    if (easyOn && (frames & 1)) {
      frames++;
      raf = requestAnimationFrame(tick);
      return;
    }
    const began = performance.now();
    try {
      frame(now);
    } catch (err) {
      if (!complained) { complained = true; console.error('[globe] frame failed:', err); }
      raf = requestAnimationFrame(tick);
    }
    // WHAT THE FRAME COST, not the gap between frames (#192). The gap was the
    // old reading and easy mode doubles it on purpose, so a few seconds of
    // typing was enough to accuse a healthy machine of struggling. A 60Hz
    // display also floors the gap at 16.7ms, which put `< 14` — the only way
    // back up — out of reach and made the governor one-way on most laptops.
    // The readout the member-zero log asked for, still: smoothed average and a
    // slowly-forgiving worst, through debug() (globeView.debug() in the
    // console), so "choppy" becomes a number and a fix becomes provable
    let ms = performance.now() - began;
    // THE GPU'S SHARE (2026-10-10). `ms` is the JS issuing the draw; the
    // raster runs after it returns, in another process, and a frame that is
    // cheap to describe and dear to paint read as healthy forever. What the
    // GPU cannot hide is DELIVERY: two full-rate frames in a row that arrive
    // a whole frame late mean something behind the JS is behind. Counted only
    // between consecutive full-rate draws (a rest gap is late on purpose) and
    // never across a hidden tab's pause.
    const since = now - prevDrawn;
    if (gap === FULL_GAP && prevFull && !easyOn && since > 34 && since < 250) ms = Math.max(ms, since - 4);
    prevFull = gap === FULL_GAP; prevDrawn = now;
    // a push's frames are not the device at rest either (see governDpr above)
    if (!sends.size) frameMs = frameMs ? frameMs * 0.95 + ms * 0.05 : ms;
    frameWorst = Math.max(ms, frameWorst * 0.995);
  }
  raf = requestAnimationFrame(tick);

  // Any node on the near face answers to the mouse. Naming a thing costs
  // nothing and refusing to name it is the interface being coy; what is
  // restricted is what a click DOES, not what the sphere will admit is there.
  function hit(ev, hoverOnly, out) {
    const r = canvas.getBoundingClientRect();
    const x = (ev.clientX - r.left) * (canvas.width / r.width);
    const y = (ev.clientY - r.top) * (canvas.height / r.height);
    let best = null, bd = 15 * o.dpr; // a fingertip, not a pixel
    // While a course owns the view its stops get a much bigger target and
    // first refusal. Dan asked for the stops to be easy to click; a route you
    // have to aim at is a route you stop using. If nothing on the course is
    // near, the click falls through to whatever else is there, and the caller
    // decides what leaving the course means.
    if (claim && claim.only && claimIds.size) {
      let sb = null, sd = 30 * o.dpr;
      for (let i = 0; i < proj.length; i++) {
        const d = proj[i];
        if (!d.n || d.z <= 0 || !claimIds.has(d.n.id)) continue;
        const dist = Math.hypot(d.x - x, d.y - y);
        if (dist < sd) { sd = dist; sb = d.n; }
      }
      if (sb) { if (out) out.d = sd; return sb; }
      // THE COURSE IS NOW A ROOM YOU LEAVE BY THE DOOR, and this reverses an
      // earlier decision on purpose rather than by drift.
      //
      // Dan, 2026-08-23, asked that clicking a dimmed node exit the course,
      // because at the time there was no other way out and a course you cannot
      // leave is a trapdoor. Dan, 2026-09-05, asked for the opposite: an
      // explicit exit control, and until it is pressed "the course is still
      // there and none of the other nodes appear selectable". The reason the
      // first answer was right is gone — there IS a door now — and the reason
      // the second is better is that an accidental press on the sphere threw
      // away the whole view. Falling through here is what made that possible,
      // so it stops here for a click exactly as it always has for a hover.
      return null;
    }
    for (let i = 0; i < proj.length; i++) {
      const d = proj[i];
      if (!d.n || d.z <= 0) continue;
      const dist = Math.hypot(d.x - x, d.y - y);
      if (dist < bd) { bd = dist; best = d.n; }
    }
    if (out) out.d = best ? bd : Infinity;
    return best;
  }

  // A LAYER'S OWN MARKS ANSWER TO THE MOUSE TOO. A mark a layer draws with no
  // node behind it never appears in `proj`, so the node test above cannot see
  // it; the layer's own hit test can. Tried AFTER the node test, never before,
  // and -1 with no layer, so a vault with nothing claimed answers exactly as
  // it did.
  function markHit(ev, out) {
    if (out) out.d = Infinity;
    for (const fn of layerHit) {
      const o2 = {};
      const i = fn(ev, o2);
      if (i >= 0) { if (out) out.d = o2.d; return i; }
    }
    return -1;
  }

  // NEAREST WINS, and it has to, because the two targets overlap.
  //
  // An interchange gets a 30px grab so the big places stay easy to click, which
  // was right when it was the only thing on the line. With fine grain under it
  // that radius silently ate the first four stations of every phase: measured,
  // a click straight on a station 12px from its interchange opened the
  // interchange. Asking which mark is actually CLOSER is the only rule that
  // keeps a generous target where there is room and gives way where there
  // is not.
  function hitAny(ev) {
    const nOut = {}, rOut = {};
    const n = hit(ev, false, nOut);
    const i = markHit(ev, rOut);
    if (i >= 0 && rOut.d < nOut.d) return { mark: i };
    if (n) return { node: n };
    return i >= 0 ? { mark: i } : {};
  }

  canvas.addEventListener('pointermove', function (ev) {
    stir();
    const nOut = {}, rOut = {};
    const n = hit(ev, true, nOut);
    const i = markHit(ev, rOut);
    if (i >= 0 && rOut.d < nOut.d) { hover = null; hoverMark = i; }
    else { hover = n ? n.id : null; hoverMark = n ? -1 : i; }
    canvas.style.cursor = (hover || hoverMark >= 0) ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerleave', function () {
    hover = null; hoverMark = -1; canvas.style.cursor = 'default';
  });
  canvas.addEventListener('click', function (ev) {
    if (dragging && dragging.moved) return; // a turn is not a click
    const h = hitAny(ev);
    if (h.node && picked) { picked(h.node); return; }
    // The grain: a station or a waypoint, which has no node to pick.
    if (h.mark >= 0 && layerPress.some((fn) => fn(h.mark))) return;
    const n = h.node;
    // Pressing bare sphere is a gesture in its own right and it was being
    // thrown away. The caller decides what that means; here it only stops
    // being silence. A turn already returned above, so this fires on a real
    // press and not on the end of a drag. While a course owns the view the
    // caller now does NOTHING with it — see the door, above.
    if (!n && empty) empty();
  });
  // A SECOND press on the same node is a different sentence: open it properly.
  // Single click reads a note beside the globe, which is the cheap gesture and
  // the one done by accident; double click is the member saying they want the
  // whole surface for it. The single click still fires first and that is on
  // purpose — the peek opening and then the full view arriving reads as one
  // escalation rather than as two competing answers. Dan, 2026-09-03.
  canvas.addEventListener('dblclick', function (ev) {
    if (dragging && dragging.moved) return;
    const n = hit(ev);
    if (n && opened) opened(n);
  });

  // Google Earth's two gestures and nothing else: drag the ground to turn it,
  // wheel to come closer. No handles, no compass rose, no reset button. The
  // sphere is the control.
  //
  // A shared world on a phone (1.8) asks for more: two fingers, a flick that
  // coasts, a tap on a land. Those live in their own block below, taken only
  // when the mount passes `pinch`, `inertia` or `onTap`. Without them this
  // block is the one that runs, exactly as before.
  const touchKit = !!(o.pinch || o.inertia || o.onTap);
  if (o.explore && !touchKit) {
    canvas.addEventListener('pointerdown', function (ev) {
      stir();
      if (hit(ev)) return; // pressing a node is a click, not a grab
      dragging = { x: ev.clientX, y: ev.clientY, moved: false };
      // pressing the ground rather than a node releases whatever was held, and
      // the world picks its pace back up.
      //
      // ALWAYS reported, not only when a single node was `selected`. Reaching
      // for the ground to turn the ball is letting go of whatever the sphere
      // was holding — and a REGION is held without anything being `selected`,
      // so under the old gate a member could drag a lit, receded, shimmering
      // region around the screen and nothing was ever told they had moved on.
      // Dan, 2026-09-03: dragging away should put it down.
      //
      // It reports WHETHER a single node was actually held, because the two
      // callers want different halves of this. Letting go of a held node stops
      // the breathing that marked it; letting go of the ground while the brain
      // is mid-write must NOT, or dragging the ball to look around would kill
      // the one signal the globe exists to carry. Under the old gate that could
      // not happen, since this only fired when something was selected.
      const held = !!selected;
      selected = null;
      if (released) released(held);
      canvas.setPointerCapture(ev.pointerId);
      canvas.style.cursor = 'grabbing';
      idleAt = performance.now();
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (!dragging) return;
      const dx = ev.clientX - dragging.x, dy = ev.clientY - dragging.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragging.moved = true;
      dragging.x = ev.clientX; dragging.y = ev.clientY;
      // A trackball, and the only rule is that the surface goes where the hand
      // goes. The vertical axis was inverted: dragging DOWN pushed the surface
      // UP, so grabbing the globe and pulling up and to the right brought the
      // top-left toward you instead of the bottom-left. Nobody reads that as a
      // bug, they read it as the globe being slippery and stop dragging it.
      // Screen y grows downward and v.y grows upward, which is where the sign
      // went missing. Locked by a test now rather than by this comment.
      // SLOWER WHILE A COURSE IS BEING READ. Dan, 2026-09-05: "the camera is
      // also way too sensitive currently, it should be slower, smoother in this
      // view." The gain that feels right for spinning a whole vault is far too
      // hot for a surface where the subject is one line and every gesture is an
      // adjustment rather than a journey — the same argument the idle rate
      // already makes when it drops to `o.slow` for a held node.
      // 0.0022 → 0.0009 → 0.0002, in three passes, each one Dan looking at it
      // again, and each one another constant. **The fourth report, 2026-09-08:
      // "when I zoom in to the course and then grab the globe, the globe starts
      // turning way too fast."** Four reports of one symptom is the file telling
      // you the shape is wrong, not the number.
      //
      // It was. The gain no longer lives here; it is `dragGain`, which divides
      // by the zoom, and the reasoning is written there next to the code it
      // governs rather than at the call site. The base for a course also dropped
      // 0.0002 → 0.0001 in the same pass, because Dan asked for it slower on top
      // of the fix, so at the course ceiling of 8x this is sixteen times slower
      // than it was this morning.
      orient = dragTurn(orient, dx, dy, dragGain(claim, userZoom));
      turn = null; // the hand overrules whatever the conversation was doing
      idleAt = performance.now();
    });
    const release = function (ev) {
      if (!dragging) return;
      try { canvas.releasePointerCapture(ev.pointerId); } catch (_) {}
      setTimeout(function () { dragging = null; }, 0);
      canvas.style.cursor = 'default';
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }
  // The touch kit (shared-world 1.8): pointers by id, so a second finger is a
  // pinch rather than a jump; a release with speed coasts; a short still press
  // on bare ground is a tap. One pointer turns the ball exactly as above.
  if (o.explore && touchKit) {
    const pointers = new Map();   // id -> { x, y, sx, sy, at }
    let pinchFrom = null;         // { dist, zoom } while two fingers are down
    let vel = { vx: 0, vy: 0 }, movedAt = 0;
    const twoDist = function () {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    canvas.addEventListener('pointerdown', function (ev) {
      stir();
      coast = null;   // a finger on the ground stops a coast
      // pressing a node is a click, not a grab; but a shared world's lights are
      // its notes (4.9d, D11), so with `tapNodes` a press on one is tracked like
      // the ground and a still release reaches `onTap`. The dashboard never passes it.
      if (!pointers.size && !o.tapNodes && hit(ev)) return;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, sx: ev.clientX, sy: ev.clientY, at: performance.now(), multi: pointers.size > 0 });
      try { canvas.setPointerCapture(ev.pointerId); } catch (_) {}
      idleAt = performance.now();
      if (pointers.size === 1) {
        dragging = { x: ev.clientX, y: ev.clientY, moved: false };
        const held = !!selected;
        selected = null;
        if (released) released(held);
        canvas.style.cursor = 'grabbing';
        vel = { vx: 0, vy: 0 };
      } else if (o.pinch && pointers.size === 2) {
        for (const p of pointers.values()) p.multi = true;
        pinchFrom = { dist: twoDist(), zoom: userZoom };
        if (dragging) dragging.moved = true;
      }
    });
    canvas.addEventListener('pointermove', function (ev) {
      const p = pointers.get(ev.pointerId);
      if (!p) return;
      const dx = ev.clientX - p.x, dy = ev.clientY - p.y;
      const t = performance.now();
      p.x = ev.clientX; p.y = ev.clientY;
      idleAt = t;
      if (pinchFrom && pointers.size >= 2) {
        if (o.pinch) view.zoomTo(pinchZoom(pinchFrom.zoom, pinchFrom.dist, twoDist()));
        return;
      }
      if (pointers.size > 1) return;
      if (dragging) {
        if (Math.hypot(p.x - p.sx, p.y - p.sy) > 2) dragging.moved = true;
        dragging.x = p.x; dragging.y = p.y;
      }
      orient = dragTurn(orient, dx, dy, dragGain(claim, userZoom));
      turn = null;
      if (o.inertia) {
        const span = Math.max(1, t - (movedAt || t - 16));
        vel = { vx: vel.vx * 0.6 + (dx / span) * 0.4, vy: vel.vy * 0.6 + (dy / span) * 0.4 };
        movedAt = t;
      }
    });
    const lift = function (ev, cancelled) {
      const p = pointers.get(ev.pointerId);
      if (!p) return;
      pointers.delete(ev.pointerId);
      try { canvas.releasePointerCapture(ev.pointerId); } catch (_) {}
      const t = performance.now();
      if (pointers.size === 1) {
        // the finger left behind carries on turning from where it is now
        pinchFrom = null;
        vel = { vx: 0, vy: 0 }; movedAt = 0;
        return;
      }
      if (pointers.size) return;
      pinchFrom = null;
      canvas.style.cursor = 'default';
      setTimeout(function () { dragging = null; }, 0);
      if (cancelled || p.multi) return;
      const travel = Math.hypot(ev.clientX - p.sx, ev.clientY - p.sy);
      if (o.onTap && t - p.at < 300 && travel < 6) { o.onTap({ x: ev.clientX, y: ev.clientY }); return; }
      if (o.inertia && t - movedAt < 80) {
        const speed = Math.hypot(vel.vx, vel.vy);
        if (speed > INERTIA_START) {
          const k = Math.min(1, INERTIA_MAX / speed);
          coast = { vx: vel.vx * k, vy: vel.vy * k };
        }
      }
    };
    canvas.addEventListener('pointerup', function (ev) { lift(ev, false); });
    canvas.addEventListener('pointercancel', function (ev) { lift(ev, true); });
  }
  if (o.explore) {
    if (o.wheel) canvas.addEventListener('wheel', function (ev) {
      stir();
      ev.preventDefault();
      // Same argument as the drag gain: one notch of a wheel moved the course
      // view 8%, which on a line you are trying to read a station on is a jump
      // rather than an adjustment. A third of that is still four notches to
      // cross the useful range and it stops overshooting.
      const step = claim ? 0.972 : 0.92;
      // THE CEILING LIFTS WHILE A COURSE IS UP (13.7). Dan: "allow the user to
      // zoom in more." 3.2 is a sensible cap for a whole vault, where past it
      // you are inside a cloud of specks with no frame of reference; a course is
      // the opposite case — it is one line, it stays a line however close you
      // get, and the reason to come closer is to read a two-pixel station. So
      // the course view gets 8x and the vault keeps 3.2x. The FLOOR is untouched
      // and is still the framing solver's, so nothing here can pull the camera
      // back past the fit it solved for.
      const ceil = claim ? 8 : 3.2;
      userZoom = Math.max(zoomFloor(), Math.min(ceil, userZoom * (ev.deltaY > 0 ? step : 1 / step)));
      idleAt = performance.now();
    }, { passive: false });
  }

  const view = {
    // Give the canvas back. Safe to call twice, and a stopped view stays
    // stopped: the last frame remains on the canvas, which is what a paused
    // scene should look like.
    stop() {
      stopped = true;
      if (raf != null) cancelAnimationFrame(raf);
      raf = null;
    },
    // Take it back. stop() was one-way while the only caller was the store,
    // which mounts a scene and leaves it; the phone stack needs the other
    // half, because a viewport that stopped drawing this globe can turn
    // sideways and start again. Idempotent, and a running view ignores it.
    start() {
      if (!stopped) return;
      stopped = false;
      raf = requestAnimationFrame(tick);
    },
    // Everything the renderer decided this frame, as plain numbers.
    //
    // This exists because every bug in here has been INVISIBLE rather than
    // loud: a globe framed at the wrong distance still draws a globe, one
    // turning the wrong way still turns, and a palette read at the wrong moment
    // still paints. Three separate times the fastest way to the answer was to
    // read these values rather than to reason about the code, and twice the
    // reasoning had been wrong. It costs one object per call and nothing per
    // frame, which is a fair price for not having to guess.
    debug() {
      // what a layer adds (see "the layer seam"), laid over the core's own
      const more = layerDebug.map((fn) => { try { return fn(); } catch (_) { return null; } });
      return Object.assign({ frames: frames, frameMs: Math.round(frameMs * 10) / 10, frameWorst: Math.round(frameWorst), dpr: o.dpr, easy: easyOn, coasts: coasts.length, coastLit: coastLit, artDebug: artDebugField ? artDebugField.size : 0, sends: sends.size, lit: lit.size, whole: whole, grav: grav, fit: fit, fitWant: fitWant,
        fitAngle: fitAngle, zoom: zoom, userZoom: userZoom, nodes: nodes.length, visiting: visiting,
        // `writing` sat beside `visiting` in the draw loop and was missing here,
        // so "did that gesture just kill the write marker" was unanswerable from
        // the console — which is the exact question a ground-press that now
        // always reports raises. Added 2026-09-03 while checking it does not.
        writing: writing, selected: selected, spark: sparkLevel,
        // the caption's own two facts: which land it is showing, and whether
        // the chat on screen is working in it. Both readable, because a setter
        // that only returns its own argument is not an instrument.
        landCap: landCapSlug, workLand: workLand,
        // The WANT beside the drawn level. They answer different questions and
        // conflating them cost a wrong conclusion: `spark` is what is on screen
        // and needs frames to move, so in a throttled tab it reads as a frozen
        // number that says nothing about whether the shimmer is armed.
        sparkWant: !!sparkWant, sparkSet: sparkSet ? sparkSet.size : 0,
        R: Math.min(canvas.width, canvas.height) * (o.idleR + (o.focusR - o.idleR) * zoom) * userZoom * fit * o.sphere,
        cw: canvas.width, ch: canvas.height,
        // Where the lit node actually LANDED, against where the frame's middle
        // is. "It looks off-centre" is not a measurement, and reading pixels off
        // a screenshot to answer it is how an afternoon goes: this answers it.
        cx: canvas.width * o.cxFrac, cy: canvas.height * o.arcTop + (Math.min(canvas.width, canvas.height) * (o.idleR + (o.focusR - o.idleR) * zoom) * userZoom * fit * o.sphere),
        aimId: aimId,
        aim: (() => {
          const d = proj.find((q) => q.n && (aimId ? q.n.id === aimId : lit.has(q.n.id)));
          return d ? { x: Math.round(d.x), y: Math.round(d.y), z: +d.z.toFixed(3) } : null;
        })() }, ...more);
    },
    onPick(cb) { picked = cb; },
    onRelease(cb) { released = cb; },
    onEmpty(cb) { empty = cb; },
    // A double press on a node. Registered separately from onPick because the
    // two gestures mean different things and the caller decides both: reading
    // beside the globe, versus giving the note the whole surface.
    onOpen(cb) { opened = cb; },
    // The region shimmer, on or off. A VIEW rather than a state, like whole():
    // it changes nothing about what is lit, held, or where anything sits, only
    // how the lit set is drawn. Returns whether it is on, so a caller can tell.
    // `ids` is what it plays over, defaulting to whatever is lit right now.
    // Passing it explicitly matters for the way OUT: the caller usually drops
    // the focus in the same breath, and the shimmer has to keep shimmering
    // over the notes it was already on for as long as the ramp lasts.
    sparkle(on, ids) {
      const want = on == null ? !sparkWant : !!on;
      if (want) {
        if (!sparkWant) sparkAt = performance.now();
        sparkWant = 1;
        const from = (ids && ids.length) ? ids : [...lit];
        if (from.length) sparkSet = new Set(from);
      } else {
        sparkWant = 0;   // the ramp takes it down; sparkSet is dropped there
      }
      return !!sparkWant;
    },
    // What is actually DRAWN, 0 to 1 — never what was asked for. Reporting the
    // want would have said "1" while a course was suppressing the shimmer
    // entirely, which is the shape of answer that makes an instrument worse
    // than none: it agrees with you about a thing that is not on screen.
    sparkling() { return sparkLevel; },
    // Hold one node: centre it, keep its threads drawn, and slow the world.
    // centroid() of a single point is that point, so the same turn that finds
    // a cluster finds this, and `face` is already the direction that lands at
    // the middle of the canvas.
    // Hold a node: centred, its own threads drawn, the world slowed around it.
    //
    // `keepFrame` holds the node WITHOUT re-framing on it, which is what a
    // course needs. Selecting normally replaces the lit set with one node and
    // re-fits the camera to it, so a course that had just framed all its stops
    // was clobbered the moment its first stop was selected: the view zoomed to
    // one island instead of the voyage.
    select(id, keepFrame) {
      stirred();
      selected = id || null;
      if (!id) return;
      if (keepFrame) { lit.add(id); return; }
      lit = new Set([id]);
      this.focus([id], id);
    },
    // PUT DOWN whatever is held, without re-aiming the camera.
    //
    // `focus([])` also does this, and using it here was wrong in a way that is
    // only visible on screen: it resets `fitAngle` to zero, so the standing-back
    // that framed the region is thrown away too and the camera lurches in to the
    // default surface the instant a member presses bare sphere. Letting go of a
    // region is not a request to go somewhere; it is a request to stop leaning.
    //
    // So the lit set, the lens centre and the selection go, which is what makes
    // `grav` ease back to zero and takes the recede off every other node — and
    // the framing stays exactly where the member was looking, so they can turn
    // the ball from there. Dan, 2026-09-03: deactivated, and not blurry.
    release() {
      lit = new Set();
      gravAt = null;
      aimId = null;
      selected = null;
    },
    // Called when the conversation starts touching files, never on click. The
    // globe holding still through a click is what makes the motion mean that
    // work is happening.
    nodes() { return nodes; },
    // Step back to the whole ball, or come back in to the surface. Returns
    // where it ended up so a button can show which way it now points.
    whole(on) {
      stirred();   // standing back, or coming in, is the member moving the view
      whole = on == null ? !whole : !!on;
      userZoom = 1;   // the wheel and this are the same control, so one resets the other
      return whole;
    },
    isWhole() { return whole; },
    // Set the zoom outright rather than nudging it. `fitZoom` only ever stands
    // BACK to fit a wide patch: it returns at most 1, so a tight little course
    // sat in the corner of a full-size globe because nothing was asking the
    // camera to come closer. This is that ask, and it shares one number with
    // the wheel so the two cannot fight.
    zoomTo(f) {
      whole = false;
      userZoom = Math.max(zoomFloor(), Math.min(3.2, f || 1));
      return userZoom;
    },
    // How wide the current focus actually is, in radians, so a caller can work
    // out how far in to come.
    spread() {
      const pts = nodes.filter((n) => lit.has(n.id)).map((n) => n.at);
      if (pts.length < 2) return 0;
      const c = normalise(centroid(pts));
      let w = 0;
      for (const a of pts) {
        const d = Math.acos(Math.max(-1, Math.min(1, c.x * a.x + c.y * a.y + c.z * a.z)));
        if (d > w) w = d;
      }
      return w;
    },
    zoomBy(f) {
      // the same ceiling the wheel has (13.7): 8x while a course is up
      whole = false; userZoom = Math.max(zoomFloor(), Math.min(claim ? 8 : 3.2, userZoom * f)); idleAt = performance.now(); },
    // true while somebody's hands are on it, so the controls know to show
    busy() { return performance.now() - idleAt < 2200; },
    // `aim` is the note the turn lands on and the lens is centred on: the piece
    // with the most in it, not the average of the group. An average is nobody's
    // note, and it put the lead at the bottom edge of the panel with every
    // thread running off frame, which is the opposite of what was asked for.
    // `keep` (optional) = { at: unit vector, reach: angular radius }: a thing
    // that must be in the frame with the notes, the region's own art (Dan,
    // 2026-09-26: "whenever a region is selected ... the art piece ... will
    // always appear well framed related to the camera view of the region").
    focus(ids, aim, keep) {
      stirred();   // re-armed by the region path, which calls sparkle(true) after
      lit = new Set(ids || []);
      const pts0 = nodes.filter((n) => lit.has(n.id));
      // where the lens is centred, in the sphere's own coordinates, so it does
      // not drift as the globe keeps turning underneath it
      const led = aim && lit.has(aim) ? nodes.find((n) => n.id === aim) : null;
      gravAt = led ? normalise(led.at) : (pts0.length ? centroid(pts0.map((n) => n.at)) : null);
      // How wide the patch is, so the camera can frame it. Two decisions here,
      // both measured against the real vault rather than picked.
      //
      // The 80th percentile rather than the widest member: a project is not a
      // neighbourhood. Its notes are spread across daily, intelligence and the
      // project folder, and apc-ai-course has one straggler 58 degrees from the
      // rest. Framing to the straggler pulls the camera so far back that the
      // other six become specks, which trades one unreadable view for another.
      // At the 80th it frames 5 of 7 for apc-ai-course, 4 of 5 for apc-crm,
      // 8 of 10 for career-assessment: a clear majority in view, the rest still
      // lit and still there when the globe comes round.
      //
      // The cap keeps the horizon on screen and the surface close, which is the
      // whole feel of the thing. Both of these are working around the placement
      // vectors being structural (path tokens) rather than semantic. Real
      // embeddings would put a project's notes near each other and most of this
      // would stop mattering; the server already knows that and says so.
      fitAngle = 0;
      if (gravAt) {
        const ang = pts0.map((n) => {
          const u = normalise(n.at);
          return Math.acos(Math.max(-1, Math.min(1, u.x * gravAt.x + u.y * gravAt.y + u.z * gravAt.z)));
        }).sort((a, b) => a - b);
        const p80 = ang[Math.min(ang.length - 1, Math.floor(0.8 * (ang.length - 1)))];
        fitAngle = Math.min(0.8, p80 * 1.18 + 0.06);
      }
      if (!pts0.length) return;
      // THE ART IN THE FRAME. The frame is the smallest cap holding both the
      // notes' patch and the art's own reach (it stands up off the land and
      // leans forward in hand, so its reach is more than its footprint): the
      // aim slides along the arc toward the art only as far as it has to.
      let art = null;
      if (keep && keep.at && gravAt) {
        const k = normalise(keep.at), reach = keep.reach || 0.3;
        const d = Math.acos(Math.max(-1, Math.min(1, k.x * gravAt.x + k.y * gravAt.y + k.z * gravAt.z)));
        if (d + reach > fitAngle && d > 1e-4) {
          const want = (fitAngle + d + reach) / 2, slide = Math.min(d, want - fitAngle);
          const s = Math.sin(d), a = Math.sin(d - slide) / s, b = Math.sin(slide) / s;
          gravAt = normalise({ x: gravAt.x * a + k.x * b, y: gravAt.y * a + k.y * b, z: gravAt.z * a + k.z * b });
          fitAngle = Math.min(0.95, want);
        }
        art = k;
      }
      // Aim at the face the camera will SETTLE at, not the one it has now.
      // `face` is the direction that projects to the middle of the canvas, and
      // it depends on the radius, so it moves while the camera is pulling back
      // to frame the patch. Aiming at today's face and then pulling back walks
      // the target off the edge, and it looks like a projection bug rather than
      // a timing one, which is what makes it worth writing down. Solving the
      // settled face here also means the turn no longer has to wait a frame for
      // the renderer to work one out.
      const cw = canvas.width, ch = canvas.height;
      const m = fitAngle ? fitZoom(fitAngle, cw, ch, o) : 1;
      // Aim at the radius the marks are DRAWN at, not at the surface. This was
      // the last camera still making that mistake: the course was fixed for it
      // (radMean, below) and the newborn visit was written with it, while a
      // plain project click — much the most common way anybody sees this globe
      // — kept aiming low by about 73px of an 842px panel. When there is a lead
      // note the aim IS that note, so it answers for itself; a centroid is
      // nobody's note, so the group answers on average, as the course does.
      const rad = led ? drawnRadius(led.at, led.depth)
        : pts0.reduce((t, n) => t + drawnRadius(n.at, n.depth), 0) / pts0.length;
      aimId = led ? led.id : null;
      const settled = solveFace(Math.min(cw, ch) * o.focusR * userZoom * m,
        ch, o.focusCam, o.arcTop, rad);
      let target = quatFromTo(rotate(orient, gravAt), settled);
      // ...AND ALWAYS THE SAME WAY UP. The shortest turn leaves the roll to
      // wherever the camera came from, so the art could land anywhere round
      // the region, off the bottom of the frame or upside down. Rolled about
      // the aim until the art stands straight above it, a region looks the
      // same every time it is chosen, in the sidebar and the full view alike,
      // and an upright piece is seen from the side, standing up, where the
      // ground meets the view obliquely.
      if (art) {
        const s = normalise(settled), p = rotate(qmul(target, orient), art);
        const pd = p.x * s.x + p.y * s.y + p.z * s.z, pt = { x: p.x - s.x * pd, y: p.y - s.y * pd, z: p.z - s.z * pd };
        const ut = { x: -s.x * s.y, y: 1 - s.y * s.y, z: -s.z * s.y };
        if (Math.hypot(pt.x, pt.y, pt.z) > 1e-4) {
          const c = cross(pt, ut), th = Math.atan2(c.x * s.x + c.y * s.y + c.z * s.z, pt.x * ut.x + pt.y * ut.y + pt.z * ut.z);
          target = qmul(axisAngle(s, th), target);
        }
      }
      turn = { from: orient, to: qmul(target, orient), start: performance.now() };
    },
    // Go and look at one note: sail to it, lean in, let it breathe, stand back.
    //
    // Returns the milliseconds until the camera ARRIVES, so a caller can time
    // the note's name to the landing rather than to the departure — which is
    // the whole point of the change, since the name used to appear while the
    // eye was still somewhere else on the sphere.
    //
    // Deliberately declines in three cases and says so by returning 0:
    // reduced motion (the beat is enough, a swooping camera is exactly what
    // that setting is about), hands on the globe (a member mid-drag is looking
    // at something, and a note landing elsewhere is not a reason to take it
    // away from them), and a live course (the camera is already framing a
    // voyage somebody asked for).
    // AUDIT, 2026-08-31: this now has no caller. Births were its only one and
    // they moved to the camera scheduler (cameraSend in globe-live.js), which
    // arbitrates all autonomous motion in one place and defers rather than
    // refusing. Kept because it is the only camera that books a RETURN flight,
    // and because globe.test.js pins the settled-face solve that land() shares.
    // Do not reach for it for new work: a member-driven move is land(), and an
    // autonomous one belongs in the scheduler where it can be deferred.
    visit(id, holdMs) {
      const n = nodes.find((x) => x.id === id);
      if (!n || !n.at) return 0;
      if (calm) return 0;
      if (performance.now() - idleAt < 2200) return 0;
      if (claim && claim.count) return 0;
      stirred();   // an autonomous flight to one note is movement elsewhere
      // captured before the first visit overwrites anything, and NOT refreshed
      // by a second arrival mid-flight (see visitBack's note above)
      if (!visitBack) visitBack = { lit, gravAt, fitAngle, whole, userZoom };
      clearTimeout(visitT);
      visiting = id;
      aimId = id;
      lit = new Set([id]);
      gravAt = normalise(n.at);
      fitAngle = VISIT_ANGLE;
      whole = false;
      userZoom = VISIT_ZOOM;
      // the face the camera will SETTLE at, solved here for the same reason
      // focus() solves it: aiming at today's face and then moving the radius
      // walks the target off the edge
      const cw = canvas.width, ch = canvas.height;
      const m = fitZoom(fitAngle, cw, ch, o);
      // Aim at the radius the mark is DRAWN at (see drawnRadius). This camera
      // comes in closest of the three, so it is where getting it wrong stops
      // being a drift and becomes a note that is not on screen: the first
      // framing tried put it 332px out on an 842px canvas, clean off the top of
      // the globe, which is how the whole class of bug got looked at again.
      const settled = solveFace(Math.min(cw, ch) * o.focusR * userZoom * m, ch, o.focusCam, o.arcTop,
        drawnRadius(n.at, n.depth));
      turn = { from: orient, to: qmul(quatFromTo(rotate(orient, gravAt), settled), orient),
        start: performance.now(), ms: VISIT_MS };
      visitT = setTimeout(() => {
        visitT = null;
        visiting = null;
        const back = visitBack;
        visitBack = null;
        if (!back) return;
        // Only the framing is restored, never the orientation. zoom, grav and
        // fit all ease on their own, so handing them back their old values IS
        // the flight home; snapping `orient` as well would fight the idle
        // drift and read as the globe being yanked
        lit = back.lit; gravAt = back.gravAt; fitAngle = back.fitAngle;
        whole = back.whole; userZoom = back.userZoom;
      }, VISIT_MS + (holdMs == null ? 2600 : holdMs));
      return VISIT_MS;
    },
    // Marking a note as the one being written into is movement elsewhere;
    // CLEARING that mark is not, and must not be, because the region path sets
    // its lead breathing on the way in and drops it 2600ms later. A clear that
    // dropped the shimmer would put a two-and-a-half second fuse on every
    // region a member opened.
    // `work` says the agent is writing it (the write gesture plays); the
    // region path's lead breathes without it. Clearing a worked note settles it.
    writing(id, work) {
      if (id) stirred();
      if (forge && forge !== (work ? id : null)) settle = { id: forge, at: performance.now(), burst: false };
      forge = id && work ? id : null;
      if (forge && settle && settle.id === forge) settle = null;
      writing = id;
    },
    // A note that has just been WRITTEN to: one beat, not a loop.
    pulse(id) {
      if (!id) return;
      if (!nodes.some((n) => n.id === id)) return;
      stirred();
      flares.set(id, { at: performance.now(), born: false });
    },
    // Notes that just left this machine. Takes the whole set at once, because
    // the stagger is a property of the SET: how many went is what decides how
    // fast they go. Returns how long the whole departure runs, so a caller can
    // wait for it. Silent under reduced motion, like every other spectacle.
    send(ids) {
      if (calm) return 0;
      const live = (ids || []).filter((id) => nodes.some((n) => n.id === id)).slice(0, SEND_MAX);
      if (!live.length) return 0;
      const t0 = performance.now();
      const gap = live.length > 1 ? SEND_SPREAD_MS / (live.length - 1) : 0;
      live.forEach((id, i) => {
        const was = sends.get(id);
        // A column already up does NOT start over. This is the whole reason a
        // second push arriving mid-flight reads as one long departure rather
        // than a stutter: the climb is kept, only the hold is extended.
        const at = was ? was.at : t0 + i * gap;
        const hold = t0 + i * gap + SEND_RISE_MS + SEND_HOLD_MS;
        sends.set(id, { at, hold: Math.max(was ? was.hold : 0, hold) });
      });
      return SEND_RISE_MS + SEND_HOLD_MS + SEND_SETTLE_MS + gap * (live.length - 1);
    },
    // A note that was READ: light, no ring, no camera. See `skims` above for
    // why this is a separate gesture rather than a quieter pulse.
    skim(id) {
      if (!id || calm) return false;
      if (!nodes.some((n) => n.id === id)) return false;
      skims.set(id, performance.now());
      return true;
    },
    // ── the two member-driven cameras ──────────────────────────────────────
    // `visit` is autonomous and declines in three cases. These two are the
    // member asking, and they cannot decline: a click IS hands on the globe, so
    // visit's own "hands on the globe" guard would refuse its own trigger.
    // Neither books a return flight, because there is nothing to return from —
    // the member is where they asked to be.
    //
    // Under reduced motion they still MOVE, and cut instead of swooping. The
    // setting is about unrequested motion; a member who clicked a row asked for
    // this one, and refusing it would just be a broken link.
    land(id) { return aimAt(id, VISIT_ANGLE, VISIT_ZOOM, VISIT_MS); },
    // The same flight, flown closer, for the one arrival that is a first sight.
    arrive(id) { return aimAt(id, ARRIVE_ANGLE, ARRIVE_ZOOM, VISIT_MS); },
    // The agent writing this note: framed low, with sky above for the write
    // gesture. `close` is a birth, which leans in nearer as arrive() does.
    // the note the member is reading, lifted (null puts it down)
    hold(id) { held = id || null; },
    // A SHARED WORLD'S NOTE KEEPS ITS LINKS DRAWN (4.9b): the node is selected
    // and nothing else moves (no lit set, no reframe, no camera), so the
    // selected node's own links draw until it is let go with null. The
    // dashboard never calls this.
    showLinks(id) { stirred(); selected = id || null; },
    watch(id, close) {
      return close ? aimAt(id, ARRIVE_ANGLE, ARRIVE_ZOOM, VISIT_MS, WATCH_TY)
        : aimAt(id, WATCH_ANGLE, WATCH_ZOOM, VISIT_MS, WATCH_TY);
    },
    // How long a visit takes, so a caller sequencing two legs can time the
    // second without keeping its own copy of this number.
    visitMs() { return VISIT_MS; },
    preview(id) { return aimAt(id, PREVIEW_ANGLE, PREVIEW_ZOOM, PREVIEW_MS); },
    // Frame a set rather than tour it, for a burst of writes. This delegates to
    // focus() because focus() already solves exactly the right problem: it
    // takes the spherical mean of the members' own 3D positions and fits to
    // their 80th-percentile spread. Worth saying plainly, since the obvious
    // worry with averaging positions is the dateline, and that is a hazard of
    // averaging LAT/LONG. Averaging unit vectors and renormalising has no seam
    // to fall down.
    frame(ids) {
      const live = (ids || []).filter((id) => nodes.some((n) => n.id === id));
      if (!live.length) return 0;
      if (live.length === 1) return aimAt(live[0], VISIT_ANGLE, VISIT_ZOOM, VISIT_MS);
      // called as view.frame(...), which is how every call site in this app
      // reaches the view, so `this` is the view
      this.focus(live, null);
      return VISIT_MS;
    },
    // A note the globe already KNOWS whose place just changed (a retag, #177):
    // the edit beat with a second ring, never the birth spectacle — the note
    // was always there, the map just learned where it goes. `quiet` moves it
    // with no flare at all, for the one-sweep relayout when the map is drawn
    moved(id, patch, at, quiet) {
      const n = nodes.find((x) => x.id === id);
      if (!n || !at) return false;
      Object.assign(n, patch || {});
      if (calm || !n.at) {
        n.at = at;             // reduced motion, or a node with no place yet
      } else {
        // glide from wherever it IS - mid-transit included - to the new place
        const from = transitPos(n, performance.now());
        transits.set(id, { from, to: at, start: performance.now(), ms: quiet ? SWEEP_TRANSIT_MS : TRANSIT_MS });
      }
      proj = [];   // rebuilt next frame from the new positions
      if (!quiet) flares.set(id, { at: performance.now(), born: false, moved: true });
      return true;
    },
    // A note that has just been CREATED. It joins the globe at the position it
    // was given, and arrives rather than appearing: a place that was never
    // there should not simply be there the next frame.
    //
    // Returns false if the globe already knows it, so a caller can tell a birth
    // from an ordinary write without keeping its own list.
    // `opts.quiet` keeps the arrival and drops the theatre. A birth is the
    // loudest thing this globe does, and it was the same volume every time:
    // right for the first light a member ever sees, wrong for the twelfth in
    // four minutes, which is how first light actually behaves now that notes
    // are born while somebody is still talking. The node still arrives, still
    // flares, still takes its real position; only the bolt is withheld. The
    // caller decides (see birthVolume in globe-live.js) because loudness is a
    // property of the MOMENT, not of the note.
    born(node, at, opts) {
      if (!node || !node.id || !at) return false;
      if (nodes.some((n) => n.id === node.id)) { this.pulse(node.id); return false; }
      nodes.push(Object.assign({}, node, { at: at }));
      proj = [];   // rebuilt next frame at the new length
      // the world just got bigger, so how sparse it is has changed (5.11)
      measureSparsity();
      // `opts.silent` is ARRIVAL WITHOUT ANNOUNCEMENT, and it is a third thing
      // rather than a quieter second. The node is here, in its real place, at
      // its real size: the truth is complete. What is skipped is the whole
      // gesture — no flare, no bolt — because the member has taken over and a
      // flare is an interface asking for attention they have just spent
      // elsewhere. Cancel the presentation, never the data.
      if (opts && opts.silent) return true;
      flares.set(node.id, { at: performance.now(), born: true });
      // fork geometry is rolled ONCE per birth: re-rolling every frame read
      // as strobing (Danny: "spastic"), a fixed bolt revealed over time reads
      // as energy travelling
      if (!calm && !(opts && opts.quiet)) {
        const forks = [];
        for (let f = 0; f < 2; f++) {
          let a = Math.random() * Math.PI * 2;
          const pts = [[0, 0]];
          for (let s = 0; s < 6; s++) {
            a += (Math.random() - 0.5) * 0.5;
            const last = pts[pts.length - 1];
            pts.push([last[0] + Math.cos(a) * 0.06, last[1] + Math.sin(a) * 0.06]);
          }
          forks.push(pts);
        }
        spectacles.set(node.id, { at: performance.now(), forks });
      }
      return true;
    },
    // A note that is GONE. Undoing a first-light batch deletes real files, and
    // a globe that keeps drawing them is a map of a world that no longer
    // exists: taking a note back has to be as visible as the note arriving was,
    // or "undo" is a word rather than an event. Nothing else moves, for the
    // same reason a birth only places the one new node.
    forget(id) {
      const i = nodes.findIndex((n) => n.id === id);
      if (i < 0) return false;
      nodes.splice(i, 1);
      proj = [];
      flares.delete(id);
      spectacles.delete(id);
      measureSparsity();
      return true;
    },
    // Everything the globe currently knows, so a caller can work out whether a
    // path is new to it without a second copy of the list.
    knows(id) { return nodes.some((n) => n.id === id); },
    // WHERE THE VIEWER IS STANDING, in the world's own coordinates: `at` is the
    // point currently facing the camera, and `right` and `up` are the two
    // directions that move across the screen from there, wherever the idle turn
    // and any drag have left them.
    //
    // Read-only, and it exists so a caller can put something WHERE IT CAN BE
    // SEEN, on the side of the world it wants, without asking the camera to
    // move. The landing page's demo births are the first caller
    // (site/astrolabe/page.js): a note born for somebody watching has to arrive
    // in front of them and near the composer that made it, and flying the
    // camera to it would make the page's biggest moment a camera move rather
    // than a birth. Hand `{u: right, v: up}` to `onCap` and a point in the unit
    // disc becomes a screen-space offset along the surface.
    //
    // Nothing inside here uses it; `orient` stays private.
    viewAxes() {
      const inv = { w: orient.w, x: -orient.x, y: -orient.y, z: -orient.z };
      return {
        at: rotate(inv, { x: 0, y: 0, z: 1 }),
        right: rotate(inv, { x: 1, y: 0, z: 0 }),
        up: rotate(inv, { x: 0, y: 1, z: 0 }),
      };
    },
    // WHERE A NODE IS ON SCREEN this frame, in CSS pixels relative to the
    // canvas box, or null if it is round the back or not drawn yet. `proj` is
    // in device pixels because that is what the renderer draws in; a caller
    // laying DOM over the canvas thinks in CSS pixels, and converting here is
    // what stops every caller from keeping its own copy of the dpr.
    //
    // Also read-only. The landing page stands the visitor's own words beside
    // their new notes for a few seconds with it, which is the difference
    // between "my words became particles" and "that thing from my life is now
    // in there".
    screenOf(id) {
      for (let i = 0; i < proj.length; i++) {
        const d = proj[i];
        if (!d.n || d.n.id !== id) continue;
        if (d.z <= 0) return null;
        const k = canvas.width ? (canvas.getBoundingClientRect().width / canvas.width) : 1;
        return { x: d.x * k, y: d.y * k, facing: d.f == null ? 1 : d.f };
      }
      return null;
    },
    // WHERE AN ARBITRARY POINT OF THE SPHERE IS ON SCREEN this frame, in CSS
    // pixels relative to the canvas box, or null if it is round the back or
    // nothing has been drawn yet. `screenOf` answers this for a node; a
    // caller who wants to stand a word beside a REGION has only the land's
    // own direction, which belongs to no node. `facing` is how square-on the
    // point is, so a caller can fade a label out as it turns away rather than
    // having it blink off at the limb.
    //
    // Read-only, like its two neighbours, and nothing inside the renderer
    // uses it. The landing page writes the member's own region names beside
    // their lands with it, which is what turns the sphere from an abstract
    // graph into a map of somebody's work.
    // ── sculptures: node art standing in this world ───────────────────────
    // `s` = { at: unit vector (its home), front: unit tangent there (the way
    // its front faces, fixed when the home was made), alt (1 = on the land),
    // size (world units per local unit), art (CourseArt.sculpt output),
    // alpha, amount (motion, 0..1) }, or null to take it away.
    sculpture(id, s) {
      if (!s || !s.art || !s.at || !s.front) { sculpts.delete(id); return; }
      // updated in place: the renderer keeps its own per-piece state (the
      // level of detail tier, last frame's box) on the record
      const prev = sculpts.get(id);
      if (prev) {
        if (prev.art !== s.art) prev.lod = 0;
        Object.assign(prev, s, { lod: prev.lod, box: prev.box });
      } else sculpts.set(id, Object.assign({}, s));
    },
    // where a sculpture was drawn last frame, in CSS px relative to the
    // canvas box (skeleton bounds), or null when it is not in view
    sculptureBox(id) {
      const s = sculpts.get(id);
      if (!s || !s.box) return null;
      // the box size() last measured, never a fresh read: this runs every
      // frame from the course globe, and a fresh read forced a layout of the
      // whole page whenever a chat was streaming (profiled 2026-10-07)
      const k = canvas.width ? ((box && box.width) || canvas.getBoundingClientRect().width) / canvas.width : 1;
      const b = s.box;
      return { x: b.x0 * k, y: b.y0 * k, w: (b.x1 - b.x0) * k, h: (b.y1 - b.y0) * k, facing: b.f, cw: canvas.width * k };
    },
    // A HOME FOR A SCULPTURE, chosen once in world terms. Candidates ring
    // the owner (a tracker's route, a region's notes) at a few distances and
    // bearings; each is scored on the sphere: clear of the route by the
    // piece's own footprint, clear of note crowds, outside its own region's
    // notes (a region piece stands beside its land, not on it), near the
    // thing it means, and seen obliquely from the view it is born in (a piece
    // standing on a planet reads from the side, not from straight above).
    // Deterministic for the same world and view. Returns { at, front }.
    sculptureHome(opt) {
      const own = (opt && opt.owner || []).filter(Boolean);
      if (!own.length || !lastCam) return null;
      const fp = Math.max(0.04, (opt.footprint || 0.2) / 2);  // angular half-width
      let c = { x: 0, y: 0, z: 0 };
      for (const v of own) { c.x += v.x; c.y += v.y; c.z += v.z; }
      const cl = Math.hypot(c.x, c.y, c.z) || 1; c = { x: c.x / cl, y: c.y / cl, z: c.z / cl };
      const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)));
      let spread = 0;
      for (const v of own) spread = Math.max(spread, ang(c, v));
      spread = Math.min(1.2, spread);
      const stops = claim && claim.points ? claim.points.filter(Boolean) : [];
      const segs = this.routeSamples(fp * 0.5);
      // BESIDE THE ROUTE, NOT ONLY ROUND ITS MIDDLE (2026-09-26). Tracker
      // art also tries the water just off each stop, so a long or curved
      // route still offers places that stand beside a stretch of it.
      const aside = [];
      if (!opt.outside) {
        for (const s of stops) {
          const u0 = Math.abs(s.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
          let a1 = { x: u0.y * s.z - u0.z * s.y, y: u0.z * s.x - u0.x * s.z, z: u0.x * s.y - u0.y * s.x };
          const al = Math.hypot(a1.x, a1.y, a1.z) || 1; a1 = { x: a1.x / al, y: a1.y / al, z: a1.z / al };
          const a2 = { x: s.y * a1.z - s.z * a1.y, y: s.z * a1.x - s.x * a1.z, z: s.x * a1.y - s.y * a1.x };
          for (const dd of [fp * 1.6, fp * 2.4]) {
            for (let b = 0; b < 12; b++) {
              const th = b / 12 * Math.PI * 2, sd = Math.sin(dd), cd = Math.cos(dd);
              aside.push({ x: s.x * cd + (a1.x * Math.cos(th) + a2.x * Math.sin(th)) * sd,
                y: s.y * cd + (a1.y * Math.cos(th) + a2.y * Math.sin(th)) * sd,
                z: s.z * cd + (a1.z * Math.cos(th) + a2.z * Math.sin(th)) * sd });
            }
          }
        }
      }
      // in hand the piece grows (tracker art 0.22 to 0.38 of the radius), so
      // the route should stay clear of that size too, not only the resting one
      const hand = Math.max(1, opt.hand || 1);
      // NEAR THE ACTIVE COURSE, WHOLE IN VIEW (Dan, 2026-09-26: the tree stood
      // up on the horizon, cut off). A tracker piece leans toward the stop the
      // vessel is at, and its TOP, at the height it grows to in hand, has to
      // stay on the screen, not only its foot.
      const nowStop = claim && claim.points && opt.nowIndex != null && claim.points[opt.nowIndex] ? claim.points[opt.nowIndex] : null;
      const tall = Math.max(0, opt.tall || 0);
      const inv = { w: orient.w, x: -orient.x, y: -orient.y, z: -orient.z };
      const up0 = Math.abs(c.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
      let e1 = { x: up0.y * c.z - up0.z * c.y, y: up0.z * c.x - up0.x * c.z, z: up0.x * c.y - up0.y * c.x };
      const l1 = Math.hypot(e1.x, e1.y, e1.z) || 1; e1 = { x: e1.x / l1, y: e1.y / l1, z: e1.z / l1 };
      const e2 = { x: c.y * e1.z - c.z * e1.y, y: c.z * e1.x - c.x * e1.z, z: c.x * e1.y - c.y * e1.x };
      const Rs = lastCam.R;
      let best = null;
      const dists = [spread * 0.5, spread * 0.8, spread + fp * 0.6, spread + fp * 1.3, spread + fp * 2.2];
      const cands = [];
      for (const dd of dists) {
        for (let b = 0; b < 24; b++) {
          const th = b / 24 * Math.PI * 2, sd = Math.sin(dd), cd = Math.cos(dd);
          cands.push({ x: c.x * cd + (e1.x * Math.cos(th) + e2.x * Math.sin(th)) * sd,
            y: c.y * cd + (e1.y * Math.cos(th) + e2.y * Math.sin(th)) * sd,
            z: c.z * cd + (e1.z * Math.cos(th) + e2.z * Math.sin(th)) * sd });
        }
      }
      for (const v of aside) cands.push(v);
      {
        for (const v of cands) {
          let score = 0;
          let nearRoute = Infinity;
          for (const s of stops) nearRoute = Math.min(nearRoute, ang(v, s));
          for (const s of segs) nearRoute = Math.min(nearRoute, ang(v, s));
          // standing ON the route is never the best place while any clear
          // place exists: it outweighs every framing term below together
          if (nearRoute < fp * 1.1) score += 400 + (fp * 1.1 - nearRoute) * 400;
          else if (nearRoute < fp * 1.25 * hand) score += 30 + (fp * 1.25 * hand - nearRoute) * 150;
          let crowd = 0;
          for (const nd of nodes) if (nd.at && ang(v, nd.at) < fp) crowd++;
          score += Math.min(12, crowd * 0.2);
          if (opt.outside) { let mine = 0; for (const u of own) if (ang(v, u) < fp * 1.2) mine++; score += mine * 3; }
          let nearOwn = Infinity;
          for (const u of own) nearOwn = Math.min(nearOwn, ang(v, u));
          score += nearOwn * 12;
          // SEEN AS IT WANTS TO BE SEEN (2026-09-26). g.z is how squarely the
          // ground there faces the view: near 1 the camera looks straight down
          // the piece (a top-down smudge), near 0 it stands on the limb (a
          // streak). The useful band is about 0.55 to 0.75; a piece meant to
          // be read in elevation also cares more about standing upright on
          // the screen, and one meant to be read from above sits nearer the
          // middle of the view.
          const g = rotate(orient, v);
          const view = opt.view || 'three-quarter';
          const aim = view === 'top' ? 0.85 : view === 'elevation' ? 0.6 : 0.65;
          if (g.z < 0.3) score += 80;
          else score += Math.pow(g.z - aim, 2) * 140;
          // BORN FOR THE FRAME IT WILL BE SEEN IN. When the region is framed,
          // focus() rolls its art straight above the aim and widens to hold
          // it, so what this screen shows now (its roll, its canvas, sidebar
          // or full) is not how the piece will be seen: judge the place by how
          // little it asks of that frame instead, inside the notes' own cap.
          if (opt.outside && gravAt && fitAngle) {
            const dF = ang(v, gravAt);
            score += Math.max(0, dF + (opt.reach || 0.3) - fitAngle) * 120 + dF * 8;
            if (!best || score < best.score) best = { score, v };
            continue;
          }
          const q = project(g, Rs * 0.9, lastCam.cx, lastCam.cy, lastCam.camZ);
          // and standing UP on the screen, not hanging off the bottom of the
          // ball: the normal's screen direction, 0 when straight up, 1 down
          const qu = project({ x: g.x * 1.1, y: g.y * 1.1, z: g.z * 1.1 }, Rs * 0.9, lastCam.cx, lastCam.cy, lastCam.camZ);
          const ul = Math.hypot(qu.x - q.x, qu.y - q.y) || 1;
          score += (view === 'elevation' ? 45 : view === 'top' ? 12 : 32) * (1 + (qu.y - q.y) / ul) / 2;
          if (q.x < canvas.width * 0.12 || q.x > canvas.width * 0.85 || q.y < canvas.height * 0.22 || q.y > canvas.height * 0.85) score += 80;
          score += 6 * Math.hypot(q.x / canvas.width - 0.5, q.y / canvas.height - 0.6);
          if (tall) {
            const qt = project({ x: g.x * (1 + tall), y: g.y * (1 + tall), z: g.z * (1 + tall) }, Rs * 0.9, lastCam.cx, lastCam.cy, lastCam.camZ);
            const over = Math.max(0, canvas.height * 0.08 - qt.y) + Math.max(0, canvas.width * 0.06 - qt.x) + Math.max(0, qt.x - canvas.width * 0.94);
            if (over > 0) score += 120 + over / canvas.height * 200;
            if (g.z < 0.45) score += 60;   // near the limb a tall piece rises off the ball
          }
          if (nowStop) score += ang(v, nowStop) * 30;
          if (!best || score < best.score) best = { score, v };
        }
      }
      if (!best) return null;
      // its front faces the camera that saw it born, laid in the tangent plane
      return { at: best.v, front: this.sculptureFront(best.v) || e1 };
    },
    // Points along the route's line between stops, no further apart than
    // `step` radians, so a long leg is checked along its whole length.
    routeSamples(step) {
      const stops = claim && claim.points ? claim.points.filter(Boolean) : [];
      const out = [];
      for (let i = 1; i < stops.length; i++) {
        const a = stops[i - 1], b = stops[i];
        const d = Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)));
        const n = Math.max(4, Math.ceil(d / Math.max(0.01, step)));
        for (let k = 1; k < n; k++) {
          const m = { x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n, z: a.z + (b.z - a.z) * k / n };
          const l = Math.hypot(m.x, m.y, m.z) || 1; out.push({ x: m.x / l, y: m.y / l, z: m.z / l });
        }
      }
      return out;
    },
    // Does a piece of this footprint standing at `at` sit on the route as it
    // is drawn NOW? (A home chosen before a re-chart can end up on the line.)
    // Is a piece standing at `at`, `tall` radii high when held, whole in the
    // current view? Foot on the facing side, top inside the canvas.
    sculptureSeen(at, tall) {
      if (!at || !lastCam) return true;
      const l = Math.hypot(at.x, at.y, at.z) || 1;
      const g = rotate(orient, { x: at.x / l, y: at.y / l, z: at.z / l });
      if (g.z < 0.3) return false;
      const Rs = lastCam.R, k = 1 + Math.max(0, tall || 0);
      const q = project(g, Rs * 0.9, lastCam.cx, lastCam.cy, lastCam.camZ);
      const qt = project({ x: g.x * k, y: g.y * k, z: g.z * k }, Rs * 0.9, lastCam.cx, lastCam.cy, lastCam.camZ);
      const inX = (x) => x > canvas.width * 0.03 && x < canvas.width * 0.97;
      return inX(q.x) && inX(qt.x) && qt.y > canvas.height * 0.03 && q.y < canvas.height * 0.95;
    },
    sculptureOnRoute(at, footprint) {
      if (!at || !claim || !claim.points) return false;
      const fp = Math.max(0.04, (footprint || 0.2) / 2);
      const l = Math.hypot(at.x, at.y, at.z) || 1, v = { x: at.x / l, y: at.y / l, z: at.z / l };
      const pts = claim.points.filter(Boolean).concat(this.routeSamples(fp * 0.5));
      for (const p of pts) if (Math.acos(Math.max(-1, Math.min(1, v.x * p.x + v.y * p.y + v.z * p.z))) < fp * 1.1) return true;
      return false;
    },
    // The way a piece standing at `v` should face to show its front to the
    // camera as it is NOW: toward the camera, laid in the tangent plane.
    sculptureFront(v) {
      if (!lastCam || !v) return null;
      const inv = { w: orient.w, x: -orient.x, y: -orient.y, z: -orient.z };
      const g = rotate(orient, v);
      const toCam = rotate(inv, { x: -g.x, y: -g.y, z: lastCam.camZ - g.z });
      const dn = toCam.x * v.x + toCam.y * v.y + toCam.z * v.z;
      const f = { x: toCam.x - v.x * dn, y: toCam.y - v.y * dn, z: toCam.z - v.z * dn };
      const fl = Math.hypot(f.x, f.y, f.z);
      return fl < 1e-4 ? null : { x: f.x / fl, y: f.y / fl, z: f.z / fl };
    },
    screenOfPoint(v) {
      if (!lastCam || !v) return null;
      const g = rotate(orient, v);
      if (g.z <= 0) return null;
      const q = project(g, lastCam.R, lastCam.cx, lastCam.cy, lastCam.camZ);
      const k = canvas.width ? (canvas.getBoundingClientRect().width / canvas.width) : 1;
      return { x: q.x * k, y: q.y * k, facing: g.z };
    },
    // Show only these kinds. Pass nothing, null, or every kind to go back to
    // showing everything. Returns what it settled on so a legend can render
    // from the globe's own state rather than keeping a second copy of it.
    only(kinds) {
      only = narrowTo(kinds, KIND_ORDER);
      return only ? [...only] : null;
    },
    showing() { return only ? [...only] : null; },
    // Hand in the coastlines, or point at one of them. Separate calls because
    // the shapes change only when the vault is re-laid out, and which one is
    // in hand changes every time somebody clicks the rail.
    coastlines(list) { coasts = list || []; },
    // The sea-art debug overlay (18.4): hand in a Map of id -> unit vector (or
    // a channel record carrying .at) and every named node grows a dashed
    // semantic-to-presentation vector; hand in nothing to switch it off.
    // Returns how many nodes the field names, so the console can confirm the
    // hand-off did what it said.
    artDebug(field) {
      artDebugField = (field instanceof Map && field.size) ? field : null;
      return artDebugField ? artDebugField.size : 0;
    },
    // The composition's seam provider (sea-art phase 3). Hand in a resolver
    // and the frame loop consults it once per node; hand in nothing and the
    // art layer does not exist as far as this renderer is concerned.
    art(fn) { artist = typeof fn === 'function' ? fn : null; },
    // Hand in the landmarks: [{ at: unit vector, dots: [[x, y, r, alpha]], alpha }]
    // with dots in the landmark's own units, upright, y down, its base at 0,0.
    // Nothing else in the renderer reads them; hand in nothing to clear.
    landmarks(list) {
      landmarkList = (Array.isArray(list) ? list : [])
        .filter((l) => l && l.at && isFinite(l.at.x) && Array.isArray(l.dots))
        .map((l) => ({ at: normalise(l.at), dots: l.dots, alpha: l.alpha == null ? 1 : l.alpha }));
      return landmarkList.length;
    },
    // Turn the ball until this point faces the viewer, as the camera would for
    // a note: for a point with no note on it (a place's seed, just named)
    // A SHARED WORLD'S TOUR STOPS THE IDLE TURN (shared-world 3.2) and starts
    // it again at the end. The rate is otherwise fixed at mount; the dashboard
    // never calls this.
    setIdleRate(r) { o.idleRate = Math.max(0, +r || 0); return o.idleRate; },
    // A SHARED WORLD TURNS BY THE ARROW KEYS (shared-world 3.3): yaw and pitch
    // in radians, from wherever the ball faces now, over the same turn as
    // turnTo (instant under reduced motion). The dashboard never calls this.
    turnBy(yaw, pitch, ms) {
      const z = { x: 0, y: 0, z: 1 };
      const qy = quatFromTo(z, { x: Math.sin(yaw || 0), y: 0, z: Math.cos(yaw || 0) });
      const qx = quatFromTo(z, { x: 0, y: Math.sin(pitch || 0), z: Math.cos(pitch || 0) });
      ms = calm ? 1 : (ms || 300);
      turn = { from: orient, to: qmul(qmul(qx, qy), orient), start: performance.now(), ms };
      return ms;
    },
    // `aim`, optional: where on the ball the point should come to rest, a unit
    // vector in view space (+y up), instead of dead centre. A shared world
    // passes one so a place rests high and its art stands in profile
    // (shared-world 4.7d); the dashboard never does.
    turnTo(v, ms, aim) {
      if (!v) return 0;
      ms = calm ? 1 : (ms || o.turnMs);
      turn = { from: orient, to: qmul(quatFromTo(rotate(orient, normalise(v)), aim ? normalise(aim) : { x: 0, y: 0, z: 1 }), orient), start: performance.now(), ms };
      return ms;
    },
    // Where a landmark at this point would stand right now, in viewport CSS
    // pixels, and how many pixels one of its units is: what lets something
    // drawn elsewhere (the plant scene) travel to exactly where it will be.
    landmarkAt(v) {
      if (!lastCam || !v) return null;
      const g = rotate(orient, normalise(v));
      if (g.z <= 0.05) return null;
      const q = project(g, lastCam.R * 0.9, lastCam.cx, lastCam.cy, lastCam.camZ);
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return null;   // a sphere not on screen (the phone's hidden strip) has nowhere to stand
      const k = canvas.width ? rect.width / canvas.width : 1;
      return { x: rect.left + q.x * k, y: rect.top + q.y * k, unit: lastCam.R * 0.9 * q.p * LANDMARK_SIZE * k, facing: g.z };
    },
    // Play a named canvas scene (CANVAS_SCENES). Idempotent by construction —
    // every entry flips state the render loop already honors, so calling one
    // on every tab poll costs nothing and restarts nothing. Unknown names
    // return false and change nothing, which is what lets a future overlay
    // hand names in without being able to break the map.
    scene(name) {
      const s = CANVAS_SCENES[name];
      if (!s) return false;
      s();
      return true;
    },
    highlight(slug) { coastLit = slug || null; return coastLit; },
    // Which land the chat on screen is working in, or null for none. A fact
    // only the page can know, so it is handed in rather than inferred; the
    // caption's dot is the one thing that reads it.
    workingLand(slug) { workLand = slug ? String(slug).toLowerCase() : null; return workLand; },
    voyaging() { return claim ? claim.count : 0; },
    onCourse(id) { return claimIds.has(id); },
    highlighted() { return coastLit; },
    // The palette, so the page can draw a legend without a second copy of the
    // hexes. Two copies of a colour is how one of them goes stale.
    palette() { return KIND_ORDER.map((k) => ({ kind: k, color: KIND[k] })); },
    resize() { box = size(); },
    // the member is typing (or done): ambience yields to the keystroke
    easy(on) { easyFocus = Boolean(on); setEasy(); },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      themeWatch.disconnect();
      if (scheme) { try { scheme.removeEventListener('change', repalette); } catch (_) {} }
    },
    // The way back in, for a view that is put away rather than thrown away.
    // requestAnimationFrame is per DOCUMENT, so hiding a globe's host stops the
    // painting and nothing else; a chart that is only hidden runs a second full
    // render loop for the rest of the session (#192). The canvas listeners are
    // wired once at mount and nothing detaches them, so the view must be woken
    // rather than re-mounted — a second mount stacks a second set of them.
    start() {
      if (raf) return;
      themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
      if (scheme) { try { scheme.addEventListener('change', repalette); } catch (_) {} }
      repalette();   // the theme may have turned over while it was away
      last = 0;      // and the world must not jump forward by however long that was
      raf = requestAnimationFrame(tick);
    }
  };

  // ── the layer seam, opened (see its note beside `claim`, above) ─────────
  //
  // Constants are plain fields. What the core changes as it runs is an
  // accessor, so a layer reads the camera as it is NOW and a write from a
  // layer (framing a course moves the camera) lands in the core's own state.
  const g = {
    canvas: canvas, ctx: ctx, o: o, tok: tok, lens: lens, calm: calm, nodes: nodes,
    zoomFloor: zoomFloor, stirred: stirred,
    settle() { settleNext = true; },
    // Where the sphere comes to REST at the current asks, in canvas pixels:
    // the frame's own arithmetic at its targets rather than its eased values,
    // so a caller can place the canvas once instead of measuring it later.
    rest() {
      const w = canvas.width, h = canvas.height;
      const z = (lit.size || (claim && claim.count) || whole) ? 1 : 0;
      const fw = whole ? wholeFit(w, h, o) : (fitAngle ? fitZoom(fitAngle, w, h, o) : 1);
      const R = Math.min(w, h) * (o.idleR + (o.focusR - o.idleR) * z) * userZoom * fw * o.sphere;
      return { R: R, cx: w * o.cxFrac, cy: h * o.arcTop + R, w: w, h: h };
    },
    get orient() { return orient; },
    get userZoom() { return userZoom; }, set userZoom(v) { userZoom = v; },
    get whole() { return whole; }, set whole(v) { whole = v; },
    get fitAngle() { return fitAngle; }, set fitAngle(v) { fitAngle = v; },
    get gravAt() { return gravAt; }, set gravAt(v) { gravAt = v; },
    get lit() { return lit; }, set lit(v) { lit = v; },
    get selected() { return selected; }, set selected(v) { selected = v; },
    get turn() { return turn; }, set turn(v) { turn = v; },
    get hoverMark() { return hoverMark; },
    draw(moment, fn) { if (layerDraw[moment] && typeof fn === 'function') layerDraw[moment].push(fn); },
    hit(fn) { if (typeof fn === 'function') layerHit.push(fn); },
    press(fn) { if (typeof fn === 'function') layerPress.push(fn); },
    scene(name, fn) { if (typeof fn === 'function') CANVAS_SCENES[name] = fn; },
    debug(fn) { if (typeof fn === 'function') layerDebug.push(fn); },
    // `fn()` true while the layer has motion of its own on screen
    playing(fn) { if (typeof fn === 'function') layerPlaying.push(fn); },
    methods(obj) { Object.assign(view, obj || {}); },
    claim(state, ids, done) {
      claim = state || null;
      claimIds = ids || new Set();
      claimDone = done || new Set();
    },
  };
  const ext = typeof window !== 'undefined' ? window.astrolabe : null;
  if (ext && typeof ext.emit === 'function') ext.emit('globe:mount', g, view);
  return view;
}

// Heavier still than the quintic, and the difference is felt rather than
// measured: by the time a third of the duration has passed it has covered
// nine tenths of the distance, so almost the whole animation IS the settle.
// Taken from a cold read of the brief (2026-08-22) that used it for the same
// reason: it reads as a large mass arriving, not a value converging.
function easeOutExpo(t) {
  const c = Math.max(0, Math.min(1, t));
  return c === 1 ? 1 : 1 - Math.pow(2, -10 * c);
}

// The glow rule (#192), out here for the same reason the kind filter is: the
// draw loop needs a canvas, and this is the part that can be quietly wrong.
// `lit` is however many nodes the current highlight covers; above the budget
// every one of them trades ctx.shadowBlur for radius, because shadowBlur costs
// a blur pass per draw and a highlighted cluster is unbounded in size.
// All-or-nothing: a subset budget shimmers as the ball turns.
function massGlow(litCount, budget, easyOn) {
  return litCount > (easyOn ? 0 : Math.max(0, budget));
}

// One step of the frame-rate governor, out here for the reason massGlow and
// glowBudget are: the loop around it needs a canvas, and this is the part that
// can be quietly wrong. `cost` is how long the last frame took to DRAW.
//
// Resolution is the first knob and it is the one worth spending: a retina
// canvas is 4x the pixels of a plain one. A 1x display has none of it to give
// back, which is every old laptop the complaint comes from, and there the only
// way to make the next second cheaper is to draw fewer frames and drop the
// glow — easy mode, the same state the composer asks for while typing (#192).
// Resolution is given back when frames stay cheap. Easy mode is not: releasing
// it on cool frames re-lit the glow, the cost climbed, and it latched again, a
// visible pulse every ~12s on a borderline 1x machine. It holds for the mount;
// the next mount measures afresh
function governStep(s, cost, nativeDpr) {
  let hot = s.hot, cool = s.cool;
  if (cost > 28) { hot++; cool = 0; } else if (cost < 14) { cool++; hot = 0; }
  if (hot > 90) {                                    // ~1.5s of struggle
    if (s.dpr > 1) return { hot: 0, cool: cool, dpr: Math.max(1, s.dpr - 0.25), easy: s.easy };
    if (!s.easy) return { hot: 0, cool: cool, dpr: s.dpr, easy: true };
  } else if (cool > 600) {                           // ~10s of ease
    if (s.dpr < nativeDpr) return { hot: hot, cool: 0, dpr: Math.min(nativeDpr, s.dpr + 0.25), easy: s.easy };
  }
  return { hot: hot, cool: cool, dpr: s.dpr, easy: s.easy };
}

// What a device gets before anything has been measured. The dpr governor is
// reactive and needs ~1.5s of jank to act, which never helps a burst of typing
// — so a weak device starts lean instead of earning its way down every session.
function glowBudget(nav, coarsePointer) {
  const n = nav || {};
  const lean = (n.deviceMemory ?? 8) <= 4 || (n.hardwareConcurrency ?? 8) <= 4
    || Boolean(coarsePointer);
  return lean ? 12 : 60;
}

// The two rules behind the kind filter, kept out here as plain functions
// because the draw loop that uses them needs a canvas and a browser to run,
// and these are the parts that can be quietly wrong.
const ALL_KINDS = ['person', 'session', 'decision', 'plan', 'craft', 'reference', 'idea'];

// An empty selection and a full one look identical on screen and mean
// opposite things, so exactly one of them is allowed to exist. Everything
// selected collapses to null, which is the resting state: no filter at all.
function narrowTo(kinds, all) {
  const list = (all || ALL_KINDS);
  if (!kinds || !kinds.length) return null;
  const set = new Set([...kinds].filter((k) => list.indexOf(k) >= 0));
  if (!set.size) return null;
  return set.size >= list.length ? null : set;
}

// How present a node is once the filter has spoken. Never zero, on purpose:
// orphans are dust rather than hidden for the same reason, and the one thing
// this globe exists to show is how much else there is. A filter that empties
// the sky answers the legibility question by destroying the answer.
function presence(kind, only) {
  return !only || only.has(kind) ? 1 : 0.16;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { massGlow, glowBudget, governStep, principalAxes, placeOnSphere, placeInRegions, regionRoot, regionHome, regionRadius, tangentFrame, onCap, fibonacciSphere, quatFromTo, magnify, fitZoom, wholeFit, solveFace, dragTurn, dragGain,
    slerp, rotate, qmul, axisAngle, normalise, centroid, cross, easeOutQuint, easeOutExpo, project, mountGlobe, slerpPoint, regionOrbit, regionCoast, coastRadii, orbitAxis,
    narrowTo, presence, ALL_KINDS, flownFloor, fitText, ladderGutter,
    artLodStep, ART_TIERS, pinchZoom, inertiaStep, INERTIA_START, INERTIA_REST, INERTIA_MAX, INERTIA_TAU };
}
