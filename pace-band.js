/* PACE BAND — what the rolling median needs before it can be trusted.

   The band was rebased onto the player's own pace: a wrong catch well
   under their rolling norm is the panic that concedes a home run. That
   leaves one question the decision explicitly asked for — the first few
   slots have no baseline, so what happens until there is one, and how
   long is "until".

   This file answers five things and does not touch the mechanic:

     1. How many samples a median needs before it is worth believing.
     2. How many SLOTS that is, per fielder — which is the number that
        matters, because a beginner earns correct catches slowly.
     3. What each warm-up fallback costs, measured as disagreement with
        what the warm band would have said about the same catch.
     4. Window size: how many recent catches the median should keep.
     5. Whether the residual skill gradient in the hit mix is real
        rushing or an artifact of scoring wrong catches only.

   Run with `node pace-band.js`.
   ------------------------------------------------------------------- */

const T = require('./timed.js');
const O = require('./outfield.js');
const { LEVELS, hitForResponse } = T;
const { FIELDERS, SLOTS_BY_LEVEL, SIGMA, lognormal, FLIGHT_MS,
        PACE_BANDS, PACE_WINDOW, PACE_MIN, hitForPace, rushFactor,
        RUSH_FLOOR, makePace } = O;

const pad  = (s, w) => String(s).padStart(w);
const padr = (s, w) => String(s).padEnd(w);
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct  = (a, b) => b === 0 ? 0 : 100 * a / b;
const quant = (xs, q) => { const a = [...xs].sort((x, y) => x - y);
                           return a[Math.min(a.length - 1, Math.floor(q * a.length))]; };

/* A catch, drawn the same way the mechanic draws one. Returns the time and
   whether it was right, so the two questions stay coupled exactly as they
   are in play: rushing is what causes errors. */
function draw(p, flight = FLIGHT_MS) {
  for (;;) {
    const t = lognormal(p.rt, SIGMA);
    if (t > flight) continue;
    return { t, right: Math.random() < p.pKnow * rushFactor(t, p.rt) };
  }
}

/* ------------------------------------------------------------------
   1. HOW MANY SAMPLES A MEDIAN NEEDS
   ------------------------------------------------------------------ */
function medianAccuracy() {
  console.log('\n1. HOW WRONG IS A MEDIAN OF n SAMPLES');
  console.log(`   lognormal, sigma ${SIGMA}. |sample median / true median - 1|, over 20000 trials.`);
  console.log(padr('   n samples', 16) + ['p50 err', 'p90 err', 'within 20%'].map(h => pad(h, 12)).join(''));
  for (const n of [3, 4, 5, 6, 8, 12, 20, 30]) {
    const errs = [];
    for (let k = 0; k < 20000; k++) {
      const s = Array.from({ length: n }, () => lognormal(1000, SIGMA)).sort((a, b) => a - b);
      const h = n >> 1;
      const m = n % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
      errs.push(Math.abs(m / 1000 - 1));
    }
    console.log(padr('   ' + n, 16) +
      [quant(errs, 0.5), quant(errs, 0.9)].map(v => pad((100 * v).toFixed(1) + '%', 12)).join('') +
      pad(pct(errs.filter(e => e <= 0.20).length, errs.length).toFixed(0) + '%', 12));
  }
}

/* ------------------------------------------------------------------
   2. HOW MANY SLOTS THAT IS, PER FIELDER
   The median is built from CORRECT catches, so a fielder who is wrong
   often warms up slowly — which is the player the band most needs to
   score correctly.
   ------------------------------------------------------------------ */
function slotsToWarm() {
  console.log(`\n2. SLOTS UNTIL THE MEDIAN HAS ${PACE_MIN} CORRECT CATCHES`);
  console.log('   and how many sentences that is at the rung the fielder plays');
  console.log(padr('   fielder', 20) +
    ['med slots', 'p90 slots', 'rung slots', 'sentences'].map(h => pad(h, 12)).join(''));
  FIELDERS.forEach((p, i) => {
    const runs = [];
    for (let k = 0; k < 20000; k++) {
      let got = 0, n = 0;
      while (got < PACE_MIN) { n++; if (draw(p).right) got++; }
      runs.push(n);
    }
    const med = quant(runs, 0.5);
    console.log(padr('   ' + p.name, 20) +
      [med, quant(runs, 0.9), SLOTS_BY_LEVEL[i],
       (med / SLOTS_BY_LEVEL[i]).toFixed(1)].map(v => pad(v, 12)).join(''));
  });
}

