// A world you can share: the geography of a public world, grown from its seed
// (docs/PRD-shared-world.md 4.5, item 1.6, design brief 2026-10-09).
//
// A member's own globe sizes and shapes each land from what is written there,
// so its geography says how much is in each part of a life. A public world
// must not say that. So here every land is the same size, its coast is noise
// drawn from the portrait's random seed, and its lights are decoration placed
// inside that coast. The ONLY inputs are the seed and how many lands are
// shown: hiding one changes the count and nothing else.
//
// Seats come from the app's own orbit rule, so a public world is laid out the
// way the member's globe is. Size is the equal share (a larger pack under four
// lands), held under the clearance between the two nearest seats. From three
// lands up the clearance is what binds, so lands cover about a quarter to a
// third of the ball and fewer lands still cover more of it (the brief's
// Finding 2): three cover 37%, six 26%, twelve 23%.
// The sea is the plain atmospheric one: nothing is generated for it. Art
// stands upright at each land's centre `c`, sized by `radius`; the viewer
// (1.7) does that with the existing sculpture presentation.
//
// Plain functions like globe.js; in the browser they are globals.
const PW_GLOBE = (typeof module !== 'undefined' && module.exports)
  ? require('./globe.js')
  : { regionOrbit, tangentFrame, onCap, quatFromTo, normalise };   // eslint-disable-line no-undef
// (pickLand at the end reads only screen points, so it needs none of these)

const PORTRAIT_BEARINGS = 96;      // the app's COAST_BEARINGS
const PORTRAIT_LIGHTS = 18;        // per land, the same for every land
const PORTRAIT_CLEAR = 1.1;        // the app's REGION_CLEAR, for two equal radii
const PORTRAIT_WOBBLE = 0.08;      // the coast's furthest reach past the radius

// One seeded stream per purpose: djb2 over `seed/label` (the hash regionHome
// uses) seeding mulberry32. Each land's coast and lights are their own
// streams, so adding a land never reshuffles another.
function portraitRng(seed, label) {
  let h = 5381;
  const s = String(seed) + '/' + label;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  let a = h >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Equal share of the sphere, with a larger pack below four lands, held under
// the clearance every pair of seats allows so lands never touch.
function portraitRadius(n, seats) {
  const pack = n >= 4 ? 0.55 : 0.72;
  const share = Math.acos(Math.max(-1, 1 - 2 * pack / n));
  let minSep = Infinity;
  for (let i = 0; i < seats.length; i++) {
    for (let j = i + 1; j < seats.length; j++) {
      const a = seats[i], b = seats[j];
      const d = Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)));
      if (d < minSep) minSep = d;
    }
  }
  return Math.min(share, minSep / (2 * PORTRAIT_CLEAR));
}

// The coast: three harmonics of orders 2 to 5, seeded phases, amplitudes that
// sum to at most PORTRAIT_WOBBLE of the radius.
function portraitCoastRadii(radius, rand) {
  const waves = [];
  let total = 0;
  for (let k = 0; k < 3; k++) {
    const w = { order: 2 + Math.floor(rand() * 4), phase: rand() * Math.PI * 2, amp: 0.2 + rand() };
    total += w.amp;
    waves.push(w);
  }
  const scale = PORTRAIT_WOBBLE * (0.6 + 0.4 * rand()) / total;
  const out = new Array(PORTRAIT_BEARINGS);
  for (let b = 0; b < PORTRAIT_BEARINGS; b++) {
    const th = b / PORTRAIT_BEARINGS * Math.PI * 2;
    let wob = 0;
    for (const w of waves) wob += w.amp * scale * Math.sin(w.order * th + w.phase);
    out[b] = radius * (1 + wob);
  }
  return out;
}

function portraitWorld(seed, n) {
  if (typeof seed !== 'string' || !/^[0-9a-f]{32}$/.test(seed)) throw new Error('portraitWorld: seed must be 32 hex characters');
  if (!Number.isInteger(n) || n < 1 || n > 12) throw new Error('portraitWorld: a world shows 1 to 12 lands');
  const G = PW_GLOBE;
  const seats = G.regionOrbit(n);
  const radius = portraitRadius(n, seats);
  const lands = [];
  const lights = [];
  for (let i = 0; i < n; i++) {
    const c = seats[i];
    const frame = G.tangentFrame(c);
    const radii = portraitCoastRadii(radius, portraitRng(seed, 'coast/' + i));
    const loop = radii.map((r, b) => {
      const th = b / PORTRAIT_BEARINGS * Math.PI * 2;
      return G.onCap(c, frame, Math.cos(th), Math.sin(th), r);
    });
    lands.push({ seat: i, c, radius, radii, loop });
    const rand = portraitRng(seed, 'lights/' + i);
    for (let k = 0; k < PORTRAIT_LIGHTS; k++) {
      const th = rand() * Math.PI * 2;
      const u = rand();
      const bin = Math.floor(th / (Math.PI * 2) * PORTRAIT_BEARINGS) % PORTRAIT_BEARINGS;
      const t = radii[bin] * 0.9 * Math.sqrt(u);   // area-uniform inside the coast
      lights.push({ land: i, at: G.onCap(c, frame, Math.cos(th), Math.sin(th), t) });
    }
  }
  return { n, lands, lights, lightsPerLand: PORTRAIT_LIGHTS };
}

