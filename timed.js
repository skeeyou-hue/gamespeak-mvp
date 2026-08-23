/* =========================================================================
   GameSpeak — Tiered Timed Pitch
   =========================================================================

   A second game mode. Classic asks a word and waits; this mode puts a clock
   on every pitch and pays out by how fast you answer.

   HOW AN AT-BAT WORKS
   1. A word appears with a countdown sized by its difficulty tier.
   2. Answer correctly inside the window and you get a hit — how big depends
      on how fast you were.
   3. Answer wrong, or let the clock run out, and it's a STRIKE.
   4. Three strikes ends the at-bat as an out. Strikes reset each at-bat.

   Everything in this file is pure: no DOM, no clock, no state mutation.
   Functions take numbers in and hand results back, so the whole rule set is
   testable in Node without a browser (see timed-test.js). The countdown UI
   will sit on top of this, not inside it.

   This file is deliberately standalone. Classic mode's app.js is untouched
   by this branch, which means a couple of rules are restated here rather
   than shared. See the note at the bottom.
   ========================================================================= */


// The word list and base running are shared with Classic. In the browser
// rules.js is already loaded; under Node it has to be pulled in, which also
// puts its exports in scope for the bare names used below.
if (typeof require !== 'undefined' && typeof module !== 'undefined') {
  require('./rules.js');
}


/* -------------------------------------------------------------------------
   9c. THE UMPIRE
   A third voice, and the only one that is not encouragement. The bench
   hypes, the coach instructs, the umpire says what just happened.

   These fire off outcomes the game already produces and already tests —
   applyPitch's HIT / STRIKE / OUT, and whether the countdown ran out. No new
   event exists for them; umpireCall is a lookup over results that were
   already there, which is why it is a pure function of them.

   There is no ¡Bola!. A timeout charges a strike in this ruleset, by the
   rule that a wrong answer and a timeout are the same thing, so nothing here
   is honestly a ball. The call was carried for a while as defined-but-
   unreachable; that is just a dead branch with a test guarding it. If a real
   ball event ever exists, adding the call back is three lines.
   ------------------------------------------------------------------------- */

const UMPIRE_CALLS = {
  STRIKE: { es: '¡Strike!', en: 'Strike!' },
  OUT:    { es: '¡Out!',    en: 'Out!' },
  SAFE:   { es: '¡Safe!',   en: 'Safe!' }
};

// The countdown ran out rather than the player answering. Defined once here
// so the pitch loop and the umpire cannot disagree about what a timeout is.
function pitchTimedOut(elapsedMs, windowMs) {
  return elapsedMs >= windowMs;
}

// What the umpire says about an outcome the game has already decided.
// `result` is applyPitch's own result, unchanged and untouched.
//
// `timedOut` is still taken, and still describes something real — the
// countdown expiring rather than the player answering — but a strike is a
// strike either way, so it is a strike either way to the umpire too. That is
// the whole reason the parameter is kept rather than dropped: the day a
// timeout means something other than a strike, this is where it goes.
function umpireCall(result, timedOut = false) {
  if (result === 'HIT')    return UMPIRE_CALLS.SAFE;
  if (result === 'OUT')    return UMPIRE_CALLS.OUT;
  if (result === 'STRIKE') return UMPIRE_CALLS.STRIKE;
  return null;
}


/* -------------------------------------------------------------------------
   1. TIERS SET THE CLOCK
   In Classic, a word's tag is its hit type. Here the tag means something
   different: it picks the difficulty bucket, which sets how long you get.
   What you actually hit is decided by speed, in section 2.
   ------------------------------------------------------------------------- */
const TIMED_TIERS = {
  WALK:    { bucket: 'easy',   windowMs: 3000 },
  SINGLE:  { bucket: 'easy',   windowMs: 3000 },
  DOUBLE:  { bucket: 'medium', windowMs: 4000 },
  TRIPLE:  { bucket: 'hard',   windowMs: 5000 },
  HOMERUN: { bucket: 'hard',   windowMs: 5000 }
};

const MAX_STRIKES = 3;   // three strikes ends the at-bat as an out

function windowForTag(tag) {
  const tier = TIMED_TIERS[tag];
  if (!tier) throw new Error(`no timing tier for tag "${tag}"`);
  return tier.windowMs;
}

