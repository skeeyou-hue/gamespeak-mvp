/* OUTFIELDER — modelled before anything is built.

   You field. A sentence appears with its words blanked, four balls are in
   the air each carrying a candidate, and you catch the one that fills the
   next blank. Blanks fill strictly left to right, one live slot at a time.
   Catch a wrong ball and the batter gets a hit, scaled by how fast you
   grabbed it. Three completed sentences ends the half-inning.

   TWO QUESTIONS THIS ANSWERS
     1. How long a three-out fielding half-inning runs at each sentence
        length.
     2. How many runs a realistic error rate gives up.

   ---------------------------------------------------------------------
   WHAT IS REUSED RATHER THAN MODELLED

   hitForResponse and advanceOnHit are the SHIPPED functions. The hit
   ladder here is the batting ladder read in the other direction: there,
   fast and right hits further; here, fast and wrong gets hit further off
   you. That is not a resemblance to be coded twice — it is the same
   function, so this file calls it.

   The level ladder is LEVELS from timed.js. Sentence length is the only
   difficulty lever this mechanic adds, and it is indexed off that ladder
   rather than inventing a second one.

   ---------------------------------------------------------------------
   THE OPEN RULE THIS FILE HAD TO PIN DOWN

   The spec says a wrong catch gives up a hit. It does not say what happens
   to the slot. Two readings, and they are not close:

     STAYS LIVE   the blank is still unfilled; you keep fielding it until
                  you catch the right word. Every sentence therefore ends
                  in an out, errors cost hits and time, and the half-inning
                  is always exactly three sentences long.
     FILLS WRONG  the blank takes the wrong word and play moves on. The
                  sentence finishes faster and finishes wrong.

   STAYS LIVE is modelled as primary: it is the reading consistent with
   "the correct word is always among the four, so a failed slot is always
   the player's error" and with "a fielder who slows down and finishes
   clean can strand them" — stranding only means anything if finishing is
   guaranteed. FILLS WRONG is measured alongside it so the cost of the
   choice is a number rather than an opinion.

   ---------------------------------------------------------------------
   CONSTANTS THIS MECHANIC NEEDS AND DOES NOT HAVE

   None of these exist in the tree. They are proposed here at a starting
   value and swept, not asserted:

     FLIGHT_MS      how long the four balls stay catchable. The player has
                    to read a sentence AND four candidates in this window,
                    which is a far bigger reading task than the batting
                    mode's single word, so it cannot inherit that clock.
     SETTLE_MS      the caught word travelling into the blank.
     HIT_BEAT_MS    a conceded hit playing out before the next volley.
   ------------------------------------------------------------------- */

const T = require('./timed.js');
const { LEVELS, hitForResponse, advanceOnHit, HIT_ADVANCE, SPEED_BANDS } = T;

const FLIGHT_MS   = 4000;
const SETTLE_MS   = 600;
const HIT_BEAT_MS = 1500;
const OUTS_PER_HALF = 3;          // three completed sentences

// Sentence length by rung, indexed off the real ladder so a level added or
// reordered there cannot leave this behind. Rookie shortest, ML longest.
const SLOTS_BY_LEVEL = [3, 4, 5, 6, 7];
if (SLOTS_BY_LEVEL.length !== LEVELS.length) {
  throw new Error(`sentence lengths (${SLOTS_BY_LEVEL.length}) and the ladder (${LEVELS.length}) disagree`);
}

const SIGMA = 0.45;               // same lexical-retrieval spread as levels.js
function lognormal(median, sigma) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return median * Math.exp(sigma * z);
}

/* THE PLAYER.

   Rushing is what makes this mechanic mirror the batting one, so accuracy
   has to fall out of timing rather than be independent of it. A player who
   grabs at 400ms has not read four near-miss candidates; one who takes two
   seconds has.

     pKnow      can they tell the right form from three near-misses at all
     rt         how long a considered read takes THEM

   Rushing is relative to the player, not absolute. A first version of this
   used one fixed 1800ms "time a full read needs" for everybody, and it
   reported the fluent fielder as SLOWER than the sharp one — because a
   fluent player deciding in 850ms was being scored as panicking. That was
   the model's error, not a finding about the mechanic: reading four
   near-miss candidates takes a fluent speaker less time than it takes a
   shaky one, so the threshold has to move with them.

   Grabbing at or above your own considered pace is clean; grabbing well
   under it degrades toward a floor — not to zero, because even a blind
   snatch is one-in-four by luck. */
