/* THE BASEBALL LADDER — five answer clocks, sized from a sweep.

   Scope, from the brief: the answer clock and the question cycle only. Ball
   flight, CONTACT_WINDOW_MS and the swing are not touched and are not
   modelled here — no code path below reaches them.

   ---------------------------------------------------------------------
   WHAT A LEVEL IS, IN THIS MODEL

   A level is a multiplier on windowForTag(tag). It is not an absolute
   clock, because the tiers deliberately give a hard word more time than an
   easy one, and flattening that to one number would be a tier change
   wearing a difficulty hat. Multiplying keeps the tier structure and moves
   the whole ladder.

   ---------------------------------------------------------------------
   THE PLAYER MODEL, WHICH IS THE ASSUMPTION IN THIS WHOLE FILE

   Every earlier sim on this project swept ACCURACY as the unknown input.
   That cannot answer this question: the whole point of a slower clock is
   that accuracy is an OUTPUT of the clock, not an input to it. So this one
   sweeps the player one layer down, as two things:

     pKnow    can they retrieve this word at all, by bucket
     rtMedian how long retrieval takes them, in milliseconds

   Response time is lognormal — the standard shape for lexical retrieval,
   right-skewed with a long tail, because recall is occasionally much slower
   than usual and never much faster. sigma = 0.45 in log space, which puts
   the 90th percentile at about 1.8x the median.

     they know it      -> RT ~ lognormal(median, sigma); correct if RT fits
     they do not       -> they deliberate 1.5x as long, then guess one of
                          four, so 25% right if the guess lands in time

   NONE OF THESE NUMBERS ARE MEASURED. There is no instrumented build and no
   RT data from the user test, so the profiles below are calibrated to
   reproduce, at today's clock, the accuracy bands the earlier sims used
   (60-90%) — and the sweep is reported across all five profiles precisely
   because the answer's shape depends on which one a real tester is.
   ------------------------------------------------------------------- */

const T = require('./timed.js');
const { VOCAB, shuffle, applyPitch, bucketForTag, windowForTag, hitForResponse,
        MAX_OUTS, AT_BATS_PER_INNING, inningOver, advanceOnHit, HIT_ADVANCE } = T;

const N       = 4000;    // innings per cell
const SIGMA   = 0.45;    // lognormal spread of retrieval time
const GUESS_SLOWDOWN = 1.5;
const CHOICES = 4;
const FEEDBACK_MS = 1500;    // setTimeout(afterPitch, 1500) in timed-ui.js

// Box-Muller, then exponentiate: a lognormal draw.
function lognormal(median, sigma) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return median * Math.exp(sigma * z);
}

const LEARNERS = [
  { name: 'first encounter', rt: 2600, know: { easy: 0.55, medium: 0.40, hard: 0.25 } },
  { name: 'less confident',  rt: 2000, know: { easy: 0.72, medium: 0.58, hard: 0.42 } },
  { name: 'improving',       rt: 1500, know: { easy: 0.85, medium: 0.72, hard: 0.55 } },
  { name: 'confident',       rt: 1100, know: { easy: 0.93, medium: 0.85, hard: 0.72 } },
  { name: 'fluent',          rt:  800, know: { easy: 0.97, medium: 0.93, hard: 0.85 } }
];

/* One pitch, from the player's side only. Returns how long they took and
   whether they picked the right meaning — the rules decide what that is
   worth, not this function. */
function respond(learner, bucket) {
  if (Math.random() < learner.know[bucket]) {
    return { ms: lognormal(learner.rt, SIGMA), right: true };
  }
  return {
    ms: lognormal(learner.rt * GUESS_SLOWDOWN, SIGMA),
    right: Math.random() < 1 / CHOICES
  };
}

/* One half-inning at one level.

   bands 'scaled'   the status quo: SPEED_BANDS are fractions of the window,
                    so stretching the window stretches the hit ladder with
                    it. A slower level buys reading time AND cheaper home
                    runs.
   bands 'pinned'   the hit ladder stays on the base window and the extra
                    time only buys survival: an answer past the base window
                    but inside the level's window is a SINGLE, not a strike.

   'pinned' is driven through the real applyPitch too — passing the base
   window with a clamped elapsed lands exactly on the 1.00 band, which is
   SINGLE. No rule is re-implemented here. */