function bucketForTag(tag) {
  return TIMED_TIERS[tag].bucket;
}


/* -------------------------------------------------------------------------
   2. SPEED SETS THE HIT
   Bands are fractions of that word's own window, so a hard word gets 5
   seconds to earn a home run while an easy word gets 3 — the same standard
   applied at each tier's own pace, rather than one absolute stopwatch.
   ------------------------------------------------------------------------- */
const SPEED_BANDS = [
  { within: 0.25, hit: 'HOMERUN' },   // almost instant
  { within: 0.45, hit: 'TRIPLE'  },
  { within: 0.70, hit: 'DOUBLE'  },
  { within: 1.00, hit: 'SINGLE'  }    // right at the edge of the window
];

// What a correct answer earns, given how long it took.
// Returns null if the clock beat them — a correct answer that lands late is
// not a hit, it's a strike.
function hitForResponse(elapsedMs, windowMs) {
  if (!(elapsedMs >= 0) || elapsedMs > windowMs) return null;
  const fraction = elapsedMs / windowMs;
  for (const band of SPEED_BANDS) {
    if (fraction <= band.within) return band.hit;
  }
  return null;
}


/* -------------------------------------------------------------------------
   3. ONE PITCH AT A TIME
   The at-bat state machine. Given the strikes so far and what the player
   did with this pitch, what happens?

     correct    - did they pick the right meaning at all?
     elapsedMs  - how long they took. A timeout is just a pitch they got
                  wrong, so callers pass correct = false for it.

   Returns { strikes, result, hit }:
     result 'HIT'    - the at-bat ends, `hit` says with what
     result 'STRIKE' - the at-bat continues, same word, one more strike
     result 'OUT'    - the third strike; the at-bat ends
   ------------------------------------------------------------------------- */
// Missing an easy word ends the at-bat on the spot. You do not get three
// looks at "la pelota": if the easy tier does not cost anything to miss, it
// is not really a tier, it is a free pitch. The medium and hard tiers keep
// the full count, because those are the ones worth a second and third look.
//
// `tag` is optional. Without it every miss is a strike, which is the old
// behaviour and what the rule tests that predate this still exercise.
function isFreeSwingTier(tag) {
  return tag !== undefined && tag !== null && bucketForTag(tag) === 'easy';
}

function applyPitch(strikes, correct, elapsedMs, windowMs, tag) {
  const hit = correct ? hitForResponse(elapsedMs, windowMs) : null;

  // Beat the clock with the right answer and the count no longer matters —
  // you can homer on an 0-2 count, same as in a real at-bat.
  if (hit) return { strikes, result: 'HIT', hit };

  const nextStrikes = strikes + 1;

  // An easy word missed is an out however early in the count it happens.
  if (isFreeSwingTier(tag)) {
    return { strikes: nextStrikes, result: 'OUT', hit: null, instant: true };
  }

  return {
    strikes: nextStrikes,
    result: nextStrikes >= MAX_STRIKES ? 'OUT' : 'STRIKE',
    hit: null
  };
}


/* -------------------------------------------------------------------------
   4. BANKING A POWER SWING
   Three at-bats ending in a hit, back to back, bank a swing. Note the
   change from the original scoping: it is any hit, not three literal
   singles. In this mode hit type comes from speed, so a three-singles rule
   would bank the payoff for answering slowly three times running — exactly
   backwards from what it should reward.

   Ageing is per AT-BAT, not per pitch. A five-pitch at-bat ages a banked
   swing once, when it ends.
   ------------------------------------------------------------------------- */
const BONUS_STREAK   = 3;   // at-bats ending in a hit, back to back
const BONUS_LIFE_MIN = 1;   // shortest a banked swing survives, in at-bats
const BONUS_LIFE_MAX = 3;

// How many later at-bats a freshly banked swing survives. `roll` is a
// number in [0, 1) — Math.random() in the game, a fixed value in tests.
function rollBonusLife(roll) {
  const span = BONUS_LIFE_MAX - BONUS_LIFE_MIN + 1;
  return BONUS_LIFE_MIN + Math.floor(roll * span);
}

