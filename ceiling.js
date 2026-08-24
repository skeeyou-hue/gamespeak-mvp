/* Does the extension ceiling create a trap?

   MAX_INNING_EXTENSION = 10 with BONUS_EXTRA_AT_BATS = 5 means two won
   bonuses exhaust it. Every offer after that pays nothing in at-bats — it
   pays in the home run alone, which is precisely the variant that was
   measured dominated before the reward was moved to at-bats: at 85% a bonus
   at-bat is a 70% home-run machine where an ordinary one is 97.9%.

   The question is not whether it is dominated in theory. It is how many
   offers land on the wrong side of the ceiling, and what accepting them
   costs, against the same loop the other sims drive.                       */
const T = require('./timed.js');
const { VOCAB, shuffle, applyPitch, bucketForTag, windowForTag, MAX_OUTS,
        AT_BATS_PER_INNING, inningOver, BONUS_STREAK, extendInning,
        BONUS_EXTRA_AT_BATS, MAX_INNING_EXTENSION, BONUS_STREAK_OFFERS,
        advanceOnHit, HIT_ADVANCE } = T;

const N_RUNS = 8000, CLOCK_BONUS = 0.10, S_SWING = 0.50;
const sloped = a => ({ easy: Math.min(0.99, a + 0.12), medium: a, hard: Math.max(0.05, a - 0.15) });
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const CEIL = AT_BATS_PER_INNING + MAX_INNING_EXTENSION;

// suppress: the offer is withheld once the extension is spent (the proposal).
// otherwise the offer is shown and `accept` decides, knowing whether it pays.
function inning(acc, accept, suppress) {
  const deck = shuffle(VOCAB);
  let outs = 0, ab = 0, i = 0, runs = 0, bases = [false, false, false];
  let streak = 0, offersLeft = 0, cap = AT_BATS_PER_INNING;
  let offersPre = 0, offersPost = 0, takenPost = 0, outsPost = 0, homersPost = 0;
  let withheld = 0, reached = false;
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

    if (!hit || streak < BONUS_STREAK) continue;
    streak = 0;
    const bound = cap >= CEIL;                 // the extension is spent
    if (bound) reached = true;
    if (bound && suppress) { withheld++; continue; }
    if (offersLeft === 0) offersLeft = BONUS_STREAK_OFFERS;
    bound ? offersPost++ : offersPre++;
    if (!accept(outs, bases, bound)) { offersLeft--; continue; }
    offersLeft = 0;
    if (inningOver(outs, ab, deck.length, cap)) break;
    ab++;                                       // the bonus question is an at-bat
    if (Math.random() >= pQ) { outs++; if (bound) outsPost++; }
    else {
      cap = extendInning(cap);
      if (connects()) {
        if (bound) homersPost++;
        const p = advanceOnHit(bases, HIT_ADVANCE.HOMERUN); bases = p.bases; runs += p.runs;
      }
    }
  }
  return { runs, ab, offersPre, offersPost, takenPost, outsPost, homersPost, withheld, reached };
}

const under2 = o => o < MAX_OUTS - 1;
const gather = (acc, accept, suppress) => {
  const R = [], L = [], rows = [];
  for (let k = 0; k < N_RUNS; k++) {
    const r = inning(acc, accept, suppress);
    R.push(r.runs); L.push(r.ab); rows.push(r);
  }
  L.sort((x, y) => x - y);
  return {
    runs: mean(R), ab: L[Math.floor(0.5 * L.length)],
    pre: mean(rows.map(r => r.offersPre)), post: mean(rows.map(r => r.offersPost)),
    outsPost: mean(rows.map(r => r.outsPost)), hrPost: mean(rows.map(r => r.homersPost)),
    withheld: mean(rows.map(r => r.withheld)),
    reached: rows.filter(r => r.reached).length / rows.length
  };
};

console.log(`Ceiling at +${MAX_INNING_EXTENSION} on a cap of ${AT_BATS_PER_INNING}, ` +
            `+${BONUS_EXTRA_AT_BATS} a bonus — ${MAX_INNING_EXTENSION / BONUS_EXTRA_AT_BATS} paying wins per inning.`);
console.log(`${N_RUNS} innings a cell, accepting under 2 outs.\n`);

console.log('HOW OFTEN THE CEILING BINDS, AND HOW MANY OFFERS LAND BEHIND IT');
console.log('  acc    innings that hit it   offers before   offers after   share of offers dead');
console.log('  ' + '-'.repeat(84));
for (const a of [0.60, 0.75, 0.85, 0.90, 0.95]) {
  const g = gather(sloped(a), under2, false);
  const share = g.post / (g.pre + g.post);
  console.log('  ' + String(Math.round(a * 100) + '%').padEnd(7) +
    (100 * g.reached).toFixed(1).padStart(8) + '%' + ' '.repeat(12) +
    g.pre.toFixed(1).padEnd(16) + g.post.toFixed(1).padEnd(15) +
    (100 * share).toFixed(0) + '%');
}

console.log('\n\nWHAT THE TRAP COSTS — same player, three postures at the ceiling');
console.log('  acc    accept anyway   decline when bound   offer withheld   cost of the trap');
console.log('  ' + '-'.repeat(84));
for (const a of [0.60, 0.75, 0.85, 0.90, 0.95]) {
  const acc = sloped(a);
  const naive = gather(acc, under2, false);
  const savvy = gather(acc, (o, b, bound) => !bound && under2(o), false);
  const supp  = gather(acc, under2, true);
  console.log('  ' + String(Math.round(a * 100) + '%').padEnd(7) +
    naive.runs.toFixed(2).padEnd(16) + savvy.runs.toFixed(2).padEnd(21) +
    supp.runs.toFixed(2).padEnd(17) +
    (naive.runs - savvy.runs >= 0 ? '+' : '') + (naive.runs - savvy.runs).toFixed(2) + ' runs');
}

console.log('\n\nWHAT A POST-CEILING ACCEPT ACTUALLY BUYS AND SPENDS, PER INNING');
console.log('  acc    dead offers   outs given up   home runs won   outs per home run');
console.log('  ' + '-'.repeat(84));
for (const a of [0.60, 0.75, 0.85, 0.90, 0.95]) {
  const g = gather(sloped(a), under2, false);
  console.log('  ' + String(Math.round(a * 100) + '%').padEnd(7) +
    g.post.toFixed(1).padEnd(14) + g.outsPost.toFixed(2).padEnd(16) +
    g.hrPost.toFixed(2).padEnd(16) +
    (g.hrPost > 0 ? (g.outsPost / g.hrPost).toFixed(2) : '—'));
}
