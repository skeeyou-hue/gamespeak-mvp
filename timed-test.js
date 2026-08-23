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
section('The shared word list');

// VOCAB lives in rules.js and both modes read it, so it is checked here
// once rather than twice with two different opinions.
const TIERS = ['WALK', 'SINGLE', 'DOUBLE', 'TRIPLE', 'HOMERUN'];
const mix = T.VOCAB.reduce((a, w) => { a[w.tag] = (a[w.tag] || 0) + 1; return a; }, {});

assert(T.VOCAB.length >= 100, `${T.VOCAB.length} words in the list`);
assert(TIERS.every(t => mix[t] > 0), `every tier is populated (${JSON.stringify(mix)})`);
assert(Object.keys(mix).every(t => TIERS.includes(t)),
       'and no word carries a tier the game does not know');

// The tiers are weighted by how hard the words actually are, not split
// evenly. Easy outnumbers hard on purpose — this is a teaching app.
const easy = mix.WALK + mix.SINGLE, medium = mix.DOUBLE, hard = mix.TRIPLE + mix.HOMERUN;
assert(easy + medium + hard === T.VOCAB.length,
       `the buckets account for every word (easy ${easy}, medium ${medium}, hard ${hard})`);
// The easy tier used to be the biggest, on the reasoning that a learning
// app should lean gentle. Missing an easy word is now an instant out, which
// makes it a penalty tier rather than a gentle one — simulated over 4000
// innings it was 42% of the deck and 60-67% of the outs. It must not be the
// largest bucket while that rule stands.
assert(easy <= medium + 4 && easy < hard + 6,
       `the easy tier does not dominate a deck where missing it ends the at-bat (easy ${easy}, medium ${medium}, hard ${hard})`);
assert(easy >= 25, `but there are still enough easy words to open on (${easy})`);

// Every entry is a complete bilingual pair. A blank half would render as an
// empty prompt or an empty choice button rather than failing loudly.
const broken = T.VOCAB.filter(w =>
  typeof w.es !== 'string' || !w.es.trim() ||
  typeof w.en !== 'string' || !w.en.trim() || !TIERS.includes(w.tag));
assert(broken.length === 0,
       `every word is a complete es/en/tag triple${broken.length ? ': ' + JSON.stringify(broken) : ''}`);

// Duplicates across the WHOLE list, not just within any one tier or batch.
for (const field of ['es', 'en']) {
  const seen = new Set(), dupes = [];
  for (const w of T.VOCAB) { if (seen.has(w[field])) dupes.push(w[field]); else seen.add(w[field]); }
  assert(dupes.length === 0,
         `no ${field} value appears twice anywhere in the list${dupes.length ? ': ' + dupes.join(', ') : ''}`);
}

// Every tier has to be able to fill a four-choice question from its own
// language field, whichever way the prompt is facing.
assert(T.VOCAB.length >= 4, 'the list can fill a four-choice question at all');

// The hard tiers carry the phrases. A language stops being a list of nouns
// at the point where it starts being how a thing is actually said, and that
// is what TRIPLE and HOMERUN are for.
const words = T.VOCAB.map(w => Object.assign({ n: w.es.trim().split(/\s+/).length }, w));
const phrases = words.filter(w => w.n > 2);
const phrasesByTier = phrases.reduce((a, w) => { a[w.tag] = (a[w.tag] || 0) + 1; return a; }, {});
assert(phrases.length >= 15, `${phrases.length} multi-word phrases in the list`);
assert((phrasesByTier.TRIPLE || 0) >= 5 && (phrasesByTier.HOMERUN || 0) >= 5,
       `and they sit in the hard tiers (${JSON.stringify(phrasesByTier)})`);
assert(!phrases.some(w => w.tag === 'WALK' || w.tag === 'SINGLE'),
       'with none of them in the easy tiers, where a phrase would not be easy');

// Nothing so long it cannot be read on a phone in the time the clock gives.
const tooLong = words.filter(w => w.es.length > 32 || w.en.length > 32);
assert(tooLong.length === 0,
       `every prompt and answer fits on one line${tooLong.length ? ': ' + tooLong.map(w => w.es).join(', ') : ''}`);

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
section('Missing an easy word is an out on the spot');

// If the easy tier costs nothing to miss it is not a tier, it is a free
// pitch. WALK and SINGLE end the at-bat on the first miss; DOUBLE and above
// keep the full count, because those are the ones worth a second look.
for (const tag of ['WALK', 'SINGLE']) {
  const first = T.applyPitch(0, false, 9999, 3000, tag);
  assert(first.result === 'OUT', `a missed ${tag} is an out on the first pitch`);
  assert(first.instant === true, `  and it is flagged as one, not as strike three`);
  assert(first.strikes === 1, `  with the count where it really is, not fudged to three`);
}
for (const tag of ['DOUBLE', 'TRIPLE', 'HOMERUN']) {
  assert(T.applyPitch(0, false, 9999, 4000, tag).result === 'STRIKE',
         `a missed ${tag} is still only a strike`);
  assert(T.applyPitch(1, false, 9999, 4000, tag).result === 'STRIKE',
         `  and still only a strike on the second`);
  const third = T.applyPitch(2, false, 9999, 4000, tag);
  assert(third.result === 'OUT' && !third.instant,
         `  the third one is the out, and it is strike three, not a snap call`);
}