// Fold one finished at-bat into the bonus state.
//   result - 'HIT' or 'OUT', the way the at-bat ended
function applyAtBatToBonus(bonus, streak, result, roll) {
  // 1. A banked swing gets one at-bat older, and expires at zero.
  let nextBonus = bonus ? { atBatsLeft: bonus.atBatsLeft - 1 } : null;
  if (nextBonus && nextBonus.atBatsLeft <= 0) nextBonus = null;

  // 2. Only a hit extends the streak, and only a hit the player answered for.
  //    `result` is one of:
  //      'HIT'    answered correctly inside the window
  //      'OUT'    struck out
  //      'SPENT'  the at-bat was settled by spending a banked swing
  //
  //    SPENT resets the count however the swing turned out. The swing IS the
  //    reward for the last three in a row; letting it also count as the first
  //    of the next three means a banked home run leaves you one answer short
  //    of banking again, and swings arrive roughly twice as often as the rule
  //    says they should.
  const nextStreak = result === 'HIT' ? streak + 1 : 0;

  // 3. Three in a row banks a fresh swing, replacing any older one. A spent
  //    swing can never bank one: its streak is already back at zero.
  if (nextStreak >= BONUS_STREAK) {
    return { bonus: { atBatsLeft: rollBonusLife(roll) }, streak: 0, banked: true };
  }

  return { bonus: nextBonus, streak: nextStreak, banked: false };
}


/* -------------------------------------------------------------------------
   5. THE SHAPE OF MODE STATE
   Built here so the countdown UI has one obvious thing to read from, and so
   tests can assert against a known shape.
   ------------------------------------------------------------------------- */
function newAtBat(tag, direction = pickDirection(Math.random())) {
  return {
    tag,                          // the word's tier, which set the window
    windowMs: windowForTag(tag),
    direction,                    // held for every pitch of this at-bat
    strikes: 0,                   // resets with every new at-bat
    over: false,
    result: null,                 // 'HIT' | 'OUT' once over
    hit: null                     // 'HOMERUN' | 'TRIPLE' | 'DOUBLE' | 'SINGLE'
  };
}

function newTimedState(inning) {
  return {
    mode: 'timed',
    inning,
    deck: [],
    index: 0,
    outs: 0,
    runs: 0,
    bases: [false, false, false],
    hits: { WALK: 0, SINGLE: 0, DOUBLE: 0, TRIPLE: 0, HOMERUN: 0 },
    atBat: null,        // newAtBat(tag) while one is in progress
    paused: false,      // a clock is stopped and the card is covered
    hitStreak: 0,       // at-bats ending in a hit, back to back
    offersLeft: 0,      // chances left on a bank that is being held
    cap: AT_BATS_PER_INNING,   // grows when a bonus question is answered
    bonusQ: null,       // the bonus question, while one is on screen
    offerUp: false,     // an offer is on screen waiting on the player
    swing: null,        // the power-swing moment, when one is being taken
    missed: [],
    locked: false
  };
}


/* -------------------------------------------------------------------------
   6. SCORING A HIT
   How far each hit type carries. The advancing itself is advanceOnHit from
   rules.js, shared with Classic — this is only the mapping from a hit to a
   number of bases. There are no walks in this mode: a WALK-tagged word is
   just an easy word, and what it earns comes from the clock.
   ------------------------------------------------------------------------- */
const HIT_ADVANCE = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3, HOMERUN: 4 };



/* -------------------------------------------------------------------------
   7. THE WORD LIST
   VOCAB comes from rules.js, shared with Classic. The tags mean difficulty
   here, which is what sets each word's clock.
   ------------------------------------------------------------------------- */


/* -------------------------------------------------------------------------
   8. THE PITCH — how ball position maps to swing timing

   Spending a banked swing replaces the whole at-bat: no word, no clock, no
   count. It is settled by one swing at a ball actually travelling from the
   pitcher to the plate. One pitch, one chance — there is no second pass to
   wait for, so the timing has to be read off the ball itself.

   The whole thing is described by one number, `progress`:

     0.00  release, ball leaves the pitcher's hand
     0.80  the ball is over the plate — this is the contact point
     1.00  the ball is in the catcher's mitt

   The ball deliberately travels PAST the plate, because a late swing needs
   something to be late against. Stopping the ball at the plate would make
   "too late" invisible.

   Progress is linear in time, so the timing is honest and testable. What
   the UI does with it on screen — position along the flight line, the ball
   growing as it nears — is presentation and lives in the UI layer. Only
   this file decides what a swing at a given progress is worth.

   Timeline, with the numbers below:

     |<-- 600ms set -->|<---------- 1400ms flight ---------->|
                       0.0                0.80 (plate)     1.0
                                     [====== 280ms ======]
                                       contact window
   ------------------------------------------------------------------------- */