const RUSH_FLOOR = 0.25;          // four balls: chance alone is one in four

function rushFactor(t, rt) {
  return Math.max(RUSH_FLOOR, Math.min(1, t / rt));
}

const FIELDERS = [
  { name: 'first encounter', rt: 2600, pKnow: 0.45 },
  { name: 'shaky',           rt: 2100, pKnow: 0.62 },
  { name: 'competent',       rt: 1600, pKnow: 0.78 },
  { name: 'sharp',           rt: 1200, pKnow: 0.90 },
  { name: 'fluent',          rt:  850, pKnow: 0.97 }
];

/* One slot. Returns how long it took and whether the catch was right.
   A decision slower than the flight means the balls dropped: that costs a
   whole volley and nothing else — no out, no hit. */
function fieldSlot(p, flight) {
  let ms = 0;
  for (;;) {
    const t = lognormal(p.rt, SIGMA);
    if (t > flight) { ms += flight; continue; }        // dropped, re-pitched
    ms += t;
    // p.pErr pins the error rate as an input instead of letting it fall out
    // of pKnow and rushing. Timing is still drawn, because WHICH hit a
    // wrong catch concedes depends on when it happened.
    const right = p.pErr === undefined
      ? Math.random() < p.pKnow * rushFactor(t, p.ownRt || p.rt)
      : Math.random() >= p.pErr;
    return { ms, right, at: t };
  }
}

/* One half-inning: sentences until OUTS_PER_HALF are recorded.

   `grace` is the number of wrong catches a slot absorbs before one of them
   concedes a hit — the equivalent of the batting mode's count, which the
   spec does not have. grace = 0 is the spec exactly: every wrong catch is
   a hit. It is a parameter because the spec's own value turns out to be
   the thing that breaks the scoreline. */
function halfInning(p, slots, flight, mode, grace = 0) {
  let outs = 0, runs = 0, ms = 0, hits = 0, drops = 0, slotsPlayed = 0, fouls = 0;
  let bases = [false, false, false];
  const mix = { SINGLE: 0, DOUBLE: 0, TRIPLE: 0, HOMERUN: 0 };

  while (outs < OUTS_PER_HALF) {
    for (let slot = 0; slot < slots; ) {
      let missed = 0;
      for (;;) {
        const r = fieldSlot(p, flight);
        ms += r.ms + SETTLE_MS;
        slotsPlayed++;
        drops += Math.floor(r.ms / flight);
        if (r.right) { slot++; break; }

        // Wrong ball. Inside the grace it is a foul: costs time, not a base.
        if (missed++ < grace) { fouls++; ms += HIT_BEAT_MS; continue; }

        // The batter gets a hit, and WHEN it was caught decides what kind —
        // the shipped ladder, read the other way round.
        const hit = hitForResponse(r.at, flight) || 'SINGLE';
        hits++; mix[hit]++;
        const play = advanceOnHit(bases, HIT_ADVANCE[hit]);
        bases = play.bases; runs += play.runs;
        ms += HIT_BEAT_MS;
        missed = 0;                                    // grace refreshes
        if (mode === 'FILLS_WRONG') { slot++; break; }
      }
    }
    outs++;                                            // sentence completed
  }
  return { runs, ms, hits, drops, fouls, slotsPlayed, bases, mix };
}

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct  = (a, b) => b === 0 ? 0 : 100 * a / b;

function cell(p, slots, flight = FLIGHT_MS, mode = 'STAYS_LIVE', n = 4000, grace = 0) {
  const R = [], M = [], H = [], E = [], LOB = [], D = [];
  const mix = { SINGLE: 0, DOUBLE: 0, TRIPLE: 0, HOMERUN: 0 };
  for (let k = 0; k < n; k++) {
    const r = halfInning(p, slots, flight, mode, grace);
    R.push(r.runs); M.push(r.ms); H.push(r.hits);
    E.push(pct(r.hits, r.slotsPlayed));
    D.push(r.drops);
    LOB.push(r.bases.filter(Boolean).length);
    for (const key of Object.keys(mix)) mix[key] += r.mix[key];
  }
  M.sort((a, b) => a - b);
  return {
    runs: mean(R), hits: mean(H), errRate: mean(E), lob: mean(LOB),
    drops: mean(D),
    minMed: M[Math.floor(0.5 * M.length)] / 60000,
    minP90: M[Math.floor(0.9 * M.length)] / 60000,
    mix
  };
}