// The rule keys off the bucket, not off a list of tags typed twice.
assert(T.isFreeSwingTier('WALK') && T.isFreeSwingTier('SINGLE'), 'the easy bucket is the snap-out one');
assert(!T.isFreeSwingTier('DOUBLE') && !T.isFreeSwingTier('TRIPLE') && !T.isFreeSwingTier('HOMERUN'),
       'and nothing above it is');
assert(!T.isFreeSwingTier(undefined) && !T.isFreeSwingTier(null),
       'an unknown tier falls back to the old behaviour rather than guessing');

// A right answer is untouched at every tier — this only ever costs a miss.
for (const tag of ['WALK', 'SINGLE', 'DOUBLE', 'TRIPLE', 'HOMERUN']) {
  const good = T.applyPitch(0, true, 10, T.windowForTag(tag), tag);
  assert(good.result === 'HIT', `a fast right answer on ${tag} is still a hit`);
}
// Including on a full count: the easy rule must not turn 0-2 into an out
// when the player actually answers.
assert(T.applyPitch(2, true, 10, 3000, 'WALK').result === 'HIT',
       'and an easy word answered right on 0-2 is still a hit');

// A timeout is a miss like any other, so an easy word run out of clock is
// an out too.
assert(T.applyPitch(0, false, 3000, 3000, 'WALK').result === 'OUT',
       'letting the clock run out on an easy word is an out as well');

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

section('Spending a swing does not seed the next one');

// The bug this pins: a banked home run used to go back in as a HIT, so it
// counted as the first of the next three and swings came round twice as
// often as the rule says.
{
  let streak = 0, bonus = null, banked = [];
  const step = result => {
    const o = T.applyAtBatToBonus(bonus, streak, result, 0);
    bonus = o.bonus; streak = o.streak; banked.push(o.banked);
    return o;
  };
  step('HIT'); step('HIT');
  assert(streak === 2, 'two hits in, the streak is two');
  const third = step('HIT');
  assert(third.banked === true && streak === 0, 'the third banks a swing and clears the count');

  const spent = step('SPENT');
  assert(spent.banked === false, 'spending the swing does not bank another');
  assert(streak === 0, 'and leaves the streak at zero, not one');

  step('HIT'); step('HIT');
  assert(streak === 2, 'so it takes two more hits to get back to two');
  assert(banked.filter(Boolean).length === 1, 'and only one swing has been banked so far');
  const again = step('HIT');
  assert(again.banked === true, 'the full three are needed again');
}

// Whatever the swing turned out to be, it never extends the streak.
for (const carried of [0, 1, 2]) {
  const o = T.applyAtBatToBonus(null, carried, 'SPENT', 0);
  assert(o.streak === 0 && o.banked === false,
         `a spent swing resets a streak of ${carried} rather than adding to it`);
}

// A spent swing can never bank one on its own, even from two in the bank.
assert(T.applyAtBatToBonus(null, T.BONUS_STREAK - 1, 'SPENT', 0).banked === false,
       'and it cannot bank a swing off the back of the streak it just spent');

// An out still resets, exactly as before — this changed nothing about it.
assert(T.applyAtBatToBonus(null, 2, 'OUT', 0).streak === 0, 'an out still clears the streak');
assert(T.applyAtBatToBonus(null, 2, 'HIT', 0).banked === true, 'and a real hit still banks on three');

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
assert(st.hitStreak === 0 && st.offersLeft === 0 &&
       st.bonusQ === null && st.swing === null,
       'offer and swing fields start empty');
assert(st.cap === T.AT_BATS_PER_INNING,
       'the inning starts on the base cap, and carries its own so a bonus can extend it');
assert(same(st.bases, [false, false, false]) && st.outs === 0 && st.runs === 0,
       'bases, outs and runs start clean');
assert('atBat' in st, 'there is a slot for the at-bat in progress');
assert(!('strikes' in st), 'strikes live on the at-bat, not the inning — they reset with it');

/* ===================================================================
   F. THE DUGOUT
   =================================================================== */
section('Ending the half-inning');

assert(T.AT_BATS_PER_INNING === 40, `the cap is ${T.AT_BATS_PER_INNING} at-bats`);
assert(T.inningOver(0, 0, 100) === null, 'a fresh inning is not over');
assert(T.inningOver(0, T.AT_BATS_PER_INNING - 1, 100) === null,
       'nor is one at-bat short of the cap');
assert(T.inningOver(0, T.AT_BATS_PER_INNING, 100) === 'CAP', 'the cap ends it');
assert(T.inningOver(T.MAX_OUTS, 5, 100) === 'OUTS', 'three outs ends it');
assert(T.inningOver(0, 3, 3) === 'DECK', 'so does running out of words');

// Outs win ties. An inning that reached three outs on its last legal at-bat
// ended by outs, not by the clock — and the summary has to say so.
assert(T.inningOver(T.MAX_OUTS, T.AT_BATS_PER_INNING, 100) === 'OUTS',
       'three outs on the capped at-bat is still an out ending');
assert(T.inningOver(T.MAX_OUTS, 100, 100) === 'OUTS',
       'and it beats the deck running out too');

// The cap is Timed's, not a shared rule. Classic charges an out for every
// wrong answer and resolves by outs at every accuracy measured, so capping
// it would introduce a problem rather than fix one.
const shared = require('./rules.js');
assert(!('AT_BATS_PER_INNING' in shared),
       'the cap is not in the shared rules, so Classic never sees it');