const PITCH_WINDUP_MS = 600;    // the set beat before release, so it reads
// 1400ms is about a real fastball, and real hitters train for years to read
// one; at that speed a new player got one 280ms slot to press and it was
// nowhere near the plate. 2400ms fixed that, and once it was readable it was
// also slow, so this is the step back toward a real pitch now that the ball
// can actually be seen. Every fraction stays where it was — PLATE_AT,
// CONTACT_WINDOW and the bands are untouched — only the wall clock they land
// on moves with it.
const PITCH_FLIGHT_MS = 2000;   // release to the mitt
const PLATE_AT        = 0.80;   // where in the flight the ball crosses the plate
// How long the window is open, in milliseconds. This is a budget for a
// human, not a share of the pitch: 240ms is 240ms whether the ball takes two
// seconds to arrive or one.
//
// It used to be a fraction of the flight, and that quietly coupled two levers
// that should be independent. Speeding the pitch up from 2400ms to 2000ms
// shrank the window from 288ms to 240ms without anyone touching it, and moved
// SWING_LEAD_MS — a fixed 180ms — from 0.075 of the flight to 0.09, so the
// gap between the load and the window's half-width doubled from 0.015 to 0.03
// as a side effect of a speed change. Two levers, one knob, invisible drift.
//
// As a fraction it still has to be expressed somewhere, because progress is
// a fraction. CONTACT_WINDOW is now derived from the budget and the flight
// rather than being the source, which is the whole point: change the flight
// and the window holds its length in the only unit the player experiences.
const CONTACT_WINDOW_MS = 240;

function contactWindowFraction(flight = PITCH_FLIGHT_MS, budgetMs = CONTACT_WINDOW_MS) {
  return budgetMs / 2 / flight;
}

// Where the ball is, 0..1. Zero through the wind-up: the ball has not been
// released yet, so swinging during it is as early as early gets.
function ballProgressAt(elapsedMs, windup = PITCH_WINDUP_MS, flight = PITCH_FLIGHT_MS) {
  if (!(elapsedMs > windup)) return 0;
  return Math.min(1, (elapsedMs - windup) / flight);
}

// Did the bat meet the ball? The window is inclusive of both edges, and
// they need an epsilon: PLATE_AT - CONTACT_WINDOW is 0.7000000000000001 in
// floating point, so a swing at exactly 0.70 would otherwise be scored a
// miss by a rounding error the player can neither see nor avoid.
const CONTACT_EDGE_EPSILON = 1e-9;

function isContact(progress, flight = PITCH_FLIGHT_MS, budgetMs = CONTACT_WINDOW_MS) {
  const half = contactWindowFraction(flight, budgetMs);
  return progress >= PLATE_AT - half - CONTACT_EDGE_EPSILON
      && progress <= PLATE_AT + half + CONTACT_EDGE_EPSILON;
}

// Contact, or which side of it they missed on. Knowing whether you were
// early or late is the difference between learning the timing and guessing.
function swingVerdict(progress, flight = PITCH_FLIGHT_MS, budgetMs = CONTACT_WINDOW_MS) {
  if (isContact(progress, flight, budgetMs)) return 'ON_TIME';
  return progress < PLATE_AT ? 'EARLY' : 'LATE';
}

// The budget itself. Kept as a function so every caller reads the same
// number whatever the flight is doing.
function contactWindowMs() {
  return CONTACT_WINDOW_MS;
}


/* -------------------------------------------------------------------------
   8b. THE LOAD — why the press is not the contact

   A hitter cannot decide to swing at the moment the bat meets the ball. The
   hands go first and the barrel arrives afterwards; by the time it does, the
   ball has kept coming. So pressing is a commitment made in advance, not a
   button that stops the ball where it is.

   That is a rule change, not a visual delay. The outcome is scored on where
   the ball IS when the barrel gets there — press progress plus however far
   the ball travels during the load — so the press has to lead the contact.

   Timeline, with the numbers below:

     ball    0.00 ............ 0.57 ....... 0.70 .. 0.80 .. 0.90 ...... 1.00
                               ^press       [==== contact window ====]
                               |____ 180ms load ____^
                               [== press window ==]  (same 280ms, shifted)

   The two windows are the same width — the load shifts when you have to act,
   it does not shrink how long you have to act. Everything the player has to
   aim at is derived from these two constants, never written down twice.
   ------------------------------------------------------------------------- */

