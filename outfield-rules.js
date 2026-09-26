/* OUTFIELDER — THE RULES LAYER.

   Pure. No DOM, no timers, no Math.random inside a decision. Randomness
   arrives as a parameter so a test can drive it, which is the same
   discipline timed.js already keeps and the reason timed-test.js runs in
   plain Node.

   This file owns the mechanic's constants. outfield.js (the simulation)
   and pace-band.js read them from here rather than declaring their own,
   so there is exactly one place a number lives.

   Runner advancement is advanceOnHit from timed.js, unchanged: the
   fielding hit ladder IS the batting one read backwards, so it is the
   same function rather than a second copy of it.
   ------------------------------------------------------------------- */

/* The ladder and base running are shared with the timed mode. In the
   browser timed.js is already loaded by the time this runs and its
   top-level declarations are in scope; under Node it has to be pulled in.
   Unlike rules.js, timed.js does not assign itself onto globalThis, so
   the bare names used below are put in scope here. */
if (typeof require !== 'undefined' && typeof module !== 'undefined') {
  Object.assign(globalThis, require('./timed.js'));
}

/* ---- the clock ------------------------------------------------------

   FIRST HUMAN CALIBRATION, 26 Sep. A tester at ROOKIE — the slowest rung
   — reported the flight as too fast to read all four candidates. That is
   the one data point no sweep could produce, and it says 4000ms flat was
   wrong at the bottom of the ladder.

   The flight is now per-rung, and DERIVED rather than guessed again. The
   answer clock in timed.js is the only reading budget in this project
   that has ever met a human, so the fielding flight is read off it:
   FLIGHT_BY_LEVEL[i] is that rung's HARD answer clock.

   The mapping onto `hard` is a judgement and worth stating. The answer
   clock budgets reading ONE word and picking between four English
   glosses. A fielding slot is strictly more work — a part-built sentence
   to re-read, plus four morphological near-misses of a single lemma that
   have to be told apart rather than recognised. So the fielding read gets
   the most generous budget its rung offers, not the middle one.

   What it buys, against the player model: every rung's flight now clears
   the p98 read time of the fielder that rung is for. A first-encounter
   player dropped 16.9% of volleys at 4000ms and drops 0.6% at 8000ms.
   And because a dropped volley costs a whole re-pitch, a LONGER flight
   makes a beginner's half-inning shorter, not longer — measured, not
   assumed; see the commit.

   Still proposed above Rookie: only the bottom rung has been played. */
const FLIGHT_BY_LEVEL = LEVELS.map(lv => lv.clock.hard);

/* The sims take the flight as a parameter and sweep it. This is the base
   rung's value, for callers that want one number rather than a ladder —
   read from the ladder, never typed. */
const FLIGHT_MS   = FLIGHT_BY_LEVEL[DEFAULT_LEVEL];
const flightFor   = rungIndex => FLIGHT_BY_LEVEL[rungIndex];

const SETTLE_MS   = 600;    // the caught word travelling into the blank
const HIT_BEAT_MS = 1500;   // a conceded hit playing out
const REVEAL_MS   = 1800;   // the correct word, shown plainly, after grace

/* The beat a finished sentence holds before the next one, which is now
   long enough to read a full English translation rather than just a
   score line. Proposed: nobody has been timed reading one. It is here
   rather than in the UI because it is three of these a half-inning and
   the simulation's duration is wrong without it. */
const SENTENCE_MS = 3500;

const OUTS_PER_HALF = 3;    // three completed sentences
const GRACE = 1;            // wrong catches a slot absorbs before one concedes

/* Sentence length by rung, indexed off the real ladder so a level added
   or reordered there cannot leave this behind. */
const SLOTS_BY_LEVEL = [3, 4, 5, 6, 7];
if (SLOTS_BY_LEVEL.length !== LEVELS.length) {
  throw new Error(`sentence lengths (${SLOTS_BY_LEVEL.length}) and the ladder (${LEVELS.length}) disagree`);
}