assert(T.inningOver(0, 12, 100, 12) === 'CAP', 'the cap is adjustable for testing');

section('Retiring the side when the clock ends it');

// The count has to reach three however it got there, or the scoreboard
// contradicts the summary.
for (const [outs, bases] of [
  [0, [false, false, false]], [1, [false, false, false]], [2, [false, false, false]],
  [0, [true, false, false]],  [1, [true, true, false]],   [0, [true, true, true]]
]) {
  const play = T.retireTheSide(outs, bases);
  assert(play.outs === T.MAX_OUTS,
         `from ${outs} out(s) with ${bases.filter(Boolean).length} on, the count resolves to three`);
  assert(play.call && play.call.es && play.call.en, '  and it comes with a call in both languages');
}

// A play records the batter plus whoever is on base and no more. You cannot
// turn two on an empty diamond, so the beat has to fit the field.
assert(T.retireTheSide(2, [false, false, false]).call.es === '¡Atrapada!',
       'one out needed on an empty diamond is a catch');
assert(T.retireTheSide(1, [true, false, false]).call.es === '¡Doble matanza!',
       'two needed with a runner on is a double play');
assert(T.retireTheSide(1, [false, false, false]).call.es === '¡Dos al hilo!',
       'two needed with nobody on cannot be a double play — the batters go down in order');
assert(T.retireTheSide(0, [true, true, false]).call.es === '¡Triple matanza!',
       'three needed with two on is a triple play');
assert(T.retireTheSide(0, [true, false, false]).call.es === '¡Tres al hilo!',
       'three needed with one on is not — one runner is not enough for two extra outs');
assert(T.retireTheSide(0, [false, false, false]).call.es === '¡Tres al hilo!',
       'and three needed on an empty diamond is three in a row');

// Never claims more outs than the field can give.
let overclaimed = [];
for (let outs = 0; outs < T.MAX_OUTS; outs++) {
  for (let mask = 0; mask < 8; mask++) {
    const bases = [1, 2, 4].map(bit => (mask & bit) !== 0);
    const play = T.retireTheSide(outs, bases);
    const needed = T.MAX_OUTS - outs;
    const claimsOnePlay = /matanza|Atrapada/.test(play.call.es);
    if (claimsOnePlay && needed > 1 + bases.filter(Boolean).length) {
      overclaimed.push(`${outs} out(s), ${bases.filter(Boolean).length} on`);
    }
  }
}
assert(overclaimed.length === 0,
       `no beat claims more outs on one play than the diamond can give${overclaimed.length ? ': ' + overclaimed.join('; ') : ''}`);

// The runners a multi-out play retires come off the bases, so LOB agrees
// with what was just called. A play that is not one play strands them.
const dp = T.retireTheSide(1, [true, true, false]);
assert(dp.bases.filter(Boolean).length === 1,
       'a double play takes one runner off, leaving one stranded');
assert(dp.bases[2] === false && dp.bases[1] === false,
       '  and it takes the lead one, the way a force play goes');
const tp = T.retireTheSide(0, [true, true, true]);
assert(tp.bases.filter(Boolean).length === 1, 'a triple play takes two off');
const inOrder = T.retireTheSide(0, [true, false, false]);
assert(inOrder.bases[0] === true,
       'three in a row retires nobody on base — the runner is left there');

// Nothing to retire.
assert(T.retireTheSide(T.MAX_OUTS, [true, false, false]).call === null,
       'a side already retired gets no extra call');

section('The cap and the easy-out rule together');

// Both can end an inning and they must not interfere. An easy miss is an
// out on the spot; three of those end it by OUTS regardless of the cap.
{
  let outs = 0, atBats = 0;
  for (let i = 0; i < 3; i++) {
    const p = T.applyPitch(0, false, 9999, 3000, 'WALK');
    if (p.result === 'OUT') outs++;
    atBats++;
  }
  assert(outs === 3 && T.inningOver(outs, atBats, 100) === 'OUTS',
         'three missed easy words end the inning by outs in three at-bats, cap untouched');
}

// And a player who never misses reaches the cap with the count still clean,
// which is exactly the case the cap exists for.
{
  let outs = 0;
  for (let i = 0; i < T.AT_BATS_PER_INNING; i++) {
    const p = T.applyPitch(0, true, 10, 3000, 'WALK');
    if (p.result === 'OUT') outs++;
  }
  assert(outs === 0, 'forty correct easy answers charge no outs');
  assert(T.inningOver(outs, T.AT_BATS_PER_INNING, 100) === 'CAP',
         'so the inning ends on the cap with a clean count');
  assert(T.retireTheSide(outs, [false, false, false]).outs === T.MAX_OUTS,
         'and the side is still retired three-for-three');
}

// A missed DOUBLE is a strike, so it costs at-bats but not outs — the word
// comes back. The cap counts at-bats, so a strike must not advance it.
{
  const strike = T.applyPitch(0, false, 9999, 4000, 'DOUBLE');
  assert(strike.result === 'STRIKE' && !strike.instant,
         'a missed medium word is a strike, not an out');
  assert(T.inningOver(0, 5, 100) === null,
         'and five at-bats deep with strikes on them, the inning is still live');
}

section('The bonus offer');

assert(T.BONUS_STREAK_OFFERS === 3, 'a bank is offered three times in all');
assert(T.BONUS_QUESTION_MS > T.windowForTag('HOMERUN'),
       `the bonus question gets its own, longer clock (${T.BONUS_QUESTION_MS}ms)`);
