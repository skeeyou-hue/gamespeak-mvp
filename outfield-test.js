/* =========================================================================
   Tests for the Outfielder rule layer and the sentence bank.

   Run with:  node outfield-test.js
   No browser: outfield-rules.js is pure and takes its randomness as a
   parameter, so a whole half-inning can be driven deterministically.

   Edges are read from the constants. A hand-written 0.50 stops testing
   the band the moment PACE_BANDS moves, and the assertion keeps passing
   while the thing it guards has gone.
   ========================================================================= */

const R = require('./outfield-rules.js');
const B = require('./outfield-bank.js');

let passed = 0, failed = 0;
const assert = (cond, msg) => {
  if (cond) { passed++; console.log('ok   - ' + msg); }
  else      { failed++; console.error('FAIL - ' + msg); }
};
const section = title => console.log('\n# ' + title);

const entry = B.ENTRIES[0];
const identity = a => a.slice();

/* ===================================================================
   A. THE BANK
   The failure this catches is silent in play: a slot with two correct
   balls marks a player wrong for a right answer and never says why.
   =================================================================== */
section('The bank validates');

for (const r of B.validateAll()) {
  assert(r.ok, `${r.id} passes the validator` + (r.ok ? '' : ': ' + r.errors.join('; ')));
  assert(r.playable.length > 0, `${r.id} carries at least one rung (${r.playable.map(p => p.name).join(', ')})`);
}

assert(B.ENTRIES.every(e => e.provisional === true),
       'every entry is flagged provisional — nothing here has an adviser signature');
assert(B.ENTRIES.every(e => !e.adviser.verdict),
       'and no entry claims one');
assert(B.REJECTED.length > 0 && B.REJECTED.every(r => r.why),
       `the rejected seeds are recorded with their reason (${B.REJECTED.length})`);

section('Every slot is answerable, and the gloss rule holds both ways');

for (const s of entry.slots) {
  const forms = [s.answer, ...s.distractors.map(d => d.form)];
  assert(new Set(forms).size === 4, `slot ${s.token}: four distinct balls`);
  const lexical = s.distractors.some(d => d.axis === 'lexical');
  assert(lexical ? !!s.gloss : !s.gloss,
    `slot ${s.token} (${s.answer}): gloss ${lexical ? 'present' : 'absent'}, ` +
    `because grammar ${lexical ? 'cannot' : 'can'} separate the four`);
  if (s.gloss) {
    assert(!/s$/.test(s.gloss) || s.gloss === 'bases',
      `slot ${s.token} glosses the lemma "${s.gloss}", not an inflected form`);
  }
}

/* ===================================================================
   B. DETERMINABILITY
   Blanks fill left to right, so a slot whose disambiguating token is a
   LATER blank cannot be answered from the screen.
   =================================================================== */
section('Directionality');

const ceiling = R.slotCeiling(entry);
assert(R.validSet(entry, ceiling.example),
       `the computed maximum set of ${ceiling.max} is itself valid`);
assert(!R.validSet(entry, [0, 1]),
       'El and bateador cannot both be blanks — the article leans right');
assert(R.validSet(entry, [8, 9]),
       'carreras and impulsadas can, because the participle leans left');
assert(!R.validSet(entry, [2, 6]),
       'both finite verbs cannot go — nothing would anchor the tense');
assert(R.exclusions(entry).length > 0,
       `the exclusions are named, not just counted (${R.exclusions(entry).length})`);

// The ceiling is a property of the sentence, so a rung above it is refused
// rather than played badly.
const tooBig = R.SLOTS_BY_LEVEL.findIndex(n => n > ceiling.max);
if (tooBig >= 0) {
  const r = R.slotsForRung(entry, R.SLOTS_BY_LEVEL[tooBig]);
  assert(!r.ok, `a rung needing ${R.SLOTS_BY_LEVEL[tooBig]} slots is refused (${r.reason})`);
}

section('A token can be undeterminable in itself, not just in conflict');