/* ---- the hit band, measured against the player rather than the clock */
const PACE_BANDS = [
  { within: 0.50, hit: 'HOMERUN' },   // half your own pace: a grab, not a read
  { within: 0.75, hit: 'TRIPLE'  },
  { within: 1.00, hit: 'DOUBLE'  },
  { within: Infinity, hit: 'SINGLE' }
];
const PACE_WINDOW = 20;     // catches the rolling median keeps
const PACE_MIN    = 8;      // real catches before the band engages
const PACE_FROM   = 'ALL';  // a wrong catch is still evidence about timing
const WARMUP      = 'SINGLE';
const COLD_CAP    = 'DOUBLE';  // ceiling on any verdict from a stored median

const RANK = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3, HOMERUN: 4 };

function makePace(windowSize = PACE_WINDOW, seed = []) {
  const buf = seed.slice(-windowSize);
  return {
    push(t) { buf.push(t); if (buf.length > windowSize) buf.shift(); },
    n: () => buf.length,
    all: () => buf.slice(),
    median() {
      if (!buf.length) return null;
      const a = [...buf].sort((x, y) => x - y);
      const h = a.length >> 1;
      return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
    }
  };
}

function hitForPace(elapsedMs, pace) {
  const r = elapsedMs / pace;
  for (const b of PACE_BANDS) if (r <= b.within) return b.hit;
  return 'SINGLE';
}

const capTo = (verdict, cap) => RANK[verdict] > RANK[cap] ? cap : verdict;

/* What a conceded catch is worth.

   Three cases, in the order they apply:
     warm            the rolling window has PACE_MIN real catches of its own
     cold + stored   a median carried in from an earlier session, capped
     cold, nothing   the mildest verdict — never punish for a call the
                     system cannot yet make */
function verdictFor(elapsedMs, pace, stored) {
  if (pace.n() >= PACE_MIN) {
    return { hit: hitForPace(elapsedMs, pace.median()), basis: 'PACE', cold: false };
  }
  if (stored && stored > 0) {
    return { hit: capTo(hitForPace(elapsedMs, stored), COLD_CAP), basis: 'STORED', cold: true };
  }
  return { hit: WARMUP, basis: 'COLD', cold: true };
}

/* ---------------------------------------------------------------------
   DETERMINABILITY

   Blanks fill strictly left to right, so when a slot goes live everything
   to its right that is also blanked is still empty. A slot whose
   disambiguating token is a LATER blank is asking a question the screen
   has not finished asking. Requirements pointing left are fine — the
   player has already put a word there.
   ------------------------------------------------------------------- */
const NEVER_BLANK = ['CONJ', 'PREP'];

/* A token can fail to be a slot in TWO different ways, and this function
   only ever knew about one of them.

   DIRECTIONALITY is the one below: the decider exists but is a later
   blank. That is a property of the chosen SET, so it belongs in the
   search.

   UNDETERMINABLE IN ITSELF is the other: nothing on screen could ever
   settle this token, whatever else is blanked. A finite verb in a
   sentence with no second verb has no tense anchor. A scoreline is a
   fact, not a form. A subjectless verb has no person. These are
   properties of the TOKEN, so they belong here, and `blankable: false`
   with a reason is how a sentence says so.

   The gap was found by encoding a candidate's missing tense anchor as a
   requirement pointing at a token that does not exist. `answerable` only
   fails on a requirement that is blanked and to the right, so a phantom
   index is never blanked and the requirement was trivially satisfied —
   the function reported a ceiling of 3 for a sentence that can carry
   one. It is the same failure class as the null-subject seeds, which the
   bank validator caught only because they had been authored as slots
   first. Anything that reaches slotCeiling has not been authored yet. */
const contentTokens = entry =>
  entry.tokens
    .filter(t => !NEVER_BLANK.includes(t.pos))
    .filter(t => t.blankable !== false)
    .map(t => t.i);

/* Why each excluded token cannot be a slot — so the ceiling is a
   diagnosis rather than a number. */
const unblankable = entry => entry.tokens
  .filter(t => NEVER_BLANK.includes(t.pos) || t.blankable === false)
  .map(t => ({ i: t.i, form: t.form,
               why: t.blankable === false ? (t.why || 'marked unblankable')
                                          : `${t.pos}, never blanked` }));