assert(T.BONUS_QUESTION_MS !== T.CONTACT_WINDOW_MS,
       'and it is not the swing window wearing a different name');

// Offers happen on streak completion, never once per at-bat.
assert(T.streakOffer(T.BONUS_STREAK - 1, 0).offer === false,
       'a streak short of three offers nothing');
const opened = T.streakOffer(T.BONUS_STREAK, 0);
assert(opened.offer === true && opened.offersLeft === T.BONUS_STREAK_OFFERS,
       'the third in a row opens a bank with three offers on it');
const reoffer = T.streakOffer(T.BONUS_STREAK, 2);
assert(reoffer.offer === true && reoffer.offersLeft === 2,
       'a later streak re-offers the bank being held rather than opening a new one');

// Declining spends one offer, and three declines end it.
let left = T.BONUS_STREAK_OFFERS;
left = T.declineOffer(left); assert(left === 2, 'one decline leaves two');
left = T.declineOffer(left); assert(left === 1, 'two leave one');
left = T.declineOffer(left); assert(left === 0, 'the third decline expires the bank');
assert(T.declineOffer(0) === 0, 'and it cannot go negative');

section('Extending the inning');

assert(T.extendInning(T.AT_BATS_PER_INNING) === T.AT_BATS_PER_INNING + T.BONUS_EXTRA_AT_BATS,
       `a won question adds ${T.BONUS_EXTRA_AT_BATS} at-bats`);

// The reward is paid in the resource the cap exists to bound, so it needs a
// ceiling or it outgrows that bound: simulated, an uncapped +5 ran the median
// inning to 74 at-bats at 90% accuracy against a cap of 40.
let cap = T.AT_BATS_PER_INNING;
for (let i = 0; i < 10; i++) cap = T.extendInning(cap);
assert(cap === T.AT_BATS_PER_INNING + T.MAX_INNING_EXTENSION,
       `ten wins cannot push the inning past +${T.MAX_INNING_EXTENSION} (${cap} at-bats)`);
assert(Math.floor(T.MAX_INNING_EXTENSION / T.BONUS_EXTRA_AT_BATS) === 2,
       'so exactly two bonuses pay, and later ones buy only the home run');
assert(T.extendInning(T.AT_BATS_PER_INNING + T.MAX_INNING_EXTENSION + 5) >=
       T.AT_BATS_PER_INNING + T.MAX_INNING_EXTENSION + 5,
       'and the ceiling never pulls a cap back down, which would end an inning on a reward');

section('The three attempts');

assert(T.SWING_ATTEMPTS === 3, 'three attempts');
assert(T.ATTEMPT_FLIGHT_MS.length === T.SWING_ATTEMPTS &&
       T.ATTEMPT_WINDOW_MS.length === T.SWING_ATTEMPTS,
       'and a flight and a window for each');
assert(T.attemptFlightMs(0) === 2000 && T.attemptFlightMs(2) === 1600,
       'the flight escalates 2000 to 1600');
assert(Math.min(...T.ATTEMPT_FLIGHT_MS) >= 1600,
       'and stops at 1600ms — 1400ms was measured unreadable');
assert(T.attemptFlightMs(99) === T.attemptFlightMs(T.SWING_ATTEMPTS - 1),
       'an attempt past the last one reads as the last one rather than undefined');

// The escalation that matters is the window, not the speed. At a fixed
// budget a faster ball gets a LARGER drawn band, so speed alone is decoration.
const band = a => {
  const w = T.pressWindow(T.SWING_LEAD_MS, T.attemptFlightMs(a), T.attemptWindowMs(a));
  return (w.shuts - w.opens) * 170;
};
assert(band(1) > band(0),
       `attempt two's band is BIGGER than attempt one's (${band(0).toFixed(1)}px vs ${band(1).toFixed(1)}px) — speed alone does not make it harder`);
assert(T.attemptWindowMs(2) < T.attemptWindowMs(1),
       `attempt three squeezes the window instead (${T.attemptWindowMs(1)}ms to ${T.attemptWindowMs(2)}ms)`);
assert(band(2) < band(1), 'so its band really is the smallest of the three');

// Fouling off: the first two misses cost nothing, the third ends it, and
// none of them is an out — the extension was banked at the question.
for (const attempt of [0, 1]) {
  assert(T.resolveAttempt(attempt, 0.05) === 'FOUL',
         `a miss on attempt ${attempt + 1} is a foul`);
}
assert(T.resolveAttempt(2, 0.05) === 'STRUCK_OUT_SWINGING',
       'a miss on the third ends the at-bat');
assert(!['OUT'].includes(T.resolveAttempt(2, 0.05)),
       'and it is still not an out — the risk was on the question, not the swing');

// Connecting on any attempt is a home run, at that attempt's own timing.
for (let a = 0; a < T.SWING_ATTEMPTS; a++) {
  const w = T.pressWindow(T.SWING_LEAD_MS, T.attemptFlightMs(a), T.attemptWindowMs(a));
  assert(T.resolveAttempt(a, (w.opens + w.shuts) / 2) === 'HOMERUN',
         `the centre of attempt ${a + 1}'s own band connects`);
  assert(T.resolveAttempt(a, w.opens - 0.05) !== 'HOMERUN',
         `  and pressing early on it does not`);
}

