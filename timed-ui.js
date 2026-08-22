/* =========================================================================
   Tiered Timed Pitch — the countdown UI

   This file is the flow and the DOM. Every rule it applies comes from
   timed.js, which knows nothing about the page. The split matters: the
   rules are tested in Node without a browser, and this layer is tested by
   driving it with known elapsed times rather than by racing a real clock.

   The one idea the UI adds: the countdown bar shows what a correct answer
   is worth RIGHT NOW. It starts at HOME RUN and decays through TRIPLE and
   DOUBLE to SINGLE as the clock drains, so the cost of hesitating is on
   screen instead of hidden in a lookup table.
   ========================================================================= */

const PAYOFF_LABEL = { HOMERUN: 'HOME RUN', TRIPLE: 'TRIPLE', DOUBLE: 'DOUBLE', SINGLE: 'SINGLE' };
const MAX_OUTS = 3;

// No opposing side in the game yet, so the visiting line on the outfield
// scorebug is a placeholder. Replace this when there is one.
const VISITOR_RUNS = 2;

let state     = newTimedState(0);
let frame     = null;   // requestAnimationFrame handle for the countdown
let startedAt = 0;      // when the pitch on screen was thrown

const el = {
  pitchScreen: document.getElementById('pitch-screen'),
  tierBadge:   document.getElementById('tier-badge'),
  directionHint: document.getElementById('direction-hint'),
  strikePips:  document.getElementById('strike-pips'),
  timerFill:   document.getElementById('timer-fill'),
  clockNum:    document.getElementById('clock-num'),
  payoff:      document.getElementById('payoff'),
  word:        document.getElementById('word'),
  choices:     document.getElementById('choices'),
  feedback:    document.getElementById('feedback'),

  bankButton: document.getElementById('bank-button'),
  bankLife:   document.getElementById('bank-life'),

  swingScreen:   document.getElementById('swing-screen'),
  dugoutPhrase:  document.getElementById('dugout-phrase'),
  dugoutGloss:   document.getElementById('dugout-gloss'),
  coachPhrase:   document.getElementById('coach-phrase'),
  coachGloss:    document.getElementById('coach-gloss'),
  swingFigure:   document.getElementById('swing-figure'),
  pitchBall:     document.getElementById('pitch-ball'),
  contactZone:   document.getElementById('contact-zone'),
  swingGo:       document.getElementById('swing-go'),
  swingFeedback: document.getElementById('swing-feedback'),

  hudRuns:  document.getElementById('hud-runs'),
  hudOuts:  document.getElementById('hud-outs'),
  hudBank:  document.getElementById('hud-bank'),
  pips:     ['first', 'second', 'third'].map(b => document.getElementById('pip-' + b)),

  // Out in the park, mounted by scene.js before this file runs
  runners:       ['first', 'second', 'third'].map(b => document.getElementById('runner-' + b)),
  boardAwayRuns: document.getElementById('board-away-runs'),
  boardHomeRuns: document.getElementById('board-home-runs'),
  boardInning:   document.getElementById('board-inning'),
  boardOuts:     document.getElementById('board-outs'),

  summary:      document.getElementById('summary-screen'),
  summaryTitle: document.getElementById('summary-title'),
  summarySub:   document.getElementById('summary-sub'),
  sumRuns:      document.getElementById('sum-runs'),
  sumHits:      document.getElementById('sum-hits'),
  sumSingle:    document.getElementById('sum-single'),
  sumDouble:    document.getElementById('sum-double'),
  sumTriple:    document.getElementById('sum-triple'),
  sumHomerun:   document.getElementById('sum-homerun'),
  sumLob:       document.getElementById('sum-lob'),
  missedList:   document.getElementById('missed-list'),
  missedBlock:  document.getElementById('missed-block'),
  playAgain:    document.getElementById('play-again')
};

/* ---------- helpers ---------- */


