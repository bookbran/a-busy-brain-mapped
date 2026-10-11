// Landmark art: the sculpture engine, one piece per landmark, made of the
// garden's own nodes. The core's region art is drawn with it, and so is any
// art an extension brings to the same spots.
//
// A place can have a visual identity: the sculpture says what it is ABOUT. It
// is a landmark, never a status: nothing here reads progress, and nothing here
// is coloured by it.
//
// The name is historical (this began as the art for one course and kept its
// file and global names so nothing that loads it had to move); the engine
// itself knows nothing about courses.
//
// The member's agent writes a small score in an art file (for a region,
// `context/art/region--<slug>.art.json`; see dashboard/COURSEART.md). This file compiles
// that score with the garden's Builder (seed-world.js, the same parts the
// onboarding garden is grown from: orbs, shells, stems, arches, sweeps, rings,
// filaments, canopies, lattices, knots) and draws it with the garden's node
// atom: discs of light with a soft halo, nearer nodes larger and brighter.
// Pure compile, so the same score is the same sculpture on every machine.
//
// Browser: window.CourseArt. Node: module.exports (the check script and the
// tests set `global.window` and require seed-world.js first).
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const NODE_CAP = 900;
  const KINDS = ['orb', 'shell', 'stem', 'arch', 'sweep', 'ring', 'filament', 'canopy', 'lattice', 'knot', 'point'];
  const COLS = { body: 0, rim: 1, deep: 2, light: 3, accent: 4 };

  const num = (v, d, lo, hi) => {
    const n = typeof v === 'number' && isFinite(v) ? v : d;
    return Math.max(lo, Math.min(hi, n));
  };
  const vec = (v, d) => (Array.isArray(v) && v.length >= 2
    ? [num(v[0], 0, -1.6, 1.6), num(v[1], 0, -1.6, 1.6), num(v[2] == null ? 0 : v[2], 0, -1.6, 1.6)]
    : (d || [0, 0, 0]).slice());
  const rad = (deg) => num(deg, 0, -360, 360) * Math.PI / 180;

  function seeded(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  // The score's palette: two hues and nothing else. Body, rim, deep and light
  // come from `hue`; the beads and the surprise come from `accentHue`. Lightness
  // and chroma are the house's, so every sculpture sits in the same world.
  // A PALETTE THAT SITS BESIDE THE ROUTE (Dan, 2026-09-25): "it needs to
  // complement the green of the line better". The body tones are quiet,
  // low-chroma versions of the score's hue, so the route's emerald stays the
  // one saturated line on the map and the sculpture harmonises with it
  // rather than competing. The accent keeps enough chroma to stay itself.
  // Art still never reads progress: no colour here depends on course state.
  // THE MATERIAL IS THE ROUTE'S GREEN (Dan, 2026-09-25: "the art nodes
  // themselves are using mostly the same course line green color"). Body,
  // rim, deep and light are four levels of the one emerald the travelled
  // line is drawn in (--journey-travelled, #34D399, OKLCH ~0.79/0.15/162),
  // so the sculpture reads as made of the same light as the path beside it.
  // It is CONSTANT: it never brightens, dims or changes with the course's
  // progress.
  //
  // AS MANY OTHER COLOURS AS THE PIECE WANTS (Dan, 2026-09-25), as long as
  // the green stays primary: `accentHue` colours beads and the surprise, and
  // any supporting part may carry its own `hue`. Each extra hue is added to
  // the palette at the house's lightness and chroma, so a many-coloured piece
  // is still one world. compile() refuses a piece that is not mostly green.
  function palette(spec, dark, oklchRgb, extra, baseHue) {
    // WHITE (Dan, 2026-10-10, on the Astrolabe piece: "all in the same white node
    // color as the logo for astrolabe, including the eyes"): `white: true` draws
    // every part, accents and extra hues too, in the near-white of the
    // Astrolabe mark's dots, with no chroma; depth stays a step in lightness
    if (spec && spec.white === true) {
      const n = 5 + ((extra && extra.length) || 0);
      const L = dark ? [0.97, 0.99, 0.9, 1, 0.98] : [0.9, 0.95, 0.82, 0.98, 0.92];
      return Array.from({ length: n }, (_, i) => 'rgb(' + oklchRgb(L[Math.min(i, 4)], 0, 0).join(',') + ')');
    }
    const G = baseHue == null ? 162 : baseHue;
    const a = num(spec && spec.accentHue, 85, 0, 360);
    const L = dark ? [0.79, 0.88, 0.62, 0.95, 0.84] : [0.62, 0.72, 0.48, 0.86, 0.58];
    const C = [0.18, 0.12, 0.14, 0.05, 0.15];
    const H = [G, G, G, G, a];
    // as vivid as the globe's own node colours (the kind palette sits at
    // about L 0.72 to 0.9, C 0.13 to 0.19): art that is duller reads as blur
    for (const h of extra || []) { L.push(dark ? 0.79 : 0.58); C.push(0.19); H.push(h); }
    return L.map((l, i) => 'rgb(' + oklchRgb(l, C[i], H[i]).join(',') + ')');
  }
  // COLOUR, AS DAN SET IT (2026-09-25, second word): "plenty of well used
  // colors ... as many as the art needs to look great, just that some of the
  // nodes need to be green, and if green is called for it's the course line
  // green so it doesn't clash." So: up to twelve hues per piece, a small floor
  // of route green (some, not most), and any hue in the green band SNAPS to
  // the route's exact green rather than sitting beside it as a near miss.
  const GREEN_FLOOR = 0.05, GREEN_WARN = 0, EXTRA_HUES = 12;
  const GREEN_BAND = [135, 190];
  const isGreenHue = (h) => h >= GREEN_BAND[0] && h <= GREEN_BAND[1];
  // REGION ART IS FREE OF ALL OF THAT (Dan, 2026-09-25: "the region art should
  // not follow the tracking art needs for course tracking green or prominence
  // of that colour at all"). The route green exists only because tracker art
  // stands beside the route. A region piece has no floor of green, no green
  // snapping, and a part without a hue takes the piece's own base colour (the
  // score's `hue`, else the region's own land colour), never the route's.
  let FREE = false;   // set for the length of one compile

  // Score → nodes. Returns { ok, problems, P, n, S } where P is the garden's
  // own 15-number node layout, recentred and fitted to a unit ball.
  function compile(spec, lib, eng, opts) {
    FREE = !!(opts && opts.free);
    try { return compileInner(spec, lib, eng); } finally { FREE = false; }
  }
  function compileInner(spec, lib, eng) {
    if (spec && Array.isArray(spec.strokes)) return compileStrokes(spec, eng);
    const W = lib || (root.SeedWorld || null);
    const problems = [];
    if (!W || !W.Builder) return { ok: false, problems: ['the garden builder is not loaded'], P: [], n: 0 };
    const s = spec || {};
    const parts = Array.isArray(s.parts) ? s.parts.filter((p) => p && typeof p === 'object') : [];
    if (!parts.length) problems.push('parts: at least one part is needed');
    const dom = parts.filter((p) => p.role === 'dominant');
    if (dom.length !== 1) problems.push('exactly one part must have role "dominant" (found ' + dom.length + ')');
    if (parts.filter((p) => p.role === 'surprise').length > 1) problems.push('at most one part may be the "surprise"');
    if (parts.length > 7) problems.push('at most 7 parts: one idea, quietly supported');
    for (const p of parts) if (KINDS.indexOf(p.kind) < 0) problems.push('unknown part kind "' + p.kind + '" (use ' + KINDS.join(', ') + ')');
    if (problems.length) return { ok: false, problems, P: [], n: 0 };

    const M = W.M, S = W.S;
    const rand = seeded(Number.isInteger(s.seed) ? s.seed : 7);
    const B = new W.Builder(rand, 2);
    // a supporting part's own hue gets its own palette slot (after the five);
    // the dominant is always the route's green, whatever it asks for
    const hues = [];
    const colOf = (p, d) => {
      if (typeof p.hue === 'number' && isFinite(p.hue) && (FREE || !isGreenHue(num(p.hue, 0, 0, 360)))) {
        const h = Math.round(num(p.hue, 0, 0, 360));
        let i = hues.indexOf(h);
        if (i < 0 && hues.length < EXTRA_HUES) { hues.push(h); i = hues.length - 1; }
        if (i >= 0) return 5 + i;
      }
      if (p.role === 'dominant' && p.color === 'accent') return COLS.body;
      return p.color in COLS ? COLS[p.color] : d;
    };
    // counts are clamped per part so no single part can eat the whole budget
    const cnt = (v, d) => Math.round(num(v, d, 3, 260));
    // SOFT PARTS: a part may ask to glow ("soft": true) where haze is the
    // point (a lantern, a nebula, a far light). The surprise glows unless it
    // says "soft": false. Everything else is drawn crisp.
    const softRuns = [];
    for (const p of parts) {
      const surprise = p.role === 'surprise';
      const before = B.n();
      const c = colOf(p, surprise ? COLS.accent : p.role === 'dominant' ? COLS.body : COLS.rim);
      const at = vec(p.at);
      switch (p.kind) {
        case 'orb': {
          const own = p.color || (typeof p.hue === 'number' && p.role !== 'dominant');
          const inner = colOf(p, COLS.body), outer = own ? inner : COLS.rim;
          B.orb(at, num(p.r, 0.45, 0.05, 1.1), cnt(p.n, 90), [inner, outer], { squash: num(p.squash, 1, 0.3, 2), core: num(p.core, 0.6, 0.2, 1.4), r: 0.022 });
          break;
        }
        case 'shell':
          B.shell(at, num(p.r, 0.5, 0.05, 1.1), cnt(p.n, 110), [typeof p.hue === 'number' && p.role !== 'dominant' ? colOf(p, COLS.deep) : COLS.deep, colOf(p, COLS.rim)],
            { lumpy: num(p.lumpy, 0, 0, 0.6), cap: p.cap == null ? null : num(p.cap, 0.5, -1, 1), squash: num(p.squash, 1, 0.3, 2), r: 0.02 });
          break;
        case 'stem': {
          const out = B.stem(vec(p.from, [0, -0.9, 0]), num(p.len, 1, 0.1, 2.2), rad(p.yaw), rad(p.bend), {
            lean0: rad(p.lean), mass: Math.round(num(p.mass, 1, 0, 4)), r: num(p.width, 0.024, 0.006, 0.08), c, step: num(p.step, 0.045, 0.02, 0.12), flex: 0.2,
          });
          if (p.knot) B.knot(out.tip, 0.06, 10, c);
          break;
        }
        case 'arch':
          B.arch(vec(p.from, [-0.7, -0.5, 0]), vec(p.to, [0.7, -0.5, 0]), num(p.lift, 0.8, -1.5, 1.5), cnt(p.n, 26), num(p.width, 0.022, 0.006, 0.08), c, { mass: !!p.mass });
          break;
        case 'sweep': {
          const pts = (Array.isArray(p.points) ? p.points : []).slice(0, 14).map((q) => vec(q));
          if (pts.length < 3) { problems.push('sweep: needs 3 to 14 points'); break; }
          B.sweep(pts, num(p.girth, 0.08, 0.01, 0.4), cnt(p.n, 120), { c, r: 0.018 });
          break;
        }
        case 'ring':
          B.orbitRing(at, num(p.r, 0.7, 0.1, 1.4), cnt(p.n, 60), rad(p.tilt == null ? 20 : p.tilt), rad(p.az), {
            c, beads: Math.round(num(p.beads, 0, 0, 12)), band: num(p.band, 0.05, 0, 0.3), q: p.spin === false ? 0 : num(p.speed, 0.12, 0, 0.5),
          });
          break;
        case 'filament':
          B.filament(vec(p.from, [-0.6, 0.4, 0]), vec(p.to, [0.6, 0.4, 0]), num(p.sag, 0.2, -1, 1), cnt(p.n, 22), { c, beads: Math.round(num(p.beads, 0, 0, 8)) });
          break;
        case 'canopy':
          B.canopy(at, num(p.r, 0.5, 0.05, 1.1), cnt(p.n, 120), c, { lobes: Math.round(num(p.lobes, 4, 1, 7)), squash: num(p.squash, 0.7, 0.2, 1.5), r: 0.02 });
          break;
        case 'lattice':
          B.lattice(vec(p.base, [0, -0.8, 0]), num(p.h, 1.2, 0.2, 2.2), num(p.r, 0.4, 0.05, 1.1), Math.round(num(p.rings, 4, 1, 9)), Math.round(num(p.posts, 5, 2, 12)), c, { taper: num(p.taper, 0.3, 0, 0.9) });
          break;
        case 'knot':
          B.knot(at, num(p.r, 0.12, 0.02, 0.5), cnt(p.n, 16), c);
          break;
        case 'point': {
          const size = num(p.size, 1, 0.3, 2.5);
          B.node(at[0], at[1], at[2], 0.05 * size, 1, colOf(p, COLS.accent), M.BREATHE, rand() * TAU, 0.05, at[0], at[1], at[2], 0.8);
          break;
        }
        default: break;
      }
      if (p.soft === true || (surprise && p.soft !== false)) softRuns.push([before, B.n()]);
    }
    if (problems.length) return { ok: false, problems, P: [], n: 0 };
    let P = B.P;
    let n = P.length / S;
    const soft0 = new Uint8Array(n);
    for (const [a0, a1] of softRuns) for (let k = a0; k < a1 && k < n; k++) soft0[k] = 1;
    let soft = soft0;
    if (n > NODE_CAP) {
      // thin evenly rather than cutting the last parts off
      const keep = [], step = n / NODE_CAP;
      soft = new Uint8Array(NODE_CAP);
      for (let k = 0; k < NODE_CAP; k++) {
        const src = Math.floor(k * step);
        soft[k] = soft0[src];
        for (let j = 0; j < S; j++) keep.push(P[src * S + j]);
      }
      P = keep; n = NODE_CAP;
    }
    // recentre on the centroid and fit the ball, so any score frames the same
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < n; k++) { cx += P[k * S]; cy += P[k * S + 1]; cz += P[k * S + 2]; }
    cx /= n || 1; cy /= n || 1; cz /= n || 1;
    // Fit the BODY, not its furthest outlier: a surprise set well apart (as
    // it should be) must not shrink the whole form to make room for itself.
    const ds = [];
    for (let k = 0; k < n; k++) ds.push(Math.hypot(P[k * S] - cx, P[k * S + 1] - cy, P[k * S + 2] - cz));
    ds.sort((a, b) => a - b);
    const R = Math.min(ds[ds.length - 1] || 0, (ds[Math.floor(0.95 * (ds.length - 1))] || 0) * 1.12);
    const k0 = R > 1e-6 ? 1 / R : 1;
    const out = new Float32Array(n * S);
    for (let k = 0; k < n; k++) {
      const o = k * S;
      for (let j = 0; j < S; j++) out[o + j] = P[o + j];
      out[o] = (P[o] - cx) * k0; out[o + 1] = (P[o + 1] - cy) * k0; out[o + 2] = (P[o + 2] - cz) * k0;
      out[o + 3] = P[o + 3] * k0;
      // pivots move with the form
      out[o + 9] = (P[o + 9] - cx) * k0; out[o + 10] = (P[o + 10] - cy) * k0; out[o + 11] = (P[o + 11] - cz) * k0;
    }
    // One node size, nearly: the garden varies radius a lot for depth and
    // texture, which at this scale read as blur. Sizes are pulled to within
    // about a fifth of the mean.
    let mean = 0;
    for (let k = 0; k < n; k++) mean += out[k * S + 3] / n;
    for (let k = 0; k < n; k++) {
      const r = out[k * S + 3];
      out[k * S + 3] = mean * Math.max(0.82, Math.min(1.22, 1 + (r / (mean || 1) - 1) * 0.3));
    }
    // GREEN STAYS PRIMARY: most of the piece is the route's green (palette
    // slots 0..3). Some of it must be: below GREEN_FLOOR it is refused. (The
    // old "mostly green" rule is retired; the art may be any colours.) Below GREEN_WARN it is allowed
    // with a warning the check script prints.
    let green = 0;
    for (let k = 0; k < n; k++) if (out[k * S + 5] <= 3) green++;
    const share = n ? green / n : 1;
    if (!FREE && share < GREEN_FLOOR) {
      return { ok: false, problems: ['the route green must stay the primary colour: only ' + Math.round(share * 100)
        + '% of nodes are the route green (at least ' + Math.round(GREEN_FLOOR * 100) + '% needed); leave one part without a hue so it is drawn in the route green'], P: [], n: 0 };
    }
    const warnings = [];
    return { ok: true, problems: [], warnings, greenShare: share, hues, P: out, n, S, soft, meanR: mean, motion: ['still', 'turn', 'breathe'].indexOf(s.motion) >= 0 ? s.motion : 'turn' };
  }

  // ── THE FULL NODE-ART SYSTEM (Dan, 2026-09-25) ───────────────────────────
  // "The art needs to be more impressive, using more nodes and making use of
  // the entire design system for node art." A score with `strokes` is a
  // gallery-stage piece, compiled by the sea-art engine exactly as a tattoo
  // is (docs/SEA-ART-PROTOCOL.md: the gallery stage, bodies, object space,
  // making it move like the thing it is): bones swept into tubes and blades,
  // volume and symmetry, up to 2048 points, and articulated motion where a
  // bone sways, hinges, pulses or holds and carries what hangs from it.
  //
  // Two things are ours on top of the engine's score: each stroke may carry
  // its own `hue` and `soft`. Colour is decided here, not by the engine's
  // palettes, because the route's green is the material.
  function compileStrokes(spec, eng) {
    const E = eng || root;
    if (!E || typeof E.artCommission !== 'function') return { ok: false, problems: ['the node art engine is not loaded'], n: 0 };
    const strokes = Array.isArray(spec.strokes) ? spec.strokes : [];
    if (!strokes.length) return { ok: false, problems: ['strokes: at least one'], n: 0 };
    const hueOf = [], softOf = [], travelOf = [], carriedOf = [], flickerOf = [], formOf = [];
    const intent = intentOf(spec);
    const squash = depthSquash(strokes, intent.depth);
    const clean = Object.assign({}, spec, {
      strokes: strokes.map((st, i) => {
        const o = Object.assign({}, st || {});
        // DEPTH ON PURPOSE: a shallow or moderate piece's authored depth is
        // held to its share of the width, about the piece's own middle
        if (squash.k < 1 && Array.isArray(o.points)) {
          o.points = o.points.map((p) => (Array.isArray(p) && p.length > 2 && isFinite(p[2]))
            ? [p[0], p[1], squash.mid + (p[2] - squash.mid) * squash.k] : p);
        }
        // EVERY PART SAYS WHAT IT IS WORTH TO RECOGNITION. Unsaid, a solid is
        // secondary and a thread is detail, so globe art always allocates by
        // meaning (the engine's semantic path) and never by surface area.
        if (o.section && !IMPORTANCE.includes(o.importance)) o.importance = o.section === 'thread' ? 'detail' : 'secondary';
        // A PART THAT CROSSES (Dan, 2026-09-26: "make the art able to move
        // things along a path"). `travel` is ours, not the engine's: the part
        // is built rigid (still) and ridden along the stroke named by `along`
        // after skinning, so a train crosses its bridge and comes back.
        if (o.moves === 'travel') {
          const k = Number.isInteger(o.along) ? o.along - 1 : -1;
          if (k >= 0 && k < strokes.length && k !== i) {
            travelOf[i] = { along: k, speed: num(o.speed, 1, 0.3, 3), heading: o.heading === -1 ? -1 : 1 };
          }
          o.moves = 'still';
        }
        // A PART CARRIED BY A TRAVELLER (2026-09-26, the Membership lanterns):
        // a lantern in a walker's hand, a rider on a train. It rides with the
        // stroke named by `by` (which travels), so the two never drift apart.
        if (o.moves === 'carried') {
          const k = Number.isInteger(o.by) ? o.by - 1 : -1;
          if (k >= 0 && k < strokes.length && k !== i) carriedOf[i] = k;
          o.moves = 'still';
        }
        // FIRE (2026-09-26: "the fire in the onboarding sequence looks way
        // better"). A swept blade reads as a leaf, never a flame. The
        // onboarding hearth is light rising through its own band and fading
        // as it rises, then beginning again; `flicker` gives a stroke exactly
        // that: its nodes lift, waver, shrink and fade. Built still, moved here.
        if (o.moves === 'flicker') { flickerOf[i] = true; o.moves = 'still'; }
        // TWO FORMS OF LIGHT (2026-10-10, Dan on the Astrolabe logo: "it has
        // individual scattered nodes, and the eyes are larger individual nodes").
        // A tube is always rings of nodes, which reads as a precise mesh; these
        // are built as tubes for the engine and rearranged by the sculptor:
        //   `shell`  the tube's volume as a loose scatter of single lights over
        //            its surface (a planet, a bubble, a seed head); `dots` caps
        //            how many show, `loose` (0 to 1) how far they wander
        //   `dot`    one bigger single light at the stroke's middle (an eye, a
        //            star, a button); `scale` is its size against a plain node
        if (o.section === 'shell' || o.section === 'dot') {
          formOf[i] = { kind: o.section, dots: Number.isInteger(o.dots) ? Math.max(4, Math.min(400, o.dots)) : null,
            loose: num(o.loose, 0.5, 0, 1), scale: num(o.scale, 2.2, 0.3, 4),
            // a shell's `lights`: each light's size, 0.3 to 1.5 of a plain one (2026-10-10)
            lights: num(o.lights, 1, 0.3, 1.5) };
          o.section = 'tube';
          if (formOf[i].kind === 'dot' && o.girth == null) o.girth = 0.03;
        }
        delete o.dots; delete o.loose; delete o.scale; delete o.lights;
        delete o.along; delete o.speed; delete o.heading; delete o.by;
        const h0 = typeof o.hue === 'number' && isFinite(o.hue) ? Math.round(num(o.hue, 0, 0, 360)) : null;
        // a green ask IS the route green: no near-miss greens beside the line
        hueOf[i] = h0 != null && !FREE && isGreenHue(h0) ? null : h0;
        softOf[i] = o.soft === true;
        // EVERY BODY MOVES LIKE WHAT IT IS (Dan, 2026-09-25). A bodied stroke
        // that did not say how it moves gets the move its section implies: a
        // blade (wing, petal, fin, leaf) hinges from where it attaches, a
        // tube (arm, stem, neck, tendril) sways, root holding and tip
        // travelling most. The build rules (lint) still ask the agent to say
        // it on purpose; this is what makes older and careless pieces move.
        if (o.section && MOVES.indexOf(o.moves) < 0) o.moves = o.section === 'thread' ? 'still' : o.section === 'blade' ? 'hinge' : o.section === 'box' ? 'still' : formOf[i] ? 'still' : 'sway';
        delete o.hue; delete o.soft;
        return o;
      }),
    });
    delete clean.parts; delete clean.accentHue; delete clean.hue; delete clean.depth; delete clean.view;
    // SCAFFOLD IS NOT GLOBE MATERIAL: every point should belong to a part.
    // Off unless asked for, and then a pinch.
    if (clean.volume) {
      const v = Object.assign({}, clean.volume);
      v.scaffold = Math.max(0, Math.min(SCAFFOLD_MAX, Math.round(v.scaffold || 0)));
      clean.volume = v;
    }
    // and the piece always has a cadence for its parts to act on
    if (!clean.motion || !clean.motion.kind) clean.motion = { kind: 'breathe', tempo: 'lazy', amplitude: 0.05 };
    // A LANDMARK MUST VISIBLY LIVE. At 150 to 250px the sea's lazy cadence
    // (one act a phrase, long rests) at 0.05 moved nodes four or five pixels
    // and read as still. So art landmarks keep at least a steady tempo and an
    // amplitude near the gallery's ceiling (0.105): parts act more often and
    // travel far enough to be seen, each in its own anatomical way.
    const m = Object.assign({}, clean.motion);
    if (!(typeof m.amplitude === 'number' && m.amplitude >= 0.09)) m.amplitude = 0.09;
    if (!m.tempo || m.tempo === 'lazy') m.tempo = 'steady';
    clean.motion = m;
    if (!Number.isInteger(clean.seed)) clean.seed = 7;
    // THE UNIT IS THE PROJECTED OBJECT, NOT A NODE COUNT: a shallow, linear
    // piece reads better from fewer, well-spaced nodes plus filaments; a
    // volumetric one can carry more
    if (clean.size == null) clean.size = SIZE_FOR[intent.depth];
    const out = E.artCommission(clean);
    if (!out.ok) return { ok: false, problems: (out.problems || []).slice(0, 8), n: 0 };
    const targets = [...out.piece.targets.values()];
    const hues = [];
    const col = new Uint8Array(targets.length), soft = new Uint8Array(targets.length);
    let green = 0;
    targets.forEach((t, i) => {
      const k = t.sweep && typeof t.sweep.stroke === 'number' ? t.sweep.stroke : -1;
      const h = k >= 0 ? hueOf[k] : null;
      if (h != null) {
        let j = hues.indexOf(h);
        if (j < 0 && hues.length < EXTRA_HUES) { hues.push(h); j = hues.length - 1; }
        col[i] = j >= 0 ? 5 + j : COLS.body;
      } else col[i] = k >= 0 ? COLS.body : COLS.rim;   // bones in the green, ink and scaffold its lighter level
      if (k >= 0 && softOf[k]) soft[i] = 1;
      if (col[i] <= 3) green++;
    });
    const share = targets.length ? green / targets.length : 1;
    if (!FREE && share < GREEN_FLOOR) {
      return { ok: false, problems: ['the route green must stay the primary colour: only ' + Math.round(share * 100)
        + '% of nodes are the route green (at least ' + Math.round(GREEN_FLOOR * 100) + '% needed); leave one stroke without a hue'], n: 0 };
    }
    const shape = sculptOf(targets, spec, softOf);
    const travel = travelOf.length ? buildTravel(targets, travelOf, carriedOf) : null;
    const fire = flickerOf.length ? buildFire(targets, flickerOf) : null;
    return { ok: true, problems: [], engine: true, piece: out.piece, score: clean, targets, col, soft, hues, n: targets.length, travel, fire, intent, squash, forms: formOf,
      keep: shape.keep, role: shape.role, threads: shape.threads, aspect: shape.aspect, dmin: shape.dmin, compiled: targets.length,
      greenShare: share, warnings: [],
      motion: 'turn' };
  }

  // ── THE ART DIRECTOR'S VOCABULARY (2026-09-26) ──────────────────────────
  // "The piece must read, at actual globe scale, as the thing it is meant to
  // represent." Three compact words on top of the engine's score, each turned
  // into decisions here rather than handed to the agent as numbers:
  //   importance (per stroke)  primary | secondary | detail | accent
  //   depth      (per piece)   shallow | moderate | volumetric
  //   view       (per piece)   elevation | three-quarter | top | free
  const IMPORTANCE = ['primary', 'secondary', 'detail', 'accent'];
  const DEPTHS = ['shallow', 'moderate', 'volumetric'];
  const VIEWS = ['elevation', 'three-quarter', 'top', 'free'];
  const DEPTH_MAX = { shallow: 0.33, moderate: 0.6, volumetric: Infinity };   // depth as a share of width
  const SIZE_FOR = { shallow: 900, moderate: 1100, volumetric: 1400 };
  const SCAFFOLD_MAX = 40;
  function intentOf(spec) {
    const s = spec || {};
    const strokes = Array.isArray(s.strokes) ? s.strokes : [];
    const hasThread = strokes.some((x) => x && x.section === 'thread');
    const depth = DEPTHS.includes(s.depth) ? s.depth
      : (s.view === 'elevation' || hasThread) ? 'shallow' : s.view === 'top' ? 'moderate' : 'moderate';
    const view = VIEWS.includes(s.view) ? s.view
      : depth === 'shallow' ? 'elevation' : depth === 'volumetric' ? 'free' : 'three-quarter';
    return { depth, view, said: { depth: DEPTHS.includes(s.depth), view: VIEWS.includes(s.view) } };
  }
  // How much the authored depth has to be pressed to fit the piece's depth
  // intent: { k (1 = as drawn), mid, ratio (as drawn, depth / width) }
  function depthSquash(strokes, depth) {
    let x0 = Infinity, x1 = -Infinity, w0 = Infinity, w1 = -Infinity;
    for (const st of strokes || []) for (const p of (st && st.points) || []) {
      if (!Array.isArray(p)) continue;
      x0 = Math.min(x0, +p[0] || 0); x1 = Math.max(x1, +p[0] || 0);
      const w = p.length > 2 && isFinite(p[2]) ? +p[2] : 0;
      w0 = Math.min(w0, w); w1 = Math.max(w1, w);
    }
    const width = Math.max(1e-6, x1 - x0), d = isFinite(w1) ? w1 - w0 : 0;
    const ratio = d / width, max = DEPTH_MAX[depth] || Infinity;
    return { k: ratio > max ? max / ratio : 1, mid: isFinite(w1) ? (w0 + w1) / 2 : 0, ratio };
  }

  // ── MATERIAL LIGHT (2026-09-26) ─────────────────────────────────────────
  // Alpha on a 2px disc does not read as form. So light moves the node's
  // COLOUR: each palette colour gets a ramp of seven OKLCH lightness steps
  // (shadow keeps some chroma, the highlight gives a little back), and a
  // node takes the step its surface earns from one light, upper left in
  // front, with a small rim lift where the surface turns away from you.
  // Alpha stays for what alpha means: visibility, facing, occlusion.
  const LIGHT = (() => { const l = Math.hypot(-0.45, 0.65, 0.62); return { x: -0.45 / l, y: 0.65 / l, z: 0.62 / l }; })();
  const RAMP_L = [0.5, 0.62, 0.74, 0.86, 0.97, 1.07, 1.15];
  const RAMP_C = [0.8, 0.88, 0.95, 1, 1, 0.94, 0.82];
  function shadeRamps(cols, oklchRgb) {
    return cols.map((c) => {
      const lab = typeof root.artOklabOf === 'function' ? root.artOklabOf(c) : null;
      if (!lab || !isFinite(lab.L)) return RAMP_L.map(() => c);
      const C = Math.hypot(lab.a, lab.b), h = (Math.atan2(lab.b, lab.a) * 180 / Math.PI + 360) % 360;
      return RAMP_L.map((m, k) => 'rgb(' + oklchRgb(Math.min(0.97, lab.L * m), C * RAMP_C[k], h).join(',') + ')');
    });
  }
  // the ramp step for a surface normal already turned into view space
  // (x right, y up, z toward you)
  function shadeStep(Nx, Ny, Nz) {
    const lam = Math.max(0, Nx * LIGHT.x + Ny * LIGHT.y + Nz * LIGHT.z);
    const rim = Math.pow(1 - Math.min(1, Math.abs(Nz)), 3) * 0.2;
    return Math.max(0, Math.min(6, Math.round((0.16 + 0.84 * lam + rim) * 6)));
  }

  // ── TRAVEL: a part riding another part's line ───────────────────────────
  // The path is the `along` stroke's own centreline as compiled (its swept
  // nodes averaged by their place along the bone), so it is in the piece's
  // frame and follows whatever the agent drew. The traveller shuttles: it
  // eases from where it was drawn toward one end, waits, crosses to the
  // other, waits, and comes back, never popping. Its offset is a rigid
  // translation, added after the rig's pose.
  const TRAVEL_BINS = 40, TRAVEL_SPEED = 0.11, TRAVEL_DWELL = 2.4;
  function buildTravel(targets, travelOf, carriedOf) {
    const movers = [], moverOf = [];
    const paths = new Map();
    const pathOf = (k) => {
      if (paths.has(k)) return paths.get(k);
      const acc = [];
      for (const t of targets) {
        if (!t.sweep || t.sweep.stroke !== k || !t.pieceAt) continue;
        const b = Math.min(TRAVEL_BINS - 1, Math.floor((t.sweep.s || 0) * TRAVEL_BINS));
        const a = acc[b] || (acc[b] = { x: 0, y: 0, z: 0, n: 0 });
        a.x += t.pieceAt.x; a.y += t.pieceAt.y; a.z += t.pieceAt.z; a.n++;
      }
      const pts = acc.filter(Boolean).map((a) => ({ x: a.x / a.n, y: a.y / a.n, z: a.z / a.n }));
      const len = [0];
      for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z));
      const p = pts.length >= 2 ? { pts, len, L: len[len.length - 1] } : null;
      paths.set(k, p);
      return p;
    };
    travelOf.forEach((tv, i) => {
      if (!tv) return;
      const path = pathOf(tv.along);
      if (!path || !(path.L > 0)) return;
      const nodes = [];
      let cx = 0, cy = 0, cz = 0;
      targets.forEach((t, j) => { if (t.sweep && t.sweep.stroke === i && t.pieceAt) { nodes.push(j); cx += t.pieceAt.x; cy += t.pieceAt.y; cz += t.pieceAt.z; } });
      if (!nodes.length) return;
      cx /= nodes.length; cy /= nodes.length; cz /= nodes.length;
      // where it stands on the path, and how much room its own length needs
      let best = 0, bd = Infinity;
      path.pts.forEach((q, m) => { const d = Math.hypot(q.x - cx, q.y - cy, q.z - cz); if (d < bd) { bd = d; best = m; } });
      let half = 0;
      for (const j of nodes) { const q = targets[j].pieceAt; half = Math.max(half, Math.hypot(q.x - cx, q.y - cy, q.z - cz)); }
      const a = Math.min(half, path.L / 2), b = Math.max(a, path.L - half);
      const home = Math.max(a, Math.min(b, path.len[best]));
      moverOf[i] = movers.length;
      movers.push({ nodes, path, a, b, home, heading: tv.heading, v: TRAVEL_SPEED * tv.speed });
    });
    // what a traveller carries rides with it, the same offset every frame
    (carriedOf || []).forEach((k, i) => {
      const m = k != null && moverOf[k] != null ? movers[moverOf[k]] : null;
      if (!m) return;
      targets.forEach((t, j) => { if (t.sweep && t.sweep.stroke === i && t.pieceAt) m.nodes.push(j); });
    });
    for (const m of movers) m.nodes = Int32Array.from(m.nodes);
    return movers.length ? movers : null;
  }

  // ── FIRE: light rising through its band ─────────────────────────────────
  // The onboarding hearth's grammar (seed-world.js, M.FLAME), for a stroke
  // that says `"moves": "flicker"`. Each node starts in the lower half of the
  // tongue as drawn, rises through half its height, drawing in toward the
  // middle, wavering, shrinking and fading, then begins again. Every node has
  // its own phase and rate, so the tongue is always full and never pulses as
  // one. At rest (reduced motion, the proof) each node holds its own phase:
  // a snapshot of the living fire, dense and bright low, thin and faint high.
  function buildFire(targets, flickerOf) {
    const nodes = [], y0 = [], band = [], cx = [], cz = [], ph = [], rate = [];
    flickerOf.forEach((on, k) => {
      if (!on) return;
      const mine = [];
      let lo = Infinity, hi = -Infinity, sx = 0, sz = 0;
      targets.forEach((t, j) => {
        if (!t.sweep || t.sweep.stroke !== k || !t.pieceAt) return;
        mine.push(j); lo = Math.min(lo, t.pieceAt.y); hi = Math.max(hi, t.pieceAt.y); sx += t.pieceAt.x; sz += t.pieceAt.z;
      });
      if (!mine.length) return;
      const H = Math.max(1e-6, hi - lo);
      mine.forEach((j, m) => {
        const q = targets[j].pieceAt;
        nodes.push(j); y0.push(lo + (q.y - lo) * 0.55); band.push(H * 0.5);
        cx.push(sx / mine.length); cz.push(sz / mine.length);
        ph.push((m * 0.6180339887 + k * 0.371) % 1); rate.push(0.55 + 0.5 * ((m * 0.7548776662 + 0.21) % 1));
      });
    });
    return nodes.length ? { nodes: Int32Array.from(nodes), y0, band, cx, cz, ph, rate } : null;
  }
  // each fire node's offset from where it was drawn, and how lit and how big
  // it is, at time t (still: its own phase, held)
  function fireAt(fire, targets, t, still, into) {
    const out = into || { dx: new Float32Array(fire.nodes.length), dy: new Float32Array(fire.nodes.length), dz: new Float32Array(fire.nodes.length), fade: new Float32Array(fire.nodes.length), size: new Float32Array(fire.nodes.length) };
    for (let m = 0; m < fire.nodes.length; m++) {
      const q = targets[fire.nodes[m]].pieceAt, u = still ? fire.ph[m] : (t * fire.rate[m] + fire.ph[m]) % 1;
      const w = still ? 0 : fire.band[m] * 0.12 * u;
      out.dx[m] = (fire.cx[m] - q.x) * 0.6 * u + w * Math.sin(t * 4.2 + fire.ph[m] * 17);
      out.dy[m] = fire.y0[m] - q.y + fire.band[m] * u;
      out.dz[m] = (fire.cz[m] - q.z) * 0.6 * u + w * 0.6 * Math.cos(t * 3.1 + fire.ph[m] * 11);
      out.fade[m] = Math.pow(1 - u, 0.8);
      out.size[m] = 1 - 0.45 * u;
    }
    return out;
  }
  function travelPathAt(path, u) {
    const { pts, len } = path;
    let i = 1;
    while (i < len.length - 1 && len[i] < u) i++;
    const f = len[i] > len[i - 1] ? Math.max(0, Math.min(1, (u - len[i - 1]) / (len[i] - len[i - 1]))) : 0;
    const p = pts[i - 1], q = pts[i];
    return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, z: p.z + (q.z - p.z) * f };
  }
  // the shuttle's place on its path at time t (seconds), as an arc length
  function travelU(m, t) {
    const span = m.b - m.a;
    if (!(span > 1e-6)) return m.home;
    const trip = span / m.v, cycle = 2 * (trip + TRAVEL_DWELL);
    // start at home, on the leg that heads where the agent asked
    const f0 = Math.acos(Math.max(-1, Math.min(1, 1 - 2 * (m.home - m.a) / span))) / Math.PI;
    const tau0 = m.heading > 0 ? TRAVEL_DWELL + f0 * trip : 2 * TRAVEL_DWELL + trip + (1 - f0) * trip;
    const tau = (((t + tau0) % cycle) + cycle) % cycle;
    const ease = (f) => (1 - Math.cos(Math.PI * f)) / 2;
    if (tau < TRAVEL_DWELL) return m.a;
    if (tau < TRAVEL_DWELL + trip) return m.a + span * ease((tau - TRAVEL_DWELL) / trip);
    if (tau < 2 * TRAVEL_DWELL + trip) return m.b;
    return m.b - span * ease((tau - 2 * TRAVEL_DWELL - trip) / trip);
  }
  // each traveller's rigid offset at time t: [{ nodes, x, y, z }]
  function travelOffsets(travel, t) {
    if (!travel) return null;
    return travel.map((m) => {
      const p = travelPathAt(m.path, travelU(m, t)), h = travelPathAt(m.path, m.home);
      return { nodes: m.nodes, x: p.x - h.x, y: p.y - h.y, z: p.z - h.z };
    });
  }

  // ── THE BUILD RULES (Dan, 2026-09-25) ───────────────────────────────────
  // "Make sure it moves based on what parts of it should be moving, based on
  // the function of those parts of the whole, and uses colour well throughout
  // the nodes. Apply those rules as part of how region art and tracker art
  // gets built, so that it reliably happens." The check script the agent must
  // pass runs these, so a piece that breaks them is sent back, not shown.
  // Drawing stays lenient (compile fills in moves and motion), so a piece
  // already on someone's map never disappears for failing a newer rule.
  const MOVES = ['still', 'sway', 'hinge', 'pulse'];
  function lint(spec, opts) {
    const free = !!(opts && opts.free);
    const out = [];
    const s0 = spec || {};
    if (!Array.isArray(s0.strokes)) {
      return ['build it in the full node-art system: a "strokes" score, not "parts" (see COURSEART.md)'];
    }
    const strokes = s0.strokes.filter((x) => x && typeof x === 'object');
    const bodies = strokes.filter((x) => x.section && x.section !== 'thread');
    strokes.forEach((x, i) => {
      if (x.importance != null && !IMPORTANCE.includes(x.importance)) out.push('stroke ' + (i + 1) + ' importance "' + x.importance + '" is not one of ' + IMPORTANCE.join(' | '));
    });
    if (s0.depth != null && !DEPTHS.includes(s0.depth)) out.push('depth "' + s0.depth + '" is not one of ' + DEPTHS.join(' | '));
    if (s0.view != null && !VIEWS.includes(s0.view)) out.push('view "' + s0.view + '" is not one of ' + VIEWS.join(' | '));
    if (bodies.length < 3) out.push('give at least three strokes a body ("section" and a "girth" profile); ' + bodies.length + ' have one');
    strokes.forEach((x, i) => {
      if (x.moves === 'travel') {
        const k = Number.isInteger(x.along) ? x.along - 1 : -1;
        if (k < 0 || k >= strokes.length || k === i || !strokes[k].section) {
          out.push('stroke ' + (i + 1) + ' travels but "along" does not name another bodied stroke to ride (1-based, e.g. "along": 1 for the first stroke)');
        }
      } else if (x.moves === 'carried') {
        const k = Number.isInteger(x.by) ? x.by - 1 : -1;
        if (k < 0 || k >= strokes.length || k === i || strokes[k].moves !== 'travel') {
          out.push('stroke ' + (i + 1) + ' is carried but "by" does not name a stroke that travels (1-based)');
        }
      } else if (x.moves === 'flicker') {
        if (x.section === 'thread') out.push('stroke ' + (i + 1) + ' flickers but is a thread: fire is a tube (its girth is the tongue\'s width)');
      } else if (x.section && x.section !== 'thread' && MOVES.indexOf(x.moves) < 0) {
        out.push('stroke ' + (i + 1) + ' has a body but no "moves": say what this part does in the whole (pulse for a body or heart, sway for an arm, stem, tail or tendril, hinge for a wing, petal, fin or jaw, still for legs, trunks and foundations, travel for something that crosses along another part, carried for what a traveller holds, flicker for fire)');
      }
    });
    // VOLUME, NOT WIRE (Dan, 2026-09-26: "use the full 3d girth and tube
    // ability"). A girth under ~0.05 sweeps a line of beads with no body for
    // the light to round off; threads are welcome as detail, but the main
    // forms must be solids.
    const peak = (g) => typeof g === 'number' ? g : Array.isArray(g) ? g.reduce((m, p) => Math.max(m, (p && p.r) || 0), 0) : 0;
    // (a shallow piece read in elevation, a bridge or a skyline, is drawn in
    // slim members: its volume floor is lower, and its lines are threads)
    const solidMin = intentOf(s0).depth === 'shallow' ? 0.018 : 0.05;
    const solid = bodies.filter((x) => x.section === 'shell' || x.section === 'dot' || peak(x.girth) >= solidMin).length;
    if (bodies.length >= 3 && solid < 3) out.push('give the main forms real volume: at least three bodied strokes with a girth of ' + solidMin + ' or more at their widest (now ' + solid + '); keep hair-thin girths for threads and cables only');
    const moving = bodies.filter((x) => ['sway', 'hinge', 'pulse', 'travel', 'carried', 'flicker'].includes(x.moves)).length;
    if (moving < 2) out.push('at least two parts must move (pulse, sway, hinge, travel, carried or flicker) because of what they are; ' + moving + ' do');
    if (!s0.motion || !s0.motion.kind) out.push('set "motion" (a kind and a tempo, e.g. {"kind": "breathe", "tempo": "lazy", "amplitude": 0.05}) so the parts have a cadence to act on');
    // colour: distinct hues across the parts (within 15 degrees counts as one)
    const tones = new Set();
    for (const x of strokes) {
      if (typeof x.hue === 'number' && isFinite(x.hue)) {
        const h = Math.round(num(x.hue, 0, 0, 360));
        tones.add(!free && isGreenHue(h) ? 'route-green' : 'h' + Math.round(h / 15));
      } else tones.add(free ? 'base' : 'route-green');
    }
    if (tones.size < 3) out.push('use colour across the piece: at least three distinct colours, each on the parts it means something for (now ' + tones.size + ')');
    // A LANDMARK, NOT CONFETTI (Dan, 2026-09-25): colour describes the major
    // forms, so a piece holds one or two dominant families, a secondary and an
    // accent. A different bright hue on every limb is what read as confetti.
    if (tones.size > 5) out.push('restrain the palette: ' + tones.size + ' colour families, at most five (one or two dominant, a secondary, an accent); let neighbouring parts of one region share a hue so colour describes form');
    // and a few large relationships, not a limb per idea
    if (strokes.length > 10) out.push('simplify: ' + strokes.length + ' strokes, at most ten; find the three to five structural regions the eye can hold and let them carry the idea');
    return out;
  }

  // Composition notes the check script prints without refusing: a tall thin
  // piece stacks into a column at landmark size; most pieces read better
  // stretched diagonally, laterally or around a void.
  function advise(spec) {
    const out = [];
    const pts = [];
    for (const x of (spec && Array.isArray(spec.strokes) ? spec.strokes : [])) for (const p of (x && x.points) || []) if (Array.isArray(p)) pts.push(p);
    if (pts.length < 2) return out;
    const xs = pts.map((p) => +p[0] || 0), ys = pts.map((p) => +p[1] || 0);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    if (h > 0 && w / h < 0.85) out.push('the piece stands ' + (w / h).toFixed(2) + ' as wide as it is tall: at landmark size a column stacks; consider letting it reach sideways, diagonally or around an opening');
    return out;
  }

  // ── THE SCULPTURE'S GRAIN (Dan, 2026-09-25) ─────────────────────────────
  // "Course art uses the same visual unit as the course world: substantial
  // luminous nodes in spatial relationship. Landmark readability outranks
  // particle density." The engine sweeps every bone into rings of 12 to 21
  // nodes and scatters scaffold around the linework, which at a landmark's
  // size is a point cloud. So the piece is THINNED in its own space before it
  // is drawn: every kept node has a clear gap to its neighbours (about two
  // node diameters at the drawn size), chosen in priority order so the bones
  // survive and the filler does not:
  //   anchors     each bone's two ends, on its leading line
  //   structure   four lines running the length of each bone (its contour)
  //   surface     the rest of each bone's skin, only where there is room
  //   accent      scaffold, sparingly, at twice the spacing
  // The result keeps the piece's full footprint with a fraction of the nodes
  // and air between them. `grain` in the score is bold | medium | fine.
  const GRAIN = { bold: 0.17, medium: 0.135, fine: 0.105 };
  function sculptOf(targets, spec, softOf) {
    const dmin = GRAIN[spec && spec.grain] || GRAIN.medium;
    const n = targets.length;
    const tier = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const sw = targets[i].sweep;
      if (!sw) { tier[i] = 3; continue; }
      const ang = sw.ang || 0;
      const line = Math.abs(ang * 4 - Math.round(ang * 4)) < 0.02;   // one of four lines along the bone
      const end = sw.si === 0 || sw.si === (sw.axial || 1) - 1;
      tier[i] = end && ang < 0.02 ? 0 : line ? 1 : 2;
    }
    const cell = new Map();
    const key = (x, y, z, c) => Math.floor(x / c) + ',' + Math.floor(y / c) + ',' + Math.floor(z / c);
    const keep = [], role = [];
    const near = (q, d) => {
      const cx = Math.floor(q.x / dmin), cy = Math.floor(q.y / dmin), cz = Math.floor(q.z / dmin);
      const r = Math.ceil(d / dmin);
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) {
        const list = cell.get((cx + a) + ',' + (cy + b) + ',' + (cz + c));
        if (!list) continue;
        for (const o of list) if (Math.hypot(o.x - q.x, o.y - q.y, o.z - q.z) < d) return true;
      }
      return false;
    };
    const CAP = 460;
    for (let t = 0; t <= 3 && keep.length < CAP; t++) {
      // the skin only fills in where there is real room, so a bone reads as
      // its contour with a few nodes across it, never as a filled mass
      const d = t === 3 ? dmin * 2 : t === 2 ? dmin * 1.45 : t === 0 ? dmin * 0.85 : dmin;
      for (let i = 0; i < n && keep.length < CAP; i++) {
        if (tier[i] !== t) continue;
        const q = targets[i].pieceAt || targets[i].targetAt;
        if (!q || near(q, d)) continue;
        keep.push(i); role.push(t);
        const k = key(q.x, q.y, q.z, dmin);
        if (!cell.has(k)) cell.set(k, []);
        cell.get(k).push(q);
      }
    }
    // THREADS: the kept structural lines of each bone, joined in order along
    // it, so the eye reads a bone as a bone. Short, faint, and only where two
    // kept nodes on the same line are near neighbours; never across bones.
    const lines = new Map();
    keep.forEach((i, j) => {
      const sw = targets[i].sweep;
      if (!sw || role[j] > 1) return;
      const k = sw.stroke + ':' + Math.round((sw.ang || 0) * 4) % 4;
      if (!lines.has(k)) lines.set(k, []);
      lines.get(k).push([sw.s == null ? sw.si : sw.s, j]);
    });
    const threads = [];
    for (const list of lines.values()) {
      list.sort((a, b) => a[0] - b[0]);
      for (let m = 1; m < list.length; m++) {
        const a = targets[keep[list[m - 1][1]]].pieceAt, b = targets[keep[list[m][1]]].pieceAt;
        if (a && b && Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < dmin * 2.6) threads.push(list[m - 1][1], list[m][1]);
      }
    }
    // how wide the piece stands, so its field can be as wide as it is
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const i of keep) { const q = targets[i].pieceAt; if (!q) continue; x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    const aspect = isFinite(x0) && y1 > y0 ? Math.max(1, Math.min(1.7, (x1 - x0) / (y1 - y0))) : 1;
    return { keep, role, threads, aspect, dmin };
  }

  // The file beside the course note: { versions: [{ spec, reading, made }],
  // current }. Returns the version on show, or null.
  function currentOf(file) {
    const f = file || {};
    const vs = Array.isArray(f.versions) ? f.versions.filter((v) => v && v.spec) : [];
    if (!vs.length) return f.spec ? { spec: f.spec, v: 1, of: 1, reading: f.spec.reading || '' } : null;
    let i = vs.findIndex((v) => v.v === f.current);
    if (i < 0) i = vs.length - 1;
    const v = vs[i];
    return { spec: v.spec, v: v.v || i + 1, of: vs.length, reading: v.reading || v.spec.reading || '' };
  }

  // ── the renderer ─────────────────────────────────────────────────────────
  // One small canvas. It turns slowly (a few degrees, ~30s a cycle) or holds
  // still; the vessel's halo stays the only thing on the course that moves
  // with any urgency. Under reduced motion it draws once per change.
  function mount(canvas, opts) {
    const o = opts || {};
    const ctx = canvas.getContext('2d');
    const calm = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let form = null, cols = null, born = 0, raf = 0, running = false, ghost = false;
    let presence = 1, dark = true, dpr = 1, CW = 0, CH = 0, order = null;
    const t0 = performance.now();
    const isDark = () => {
      const r = document.documentElement;
      if (r.dataset.theme === 'light') return false;
      if (r.dataset.theme === 'dark') return true;
      return !(root.matchMedia && root.matchMedia('(prefers-color-scheme: light)').matches);
    };
    // DRAW AT THE SIZE IT IS SHOWN. The page carries a UI zoom (zoom.js), so a
    // canvas backed at its CSS size is stretched by the browser on the way to
    // the screen and every node softens: that was the "blurred out, paler"
    // Dan saw. The backing store follows the on-screen size instead.
    function fit() {
      CW = canvas.clientWidth; CH = canvas.clientHeight;
      const shown = canvas.getBoundingClientRect ? canvas.getBoundingClientRect().width : CW;
      dpr = Math.min(4, (root.devicePixelRatio || 1) * (CW ? shown / CW : 1));
      canvas.width = Math.max(1, Math.round(CW * dpr)); canvas.height = Math.max(1, Math.round(CH * dpr));
    }
    // the route's own green, read from the token so the two can never drift
    const routeGreen = () => {
      try { return getComputedStyle(document.documentElement).getPropertyValue('--journey-travelled').trim() || '#34D399'; }
      catch (_) { return '#34D399'; }
    };
    let rig = null;
    let unit = 7, lod = 'course';   // the route bead's diameter in CSS px; journey | course | station
    // NO UNFORMED PROMISE (member report, 2026-10-05). An empty spot used to
    // draw sixteen faint pale points "on a loose sphere" while a region with
    // no art (or art that would not draw) was in hand, which is every art
    // conversation's first minutes. On the dark globe they read as grey dust,
    // the same complaint that turned the sea art off. An empty spot draws
    // nothing now; `ghost()` stays only so a caller's call is harmless.

    function motionOf(P, q, t) {
      const m = P[q + 6];
      if (m === root.SeedWorld.M.SPIN) {
        const w = P[q + 8], ph = P[q + 7], nx = Math.sin(w) * Math.cos(ph), ny = Math.cos(w), nz = Math.sin(w) * Math.sin(ph);
        const th = t * P[q + 12], c = Math.cos(th), sn = Math.sin(th);
        const vx = P[q] - P[q + 9], vy = P[q + 1] - P[q + 10], vz = P[q + 2] - P[q + 11], dot = nx * vx + ny * vy + nz * vz;
        return [vx * c + (ny * vz - nz * vy) * sn + nx * dot * (1 - c) - vx,
          vy * c + (nz * vx - nx * vz) * sn + ny * dot * (1 - c) - vy,
          vz * c + (nx * vy - ny * vx) * sn + nz * dot * (1 - c) - vz];
      }
      if (m === root.SeedWorld.M.BREATHE) {
        const k = P[q + 8] * Math.sin(t * (P[q + 12] || 0.6) + P[q + 7]);
        return [(P[q] - P[q + 9]) * k, (P[q + 1] - P[q + 10]) * k, (P[q + 2] - P[q + 11]) * k];
      }
      // EVERY NODE DRIFTS A LITTLE (Dan, 2026-09-25: "make sure that nodes
      // style is using animation"). The garden's motion classes, at the
      // scale of a small object: a leaf lifts and settles, a strand sways, a
      // branch carries its structure's sway, and even a still node wanders a
      // hair around its place on its own phase, so the piece is alive as
      // well as turning. Slow periods (8 to 20s), never a jitter.
      const ph = P[q + 7], w = P[q + 8] || 0.3, bw = P[q + 13], bp = P[q + 14];
      const M = root.SeedWorld.M;
      let dx = 0.009 * Math.sin(t * 0.41 + ph * 3.1), dy = 0.009 * Math.sin(t * 0.33 + ph * 2.3), dz = 0.007 * Math.cos(t * 0.37 + ph * 1.7);
      if (m === M.LEAF) { dy += 0.03 * w * Math.sin(t * 0.4 + ph); dx += 0.014 * w * Math.sin(t * 0.33 + ph); }
      else if (m === M.VINE || m === M.FROND) { dx += 0.035 * w * Math.sin(t * 0.55 + ph); dz += 0.02 * w * Math.sin(t * 0.42 + ph * 2); }
      if (bw) { dx += 0.04 * bw * Math.sin(t * 0.45 + bp); dz += 0.024 * bw * Math.cos(t * 0.37 + bp * 1.3); }
      return [dx, dy, dz];
    }

    function draw(now) {
      raf = 0;
      if (!CW) fit();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, CW, CH);
      const t = (now - t0) / 1000;
      const still = calm || !form || form.motion === 'still';
      // A LANDMARK FACES YOU. A sculpture turned 30 to 60 degrees side-on
      // folds its width away and every piece reads as a narrow column, which
      // is half of what made the old art look like a stacked cloud. It rests
      // near face-on and rocks a little, enough for parallax to show depth.
      const swing = form && form.engine ? 0.2 : 0.32;
      const yaw = (form && form.engine ? 0.16 : (o.yaw || 0.5)) + (still ? 0 : swing * Math.sin(t * TAU / 40));
      const pitch = -0.2, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      // the engine normalises a piece's widest reach to about 0.9, and the field
      // is already as wide as the piece stands, so the width fills the field
      // (dividing by the aspect again drew a wide piece at two thirds its size)
      const D = 3.3, f = Math.min(CW, CH * ((form && form.aspect) || 1)) * 0.44 * D * 0.92, mx = CW / 2, my = CH / 2;
      const proj = (x, y, z) => {
        const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
        const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
        const d = D - z2;
        return [mx + x1 * f / d, my - y2 * f / d, d];
      };
      if (!form) return;
      if (form.engine) { drawEngine(now, t, proj, D, f); return; }
      const P = form.P, S = form.S, n = form.n;
      // becoming: centre outward over ~1.4s, then stillness (sea art D.6)
      const grow = calm ? 1 : Math.min(1, (now - born) / 1400);
      const breath = still ? 1 : 1 + 0.01 * Math.sin(t * 0.6);
      const pts = [];
      for (let k = 0; k < n; k++) {
        const q = k * S;
        const reveal = order ? Math.max(0, Math.min(1, (grow - order[k] * 0.7) / 0.3)) : 1;
        if (reveal <= 0) continue;
        let x = P[q] * breath, y = P[q + 1] * breath, z = P[q + 2] * breath;
        // nodes live even when the piece holds its turn; only reduced motion stills them
        if (!calm) { const d = motionOf(P, q, t); if (d) { x += d[0]; y += d[1]; z += d[2]; } }
        const e = 1 - Math.pow(1 - reveal, 3);
        const pr = proj(x * (0.6 + 0.4 * e), y * (0.6 + 0.4 * e), z * (0.6 + 0.4 * e));
        pts.push([pr[0], pr[1], pr[2], P[q + 3] * f / pr[2] * e * 1.3, P[q + 4] * e, P[q + 5], form.soft ? form.soft[k] : 0, P[q + 7]]);
      }
      pts.sort((a, b) => b[2] - a[2]);
      // SHARP NODES (Dan, 2026-09-25: "never blurry, they're sharp, with not
      // as much size variation"). No halo pass, no hazy composite, no disc
      // smaller than a clean pixel-and-a-half circle, and depth moves size
      // and level only a little. Depth still reads, as order and a slight
      // step back in level, but every node is a crisp point.
      const floorR = 1.5;
      const glow = [];
      for (const p of pts) {
        const fb = Math.max(0.9, Math.min(1.1, 1 + (D - p[2]) * 0.2));
        const r = Math.max(floorR, p[3] * fb);
        // full strength: the route's green at the route's vibrancy
        let a = presence * (0.9 + 0.1 * Math.min(1, fb));
        // a soft node breathes its light slowly, on its own phase
        if (p[6] && !calm) a *= 0.8 + 0.2 * Math.sin(t * 0.7 + p[7]);
        if (a < 0.02) continue;
        ctx.globalAlpha = a;
        ctx.fillStyle = cols[p[5]] || cols[0];
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill();
        if (p[6]) glow.push(p[0], p[1], r, a, p[5]);
      }
      // SOFT, WHERE THE ART ASKS FOR IT: a haze around the few nodes a part
      // marked soft, and nowhere else, so crisp stays the rule and the glow
      // is an artistic choice rather than a blur over everything.
      if (glow.length) {
        ctx.globalCompositeOperation = dark ? 'lighter' : 'multiply';
        for (let i = 0; i < glow.length; i += 5) {
          ctx.fillStyle = cols[glow[i + 4]] || cols[0];
          ctx.globalAlpha = glow[i + 3] * (dark ? 0.22 : 0.12);
          ctx.beginPath(); ctx.arc(glow[i], glow[i + 1], glow[i + 2] * 2.6, 0, TAU); ctx.fill();
          ctx.globalAlpha = glow[i + 3] * (dark ? 0.1 : 0.06);
          ctx.beginPath(); ctx.arc(glow[i], glow[i + 1], glow[i + 2] * 4.2, 0, TAU); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
      if (!calm || grow < 1) raf = requestAnimationFrame(draw);
    }
    // THE ENGINE PIECE, AS A SCULPTURE OF NODES, in two layers drawn in one
    // depth order. The rig resolves every point for this instant (each bone's
    // own sway, hinge, pulse or stillness, children carried by parents).
    //   skeleton  the anchors and contour lines sculptOf chose, sized from the
    //             ROUTE'S OWN BEAD on screen (unit, fed in by the page), so
    //             art and course are one material and the silhouette reads
    //             from across the map; faint threads join each bone's lines
    //   body      every other compiled node, small, fogged back to front, so
    //             the piece has the volume of the onboarding garden's art
    // Journey draws the skeleton and a third of the body; course all of it.
    // The articulated pose for this instant, or null (reduced motion, or an
    // engine without the rig). The cadence is two slow sines out of step, so
    // the motion never settles into a metronome: a long reach every ~7s with
    // a smaller answer inside it. `amount` 0.5 is half the gallery's full
    // allowance: a sway bends up to ~15 degrees root to tip, a hinge swings
    // ~18, a pulse swells ~9%, visible at 200px and never a flap.
    function articulate(t) {
      const P = form && form.piece, rg = P && P.rig;
      if (calm || !rg || !rg.skel || rg.skel.supported === false) return null;
      if (typeof root.artPose !== 'function' || typeof root.artSkinNode !== 'function') return null;
      if (!form.restPose) form.restPose = root.artPose(rg.skel, { counts: rg.counts, moves: rg.moves, activation: 0 });
      const a = 0.75 * Math.sin(t * TAU / 7.2) + 0.25 * Math.sin(t * TAU / 3.1 + 1.3);
      const posed = root.artPose(rg.skel, { counts: rg.counts, moves: rg.moves, activation: a, amount: 0.5 });
      return { base: form.restPose, posed, bone: rg.strokeToBone, skin: root.artSkinNode, k: (P.frame && P.frame.scale) || 1 };
    }
    function drawEngine(now, t, proj, D, f) {
      const T = form.targets, K = form.keep, R = form.role;
      // which compiled nodes are the SKELETON (anchors and the contour lines
      // chosen by sculptOf); every other node is the BODY
      if (!form.skel) {
        form.skel = new Int16Array(T.length).fill(-1);
        K.forEach((i, j) => { if (R[j] <= 1) form.skel[i] = j; });
      }
      // AIR BEFORE SIZE: a skeleton node is the route's bead, unless the field
      // is too small for that and its gaps would close; then the node gives
      // way (~1.7 of its diameters centre to centre), never the spacing.
      const gap = (form.dmin || 0.135) * f / D;
      const u = Math.max(4, Math.min(unit || 7, gap / 1.25));
      const scale = [1.0, 0.78];
      // journey shows the silhouette: the skeleton and a third of the body;
      // course the whole sculpture; station the whole of it, a step back
      const stride = lod === 'journey' ? 3 : 1;
      const bodyK = lod === 'journey' ? 0.75 : lod === 'station' ? 0.8 : 1;
      // EVERY PART MOVES LIKE WHAT IT IS (Dan, 2026-09-25: "individual
      // elements within each piece have their own motion based on whatever the
      // art is"). The engine's runtime draws one whole-piece field; the bones'
      // own vocabulary (artPose: a sway bends root to tip, a hinge swings from
      // its attachment, a pulse swells its girth, still holds, a child is
      // carried by its parent) was only ever used to measure reach. So the
      // skeleton is posed here each frame on one slow, uneven cadence and every
      // swept node is skinned to its posed bone: one breath, many answers.
      const art = articulate(t);
      // travellers ride their line (reduced motion keeps them where drawn)
      let travelAt = null;
      const offs = !calm && travelOffsets(form.travel, t);
      if (offs) {
        travelAt = new Array(T.length);
        for (const o of offs) for (const i of o.nodes) travelAt[i] = o;
      }
      // fire rises through its band (reduced motion holds each at its phase)
      const fire = form.fire;
      if (fire && !form.fireIdx) { form.fireIdx = new Int32Array(T.length).fill(-1); fire.nodes.forEach((i, m) => { form.fireIdx[i] = m; }); }
      const fn = fire ? (form.fireNow = fireAt(fire, T, t, calm, form.fireNow)) : null;
      const pts = [];
      const at = new Array(K.length);
      for (let i = 0; i < T.length; i++) {
        const j = form.skel[i];
        if (j < 0 && i % stride) continue;
        const res = rig.evaluate3d(T[i].id, now);
        if (!res || !res.at) continue;
        if (art && T[i].sweep) {
          const bi = art.bone.get(T[i].sweep.stroke);
          const p0 = art.skin(art.base.get(bi), T[i].sweep), p1 = art.skin(art.posed.get(bi), T[i].sweep);
          if (p0 && p1) {
            res.at.x += (p1.x - p0.x) * art.k; res.at.y += (p1.y - p0.y) * art.k; res.at.z += (p1.z - p0.z) * art.k;
          }
        }
        const tr = travelAt && travelAt[i];
        if (tr) { res.at.x += tr.x; res.at.y += tr.y; res.at.z += tr.z; }
        const fm = fn ? form.fireIdx[i] : -1;
        if (fm >= 0) { res.at.x += fn.dx[fm]; res.at.y += fn.dy[fm]; res.at.z += fn.dz[fm]; }
        const q = proj(res.at.x, res.at.y, res.at.z);
        const p = [q[0], q[1], q[2], i, j];
        pts.push(p);
        if (j >= 0) at[j] = p;
      }
      // threads first, behind every node: the skeleton's lines, faint
      if (form.threads.length) {
        ctx.lineWidth = Math.max(0.6, u * 0.08);
        for (let m = 0; m < form.threads.length; m += 2) {
          const a = at[form.threads[m]], b = at[form.threads[m + 1]];
          if (!a || !b) continue;
          const dep = Math.max(0.3, Math.min(1, 1 + (D - (a[2] + b[2]) / 2) * 0.6));
          ctx.globalAlpha = presence * 0.2 * dep;
          ctx.strokeStyle = cols[form.col[a[3]]] || cols[0];
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
      }
      // ONE DEPTH ORDER for body and skeleton, far to near, so the front of
      // the sculpture occludes its back and a small rock shows parallax
      pts.sort((a, b) => b[2] - a[2]);
      // EVERY NODE A DISTINCT POINT, AS THE GLOBE DRAWS ITS OWN (Dan,
      // 2026-09-25: "each node is still perceptible when zoomed out as the
      // globe's own nodes are ... as sharp and colour saturated"). No
      // out-of-focus pass, no glow, no haze of half-transparent discs stacked
      // on each other. Each node is one small opaque disc in the part's own
      // saturated colour; depth is order, size and a step down in level. The
      // body is thinned to what the drawn size can hold as separate points
      // (about three radii of room per node), so zoomed out the piece is fewer,
      // smaller points, never a blur, and zoomed in it fills back to the full
      // sculpture.
      const rBody = Math.max(0.75, u * 0.17);
      const room = (3 * rBody) * (3 * rBody);
      const nBody = T.length - K.length;
      const fieldArea = CW * CH * 0.35;
      const keepEvery = Math.max(1, Math.ceil(nBody * room / Math.max(1, fieldArea)));
      for (const p of pts) {
        const i = p[3], j = p[4];
        const near = Math.max(0, Math.min(1, 0.5 + (D - p[2]) * 0.9));   // 0 back, 1 front
        let r, a;
        if (j >= 0) {
          // the skeleton: route-bead scale, the landmark the eye finds from afar
          r = Math.max(1.2, u * scale[R[j]] * 0.5 * (0.9 + 0.2 * near));
          a = presence * (0.72 + 0.28 * near);
        } else {
          // THE BODY: the full swept skin, small points, the back a step down
          if (i % keepEvery) continue;
          r = Math.max(0.75, rBody * (0.8 + 0.4 * near));
          a = presence * bodyK * (0.58 + 0.42 * near) * (T[i].sweep ? 1 : 0.6);
        }
        // a lantern or star breathes its level, never a haze
        if (form.soft[i] && !calm) a *= 0.82 + 0.18 * Math.sin(t * 0.7 + i);
        const fm = fn ? form.fireIdx[i] : -1;
        if (fm >= 0) { a *= fn.fade[fm]; r *= fn.size[fm]; }
        if (a < 0.02) continue;
        ctx.globalAlpha = a;
        ctx.fillStyle = cols[form.col[i]] || cols[0];
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    }
    const kick = () => { if (running && !raf) raf = requestAnimationFrame(draw); };

    return {
      // show a score (or null for nothing); returns the compile verdict
      set(spec, opts) {
        const free = !!(opts && opts.free);
        dark = isDark();
        if (!spec) { form = null; order = null; kick(); return { ok: true, problems: [] }; }
        if (!root.SeedWorld) return { ok: false, problems: ['the garden builder is not loaded'] };
        const out = compile(spec, null, null, { free });
        if (!out.ok) { form = null; kick(); return out; }
        let baseHue = null;
        if (free) {
          // the piece's own hue, else the region's land colour, else a violet
          if (typeof spec.hue === 'number' && isFinite(spec.hue)) baseHue = num(spec.hue, 280, 0, 360);
          else if (opts && opts.base && typeof root.artOklabOf === 'function') {
            const lab = root.artOklabOf(opts.base);
            if (lab && isFinite(lab.a) && isFinite(lab.b)) baseHue = (Math.atan2(lab.b, lab.a) * 180 / Math.PI + 360) % 360;
          }
          if (baseHue == null) baseHue = 280;
        }
        form = out; cols = palette(spec, dark, root.SeedWorld.oklchRgb, out.hues, baseHue);
        if (!free) cols[0] = routeGreen();
        if (out.engine) {
          const make = root.artRuntime;
          rig = typeof make === 'function' ? make() : null;
          if (!rig) { form = null; kick(); return { ok: false, problems: ['the node art runtime is not loaded'] }; }
          rig.start(out.piece, performance.now(), calm);
          born = performance.now();
          kick();
          return out;
        }
        // reveal order: distance from the centre, normalised
        order = new Float32Array(out.n);
        let mxd = 0;
        for (let k = 0; k < out.n; k++) { const q = k * out.S; order[k] = Math.hypot(out.P[q], out.P[q + 1], out.P[q + 2]); mxd = Math.max(mxd, order[k]); }
        for (let k = 0; k < out.n; k++) order[k] /= mxd || 1;
        born = performance.now();
        kick();
        return out;
      },
      ghost(on) { ghost = !!on; dark = isDark(); if (!cols && root.SeedWorld) cols = palette({}, dark, root.SeedWorld.oklchRgb); kick(); },
      presence(a) { presence = num(a, 1, 0, 1); kick(); },
      unit(px) { if (px > 1) unit = Math.max(4, Math.min(16, px)); },
      lod(level) { lod = level === 'journey' ? 'journey' : level === 'station' ? 'station' : 'course'; },
      aspect() { return form && form.aspect ? form.aspect : 1; },
      resize() { fit(); kick(); },
      start() { running = true; fit(); kick(); },
      stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
      has() { return !!form; },
    };
  }

  // ── THE SCULPTURE, AS GEOMETRY FOR THE GLOBE (Dan, 2026-09-26) ──────────
  // "The art isn't displayed on Astrolabe's globe. It lives there." So the
  // piece is no longer drawn here at all. This hands the globe renderer the
  // piece as posed 3D points in its OWN local frame (x right, y up with the
  // base at 0, z toward the front), plus what each point is:
  //   tier 0 anchor, 1 skeleton (the silhouette), 2 body, 3 scaffold
  //   soft  a luminous part (accent)
  //   rank  a fixed place in the body's level of detail, so thinning is
  //         stable as the world turns (never re-sampled per frame)
  //   base  the few lowest skeleton points, where the piece meets the land
  // The globe does the rest in its own world: the frame at the pin, the
  // turn, the perspective, the node material, the depth order with notes.
  // `pose(t, amount)` applies each bone's own motion (sway, hinge, pulse,
  // still) in the local frame, BEFORE the world transform.
  function sculpt(spec, opts) {
    const o = opts || {};
    if (!root.SeedWorld) return { ok: false, problems: ['the garden builder is not loaded'] };
    const out = compile(spec, null, null, { free: !!o.free });
    if (!out.ok) return { ok: false, problems: out.problems || [] };
    if (!out.engine) return { ok: false, problems: ['only a strokes score can stand on the globe'] };
    const T = out.targets, n = T.length;
    const tier = new Uint8Array(n).fill(2);
    out.keep.forEach((i, j) => { if (out.role[j] <= 1) tier[i] = out.role[j]; });
    for (let i = 0; i < n; i++) if (tier[i] === 2 && !T[i].sweep) tier[i] = 3;
    // what each stroke is, as the compiler resolved it
    const sc0 = out.score.strokes;
    const impOf = sc0.map((x) => (x && IMPORTANCE.includes(x.importance)) ? x.importance : 'secondary');
    const isThreadStroke = sc0.map((x) => !!(x && x.section === 'thread'));
    // a THREAD is structure all the way along: every node is skeleton (its
    // ends anchors), so it is never thinned away and always has its line
    // `thread` is 1 for a filament node and 2 for one that is also a JOINT
    // (an authored vertex or an end): only joints are drawn as dots, the rest
    // carry the line, so a fan of cables stays a fan of lines at small size
    // instead of filling in as a solid of beads
    const thread = new Uint8Array(n);
    const jointsOf = sc0.map((x) => {
      if (!x || x.section !== 'thread' || !Array.isArray(x.points)) return null;
      const P = x.points.filter(Array.isArray);
      const cum = [0];
      for (let j = 1; j < P.length; j++) cum.push(cum[j - 1] + Math.hypot(P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1], (P[j][2] || 0) - (P[j - 1][2] || 0)));
      const L = cum[cum.length - 1] || 1;
      return cum.map((c) => c / L);
    });
    for (let i = 0; i < n; i++) {
      const sw = T[i].sweep;
      if (sw && isThreadStroke[sw.stroke]) {
        const end = sw.si === 0 || sw.si === (sw.axial || 1) - 1;
        tier[i] = end ? 0 : 1;
        const half = 0.5 / Math.max(1, (sw.axial || 2) - 1);
        const js = jointsOf[sw.stroke];
        thread[i] = end || (js && js.some((f) => Math.abs(f - (sw.s || 0)) <= half)) ? 2 : 1;
      }
    }
    // SEMANTIC LOD. The globe draws body nodes whose rank is under its level
    // of detail, so a rank is a promise about the order things disappear in:
    // an accent and the primary silhouette's body arrive first and leave
    // last, detail leaves first. Still a low-discrepancy sequence inside each
    // band, so any prefix is spread evenly and thinning never fizzes.
    const BAND = { accent: [0, 0.12], primary: [0, 0.3], secondary: [0.04, 0.55], detail: [0.18, 0.82] };
    const rank = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const g = (i * 0.6180339887 + 0.137) % 1;
      const sw = T[i].sweep;
      const b = sw ? BAND[impOf[sw.stroke]] : [0.6, 0.4];
      rank[i] = b[0] + g * b[1];
    }
    // rest positions: centred across and through, standing on y = 0
    let minY = Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const q = T[i].pieceAt;
      if (tier[i] <= 1) minY = Math.min(minY, q.y);
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); y1 = Math.max(y1, q.y);
    }
    if (!isFinite(minY)) minY = 0;
    const ox = (x0 + x1) / 2, oz = (z0 + z1) / 2;
    // ITS BROAD SIDE IS ITS FRONT (Dan, 2026-09-26: "slim elements that are
    // 3d like a bridge ... the more distinguishing side of the objects to
    // appear"). The globe faces a piece's local +z toward the view it is
    // seen in, so the piece is turned about its up axis until its longest
    // horizontal reach lies across (local x). A bridge drawn end-on still
    // shows its span; a round piece (no clear long axis) is left as drawn.
    let sxx = 0, szz = 0, sxz = 0;
    // (a shell or a dot is round: its nodes are re-placed below, so they never turn the piece)
    const roundStroke = (out.forms || []).map(Boolean);
    for (let i = 0; i < n; i++) {
      if (T[i].sweep && roundStroke[T[i].sweep.stroke]) continue;
      const q = T[i].pieceAt, dx = q.x - ox, dz = q.z - oz;
      sxx += dx * dx; szz += dz * dz; sxz += dx * dz;
    }
    const lam1 = (sxx + szz) / 2 + Math.hypot((sxx - szz) / 2, sxz), lam2 = (sxx + szz) - lam1;
    const yaw = lam1 > 1.4 * Math.max(1e-9, lam2) ? -0.5 * Math.atan2(2 * sxz, sxx - szz) : 0;
    const yc = Math.cos(yaw), ys = Math.sin(yaw);
    // (a delta or a normal turned the same way the piece was)
    const turn = (x, z) => [yc * x - ys * z, ys * x + yc * z];
    const rest = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const q = T[i].pieceAt, [rx, rz] = turn(q.x - ox, q.z - oz);
      rest[i * 3] = rx; rest[i * 3 + 1] = Math.max(0, q.y - minY); rest[i * 3 + 2] = rz;
    }
    // fire rests as a snapshot of itself; `fade` and `size` (1 elsewhere)
    // say how lit and how big each node is this frame
    const fade = new Float32Array(n).fill(1), fsize = new Float32Array(n).fill(1);
    const fire = out.fire, fire0 = fire ? fireAt(fire, T, 0, true) : null, fireNow = fire ? fireAt(fire, T, 0, true) : null;
    if (fire) {
      for (let m = 0; m < fire.nodes.length; m++) {
        const i = fire.nodes[m], [dx, dz] = turn(fire0.dx[m], fire0.dz[m]);
        rest[i * 3] += dx; rest[i * 3 + 1] += fire0.dy[m]; rest[i * 3 + 2] += dz;
        fade[i] = fire0.fade[m]; fsize[i] = fire0.size[m];
      }
    }
    if (yaw) {
      x0 = z0 = Infinity; x1 = z1 = -Infinity;
      for (let i = 0; i < n; i++) {
        x0 = Math.min(x0, rest[i * 3]); x1 = Math.max(x1, rest[i * 3]);
        z0 = Math.min(z0, rest[i * 3 + 2]); z1 = Math.max(z1, rest[i * 3 + 2]);
      }
    }
    // THE SURFACE, FOR LIGHT (Dan, 2026-09-26: "use the full 3d girth and
    // tube ability ... so that this feels more like a real rendering"). Each
    // swept node's outward normal is its offset from its own bone's
    // centreline at the same place along the bone; the globe lights the
    // piece with it, so a tube reads round and a blade reads as a surface.
    const normal = new Float32Array(n * 3);
    {
      const BINS = 48, cen = new Map();
      for (let i = 0; i < n; i++) {
        const sw = T[i].sweep;
        if (!sw) continue;
        let c = cen.get(sw.stroke);
        if (!c) cen.set(sw.stroke, c = new Float64Array(BINS * 4));
        const b = Math.min(BINS - 1, Math.floor((sw.s || 0) * BINS)) * 4;
        c[b] += rest[i * 3]; c[b + 1] += rest[i * 3 + 1]; c[b + 2] += rest[i * 3 + 2]; c[b + 3]++;
      }
      let gx = 0, gy = 0, gz = 0;
      for (let i = 0; i < n; i++) { gx += rest[i * 3]; gy += rest[i * 3 + 1]; gz += rest[i * 3 + 2]; }
      gx /= n || 1; gy /= n || 1; gz /= n || 1;
      for (let i = 0; i < n; i++) {
        const sw = T[i].sweep;
        let cx = gx, cy = gy, cz = gz;
        if (sw) {
          const c = cen.get(sw.stroke), b = Math.min(BINS - 1, Math.floor((sw.s || 0) * BINS)) * 4;
          if (c[b + 3]) { cx = c[b] / c[b + 3]; cy = c[b + 1] / c[b + 3]; cz = c[b + 2] / c[b + 3]; }
        }
        let nx = rest[i * 3] - cx, ny = rest[i * 3 + 1] - cy, nz = rest[i * 3 + 2] - cz;
        const l = Math.hypot(nx, ny, nz);
        if (l < 1e-6) { nx = 0; ny = 0; nz = 1; } else { nx /= l; ny /= l; nz /= l; }
        normal[i * 3] = nx; normal[i * 3 + 1] = ny; normal[i * 3 + 2] = nz;
      }
    }
    // SHELLS AND DOTS (2026-10-10): rearranged from the tube the engine built.
    // A shell's nodes are spread over the ellipsoid its tube fills, on a
    // golden-angle spiral nudged by a seeded wander, so they read as single
    // scattered lights rather than rings; spare nodes are hidden (fade 0). A
    // dot keeps one node at its middle, drawn `scale` times a plain node.
    const forms = out.forms || [];
    const formed = new Uint8Array(n);
    forms.forEach((f, k) => {
      if (!f) return;
      const idx = [];
      for (let i = 0; i < n; i++) if (T[i].sweep && T[i].sweep.stroke === k) idx.push(i);
      if (!idx.length) return;
      let ax = Infinity, bx = -Infinity, ay = Infinity, by = -Infinity, az = Infinity, bz = -Infinity, mx = 0, my = 0, mz = 0;
      for (const i of idx) {
        const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2];
        ax = Math.min(ax, x); bx = Math.max(bx, x); ay = Math.min(ay, y); by = Math.max(by, y); az = Math.min(az, z); bz = Math.max(bz, z);
        mx += x; my += y; mz += z;
      }
      const hide = (i) => { fade[i] = 0; fsize[i] = 0; tier[i] = 3; rank[i] = 1; formed[i] = 1; };
      if (f.kind === 'dot') {
        const c = [mx / idx.length, my / idx.length, mz / idx.length];
        idx.forEach((i, j) => {
          if (j) { hide(i); return; }
          rest[i * 3] = c[0]; rest[i * 3 + 1] = c[1]; rest[i * 3 + 2] = c[2];
          normal[i * 3] = 0; normal[i * 3 + 1] = 0; normal[i * 3 + 2] = 1;
          fsize[i] = f.scale; tier[i] = 0; rank[i] = 0; formed[i] = 2;
        });
        return;
      }
      const c = [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2], rr = [(bx - ax) / 2, (by - ay) / 2, (bz - az) / 2];
      const m = Math.min(idx.length, f.dots || idx.length);
      let seed = ((spec && spec.seed) | 0) * 7919 + k * 104729 + 17;
      const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 8) / 16777216; };
      const GA = Math.PI * (3 - Math.sqrt(5)), wander = 0.9 * f.loose;
      idx.forEach((i, j) => {
        if (j >= m) { hide(i); return; }
        // the golden-angle spiral, each step nudged off its line by up to `wander` of a step
        const yj = 1 - 2 * (j + 0.5 + (rand() - 0.5) * wander) / m;
        const yy = Math.max(-1, Math.min(1, yj)), rad = Math.sqrt(1 - yy * yy);
        const th = j * GA + (rand() - 0.5) * wander * 2.4;
        const d = [Math.cos(th) * rad, yy, Math.sin(th) * rad];
        const lift = 1 + (rand() - 0.5) * 0.08 * f.loose;
        rest[i * 3] = c[0] + d[0] * rr[0] * lift; rest[i * 3 + 1] = c[1] + d[1] * rr[1] * lift; rest[i * 3 + 2] = c[2] + d[2] * rr[2] * lift;
        normal[i * 3] = d[0]; normal[i * 3 + 1] = d[1]; normal[i * 3 + 2] = d[2];
        // every shown light of a shell is structure: it is the shell, never thinned;
        // the lights facing the viewer draw a little larger, so the shell domes toward you
        tier[i] = 1; formed[i] = 1; fsize[i] = (0.85 + 0.45 * Math.max(0, d[2])) * f.lights;
      });
    });
    // where it meets the land: the three lowest skeleton points, from
    // different bones where the piece has them
    const low = [];
    for (let i = 0; i < n; i++) if (tier[i] <= 1) low.push(i);
    low.sort((a, b) => rest[a * 3 + 1] - rest[b * 3 + 1]);
    const base = [], bones = new Set();
    for (const i of low) {
      const b = T[i].sweep ? T[i].sweep.stroke : -1;
      if (bones.has(b) && low.length > 6) continue;
      bones.add(b); base.push(i);
      if (base.length === 3) break;
    }
    // colour: the same palette the overlay used, resolved once
    const dark = o.dark !== false;
    let baseHue = null;
    if (o.free) {
      if (typeof spec.hue === 'number' && isFinite(spec.hue)) baseHue = num(spec.hue, 280, 0, 360);
      else if (o.base && typeof root.artOklabOf === 'function') {
        const lab = root.artOklabOf(o.base);
        if (lab && isFinite(lab.a) && isFinite(lab.b)) baseHue = (Math.atan2(lab.b, lab.a) * 180 / Math.PI + 360) % 360;
      }
      if (baseHue == null) baseHue = 280;
    }
    const W = root.SeedWorld;
    const cols = palette(spec, dark, W.oklchRgb, out.hues, baseHue);
    if (!o.free) {
      try { cols[0] = getComputedStyle(document.documentElement).getPropertyValue('--journey-travelled').trim() || '#34D399'; }
      catch (_) { cols[0] = '#34D399'; }
    }
    const shades = shadeRamps(cols, W.oklchRgb);
    // CONTINUITY WHERE IT COMMUNICATES THE OBJECT: every thread is a line
    // through its nodes in order; a primary solid gets its two silhouette
    // contours (ring angle 0 and 1/2) joined, faintly. Nothing else is
    // wired, so a piece never becomes a cage.
    const lines = [];
    {
      const runs = new Map();
      for (let i = 0; i < n; i++) {
        const sw = T[i].sweep;
        if (!sw || formed[i]) continue;
        let kind = 0;
        if (thread[i]) kind = impOf[sw.stroke] === 'detail' || impOf[sw.stroke] === 'accent' ? 3 : 1;
        else if (impOf[sw.stroke] === 'primary' && tier[i] <= 1) {
          const a = sw.ang || 0;
          if (a < 0.02 || Math.abs(a - 0.5) < 0.02) kind = 2;
        }
        if (!kind) continue;
        const key = sw.stroke + ':' + (kind !== 2 ? 0 : Math.round((sw.ang || 0) * 4));
        if (!runs.has(key)) runs.set(key, { kind, list: [] });
        runs.get(key).list.push(i);
      }
      for (const { kind, list } of runs.values()) {
        list.sort((a, b) => T[a].sweep.si - T[b].sweep.si);
        for (let k = 1; k < list.length; k++) lines.push(list[k - 1], list[k], kind);
      }
    }
    // articulation, posed in the local frame
    const P = out.piece, rg = P.rig;
    const k = (P.frame && P.frame.scale) || 1;
    const canPose = !!(rg && rg.skel && rg.skel.supported !== false && typeof root.artPose === 'function' && typeof root.artSkinNode === 'function');
    let restSkin = null;
    if (canPose) {
      const restPose = root.artPose(rg.skel, { counts: rg.counts, moves: rg.moves, activation: 0 });
      restSkin = new Float32Array(n * 3).fill(NaN);
      for (let i = 0; i < n; i++) {
        const sw = T[i].sweep;
        if (!sw) continue;
        const s0 = root.artSkinNode(restPose.get(rg.strokeToBone.get(sw.stroke)), sw);
        if (s0) { restSkin[i * 3] = s0.x; restSkin[i * 3 + 1] = s0.y; restSkin[i * 3 + 2] = s0.z; }
      }
    }
    const buf = new Float32Array(n * 3);
    // `lod`: body points ranked at or past it are not drawn this frame, so
    // they are not posed either (the cost follows what is seen)
    function pose(t, amount, lod) {
      const live = amount > 0;
      if (fire) {
        fireAt(fire, T, t, !live, fireNow);
        for (let m = 0; m < fire.nodes.length; m++) { fade[fire.nodes[m]] = fireNow.fade[m]; fsize[fire.nodes[m]] = fireNow.size[m]; }
      }
      if (!live || (!canPose && !out.travel && !fire)) return rest;
      const cut = lod == null ? 2 : lod;
      buf.set(rest);
      // fire rises through its band, on top of where it rests
      if (fire) for (let m = 0; m < fire.nodes.length; m++) {
        const i = fire.nodes[m], [dx, dz] = turn(fireNow.dx[m] - fire0.dx[m], fireNow.dz[m] - fire0.dz[m]);
        buf[i * 3] += dx; buf[i * 3 + 1] += fireNow.dy[m] - fire0.dy[m]; buf[i * 3 + 2] += dz;
      }
      // travellers ride their line, a rigid shift on top of the rig's pose
      const offs = travelOffsets(out.travel, t);
      if (offs) for (const o of offs) {
        const [dx, dz] = turn(o.x, o.z);
        for (const i of o.nodes) { buf[i * 3] += dx; buf[i * 3 + 1] += o.y; buf[i * 3 + 2] += dz; }
      }
      if (!canPose) return buf;
      const a = 0.75 * Math.sin(t * TAU / 7.2) + 0.25 * Math.sin(t * TAU / 3.1 + 1.3);
      const posed = root.artPose(rg.skel, { counts: rg.counts, moves: rg.moves, activation: a, amount: 0.5 * amount });
      for (let i = 0; i < n; i++) {
        const sw = T[i].sweep;
        if (!sw || restSkin[i * 3] !== restSkin[i * 3] || (tier[i] >= 2 && rank[i] >= cut)) continue;
        const s1 = root.artSkinNode(posed.get(rg.strokeToBone.get(sw.stroke)), sw);
        if (!s1) continue;
        const [dx, dz] = turn((s1.x - restSkin[i * 3]) * k, (s1.z - restSkin[i * 3 + 2]) * k);
        buf[i * 3] += dx;
        buf[i * 3 + 1] += (s1.y - restSkin[i * 3 + 1]) * k;
        buf[i * 3 + 2] += dz;
      }
      return buf;
    }
    const isFire = new Uint8Array(n);
    if (fire) for (const i of fire.nodes) isFire[i] = 1;
    return { ok: true, n, tier, rank, soft: out.soft, col: out.col, cols, shades, rest, normal, thread, lines: Int32Array.from(lines), pose, base,
      fire: fire ? isFire : null, fade, size: fsize, formed,
      // FOOTPRINT (Dan, 2026-10-10: "it can be much smaller"): how much of a
      // region's usual width on the globe the piece stands at, 0.3 to 1 (1 when
      // unset); the globe's callers multiply the width they give it by this
      footprint: num(spec.footprint, 1, 0.3, 1),
      // FLOAT (Dan, 2026-10-10: "make the sphere appear floating higher off the
      // surface"): how far above its land the piece stands, 0 to 0.2 of the
      // globe's radius (0 when unset); the globe's callers add it to their altitude
      float: num(spec.float, 0, 0, 0.2),
      intent: out.intent, importance: impOf, strokeOf: Int16Array.from(T.map((t) => (t.sweep ? t.sweep.stroke : -1))),
      // an accent is an identity cue: it is lit, but never shaded into the dark
      accent: Uint8Array.from(T.map((t) => (t.sweep && impOf[t.sweep.stroke] === 'accent' ? 1 : 0))),
      extent: { w: x1 - x0, h: y1 - minY, d: z1 - z0 }, problems: [] };
  }

  // ── THE IN-HAND PRESENTATION (2026-09-26) ───────────────────────────────
  // A sculpture rooted on a tiny planet turning toward you so you can see
  // it, never a billboard. Given the piece's frame in view space (up U,
  // front F, right Rt), lean it about its own foot toward screen-up by a
  // share of the way, clamped, by how the piece wants to be seen. The base
  // never moves (the lean is a rotation about the foot), so it cannot slide;
  // `amount` 0 is the geographically honest frame, eased in and out by the
  // caller.
  const LEAN = { elevation: [0.5, 0.72], 'three-quarter': [0.42, 0.6], free: [0.35, 0.5], top: [0.12, 0.2] };
  // `upright` (0..1, opt-in): the share of the way to screen-up the piece
  // leans, past the view's usual cap; the landing page's hero stands its
  // pieces up like this, because its lands face the visitor squarely and a
  // 40 degree lean still shows a house from above
  function presentLean(U, F, Rt, amount, view, upright) {
    if (!(amount > 0)) return null;
    const L = upright > 0 ? [Math.min(1, upright), Math.PI] : (LEAN[view] || LEAN['three-quarter']);
    const ax = { x: -U.z, y: 0, z: U.x };   // U × (0,1,0)
    const al = Math.hypot(ax.x, ax.z);
    if (al < 1e-5) return null;
    ax.x /= al; ax.z /= al;
    const phi = Math.acos(Math.max(-1, Math.min(1, U.y)));
    const th = Math.min(phi * L[0], L[1]) * Math.min(1, amount);
    const c = Math.cos(th), s = Math.sin(th);
    const rot = (v) => {
      const d = ax.x * v.x + ax.y * v.y + ax.z * v.z;
      const cx = ax.y * v.z - ax.z * v.y, cy = ax.z * v.x - ax.x * v.z, cz = ax.x * v.y - ax.y * v.x;
      return { x: v.x * c + cx * s + ax.x * d * (1 - c), y: v.y * c + cy * s + ax.y * d * (1 - c), z: v.z * c + cz * s + ax.z * d * (1 - c) };
    };
    return { U: rot(U), F: rot(F), Rt: rot(Rt), th };
  }

  // ── THE ART DIRECTOR'S REVIEW (2026-09-26) ──────────────────────────────
  // Compiles and sculpts the piece and reports, with numbers, the things
  // that have actually sunk a piece at globe scale. Warnings, not refusals:
  // they guide the author's correction loop together with the proof sheet.
  // `widthPx` is the piece's resting width on the globe (~120px).
  function review(spec, opts) {
    const o = opts || {};
    const sc = sculpt(spec, { free: !!o.free, dark: true });
    if (!sc.ok) return { ok: false, problems: sc.problems, warnings: [], parts: [] };
    const strokes = spec.strokes || [];
    const counts = new Array(strokes.length).fill(0);
    // a shell's or a dot's spare nodes are never drawn, so they are not counted (2026-10-10)
    const drawn = (i) => !(sc.formed && sc.formed[i] && sc.fade[i] === 0);
    for (let i = 0; i < sc.n; i++) if (sc.strokeOf[i] >= 0 && drawn(i)) counts[sc.strokeOf[i]]++;
    const total = counts.reduce((a, b) => a + b, 0) || sc.n;
    const widthPx = o.widthPx || 120;
    const hPx = widthPx * sc.extent.h / Math.max(1e-6, sc.extent.w);
    // what the globe's resting level of detail would keep (same formula as
    // the globe: body points need ~4 radii of room each)
    const bodyN = sc.tier.reduce((c, t) => c + (t >= 2 ? 1 : 0), 0) || 1;
    const rBody = 1.25;
    const want = Math.min(1, (widthPx * hPx * 0.5) / ((4 * rBody) * (4 * rBody)) / bodyN);
    const TIERS = [0.06, 0.12, 0.2, 0.3, 0.45, 0.65, 1];
    const lod = TIERS.find((t) => t >= want) || 1;
    const shown = new Array(strokes.length).fill(0);
    for (let i = 0; i < sc.n; i++) {
      const k = sc.strokeOf[i];
      if (k >= 0 && (sc.tier[i] <= 1 || sc.rank[i] < lod)) shown[k]++;
    }
    const peak = (g) => typeof g === 'number' ? g : Array.isArray(g) ? g.reduce((m, p) => Math.max(m, (p && p.r) || 0), 0) : 0;
    const parts = strokes.map((x, k) => ({ stroke: k + 1, section: x.section || 'ink', importance: sc.importance[k],
      nodes: counts[k], share: counts[k] / total, shownAtRest: shown[k] }));
    const warn = [];
    const primaries = parts.filter((p) => p.importance === 'primary' && p.section !== 'thread');
    for (const p of parts) {
      const x = strokes[p.stroke - 1];
      if (p.share > 0.35 && !(p.importance === 'primary' && primaries.length === 1)) warn.push('stroke ' + p.stroke + ' takes ' + Math.round(p.share * 100) + '% of the piece; one part should rarely have more than a third');
      if (p.importance === 'primary' && p.section !== 'thread' && p.nodes < 40) warn.push('primary stroke ' + p.stroke + ' has only ' + p.nodes + ' nodes; give it more length or girth, or fewer competing parts');
      if (p.importance === 'primary' && p.shownAtRest < 14) warn.push('primary stroke ' + p.stroke + ' shows only ' + p.shownAtRest + ' nodes at resting globe size; it will disappear');
      if (x.section && x.section !== 'thread' && peak(x.girth) < (sc.intent.depth === 'shallow' ? 0.012 : 0.03) && (x.points || []).length >= 3) warn.push('stroke ' + p.stroke + ' is a hair-thin ' + x.section + ' (girth ' + peak(x.girth) + '); a cable, wire, stem or ray reads better as section "thread"');
      if (p.importance === 'accent' && p.section !== 'thread' && p.section !== 'dot' && p.nodes < 8) warn.push('accent stroke ' + p.stroke + ' has ' + p.nodes + ' nodes, too few to register; make it a little larger');
      if (p.importance === 'accent' && p.share > 0.06) warn.push('accent stroke ' + p.stroke + ' takes ' + Math.round(p.share * 100) + '%; an accent should be a small cue');
    }
    const s = sc.intent;
    const sq = depthSquash(strokes, s.depth);
    if (sq.k < 1) warn.push('authored depth is ' + sq.ratio.toFixed(2) + ' of the width, past ' + DEPTH_MAX[s.depth] + ' for a ' + s.depth + ' piece; it was pressed to fit (draw it shallower, or say depth "volumetric" if the depth is the point)');
    if (spec.volume && spec.volume.scaffold > SCAFFOLD_MAX) warn.push('scaffold ' + spec.volume.scaffold + ' was cut to ' + SCAFFOLD_MAX + '; every point should belong to a part');
    const solids = strokes.filter((x) => x.section && x.section !== 'thread').length;
    if (solids > 8) warn.push(solids + ' solid parts for a ~' + widthPx + 'px piece; five or six bold parts read better than many small ones');
    if (hPx < 36) warn.push('the piece stands only ~' + Math.round(hPx) + 'px tall at resting size; its elevation will not read');
    if (!primaries.length) warn.push('no part is marked primary; say which one or two forms carry the identity');
    return { ok: true, warnings: warn, parts, intent: s, size: total, lod, heightPx: hPx, sculpt: sc };
  }

  // seed-world.js (217 KB) is fetched only by a page with art to draw
  function ready() {
    if (root.SeedWorld) return Promise.resolve(root.SeedWorld);
    if (!root.loadOnDemand) return Promise.reject(new Error('the garden builder is not loaded'));
    return root.loadOnDemand(['/seed-world.js']).then(() => root.SeedWorld);
  }

  const api = { ready, compile, lint, advise, review, currentOf, palette, mount, sculpt, shadeStep, presentLean, LIGHT, KINDS, NODE_CAP, IMPORTANCE, DEPTHS, VIEWS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CourseArt = api;
})(typeof window !== 'undefined' ? window : globalThis);