// An attempt scored against the wrong attempt's timing would connect where
// it should not. This is the check that the per-attempt budget is really
// being used rather than the global one.
const third = T.pressWindow(T.SWING_LEAD_MS, T.attemptFlightMs(2), T.attemptWindowMs(2));
const first = T.pressWindow(T.SWING_LEAD_MS, T.attemptFlightMs(0), T.attemptWindowMs(0));
assert(Math.abs(third.shuts - first.shuts) > 0.005,
       'the attempts really do have different press windows, not one window three times');

section('The dugout');

assert(T.DUGOUT_PHRASES.length >= 10, `${T.DUGOUT_PHRASES.length} phrases in the bank`);
assert(T.DUGOUT_PHRASES.every(p => p.es && p.en), 'every phrase has Spanish and English');
assert(new Set(T.DUGOUT_PHRASES.map(p => p.es)).size === T.DUGOUT_PHRASES.length,
       'no phrase is in the bench bank twice');

section('The coach');

assert(T.COACH_PHRASES.length >= 8, `${T.COACH_PHRASES.length} instructions in the coach bank`);
assert(T.COACH_PHRASES.every(p => p.es && p.en), 'every instruction has Spanish and English');
assert(new Set(T.COACH_PHRASES.map(p => p.es)).size === T.COACH_PHRASES.length,
       'no instruction is in the coach bank twice');

// The two are drawn together, one from each. If they shared an entry the
// screen could show the same line twice in two different voices.
const benchEs = new Set(T.DUGOUT_PHRASES.map(p => p.es));
const overlap = T.COACH_PHRASES.filter(p => benchEs.has(p.es));
assert(overlap.length === 0,
       `the two banks share nothing${overlap.length ? ': ' + overlap.map(p => p.es).join(', ') : ''}`);
assert(T.COACH_PHRASES !== T.DUGOUT_PHRASES, 'and they really are separate banks');
assert(T.DUGOUT_PHRASES.every(p => p.es.startsWith('¡') && p.es.endsWith('!')),
       'they are all written as shouts');
assert(new Set(T.DUGOUT_PHRASES.map(p => p.es)).size === T.DUGOUT_PHRASES.length,
       'no duplicates');
assert(T.DUGOUT_PHRASES.every(p => p.es.length <= 22),
       'all short enough to read in a moment');

/* ===================================================================
   G. WHICH WAY THE PITCH COMES
   =================================================================== */
section('The umpire');

const UMP = Object.values(T.UMPIRE_CALLS);
assert(UMP.length === 3, `${UMP.length} calls in the umpire bank`);
assert(UMP.every(c => c.es && c.en), 'every call has Spanish and English');
assert(new Set(UMP.map(c => c.es)).size === UMP.length, 'no call is in the bank twice');

// Three voices on one screen. Any shared line would read as one of them
// echoing another.
const benchSet = new Set(T.DUGOUT_PHRASES.map(p => p.es));
const coachSet = new Set(T.COACH_PHRASES.map(p => p.es));
const clash = UMP.filter(c => benchSet.has(c.es) || coachSet.has(c.es));
assert(clash.length === 0,
       `the umpire shares nothing with the bench or the coach${clash.length ? ': ' + clash.map(c => c.es).join(', ') : ''}`);

section('What the umpire calls, and off what');

// Every input below is an outcome applyPitch already produces. Nothing here
// invents an event; this is a lookup over results that were already tested.
assert(T.umpireCall('HIT')          === T.UMPIRE_CALLS.SAFE,   'a hit is ¡Safe!');
assert(T.umpireCall('OUT')          === T.UMPIRE_CALLS.OUT,    'the third strike is ¡Out!');
assert(T.umpireCall('STRIKE', false) === T.UMPIRE_CALLS.STRIKE, 'a wrong answer is ¡Strike!');
assert(T.umpireCall('STRIKE', true)  === T.UMPIRE_CALLS.STRIKE,
       'and so is the countdown running out — a strike is a strike either way');
assert(T.umpireCall('STRIKE')        === T.UMPIRE_CALLS.STRIKE, 'with or without the flag');

// The umpire must never contradict the scoreboard. Every outcome that
// charges a strike has to be CALLED a strike.
assert(T.applyPitch(0, false, 4000, 4000).result === 'STRIKE' &&
       T.umpireCall('STRIKE', true) === T.UMPIRE_CALLS.STRIKE,
       'a timeout charges a strike and is called one — no ball over a lit strike pip');

// Every call in the bank is reachable. A defined-but-unfired call is a dead
// branch dressed up as content, and this is what stops one creeping back.
const unreachable = Object.entries(T.UMPIRE_CALLS).filter(([, call]) => {
  for (const result of ['HIT', 'STRIKE', 'OUT'])
    for (const flag of [true, false])
      if (T.umpireCall(result, flag) === call) return false;
  return true;
});
assert(unreachable.length === 0,
       `every call the umpire can make, he does make${unreachable.length ? ' — unreachable: ' + unreachable.map(([k]) => k).join(', ') : ''}`);
assert(T.umpireCall('NOTHING') === null, 'anything else gets no call at all');

