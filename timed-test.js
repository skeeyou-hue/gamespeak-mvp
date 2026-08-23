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

/* ===================================================================
   F. THE DUGOUT
   =================================================================== */
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

for (const [p, verdict] of [
  [0,     'EARLY'], [0.5,  'EARLY'], [0.699, 'EARLY'],
  [0.70,  'ON_TIME'], [0.80, 'ON_TIME'], [0.90, 'ON_TIME'],
  [0.901, 'LATE'], [1,    'LATE']
]) {
  assert(T.swingVerdict(p) === verdict, `progress ${p} is ${verdict}`);
  assert(T.isContact(p) === (verdict === 'ON_TIME'), `  and isContact agrees at ${p}`);
}
assert(T.PLATE_AT === 0.8 && T.isContact(T.PLATE_AT),
       'the window is centred on the plate, not somewhere arbitrary in the flight');
assert(T.PLATE_AT + T.CONTACT_WINDOW < 1,
       'the ball travels past the plate, so a late swing has something to be late against');

section('The window in wall-clock terms');

const release = T.PITCH_WINDUP_MS;
const openAt  = release + (T.PLATE_AT - T.CONTACT_WINDOW) * T.PITCH_FLIGHT_MS;
const shutAt  = release + (T.PLATE_AT + T.CONTACT_WINDOW) * T.PITCH_FLIGHT_MS;
assert(T.contactWindowMs() === Math.round(shutAt - openAt),
       `the window is ${T.contactWindowMs()}ms wide, from ${openAt}ms to ${shutAt}ms`);
assert(T.isContact(T.ballProgressAt(openAt)) && T.isContact(T.ballProgressAt(shutAt)),
       'both edges of that span are contact');
assert(!T.isContact(T.ballProgressAt(openAt - 20)) && !T.isContact(T.ballProgressAt(shutAt + 20)),
       'and 20ms outside either edge is not');
assert(T.contactWindowMs() >= 200,
       `the window is wide enough to be fair on one attempt (${T.contactWindowMs()}ms)`);

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
       T.contactWindowMs() === 2 * T.CONTACT_WINDOW * T.PITCH_FLIGHT_MS,
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

// The load is a fixed 180ms of hitter, not a fraction of the pitch, so how
// much of the window it eats depends on how fast the pitch is. On the 2400ms
// flight it is 7.5%, and pressing as the ball crosses the plate still lands
// inside the window — which is the point: what looks right IS right.
assert(T.isContact(T.contactProgress(T.PLATE_AT)),
       'pressing as the ball crosses the plate connects');
assert(T.swingVerdict(T.contactProgress(T.PLATE_AT)) === 'ON_TIME',
       'and it is scored on time');
assert(T.isContact(T.contactProgress(T.PLATE_AT - LEAD)),
       'pressing one load ahead of the plate connects too');

// The lead still costs something, and it costs it at the late edge: the last
// frame the BALL is in the window is already too late to start the bat.
assert(T.isContact(T.PLATE_AT + T.CONTACT_WINDOW),
       'the ball at the far edge of the window is still contact');
assert(!T.isContact(T.contactProgress(T.PLATE_AT + T.CONTACT_WINDOW)),
       'but committing there is a miss — the barrel arrives after the ball has gone');
assert(T.contactProgress(0.5) > 0.5, 'the press always leads the contact, never trails it');

section('The press window');

const W = T.pressWindow();
assert(Math.abs(W.opens - (T.PLATE_AT - T.CONTACT_WINDOW - LEAD)) < 1e-12 &&
       Math.abs(W.shuts - (T.PLATE_AT + T.CONTACT_WINDOW - LEAD)) < 1e-12,
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
