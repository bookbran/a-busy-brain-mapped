'use strict';
// Sea art, phase 1: eligibility and the stack (layer: app).
// Brief: docs/SEA-ART-EMERGENCE-ANALYSIS.md. Tracker: docs/SEA-ART-BUILD-TRACKER.md.
//
// The globe pools every note with no region into open water, so the sea is the
// one place on the sphere where a node's position is not a truth claim. That is
// what makes it the only honest canvas the agent can compose on:
//
//   Emergence is the sea trying to become land. Art is the sea being content to
//   stay sea.
//
// This file holds the PREDICATES only. It decides nothing about what to draw and
// draws nothing: it answers which nodes the art layer is allowed to touch, what
// it must yield to and how, and whether a proposed position is still at sea.
// Every function here is pure, takes plain data, and reaches for no globals, so
// the rules can be tested without a canvas and without a brain.
//
// Three rules live elsewhere on purpose, because each of them has exactly one
// home and a second copy would eventually disagree with the first:
//
//   the sea fold        globe.js `regionRoot` decides which region a note's
//                       region folds to, and therefore what counts as sea
//   the merge graph     server.js `emergenceClaimedPaths` resolves candidate
//                       identity through `canonicalRoot` and says which notes a
//                       live emerging topic already claims
//   the coastlines      globe.js `regionCoast` / `coastRadii` measure where the
//                       land actually reaches, from the notes themselves
//
// This file consumes the answers. It never re-derives them.

// How far off the coast a displaced node must stay, in radians. PROVISIONAL and
// deliberately a parameter rather than a fact: the real number is open decision
// 1 in the tracker and belongs to Dan, alongside the displacement budget it is a
// sibling of (the sea's own step of 0.16 rad is the scale reference).
// Every function that uses it takes an override, so the number can land late
// without anything here changing.
const ART_LAND_MARGIN = 0.06;

// The reasons a node is or is not available to the artwork. Stable strings, not
// prose: the per-node inspector (brief 18.4) prints these, and the question they
// exist to answer cheaply is "why did this node disappear from the fish?"
const ART_REASON = {
  eligible: 'eligible',
  landed: 'landed: the note has a region on the map',
  claimed: 'claimed-by-emergence: a live candidate is gathering this note',
  unplaced: 'not-placed: the node has no position yet',
  unknown: 'unknown: no such node',
};

function artSet(x) {
  if (!x) return new Set();
  return x instanceof Set ? x : new Set(x);
}

// ── eligibility: the art may only use residue ───────────────────────────────
// Sea-art brief 16. Both halves are hard invariants, and the second is the one
// with a moral weight: emergence looks for coherent recurring topics so it can
// invite the member to land a real region, which is meaning trying to become
// geography. Art deliberately makes something that is not about the notes'
// meaning at all. Where they want the same node, meaning wins, always.
//
// `ctx.sea` is the set of node ids the globe places in open water, built with
// globe.js `regionRoot` so this cannot drift from where the nodes actually draw.
// `ctx.claimed` is the set of vault-relative paths a live emergence candidate
// holds, resolved server-side through the merge graph and handed to the page on
// the globe feed.
function artEligible(node, ctx) {
  const c = ctx || {};
  if (!node || !node.id) return { eligible: false, reason: ART_REASON.unknown };
  if (!node.at) return { eligible: false, reason: ART_REASON.unplaced };
  const claimed = c.claimed instanceof Set ? c.claimed : artSet(c.claimed);
  if (claimed.has(node.id)) return { eligible: false, reason: ART_REASON.claimed };
  const sea = c.sea instanceof Set ? c.sea : artSet(c.sea);
  if (!sea.has(node.id)) return { eligible: false, reason: ART_REASON.landed };
  return { eligible: true, reason: ART_REASON.eligible };
}

// The same question over a whole globe, with the sets built once. Returns a Map
// of id to verdict so the inspector can answer for any node, not only for the
// ones that passed.
function artEligibility(nodes, ctx) {
  const c = ctx || {};
  const fixed = { sea: artSet(c.sea), claimed: artSet(c.claimed) };
  const out = new Map();
  for (const n of (nodes || [])) if (n && n.id) out.set(n.id, artEligible(n, fixed));
  return out;
}