// Wired to applyPitch's real output rather than to strings picked by hand.
for (const [strikes, correct, ms, win, want, label] of [
  [0, true,  100,  4000, 'SAFE',   'a fast right answer'],
  [0, false, 100,  4000, 'STRIKE', 'a wrong answer on 0 strikes'],
  [1, false, 100,  4000, 'STRIKE', 'a wrong answer on 1 strike'],
  [2, false, 100,  4000, 'OUT',    'a wrong answer on 2 strikes'],
  [0, false, 4000, 4000, 'STRIKE', 'the clock running out on 0 strikes'],
  [2, false, 4000, 4000, 'OUT',    'the clock running out on 2 strikes']
]) {
  const r = T.applyPitch(strikes, correct, ms, win);
  const c = T.umpireCall(r.result, T.pitchTimedOut(ms, win));
  assert(c === T.UMPIRE_CALLS[want], `${label} -> ${T.UMPIRE_CALLS[want].es}`);
}

// The third strike is an out however it arrives: the out call outranks the
// timeout, so a clock running out on 0-2 is never called a ball.
assert(T.umpireCall(T.applyPitch(2, false, 9999, 4000).result, true) === T.UMPIRE_CALLS.OUT,
       'a timeout that ends the at-bat is ¡Out!, not a strike call');

section('What counts as the clock running out');

assert(T.pitchTimedOut(4000, 4000) === true, 'the moment the window closes counts');
assert(T.pitchTimedOut(3999, 4000) === false, 'a millisecond inside it does not');
assert(T.pitchTimedOut(9999, 4000) === true, 'and anything past it does');

section('Picking a direction');

for (const [roll, dir] of [[0, 'ES_TO_EN'], [0.25, 'ES_TO_EN'], [0.499, 'ES_TO_EN'],
                           [0.5, 'EN_TO_ES'], [0.75, 'EN_TO_ES'], [0.999, 'EN_TO_ES']]) {
  assert(T.pickDirection(roll) === dir, `a roll of ${roll} gives ${dir}`);
}
assert(T.DIRECTIONS.length === 2, 'there are exactly two directions');

let spanishFirst = 0;
const dirSamples = 20000;
for (let i = 0; i < dirSamples; i++) {
  if (T.pickDirection(i / dirSamples) === 'ES_TO_EN') spanishFirst++;
}
assert(Math.abs(spanishFirst / dirSamples - 0.5) < 0.01,
       `the two directions come up equally often (measured ${(spanishFirst / dirSamples * 100).toFixed(1)}% Spanish-first)`);

section('What each direction shows');

const word = T.VOCAB.find(w => w.es === 'el campocorto');

const fwd = T.promptFor(word, 'ES_TO_EN');
assert(fwd.prompt === 'el campocorto' && fwd.answer === 'the shortstop',
       'ES_TO_EN shows the Spanish and wants the English');
assert(fwd.promptLang === 'es' && fwd.answerLang === 'en',
       'and says which field the choices come from');

const rev = T.promptFor(word, 'EN_TO_ES');
assert(rev.prompt === 'the shortstop' && rev.answer === 'el campocorto',
       'EN_TO_ES shows the English and wants the Spanish');
assert(rev.promptLang === 'en' && rev.answerLang === 'es',
       'and flips the choice field too');

assert(T.promptFor(word, 'ES_TO_EN').prompt === T.promptFor(word, 'anything else').prompt,
       'an unknown direction falls back to Spanish-first rather than breaking');

// Choices are drawn from one field, so that field has to be collision-free
// in both directions or a question could offer the same answer twice.
for (const field of ['es', 'en']) {
  assert(new Set(T.VOCAB.map(w => w[field])).size === T.VOCAB.length,
         `every ${field} value is unique, so ${field} choices can never duplicate`);
}

section('The direction rides on the at-bat');

const ab1 = T.newAtBat('TRIPLE', 'EN_TO_ES');
assert(ab1.direction === 'EN_TO_ES', 'an at-bat carries the direction it was given');
assert(T.DIRECTIONS.includes(T.newAtBat('WALK').direction),
       'and picks one for itself when none is given');

// A re-pitch is the same at-bat object, so the direction cannot drift:
// applyPitch never touches it.
const ab2 = T.newAtBat('DOUBLE', 'EN_TO_ES');
let strikes = ab2.strikes;
for (let i = 0; i < 2; i++) strikes = T.applyPitch(strikes, false, 800, ab2.windowMs).strikes;
assert(ab2.direction === 'EN_TO_ES' && strikes === 2,
       'two strikes later the at-bat still has its original direction');

// Direction and tier are independent — a word's tier still sets the clock.
assert(T.newAtBat('WALK', 'EN_TO_ES').windowMs === 3000 &&
       T.newAtBat('TRIPLE', 'EN_TO_ES').windowMs === 5000,
       'flipping the direction does not change the clock');

/* ===================================================================
   H. THE PITCH — ball position to swing timing
   =================================================================== */
section('Where the ball is');

assert(T.ballProgressAt(0) === 0, 'before the wind-up, the ball has not been released');
assert(T.ballProgressAt(T.PITCH_WINDUP_MS) === 0, 'still zero at the moment of release');
assert(T.ballProgressAt(T.PITCH_WINDUP_MS + T.PITCH_FLIGHT_MS / 2) === 0.5,
       'halfway through the flight is halfway to the mitt');
assert(T.ballProgressAt(T.PITCH_WINDUP_MS + T.PITCH_FLIGHT_MS) === 1, 'the mitt is progress 1');
assert(T.ballProgressAt(99999) === 1, 'and it stops there rather than running on');