// THE OPENING VIEW (2.2, brief 2.1 item 1): the world turned once, before the
// first frame, so its art faces the visitor rather than the sea between lands.
// `shown` is the portrait's list in order; a land "has art" when its entry
// carries `art`. The aim is the mean seat of up to three art lands (the first
// two lands when none has art), or the first alone when they lie more than 70
// degrees apart, since their mean would leave both near the rim. The target is
// the landing page's: up and left of centre on a wide screen, high on a phone
// band. Returns the quaternion the viewer rotates every point by.
// 2.4: `opening`, a key the member chose ("start with the garden facing"):
// when it names a shown entry, that land's seat alone is the aim.
const OPENING_SPREAD = 70 * Math.PI / 180;
const OPENING_WIDE = { x: -0.12, y: 0.10, z: 0.99 };
const OPENING_BAND = { x: -0.10, y: 0.60, z: 0.79 };
function openingTurn(world, shown, wide, opening) {
  const G = PW_GLOBE;
  const n = world.lands.length;
  const chosen = opening ? (shown || []).findIndex((s) => s && s.key === opening) : -1;
  let pick = chosen >= 0 && chosen < n ? [chosen]
    : (shown || []).map((s, i) => (s && s.art ? i : -1)).filter((i) => i >= 0 && i < n).slice(0, 3);
  if (!pick.length) pick = [0, 1].filter((i) => i < n);
  const seat = (i) => world.lands[i].c;
  let spread = 0;
  for (let a = 0; a < pick.length; a++) for (let b = a + 1; b < pick.length; b++) {
    const p = seat(pick[a]), q = seat(pick[b]);
    spread = Math.max(spread, Math.acos(Math.max(-1, Math.min(1, p.x * q.x + p.y * q.y + p.z * q.z))));
  }
  if (spread > OPENING_SPREAD) pick = pick.slice(0, 1);
  const sum = pick.reduce((m, i) => ({ x: m.x + seat(i).x, y: m.y + seat(i).y, z: m.z + seat(i).z }), { x: 0, y: 0, z: 0 });
  const aim = Math.hypot(sum.x, sum.y, sum.z) > 1e-6 ? G.normalise(sum) : seat(pick[0]);
  return G.quatFromTo(aim, G.normalise(wide ? OPENING_WIDE : OPENING_BAND));
}

// WHICH LIGHTS SPEAK (4.9, 4.9b). A place with `count` public notes puts them on that many of its
// land's `perLand` lights, picked by the seed and the land's index among the
// shown places alone: a seeded shuffle of the land's lights, taken from the
// front, so note i keeps its light while the list keeps its order and a
// visitor who comes back finds it where it was. Nothing about a note reaches
// the pick, so a light still carries nothing from the notes beneath, and a
// hidden place changes only the count of lands.
function noteLights(seed, landIndex, count, perLand) {
  const n = Math.max(0, Math.min(count | 0, perLand | 0));
  const order = Array.from({ length: perLand | 0 }, (_, i) => i);
  const rand = portraitRng(seed, 'notes/' + landIndex);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = order[i]; order[i] = order[j]; order[j] = t;
  }
  return order.slice(0, n);
}

// Which land a tap landed on, from where each land's centre is on screen and
// how far its coast reaches there (CSS px): the nearest centre within 1.15 of
// its reach, so a tap just off a coast still counts, else null (the sea).
function pickLand(point, candidates) {
  let best = null, bestD = Infinity;
  for (const c of candidates || []) {
    const d = Math.hypot(point.x - c.x, point.y - c.y);
    if (d <= c.reach * 1.15 && d < bestD) { best = c.i; bestD = d; }
  }
  return best;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { portraitWorld, pickLand, noteLights, openingTurn, OPENING_WIDE, OPENING_BAND, OPENING_SPREAD, portraitRng, portraitRadius, portraitCoastRadii, PORTRAIT_BEARINGS, PORTRAIT_LIGHTS, PORTRAIT_CLEAR, PORTRAIT_WOBBLE };
}