/* ------------------------------------------------------------------
   3. WHAT EACH FALLBACK COSTS
   Measured as disagreement with the verdict the warm band would have
   reached for the same catch, using the player's true median as the
   oracle. That is the honest question: a fallback is not "wrong" in the
   abstract, it is wrong when it calls a catch differently from the rule
   the game actually runs on.
   ------------------------------------------------------------------ */
function fallbackCost() {
  console.log('\n3. WARM-UP FALLBACKS  disagreement with the warm verdict, cold catches only');
  console.log('   FLIGHT = the old fixed fraction of flight · SINGLE = concede the mildest');
  console.log('   PRIOR  = seed the median from the rung\'s own medium answer clock');
  console.log('   each cell: disagreement %, and how much of it is HARSHER than warm');
  console.log('   harsh matters more than disagreement — punishing a player for a call');
  console.log('   the system cannot yet make is the failure worth avoiding.');
  console.log(padr('   fielder / rung', 26) +
    ['FLIGHT', 'SINGLE', 'PRIOR', 'prior ms'].map(h => pad(h, 14)).join(''));

  const RANK = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3, HOMERUN: 4 };
  FIELDERS.forEach((p, i) => {
    const prior = LEVELS[i].clock.medium;
    const dis = { FLIGHT: 0, SINGLE: 0, PRIOR: 0 };
    const harsh = { FLIGHT: 0, SINGLE: 0, PRIOR: 0 };
    let n = 0;
    for (let k = 0; k < 40000; k++) {
      const c = draw(p);
      if (c.right) continue;                       // only wrong catches are scored
      n++;
      const warm = hitForPace(c.t, p.rt);          // oracle: the player's true pace
      const got = {
        FLIGHT: hitForResponse(c.t, FLIGHT_MS) || 'SINGLE',
        SINGLE: 'SINGLE',
        PRIOR:  hitForPace(c.t, prior)
      };
      for (const k2 of Object.keys(got)) {
        if (got[k2] !== warm) dis[k2]++;
        if (RANK[got[k2]] > RANK[warm]) harsh[k2]++;
      }
    }
    console.log(padr(`   ${p.name} / ${LEVELS[i].name}`, 26) +
      ['FLIGHT', 'SINGLE', 'PRIOR'].map(k2 =>
        pad(`${pct(dis[k2], n).toFixed(0)}% / ${pct(harsh[k2], n).toFixed(0)}%`, 14)).join('') +
      pad(prior, 14));
  });
}

/* ------------------------------------------------------------------
   4. WINDOW SIZE
   Too short and the median is noise; too long and it stops being this
   player's CURRENT pace. Measured against the true median.
   ------------------------------------------------------------------ */
function windowSweep() {
  console.log('\n4. ROLLING WINDOW SIZE  median error against the player\'s true pace');
  console.log('   competent fielder, steady state (well past warm-up)');
  console.log(padr('   window', 16) + ['p50 err', 'p90 err', 'verdict disagree'].map(h => pad(h, 18)).join(''));
  const p = FIELDERS[2];
  for (const w of [5, 8, 12, 20, 40]) {
    const errs = [], dis = [];
    for (let k = 0; k < 4000; k++) {
      const pace = makePace(w);
      let warmed = 0;
      while (warmed < w * 3) { const c = draw(p); if (c.right) { pace.push(c.t); warmed++; } }
      errs.push(Math.abs(pace.median() / p.rt - 1));
      const c = draw(p);
      dis.push(hitForPace(c.t, pace.median()) === hitForPace(c.t, p.rt) ? 0 : 1);
    }
    console.log(padr('   ' + w, 16) +
      [quant(errs, 0.5), quant(errs, 0.9)].map(v => pad((100 * v).toFixed(1) + '%', 18)).join('') +
      pad(pct(dis.filter(Boolean).length, dis.length).toFixed(1) + '%', 18));
  }
}

/* ------------------------------------------------------------------
   5. IS THE RESIDUAL GRADIENT REAL?
   The pace band narrowed the home-run inversion but did not flatten it.
   Either the band is still mislabelling good players, or their errors
   genuinely ARE rushed — because at high pKnow the only way to be wrong
   is to have grabbed. Two numbers separate those.
   ------------------------------------------------------------------ */