/* A level is either a multiplier or a table of clocks by bucket. The table
   form exists because the badge on screen shows the number — "EASY · 3.0s"
   — so the values a player reads should be round, and a single multiplier
   gives things like 2.55s. openFor() takes either. */
function openFor(level, tag) {
  const base = windowForTag(tag);
  if (typeof level === 'number') return base * level;
  return level.clock[bucketForTag(tag)];
}

function inning(learner, level, bands, cap = AT_BATS_PER_INNING, feedback = FEEDBACK_MS) {
  const deck = shuffle(VOCAB);
  let outs = 0, ab = 0, i = 0, runs = 0, bases = [false, false, false];
  let pitches = 0, right = 0, timeouts = 0, ms = 0;
  const hits = { SINGLE: 0, DOUBLE: 0, TRIPLE: 0, HOMERUN: 0 };

  while (!inningOver(outs, ab, deck.length, cap)) {
    const w = deck[i], bucket = bucketForTag(w.tag);
    const base = windowForTag(w.tag), open = openFor(level, w.tag);
    ab++;
    let strikes = 0;
    for (;;) {
      const r = respond(learner, bucket);
      const inTime = r.ms <= open;
      pitches++;
      if (r.right && inTime) right++;
      if (!inTime) timeouts++;
      ms += Math.min(r.ms, open) + feedback;

      const p = bands === 'pinned'
        ? applyPitch(strikes, r.right && inTime, Math.min(r.ms, base), base, w.tag)
        : applyPitch(strikes, r.right, r.ms, open, w.tag);
      strikes = p.strikes;
      if (p.result === 'HIT') {
        hits[p.hit]++;
        const adv = advanceOnHit(bases, HIT_ADVANCE[p.hit]);
        bases = adv.bases; runs += adv.runs;
        break;
      }
      if (p.result === 'OUT') { outs++; break; }
    }
    i++;
  }
  return { runs, ab, outs, pitches, right, timeouts, ms, hits,
           ending: inningOver(outs, ab, deck.length, cap) };
}

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct  = (a, b) => b === 0 ? 0 : 100 * a / b;

function cell(learner, level, bands, cap = AT_BATS_PER_INNING, feedback = FEEDBACK_MS, n = N) {
  const R = [], A = [], M = [], acc = [], to = [], endings = {};
  const hits = { SINGLE: 0, DOUBLE: 0, TRIPLE: 0, HOMERUN: 0 };
  for (let k = 0; k < n; k++) {
    const r = inning(learner, level, bands, cap, feedback);
    R.push(r.runs); A.push(r.ab); M.push(r.ms);
    acc.push(pct(r.right, r.pitches)); to.push(pct(r.timeouts, r.pitches));
    endings[r.ending] = (endings[r.ending] || 0) + 1;
    for (const k2 of Object.keys(hits)) hits[k2] += r.hits[k2];
  }
  M.sort((a, b) => a - b); A.sort((a, b) => a - b);
  return {
    acc: mean(acc), timeout: mean(to), runs: mean(R),
    abMed: A[Math.floor(0.5 * A.length)], abP90: A[Math.floor(0.9 * A.length)],
    minMed: M[Math.floor(0.5 * M.length)] / 60000,
    minP90: M[Math.floor(0.9 * M.length)] / 60000,
    capShare: pct(endings.CAP || 0, n),
    hr: hits.HOMERUN / n, single: hits.SINGLE / n
  };
}

/* The five proposed levels. Clocks are stated in whole and half seconds
   because the tier badge puts the number on screen; the effective
   multiplier against today's 3/4/5s is shown for reference only. */
const LADDER = [
  { name: 'Rookie',       clock: { easy: 5000, medium: 6500, hard: 8000 } },
  { name: 'Single-A',     clock: { easy: 4000, medium: 5000, hard: 6500 } },
  { name: 'Double-A',     clock: { easy: 3000, medium: 4000, hard: 5000 } },   // today
  { name: 'Triple-A',     clock: { easy: 2500, medium: 3500, hard: 4000 } },
  { name: 'Major League', clock: { easy: 2000, medium: 2500, hard: 3500 } }
];

module.exports = { LEARNERS, LADDER, cell, inning, openFor, FEEDBACK_MS, SIGMA };
