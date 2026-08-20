/* =========================================================================
   Tests for Tiered Timed Pitch's rule layer.

   Run with:  node timed-test.js
   No browser needed — every rule in timed.js is a pure function, so the
   whole mode can be checked without rendering anything.
   ========================================================================= */

const T = require('./timed.js');

let passed = 0, failed = 0;
const assert = (cond, msg) => {
  if (cond) { passed++; console.log('ok   - ' + msg); }
  else      { failed++; console.error('FAIL - ' + msg); }
};
const section = title => console.log('\n# ' + title);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ===================================================================
   A. TIERS SET THE CLOCK
   =================================================================== */
section('Tiers set the clock');

for (const [tag, bucket, ms] of [
  ['WALK', 'easy', 3000], ['SINGLE', 'easy', 3000], ['DOUBLE', 'medium', 4000],
  ['TRIPLE', 'hard', 5000], ['HOMERUN', 'hard', 5000]
]) {
  assert(T.windowForTag(tag) === ms && T.bucketForTag(tag) === bucket,
         `${tag.padEnd(7)} -> ${bucket.padEnd(6)} ${ms / 1000}s`);
}
assert(new Set(Object.values(T.TIMED_TIERS).map(t => t.windowMs)).size === 3,
       'three buckets, three timers — no tier gets its own special window');

/* ===================================================================
   B. SPEED SETS THE HIT
   Boundaries matter most: each band is inclusive of its upper edge.
   =================================================================== */
section('Speed sets the hit (4s window)');

for (const [ms, hit] of [
  [0, 'HOMERUN'], [999, 'HOMERUN'], [1000, 'HOMERUN'],
  [1001, 'TRIPLE'], [1800, 'TRIPLE'],
  [1801, 'DOUBLE'], [2800, 'DOUBLE'],
  [2801, 'SINGLE'], [3999, 'SINGLE'], [4000, 'SINGLE'],
  [4001, null], [9999, null]
]) {
  assert(T.hitForResponse(ms, 4000) === hit,
         `${String(ms).padStart(4)}ms of 4000 -> ${hit === null ? 'too late' : hit}`);
}

section('The bands scale with the window, not the clock');

assert(T.hitForResponse(750, 3000) === 'HOMERUN' && T.hitForResponse(751, 3000) === 'TRIPLE',
       'an easy word needs 750ms for a homer (25% of 3s)');
assert(T.hitForResponse(1250, 5000) === 'HOMERUN' && T.hitForResponse(1251, 5000) === 'TRIPLE',
       'a hard word gets 1250ms for the same homer (25% of 5s)');
assert(T.hitForResponse(1000, 3000) === 'TRIPLE' && T.hitForResponse(1000, 5000) === 'HOMERUN',
       'the same 1000ms is a triple on an easy word, a homer on a hard one');
assert(T.hitForResponse(3001, 3000) === null && T.hitForResponse(3001, 5000) === 'DOUBLE',
       'and it is too late on an easy word while still in play on a hard one');
assert(T.hitForResponse(-1, 4000) === null && T.hitForResponse(NaN, 4000) === null,
       'nonsense elapsed times are not hits');

/* ===================================================================
   C. ONE PITCH AT A TIME
   =================================================================== */
section('Pitches, strikes, and the third one');

for (const [strikes, correct, ms, expect, label] of [
  [0, true,  500,  { strikes: 0, result: 'HIT',    hit: 'HOMERUN' }, 'fast and right: a hit, count untouched'],
  [0, true,  3000, { strikes: 0, result: 'HIT',    hit: 'SINGLE'  }, 'right at the edge: still a hit, just a single'],
  [0, false, 800,  { strikes: 1, result: 'STRIKE', hit: null      }, 'wrong answer is a strike, not an out'],
  [1, false, 800,  { strikes: 2, result: 'STRIKE', hit: null      }, 'second wrong answer: strike two'],
  [2, false, 800,  { strikes: 3, result: 'OUT',    hit: null      }, 'third strike ends the at-bat'],
  [0, true,  4001, { strikes: 1, result: 'STRIKE', hit: null      }, 'correct but late is a strike, same as a timeout'],
  [2, true,  4001, { strikes: 3, result: 'OUT',    hit: null      }, 'correct but late on 0-2 is the third strike'],
  [2, true,  300,  { strikes: 2, result: 'HIT',    hit: 'HOMERUN' }, 'you can still homer on an 0-2 count']
]) {
  assert(same(T.applyPitch(strikes, correct, ms, 4000), expect), label);
}