const requiresOf = (entry, i) => (entry.tokens[i] && entry.tokens[i].requires) || [];

function answerable(entry, blanked, i) {
  return requiresOf(entry, i).every(r => {
    // A requirement pointing at a token that is not in the sentence can
    // never be met. Treating it as satisfied is what hid the bug above.
    if (!entry.tokens.some(t => t.i === r.token)) return false;
    return !(blanked.includes(r.token) && r.token > i);
  });
}

const validSet = (entry, blanked) => blanked.every(i => answerable(entry, blanked, i));

/* The largest set of tokens this sentence can carry as slots at once.
   Exhaustive over the content tokens — they are few, and a heuristic
   here would be a number nobody checked. */
function slotCeiling(entry) {
  const content = contentTokens(entry);
  let best = [];
  for (let mask = 0; mask < (1 << content.length); mask++) {
    const set = content.filter((_, k) => mask & (1 << k));
    if (set.length > best.length && validSet(entry, set)) best = set;
  }
  return { content, max: best.length, example: best };
}

/* Which tokens had to be left out, and why — so an author can see what
   to change rather than only that the number is short. */
function exclusions(entry) {
  const content = contentTokens(entry);
  const out = [];
  for (const i of content) {
    for (const r of requiresOf(entry, i)) {
      if (r.token > i && content.includes(r.token)) {
        out.push({ slot: i, blocks: r.token, why: r.why });
      }
    }
  }
  return out;
}

/* WHICH SLOTS A RUNG BLANKS.

   Lowest morphological density first. That is not an arbitrary ordering:
   a slot with lexical distractors carries an English lemma, because
   grammar cannot separate carreras from entradas from bases — and a
   glossed slot is the easier one. So ordering by density gives the low
   rungs the glossed noun slots and adds a bare morphological slot at
   each rung up. The gloss rule builds the ladder. */
const morphDensity = slot => slot.distractors.filter(d => d.axis !== 'lexical').length;

function slotsForRung(entry, n) {
  const ceiling = slotCeiling(entry);
  if (n > ceiling.max) {
    return { ok: false, reason: 'CEILING',
      why: `carries at most ${ceiling.max} simultaneous slots, rung needs ${n}` };
  }
  const authored = [...entry.slots].sort(
    (a, b) => morphDensity(a) - morphDensity(b) || a.token - b.token);
  if (authored.length < n) {
    return { ok: false, reason: 'UNAUTHORED',
      why: `${authored.length} slots authored, rung needs ${n}` };
  }
  const tokens = authored.slice(0, n).map(s => s.token).sort((a, b) => a - b);
  if (!validSet(entry, tokens)) {
    return { ok: false, reason: 'INVALID',
      why: `the ${n} lowest-density slots are not a valid set` };
  }
  return { ok: true, tokens };
}

const rungsFor = entry => LEVELS
  .map((lv, i) => ({ i, name: lv.name, slots: SLOTS_BY_LEVEL[i] }))
  .filter(r => slotsForRung(entry, r.slots).ok);

/* ---------------------------------------------------------------------
   THE HALF-INNING

   A state machine rather than a loop, because the UI drives it one catch
   at a time. It holds no timers and reads no clock: the caller says how
   long the catch took.
   ------------------------------------------------------------------- */