/* Directionality is one way a slot fails. The other is a token nothing on
   screen could ever settle, whatever else is blanked — a lone finite verb
   with no tense anchor, a scoreline, a subjectless verb. slotCeiling knew
   only the first, and reported a ceiling of 3 for a candidate that carries
   one. These guard the second. */
{
  const base = {
    tokens: [
      { i: 0, form: 'El', pos: 'DET', requires: [{ token: 1, why: 'leans right' }] },
      { i: 1, form: 'bateador', pos: 'NOUN', requires: [{ token: 0, why: 'from the article' }] },
      { i: 2, form: 'terminó', pos: 'VERB' },
      { i: 3, form: '1-de-4', pos: 'NUM' }
    ], slots: []
  };
  assert(R.slotCeiling(base).max === 3,
         'with nothing marked, four content tokens and one pair give 3');

  const marked = JSON.parse(JSON.stringify(base));
  marked.tokens[2].blankable = false; marked.tokens[2].why = 'no tense anchor';
  marked.tokens[3].blankable = false; marked.tokens[3].why = 'a fact, not a form';
  assert(R.slotCeiling(marked).max === 1,
         'marking the two undeterminable tokens drops the ceiling to 1');
  assert(!R.contentTokens(marked).includes(2) && !R.contentTokens(marked).includes(3),
         'and they are not content tokens at all');
  assert(R.unblankable(marked).some(u => u.form === 'terminó' && /tense/.test(u.why)),
         'the ceiling comes with a diagnosis, not just a number');

  // A requirement naming a token that is not in the sentence can never be
  // met. Treating it as satisfied is exactly what hid the bug.
  const phantom = JSON.parse(JSON.stringify(base));
  phantom.tokens[2].requires = [{ token: 99, why: 'a verb that is not there' }];
  assert(!R.answerable(phantom, [2], 2),
         'a requirement pointing at a missing token fails rather than passing silently');
  assert(!R.slotCeiling(phantom).example.includes(2),
         'so a token depending on one never enters a maximal set');
}

section('The flight is a ladder, derived rather than guessed');

// The first human calibration said 4000ms flat was too fast at Rookie.
// The replacement is read off the answer clock in timed.js — the only
// reading budget in this project that has ever met a player — so this
// asserts the DERIVATION, not the numbers it currently produces.
assert(R.FLIGHT_BY_LEVEL.length === R.LEVELS.length,
       'every rung has a flight');
// The finished-sentence beat is a READ, not a transition: it has to hold
// a whole translation, so it must outlast the beats that only move a word.
assert(R.SENTENCE_MS > R.SETTLE_MS && R.SENTENCE_MS > R.HIT_BEAT_MS,
       `the completed-sentence beat (${R.SENTENCE_MS}ms) outlasts the settle and hit beats`);
assert(R.FLIGHT_BY_LEVEL.every((f, i) => f === R.LEVELS[i].clock.hard),
       'and each one is that rung\'s hard answer clock, not a second set of numbers');
assert(R.FLIGHT_BY_LEVEL.every((f, i) => i === 0 || f < R.FLIGHT_BY_LEVEL[i - 1]),
       `the look shortens as the rung rises (${R.FLIGHT_BY_LEVEL.join(' > ')}ms)`);
assert(R.FLIGHT_BY_LEVEL[0] === Math.max(...R.FLIGHT_BY_LEVEL),
       'Rookie gets the longest look on the ladder — the thing the tester asked for');
assert(R.FLIGHT_MS === R.FLIGHT_BY_LEVEL[R.DEFAULT_LEVEL],
       'the single-number alias the sims use is read from the ladder, not typed');
assert(R.flightFor(0) === R.FLIGHT_BY_LEVEL[0] &&
       R.flightFor(R.LEVELS.length - 1) === R.FLIGHT_BY_LEVEL[R.LEVELS.length - 1],
       'flightFor indexes the same ladder');

// Sentence length is the difficulty lever; the flight is pacing. If the
// flight ever starts carrying difficulty there will be two ladders.
assert(R.SLOTS_BY_LEVEL.every((n, i) => i === 0 || n > R.SLOTS_BY_LEVEL[i - 1]) &&
       R.FLIGHT_BY_LEVEL.every((f, i) => i === 0 || f < R.FLIGHT_BY_LEVEL[i - 1]),
       'both move with the rung and in opposite directions: more to read, less time');

/* ===================================================================
   C. THE PACE BAND
   Edges derived from PACE_BANDS, never typed.
   =================================================================== */