function residual() {
  console.log('\n5. IS THE RESIDUAL GRADIENT REAL RUSHING OR AN ARTIFACT');
  console.log('   ratio = catch time / the player\'s TRUE pace. If wrong catches sit below');
  console.log('   all catches, the fielder really did grab, and the band is reporting it.');
  console.log(padr('   fielder', 20) +
    ['all: med ratio', 'wrong: med', 'wrong <0.5x', 'correct-catch'].map(h => pad(h, 16)).join(''));
  console.log(padr('', 20) + pad('', 16) + pad('', 16) + pad('', 16) + pad('median bias', 16));
  for (const p of FIELDERS) {
    const all = [], wrong = [], right = [];
    for (let k = 0; k < 60000; k++) {
      const c = draw(p);
      all.push(c.t / p.rt);
      (c.right ? right : wrong).push(c.t / p.rt);
    }
    console.log(padr('   ' + p.name, 20) +
      [quant(all, 0.5).toFixed(2) + 'x',
       quant(wrong, 0.5).toFixed(2) + 'x',
       pct(wrong.filter(r => r <= PACE_BANDS[0].within).length, wrong.length).toFixed(0) + '%',
       '+' + (100 * (quant(right, 0.5) - 1)).toFixed(0) + '%'].map(v => pad(v, 16)).join(''));
  }
  console.log('   "correct-catch median bias" is how much slower the median of CORRECT');
  console.log('   catches runs than the player\'s true median — the cost of building the');
  console.log('   pace from correct catches only, which inflates every ratio downward.');
}

/* ------------------------------------------------------------------
   6. ARE THE THRESHOLDS RIGHT?
   0.50 / 0.75 / 1.00 were proposed, not derived. What mix do they give,
   and what would a flatter alternative give?
   ------------------------------------------------------------------ */
function thresholds() {
  console.log('\n6. BAND THRESHOLDS  conceded mix at each candidate set');
  const SETS = {
    'proposed  .50/.75/1.00': [0.50, 0.75, 1.00],
    'tighter   .40/.65/0.90': [0.40, 0.65, 0.90],
    'tightest  .35/.55/0.80': [0.35, 0.55, 0.80]
  };
  for (const [label, th] of Object.entries(SETS)) {
    console.log(`   ${label}`);
    console.log(padr('', 22) + ['SINGLE', 'DOUBLE', 'TRIPLE', 'HOMERUN'].map(h => pad(h, 10)).join(''));
    for (const p of FIELDERS) {
      const m = { SINGLE: 0, DOUBLE: 0, TRIPLE: 0, HOMERUN: 0 };
      let n = 0;
      for (let k = 0; k < 40000; k++) {
        const c = draw(p);
        if (c.right) continue;
        const r = c.t / p.rt;
        m[r <= th[0] ? 'HOMERUN' : r <= th[1] ? 'TRIPLE' : r <= th[2] ? 'DOUBLE' : 'SINGLE']++;
        n++;
      }
      console.log(padr('     ' + p.name, 22) +
        ['SINGLE', 'DOUBLE', 'TRIPLE', 'HOMERUN'].map(k => pad(pct(m[k], n).toFixed(0) + '%', 10)).join(''));
    }
  }
}

/* ------------------------------------------------------------------
   7. WHAT THE MEDIAN IS BUILT FROM
   The decision said time-to-CORRECT-catch, on the reasoning that a wrong
   catch is not evidence of how long this player needs. Intuitive, and
   the data disagrees: a wrong catch is not evidence about KNOWLEDGE, but
   it is perfectly good evidence about TIMING, and the median is a timing
   estimate. Dropping wrong catches drops the fast tail, which is exactly
   the part that sets the norm.
   ------------------------------------------------------------------ */