// Just the nodes, for a caller that only wants the material.
function artResidue(nodes, ctx) {
  const verdicts = artEligibility(nodes, ctx);
  return (nodes || []).filter((n) => n && n.id && verdicts.get(n.id).eligible);
}

// ── the priority stack, and the three ways to yield ─────────────────────────
//
//         canonical truth          region: frontmatter, tab.region
//               ^
//         emerging meaning         POSSIBLE / EMERGING candidates, merge graphs
//               ^
//      functional interaction      focus, course view, hover, selection, search
//               ^
//              art                 the composition displacement
//               ^
//           animation              expressive motion
//
//   Higher layers may CONSTRAIN, SUPPRESS, or EVICT lower layers as required.
//   Never the reverse.
//
// Three distinct operations, and they must never be collapsed into one:
//
//   constrain   continuous      the artwork operates within limits the higher
//                               layer sets, and stays on screen
//   suppress    temporary       art presentation stands down; the composition
//                               is unchanged and returns afterward
//   evict       permanent       the node leaves this artwork and does not come
//                               back to it
//
// The distinction is the whole point, and it is a correction of an earlier draft
// that said higher layers "evict or constrain". Applied literally, focusing a sea
// node would fling it back to its semantic coordinate and closing the note would
// fling it back into the dog. Clicking an eye should not launch it across the
// ocean. Most interactions need the mildest mode, and the common ones need none.
//
//   DO NOT INTRODUCE MOTION IN THE NAME OF FUNCTIONAL CORRECTNESS. If the
//   interaction already works at the presentation coordinate, the correct amount
//   of yielding is none.
//
// Ordinary hover, click and selection therefore appear NOWHERE below, and their
// absence is deliberate rather than an omission. Picking is routed through
// presentation coordinates: the displacement is applied to the unit vector in
// the frame loop, before rotate(), so hit-testing reads the same `proj` array
// the member is looking at and the node is already clickable exactly where they
// see it. Nothing has to move for interaction to be correct.
//
// Reading priority as ownership transfer is the mistake a future contributor
// will otherwise make in good faith, which is why this comment is here and not
// only in the brief.
function artYield(ctx) {
  const c = ctx || {};
  const yields = [];
  // Suppress: something else legitimately owns the presentation space right
  // now. The composition is not lost, it is not recomputed, and it comes back
  // exactly as it was.
  if (c.courseOwnsView) {
    yields.push({ mode: 'suppress', scope: 'composition', reason: 'a course owns the view' });
  }
  if (c.overlayNeedsSpace) {
    yields.push({ mode: 'suppress', scope: 'composition', reason: 'a search or overlay needs the space' });
  }
  // Constrain: the artwork keeps going, within a limit. Reduced motion takes
  // away the MOTION and not the PICTURE. Someone who prefers reduced motion
  // should still get to have the dog; a static composition is not motion.
  if (c.reducedMotion) {
    yields.push({ mode: 'constrain', scope: 'animation', reason: 'reduced motion is on' });
  }
  const suppressed = yields.some((y) => y.mode === 'suppress');
  return {
    composition: suppressed ? 'suppressed' : 'show',
    // Necessary, never sufficient. The full animation gate is a conjunction
    // that also needs high legibility, a recognition that has already happened,
    // and the member attending right now. That arrives with phase 6; this layer
    // only reports whether anything here forbids motion outright.
    animation: (suppressed || yields.some((y) => y.scope === 'animation')) ? 'off' : 'allowed',
    yields,
  };
}

// Eviction is per-node and permanent for the current piece, and it is defined
// as losing eligibility rather than as a rule of its own. Deriving it keeps the
// two from ever disagreeing: whatever makes a node ineligible to join is exactly
// what makes it leave, so emergence recruiting a node and the member landing a
// node both work without a second code path.
//
// The visual exit settles gently rather than snapping. That is the renderer's
// business, not this function's; what is decided here is only that the node has
// gone, and that it does not come back to this piece.
function artEvicts(node, ctx) {
  const v = artEligible(node, ctx);
  return { evicted: !v.eligible, mode: 'evict', scope: 'node', reason: v.eligible ? null : v.reason };
}