section('The hit band is measured against the player, not the clock');

const NORM = 2000;
for (let i = 0; i < R.PACE_BANDS.length; i++) {
  const band = R.PACE_BANDS[i];
  if (!Number.isFinite(band.within)) continue;
  assert(R.hitForPace(band.within * NORM, NORM) === band.hit,
         `exactly ${band.within}x their own pace is a ${band.hit}`);
  assert(R.hitForPace((band.within + 0.001) * NORM, NORM) !== band.hit,
         `and a hair slower is not`);
}
assert(R.hitForPace(NORM * 99, NORM) === 'SINGLE',
       'however late, a wrong catch still concedes something');

// The same absolute time means different things to different players —
// which is the entire reason the band was rebased.
const fast = 850, slow = 2600;
assert(R.hitForPace(fast, fast) === R.hitForPace(slow, slow),
       'an unhurried read is the same verdict whoever you are');
assert(R.hitForPace(fast, slow) !== R.hitForPace(fast, fast),
       'and the same millisecond count is not');

section('Cold start');

const cold = R.makePace();
assert(cold.n() < R.PACE_MIN, 'a fresh window is cold');
assert(R.verdictFor(100, cold, null).hit === R.WARMUP,
       `with nothing stored, even an instant grab concedes the mildest verdict (${R.WARMUP})`);
assert(R.verdictFor(100, cold, null).cold === true, 'and says it was cold');

const harsh = R.verdictFor(100, cold, 4000);   // 0.025x of a stored median
assert(harsh.hit === R.COLD_CAP,
       `a stored median cannot concede worse than ${R.COLD_CAP} while cold`);
assert(R.RANK[harsh.hit] <= R.RANK[R.COLD_CAP], 'the cap is a ceiling, not a swap');

const warm = R.makePace();
for (let i = 0; i < R.PACE_MIN; i++) warm.push(2000);
assert(warm.n() >= R.PACE_MIN, 'the window warms after PACE_MIN catches');
assert(R.verdictFor(100, warm, 4000).basis === 'PACE',
       'and the stored value stops being consulted the moment it does');
assert(R.verdictFor(100, warm, 4000).hit === 'HOMERUN',
       'a genuine panic-grab is a home run once the band is live');

section('The window is built from every catch, not only the right ones');
assert(R.PACE_FROM === 'ALL',
       'a wrong catch is not evidence about knowledge but is evidence about timing');

/* ===================================================================
   D. THE HALF-INNING
   =================================================================== */
section('Driving a half-inning');

function play(rungIndex, choose) {
  const pace = R.makePace();
  const inn = R.createInning({ entry, rungIndex, pace, shuffle: identity });
  let guard = 0;
  while (!inn.over() && guard++ < 400) {
    if (inn.state().completed) inn.beginSentence();
    const balls = inn.balls();
    inn.catchBall(choose(balls, inn.liveSlot()), 1500);
  }
  return { inn, state: inn.state(), pace };
}

const clean = play(0, (balls, slot) => slot.answer);
assert(clean.state.outs === R.OUTS_PER_HALF,
       `a clean inning is exactly ${R.OUTS_PER_HALF} completed sentences`);
assert(clean.state.runs === 0, 'and concedes nothing');
assert(clean.state.log.every(e => e.type === 'CAUGHT'), 'every event is a catch');
assert(clean.state.log.length === R.OUTS_PER_HALF * R.SLOTS_BY_LEVEL[0],
       `${clean.state.log.length} catches: ${R.OUTS_PER_HALF} sentences of ${R.SLOTS_BY_LEVEL[0]} slots`);

const messy = play(0, (balls, slot) => balls.find(b => b !== slot.answer));
assert(messy.state.outs === R.OUTS_PER_HALF,
       'an inning where every catch is wrong still ends in three outs — the reveal resolves the slot');
const fouls = messy.state.log.filter(e => e.type === 'FOUL').length;
const concedes = messy.state.log.filter(e => e.type === 'CONCEDE').length;
assert(fouls === concedes * R.GRACE,
       `each concede is preceded by exactly ${R.GRACE} foul (${fouls} fouls, ${concedes} concedes)`);