function paceSource() {
  console.log('\n7. WHAT THE ROLLING MEDIAN IS BUILT FROM');
  console.log('   home-run share of conceded hits, 5-slot sentence, grace 2');
  console.log(padr('   fielder', 20) +
    ['FLIGHT band', 'CORRECT only', 'ALL catches', 'oracle'].map(h => pad(h, 14)).join(''));
  const hr = m => { const n = Object.values(m).reduce((a, b) => a + b, 0);
                    return pct(m.HOMERUN, n); };
  const spread = [];
  for (const p of FIELDERS) {
    const f = O.cell(p, 5, FLIGHT_MS, 'RESOLVE', 3000, 2, { band: 'FLIGHT' });
    const c = O.cell(p, 5, FLIGHT_MS, 'RESOLVE', 3000, 2, { band: 'PACE', paceFrom: 'CORRECT' });
    const a = O.cell(p, 5, FLIGHT_MS, 'RESOLVE', 3000, 2, { band: 'PACE', paceFrom: 'ALL' });
    // oracle: the player's true pace, no estimation error at all
    let hrN = 0, n = 0;
    for (let k = 0; k < 40000; k++) {
      const d = draw(p);
      if (d.right) continue;
      n++; if (hitForPace(d.t, p.rt) === 'HOMERUN') hrN++;
    }
    spread.push([hr(f.mix), hr(c.mix), hr(a.mix), pct(hrN, n)]);
    console.log(padr('   ' + p.name, 20) +
      [hr(f.mix), hr(c.mix), hr(a.mix), pct(hrN, n)]
        .map(v => pad(v.toFixed(0) + '%', 14)).join(''));
  }
  const g = i => (spread[4][i] / spread[0][i]).toFixed(1) + 'x';
  console.log(padr('   SPREAD fluent/beginner', 20) +
    [0, 1, 2, 3].map(i => pad(g(i), 14)).join(''));
  console.log('   Flat is the goal. CORRECT-only lands halfway between the band it');
  console.log('   replaced and the oracle; ALL-catches lands on the oracle.');
}

/* ------------------------------------------------------------------
   8. DOES THE PACE SURVIVE THE HALF-INNING
   Section 2 says a beginner needs ~13 slots to earn 5 correct catches,
   and a Rookie half-inning is 3 sentences of 3 slots. Those numbers do
   not fit inside each other, which decides the persistence question.
   ------------------------------------------------------------------ */
function persistence() {
  console.log('\n8. DOES WARM-UP FIT INSIDE A HALF-INNING');
  console.log(padr('   rung / fielder', 26) +
    ['slots needed', 'slots in half', 'fits?', 'cold hits'].map(h => pad(h, 15)).join(''));
  FIELDERS.forEach((p, i) => {
    const slots = SLOTS_BY_LEVEL[i];
    const runs = [];
    for (let k = 0; k < 8000; k++) {
      let got = 0, n = 0;
      while (got < PACE_MIN) { n++; if (draw(p).right) got++; }
      runs.push(n);
    }
    const need = quant(runs, 0.5);
    // a clean half-inning is 3 sentences with no errors; with errors it is more
    const floor = 3 * slots;
    const c = O.cell(p, slots, FLIGHT_MS, 'RESOLVE', 3000, 2, { band: 'PACE' });
    console.log(padr(`   ${LEVELS[i].name} / ${p.name}`, 26) +
      [need, `${floor}+`, need <= floor ? 'yes' : 'NO',
       c.cold.toFixed(2)].map(v => pad(v, 15)).join(''));
  });
  console.log('   "slots in half" is the floor — three sentences with no wrong catches.');
  console.log('   Where warm-up does not fit, the band never engages inside one inning');
  console.log('   and the fallback scores every hit the player gives up.');
}

/* ------------------------------------------------------------------
   9. A STORED MEDIAN THAT IS WRONG
   Persistence across sessions raises two ways the stored value can be
   off: the player has improved since (stale), or it was earned on a
   different rung where the reading task is a different size. Both are
   the same measurement — a median off by some factor — so sweep the
   factor rather than the story.
   ------------------------------------------------------------------ */
function staleMedian() {
  console.log('\n9. A STORED MEDIAN THAT IS OFF BY SOME FACTOR');
  console.log('   verdict disagreement against the player\'s true pace, and how much');
  console.log('   of it is HARSHER than the truth. competent fielder.');
  console.log(padr('   stored median', 20) +
    ['disagree', 'harsher', 'kinder'].map(h => pad(h, 12)).join(''));
  const RANK = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3, HOMERUN: 4 };
  const p = FIELDERS[2];
  for (const f of [0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 2.0]) {
    let dis = 0, harsh = 0, kind = 0, n = 0;
    for (let k = 0; k < 60000; k++) {
      const c = draw(p);
      if (c.right) continue;
      n++;
      const truth = hitForPace(c.t, p.rt);
      const got   = hitForPace(c.t, p.rt * f);
      if (got !== truth) dis++;
      if (RANK[got] > RANK[truth]) harsh++;
      if (RANK[got] < RANK[truth]) kind++;
    }
    const label = f === 1 ? '  1.00x (correct)' : `  ${f.toFixed(2)}x`;
    console.log(padr(' ' + label, 20) +
      [dis, harsh, kind].map(v => pad(pct(v, n).toFixed(0) + '%', 12)).join(''));
  }
  console.log('   The error is one-directional, which decides the policy. A median');
  console.log('   stored too FAST (below 1.00x) makes every catch look slow against the');
  console.log('   norm: kinder, never harsh. Too SLOW makes ordinary catches look like');
  console.log('   panic, and is harsh in every single disagreement.');
}