// ── sea containment: a presentation invariant ───────────────────────────────
// Brief 4, and it has the same standing as the priority stack.
//
// The whole architecture rests on the claim that these nodes may be rearranged
// because in the sea, position asserts nothing. But eligibility is computed from
// data and the member reads pixels. Take a sea node near a coast, displace it a
// tenth of a radian for the dog, and its presentation coordinate lands over a
// continent. The data still says unfiled. The interface now says THIS NOTE IS
// SITTING IN A REGION, which is precisely the semantic confusion this whole
// design exists to prevent, produced by the feature meant to respect it.
//
// Two things this gets right that are easy to get wrong:
//
//   Test in 3D, on the sphere, never on screen. Screen position changes as the
//   globe turns, so a screen-space check passes at one rotation and fails at
//   another. The test is angular and rotation-invariant by construction.
//
//   It is a rejection condition, never a weighted cost. A candidate that puts
//   one node ashore is not a slightly worse candidate. It is not a candidate.
//   Nothing here returns a penalty a scorer could trade away.
//
// And the mask MOVES. As the member tags work, regions gain members and
// coastlines advance, so containment is revalidated on every reevaluation and
// never cached against a coastline that has since grown.

function artDot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function artCross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function artUnit(v) {
  const l = Math.hypot(v.x, v.y, v.z);
  return l > 1e-9 ? { x: v.x / l, y: v.y / l, z: v.z / l } : null;
}
function artAngle(a, b) { return Math.acos(Math.max(-1, Math.min(1, artDot(a, b)))); }

// A coastline, turned into something a containment test can ask questions of.
// Takes the globe's own coast objects ({ slug, c, loop }), which are measured
// from where each region's notes actually ended up rather than from a nominal
// cap, because "a perfect circle does not read as a country" and, more to the
// point here, the nominal cap has never been where the land ends.
//
// The tangent basis is derived from the coast's own first loop point rather than
// borrowed from globe.js `tangentFrame`. That is not a copy that has to stay in
// sync with anything: the loop's bearings are re-measured in whatever basis is
// built here, so the two only ever have to agree with THEMSELVES. Any consistent
// basis gives the same answer.
function artLand(coast) {
  const c = coast && coast.c;
  const loop = (coast && coast.loop) || [];
  if (!c || loop.length < 3) return null;
  const u = artUnit({ x: loop[0].x - c.x * artDot(loop[0], c),
    y: loop[0].y - c.y * artDot(loop[0], c),
    z: loop[0].z - c.z * artDot(loop[0], c) });
  if (!u) return null;
  const v = artCross(c, u);
  const at = loop.map((p) => {
    let th = Math.atan2(artDot(p, v), artDot(p, u));
    if (th < 0) th += Math.PI * 2;
    return { th, reach: artAngle(c, p) };
  }).sort((a, b) => a.th - b.th);
  return { slug: (coast && coast.slug) || null, c, u, v,
    bearing: at.map((p) => p.th), reach: at.map((p) => p.reach) };
}

function artLands(coasts) {
  return (coasts || []).map(artLand).filter(Boolean);
}

// How far this land reaches on one bearing, interpolated between the two
// measured samples that bracket it. Wraps around the loop, so there is no seam
// where the coast closes.
function artReachAt(land, th) {
  const b = land.bearing, r = land.reach, B = b.length;
  if (!B) return 0;
  if (B === 1) return r[0];
  let hi = 0;
  while (hi < B && b[hi] < th) hi++;
  const i1 = hi % B, i0 = (hi - 1 + B) % B;
  let span = b[i1] - b[i0];
  if (span <= 0) span += Math.PI * 2;
  let off = th - b[i0];
  if (off < 0) off += Math.PI * 2;
  const t = span > 1e-9 ? Math.max(0, Math.min(1, off / span)) : 0;
  return r[i0] + (r[i1] - r[i0]) * t;
}