// One pitch, one chance: unlike the sweeping marker, progress never comes
// back around. Anything that made it non-monotonic would hand the player a
// second bite at the window.
let last = -1, monotonic = true;
for (let ms = 0; ms <= 2600; ms += 10) {
  const p = T.ballProgressAt(ms);
  if (p < last) monotonic = false;
  last = p;
}
assert(monotonic, 'progress only ever moves forward — there is no second pass');

section('What a swing at that position is worth');

// Edges taken from the constants, not typed in: the window has been retuned
// once already, and a hand-written 0.70 silently stops testing the edge the
// moment that number moves.
const OPENS = T.PLATE_AT - T.contactWindowFraction();
const SHUTS = T.PLATE_AT + T.contactWindowFraction();

for (const [p, verdict] of [
  [0,             'EARLY'],   [OPENS / 2,  'EARLY'],   [OPENS - 0.001, 'EARLY'],
  [OPENS,         'ON_TIME'], [T.PLATE_AT, 'ON_TIME'], [SHUTS,         'ON_TIME'],
  [SHUTS + 0.001, 'LATE'],    [1,          'LATE']
]) {
  assert(T.swingVerdict(p) === verdict, `progress ${p.toFixed(3)} is ${verdict}`);
  assert(T.isContact(p) === (verdict === 'ON_TIME'), `  and isContact agrees at ${p.toFixed(3)}`);
}
assert(T.PLATE_AT === 0.8 && T.isContact(T.PLATE_AT),
       'the window is centred on the plate, not somewhere arbitrary in the flight');
assert(T.PLATE_AT + T.contactWindowFraction() < 1,
       'the ball travels past the plate, so a late swing has something to be late against');

section('The window in wall-clock terms');

const release = T.PITCH_WINDUP_MS;
const openAt  = release + (T.PLATE_AT - T.contactWindowFraction()) * T.PITCH_FLIGHT_MS;
const shutAt  = release + (T.PLATE_AT + T.contactWindowFraction()) * T.PITCH_FLIGHT_MS;
assert(T.contactWindowMs() === Math.round(shutAt - openAt),
       `the window is ${T.contactWindowMs()}ms wide, from ${openAt}ms to ${shutAt}ms`);
assert(T.isContact(T.ballProgressAt(openAt)) && T.isContact(T.ballProgressAt(shutAt)),
       'both edges of that span are contact');
assert(!T.isContact(T.ballProgressAt(openAt - 20)) && !T.isContact(T.ballProgressAt(shutAt + 20)),
       'and 20ms outside either edge is not');
assert(T.contactWindowMs() >= 200,
       `the window is wide enough to be fair on one attempt (${T.contactWindowMs()}ms)`);

// Speed and window width are separate levers that both make this harder, and
// they multiply. This is the floor that stops a future speed-up from quietly
// making the swing unhittable: the window is a fixed FRACTION of the flight,
// so every millisecond off the flight comes straight off the window too.
// The invariant that replaces the old fairness floor: the window is a
// budget for a human and the flight cannot touch it. Speed and difficulty
// are separate levers now, so there is nothing left for a floor to protect.
let holds = [];
for (const flight of [1200, 1400, 2000, 2400, 3000, 4000]) {
  const half = T.contactWindowFraction(flight);
  const ms   = Math.round(2 * half * flight);
  if (ms !== T.CONTACT_WINDOW_MS) holds.push(`${flight}ms flight -> ${ms}ms window`);
}
assert(holds.length === 0,
       `the window holds ${T.CONTACT_WINDOW_MS}ms at every flight speed${holds.length ? ' — ' + holds.join(', ') : ''}`);

// And the load holds its distance from it, in the only unit the player
// experiences. This is the drift that used to be invisible: a fixed 180ms
// lead against a fractional window moved from 0.015 to 0.03 of the flight
// when the pitch sped up, with nobody editing either number.
let gaps = [];
for (const flight of [1400, 2000, 2400, 3000]) {
  const gapMs = Math.round((T.leadProgress(T.SWING_LEAD_MS, flight) -
                            T.contactWindowFraction(flight)) * flight);
  if (gapMs !== T.SWING_LEAD_MS - T.CONTACT_WINDOW_MS / 2) gaps.push(`${flight}: ${gapMs}ms`);
}
assert(gaps.length === 0,
       `the load leads the window by a flat ${T.SWING_LEAD_MS - T.CONTACT_WINDOW_MS / 2}ms at every speed${gaps.length ? ' — ' + gaps.join(', ') : ''}`);

// Swinging before the ball is even released must never accidentally land.
let earlyClean = true;
for (let ms = 0; ms <= T.PITCH_WINDUP_MS; ms += 25) {
  if (T.isContact(T.ballProgressAt(ms))) earlyClean = false;
}
assert(earlyClean, 'no swing during the wind-up can accidentally be contact');

/* ===================================================================
   I. THE LOAD — the press has to lead the contact
   =================================================================== */
section('The ready beat');

assert(T.readyHoldMs() === T.READY_READ_MS + T.READY_CUE_MS,
       `the hold is the reading beat plus the cue (${T.readyHoldMs()}ms)`);
assert(T.READY_READ_MS > 0 && T.READY_CUE_MS > 0,
       'both beats are real — the pitch never starts on the frame the screen changes');
assert(T.readyHoldMs(100, 50) === 150, 'the hold is adjustable for testing');
// The hold is lead-in. It must not appear anywhere in how a swing is scored.
assert(T.ballProgressAt(T.PITCH_WINDUP_MS + T.PITCH_FLIGHT_MS / 2) === 0.5 &&
       T.contactWindowMs() === T.CONTACT_WINDOW_MS,
       'and it changes nothing about the flight or the window');