function createInning({ entry, rungIndex, pace, stored = null, shuffle }) {
  const pick = slotsForRung(entry, SLOTS_BY_LEVEL[rungIndex]);
  if (!pick.ok) throw new Error(`rung ${rungIndex}: ${pick.why}`);

  const blanked = pick.tokens;
  let outs = 0, runs = 0, slotIndex = 0, missed = 0, completed = false;
  let bases = [false, false, false];
  let filled = {};
  const log = [];

  const liveToken = () => outs >= OUTS_PER_HALF ? null : blanked[slotIndex];
  const slotFor = tok => entry.slots.find(s => s.token === tok);

  return {
    blanked,
    rungIndex,
    entry,
    liveToken,
    over: () => outs >= OUTS_PER_HALF,
    state: () => ({ outs, runs, bases: bases.slice(), filled: { ...filled },
                    blanked, liveToken: liveToken(), sentence: Math.min(outs + 1, OUTS_PER_HALF),
                    slotIndex, missed, grace: GRACE, completed, log: log.slice() }),

    /* The finished line stays on screen until the next sentence starts, so
       the caller can show a player the sentence they just assembled. The
       rules do not decide how long that is — the caller does. */
    beginSentence() { filled = {}; completed = false; },

    /* The four candidates for the live slot, order decided by the caller's
       shuffle so the answer is not always in the same place. */
    balls() {
      const slot = slotFor(liveToken());
      if (!slot) return [];
      const forms = [slot.answer, ...slot.distractors.map(d => d.form)];
      return shuffle ? shuffle(forms) : forms;
    },
    gloss() {
      const slot = slotFor(liveToken());
      return slot ? (slot.gloss || null) : null;
    },
    liveSlot: () => slotFor(liveToken()),

    /* A ball was tapped. `elapsedMs` is how long the volley had been in
       the air. Returns what happened; the caller renders it. */
    catchBall(form, elapsedMs) {
      const tok = liveToken();
      if (tok === null) return { type: 'OVER' };
      const slot = slotFor(tok);

      if (PACE_FROM === 'ALL') pace.push(elapsedMs);

      if (form === slot.answer) {
        if (PACE_FROM === 'CORRECT') pace.push(elapsedMs);
        filled[tok] = slot.answer;
        missed = 0;
        const ev = { type: 'CAUGHT', token: tok, form, elapsedMs };
        log.push(ev);
        advance();
        return ev;
      }

      const d = slot.distractors.find(x => x.form === form);
      if (missed < GRACE) {
        missed++;
        const ev = { type: 'FOUL', token: tok, form, elapsedMs,
                     axis: d.axis, wrongHere: d.wrongHere, used: missed, of: GRACE };
        log.push(ev);
        return ev;
      }

      const v = verdictFor(elapsedMs, pace, stored);
      const play = advanceOnHit(bases, HIT_ADVANCE[v.hit]);
      const scored = play.runs;
      bases = play.bases; runs += scored;
      filled[tok] = slot.answer;
      missed = 0;
      const ev = { type: 'CONCEDE', token: tok, form, elapsedMs,
                   axis: d.axis, wrongHere: d.wrongHere,
                   hit: v.hit, basis: v.basis, cold: v.cold, scored,
                   answer: slot.answer,
                   paceMs: pace.n() >= PACE_MIN ? pace.median() : null,
                   bases: bases.slice(), runs };
      log.push(ev);
      advance();
      return ev;
    },

    /* The volley expired uncaught. Costs the flight and nothing else —
       no out, no hit, no grace. */
    dropVolley() {
      const ev = { type: 'DROPPED', token: liveToken() };
      log.push(ev);
      return ev;
    },

    /* A tap that hit no ball, or fell between two. Costs nothing at all:
       the input model must not leak into the difficulty, or the pace band
       would be measuring finger accuracy alongside retrieval. */
    misTap() { return { type: 'MISTAP' }; }
  };

  function advance() {
    slotIndex++;
    if (slotIndex >= blanked.length) { outs++; slotIndex = 0; completed = true; }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
  FLIGHT_MS, SETTLE_MS, HIT_BEAT_MS, REVEAL_MS, SENTENCE_MS, OUTS_PER_HALF, GRACE,
  SLOTS_BY_LEVEL, FLIGHT_BY_LEVEL, flightFor, PACE_BANDS, PACE_WINDOW,
  PACE_MIN, PACE_FROM, WARMUP, DEFAULT_LEVEL,
  COLD_CAP, RANK, LEVELS,
  makePace, hitForPace, verdictFor, capTo,
  NEVER_BLANK, contentTokens, unblankable, answerable, validSet, slotCeiling, exclusions,
  morphDensity, slotsForRung, rungsFor, createInning
  };
  Object.assign(globalThis, module.exports);
}