/* ------------------------------------------------------------------
   10. HOW A WRONG STORED MEDIAN ACTUALLY DECAYS

   The first version of this measured "catches until the rolling median
   is within 10% of the truth" and reported ~17 regardless of how the
   window was seeded, which read as "seed depth does not matter". It was
   measuring the sampling noise floor: a median of 20 lognormal samples
   is 8% off at p50 whatever it was seeded with, so the threshold was
   reached at the same moment in every arm. Running the same sweep with
   a CORRECT seed as a control showed the error sitting at exactly 0%
   while the stale arms sat at exactly 30% — nothing was healing at all
   for the first ten catches, and the metric could not see it.

   The truth is worse and more specific. Seeding the window with N
   identical copies puts a solid block of the same value in the middle of
   the sorted buffer, so the median IS that value — exactly, with zero
   variance — until enough real catches land above it to push the
   midpoint out. The stale value does not decay. It holds, then snaps.
   ------------------------------------------------------------------ */
function healing() {
  console.log('\n10. HOW A WRONG STORED MEDIAN ACTUALLY DECAYS');
  console.log(`   median error vs truth after k real catches. competent, window ${PACE_WINDOW}.`);
  console.log('   stored value is 1.5x the truth — the harsh direction.');
  console.log(padr('   seed depth', 16) +
    [0, 2, 5, 10, 20].map(k => pad(`k=${k}`, 12)).join(''));
  const p = FIELDERS[2];
  for (const depth of [1, 2, 4, 8, 20]) {
    const cells = [0, 2, 5, 10, 20].map(k => {
      const errs = [];
      for (let trial = 0; trial < 3000; trial++) {
        const pace = makePace(PACE_WINDOW, Array(depth).fill(p.rt * 1.5));
        for (let j2 = 0; j2 < k; j2++) pace.push(draw(p).t);
        errs.push(Math.abs(pace.median() / p.rt - 1));
      }
      return (100 * quant(errs, 0.5)).toFixed(0) + '%';
    });
    console.log(padr('   ' + depth, 16) + cells.map(c => pad(c, 12)).join(''));
  }
  console.log(`   the floor is ~8%: a median of ${PACE_WINDOW} real samples is that far off anyway.`);

  /* The alternative to seeding: keep the stored median as the pace value
     while the real window fills, then drop it entirely. The stale value
     then governs exactly PACE_MIN catches instead of pinning the median
     for as long as the seed block survives. */
  console.log('\n   POLICY COMPARISON  verdicts scored against a 1.5x-stale stored median');
  console.log(`   before the window has ${PACE_MIN} real catches of its own`);
  console.log(padr('   policy', 38) +
    ['harsh verdicts', 'scored cold'].map(h => pad(h, 16)).join(''));
  const RANK = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3, HOMERUN: 4 };
  /* The verdict a policy reaches, as a hit name rather than a pace value,
     so "concede a SINGLE" can be expressed at all. Passing Infinity as a
     pace does NOT mean that — t/Infinity is 0, which is the home-run
     band, the exact opposite. */
  const measure = (label, verdictFor, span) => {
    let harsh = 0, n = 0, cold = 0;
    for (let trial = 0; trial < 6000; trial++) {
      const pace = makePace(PACE_WINDOW, verdictFor.seed());
      for (let k = 0; k < span; k++) {
        const c = draw(p);
        if (!c.right) {
          n++;
          if (pace.n() < PACE_MIN) cold++;
          if (RANK[verdictFor.verdict(pace, c.t)] > RANK[hitForPace(c.t, p.rt)]) harsh++;
        }
        pace.push(c.t);
      }
    }
    console.log(padr('   ' + label, 38) +
      pad(pct(harsh, n).toFixed(0) + '%', 16) + pad(pct(cold, n).toFixed(0) + '%', 16));
  };
  const STALE = p.rt * 1.5;
  measure(`seed ${PACE_MIN} copies of it`, {
    seed: () => Array(PACE_MIN).fill(STALE),
    verdict: (pc, t) => hitForPace(t, pc.median())
  }, 20);
  measure('seed 1 copy of it', {
    seed: () => [STALE],
    verdict: (pc, t) => hitForPace(t, pc.median())
  }, 20);
  measure('use it, then drop it', {
    seed: () => [],
    verdict: (pc, t) => hitForPace(t, pc.n() >= PACE_MIN ? pc.median() : STALE)
  }, 20);
  measure('SINGLE while cold, no store', {
    seed: () => [],
    verdict: (pc, t) => pc.n() >= PACE_MIN ? hitForPace(t, pc.median()) : 'SINGLE'
  }, 20);

  /* A player who is improving gets FASTER, so their stored median is too
     SLOW, which section 9 shows is the harsh direction in every single
     disagreement. Staleness is therefore not a symmetric risk to hedge —
     it has a known sign, and a cap on the harsh end handles it exactly.
     CAP keeps the stored value's texture and refuses to let it concede
     more than a double until the real window has warmed. */
  const CAP = 'DOUBLE';
  const capped = v => RANK[v] > RANK[CAP] ? CAP : v;
  measure(`use it, capped at ${CAP} while cold`, {
    seed: () => [],
    verdict: (pc, t) => pc.n() >= PACE_MIN
      ? hitForPace(t, pc.median()) : capped(hitForPace(t, STALE))
  }, 20);
  measure(`seed 1, capped at ${CAP} while cold`, {
    seed: () => [STALE],
    verdict: (pc, t) => pc.n() >= PACE_MIN
      ? hitForPace(t, pc.median()) : capped(hitForPace(t, pc.median()))
  }, 20);
}