module.exports = { FLIGHT_MS, SETTLE_MS, HIT_BEAT_MS, OUTS_PER_HALF,
                   SLOTS_BY_LEVEL, FIELDERS, RUSH_FLOOR,
                   cell, halfInning, fieldSlot, rushFactor };


/* ---------------------------------------------------------------------
   THE REPORT
   ------------------------------------------------------------------- */

const pad = (s, w) => String(s).padStart(w);
const padr = (s, w) => String(s).padEnd(w);

function rungHeader() {
  return padr('', 18) + LEVELS.map((lv, i) =>
    pad(`${lv.name.slice(0, 6)}/${SLOTS_BY_LEVEL[i]}`, 11)).join('');
}

function table(title, note, rows, fmt, mode = 'STAYS_LIVE') {
  console.log(`\n${title}`);
  if (note) console.log(`  ${note}`);
  console.log(rungHeader());
  for (const p of rows) {
    const cells = SLOTS_BY_LEVEL.map(s => pad(fmt(cell(p, s, FLIGHT_MS, mode)), 11));
    console.log(padr('  ' + p.name, 18) + cells.join(''));
  }
}

if (require.main === module) {
  console.log(`OUTFIELDER — ${OUTS_PER_HALF} completed sentences a half-inning, ` +
              `${FLIGHT_MS}ms flight, ${SETTLE_MS}ms settle, ${HIT_BEAT_MS}ms hit beat`);
  console.log(`Sentence length by rung: ${LEVELS.map((lv, i) =>
    `${lv.name} ${SLOTS_BY_LEVEL[i]}`).join(' · ')}`);

  // ---- QUESTION 1: how long does a half-inning run -------------------
  table('Q1  HALF-INNING LENGTH, minutes  median / p90',
        'a dropped volley costs the flight and nothing else',
        FIELDERS, c => `${c.minMed.toFixed(1)}/${c.minP90.toFixed(1)}`);

  // ---- QUESTION 2: what does an error rate cost ----------------------
  table('Q2a RUNS GIVEN UP a half-inning',
        'error rate emerges from pKnow and rushing, not pinned',
        FIELDERS, c => c.runs.toFixed(2));

  table('Q2b ERROR RATE, % of slots fielded wrong', '',
        FIELDERS, c => c.errRate.toFixed(1) + '%');

  // Error rate pinned as an input, so the mapping reads straight.
  const PINNED = [0.02, 0.05, 0.10, 0.15, 0.20, 0.30]
    .map(e => ({ name: `${(e * 100).toFixed(0)}% error`, rt: 1600, pErr: e }));
  table('Q2c RUNS GIVEN UP at a PINNED error rate',
        'rt held at 1600ms so only the error rate moves',
        PINNED, c => c.runs.toFixed(2));

  /* ---- the lever the spec is missing ---------------------------------
     Q2a is not a playable scoreline, so the next question is what it would
     take to be one. In the batting mode a wrong answer costs a STRIKE and
     the count absorbs it; only a fast correct answer is a hit. This mirror
     has no count, so every wrong catch scores. `grace` puts the count back:
     the number of wrong catches a slot absorbs before one concedes. */
  console.log('\nGRACE  wrong catches a slot absorbs before one concedes');
  console.log('  runs a half-inning. grace 0 is the spec exactly. grace 2 is the three-strike mirror.');
  for (const g of [0, 1, 2, 3]) {
    console.log(`  grace ${g}`);
    console.log(rungHeader());
    for (const p of FIELDERS) {
      const cells = SLOTS_BY_LEVEL.map(s =>
        pad(cell(p, s, FLIGHT_MS, 'STAYS_LIVE', 2500, g).runs.toFixed(2), 11));
      console.log(padr('    ' + p.name, 18) + cells.join(''));
    }
  }

  /* The rung a player is actually on. Every other row of these tables is a
     mismatch the ladder exists to prevent, so the diagonal is the number
     that decides whether the mechanic is playable. */
  console.log('\nTHE DIAGONAL  each fielder on the rung meant for them');
  console.log(padr('  rung / fielder', 26) + ['min med', 'err %', 'g=0 runs', 'g=1 runs', 'g=2 runs'].map(h => pad(h, 10)).join(''));
  FIELDERS.forEach((p, i) => {
    const s = SLOTS_BY_LEVEL[i];
    const c0 = cell(p, s, FLIGHT_MS, 'STAYS_LIVE');
    const c1 = cell(p, s, FLIGHT_MS, 'STAYS_LIVE', 2500, 1);
    const c2 = cell(p, s, FLIGHT_MS, 'STAYS_LIVE', 2500, 2);
    console.log(padr(`  ${LEVELS[i].name} / ${p.name}`, 26) +
      [c0.minMed.toFixed(1), c0.errRate.toFixed(0) + '%',
       c0.runs.toFixed(2), c1.runs.toFixed(2), c2.runs.toFixed(2)]
      .map(v => pad(v, 10)).join(''));
  });

  // ---- the open rule -------------------------------------------------
  console.log('\nOPEN RULE  what a wrong catch does to the slot');
  console.log('  runs a half-inning, STAYS_LIVE -> FILLS_WRONG');
  console.log(rungHeader());
  for (const p of FIELDERS) {
    const cells = SLOTS_BY_LEVEL.map(s => {
      const a = cell(p, s, FLIGHT_MS, 'STAYS_LIVE');
      const b = cell(p, s, FLIGHT_MS, 'FILLS_WRONG');
      return pad(`${a.runs.toFixed(1)}->${b.runs.toFixed(1)}`, 11);
    });
    console.log(padr('  ' + p.name, 18) + cells.join(''));
  }

  // ---- what the hits actually are ------------------------------------
  console.log('\nHIT MIX conceded, all rungs pooled  (band boundaries read from SPEED_BANDS)');
  console.log('  ' + SPEED_BANDS.map(b => `${b.hit} <=${b.within}`).join('  '));
  console.log(padr('', 18) + ['SINGLE', 'DOUBLE', 'TRIPLE', 'HOMERUN'].map(h => pad(h, 11)).join(''));
  for (const p of FIELDERS) {
    const tot = { SINGLE: 0, DOUBLE: 0, TRIPLE: 0, HOMERUN: 0 };
    for (const s of SLOTS_BY_LEVEL) {
      const c = cell(p, s, FLIGHT_MS, 'STAYS_LIVE', 1500);
      for (const k of Object.keys(tot)) tot[k] += c.mix[k];
    }
    const n = Object.values(tot).reduce((a, b) => a + b, 0);
    console.log(padr('  ' + p.name, 18) +
      Object.keys(tot).map(k => pad(pct(tot[k], n).toFixed(0) + '%', 11)).join(''));
  }

  /* ---- the strategy the spec asserts exists -------------------------
     "a fielder who slows down and finishes clean can strand them." That is
     a claim about a strategy, so it gets measured rather than assumed.
     A player choosing a pace multiplies their own rt: 0.5 is grabbing at
     twice their natural speed, 2.0 is taking twice as long as usual. */
  const comp = FIELDERS[2];
  console.log(`\nPACE  ${comp.name} fielder choosing a pace, ${SLOTS_BY_LEVEL[2]}-slot sentence`);
  console.log('  x1.0 is their own considered read. Accuracy ceilings at pKnow.');
  const PACES = [0.4, 0.6, 0.8, 1.0, 1.5, 2.0, 3.0];
  console.log(padr('  pace', 18) + PACES.map(x => pad('x' + x.toFixed(1), 11)).join(''));
  const paceCells = PACES.map(x =>
    cell({ name: 'p', rt: comp.rt * x, pKnow: comp.pKnow, ownRt: comp.rt },
         SLOTS_BY_LEVEL[2], FLIGHT_MS, 'STAYS_LIVE'));
  for (const [label, fmt] of [['error rate', c => c.errRate.toFixed(1) + '%'],
                              ['runs', c => c.runs.toFixed(2)],
                              ['minutes med', c => c.minMed.toFixed(1)],
                              ['LOB', c => c.lob.toFixed(2)]]) {
    console.log(padr('  ' + label, 18) + paceCells.map(c => pad(fmt(c), 11)).join(''));
  }

  // ---- does the flight clock matter ----------------------------------
  console.log(`\nFLIGHT SWEEP  competent fielder, ${SLOTS_BY_LEVEL[2]}-slot sentence`);
  console.log(padr('  flight ms', 18) + [3000, 3500, 4000, 5000, 6000].map(f => pad(f, 11)).join(''));
  for (const [label, fmt] of [['minutes med', c => c.minMed.toFixed(1)],
                              ['runs', c => c.runs.toFixed(2)],
                              ['drops/inning', c => c.drops.toFixed(1)]]) {
    const cells = [3000, 3500, 4000, 5000, 6000].map(f => {
      const c = cell(comp, SLOTS_BY_LEVEL[2], f, 'STAYS_LIVE');
      return pad(fmt(c), 11);
    });
    console.log(padr('  ' + label, 18) + cells.join(''));
  }
}
