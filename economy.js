/* Is farming singles actually optimal? Force every hit to one tier and let
   the real base-running and the real cap decide. Perfect speed control is
   assumed, which is the upper bound of the exploit — if it does not win
   here it cannot win in a real hand. */
const T = require('/home/user/gamespeak-mvp/timed.js');
const { VOCAB, shuffle, applyPitch, bucketForTag, windowForTag, MAX_OUTS,
        AT_BATS_PER_INNING, inningOver, advanceOnHit, HIT_ADVANCE,
        hitForResponse } = T;
const N = 4000;
const sloped = a => ({ easy: Math.min(0.99, a + 0.12), medium: a, hard: Math.max(0.05, a - 0.15) });

function inning(acc, forceHit, cap) {
  const deck = shuffle(VOCAB);
  let outs = 0, ab = 0, i = 0, runs = 0, bases = [false, false, false];
  while (!inningOver(outs, ab, deck.length, cap)) {
    const w = deck[i], b = bucketForTag(w.tag), win = windowForTag(w.tag);
    ab++;
    let strikes = 0, hit = null;
    for (;;) {
      const ok = Math.random() < acc[b];
      // Answer time: instant when chasing a homer, late when farming.
      const at = forceHit === 'HOMERUN' ? win * 0.10
               : forceHit === 'TRIPLE'  ? win * 0.35
               : forceHit === 'DOUBLE'  ? win * 0.60
               : forceHit === 'SINGLE'  ? win * 0.90
               : Math.random() * win;
      const p = applyPitch(strikes, ok, ok ? at : win, win, w.tag);
      strikes = p.strikes;
      if (p.result === 'HIT') { hit = p.hit; break; }
      if (p.result === 'OUT') { outs++; break; }
    }
    if (hit) { const p = advanceOnHit(bases, HIT_ADVANCE[hit]); bases = p.bases; runs += p.runs; }
    i++;
  }
  return { runs, ab };
}

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log('RUNS PER INNING BY WHAT THE PLAYER AIMS FOR  (cap ' + AT_BATS_PER_INNING + ')');
console.log('  acc    chase homers   aim triples   aim doubles   FARM SINGLES   answer naturally');
console.log('  ' + '-'.repeat(88));
for (const a of [0.60, 0.70, 0.75, 0.85, 0.90]) {
  const acc = sloped(a);
  const row = ['HOMERUN', 'TRIPLE', 'DOUBLE', 'SINGLE', null]
    .map(f => mean(Array.from({ length: N }, () => inning(acc, f, AT_BATS_PER_INNING).runs)));
  const best = Math.max(...row);
  console.log('  ' + String(Math.round(a * 100) + '%').padEnd(7) +
    row.map(v => (v.toFixed(1) + (v === best ? ' *' : '  ')).padEnd(15)).join(''));
}
console.log('\n  * best in row. Answer time assumed: homer 10% of window, triple 35%,');
console.log('    double 60%, single 90%, natural uniform.');