section('Where the ball is when the barrel arrives');

const LEAD = T.SWING_LEAD_MS / T.PITCH_FLIGHT_MS;
assert(Math.abs(T.leadProgress() - LEAD) < 1e-12,
       `the load eats ${(LEAD * 100).toFixed(2)}% of the flight`);
assert(Math.abs(T.contactProgress(0.4) - (0.4 + LEAD)) < 1e-12,
       'the ball keeps travelling while the bat is on its way');
assert(T.contactProgress(0.95) === 1,
       'a press that late still only carries the ball to the mitt, never past it');
assert(T.contactProgress(0.5, 0, T.PITCH_FLIGHT_MS) === 0.5,
       'with no load at all, the press is the contact');
assert(T.contactProgress(0.5, 700, 1400) === 1,
       'the lead is adjustable for testing');

section('What the load costs at each end of the window');

// The load is a fixed 180ms of hitter, not a fraction of the pitch. At the
// tightened window it is 0.075 of the flight against a half-width of 0.06 —
// the load is now DEEPER than the window, so every press that connects
// happens strictly before the ball reaches the plate. That is what a hitter
// actually does, and the player is not asked to read it off the plate: the
// SWING band is drawn exactly on the press window, and that is what they aim
// at.
assert(T.leadProgress() > T.contactWindowFraction(),
       'the load is deeper than the window, so the press always leads the plate');
assert(!T.isContact(T.contactProgress(T.PLATE_AT)),
       'pressing as the ball reaches the plate is late at this width');
assert(T.isContact(T.contactProgress(T.PLATE_AT - LEAD)),
       'pressing one load ahead of the plate is dead centre');
assert(T.pressWindow().shuts < T.PLATE_AT,
       'so the whole press window sits above the plate, which is where the band is drawn');

// The lead still costs something, and it costs it at the late edge: the last
// frame the BALL is in the window is already too late to start the bat.
assert(T.isContact(T.PLATE_AT + T.contactWindowFraction()),
       'the ball at the far edge of the window is still contact');
assert(!T.isContact(T.contactProgress(T.PLATE_AT + T.contactWindowFraction())),
       'but committing there is a miss — the barrel arrives after the ball has gone');
assert(T.contactProgress(0.5) > 0.5, 'the press always leads the contact, never trails it');

section('The press window');

const W = T.pressWindow();
assert(Math.abs(W.opens - (T.PLATE_AT - T.contactWindowFraction() - LEAD)) < 1e-12 &&
       Math.abs(W.shuts - (T.PLATE_AT + T.contactWindowFraction() - LEAD)) < 1e-12,
       `the press window is the contact window shifted back by the load (${W.opens.toFixed(4)}..${W.shuts.toFixed(4)})`);

// The load moves WHEN you have to act. It must not shrink HOW LONG you have.
const pressMs   = (W.shuts - W.opens) * T.PITCH_FLIGHT_MS;
assert(Math.abs(pressMs - T.contactWindowMs()) < 1e-9,
       `the load shifts the window without narrowing it (${Math.round(pressMs)}ms, same as contact)`);
assert(W.opens > 0,
       'and the window still opens after the ball is released, not during the wind-up');

// Every press inside the window connects; every press outside it does not.
for (const [press, ok, label] of [
  [W.opens - 0.02, false, 'a shade before the window opens'],
  [W.opens,        true,  'the first frame it is open'],
  [(W.opens + W.shuts) / 2, true, 'dead centre'],
  [W.shuts,        true,  'the last frame it is open'],
  [W.shuts + 0.02, false, 'a shade after it shuts'],
  [0,              false, 'pressing during the wind-up'],
  [1,              false, 'pressing as it hits the mitt']
]) {
  assert(T.isContact(T.contactProgress(press)) === ok,
         `${label} ${ok ? 'connects' : 'misses'}`);
}

// Which side of it they were on, in press terms.
assert(T.swingVerdict(T.contactProgress(W.opens - 0.05)) === 'EARLY',
       'pressing before the window is EARLY');
assert(T.swingVerdict(T.contactProgress(W.shuts + 0.05)) === 'LATE',
       'pressing after it is LATE');

section('The load leaves the countdown scoring alone');

// The banked swing and the multiple-choice pitch are different clocks. The
// load must not have reached across into the tiered timing.
const bandsBefore = T.SPEED_BANDS.map(b => `${b.within}:${b.hit}`).join('|');
assert(bandsBefore === '0.25:HOMERUN|0.45:TRIPLE|0.7:DOUBLE|1:SINGLE',
       'the speed bands are untouched by the load');
for (const [frac, hit] of [[0.1, 'HOMERUN'], [0.4, 'TRIPLE'], [0.6, 'DOUBLE'], [0.95, 'SINGLE']]) {
  assert(T.hitForResponse(4000 * frac, 4000) === hit,
         `answering at ${Math.round(frac * 100)}% of a 4s window is still a ${hit}`);
}
assert(T.hitForResponse(4001, 4000) === null, 'and past the window is still nothing');
assert(T.applyPitch(0, true, 100, 4000).hit === 'HOMERUN',
       'a fast correct answer is still scored on the answer clock, not the swing clock');
assert(T.windowForTag('WALK') === 3000 && T.windowForTag('TRIPLE') === 5000,
       'the tiers still set the clock they always did');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