// Is this direction still at sea, clear of every coast by the margin?
//
// Returns the worst case rather than a bare boolean, because the inspector needs
// to say WHICH land a rejected node was about to walk onto and by how much it
// missed. `clearance` is in radians: positive is open water, zero or less is
// ashore or inside the margin. Callers must treat it as a verdict, never as a
// cost to be weighed against anything.
function artSeaContains(vec, lands, opts) {
  const o = opts || {};
  const margin = o.margin == null ? ART_LAND_MARGIN : o.margin;
  const at = artUnit(vec);
  if (!at) return { contained: false, land: null, clearance: -Infinity };
  let worst = null;
  for (const land of (lands || [])) {
    if (!land) continue;
    const d = artAngle(land.c, at);
    // At the very centre of a land there is no bearing to speak of, and the
    // answer is not in doubt either way.
    let th = 0;
    const tu = artDot(at, land.u), tv = artDot(at, land.v);
    if (Math.hypot(tu, tv) > 1e-9) { th = Math.atan2(tv, tu); if (th < 0) th += Math.PI * 2; }
    const clearance = d - (artReachAt(land, th) + margin);
    if (!worst || clearance < worst.clearance) worst = { land: land.slug || null, clearance };
  }
  if (!worst) return { contained: true, land: null, clearance: Infinity };
  return { contained: worst.clearance > 0, land: worst.land, clearance: worst.clearance };
}

// ── the per-node inspector (brief 18.4, developer-only) ─────────────────────
// The question this exists to answer, which would otherwise cost days, is
// "why did this node disappear from the fish?" One call, one report, every
// fact the composition system knows about one node, in the vocabulary of the
// rules above. Pure like everything else here: the caller assembles the
// context (the page has a window handle that does it freshly per call, because
// eligibility, ownership and the coastline mask all move), and this function
// only reads it.
//
// `ctx.field` is the active composition's override map, id to either a unit
// vector or a channel record carrying `.at` plus the 3D-brief channels (alt,
// size, tint, lens). Before phase 3 there is no composition, the field is
// empty, and the honest report is displacement zero with candidate and cost
// null. Null means "no composition exists", and saying so beats inventing a
// number that means nothing.
function artInspect(node, ctx) {
  const c = ctx || {};
  const id = (node && node.id) || null;
  const verdict = artEligible(node, c);
  const semantic = node && node.at ? { x: node.at.x, y: node.at.y, z: node.at.z } : null;
  // the field entry, whichever shape it arrives in
  const entry = c.field && c.field.get ? (c.field.get(id) || null) : null;
  const rawAt = entry ? (entry.at || (isFinite(entry.x) ? entry : null)) : null;
  const presentation = rawAt ? artUnit(rawAt) : semantic;
  const moved = (semantic && presentation) ? artAngle(semantic, presentation) : 0;
  const view = artYield(c.view);
  return {
    id,
    eligible: verdict.eligible,
    why: verdict.reason,
    semantic,
    presentation,
    displacement: {
      radians: moved,
      budget: c.budget == null ? null : c.budget,
      withinBudget: c.budget == null ? null : moved <= c.budget,
    },
    // the non-position channels of the 3D node model, when the field carries
    // them; null the rest of the time, including for a bare displacement
    channels: entry && entry.at ? {
      alt: entry.alt == null ? null : entry.alt,
      size: entry.size == null ? null : entry.size,
      tint: entry.tint == null ? null : entry.tint,
      lens: entry.lens == null ? null : entry.lens,
    } : null,
    emergence: { claimed: (c.claimed instanceof Set ? c.claimed : artSet(c.claimed)).has(id) },
    containment: presentation
      ? artSeaContains(presentation, c.lands || [], c.margin == null ? undefined : { margin: c.margin })
      : null,
    candidate: c.candidate == null ? null : c.candidate,
    cost: c.cost == null ? null : c.cost,
    suppression: view.yields.filter((y) => y.mode === 'suppress').map((y) => y.reason),
    eviction: verdict.eligible ? null : verdict.reason,
    animation: view.animation,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ART_LAND_MARGIN, ART_REASON, artEligible, artEligibility, artResidue,
    artYield, artEvicts, artLand, artLands, artReachAt, artSeaContains, artInspect,
    // the vector helpers, exported for sea-art-engine.js so the two art files
    // share one set of spherical arithmetic instead of drifting copies
    artUnit, artDot, artCross, artAngle };
}