/* ---------------------------------------------------------------------
   THE ADOPTED PERSISTENCE POLICY, written from the numbers above.

   STORED SHAPE
     { v: 1, median: <ms>, samples: <n>, rung: <index>, updated: <epoch> }

   Written after a half-inning, only when the window holds at least
   PACE_MIN real samples. Read once at start.

   EVERY ACCESS GUARDED, same discipline as the mute key. A private
   window throws on write, cleared storage returns null, and a partial
   write parses to garbage. The game has to play correctly when the read
   gives nothing back, which is not an edge case — it is every new
   player's first inning.

   VALIDATE ON READ, in order: wrong version, not a finite positive
   number, or fewer than PACE_MIN samples behind it, and the value is
   discarded outright. A different rung or an old timestamp are NOT
   discard conditions; both are handled by the cap below, because
   throwing the value away costs more than keeping it (44% of a
   beginner's conceded hits go unscored with no stored median at all).

   NEVER SEED THE WINDOW WITH COPIES OF IT. Seeding PACE_MIN copies puts
   a block of identical values in the middle of the sorted buffer, and
   the median IS that value — exactly, with no variance — until enough
   real catches push the midpoint past the block. It measured 59% harsh
   verdicts, the worst of every option, and it does something worse than
   that: the window reports itself as warm, so the cold path never fires
   and nothing in the game can tell it is running on a stale number.
   Keep the stored value BESIDE the window, use it while the window
   fills, drop it the moment the window has PACE_MIN real catches.

   CAP THE HARSH END WHILE COLD. Staleness has a known sign. A player who
   improves gets faster, so a stored median is too SLOW, and section 9
   shows too-slow is harsh in 100% of its disagreements — never kind.
   That is not a symmetric risk to hedge, it is a one-directional error
   with a one-directional fix: while cold, no verdict from the stored
   value may exceed DOUBLE. A 1.5x-stale median concedes 37% harsh
   verdicts uncapped and 16% capped, against 7% for not persisting at
   all — so the cap buys back most of the safety and keeps the texture.

   AND IT HEALS ITSELF. Whatever the stored value was, the rolling window
   is within ~8% of the truth after about 20 real catches, which is the
   sampling floor rather than anything to do with the stored value. So
   staleness is bounded by one inning of play, not by how long ago the
   player last opened the game.
   ------------------------------------------------------------------- */

if (require.main === module) {
  console.log('PACE BAND — what the rolling median needs before it can be trusted');
  console.log(`  bands ${PACE_BANDS.map(b => `${b.hit} <=${b.within}x`).join(' · ')}`);
  console.log(`  window ${PACE_WINDOW} correct catches, live after ${PACE_MIN}`);
  medianAccuracy();
  slotsToWarm();
  fallbackCost();
  windowSweep();
  residual();
  thresholds();
  paceSource();
  persistence();
  staleMedian();
  healing();
}