// Before any of that, the screen has to be readable. The dugout shout and
// the coach's line arrive at the same instant the swing screen does; if the
// clock starts on that frame, reading them costs the pitch. So the pitch is
// held: the lines land, then a beat that says one is coming, then the clock.
// This is lead-in only — it moves when the flight starts, never how it is
// scored.
const READY_READ_MS = 800;   // the shout and the coach's line land
const READY_CUE_MS  = 550;   // "here it comes"

function readyHoldMs(read = READY_READ_MS, cue = READY_CUE_MS) { return read + cue; }

const SWING_LEAD_MS = 180;   // press to barrel: the load, in wall-clock ms

// The ball keeps travelling while the bat is on its way. This is where it
// will be when the barrel arrives, and it is what the swing is scored on.
function contactProgress(pressProgress, lead = SWING_LEAD_MS, flight = PITCH_FLIGHT_MS) {
  return Math.min(1, pressProgress + lead / flight);
}

// How much of the flight the load eats.
function leadProgress(lead = SWING_LEAD_MS, flight = PITCH_FLIGHT_MS) {
  return lead / flight;
}

// The contact window expressed in press terms: where the ball has to be when
// the player commits. This is what the UI draws as the press cue — showing
// only the contact window would be showing them a target they cannot aim at.
function pressWindow(lead = SWING_LEAD_MS, flight = PITCH_FLIGHT_MS,
                     budgetMs = CONTACT_WINDOW_MS) {
  const shift = leadProgress(lead, flight);
  const half  = contactWindowFraction(flight, budgetMs);
  return { opens: PLATE_AT - half - shift,
           shuts: PLATE_AT + half - shift };
}


/* -------------------------------------------------------------------------
   9. THE DUGOUT
   Short shouts of the kind you would actually hear from a Caribbean dugout.
   One is picked at random for each swing. The English is there because this
   is still a vocabulary app.
   ------------------------------------------------------------------------- */
const DUGOUT_PHRASES = [
  { es: '¡Vamos!',             en: "Let's go!" },
  { es: '¡Dale!',              en: 'Come on!' },
  { es: '¡Tú puedes!',         en: 'You can do it!' },
  { es: '¡Échale!',            en: 'Go get it!' },
  { es: '¡Con todo!',          en: 'With everything!' },
  { es: '¡Duro con ella!',     en: 'Hit it hard!' },
  { es: '¡Sácala del parque!', en: 'Knock it out of the park!' },
  { es: '¡Ahora sí!',          en: "Now's the time!" },
  { es: '¡Métele!',            en: 'Give it a ride!' },
  { es: '¡Esa es tuya!',       en: "That one's yours!" },
  { es: '¡Sin miedo!',         en: 'No fear!' },
  { es: '¡Vamos, campeón!',    en: "Let's go, champ!" },
  { es: '¡Rómpela!',           en: 'Crush it!' },
  { es: '¡Enséñale!',          en: 'Show him what you have!' },
  { es: '¡Esa va lejos!',      en: "That one's going a long way!" },
  { es: '¡Suénala!',           en: 'Smack it!' },
  { es: '¡Se puede!',          en: 'It can be done!' },
  { es: '¡Ponle sabor!',       en: 'Put some flavour on it!' },
  { es: '¡Nadie como tú!',     en: 'Nobody like you!' },
  { es: '¡Aquí te esperamos!', en: "We'll be waiting for you at the plate!" }
];


/* -------------------------------------------------------------------------
   9b. THE COACH
   A separate voice, and deliberately not more of the same. The bench shouts
   encouragement; the third-base coach gives an instruction — something to
   actually do with your hands, your weight, or your eyes on this pitch.

   Kept in its own bank rather than mixed into the dugout for two reasons:
   the two are drawn together, one from each, so they must not collide; and
   a directive read in a hype voice stops being a directive.
   ------------------------------------------------------------------------- */

