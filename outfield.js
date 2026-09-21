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
   DECIDED, AFTER THE FIRST PASS

   1. GRACE = 1. The count the mirror dropped. The second wrong catch on
      a slot concedes. Exhausting the grace RESOLVES the slot to the correct
      word, shown plainly, and play continues — REVEAL_MS. That reveal is
      the teaching moment the batting mode cannot give, because batting
      never shows you the word you missed.

   2. BAND = 'PACE'. The hit band is measured against the player's own
      rolling pace, not against a fixed fraction of the flight. See the
      block above PACE_BANDS for why the fixed version inverted.

   3. STAYS_LIVE. A wrong catch concedes the hit and the slot stays open.
      The reason is pedagogical rather than balance: FILLS WRONG leaves an
      ungrammatical sentence standing as the completed artifact, and the
      last thing a learner should see is the wrong form assembled.

   AND THE THING THOSE TWO DECISIONS DO TOGETHER, WHICH NEITHER DOES ALONE

   Decision 1 says exhausting the grace resolves the slot and play
   continues. Decision 3 says the slot stays open on a wrong catch. Put
   together, "stays open" means stays open THROUGH THE GRACE — it cannot
   also mean forever, because the reveal ends it. So the slot no longer
   loops, and `onExhaust` replaces the old STAYS_LIVE / FILLS_WRONG flag:

     RESOLVE     adopted. Concede the hit, show the correct word, move on.
     FILL_WRONG  concede, put the WRONG word in the blank, move on.
     LOOP        the old STAYS_LIVE: concede and keep fielding the same
                 slot until it is caught right. Kept only because the
                 earlier grace table was measured against it.

   This matters to the numbers, not just the wording. The grace table that
   the grace-2 recommendation came from was measured with LOOP, where an
   unbounded run of errors inside one slot is possible. Under RESOLVE it
   is not, so every cell in that table moves and the recommendation has to
   be re-checked against the rule that was actually adopted.

   RESOLVE and FILL_WRONG concede the identical hit and advance the
   identical runners; they differ only in which word is left on the screen
   and in REVEAL_MS of clock. So decision 3 bought the pedagogy for the
   price of the reveal animation and nothing else, which is the strongest
   possible ground for making it.

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

/* The mechanic's constants live in outfield-rules.js, which is also what
   the playable build runs on. This file reads them rather than declaring
   its own, so a simulation cannot quietly be sweeping a value the game
   does not have. Everything below that line — the player model — belongs
   to the simulation and is not a rule.

   The reasoning behind each constant is in outfield-rules.js; the
   findings that set them are in the commits and in Addenda 15-17. */
const R = require('./outfield-rules.js');
const { FLIGHT_MS, SETTLE_MS, HIT_BEAT_MS, REVEAL_MS, OUTS_PER_HALF, GRACE,
        PACE_BANDS, PACE_WINDOW, PACE_MIN, PACE_FROM, WARMUP, SLOTS_BY_LEVEL,
        makePace, hitForPace } = R;

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

/* The rolling pace. Built from CORRECT catches only, per the decision —
   a wrong catch is by definition not evidence of how long this player
   needs. That choice biases the median slow, because rushing is what
   causes errors, so the catches that survive are the considered ones.
   The bias is measured rather than assumed; see pace-band.js. */
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
function halfInning(p, slots, flight, onExhaust = 'RESOLVE', grace = GRACE, opt = {}) {
  const band   = opt.band   || 'PACE';       // 'PACE' | 'FLIGHT'
  const warmup = opt.warmup || WARMUP;        // what to do before PACE_MIN samples
  const pace   = opt.pace   || makePace(opt.paceWindow, opt.seed);
  const paceFrom = opt.paceFrom || PACE_FROM;   // 'CORRECT' | 'ALL'

  let outs = 0, runs = 0, ms = 0, hits = 0, drops = 0, slotsPlayed = 0;
  let fouls = 0, reveals = 0, cold = 0, wrongs = 0;
  let bases = [false, false, false];
  const mix = { SINGLE: 0, DOUBLE: 0, TRIPLE: 0, HOMERUN: 0 };

  /* What a wrong catch concedes. Under 'PACE' this is the player's own
     rolling norm; before the norm exists, `warmup` decides. */
  const concede = (t) => {
    if (band === 'FLIGHT') return hitForResponse(t, flight) || 'SINGLE';
    if (pace.n() >= PACE_MIN) return hitForPace(t, pace.median());
    cold++;
    if (warmup === 'SINGLE') return 'SINGLE';                    // mildest
    if (warmup === 'PRIOR')  return hitForPace(t, opt.prior);    // rung's estimate
    return hitForResponse(t, flight) || 'SINGLE';                // 'FLIGHT'
  };

  while (outs < OUTS_PER_HALF) {
    for (let slot = 0; slot < slots; ) {
      let missed = 0;
      for (;;) {
        const r = fieldSlot(p, flight);
        ms += r.ms + SETTLE_MS;
        slotsPlayed++;
        drops += Math.floor(r.ms / flight);
        if (paceFrom === 'ALL') pace.push(r.at);
        if (r.right) { if (paceFrom === 'CORRECT') pace.push(r.at); slot++; break; }
        wrongs++;

        // Wrong ball. Inside the grace it is a foul: costs time, not a base.
        if (missed++ < grace) { fouls++; ms += HIT_BEAT_MS; continue; }

        const hit = concede(r.at);
        hits++; mix[hit]++;
        const play = advanceOnHit(bases, HIT_ADVANCE[hit]);
        bases = play.bases; runs += play.runs;
        ms += HIT_BEAT_MS;

        /* Grace exhausted. */
        missed = 0;
        if (onExhaust === 'LOOP') continue;            // old STAYS_LIVE
        if (onExhaust === 'RESOLVE') { reveals++; ms += REVEAL_MS; }
        slot++; break;
      }
    }
    outs++;                                            // sentence completed
  }
  return { runs, ms, hits, wrongs, drops, fouls, reveals, cold, slotsPlayed, bases, mix };
}

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct  = (a, b) => b === 0 ? 0 : 100 * a / b;

