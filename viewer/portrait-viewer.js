// A world you can share: the viewer page's one script (item 1.7, PRD 6.1 to 6.3).
//
// It reads `portrait.json` from its own folder and draws it with the real
// renderer: lands, coasts and lights from `portraitWorld(seed, count)`, the
// member's approved art standing on its land, the land names drawn by the
// canvas itself. Every public string reaches the page through `textContent`,
// never as markup (invariant 8); nothing is fetched from anywhere but this
// page's own origin (invariant 9).
//
// Exploring (1.8): drag to turn with a coast on release, pinch or wheel to come
// closer, tap a land to turn it to face you. A tap reports the place through
// `PortraitViewer.onPlace(key)`, a tap on the sea through `onPlace(null)`;
// the place card (3.2) opens there and a tap on the sea closes it. A turned phone
// fires `resize`, which re-measures the canvas and recomposes the ball.
//
// The first look (2.2, the 2.1 brief):
// - the world is turned once, before the first frame, so its art faces the
//   visitor (`openingTurn`), or the place the member chose to open on (2.4);
// - each land is a faint place in its own tone, and its lights carry that tone;
// - the page starts at its fitted frame rather than easing in. The page is its
//   own first frame: the title is text and the sky is CSS, so both paint at once.
// `?card=wide|tall` is the same world framed as a share card (1200x630,
// 1080x1350): no drag, no corner caption, the card's own layout and ball size,
// and only the pieces on lands facing the viewer standing, inside the inset.
//
// Plain script like globe.js; it expects seed-world, sea-art-engine,
// course-art, globe and portrait-world loaded before it.
(function () {
  // the landing page's land tones, so a public world wears the product's colours
  const VIEWER_TONES = [0, 2, 5, 7, 3, 6];
  // Lights are decoration, not writing: one quiet kind for all of them, so
  // the renderer draws no kind-coded meaning a visitor could read into.
  const VIEWER_KIND = 'reference';

  function landColour(tone) {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--land-' + ((tone % 8) + 1));
    return (v && v.trim()) || null;
  }
  function contestColour() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--contest');
    return (v && v.trim()) || null;
  }

  // A card's frame (brief 2): the ball's radius at most 38% of the short side,
  // placed so standing art has headroom inside a 6% inset.
  const CARDS = {
    wide: { idleR: 0.38, cxFrac: 0.60, arcTop: 0.13 },
    tall: { idleR: 0.38, cxFrac: 0.50, arcTop: 0.27 },
  };
  // A piece stands on a card only on a land turned toward the viewer. The
  // camera stands about 2.2 radii away, so the visible rim is near a facing of
  // 0.45 and a land at 0.5 still reads as the rim: 0.75 is "toward you".
  const CARD_FACING = 0.75;

  // The world, turned once: every land centre, coast and light by one quaternion.
  function turned(world, q) {
    return {
      lands: world.lands.map((l) => Object.assign({}, l, { c: rotate(q, l.c), loop: l.loop.map((p) => rotate(q, p)) })),
      lights: world.lights.map((lt) => ({ land: lt.land, at: rotate(q, lt.at) })),
    };
  }

  // 4.9b: which lights hold a public note, by land: { land index: { light index on the land: note } }
  function noteMap(world, places, seed) {
    const out = {};
    places.forEach((p, i) => {
      const list = Array.isArray(p.notes) ? p.notes : [];
      if (!list.length) return;
      out[i] = {};
      noteLights(seed, i, list.length, world.lightsPerLand || PORTRAIT_LIGHTS).forEach((li, j) => { out[i][li] = list[j]; });
    });
    return out;
  }

  function nodesOf(world, places, seed, coasts) {
    const rand = portraitRng(seed, 'nodes');
    const held = noteMap(world, places, seed);
    const nth = {};
    const byKey = {};
    // 4.9c: every light is a note. A land shows one light per approved note, on
    // the lights the seed picks. 4.9d: a land with no notes yet shows its seeded
    // lights as placeholders, carrying nothing, so a tap on one falls to the land
    const nodes = [];
    world.lights.forEach((lt, i) => {
      const k = nth[lt.land] = (nth[lt.land] == null ? 0 : nth[lt.land] + 1);
      const note = held[lt.land] ? held[lt.land][k] : undefined;
      if (!note && held[lt.land]) return;
      const node = ({
      id: 'light-' + i,
      kind: VIEWER_KIND,
      region: places[lt.land].key,
      weight: 0.3,
      depth: 0.2 + rand() * 0.5,
      degree: Math.floor(rand() * 3),
      links: [],
      at: lt.at,
      tint: landColour(coasts[lt.land].tone),
      });
      // a light holding a note looks like any other light (Dan, 2026-10-10); it
      // carries the note's words for the card and its title for the hover
      if (note) { node.note = note; node.tip = note.title; node.place = places[lt.land].key; node.land = lt.land; byKey[note.key] = node.id; }
      // 4.12: a contest light takes the template's own colour, no land's tone
      if (note && note.kind === 'contest') node.tint = contestColour();
      nodes.push(node);
    });
    // its links, as the lights the linked notes sit on: the globe draws a node's
    // own links on hover and while it is selected, across lands too
    for (const n of nodes) if (n.note) n.links = (n.note.links || []).map((k) => byKey[k]).filter(Boolean);
    return nodes;
  }

  // A LIGHT THAT HOLDS A NOTE IS A REAL TAP TARGET (4.9, 4.9b): within
  // NOTE_REACH CSS px of one on the near side, the nearest wins over the land
  // under it; a tap anywhere else falls through to the land, as before.
  const NOTE_REACH = 14;   // a 28 px target, whatever the light draws at
  function noteAt(view, nodes, point) {
    let best = null, bd = NOTE_REACH;
    for (const n of nodes) {
      if (!n.note) continue;
      const at = view.landmarkAt(n.at);
      if (!at) continue;
      const d = Math.hypot(at.x - point.x, at.y - point.y);
      if (d <= bd) { bd = d; best = n; }
    }
    return best;
  }

  // On a card, a piece's anchor must sit inside the 6% inset with a margin of
  // its own reach (a fifth of the short side), measured where the drawn frame
  // put it: facing alone let a rim land's piece poke past the tall card's edge.
  function insideInset(view, at) {
    const p = view.landmarkAt(at);
    if (!p) return false;
    const w = window.innerWidth, h = window.innerHeight, s = Math.min(w, h);
    const m = s * 0.06 + s * 0.2;
    return p.x > m && p.x < w - m && p.y > m && p.y < h - s * 0.06;
  }

  function standArt(view, world, places, coasts, card) {
    const CA = window.CourseArt;
    if (!CA || typeof CA.sculpt !== 'function' || typeof view.sculpture !== 'function') return;
    places.forEach((pl, i) => {
      if (!pl.art) return;
      const land = world.lands[i];
      // a rim piece is the live world's, not the card's
      if (card && (land.c.z <= CARD_FACING || !insideInset(view, land.c))) return;
      let sc = null;
      try { sc = CA.sculpt(pl.art, { free: true, base: landColour(coasts[i].tone), dark: true }); } catch (_) { sc = null; }
      if (!sc || !sc.ok) return;
      view.sculpture(pl.key, {
        at: land.c, front: tangentFrame(land.c).u, alt: 1.006 + (sc.float || 0),
        // a piece may ask to stand smaller (its `footprint`, 2026-10-10)
        size: 0.26 * (sc.footprint || 1) / Math.max(0.2, sc.extent.w), art: sc,
        alpha: 0.82, amount: 0.5, present: 0, grow: 1,
      });
    });
  }

  // The page's one object. `onPlace` is the hook the place card attaches to;
  // `card` is the place card, `open(key)` and `close()`, for the tour to drive.
  const PortraitViewer = window.PortraitViewer = { onPlace: function () {}, card: null };

  // THE PLACE CARD (3.2, brief 3.1 section 2). Name and passage only through
  // `textContent`; its tone is the land's, by a data attribute the sheet
  // reads (no style is written from script). While it is up on a phone the
  // body carries `card-up` and the world's band rises, so the renderer is
  // told its canvas changed size.
  // ONE ORDER RULES THE WORLD (4.7b): the tour's stops first, then every other
  // place, the order the text version is written in at build (portrait.js), so
  // "Next place" from a tapped card walks the same list a reader of the text does.
  function worldOrder(places, tour) {
    const keys = places.map((p) => p.key);
    const first = (tour || []).filter((k) => keys.includes(k));
    return first.concat(keys.filter((k) => !first.includes(k)));
  }
  // The key after `key` in that order, round to the first after the last.
  function nextPlace(order, key) {
    const i = order.indexOf(key);
    return order.length > 1 ? order[(i + 1) % order.length] : null;
  }

  // THE CARD'S CONTROLS (4.7b, D5). A tapped card offers the way back (the
  // whole world) and the way on (the next place); a tour card offers the way
  // back and the tour's own control. Each is present only when it can act.
  function cardControls(mode, canNext) {
    const slot = document.getElementById('place-controls');
    const nextEl = document.getElementById('place-next');
    const step = document.getElementById('tour-step');
    if (!slot || !nextEl || !step) return;
    slot.hidden = !mode;
    nextEl.hidden = !(mode === 'tapped' && canNext);
    step.hidden = mode !== 'tour';
  }

  // THE WORDS READ THEMSELVES (4.7c, Dan: "like instagram text or tiktok text
  // does when it looks like the text is reading itself"). A tapped place's
  // passage reveals the way a tour stop's does: word spans written as text,
  // each rendered line brightening as the reveal reaches its first word at the
  // tour's own pace (TOUR_WORD a word), and the quiet line under it filling
  // across the reveal and the hold (TOUR_HOLD). Answers a cancel, which leaves
  // the passage whole and the line gone.
  // ONE WORD AT A TIME, AND IN VIEW (4.7d). Dan: "one line at a time
  // highlights instead of individual words being read". A word lights on its
  // own beat, and a passage longer than its card keeps the word being read in
  // view, so the reading moves down the passage as it goes (D10).
  function readWord(passage, w) {
    w.classList.add('on');
    if (passage.scrollHeight > passage.clientHeight && w.scrollIntoView) w.scrollIntoView({ block: 'nearest' });
  }

  function revealPassage(passage, line, text, still) {
    const timers = [];
    let fill = null;
    passage.textContent = '';
    passage.classList.remove('whole');
    const words = String(text || '').split(/\s+/).filter(Boolean);
    for (const word of words) {
      const w = document.createElement('span');
      w.className = 'w';
      w.textContent = word;
      passage.appendChild(w);
      passage.appendChild(document.createTextNode(' '));
    }
    const whole = () => {
      timers.forEach(clearTimeout);
      if (fill) { try { fill.cancel(); } catch (_) {} fill = null; }
      passage.classList.add('whole');
      if (line) line.hidden = true;
    };
    if (still || !words.length) { whole(); return { cancel: whole }; }
    const spans = [...passage.querySelectorAll('.w')];
    spans.forEach((w, i) => timers.push(setTimeout(() => readWord(passage, w), i * TOUR_WORD * 1000)));
    const len = words.length * TOUR_WORD + TOUR_HOLD;
    if (line) {
      line.hidden = false;
      const bar = line.firstElementChild;
      if (bar && bar.animate) fill = bar.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: len * 1000, fill: 'forwards' });
    }
    timers.push(setTimeout(whole, len * 1000));
    return { cancel: whole };
  }

  function placeCard(places, view, order, busy, still) {
    const el = document.getElementById('place-card');
    const name = document.getElementById('place-name');
    const passage = document.getElementById('place-passage');
    const line = document.getElementById('place-line');
    if (!el || !name || !passage) return { open: function () {}, close: function () {} };
    const resize = () => { try { view.resize(); } catch (_) {} };
    let current = null;
    let reading = null;
    const stopReading = () => { if (reading) { reading.cancel(); reading = null; } };
    // a second tap on a tapped card shows the whole passage at once (not on its controls)
    el.addEventListener('click', (ev) => {
      if (busy() || !reading) return;
      if (ev && ev.target && ev.target.closest && ev.target.closest('button')) return;
      stopReading();
    });
    return {
      get key() { return current; },
      open: function (key) {
        const i = places.findIndex((p) => p.key === key);
        if (i < 0) return;
        current = key;
        stopReading();
        name.textContent = places[i].name || '';
        passage.textContent = places[i].passage || '';
        // every passage opens at its top, never where the last one was left (4.7d, D10)
        passage.scrollTop = 0;
        el.setAttribute('data-tone', String((VIEWER_TONES[i % VIEWER_TONES.length] % 8) + 1));
        // a tour holds its own controls; a tap gets the way back and the way on
        if (!busy()) cardControls('tapped', nextPlace(order, key) != null);
        if (el.hidden) { el.hidden = false; void el.offsetWidth; }   // a first open still rises
        el.classList.add('open');
        document.body.classList.add('card-up');
        resize();
        // a tour writes and reveals its own words; a tap's words read themselves
        if (!busy()) reading = revealPassage(passage, line, places[i].passage, still);
      },
      close: function () {
        stopReading();
        el.classList.remove('open');
        document.body.classList.remove('card-up');
        resize();
      },
    };
  }

  // A NOTE'S BODY (4.9c): a closed subset of markdown, built as elements and
  // text nodes, never HTML. Blocks are split on a blank line; a block whose
  // every line starts "- " is a list, any other a paragraph (its line breaks
  // kept). Inside a line, **bold** and *italic*; a marker that does not close
  // on the same line, or that nests, stays as the characters it is.
  const INLINE = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
  function inlineInto(el, line) {
    let at = 0;
    for (const m of line.matchAll(INLINE)) {
      if (m.index > at) el.appendChild(document.createTextNode(line.slice(at, m.index)));
      const w = document.createElement(m[1] != null ? 'strong' : 'em');
      w.textContent = m[1] != null ? m[1] : m[2];
      el.appendChild(w);
      at = m.index + m[0].length;
    }
    if (at < line.length) el.appendChild(document.createTextNode(line.slice(at)));
  }
  function renderBody(el, text) {
    el.textContent = '';
    for (const block of String(text || '').split(/\n\s*\n/)) {
      const lines = block.split('\n').filter((l) => l.trim());
      if (!lines.length) continue;
      if (lines.every((l) => /^- /.test(l))) {
        const ul = document.createElement('ul');
        for (const l of lines) { const li = document.createElement('li'); inlineInto(li, l.slice(2)); ul.appendChild(li); }
        el.appendChild(ul);
      } else {
        const p = document.createElement('p');
        lines.forEach((l, j) => { if (j) p.appendChild(document.createTextNode('\n')); inlineInto(p, l); });
        el.appendChild(p);
      }
    }
  }

  // THE READING WINDOW (4.9c, Dan: "a node reading window pops up after we
  // see the nodes connect"). A dot in the place's tone beside the short title,
  // the body below as styled text, scrolling inside a sheet that never runs
  // past the screen. A close button, Escape, or a tap outside closes it; focus
  // goes in on open and back to the place card on close.
  // A CONTEST'S WINDOW OF DATES (4.12), in plain words against the visitor's
  // own clock: "12 October to 30 November 2026" while it runs, "Starts 12
  // October 2026" before, "Ended 30 November 2026" after. `today` is YYYY-MM-DD.
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function dayWords(d, year) {
    const [y, m, dd] = d.split('-').map(Number);
    return dd + ' ' + MONTHS[m - 1] + (year ? ' ' + y : '');
  }
  function contestWhen(starts, ends, today) {
    if (today > ends) return 'Ended ' + dayWords(ends, true);
    if (today < starts) return 'Starts ' + dayWords(starts, true);
    return dayWords(starts, starts.slice(0, 4) !== ends.slice(0, 4)) + ' to ' + dayWords(ends, true);
  }
  function localDay() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // CHECKING A CONTEST'S ANSWER (4.12b), in the visitor's own browser and for
  // them alone: the same normalization and hash the build fixed on the 4.12 box
  // (dashboard/portrait.js normalizeAnswer, answerHash), with the browser's own
  // crypto. Nothing is stored or sent, and a reload forgets a solve; a solve
  // everyone sees is 4.13's.
  function normalizeAnswer(text) {
    return String(text == null ? '' : text).normalize('NFKC').toLowerCase()
      .replace(/\p{P}/gu, '').replace(/\s+/gu, ' ').trim();
  }
  async function answerHashOf(key, text) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key + '\n' + normalizeAnswer(text)));
    return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  const canCheck = () => typeof crypto !== 'undefined' && crypto && crypto.subtle && typeof TextEncoder === 'function';

  function noteWindow() {
    const win = document.getElementById('note-window');
    const title = document.getElementById('note-title');
    const body = document.getElementById('note-body');
    const when = document.getElementById('note-when');
    const close = document.getElementById('note-close');
    const check = document.getElementById('note-check');
    const field = document.getElementById('note-answer');
    const go = document.getElementById('note-check-go');
    const said = document.getElementById('note-check-said');
    let back = null;
    let asking = null;   // the contest the field answers, or null
    if (!win || !title || !body || !close) return { open: function () {}, close: function () {}, get isOpen() { return false; } };
    const answering = check && field && go && said;
    const tryAnswer = async () => {
      const c = asking;
      if (!c || field.disabled || !normalizeAnswer(field.value)) return;
      let right = false;
      try { right = (await answerHashOf(c.key, field.value)) === c.answerHash; } catch (_) { return; }
      if (asking !== c) return;   // the window moved on while the hash ran
      // the page's own words, as text; the visitor's never become markup
      said.textContent = said.getAttribute(right ? 'data-yes' : 'data-no') || '';
      if (right) { field.disabled = true; go.disabled = true; } else { field.value = ''; field.focus(); }
    };
    if (answering) {
      go.addEventListener('click', tryAnswer);
      field.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); tryAnswer(); } });
    }
    const shut = () => {
      if (!win.hidden) {
        win.hidden = true;
        if (back && back.focus) back.focus();
      }
      back = null;
    };
    close.addEventListener('click', shut);
    // a tap on the shade around the sheet, never inside it
    win.addEventListener('click', (ev) => { if (ev && ev.target === win) shut(); });
    return {
      open: function (note, tone, returnTo) {
        title.textContent = note.title || '';
        const contest = note.kind === 'contest';
        // a contest: its dates, then the riddle, then the hints as a list (4.12), then the answer row below (4.12b)
        if (when) {
          when.textContent = contest ? contestWhen(note.starts, note.ends, localDay()) : '';
          when.hidden = !contest;
        }
        renderBody(body, contest ? note.riddle : note.body);
        if (contest && Array.isArray(note.hints) && note.hints.length) {
          const ul = document.createElement('ul');
          ul.className = 'note-hints';
          ul.setAttribute('aria-label', 'Hints');
          for (const h of note.hints) { const li = document.createElement('li'); li.textContent = h; ul.appendChild(li); }
          body.appendChild(ul);
        }
        body.scrollTop = 0;
        // 4.12b: a contest asks for its answer, whatever its dates say; a fresh field each open
        asking = contest && typeof note.answerHash === 'string' && answering && canCheck() ? note : null;
        if (answering) {
          check.hidden = !asking;
          field.value = ''; field.disabled = false; go.disabled = false; said.textContent = '';
        }
        win.setAttribute('data-tone', String(tone));
        win.setAttribute('data-kind', note.kind === 'insight' || contest ? note.kind : 'note');
        back = returnTo || null;
        win.hidden = false;
        if (title.focus) title.focus();
      },
      close: shut,
      get isOpen() { return !win.hidden; },
    };
  }

  // THE TOUR (3.2, brief 3.1 sections 3 and 4, pacing B through
  // `tourTimeline`). One tour control on screen at a time: Take the tour and
  // Tour again in the row at the bottom, Next and Resume tour in the card.
  // Playing is a continuous reveal; any touch on the world pauses, and paused
  // is a cut to the whole passage with its line removed. Resume continues the
  // current stop: the passage stays whole, the hold runs, then moving on.
  // Under reduced motion the flights are instant and the passage shows whole;
  // the cross-fades and still art are 3.3's.
  const IDLE_RATE = 0.018;
  const CAM = 1.95;   // the renderer's focus camera, in radii
  // WHERE A PLACE COMES TO REST (4.7d, D8: Dan, "the place should appear more
  // toward the top of the globe so its art is better visible instead of from
  // the top down"). Every flight, on the tour and on a tap, brings the land
  // to rest about 25 degrees above the ball's centre, so it is seen at a slant
  // and its standing art shows in profile, the way the first look presents it.
  const STOP_AIM = { x: 0, y: 0.42, z: 0.906 };
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  // How far in to come so a land's coast fills about three quarters of the
  // ball's radius, under perspective, with headroom for the title band. The
  // tour moves the renderer's `userZoom` and never leaves the whole-world fit:
  // `zoomTo` drops that fit, the ball doubles, and because the renderer pins
  // the horizon the facing land falls to the bottom of the band (found in
  // 3.2's look). Capped at 1.5 for the same reason.
  function stopZoom(land) {
    const r = land.radius;
    const reach = Math.sin(r) * 0.9 * CAM / (CAM - Math.cos(r));
    return Math.max(1, Math.min(1.5, 0.75 / reach));
  }

  function tourOf(view, world, places, keys, card, still) {
    const $ = (id) => document.getElementById(id);
    const row = $('tour-row'), go = $('tour-go'), goLabel = $('tour-go-label');
    const slot = $('place-controls'), step = $('tour-step'), stepLabel = $('tour-step-label');
    const cardEl = $('place-card'), count = $('place-count'), passage = $('place-passage');
    const line = $('place-line'), closing = $('tour-closing'), caption = $('tour-caption');
    // the idle turn, and what it was last set to, so a probe can read it (3.3)
    const idle = (r) => { PortraitViewer.idleRate = view.setIdleRate(r); };
    const say = (text) => { if (caption) caption.textContent = text || ''; };
    if (!row || !go || !slot || !step || !cardEl || !passage || !line) return null;
    const stops = (keys || []).map((k) => places.findIndex((p) => p.key === k)).filter((i) => i >= 0);
    if (!stops.length) return null;
    const plan = tourTimeline(stops.map((i) => places[i].passage));
    const beat = (kind, n) => plan.beats.find((b) => b.kind === kind && b.stop === n);
    row.setAttribute('data-tone', String((VIEWER_TONES[stops[0] % VIEWER_TONES.length] % 8) + 1));
    let state = 'idle', at = 0, phase = null, timers = [], zoomAnim = 0, fill = null, swallow = false;

    const later = (fn, s) => { timers.push(setTimeout(fn, Math.max(0, s) * 1000)); };
    function clear() {
      timers.forEach(clearTimeout); timers = [];
      cancelAnimationFrame(zoomAnim);
      if (fill) { try { fill.cancel(); } catch (_) {} fill = null; }
    }
    // which tour control is on screen: 'take' | 'again' (the row), 'next' |
    // 'resume' (the card, beside the way back). On the last stop the way on
    // is the ending, and its word says so (4.7b)
    function show(which) {
      row.hidden = !(which === 'take' || which === 'again');
      if (which === 'take' || which === 'again') {
        go.setAttribute('data-glyph', which === 'take' ? 'play' : 'again');
        goLabel.textContent = which === 'take' ? 'Take the tour' : 'Tour again';
      }
      if (which === 'next' || which === 'resume') {
        cardControls('tour');
        step.setAttribute('data-glyph', which === 'next' ? 'next' : 'play');
        stepLabel.textContent = which === 'resume' ? 'Resume tour' : at + 1 < stops.length ? 'Next' : 'See the ending';
      } else if (state === 'playing' || state === 'paused' || which === null) cardControls(null);
    }
    function zoomOver(to, s, done) {
      cancelAnimationFrame(zoomAnim);
      const from = view.userZoom || 1;
      if (still || s <= 0) { view.userZoom = to; if (done) done(); return; }
      const t0 = performance.now();
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / (s * 1000));
        view.userZoom = from + (to - from) * easeInOut(k);
        if (k < 1) zoomAnim = requestAnimationFrame(tick); else if (done) done();
      };
      zoomAnim = requestAnimationFrame(tick);
    }
    // the stop's card: its counter, its words as spans (text only through textContent)
    function openStop(n) {
      card.open(places[stops[n]].key);
      cardEl.classList.remove('leaving');
      count.textContent = (n + 1) + ' of ' + stops.length;
      count.hidden = false;
      passage.textContent = '';
      passage.classList.remove('whole');
      for (const word of String(places[stops[n]].passage || '').split(/\s+/).filter(Boolean)) {
        const w = document.createElement('span');
        w.className = 'w';
        w.textContent = word;
        passage.appendChild(w);
        passage.appendChild(document.createTextNode(' '));
      }
      document.body.classList.add('stop-up');
      say(places[stops[n]].name || '');
    }
    function arrive(n) {
      at = n; phase = 'flight';
      if (state === 'playing') show('next');
      const s = beat('flight', n).length;
      if (n > 0) cardEl.classList.add('leaving');
      const land = world.lands[stops[n]];
      // reduced motion (3.3): no flight, a 0.6 s cross-fade with the jump at its midpoint
      if (still) {
        document.body.classList.add('rm-fade');
        later(() => { view.turnTo(land.c, 1, STOP_AIM); zoomOver(stopZoom(land), 0); openStop(n); document.body.classList.remove('rm-fade'); }, 0.3);
        later(() => reveal(n), 0.6);
        return;
      }
      view.turnTo(land.c, still ? 1 : s * 1000, STOP_AIM);
      zoomOver(stopZoom(land), still ? 0 : s);
      later(() => openStop(n), still ? 0 : s - 0.42);
      later(() => reveal(n), still ? 0 : s);
    }
    function reveal(n) {
      phase = 'passage';
      say(places[stops[n]].passage || '');
      const words = [...passage.querySelectorAll('.w')];
      const len = beat('passage', n).length;
      // each word lights on its own beat as it is read (4.7d, D9)
      if (still) passage.classList.add('whole');
      else words.forEach((w, i) => later(() => readWord(passage, w), i * TOUR_WORD));
      line.hidden = false;
      const bar = line.firstElementChild;
      if (bar && bar.animate) fill = bar.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: (len + beat('hold', n).length) * 1000, fill: 'forwards' });
      later(() => hold(n), len);
    }
    function hold(n) {
      phase = 'hold';
      later(() => moveOn(n), beat('hold', n).length);
    }
    function moveOn(n) {
      clear();
      if (n + 1 < stops.length) arrive(n + 1); else end();
    }
    function end() {
      phase = 'pullback';
      card.close();
      count.hidden = true;
      line.hidden = true;
      document.body.classList.remove('stop-up');
      say('');
      show(null);
      if (still) {
        document.body.classList.add('rm-fade');
        later(() => { zoomOver(1, 0); document.body.classList.remove('rm-fade'); }, 0.3);
      } else zoomOver(1, 2);
      later(() => {
        state = 'done'; phase = null;
        if (closing) closing.hidden = false;   // its words and link are 3.4's
        show('again');
        idle(still ? 0 : IDLE_RATE);
      }, still ? 0.6 : 2);
    }
    function begin() {
      clear();
      if (closing) closing.hidden = true;
      state = 'playing';
      idle(0);
      arrive(0);
    }
    // THE WAY BACK, mid-tour (4.7b): the card closes, the world pulls back to
    // whole, and the tour waits to be taken again. No closing line: the
    // visitor left the tour, it did not end.
    function leave() {
      if (state !== 'playing' && state !== 'paused') return;
      clear();
      state = 'idle'; phase = null; swallow = false;
      card.close();
      count.hidden = true;
      line.hidden = true;
      cardEl.classList.remove('leaving');
      document.body.classList.remove('stop-up');
      say('');
      show(null);
      zoomOver(1, still ? 0 : 1.2);
      show('take');
      idle(still ? 0 : IDLE_RATE);
    }
    function pause() {
      if (state !== 'playing') return;
      clear();
      state = 'paused'; swallow = true;
      if (phase === 'flight') openStop(at);
      passage.classList.add('whole');
      line.hidden = true;
      show('resume');
    }
    function resume() {
      if (state !== 'paused') return;
      state = 'playing';
      openStop(at);
      passage.classList.add('whole');
      line.hidden = true;
      show('next');
      hold(at);
    }
    go.addEventListener('click', begin);
    step.addEventListener('click', () => {
      if (state === 'paused') resume();
      else if (state === 'playing') moveOn(at);
    });
    show('take');
    return {
      begin, pause, resume, leave,
      get state() { return state; },
      // the touch that paused the tour is not also a tap on a land
      takeTap() { const s = swallow; swallow = false; return s; },
    };
  }

  // Where each facing land sits on screen and how far its coast reaches there.
  function landCandidates(view, world) {
    const out = [];
    world.lands.forEach((land, i) => {
      const at = view.landmarkAt(land.c);
      if (!at) return;   // the far side of the ball
      const rim = view.landmarkAt(onCap(land.c, tangentFrame(land.c), 1, 0, land.radius));
      const reach = rim ? Math.hypot(rim.x - at.x, rim.y - at.y) : 0;
      out.push({ i, x: at.x, y: at.y, reach });
    });
    return out;
  }

  // A world that cannot mount (the fetch failed, the JSON is bad, no places,
  // the renderer threw) is never an empty sky (2.3): the tall card the build
  // named in `data-still` stands in its place, with the title as its alt, and
  // the text version of the world shows below it (3.3). With no card, the
  // title and byline stand above the text version.
  function fallen(canvas) {
    document.body.classList.add('world-fallen');
    const still = canvas && canvas.getAttribute('data-still');
    if (!still || document.querySelector('img.world-still')) return;
    const img = document.createElement('img');
    img.className = 'world-still';
    // the page's title stands until the card (which carries its own) arrives
    img.addEventListener('load', () => document.body.classList.add('still-shown'));
    img.setAttribute('src', still);
    img.setAttribute('alt', document.getElementById('world-title') ? document.getElementById('world-title').textContent : '');
    // at the top of the page, under the title, above the text version
    const head = document.querySelector('.world-head');
    if (head) head.parentNode.insertBefore(img, head.nextSibling);
    else document.body.insertBefore(img, document.body.firstChild);
  }

  async function start() {
    const title = document.getElementById('world-title');
    const byline = document.getElementById('world-byline');
    const canvas = document.getElementById('world');
    let pt = null;
    try {
      const res = await fetch('portrait.json', { cache: 'no-cache' });
      if (res.ok) pt = await res.json();
    } catch (_) { pt = null; }
    if (!pt || !Array.isArray(pt.places) || !pt.places.length) { fallen(canvas); return; }

    if (title) title.textContent = pt.title || '';
    if (byline) byline.textContent = pt.byline || '';
    if (pt.title) document.title = pt.title;

    const places = pt.places;
    const asked = new URLSearchParams(location.search).get('card');
    const card = Object.prototype.hasOwnProperty.call(CARDS, asked) ? asked : null;
    if (card) document.body.classList.add('card-' + card);
    // the same aim as the landing page: a wide frame, or a phone band (and the tall card)
    const wide = card ? card === 'wide' : window.innerWidth >= 700;
    const made = portraitWorld(pt.seed, places.length);
    const world = turned(made, openingTurn(made, places, wide, pt.opening));
    const coasts = world.lands.map((l, i) => ({
      slug: places[i].key, c: l.c, tone: VIEWER_TONES[i % VIEWER_TONES.length], name: places[i].name || '', loop: l.loop,
    }));
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    // the look every public world shares (brief 4): a full coast, a faint land
    // fill faded toward the rim, lights in their land's tone, a fitted start, and no light past the ball (2.6)
    // nodeNames: false, a light is never named on hover; its id is internal (4.7a D2)
    // lightNotes, 4.9b: a light (every light, 4.9c) says its note's title on hover
    const look = { coasts: coasts, coastCalm: 1, landFill: 0.12, tintNodes: true, settled: true, insideBall: true, nodeNames: false, lightNotes: true };
    let view = null;
    let tour = null;
    let nodes = [];
    try {
      nodes = nodesOf(world, places, pt.seed, coasts);
      view = mountGlobe(canvas, nodes, card
        ? Object.assign(look, CARDS[card], { explore: false, whole: false, idleRate: 0, nameCorner: false })
        : Object.assign(look, {
          // the page never scrolls, so the wheel can be the zoom
          explore: true, wheel: true,
          // every frame while the tour plays, so its zoom and the art's own
          // life are drawn smoothly rather than sampled into a blink (4.7f)
          playing: () => Boolean(tour && tour.state === 'playing'),
          pinch: true, inertia: true,
          // a press on a light is a tap like any other (4.9d, D11): the globe
          // hands it here, and the light's note decides, or the land under it
          tapNodes: true,
          onTap: function (pt) {
            if (tour && tour.takeTap()) return;
            // a light holding a note first (4.9b), then the land under the tap
            const lit = noteAt(view, nodes, pt);
            const i = lit ? places.findIndex((p) => p.key === lit.place) : pickLand(pt, landCandidates(view, world));
            if (i == null) { PortraitViewer.onPlace(null); return; }
            view.turnTo(world.lands[i].c, 900, STOP_AIM);
            PortraitViewer.onPlace(places[i].key, lit ? lit.note : undefined, lit ? lit.id : undefined, i);
          },
          // the renderer reads reduced motion itself; the idle turn stops too
          idleRate: still ? 0 : 0.018,
          whole: true,
          // a place is named in its card, never in a corner (brief 3.1 section 1)
          nameCorner: false,
        }));
    } catch (_) { fallen(canvas); return; }
    window.addEventListener('resize', () => { try { view.resize(); } catch (_) {} });
    if (!card) {
      const order = worldOrder(places, pt.tour);
      const touring = () => Boolean(tour && (tour.state === 'playing' || tour.state === 'paused'));
      PortraitViewer.card = placeCard(places, view, order, touring, still);
      // the card rises as the land finishes its 900 ms turn: 480 ms in, it
      // takes the last 420; a tap on the sea closes it at once
      let pending = null;
      const notes = PortraitViewer.notes = noteWindow();
      let opening = null;
      PortraitViewer.onPlace = function (key, note, lightId, landIndex) {
        clearTimeout(pending);
        clearTimeout(opening);
        notes.close();
        // a tapped note's light stays selected, so its links draw at once and
        // stay drawn; anything else lets go (4.9b, 4.9c)
        try { view.showLinks(note && lightId ? lightId : null); } catch (_) {}
        if (key == null) { PortraitViewer.card.close(); return; }
        pending = setTimeout(() => PortraitViewer.card.open(key), still ? 0 : 480);
        // the links first, then the note to read about 0.4 s later; at once under reduced motion
        if (note) opening = setTimeout(() => notes.open(note, (VIEWER_TONES[landIndex % VIEWER_TONES.length] % 8) + 1, document.getElementById('place-back')), still ? 0 : 400);
      };
      tour = PortraitViewer.tour = tourOf(view, world, places, pt.tour, PortraitViewer.card, still);
      // any touch on the world pauses a playing tour
      canvas.addEventListener('pointerdown', () => { if (tour) tour.pause(); });
      // the way back and the way on (4.7b, D5): the whole world from any card,
      // mid-tour or tapped; the next place in the world's one order from a tapped card
      const back = document.getElementById('place-back');
      const onward = document.getElementById('place-next');
      const backLabel = document.getElementById('place-back-label');
      const onwardLabel = document.getElementById('place-next-label');
      if (backLabel) backLabel.textContent = 'The whole world';
      if (onwardLabel) onwardLabel.textContent = 'Next place';
      if (back) back.addEventListener('click', () => { if (touring()) tour.leave(); else PortraitViewer.onPlace(null); });
      if (onward) onward.addEventListener('click', () => {
        const k = nextPlace(order, PortraitViewer.card.key);
        const i = places.findIndex((p) => p.key === k);
        if (i < 0) return;
        view.turnTo(world.lands[i].c, still ? 1 : 900, STOP_AIM);
        PortraitViewer.onPlace(k);
      });
      // KEYBOARD AND THE TEXT VERSION (3.3, PRD 5.7). A place in the text list
      // turns the world to it and opens its card, as a tap does (pausing a
      // playing tour first). The arrows turn the world from the canvas; Escape
      // closes an open card, or pauses a playing tour, whose card holds its control.
      for (const b of document.querySelectorAll('.world-text-places button[data-place]')) {
        b.addEventListener('click', () => {
          const i = places.findIndex((p) => p.key === b.getAttribute('data-place'));
          if (i < 0) return;
          if (tour && tour.state === 'playing') { tour.pause(); tour.takeTap(); }
          view.turnTo(world.lands[i].c, 900, STOP_AIM);
          PortraitViewer.onPlace(places[i].key);
        });
      }
      const ARROWS = { ArrowLeft: [-0.26, 0], ArrowRight: [0.26, 0], ArrowUp: [0, -0.17], ArrowDown: [0, 0.17] };
      canvas.addEventListener('keydown', (ev) => {
        const a = ARROWS[ev.key];
        if (!a) return;
        ev.preventDefault();
        view.turnBy(a[0], a[1]);
      });
      document.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Escape') return;
        // an open note closes first, back to its place's card
        if (PortraitViewer.notes && PortraitViewer.notes.isOpen) PortraitViewer.notes.close();
        else if (tour && tour.state === 'playing') tour.pause();
        else if (!tour || tour.state !== 'paused') PortraitViewer.onPlace(null);
      });
    }
    // a card measures its pieces against the drawn frame, so it waits for one
    if (card) requestAnimationFrame(() => requestAnimationFrame(() => standArt(view, world, places, coasts, card)));
    else standArt(view, world, places, coasts, card);
  }

  // anything start() did not expect falls back the same way
  const go = () => { start().catch(() => fallen(document.getElementById('world'))); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else go();
})();