const COACH_PHRASES = [
  { es: '¡Espera tu pitcheo!', en: 'Wait for your pitch!' },
  { es: '¡Ojo con la recta!',  en: 'Watch for the fastball!' },
  { es: '¡Quédate atrás!',     en: 'Stay back on it!' },
  { es: '¡No te abras!',       en: "Don't fly open!" },
  { es: '¡Codo arriba!',       en: 'Elbow up!' },
  { es: '¡Sigue la bola!',     en: 'Track the ball all the way in!' },
  { es: '¡Suelta las manos!',  en: 'Let your hands go!' },
  { es: '¡Al centro, nada más!', en: 'Up the middle, nothing more!' },
  { es: '¡Mira la costura!',   en: 'Watch the seams!' },
  { es: '¡Con calma, respira!', en: 'Easy — breathe!' },
  { es: '¡No te adelantes!',   en: "Don't get out in front of it!" },
  { es: '¡Manos rápidas!',     en: 'Quick hands!' }
];


/* -------------------------------------------------------------------------
   9f. THE BONUS OFFER — risk on the language, reward on the timing

   Three answers in a row no longer banks a swing outright. It OFFERS one,
   and the offer is a real decision because both branches cost something.

     accept -> a HOMERUN-tier word on a longer clock
       miss it        an out. This is the only risk in the whole mechanic,
                      and it is a language risk, which is the point.
       answer it      the inning is extended, and the swing is earned.
     decline -> the bank persists and is re-offered by the next two streaks.

   WHY THE REWARD IS AT-BATS AND NOT RUNS. Simulated first, and the first
   three designs all failed: a bonus at-bat was a WORSE home-run machine than
   an ordinary one. At 85% accuracy an ordinary at-bat answered fast produces
   a home run 97.9% of the time; the bonus produced one 70.0% of the time and
   charged an out for failing. Paying in runs offers the player a worse
   version of something they already get for free, so declining won at every
   accuracy — even when the home run was made completely free of risk.

   Under a cap, at-bats are the scarce resource. Paying in at-bats is paying
   in something ordinary play cannot manufacture, and it is the only variant
   of four that made accepting correct.

   WHY THERE IS A CEILING. The reward is denominated in exactly the thing
   AT_BATS_PER_INNING exists to bound, and it compounds with skill: at 90%
   accuracy an uncapped +5 ran the median inning to 74 at-bats against a cap
   of 40. MAX_INNING_EXTENSION stops the reward outgrowing the bound it is
   paid in. At +10 the inning is hard-bounded at 50 and accepting is still
   correct at 85% and above.

   Measured at 4000 innings a cell, +5 per bonus, ceiling +10:

     acc    runs declining   runs accepting under 2 outs   at-bats
     75%        29.8              25.9  (decline)          28/50
     85%        38.6              41.3  (accept)           50/50
     90%        39.5              45.3  (accept)           50/50
   ------------------------------------------------------------------------- */

const BONUS_STREAK_OFFERS   = 3;      // the offer, then two more streaks
const BONUS_QUESTION_MS     = 7000;   // its own clock, not the swing's
const BONUS_EXTRA_AT_BATS   = 5;
const MAX_INNING_EXTENSION  = 10;

// A completed streak either opens a bank or re-offers the one being held.
// Offers happen on streak completion only, never once per at-bat.
function streakOffer(streak, offersLeft) {
  if (streak < BONUS_STREAK) return { offer: false, offersLeft };
  return { offer: true, offersLeft: offersLeft > 0 ? offersLeft : BONUS_STREAK_OFFERS };
}

function declineOffer(offersLeft) { return Math.max(0, offersLeft - 1); }

// Winning the question extends the inning, up to a ceiling measured from the
// base cap rather than from wherever the cap has already been pushed.
function extendInning(cap, extra = BONUS_EXTRA_AT_BATS, ceiling = MAX_INNING_EXTENSION) {
  // Never shrinks. A ceiling that could pull the cap back down would end an
  // inning early on a reward, which is the opposite of the point.
  return Math.max(cap, Math.min(AT_BATS_PER_INNING + ceiling, cap + extra));
}

