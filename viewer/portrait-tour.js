// A world you can share: the tour's pacing (3.2, brief 3.1 section 3, pacing B).
//
// `tourTimeline(passages)` takes the tour stops' passages in order and returns
// every beat with its start and length, in seconds, and the total. Pure: the
// viewer runs the tour from it and node proves the arithmetic.
//
// - the opening beat IS the first flight: 3 s to stop 1;
// - each later stop is reached by a 2 s flight;
// - a stop's name fades in over the last 0.4 s of its arrival;
// - its passage reads at 0.25 s a word (about 240 words a minute, ordinary
//   silent reading), never faster, however long the passage;
// - then a 1.2 s hold;
// - after the last hold, a 2 s pull-back to the whole world and a 0.5 s
//   closing line.
// Five stops at 24 words total 49.5 s (PRD 3.1, amended 2026-10-09).
//
// Plain script like portrait-world.js; it exports for node too.
const TOUR_OPENING = 3;
const TOUR_FLIGHT = 2;
const TOUR_NAME = 0.4;
const TOUR_WORD = 0.25;
const TOUR_HOLD = 1.2;
const TOUR_PULLBACK = 2;
const TOUR_CLOSING = 0.5;

function tourWords(passage) {
  return typeof passage === 'string' ? passage.split(/\s+/).filter(Boolean).length : 0;
}

function tourTimeline(passages) {
  const beats = [];
  let t = 0;
  const add = (kind, length, stop) => {
    const b = { kind, start: +t.toFixed(3), length: +length.toFixed(3) };
    if (stop != null) b.stop = stop;
    beats.push(b);
    t += length;
  };
  (passages || []).forEach((p, i) => {
    const flight = i === 0 ? TOUR_OPENING : TOUR_FLIGHT;
    add('flight', flight, i);
    // the name overlaps the flight's last 0.4 s; it takes no time of its own
    beats.push({ kind: 'name', start: +(t - TOUR_NAME).toFixed(3), length: TOUR_NAME, stop: i });
    add('passage', tourWords(p) * TOUR_WORD, i);
    add('hold', TOUR_HOLD, i);
  });
  if (beats.length) {
    add('pullback', TOUR_PULLBACK);
    add('closing', TOUR_CLOSING);
  }
  return { beats, total: +t.toFixed(3) };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { tourTimeline, tourWords, TOUR_OPENING, TOUR_FLIGHT, TOUR_NAME, TOUR_WORD, TOUR_HOLD, TOUR_PULLBACK, TOUR_CLOSING };
}