// Wrong answers have to come from the same field as the right one, or a
// Spanish-first question would offer English distractors. promptFor says
// which field that is.
function buildChoices(word, direction) {
  const face = promptFor(word, direction);
  const wrong = VOCAB
    .filter(w => w[face.answerLang] !== face.answer)
    .map(w => w[face.answerLang]);
  return shuffle([face.answer, ...shuffle(wrong).slice(0, 3)]);
}

function say(text, tone) {
  el.feedback.textContent = text;
  el.feedback.className = 'feedback' + (tone ? ' ' + tone : '');
}

/* ---------- drawing ---------- */

function renderHud() {
  el.hudRuns.textContent = state.runs;
  el.hudOuts.querySelectorAll('.out-dot')
    .forEach((dot, i) => dot.classList.toggle('filled', i < state.outs));
  // Base state reads in three places now: the HUD diamond, the runners out
  // on the field, and the scorebug on the outfield wall.
  state.bases.forEach((on, i) => {
    el.pips[i].classList.toggle('on', on);
    el.runners[i].classList.toggle('on', on);
  });

  el.boardAwayRuns.textContent = VISITOR_RUNS;
  el.boardHomeRuns.textContent = state.runs;
  el.boardInning.textContent   = state.inning;
  el.boardOuts.textContent     = `${state.outs} OUT`;

  // The banked swing is only shown here for now — spending it is the next
  // step, and it will use the sweeping marker we already agreed on.
  el.hudBank.classList.toggle('hidden', !state.bonus);
  el.bankButton.classList.toggle('hidden', !state.bonus);
  if (state.bonus) {
    el.hudBank.textContent  = `SWING BANKED · ${state.bonus.atBatsLeft}`;
    el.bankLife.textContent = `· ${state.bonus.atBatsLeft} at-bat${state.bonus.atBatsLeft > 1 ? 's' : ''} left`;
  }
}

function renderStrikes() {
  el.strikePips.querySelectorAll('.strike-pip')
    .forEach((pip, i) => pip.classList.toggle('on', i < state.atBat.strikes));
}

// The bar drains, and its color and label say what a correct answer earns
// at this instant.
function renderClock(elapsedMs) {
  const windowMs  = state.atBat.windowMs;
  const remaining = Math.max(0, 1 - elapsedMs / windowMs);
  const payoff    = hitForResponse(elapsedMs, windowMs);
  const tone      = payoff ? 'pay-' + payoff.toLowerCase() : 'pay-none';

  el.timerFill.style.width = (remaining * 100) + '%';
  el.timerFill.className   = 'timer-fill ' + tone;
  el.payoff.textContent    = payoff ? PAYOFF_LABEL[payoff] : 'TOO LATE';
  el.payoff.className      = 'payoff ' + tone;
  el.clockNum.textContent  = (Math.max(0, windowMs - elapsedMs) / 1000).toFixed(1);
}

function renderQuestion() {
  const word = state.deck[state.index];
  const face = promptFor(word, state.atBat.direction);
  el.word.textContent = face.prompt;
  el.word.lang = face.promptLang;
  el.directionHint.textContent = face.answerLang === 'es' ? '→ Español' : '→ English';
  el.tierBadge.textContent = `${bucketForTag(word.tag).toUpperCase()} · ${(state.atBat.windowMs / 1000).toFixed(1)}s`;
  el.tierBadge.className = 'tier-badge tier-' + bucketForTag(word.tag);
  renderStrikes();
}

function renderChoices() {
  const word = state.deck[state.index];
  const face = promptFor(word, state.atBat.direction);
  el.choices.innerHTML = '';
  buildChoices(word, state.atBat.direction).forEach(text => {
    const button = document.createElement('button');
    button.className = 'choice';
    button.lang = face.answerLang;
    button.textContent = text;
    button.addEventListener('click', () => {
      resolvePitch(performance.now() - startedAt, text === face.answer);
    });
    el.choices.appendChild(button);
  });
}

/* ---------- the at-bat loop ---------- */