/* -------------------------------------------------------------------------
   9g. THE THREE ATTEMPTS

   Fouling off pitches. The first two misses are fouls and cost nothing; the
   third ends the at-bat.

   Missing all three costs NO OUT. The extension was banked the moment the
   question was answered, so the swing is pure upside — charging an out for
   failing to collect a windfall already earned would undo the economics that
   make accepting correct in the first place. The risk lives on the question.

   The escalation is a window squeeze, not a speed-up. Flight speeds up for
   the look of it, but at a fixed 240ms budget a faster ball gets a LARGER
   drawn band — 20.4px at 2000ms against 25.5px at 1600ms — so speed alone
   is decoration. Attempt three takes 200ms, which is a real 17% squeeze.
   1600ms is the floor: 1400ms was measured unreadable.
   ------------------------------------------------------------------------- */

const SWING_ATTEMPTS      = 3;
const ATTEMPT_FLIGHT_MS   = [2000, 1800, 1600];
const ATTEMPT_WINDOW_MS   = [240, 240, 200];

function attemptFlightMs(attempt) {
  return ATTEMPT_FLIGHT_MS[Math.min(Math.max(attempt, 0), SWING_ATTEMPTS - 1)];
}
function attemptWindowMs(attempt) {
  return ATTEMPT_WINDOW_MS[Math.min(Math.max(attempt, 0), SWING_ATTEMPTS - 1)];
}

// 'HOMERUN' | 'FOUL' | 'STRUCK_OUT_SWINGING'. Only the last attempt ends it,
// and even that costs no out.
function resolveAttempt(attempt, pressProgress) {
  const flight = attemptFlightMs(attempt);
  const budget = attemptWindowMs(attempt);
  const contact = contactProgress(pressProgress, SWING_LEAD_MS, flight);
  if (isContact(contact, flight, budget)) return 'HOMERUN';
  return attempt >= SWING_ATTEMPTS - 1 ? 'STRUCK_OUT_SWINGING' : 'FOUL';
}


/* -------------------------------------------------------------------------
   9d. THE HALF-INNING

   Three outs ends it, as it always did. So does running out of at-bats:
   AT_BATS_PER_INNING caps the half-inning so a session is bounded and two
   sessions are comparable.

   The cap is a Timed rule and lives here rather than in the shared rules.js
   on purpose. Classic charges an out for every wrong answer, so 100% of
   Classic innings resolve by outs at every accuracy measured — capping it
   would introduce a problem rather than fix one.

   Sized off sim-innings.js rather than off a guess. At 40, an inning at 60%
   accuracy still ends by outs 97% of the time and its median length does not
   move; at 75% both endings are live, 54% outs and 46% cap; at 85% and up,
   where the out rule had effectively stopped firing, the cap is the ending.
   A cap at the median of the learner band, which is where intuition puts it,
   truncates half of that band by construction — the number has to be sized
   against the tail, not the middle.

   inningOver only reports WHY. What it looks like is the UI's problem.
   ------------------------------------------------------------------------- */

const MAX_OUTS           = 3;
const AT_BATS_PER_INNING = 40;

// 'OUTS' | 'CAP' | 'DECK' | null. Outs win ties: an inning that reached three
// outs on its last legal at-bat ended by outs, not by the clock.
function inningOver(outs, atBats, deckLength, cap = AT_BATS_PER_INNING) {
  if (outs >= MAX_OUTS)     return 'OUTS';
  if (atBats >= cap)        return 'CAP';
  if (atBats >= deckLength) return 'DECK';
  return null;
}

/* -------------------------------------------------------------------------
   9e. RETIRING THE SIDE

   When the cap ends it, the count has to reach three or the scoreboard
   contradicts the story: a half-inning that ends showing one out reads as a
   bug, not as an ending.

   The beat has to fit the diamond. A play records the batter plus whoever is
   on base and no more, so you cannot turn two on an empty one. Where the
   field cannot support a multi-out play the batters go down in order
   instead — which is what actually happens, and needs nothing invented.

   The runners a multi-out play retires come off the bases, so the box
   score's LOB agrees with what was just called.
   ------------------------------------------------------------------------- */

const IN_A_ROW = { 2: 'Dos', 3: 'Tres' };

