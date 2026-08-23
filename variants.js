const T = require('/home/user/gamespeak-mvp/timed.js');
const { VOCAB, shuffle, applyPitch, bucketForTag, windowForTag, MAX_OUTS,
        AT_BATS_PER_INNING, inningOver, BONUS_STREAK, advanceOnHit, HIT_ADVANCE } = T;
const N = 4000, CLOCK_BONUS = 0.10, S_SWING = 0.50, OFFERS = 3;
const sloped = a => ({ easy: Math.min(0.99, a + 0.12), medium: a, hard: Math.max(0.05, a - 0.15) });

// A declined bank persists and is re-offered by the next two 3-streaks.
// Offers happen only on streak completion, never per at-bat.
function inning(acc, accept, variant) {
  const deck = shuffle(VOCAB);
  let outs = 0, ab = 0, i = 0, runs = 0, bases = [false, false, false];
  let streak = 0, offersLeft = 0, cap = AT_BATS_PER_INNING;
  let offers = 0, taken = 0, homers = 0;
  const pQ = Math.min(0.99, acc.hard + CLOCK_BONUS);
  const connects = () => Math.random() < 1 - Math.pow(1 - S_SWING, 3);

  while (!inningOver(outs, ab, deck.length, cap)) {
    const w = deck[i], b = bucketForTag(w.tag), win = windowForTag(w.tag);
    ab++;
    let strikes = 0, hit = null;
    for (;;) {
      const ok = Math.random() < acc[b];
      const p = applyPitch(strikes, ok, ok ? win * 0.10 : win, win, w.tag);  // chasing homers
      strikes = p.strikes;
      if (p.result === 'HIT') { hit = p.hit; break; }
      if (p.result === 'OUT') { outs++; break; }
    }
    if (hit) {
      const p = advanceOnHit(bases, HIT_ADVANCE[hit]); bases = p.bases; runs += p.runs;
      streak++;
    } else { streak = 0; }
    i++;

    // A completed streak either banks or re-offers an existing bank.
    if (hit && streak >= BONUS_STREAK) {
      streak = 0;
      if (offersLeft === 0) offersLeft = OFFERS;
      offers++;
      if (accept(outs, bases)) {
        taken++; offersLeft = 0;
        if (inningOver(outs, ab, deck.length, cap)) break;
        ab++;                                   // the bonus is its own at-bat
        const wonQuestion = Math.random() < pQ;
        if (!wonQuestion) { outs++; }
        else {
          if (variant === 'extraAtBats') cap += 5;
          if (!connects()) outs++;
          else {
            homers++;
            const adv = variant === 'triple' ? HIT_ADVANCE.TRIPLE : HIT_ADVANCE.HOMERUN;
            const p = advanceOnHit(bases, adv); bases = p.bases; runs += p.runs;
            if (variant === 'keepStreak') streak = BONUS_STREAK - 1;
          }
        }
      } else {
        offersLeft--;
      }
    }
  }
  return { runs, ab, offers, taken, homers };
}

const STRATS = {
  'decline everything': () => false,
  'accept at 0 outs only': o => o === 0,
  'accept at 1 out only':  o => o === 1,
  'accept under 2 outs':   o => o < MAX_OUTS - 1
};
const VARIANTS = {
  'baseline (home run)':    'homer',
  '1. bases-clearing triple': 'triple',
  '2. +5 at-bats on question': 'extraAtBats',
  '3. home run, streak kept': 'keepStreak'
};

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
for (const [vname, variant] of Object.entries(VARIANTS)) {
  console.log('\n' + vname.toUpperCase());
  console.log('  acc    decline   accept@0   accept@1   accept<2   best            offers/inn');
  console.log('  ' + '-'.repeat(84));
  for (const a of [0.60, 0.75, 0.85]) {
    const acc = sloped(a);
    const res = Object.entries(STRATS).map(([n, f]) => {
      const rs = [], os = [];
      for (let k = 0; k < N; k++) { const r = inning(acc, f, variant); rs.push(r.runs); os.push(r.offers); }
      return { n, runs: mean(rs), offers: mean(os) };
    });
    const best = res.reduce((x, y) => y.runs > x.runs ? y : x);
    console.log('  ' + String(Math.round(a * 100) + '%').padEnd(7) +
      res.map(r => r.runs.toFixed(1).padEnd(11)).join('') +
      (best.n + ' ' + best.runs.toFixed(1)).padEnd(16) +
      res[0].offers.toFixed(1));
  }
}