function startAtBat() {
  // The direction is picked here, once, and rides on the at-bat — so a
  // strike bringing the same word back cannot re-roll it.
  state.atBat = newAtBat(state.deck[state.index].tag);
  renderQuestion();
  throwPitch();
}

// One pitch: same word as last time if this is a repeat, fresh choices,
// fresh clock.
function throwPitch() {
  say(' ', '');
  renderChoices();
  renderStrikes();
  state.locked = false;
  startedAt = performance.now();

  const tick = now => {
    // A banked swing can take over the at-bat mid-pitch. Cancelling the
    // handle can lose a race with a callback already in flight, so the loop
    // also checks for itself and stops.
    if (state.swing) { frame = null; return; }
    const elapsed = now - startedAt;
    if (elapsed >= state.atBat.windowMs) { renderClock(elapsed); resolvePitch(elapsed, false); return; }
    renderClock(elapsed);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}

// Settle one pitch. Called by a click, or by the countdown hitting zero
// with correct = false.
function resolvePitch(elapsedMs, correct) {
  if (state.locked || !state.atBat || state.atBat.over) return;
  state.locked = true;
  if (frame) { cancelAnimationFrame(frame); frame = null; }

  const atBat = state.atBat;
  const word  = state.deck[state.index];
  const pitch = applyPitch(atBat.strikes, correct, elapsedMs, atBat.windowMs);
  atBat.strikes = pitch.strikes;

  const face = promptFor(word, atBat.direction);
  el.choices.querySelectorAll('.choice').forEach(button => {
    button.disabled = true;
    if (button.textContent === face.answer) button.classList.add('correct');
  });

  if (pitch.result === 'HIT') {
    atBat.over = true; atBat.result = 'HIT'; atBat.hit = pitch.hit;
    state.hits[pitch.hit]++;
    const play = advanceOnHit(state.bases, HIT_ADVANCE[pitch.hit]);
    state.bases = play.bases;
    state.runs += play.runs;
    say(`¡${PAYOFF_LABEL[pitch.hit]}! ${(elapsedMs / 1000).toFixed(2)}s`
        + (play.runs ? ` — ${play.runs} in.` : ''), 'good');
  } else if (pitch.result === 'STRIKE') {
    say(correct
      ? `Right answer, too slow — strike ${pitch.strikes}. Same pitch again.`
      : `Strike ${pitch.strikes}. Same pitch again.`, 'bad');
  } else {
    atBat.over = true; atBat.result = 'OUT';
    state.outs++;
    state.missed.push(word);
    say(`Strike three. "${word.es}" means "${word.en}".`, 'bad');
  }

  renderStrikes();
  renderHud();
  setTimeout(afterPitch, 1500);
}

function afterPitch() {
  // Still alive in this at-bat: same word comes back, one strike worse.
  if (!state.atBat.over) { throwPitch(); return; }

  // The at-bat is finished, so the banked swing ages exactly once here —
  // not once per pitch.
  const stepped = applyAtBatToBonus(
    state.bonus, state.hitStreak, state.atBat.result, Math.random());
  state.bonus     = stepped.bonus;
  state.hitStreak = stepped.streak;

  state.index++;
  renderHud();

  if (state.outs >= MAX_OUTS) return endInning('Inning over', 'Three outs — side retired.');
  if (state.index >= state.deck.length) {
    return endInning('Through the lineup!', `All ${state.deck.length} words, never struck out.`);
  }
  startAtBat();
}


/* ---------- the power swing ----------
   Spending a banked swing replaces the whole at-bat. The word on screen is
   set aside, the countdown stops, and the at-bat is settled by one swing at
   one pitch: contact is a home run, anything else is an out.

   The lane geometry below is the only place the drawing and the rules meet.
   Progress runs 0 (the pitcher's hand) to 1 (the catcher's mitt), and both
   the ball's height and its size are read straight off it, so the plate at
   PLATE_AT of the travel is also the plate on screen. ------------------- */

const LANE_RELEASE_Y = 26;     // px down the lane: the ball leaves the hand
const LANE_MITT_Y    = 196;    // px down the lane: the ball is caught
const LANE_SCALE_MIN = 0.32;   // far away
const LANE_SCALE_MAX = 1.05;   // right on top of you

function laneY(progress) {
  return LANE_RELEASE_Y + progress * (LANE_MITT_Y - LANE_RELEASE_Y);
}

// Perspective: the ball grows as it closes. Linear in progress, which is
// not strictly how perspective works, but it is honest about the timing —
// how big the ball looks and how close it is stay in step.
function laneScale(progress) {
  return LANE_SCALE_MIN + progress * (LANE_SCALE_MAX - LANE_SCALE_MIN);
}

function placeBall(progress) {
  el.pitchBall.style.top       = laneY(progress).toFixed(2) + 'px';
  el.pitchBall.style.transform =
    'translate(-50%, -50%) scale(' + laneScale(progress).toFixed(3) + ')';
}

// Why the swing missed, in the batter's own terms. Being told which side of
// the ball you were on is the difference between learning the timing and
// guessing at it again.
const MISS_TEXT = {
  EARLY:   'Way out in front — that is an out.',
  LATE:    'Under it late — that is an out.',
  LOOKING: 'Took it all the way. Called strike, that is an out.'
};

let swingFrame = null;

function startSwing() {
  if (!state.bonus || state.locked || state.swing) return;
  state.locked = true;
  if (frame) { cancelAnimationFrame(frame); frame = null; }   // the pitch clock stops

  // One from each bank, drawn independently: the bench and the coach are
  // two voices, not one shuffled list.
  const phrase = DUGOUT_PHRASES[Math.floor(Math.random() * DUGOUT_PHRASES.length)];
  const coach  = COACH_PHRASES[Math.floor(Math.random() * COACH_PHRASES.length)];
  state.swing = { progress: 0, phrase: phrase.es, coach: coach.es,
                  result: null, verdict: null };

  el.dugoutPhrase.textContent = phrase.es;
  el.dugoutGloss.textContent  = phrase.en;
  el.coachPhrase.textContent  = coach.es;
  el.coachGloss.textContent   = coach.en;
  el.swingFeedback.innerHTML  = '&nbsp;';
  el.swingFeedback.className  = 'feedback';
  el.swingGo.disabled         = false;
  el.swingFigure.classList.remove('bat-flip');
  el.pitchBall.classList.remove('struck');
  placeBall(0);
  el.pitchScreen.classList.add('hidden');
  el.swingScreen.classList.remove('hidden');

  const startedSwingAt = performance.now();
  const tick = now => {
    if (!state.swing || state.swing.result) { swingFrame = null; return; }
    const progress = ballProgressAt(now - startedSwingAt);
    state.swing.progress = progress;
    placeBall(progress);
    // The ball is in the mitt and the bat never left the shoulder. One
    // pitch means one chance, so that settles it.
    if (progress >= 1) { swingFrame = null; takeSwing(null); return; }
    swingFrame = requestAnimationFrame(tick);
  };
  swingFrame = requestAnimationFrame(tick);
}

// `progress` is where the ball was when the bat came through. Null means it
// never came through at all.
function takeSwing(progress) {
  if (!state.swing || state.swing.result) return;
  if (swingFrame) { cancelAnimationFrame(swingFrame); swingFrame = null; }

  const swung  = progress !== null && progress !== undefined;
  const onTime = swung && isContact(progress);
  state.swing.verdict = swung ? swingVerdict(progress) : 'LOOKING';
  state.swing.result  = onTime ? 'HOMERUN' : 'MISS';
  state.bonus         = null;          // spent, hit or miss
  el.swingGo.disabled = true;

  if (onTime) {
    state.hits.HOMERUN++;
    const play = advanceOnHit(state.bases, HIT_ADVANCE.HOMERUN);
    state.bases = play.bases;
    state.runs += play.runs;
    el.swingFeedback.textContent = `¡JONRÓN! ${play.runs} in.`;
    el.swingFeedback.className   = 'feedback good';
    el.swingFigure.classList.add('bat-flip');
    el.pitchBall.classList.add('struck');
  } else {
    state.outs++;
    el.swingFeedback.textContent = MISS_TEXT[state.swing.verdict];
    el.swingFeedback.className   = 'feedback bad';
  }

  renderHud();
  setTimeout(endSwing, onTime ? 2400 : 1500);   // longer, to let the bat land
}

function endSwing() {
  el.swingFigure.classList.remove('bat-flip');
  el.pitchBall.classList.remove('struck');
  placeBall(0);
  el.swingScreen.classList.add('hidden');
  el.pitchScreen.classList.remove('hidden');

  // The swing was the whole at-bat, so it ages the bonus exactly once, the
  // same as any other at-bat ending.
  const result = state.swing.result === 'HOMERUN' ? 'HIT' : 'OUT';
  state.swing = null;

  const stepped = applyAtBatToBonus(state.bonus, state.hitStreak, result, Math.random());
  state.bonus     = stepped.bonus;
  state.hitStreak = stepped.streak;

  state.atBat = null;
  state.index++;
  state.locked = false;
  renderHud();

  if (state.outs >= MAX_OUTS) return endInning('Inning over', 'Three outs — side retired.');
  if (state.index >= state.deck.length) {
    return endInning('Through the lineup!', `All ${state.deck.length} words, never struck out.`);
  }
  startAtBat();
}

/* ---------- end of inning ---------- */

function endInning(title, subtitle) {
  const h = state.hits;
  const totalHits = h.SINGLE + h.DOUBLE + h.TRIPLE + h.HOMERUN;

  el.summaryTitle.textContent = title;
  el.summarySub.textContent   = subtitle;
  el.sumRuns.textContent      = state.runs;
  el.sumSingle.textContent    = h.SINGLE;
  el.sumDouble.textContent    = h.DOUBLE;
  el.sumTriple.textContent    = h.TRIPLE;
  el.sumHomerun.textContent   = h.HOMERUN;
  el.sumHits.textContent      = totalHits;
  el.sumLob.textContent       = state.bases.filter(Boolean).length;

  if (state.missed.length) {
    el.missedBlock.classList.remove('hidden');
    el.missedList.innerHTML = '';
    state.missed.forEach(word => {
      const item = document.createElement('li');
      item.innerHTML = `<strong>${word.es}</strong> — ${word.en}`;
      el.missedList.appendChild(item);
    });
  } else {
    el.missedBlock.classList.add('hidden');
  }

  el.pitchScreen.classList.add('hidden');
  el.summary.classList.remove('hidden');
}

/* ---------- starting up ---------- */

function startInning() {
  state = newTimedState((state.inning || 0) + 1);
  state.deck = shuffle(VOCAB);
  el.summary.classList.add('hidden');
  el.pitchScreen.classList.remove('hidden');
  renderHud();
  startAtBat();
}

el.playAgain.addEventListener('click', startInning);
el.bankButton.addEventListener('click', startSwing);
el.swingGo.addEventListener('click', () => takeSwing(state.swing ? state.swing.progress : null));
document.addEventListener('keydown', event => {
  if (event.code === 'Space' && state.swing && !state.swing.result) {
    event.preventDefault();
    takeSwing(state.swing.progress);
  }
});

// Draw the contact window straight from the rules, so the band over the
// plate is exactly the stretch of flight isContact() accepts — no more, no
// less, and it cannot drift if the numbers are retuned.
el.contactZone.style.top    = laneY(PLATE_AT - CONTACT_WINDOW) + 'px';
el.contactZone.style.height = (laneY(PLATE_AT + CONTACT_WINDOW) -
                               laneY(PLATE_AT - CONTACT_WINDOW)) + 'px';
placeBall(0);

startInning();