function cell(p, slots, flight = FLIGHT_MS, onExhaust = 'RESOLVE', n = 4000, grace = GRACE, opt = {}) {
  const R = [], M = [], H = [], E = [], LOB = [], D = [], RV = [], CO = [], CR = [];
  const mix = { SINGLE: 0, DOUBLE: 0, TRIPLE: 0, HOMERUN: 0 };
  for (let k = 0; k < n; k++) {
    const r = halfInning(p, slots, flight, onExhaust, grace, opt);
    R.push(r.runs); M.push(r.ms); H.push(r.hits);
    E.push(pct(r.wrongs, r.slotsPlayed));
    D.push(r.drops); RV.push(r.reveals); CO.push(r.cold);
    CR.push(pct(r.hits, r.slotsPlayed));
    LOB.push(r.bases.filter(Boolean).length);
    for (const key of Object.keys(mix)) mix[key] += r.mix[key];
  }
  M.sort((a, b) => a - b);
  return {
    runs: mean(R), hits: mean(H), errRate: mean(E), lob: mean(LOB),
    drops: mean(D), reveals: mean(RV), cold: mean(CO),
    concedeRate: mean(CR),
    minMed: M[Math.floor(0.5 * M.length)] / 60000,
    minP90: M[Math.floor(0.9 * M.length)] / 60000,
    mix
  };
}

module.exports = { FLIGHT_MS, SETTLE_MS, HIT_BEAT_MS, REVEAL_MS, OUTS_PER_HALF,
                   GRACE, PACE_BANDS, PACE_WINDOW, PACE_MIN, PACE_FROM, WARMUP,
                   SLOTS_BY_LEVEL, FIELDERS, RUSH_FLOOR, SIGMA, lognormal,
                   cell, halfInning, fieldSlot, rushFactor, makePace, hitForPace,
                   PACE_FROM, WARMUP };


/* ---------------------------------------------------------------------
   THE REPORT
   ------------------------------------------------------------------- */

const pad  = (s, w) => String(s).padStart(w);
const padr = (s, w) => String(s).padEnd(w);
const RUNGS = LEVELS.map((lv, i) => ({ name: lv.name, slots: SLOTS_BY_LEVEL[i],
                                       prior: lv.clock.medium }));

function rungHeader() {
  return padr('', 18) + RUNGS.map(r => pad(`${r.name.slice(0, 6)}/${r.slots}`, 11)).join('');
}

function table(title, note, rows, fmt, opt = {}, grace = GRACE, onExhaust = 'RESOLVE') {
  console.log(`\n${title}`);
  if (note) console.log(`  ${note}`);
  console.log(rungHeader());
  for (const p of rows) {
    const cells = RUNGS.map(r =>
      pad(fmt(cell(p, r.slots, FLIGHT_MS, onExhaust, 4000, grace,
                   { ...opt, prior: opt.prior === 'RUNG' ? r.prior : opt.prior })), 11));
    console.log(padr('  ' + p.name, 18) + cells.join(''));
  }
}