assert(concedes === R.OUTS_PER_HALF * R.SLOTS_BY_LEVEL[0],
       'every slot concedes once when every catch is wrong');
assert(messy.state.log.filter(e => e.type === 'CONCEDE').every(e => e.answer),
       'and every concede carries the word to reveal');

section('The grace refreshes per slot, not per sentence');
{
  const pace = R.makePace();
  const inn = R.createInning({ entry, rungIndex: 0, pace, shuffle: identity });
  const slot = inn.liveSlot();
  const wrong = slot.distractors[0].form;
  assert(inn.catchBall(wrong, 1500).type === 'FOUL', 'first wrong catch is a foul');
  assert(inn.catchBall(wrong, 1500).type === 'CONCEDE', 'second concedes');
  assert(inn.state().missed === 0, 'and the grace resets for the next slot');
  assert(inn.catchBall(inn.liveSlot().distractors[0].form, 1500).type === 'FOUL',
         'so the next slot gets its own foul first');
}

section('Slots fill strictly left to right');
{
  const pace = R.makePace();
  const inn = R.createInning({ entry, rungIndex: 2, pace, shuffle: identity });
  const seen = [];
  while (!inn.over() && seen.length < 40) {
    if (inn.state().completed) inn.beginSentence();
    seen.push(inn.liveToken());
    inn.catchBall(inn.liveSlot().answer, 1500);
  }
  const first = seen.slice(0, R.SLOTS_BY_LEVEL[2]);
  assert(JSON.stringify(first) === JSON.stringify([...first].sort((a, b) => a - b)),
         `the live slot only ever moves right (${first.join(' -> ')})`);
}

section('A dropped volley and a mis-tap cost nothing');
{
  const pace = R.makePace();
  const inn = R.createInning({ entry, rungIndex: 0, pace, shuffle: identity });
  const before = inn.state();
  inn.dropVolley(); inn.misTap(); inn.misTap();
  const after = inn.state();
  assert(after.outs === before.outs && after.runs === before.runs,
         'neither costs an out or a run');
  assert(after.liveToken === before.liveToken, 'and the live slot does not move');
  assert(after.missed === before.missed, 'and no grace is spent');
}

section('Runners');
{
  const pace = R.makePace();
  for (let i = 0; i < R.PACE_MIN; i++) pace.push(2000);
  const inn = R.createInning({ entry, rungIndex: 0, pace, shuffle: identity });
  let ev;
  for (let i = 0; i < 6 && !inn.over(); i++) {
    const w = inn.liveSlot().distractors[0].form;
    inn.catchBall(w, 2000);                 // foul
    ev = inn.catchBall(w, 2000);            // concede
  }
  assert(inn.state().runs > 0, 'enough conceded hits eventually score');
  assert(ev.bases.length === 3, 'and the bases come back as three');
}

/* ===================================================================
   E. THE LADDER IS REUSED, NOT REINVENTED
   =================================================================== */
section('One difficulty system');

assert(R.SLOTS_BY_LEVEL.length === R.LEVELS.length,
       `sentence lengths and the shipped ladder are the same length (${R.LEVELS.length})`);
assert(R.SLOTS_BY_LEVEL.every((n, i) => i === 0 || n > R.SLOTS_BY_LEVEL[i - 1]),
       'and every rung up adds slots');
assert(R.rungsFor(entry).every(r => R.SLOTS_BY_LEVEL[r.i] === r.slots),
       'a rung’s slot count comes from the ladder, not from the entry');

// Slot selection is by morphological density, which is what makes the
// gloss rule double as the ladder: glossed slots are the easy ones.
{
  const rookie = R.slotsForRung(entry, R.SLOTS_BY_LEVEL[0]).tokens;
  const dens = rookie.map(t => R.morphDensity(entry.slots.find(s => s.token === t)));
  const all = entry.slots.map(R.morphDensity).sort((a, b) => a - b);
  assert(Math.max(...dens) <= all[R.SLOTS_BY_LEVEL[0] - 1],
         'the lowest rung takes the least morphological slots');
  const glossed = rookie.filter(t => entry.slots.find(s => s.token === t).gloss).length;
  assert(glossed >= rookie.length - 1,
         `and they are the glossed ones (${glossed} of ${rookie.length})`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
