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
    hitStreak: 0,       // at-bats ending in a hit, back to back
    bonus: null,        // { atBatsLeft } once a swing is banked
    swing: null,        // the power-swing moment, when one is being taken
    missed: [],
    locked: false
  };
}


/* -------------------------------------------------------------------------
   6. SCORING A HIT
   Hits move runners the same way they do in Classic: every runner advances
   as far as the batter goes. There are no walks in this mode — a WALK-tagged
   word is just an easy word now, and what it earns comes from the clock.
   ------------------------------------------------------------------------- */
const HIT_ADVANCE = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3, HOMERUN: 4 };

function advanceOnHit(bases, advance) {
  const next = [false, false, false];
  let runs = 0;

  bases.forEach((occupied, index) => {
    if (!occupied) return;
    const destination = index + advance;   // 3 or more means home
    if (destination > 2) runs++;
    else next[destination] = true;
  });

  if (advance > 3) runs++;                 // home run: the batter scores too
  else next[advance - 1] = true;

  return { bases: next, runs };
}


/* -------------------------------------------------------------------------
   7. THE WORD LIST
   The same 30 words Classic uses. Duplicated on purpose while this mode
   proves itself — see the note at the bottom of the file. The tags mean
   difficulty here, which is what sets each word's clock.
   ------------------------------------------------------------------------- */
const TIMED_VOCAB = [
  { es: 'el béisbol',     en: 'baseball',        tag: 'WALK'   },
  { es: 'la pelota',      en: 'the ball',        tag: 'WALK'   },
  { es: 'el bate',        en: 'the bat',         tag: 'WALK'   },
  { es: 'el guante',      en: 'the glove',       tag: 'WALK'   },
  { es: 'el equipo',      en: 'the team',        tag: 'WALK'   },
  { es: 'el jugador',     en: 'the player',      tag: 'WALK'   },
  { es: 'correr',         en: 'to run',          tag: 'WALK'   },
  { es: 'el lanzador',    en: 'the pitcher',     tag: 'SINGLE' },
  { es: 'el bateador',    en: 'the batter',      tag: 'SINGLE' },
  { es: 'la carrera',     en: 'the run (score)', tag: 'SINGLE' },
  { es: 'la gorra',       en: 'the cap',         tag: 'SINGLE' },
  { es: 'atrapar',        en: 'to catch',        tag: 'SINGLE' },
  { es: 'lanzar',         en: 'to throw/pitch',  tag: 'SINGLE' },
  { es: 'ganar',          en: 'to win',          tag: 'SINGLE' },
  { es: 'el receptor',    en: 'the catcher',             tag: 'DOUBLE' },
  { es: 'el jardinero',   en: 'the outfielder',          tag: 'DOUBLE' },
  { es: 'la entrada',     en: 'the inning',              tag: 'DOUBLE' },
  { es: 'el montículo',   en: "the pitcher's mound",     tag: 'DOUBLE' },
  { es: 'el árbitro',     en: 'the umpire',              tag: 'DOUBLE' },
  { es: 'ponchar',        en: 'to strike (someone) out', tag: 'DOUBLE' },
  { es: 'el toletero',    en: 'the slugger',        tag: 'TRIPLE' },
  { es: 'el campocorto',  en: 'the shortstop',      tag: 'TRIPLE' },
  { es: 'la recta',       en: 'the fastball',       tag: 'TRIPLE' },
  { es: 'el relevista',   en: 'the relief pitcher', tag: 'TRIPLE' },
  { es: 'la antesala',    en: 'third base',         tag: 'TRIPLE' },
  { es: 'el cuadrangular',      en: 'the home run',            tag: 'HOMERUN' },
  { es: 'la carrera impulsada', en: 'the run batted in (RBI)', tag: 'HOMERUN' },
  { es: 'el emergente',         en: 'the pinch hitter',        tag: 'HOMERUN' },
  { es: 'el inicialista',       en: 'the first baseman',       tag: 'HOMERUN' },
  { es: 'la almohadilla',       en: 'the base (bag)',          tag: 'HOMERUN' }
];


/* -------------------------------------------------------------------------
   8. THE POWER SWING
   Spending a banked swing replaces the whole at-bat: no word, no clock, no
   count. A marker sweeps a bar and one press stops it. Inside the sweet
   spot is a home run; outside it is an out — the at-bat ends either way.

   Both of these are pure functions of time and position, so the timing is
   testable without running the animation.
   ------------------------------------------------------------------------- */

const SWING_SWEET_MIN = 0.38;   // sweet spot, as a fraction of the bar
const SWING_SWEET_MAX = 0.62;
const SWING_PERIOD_MS = 1700;   // one full sweep out and back

// Where the marker sits, 0..1, after this long. It ping-pongs, so the sweet
// spot is crossed twice per cycle.
function markerPositionAt(elapsedMs, period = SWING_PERIOD_MS) {
  const t = (elapsedMs % period) / period;
  return t < 0.5 ? t * 2 : (1 - t) * 2;
}

// Did the swing connect?
function isSwingOnTime(position) {
  return position >= SWING_SWEET_MIN && position <= SWING_SWEET_MAX;
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
  { es: '¡Vamos, campeón!',    en: "Let's go, champ!" }
];


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
   NOTE ON DUPLICATION
   rollBonusLife, advanceOnHit and the word list also exist in app.js. That
   is deliberate: this branch must not touch Classic, and unifying them
   before this mode has proven itself would mean editing Classic for the
   sake of a mode that might not survive. Once this is built, tested and
   actually played, that is the moment to consolidate — not before.
   ------------------------------------------------------------------------- */

// Usable as a plain <script> in the browser and as a module under Node, so
// the rules can be tested without a browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TIMED_TIERS, MAX_STRIKES, SPEED_BANDS,
    BONUS_STREAK, BONUS_LIFE_MIN, BONUS_LIFE_MAX,
    windowForTag, bucketForTag, hitForResponse, applyPitch,
    rollBonusLife, applyAtBatToBonus, newAtBat, newTimedState,
    HIT_ADVANCE, advanceOnHit, TIMED_VOCAB,
    SWING_SWEET_MIN, SWING_SWEET_MAX, SWING_PERIOD_MS,
    markerPositionAt, isSwingOnTime, DUGOUT_PHRASES,
    DIRECTIONS, pickDirection, promptFor
  };
}
