/* =========================================================================
   Inning shape, simulated against the real rules.

   Run with:  node sim-innings.js

   This does not model the rules, it calls them: applyPitch, the tier
   buckets and the real VOCAB, through the same deck shuffle the game uses.
   The only thing assumed is the player — an accuracy per bucket, swept
   across a range, because that is the one number nobody can measure yet.

   It answers three things a playtest cannot answer cheaply:
     - how many at-bats an inning actually lasts
     - how often an inning ends in three answers
     - how many DOUBLE+ words a typical inning reaches, which is where all
       18 phrases live
   ========================================================================= */

const T = require('./timed.js');
const { VOCAB, shuffle, applyPitch, bucketForTag, windowForTag, MAX_STRIKES } = T;
const MAX_OUTS = 3;
const RUNS = 4000;

// A miss is a miss whether it is a wrong answer or the clock running out;
// the rules already treat them the same, so accuracy covers both.
function playInning(accuracy) {
  const deck = shuffle(VOCAB);
  let outs = 0, atBats = 0, index = 0;
  let strikes = 0, seen = { easy: 0, medium: 0, hard: 0 };
  const endedBy = { easy: 0, other: 0 };

  while (outs < MAX_OUTS && index < deck.length) {
    const word = deck[index];
    const bucket = bucketForTag(word.tag);
    atBats++;
    seen[bucket]++;
    strikes = 0;

    for (;;) {
      const correct = Math.random() < accuracy[bucket];
      const pitch = applyPitch(strikes, correct, correct ? 10 : windowForTag(word.tag),
                               windowForTag(word.tag), word.tag);
      strikes = pitch.strikes;
      if (pitch.result === 'HIT') break;
      if (pitch.result === 'OUT') {
        outs++;
        (bucket === 'easy' ? endedBy.easy++ : endedBy.other++);
        break;
      }
      // STRIKE: same word again
    }
    index++;
  }
  return { atBats, seen, endedBy, wentTheDistance: index >= deck.length };
}

function sweep(label, accuracyFor) {
  const rows = [];
  for (const a of [0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95]) {
    const acc = accuracyFor(a);
    const lens = [], hard = [], easyOuts = [];
    for (let i = 0; i < RUNS; i++) {
      const r = playInning(acc);
      lens.push(r.atBats);
      hard.push(r.seen.medium + r.seen.hard);
      easyOuts.push(r.endedBy.easy);
    }
    lens.sort((x, y) => x - y);
    const pct = p => lens[Math.floor(p * lens.length)];
    const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
    rows.push({
      acc: a,
      p10: pct(0.10), median: pct(0.50), p90: pct(0.90),
      threeOrFewer: (lens.filter(n => n <= 3).length / lens.length * 100),
      doublePlus: mean(hard),
      easyShare: (mean(easyOuts) / 3 * 100)
    });
  }
  console.log('\n' + label);
  console.log('  acc   at-bats p10/med/p90   <=3 at-bats   DOUBLE+ seen   outs from easy words');
  console.log('  ' + '-'.repeat(84));
  for (const r of rows) {
    console.log('  ' + String(Math.round(r.acc * 100) + '%').padEnd(6) +
      `${r.p10}/${r.median}/${r.p90}`.padEnd(21) +
      (r.threeOrFewer.toFixed(1) + '%').padEnd(14) +
      r.doublePlus.toFixed(1).padEnd(15) +
      r.easyShare.toFixed(0) + '%');
  }
  return rows;
}

// Flat: the player is equally good at every tier. Unrealistic, but it is the
// clean read on what the rule does by itself.
sweep('FLAT ACCURACY — same hit rate at every tier',
      a => ({ easy: a, medium: a, hard: a }));

// Realistic: easy words are the ones you know. A learner who is 60% overall
// is not 60% on "el estadio".
sweep('SLOPED — easy is 12pts better than the sweep value, hard 15pts worse',
      a => ({ easy: Math.min(0.99, a + 0.12), medium: a, hard: Math.max(0.05, a - 0.15) }));

// What the rule itself costs. Same sweep, same deck, with the tag withheld
// from applyPitch so every miss is an ordinary strike — the rule's old
// behaviour. The difference is attributable to the rule and nothing else.
const withRule = playInning;
function playInningNoRule(accuracy) {
  const deck = shuffle(VOCAB);
  let outs = 0, atBats = 0, index = 0;
  while (outs < MAX_OUTS && index < deck.length) {
    const word = deck[index];
    const bucket = bucketForTag(word.tag);
    let strikes = 0;
    atBats++;
    for (;;) {
      const correct = Math.random() < accuracy[bucket];
      const win = windowForTag(word.tag);
      const pitch = applyPitch(strikes, correct, correct ? 10 : win, win);   // no tag
      strikes = pitch.strikes;
      if (pitch.result === 'HIT') break;
      if (pitch.result === 'OUT') { outs++; break; }
    }
    index++;
  }
  return atBats;
}

console.log('\nWHAT THE EASY-OUT RULE COSTS  (sloped accuracy, median at-bats)');
console.log('  acc    with the rule   without it   inning is this much shorter');
console.log('  ' + '-'.repeat(68));
for (const a of [0.60, 0.70, 0.75, 0.80, 0.85]) {
  const acc = { easy: Math.min(0.99, a + 0.12), medium: a, hard: Math.max(0.05, a - 0.15) };
  const on = [], off = [];
  for (let i = 0; i < RUNS; i++) { on.push(withRule(acc).atBats); off.push(playInningNoRule(acc)); }
  on.sort((x, y) => x - y); off.sort((x, y) => x - y);
  const m = xs => xs[Math.floor(xs.length / 2)];
  console.log('  ' + String(Math.round(a * 100) + '%').padEnd(7) +
    String(m(on)).padEnd(16) + String(m(off)).padEnd(13) +
    (100 - m(on) / m(off) * 100).toFixed(0) + '%');
}

// How much of the deck the easy tier is, against how much of the punishment
// it delivers. This is the number the retier decision turns on.
const mix = VOCAB.reduce((a, w) => { a[bucketForTag(w.tag)] = (a[bucketForTag(w.tag)] || 0) + 1; return a; }, {});
console.log('\nDECK MIX: easy ' + mix.easy + ', medium ' + mix.medium + ', hard ' + mix.hard +
            '  (easy is ' + (mix.easy / VOCAB.length * 100).toFixed(0) + '% of the words)');
