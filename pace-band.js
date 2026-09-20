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
}