assert(T.MAX_STRIKES === 3, 'three strikes to an out');

// A whole at-bat, pitch by pitch.
let count = 0, log = [];
for (const [correct, ms] of [[false, 900], [true, 5000], [true, 400]]) {
  const p = T.applyPitch(count, correct, ms, 4000);
  count = p.strikes;
  log.push(p.result);
}
assert(same(log, ['STRIKE', 'STRIKE', 'HIT']) && count === 2,
       'a three-pitch at-bat: strike, strike, then a homer to end it');

/* ===================================================================
   D. BANKING A POWER SWING
   =================================================================== */
section('Banking — three hits in a row, any type');

for (const [roll, life] of [[0, 1], [0.33, 1], [0.34, 2], [0.66, 2], [0.67, 3], [0.999, 3]]) {
  assert(T.rollBonusLife(roll) === life, `a roll of ${roll} banks a swing for ${life}`);
}

let b = { bonus: null, streak: 0 };
for (const [i, expectBanked] of [[1, false], [2, false], [3, true]]) {
  b = T.applyAtBatToBonus(b.bonus, b.streak, 'HIT', 0.5);
  assert(b.banked === expectBanked,
         `${i} hit${i > 1 ? 's' : ''} in a row: ${expectBanked ? 'banked' : 'nothing yet'}`);
}
assert(b.bonus.atBatsLeft === 2 && b.streak === 0, 'banked for 2 at-bats, streak reset');

// Any hit type counts — that's the whole point of the change.
let anyType = { bonus: null, streak: 0 };
for (const hit of ['SINGLE', 'HOMERUN', 'DOUBLE']) {
  anyType = T.applyAtBatToBonus(anyType.bonus, anyType.streak, 'HIT', 0.5);
}
assert(anyType.banked, 'a single, a homer and a double bank a swing just the same');

assert(T.applyAtBatToBonus(null, 2, 'OUT', 0).streak === 0, 'an out breaks the streak');
assert(!T.applyAtBatToBonus(null, 2, 'OUT', 0).banked, 'and banks nothing');

section('Expiry');

for (const life of [1, 2, 3]) {
  let bonus = { atBatsLeft: life }, atBats = 0;
  while (bonus && atBats <= 6) { bonus = T.applyAtBatToBonus(bonus, 0, 'OUT', 0).bonus; atBats++; }
  assert(atBats === life, `a swing banked for ${life} survives exactly ${life} later at-bat${life > 1 ? 's' : ''}`);
}
assert(T.applyAtBatToBonus({ atBatsLeft: 1 }, 2, 'HIT', 0.999).bonus.atBatsLeft === 3,
       're-banking replaces an about-to-expire swing with a fresh one');
assert(T.applyAtBatToBonus({ atBatsLeft: 3 }, 0, 'HIT', 0).bonus.atBatsLeft === 2,
       'a hit that does not bank still ages the swing');

/* ===================================================================
   E. STATE SHAPE
   =================================================================== */
section('State shape');

const ab = T.newAtBat('TRIPLE');
assert(ab.windowMs === 5000 && ab.strikes === 0 && !ab.over,
       'a new at-bat carries its window and an empty count');

const st = T.newTimedState(1);
assert(st.mode === 'timed' && st.inning === 1, 'state knows which mode and inning it is');
assert(st.hitStreak === 0 && st.bonus === null && st.swing === null,
       'bonus fields start empty');
assert(same(st.bases, [false, false, false]) && st.outs === 0 && st.runs === 0,
       'bases, outs and runs start clean');
assert('atBat' in st, 'there is a slot for the at-bat in progress');
assert(!('strikes' in st), 'strikes live on the at-bat, not the inning — they reset with it');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