if (require.main === module) {
  console.log('OUTFIELDER — the adopted rules');
  console.log(`  ${OUTS_PER_HALF} completed sentences a half-inning · GRACE ${GRACE} · reveal on exhaust (${REVEAL_MS}ms)`);
  console.log(`  flight ${FLIGHT_MS}ms · settle ${SETTLE_MS}ms · hit beat ${HIT_BEAT_MS}ms`);
  console.log(`  band PACE: ${PACE_BANDS.map(b => `${b.hit} <=${b.within}x`).join(' · ')}`);
  console.log(`  rolling median of the last ${PACE_WINDOW} catches (${PACE_FROM}), live after ${PACE_MIN}; cold -> ${WARMUP}`);
  console.log(`  sentence length: ${RUNGS.map(r => `${r.name} ${r.slots}`).join(' · ')}`);

  // ---- 1. the correction: the grace table under the rule ACTUALLY adopted
  console.log('\n1. GRACE, RE-DERIVED UNDER onExhaust=RESOLVE');
  console.log('  The table the grace-2 call was made from used LOOP, where one slot can');
  console.log('  concede without bound. Under RESOLVE it cannot, so every cell moves.');
  console.log('  runs a half-inning, LOOP -> RESOLVE, at each grace:');
  for (const g of [0, 1, 2, 3]) {
    console.log(`  grace ${g}`);
    console.log(rungHeader());
    for (const p of FIELDERS) {
      const cells = RUNGS.map(r => {
        const L = cell(p, r.slots, FLIGHT_MS, 'LOOP',    2500, g, { band: 'FLIGHT' });
        const R = cell(p, r.slots, FLIGHT_MS, 'RESOLVE', 2500, g, { band: 'FLIGHT' });
        return pad(`${L.runs.toFixed(1)}->${R.runs.toFixed(1)}`, 11);
      });
      console.log(padr('    ' + p.name, 18) + cells.join(''));
    }
  }

  // ---- 2. does the pace band clear the inversion --------------------
  console.log('\n2. THE INVERSION  share of conceded hits that are HOME RUNS');
  console.log('  FLIGHT band (as first specified) -> PACE band (adopted). Flat is the goal:');
  console.log('  panic should mean the same thing whoever you are.');
  console.log(padr('', 18) + RUNGS.map(r => pad(`${r.name.slice(0, 6)}/${r.slots}`, 13)).join(''));
  for (const p of FIELDERS) {
    const cells = RUNGS.map(r => {
      const f = cell(p, r.slots, FLIGHT_MS, 'RESOLVE', 2500, GRACE, { band: 'FLIGHT' });
      const q = cell(p, r.slots, FLIGHT_MS, 'RESOLVE', 2500, GRACE, { band: 'PACE', warmup: 'FLIGHT' });
      const hr = m => pct(m.HOMERUN, Object.values(m).reduce((a, b) => a + b, 0)).toFixed(0);
      return pad(`${hr(f.mix)}% -> ${hr(q.mix)}%`, 13);
    });
    console.log(padr('  ' + p.name, 18) + cells.join(''));
  }

  console.log('\n   full conceded mix under the PACE band, all rungs pooled');
  console.log(padr('', 18) + ['SINGLE', 'DOUBLE', 'TRIPLE', 'HOMERUN'].map(h => pad(h, 11)).join(''));
  for (const p of FIELDERS) {
    const tot = { SINGLE: 0, DOUBLE: 0, TRIPLE: 0, HOMERUN: 0 };
    for (const r of RUNGS) {
      const c = cell(p, r.slots, FLIGHT_MS, 'RESOLVE', 1500, GRACE, { band: 'PACE' });
      for (const k of Object.keys(tot)) tot[k] += c.mix[k];
    }
    const n = Object.values(tot).reduce((a, b) => a + b, 0);
    console.log(padr('  ' + p.name, 18) +
      Object.keys(tot).map(k => pad(pct(tot[k], n).toFixed(0) + '%', 11)).join(''));
  }

  // ---- 3. the adopted build ------------------------------------------
  table('3. RUNS GIVEN UP a half-inning, adopted rules',
        `grace ${GRACE}, RESOLVE, PACE band`,
        FIELDERS, c => c.runs.toFixed(2), { band: 'PACE' });

  table('   HALF-INNING LENGTH, minutes  median / p90', '',
        FIELDERS, c => `${c.minMed.toFixed(1)}/${c.minP90.toFixed(1)}`, { band: 'PACE' });

  table('   REVEALS a half-inning  (the teaching moment firing)',
        'a slot that exhausted its grace and resolved to the correct word',
        FIELDERS, c => c.reveals.toFixed(1), { band: 'PACE' });

  // ---- 4. the diagonal ------------------------------------------------
  console.log('\n4. THE DIAGONAL  each fielder on the rung meant for them, adopted rules');
  console.log(padr('  rung / fielder', 26) +
    ['min med', 'wrong %', 'conceded%', 'runs', 'reveals', 'cold hits'].map(h => pad(h, 11)).join(''));
  FIELDERS.forEach((p, i) => {
    const r = RUNGS[i];
    const c = cell(p, r.slots, FLIGHT_MS, 'RESOLVE', 4000, GRACE, { band: 'PACE' });
    console.log(padr(`  ${r.name} / ${p.name}`, 26) +
      [c.minMed.toFixed(1), c.errRate.toFixed(0) + '%', c.concedeRate.toFixed(1) + '%',
       c.runs.toFixed(2), c.reveals.toFixed(1), c.cold.toFixed(2)].map(v => pad(v, 11)).join(''));
  });
  console.log('  "cold hits" are hits conceded before the rolling median had ' +
              PACE_MIN + ' samples,');
  console.log('  i.e. scored by the warm-up fallback rather than by the player\'s own pace.');
}