function retireTheSide(outs, bases) {
  const needed  = MAX_OUTS - outs;
  const runners = bases.filter(Boolean).length;
  const next    = bases.slice();

  if (needed <= 0) return { call: null, bases: next, outs };

  // The batter is one out; each runner on base can be another.
  const onOnePlay = needed <= 1 + runners;
  let call;

  if (needed === 1) {
    call = { es: '¡Atrapada!', en: 'Caught — that is three.' };
  } else if (onOnePlay) {
    call = needed === 2
      ? { es: '¡Doble matanza!',  en: 'Double play — the side is retired.' }
      : { es: '¡Triple matanza!', en: 'Triple play — the side is retired.' };
    // Lead runner first, the way a force play actually goes.
    let taking = needed - 1;
    for (let base = 2; base >= 0 && taking > 0; base--) {
      if (next[base]) { next[base] = false; taking--; }
    }
  } else {
    call = { es: `¡${IN_A_ROW[needed]} al hilo!`,
             en: `${needed} down in a row — the side is retired.` };
  }

  return { call, bases: next, outs: MAX_OUTS };
}


/* -------------------------------------------------------------------------
   10. WHICH WAY THE PITCH COMES
   Each new word is shown in one of two directions, picked at random:

     ES_TO_EN  the Spanish word, with English choices
     EN_TO_ES  the English meaning, with Spanish choices

   The direction belongs to the AT-BAT, not to each pitch. That is what
   "fresh per pitch, but preserved on a re-pitch" actually means here: a
   strike brings the same word back, so every pitch after the first is a
   re-pitch and must keep the direction it was first shown in. Picking
   again on a new word is what keeps it unpredictable.
   ------------------------------------------------------------------------- */

const DIRECTIONS = ['ES_TO_EN', 'EN_TO_ES'];

// `roll` is a number in [0, 1) — Math.random() in the game, fixed in tests.
function pickDirection(roll) {
  return roll < 0.5 ? 'ES_TO_EN' : 'EN_TO_ES';
}

// What to show, what counts as right, and which field the wrong answers
// have to be drawn from so the choices are all in one language.
function promptFor(word, direction) {
  return direction === 'EN_TO_ES'
    ? { prompt: word.en, answer: word.es, promptLang: 'en', answerLang: 'es' }
    : { prompt: word.es, answer: word.en, promptLang: 'es', answerLang: 'en' };
}


/* -------------------------------------------------------------------------
   WHAT IS SHARED AND WHAT IS NOT
   The word list, shuffle and the base-running rules now live in rules.js,
   shared with Classic. What stays here is what this mode alone decides:
   how a hit is earned from the clock, what a tier means, how an at-bat
   ends, and when a power swing is banked.
   ------------------------------------------------------------------------- */

// Usable as a plain <script> in the browser and as a module under Node, so
// the rules can be tested without a browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TIMED_TIERS, MAX_STRIKES, SPEED_BANDS,
    MAX_OUTS, AT_BATS_PER_INNING, inningOver, retireTheSide,
    BONUS_STREAK_OFFERS, BONUS_QUESTION_MS, BONUS_EXTRA_AT_BATS,
    MAX_INNING_EXTENSION, streakOffer, declineOffer, extendInning,
    SWING_ATTEMPTS, ATTEMPT_FLIGHT_MS, ATTEMPT_WINDOW_MS,
    attemptFlightMs, attemptWindowMs, resolveAttempt,
    BONUS_STREAK, BONUS_LIFE_MIN, BONUS_LIFE_MAX,
    windowForTag, bucketForTag, hitForResponse, applyPitch, isFreeSwingTier,
    rollBonusLife, applyAtBatToBonus, newAtBat, newTimedState,
    HIT_ADVANCE,
    DUGOUT_PHRASES, COACH_PHRASES,
    UMPIRE_CALLS, umpireCall, pitchTimedOut,
    PITCH_WINDUP_MS, PITCH_FLIGHT_MS, PLATE_AT,
    CONTACT_WINDOW_MS, contactWindowFraction,
    ballProgressAt, isContact, swingVerdict, contactWindowMs,
    SWING_LEAD_MS, contactProgress, leadProgress, pressWindow,
    READY_READ_MS, READY_CUE_MS, readyHoldMs,
    DIRECTIONS, pickDirection, promptFor,
    // shared, re-exported so timed-test.js has a single import
    VOCAB, shuffle, advanceOnHit
  };
}
