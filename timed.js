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
function applyPitch(strikes, correct, elapsedMs, windowMs) {
  const hit = correct ? hitForResponse(elapsedMs, windowMs) : null;

  // Beat the clock with the right answer and the count no longer matters —
  // you can homer on an 0-2 count, same as in a real at-bat.
  if (hit) return { strikes, result: 'HIT', hit };

  const nextStrikes = strikes + 1;
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

  // 2. Only a hit extends the streak.
  const nextStreak = result === 'HIT' ? streak + 1 : 0;

  // 3. Three in a row banks a fresh swing, replacing any older one.
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
function newAtBat(tag) {
  return {
    tag,                          // the word's tier, which set the window
    windowMs: windowForTag(tag),
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
    hitStreak: 0,       // at-bats ending in a hit, back to back
    bonus: null,        // { atBatsLeft } once a swing is banked
    swing: null,        // the power-swing moment, when one is being taken
    missed: [],
    locked: false
  };
}


/* -------------------------------------------------------------------------
   NOTE ON DUPLICATION
   rollBonusLife and the ageing half of applyAtBatToBonus also exist in
   app.js. That is deliberate for now: this branch must not touch Classic.
   Once this mode settles, both should move to a shared rules module — a
   change that edits Classic on purpose rather than by accident.
   ------------------------------------------------------------------------- */

// Usable as a plain <script> in the browser and as a module under Node, so
// the rules can be tested without a browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TIMED_TIERS, MAX_STRIKES, SPEED_BANDS,
    BONUS_STREAK, BONUS_LIFE_MIN, BONUS_LIFE_MAX,
    windowForTag, bucketForTag, hitForResponse, applyPitch,
    rollBonusLife, applyAtBatToBonus, newAtBat, newTimedState
  };
}
