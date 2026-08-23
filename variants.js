/* Variant 2, additive, with the swing de-risked.

   Question success  -> +N at-bats to this inning AND the swing is earned.
   Question failure  -> an out. This is where the risk lives.
   Swing connects    -> home run.
   Swing misses all three -> nothing. The +N is already banked, so charging
                        an out for failing to collect a windfall already
                        earned would re-break the EV the +N just fixed.

   Sweeps N, because the last time a number was picked by intuition it was
   the inning cap at 15 and it was wrong by a factor of nearly three.        */
const T = require('./timed.js');
const { VOCAB, shuffle, applyPitch, bucketForTag, windowForTag, MAX_OUTS,
        AT_BATS_PER_INNING, inningOver, BONUS_STREAK, advanceOnHit, HIT_ADVANCE } = T;
const N_RUNS = 4000, CLOCK_BONUS = 0.10, S_SWING = 0.50, OFFERS = 3;
const sloped = a => ({ easy: Math.min(0.99, a + 0.12), medium: a, hard: Math.max(0.05, a - 0.15) });

function inning(acc, accept, extraAtBats, maxExtension = Infinity) {
  const deck = shuffle(VOCAB);
  let outs = 0, ab = 0, i = 0, runs = 0, bases = [false, false, false];
  let streak = 0, offersLeft = 0, cap = AT_BATS_PER_INNING;
  let offers = 0, taken = 0, homers = 0, questionOuts = 0;
  const pQ = Math.min(0.99, acc.hard + CLOCK_BONUS);
  const connects = () => Math.random() < 1 - Math.pow(1 - S_SWING, 3);

  while (!inningOver(outs, ab, deck.length, cap)) {
    const w = deck[i], b = bucketForTag(w.tag), win = windowForTag(w.tag);
    ab++;
    let strikes = 0, hit = null;
    for (;;) {
      const p = applyPitch(strikes, Math.random() < acc[b], win * 0.10, win, w.tag);
      strikes = p.strikes;
      if (p.result === 'HIT') { hit = p.hit; break; }
      if (p.result === 'OUT') { outs++; break; }
    }
    if (hit) {
      const p = advanceOnHit(bases, HIT_ADVANCE[hit]); bases = p.bases; runs += p.runs;
      streak++;
    } else streak = 0;
    i++;

    if (hit && streak >= BONUS_STREAK) {
      streak = 0;
      if (offersLeft === 0) offersLeft = OFFERS;
      offers++;
      if (!accept(outs, bases)) { offersLeft--; continue; }
      taken++; offersLeft = 0;
      if (inningOver(outs, ab, deck.length, cap)) break;
      ab++;
      if (Math.random() >= pQ) { outs++; questionOuts++; }     // the risk
      else {
        cap = Math.min(AT_BATS_PER_INNING + maxExtension, cap + extraAtBats);
        if (connects()) {                                      // pure upside
          homers++;
          const p = advanceOnHit(bases, HIT_ADVANCE.HOMERUN); bases = p.bases; runs += p.runs;
        }
      }
    }
  }
  return { runs, ab, offers, taken, homers, questionOuts };
}

const STRATS = {
  decline:   () => false,
  'at 0':    o => o === 0,
  'at 1':    o => o === 1,
  'under 2': o => o < MAX_OUTS - 1,
  always:    () => true
};
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

console.log('INNING LENGTH — the reward is denominated in the thing the cap bounds');
console.log('  +N   acc     at-bats med/p90 (decline)   at-bats med/p90 (accept under 2)   accepts');
console.log('  ' + '-'.repeat(84));
for (const extra of [0, 3, 5, 7, 10]) {
  for (const a of [0.75, 0.85, 0.90]) {
    const acc = sloped(a);
    const run = f => {
      const L = [], tk = [];
      for (let k = 0; k < N_RUNS; k++) { const r = inning(acc, f, extra); L.push(r.ab); tk.push(r.taken); }
      L.sort((x, y) => x - y);
      return { m: L[Math.floor(0.5 * L.length)], p: L[Math.floor(0.9 * L.length)], t: mean(tk) };
    };
    const d = run(() => false), u = run(o => o < MAX_OUTS - 1);
    console.log('  ' + String('+' + extra).padEnd(5) + String(Math.round(a * 100) + '%').padEnd(8) +
      (d.m + '/' + d.p).padEnd(26) + (u.m + '/' + u.p).padEnd(35) + u.t.toFixed(1));
  }
  console.log('');
}

console.log('MEAN RUNS PER INNING — variant 2 additive, swing miss costs nothing');
console.log('  +N   acc     decline   at 0     at 1     under 2   always    best');
console.log('  ' + '-'.repeat(80));
for (const extra of [0, 2, 3, 4, 5, 6, 7, 10]) {
  for (const a of [0.60, 0.75, 0.85]) {
    const acc = sloped(a);
    const res = Object.entries(STRATS).map(([n, f]) => ({
      n, runs: mean(Array.from({ length: N_RUNS }, () => inning(acc, f, extra).runs))
    }));
    const best = res.reduce((x, y) => y.runs > x.runs ? y : x);
    const margin = best.runs - res[0].runs;
    console.log('  ' + String('+' + extra).padEnd(5) + String(Math.round(a * 100) + '%').padEnd(8) +
      res.map(r => r.runs.toFixed(1).padEnd(9)).join('') +
      best.n + (best.n === 'decline' ? '' : ` +${margin.toFixed(1)}`));
  }
  console.log('');
}


/* A ceiling on the extension, so the reward cannot outgrow the bound it is
   paid in. Without one the inning grows with skill, which is exactly what
   the cap exists to stop. */
console.log('\n\nWITH A CEILING ON TOTAL EXTENSION  (+5 per bonus won)');
console.log('  ceiling  acc    runs decline   runs under 2   at-bats med/p90   accepts that pay');
console.log('  ' + '-'.repeat(86));
for (const ceiling of [5, 10, 15, 20, Infinity]) {
  for (const a of [0.75, 0.85, 0.90]) {
    const acc = sloped(a);
    const gather = f => {
      const R = [], L = [];
      for (let k = 0; k < N_RUNS; k++) { const r = inning(acc, f, 5, ceiling); R.push(r.runs); L.push(r.ab); }
      L.sort((x, y) => x - y);
      return { runs: mean(R), m: L[Math.floor(0.5 * L.length)], p: L[Math.floor(0.9 * L.length)] };
    };
    const d = gather(() => false), u = gather(o => o < MAX_OUTS - 1);
    const pays = ceiling === Infinity ? 'unlimited' : String(Math.floor(ceiling / 5));
    console.log('  ' + String(ceiling === Infinity ? 'none' : '+' + ceiling).padEnd(9) +
      String(Math.round(a * 100) + '%').padEnd(7) +
      d.runs.toFixed(1).padEnd(15) + u.runs.toFixed(1).padEnd(15) +
      (u.m + '/' + u.p).padEnd(18) + pays +
      (u.runs > d.runs ? '   accept' : '   decline'));
  }
  console.log('');
}
