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

  offerScreen: document.getElementById('offer-screen'),
  offerTerms:  document.getElementById('offer-terms'),
  offerReward: document.getElementById('offer-reward'),
  offerLeft:   document.getElementById('offer-left'),
  offerTake:   document.getElementById('offer-take'),
  offerPass:   document.getElementById('offer-pass'),
  foulPips:    document.getElementById('foul-pips'),
  swingEyebrow: document.getElementById('swing-eyebrow-text'),

  swingScreen:   document.getElementById('swing-screen'),
  dugoutPhrase:  document.getElementById('dugout-phrase'),
  dugoutGloss:   document.getElementById('dugout-gloss'),
  coachPhrase:   document.getElementById('coach-phrase'),
  coachGloss:    document.getElementById('coach-gloss'),
  swingFigure:   document.getElementById('swing-figure'),
  pitchBall:     document.getElementById('pitch-ball'),
  contactZone:   document.getElementById('contact-zone'),
  pressZone:     document.getElementById('press-zone'),
  pitchFlash:    document.getElementById('pitch-flash'),
  readyCue:      document.getElementById('ready-cue'),
  umpCalls:      [...document.querySelectorAll('.ump-call')],
  pauseButton:   document.getElementById('pause-button'),
  pauseVeil:     document.getElementById('pause-veil'),
  pauseNote:     document.getElementById('pause-note'),
  pauseResume:   document.getElementById('pause-resume'),
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

// The umpire. `call` is whatever umpireCall() returned for an outcome the
// game had already decided; null clears the line. Written to both cards
// because only one of them is ever on screen.
function callUmpire(call) {
  for (const node of el.umpCalls) {
    const es = node.querySelector('.ump-es');
    const en = node.querySelector('.ump-en');
    if (!call) { es.textContent = ''; en.textContent = ''; node.className = 'ump-call'; continue; }
    es.textContent = call.es;
    en.textContent = call.en;
    node.className = 'ump-call show ' +
      (call === UMPIRE_CALLS.SAFE ? 'safe' : 'against');
  }
}

/* ---------- drawing ---------- */

function renderHud() {
  renderPause();
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
  el.hudBank.classList.toggle('hidden', state.offersLeft <= 0);
  if (state.offersLeft > 0) {
    el.hudBank.textContent = `SHOT BANKED · ${state.offersLeft}`;
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
  callUmpire(null);          // last pitch's call goes with the last pitch
  renderChoices();
  renderStrikes();
  state.locked = false;
  startedAt = performance.now();
  renderPause();             // a live clock means a live pause button
  runClock();
}

// The countdown loop, named rather than closed over inside throwPitch, so
// pause can stop it and resume can start it again against a rebased
// startedAt. Nothing else about the clock changes.
function runClock() {
  const tick = now => {
    // A banked swing can take over the at-bat mid-pitch. Cancelling the
    // handle can lose a race with a callback already in flight, so the loop
    // also checks for itself and stops.
    if (state.swing || state.paused) { frame = null; return; }
    const elapsed = now - startedAt;
    if (pitchTimedOut(elapsed, state.atBat.windowMs)) {
      renderClock(elapsed); resolvePitch(elapsed, false); return;
    }
    renderClock(elapsed);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}

// Settle one pitch. Called by a click, or by the countdown hitting zero
// with correct = false.
function resolvePitch(elapsedMs, correct) {
  if (state.paused || state.locked || !state.atBat || state.atBat.over) return;
  state.locked = true;
  if (frame) { cancelAnimationFrame(frame); frame = null; }

  const atBat = state.atBat;
  const word  = state.deck[state.index];

  // The bonus question is one shot on its own clock — no count, no re-pitch.
  if (state.bonusQ) {
    const face = promptFor(word, atBat.direction);
    el.choices.querySelectorAll('.choice').forEach(button => {
      button.disabled = true;
      if (button.textContent === face.answer) button.classList.add('correct');
    });
    atBat.over = true;
    atBat.result = correct ? 'HIT' : 'OUT';
    const earned = settleBonusQuestion(correct);
    renderStrikes();
    renderHud();
    setTimeout(earned ? startSwing : afterBonusOut, 1800);
    return;
  }

  const pitch = applyPitch(atBat.strikes, correct, elapsedMs, atBat.windowMs, word.tag);
  atBat.strikes = pitch.strikes;
  callUmpire(umpireCall(pitch.result, pitchTimedOut(elapsedMs, atBat.windowMs)));

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
    // An easy word missed does not get to "strike three" — it never had
    // three to give.
    say(pitch.instant
      ? `That one you know. "${word.es}" means "${word.en}".`
      : `Strike three. "${word.es}" means "${word.en}".`, 'bad');
  }

  renderStrikes();
  renderHud();
  setTimeout(afterPitch, 1500);
}

function afterPitch() {
  // Still alive in this at-bat: same word comes back, one strike worse.
  if (!state.atBat.over) { throwPitch(); return; }

  state.hitStreak = state.atBat.result === 'HIT' ? state.hitStreak + 1 : 0;
  state.index++;
  renderHud();

  const over = inningOver(state.outs, state.index, state.deck.length, state.cap);
  if (over) return finishInning(over);

  // Three in a row offers a shot rather than banking one. A bank already
  // being held is re-offered by this streak rather than replaced — and both
  // stop once the extension is spent, so the assignment is unconditional:
  // a bank that can no longer be redeemed has to leave the HUD too.
  const step = streakOffer(state.hitStreak, state.offersLeft, state.cap);
  state.offersLeft = step.offersLeft;
  renderHud();
  if (step.offer) {
    state.hitStreak = 0;
    return showOffer();
  }
  startAtBat();
}


/* ---------- pause ----------
   Two clocks can be running: the countdown on a multiple-choice pitch, and
   the flight of a banked swing. They stop differently.

   The countdown just freezes — how long is left is all that matters, so the
   elapsed time is banked and startedAt is rebased on the way back in.

   The swing cannot freeze. Stopping the ball on the edge of the SWING band
   and starting it again from there would hand the player a home run for
   pressing a button, so a paused swing goes back to the mound and is thrown
   again from the ready beat. Nothing is lost by that: the pitch is the same
   speed down the same line every time, so a re-throw gives away nothing the
   player did not already have.

   Either way the veil covers the card. Freezing the clock with the word
   still legible would be unlimited thinking time on a mode built around the
   clock. ------------------------------------------------------------------ */

let pausedElapsed = 0;

// Only when there is actually a clock to stop.
function canPause() {
  if (state.paused) return true;
  if (state.swing) return !state.swing.result;
  return !!(state.atBat && !state.atBat.over && !state.locked);
}

function renderPause() {
  el.pauseButton.disabled = !canPause();
  el.pauseVeil.classList.toggle('hidden', !state.paused);
}

function pauseGame() {
  if (state.paused || !canPause()) return;
  state.paused = true;

  if (state.swing) {
    clearReady();
    if (swingFrame) { cancelAnimationFrame(swingFrame); swingFrame = null; }
    if (swingTimer) { clearTimeout(swingTimer); swingTimer = null; }
    state.swing.live     = false;
    state.swing.progress = 0;
    state.swing.pressAt  = null;
    placeBall(0);
    el.pitchBall.classList.remove('struck');
    el.pitchFlash.classList.remove('pop');
    el.swingFigure.classList.remove('swinging');
    el.swingGo.disabled = true;
    el.readyCue.textContent = '\u00a0';
    el.readyCue.className   = 'ready-cue';
    el.pauseNote.textContent = 'The pitch goes back to the mound.';
  } else {
    pausedElapsed = performance.now() - startedAt;
    if (frame) { cancelAnimationFrame(frame); frame = null; }
    const left = Math.max(0, state.atBat.windowMs - pausedElapsed) / 1000;
    el.pauseNote.textContent = `${left.toFixed(1)}s still on the clock.`;
  }

  renderPause();
  el.pauseResume.focus();
}

function resumeGame() {
  if (!state.paused) return;
  state.paused = false;
  renderPause();

  if (state.swing) {
    startReadyBeat();          // thrown again, from the top
  } else {
    startedAt = performance.now() - pausedElapsed;
    runClock();
  }
}

function togglePause() { state.paused ? resumeGame() : pauseGame(); }


/* ---------- the offer ----------
   Both branches cost something, which is the whole feature. The reward is
   stated in at-bats rather than in the home run, because at-bats are what it
   actually pays in — simulated, a bonus at-bat is a WORSE home-run machine
   than an ordinary one, so a player who takes it for the home run is taking
   it for the wrong reason. ------------------------------------------------- */

function showOffer() {
  state.locked = true;
  // Room is never zero here: streakOffer withholds the offer once the
  // extension is spent, so an offer on screen always pays at least one
  // at-bat. There is no "this pays nothing" arm because there is no way in.
  const extra = Math.min(BONUS_EXTRA_AT_BATS,
                         (AT_BATS_PER_INNING + MAX_INNING_EXTENSION) - state.cap);

  el.offerTerms.textContent =
    `One hard word, ${(BONUS_QUESTION_MS / 1000).toFixed(0)} seconds.`;
  el.offerReward.textContent =
    `${extra} more at-bats this inning, and a swing at the fences.`;
  el.offerLeft.textContent = state.offersLeft > 1
    ? `· ${state.offersLeft - 1} chance${state.offersLeft > 2 ? 's' : ''} after this`
    : '· last chance';

  state.offerUp = true;
  renderHud();                     // the HUD says how many chances are left
  el.pitchScreen.classList.add('hidden');
  el.offerScreen.classList.remove('hidden');
  renderPause();
}

function passOffer() {
  if (!state.offerUp || state.paused) return;
  state.offerUp = false;
  state.offersLeft = declineOffer(state.offersLeft);
  el.offerScreen.classList.add('hidden');
  el.pitchScreen.classList.remove('hidden');
  state.locked = false;
  renderHud();
  startAtBat();
}

function takeOffer() {
  if (!state.offerUp || state.paused) return;
  state.offerUp = false;
  state.offersLeft = 0;
  el.offerScreen.classList.add('hidden');
  el.pitchScreen.classList.remove('hidden');
  startBonusQuestion();
}


function afterBonusOut() {
  state.hitStreak = 0;
  state.index++;
  state.locked = false;
  renderHud();
  const over = inningOver(state.outs, state.index, state.deck.length, state.cap);
  if (over) return finishInning(over);
  startAtBat();
}


/* ---------- the bonus question ----------
   A HOMERUN-tier word on its own clock. This is the only risk in the whole
   mechanic and it is a language risk, which for a vocabulary app is where
   the risk should be. Miss it and it is an out; answer it and the inning
   grows and the swing is earned. ------------------------------------------ */

function startBonusQuestion() {
  const word = pickBonusWord();
  state.bonusQ = { word, direction: pickDirection(Math.random()) };
  state.atBat  = newAtBat('HOMERUN', state.bonusQ.direction);
  state.atBat.windowMs = BONUS_QUESTION_MS;
  state.deck[state.index] = word;          // the bonus word IS this at-bat

  renderQuestion();
  el.tierBadge.textContent = `BONUS · ${(BONUS_QUESTION_MS / 1000).toFixed(0)}s`;
  el.tierBadge.className   = 'tier-badge tier-bonus';
  throwPitch();
}

// A hard word that has not already been seen this inning, so the bonus is
// never a word the player answered thirty seconds ago.
function pickBonusWord() {
  const seen = new Set(state.deck.slice(0, state.index).map(w => w.es));
  const pool = VOCAB.filter(w => w.tag === 'HOMERUN' && !seen.has(w.es));
  const from = pool.length ? pool : VOCAB.filter(w => w.tag === 'HOMERUN');
  return from[Math.floor(Math.random() * from.length)];
}

// Called from resolvePitch when the at-bat on screen is the bonus one.
function settleBonusQuestion(correct) {
  const word = state.bonusQ.word;
  state.bonusQ = null;

  if (!correct) {
    state.outs++;
    state.missed.push(word);
    callUmpire(umpireCall('OUT'));
    say(`No shot. "${word.es}" means "${word.en}".`, 'bad');
    return false;
  }

  const before = state.cap;
  state.cap = extendInning(state.cap);
  const gained = state.cap - before;
  callUmpire(umpireCall('HIT'));
  // ¡Error! rather than a counter incrementing. A fielding error is the one
  // canonical way an inning goes on without an out being recorded, which is
  // exactly what the extra at-bats are, so nothing has to be invented for it.
  // The umpire already agrees: umpireCall('HIT') is ¡Safe!, which is the call
  // a batter reaching on an error gets.
  //
  // gained is never 0: the offer is withheld once the extension is spent, so
  // reaching this line means there was room. What it can be is the LAST one,
  // and the player is told, because the offers stop after it.
  say(`¡Error! It gets away in the field — ${gained} more at-bats, and you are swinging.` +
      (extensionSpent(state.cap) ? ' That is as long as this inning goes.' : ''), 'good');
  return true;
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
// A ball that starts at 6.4px is invisible for the first half of the flight
// — it sits on the pitcher's figure and is only findable once it has already
// travelled. Perspective is worth less than being able to see the thing you
// are timing, so the near end of the range gives up some of its spread.
const LANE_SCALE_MIN = 0.65;   // ~13px: findable from the first frame
const LANE_SCALE_MAX = 1.15;   // ~23px: filling the mitt

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
  el.pitchBall.classList.toggle('flying', progress > 0);
}

// The release: one flash at the pitcher's hand, on the frame the ball first
// moves. Re-added rather than toggled, because an animation only replays if
// the class actually leaves and comes back.
function popRelease() {
  el.pitchFlash.classList.remove('pop');
  void el.pitchFlash.offsetWidth;
  el.pitchFlash.classList.add('pop');
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
let swingTimer = null;
let readyTimers = [];

function clearReady() {
  readyTimers.forEach(clearTimeout);
  readyTimers = [];
}

function startSwing() {
  if (state.paused || state.swing) return;
  state.locked = true;
  if (frame) { cancelAnimationFrame(frame); frame = null; }   // the pitch clock stops

  // One from each bank, drawn independently: the bench and the coach are
  // two voices, not one shuffled list.
  const phrase = DUGOUT_PHRASES[Math.floor(Math.random() * DUGOUT_PHRASES.length)];
  const coach  = COACH_PHRASES[Math.floor(Math.random() * COACH_PHRASES.length)];
  state.swing = { progress: 0, phrase: phrase.es, coach: coach.es,
                  live: false, pressAt: null, contactAt: null,
                  attempt: 0, result: null, verdict: null };

  el.dugoutPhrase.textContent = phrase.es;
  el.dugoutGloss.textContent  = phrase.en;
  el.coachPhrase.textContent  = coach.es;
  el.coachGloss.textContent   = coach.en;
  el.swingFeedback.innerHTML  = '&nbsp;';
  el.swingFeedback.className  = 'feedback';
  callUmpire(null);
  renderFouls();
  drawCues();
  el.swingGo.disabled         = true;      // nothing to swing at yet
  el.swingFigure.classList.remove('bat-flip', 'swinging');
  el.pitchBall.classList.remove('struck');
  el.pitchFlash.classList.remove('pop');
  placeBall(0);
  el.pitchScreen.classList.add('hidden');
  el.swingScreen.classList.remove('hidden');
  renderPause();

  // The ready beat. Nothing about the pitch is live until it finishes: the
  // button is dead, the ball has not been released, and the clock has not
  // started. It only moves WHEN the flight begins — the flight itself, and
  // everything scored off it, is untouched.
  startReadyBeat();
}

// Named so that resuming from a pause can run it again from the top.
function startReadyBeat() {
  clearReady();
  el.readyCue.textContent = 'Read the bench…';
  el.readyCue.className   = 'ready-cue';

  readyTimers.push(setTimeout(() => {
    el.readyCue.textContent = '¡Ahí viene!  —  here it comes';
    el.readyCue.className   = 'ready-cue live';
  }, READY_READ_MS));

  readyTimers.push(setTimeout(startPitchClock, readyHoldMs()));
}

function startPitchClock() {
  if (!state.swing || state.swing.result || state.paused) return;
  state.swing.live    = true;
  el.swingGo.disabled = false;

  const startedSwingAt = performance.now();
  const tick = now => {
    if (!state.swing || state.swing.result) { swingFrame = null; return; }
    const progress = ballProgressAt(now - startedSwingAt, PITCH_WINDUP_MS,
                                    attemptFlightMs(state.swing.attempt));
    const wasHeld = state.swing.progress === 0;
    state.swing.progress = progress;
    placeBall(progress);
    if (wasHeld && progress > 0) popRelease();
    // The ball is in the mitt and the bat never left the shoulder. One
    // pitch means one chance, so that settles it — unless a swing is
    // already committed and its barrel is still on the way.
    if (progress >= 1 && state.swing.pressAt === null) {
      swingFrame = null; takeSwing(null); return;
    }
    swingFrame = requestAnimationFrame(tick);
  };
  swingFrame = requestAnimationFrame(tick);
}

// `progress` is where the ball was when the player COMMITTED — pressed the
// button — not where it was at contact. Null means they never committed.
//
// Pressing does not settle anything. It starts the bat, and the barrel takes
// SWING_LEAD_MS to arrive; the ball keeps coming in the meantime. The outcome
// is scored when the barrel gets there, on contactProgress().
function takeSwing(progress) {
  if (state.paused) return;
  if (!state.swing || state.swing.result || state.swing.pressAt !== null) return;
  if (!state.swing.live) return;   // the ready beat is still running

  const swung = progress !== null && progress !== undefined;
  el.swingGo.disabled = true;

  if (!swung) { resolveSwing(null); return; }   // took it: nothing to load

  state.swing.pressAt = progress;
  el.swingFigure.classList.add('swinging');
  // The ball keeps flying through the load, so the pitch loop stays running.
  swingTimer = setTimeout(() => resolveSwing(state.swing && state.swing.pressAt),
                          SWING_LEAD_MS);
}

function resolveSwing(pressProgress) {
  if (!state.swing || state.swing.result) return;
  clearReady();
  if (swingFrame) { cancelAnimationFrame(swingFrame); swingFrame = null; }
  if (swingTimer) { clearTimeout(swingTimer); swingTimer = null; }

  const attempt = state.swing.attempt;
  const flight  = attemptFlightMs(attempt);
  const budget  = attemptWindowMs(attempt);
  const swung   = pressProgress !== null && pressProgress !== undefined;
  const contact = swung ? contactProgress(pressProgress, SWING_LEAD_MS, flight) : null;
  const outcome = swung ? resolveAttempt(attempt, pressProgress)
                        : (attempt >= SWING_ATTEMPTS - 1 ? 'STRUCK_OUT_SWINGING' : 'FOUL');
  const onTime  = outcome === 'HOMERUN';
  state.swing.contactAt = contact;
  state.swing.verdict = swung ? swingVerdict(contact, flight, budget) : 'LOOKING';

  // Fouled off. Costs nothing, the way fouling one off costs nothing.
  if (outcome === 'FOUL') {
    state.swing.attempt++;
    renderFouls();
    el.swingFeedback.textContent = swung
      ? `Fouled it off — ${MISS_TEXT[state.swing.verdict].replace(/ — that is an out\.$/, '.')}`
      : 'Took it. Still alive.';
    el.swingFeedback.className = 'feedback';
    el.swingFigure.classList.remove('swinging');
    setTimeout(nextAttempt, 1200);
    return;
  }

  state.swing.result = onTime ? 'HOMERUN' : 'MISS';
  callUmpire(onTime ? umpireCall('HIT') : null);

  if (onTime) {
    state.hits.HOMERUN++;
    const play = advanceOnHit(state.bases, HIT_ADVANCE.HOMERUN);
    state.bases = play.bases;
    state.runs += play.runs;
    el.swingFeedback.textContent = `¡JONRÓN! ${play.runs} in.`;
    el.swingFeedback.className   = 'feedback good';
    // The flip picks up exactly where the swing left the bat, so the two
    // read as one motion rather than a reset.
    el.swingFigure.classList.remove('swinging');
    el.swingFigure.classList.add('bat-flip');
    el.pitchBall.classList.add('struck');
  } else {
    // No out. The extension was banked when the question was answered, so
    // failing to collect the rest of the windfall costs only the windfall.
    el.swingFeedback.textContent = 'Struck out swinging — but the inning is still yours.';
    el.swingFeedback.className   = 'feedback bad';
    renderFouls(true);
  }

  renderHud();
  setTimeout(endSwing, onTime ? 2400 : 1800);   // longer, to let the bat land
}

// Reset the pitch and throw the next one. The at-bat is not over; the
// batter just fouled one off.
function nextAttempt() {
  if (!state.swing || state.swing.result) return;
  state.swing.live     = false;
  state.swing.progress = 0;
  state.swing.pressAt  = null;
  state.swing.verdict  = null;
  el.swingFeedback.innerHTML = '&nbsp;';
  el.swingFeedback.className = 'feedback';
  el.pitchBall.classList.remove('struck');
  el.pitchFlash.classList.remove('pop');
  el.swingFigure.classList.remove('swinging');
  placeBall(0);
  drawCues();
  startReadyBeat();
}

// One pip per attempt used, so three fouls read as a count rather than as
// the same pitch arriving again for no reason.
function renderFouls(allUsed) {
  const used = allUsed ? SWING_ATTEMPTS : state.swing ? state.swing.attempt : 0;
  el.foulPips.innerHTML = '';
  for (let i = 0; i < SWING_ATTEMPTS; i++) {
    const pip = document.createElement('span');
    pip.className = 'foul-pip' + (i < used ? ' used' : '');
    el.foulPips.appendChild(pip);
  }
  if (el.swingEyebrow) {
    el.swingEyebrow.textContent = used === 0 ? 'Swinging for it'
      : used >= SWING_ATTEMPTS ? 'Struck out swinging'
      : `Fouled off ${used}`;
  }
}

function endSwing() {
  clearReady();
  el.readyCue.textContent = '\u00a0';
  el.readyCue.className   = 'ready-cue';
  el.swingFigure.classList.remove('bat-flip', 'swinging');
  el.pitchBall.classList.remove('struck');
  placeBall(0);
  el.swingScreen.classList.add('hidden');
  el.pitchScreen.classList.remove('hidden');

  // The bonus was the whole at-bat. It never seeds the next streak: the
  // shot was the reward for the three that earned it, not the first of the
  // next three.
  state.swing     = null;
  state.hitStreak = 0;
  state.atBat     = null;
  state.index++;
  state.locked = false;
  renderHud();

  const over = inningOver(state.outs, state.index, state.deck.length, state.cap);
  if (over) return finishInning(over);
  startAtBat();
}

/* ---------- end of inning ----------
   The rules said WHY it ended; this decides what that looks like. A cap
   ending has to resolve the count to three before anything renders, or the
   HUD and the outfield scorebug sit there showing one out under a summary
   that says the side was retired — which reads as a bug, not an ending. ---- */

function finishInning(reason) {
  if (reason === 'CAP') {
    const play = retireTheSide(state.outs, state.bases);
    state.outs  = play.outs;
    state.bases = play.bases;
    renderHud();                       // the board agrees before the summary
    return endInning(play.call.es,
      `${play.call.en} ${state.cap} at-bats — that is the inning.`);
  }
  if (reason === 'DECK') {
    return endInning('Through the lineup!',
                     `All ${state.deck.length} words, never struck out.`);
  }
  return endInning('Inning over', 'Three outs — side retired.');
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
el.offerTake.addEventListener('click', takeOffer);
el.offerPass.addEventListener('click', passOffer);
el.swingGo.addEventListener('click', () => takeSwing(state.swing ? state.swing.progress : null));
el.pauseButton.addEventListener('click', togglePause);
el.pauseResume.addEventListener('click', resumeGame);
document.addEventListener('keydown', event => {
  // Space already swings, so pause takes P and Escape.
  if (event.code === 'KeyP' || event.code === 'Escape') {
    event.preventDefault();
    togglePause();
    return;
  }
  if (state.paused) return;   // nothing else reaches the game while it is stopped
  if (event.code === 'Space' && state.swing && !state.swing.result &&
      state.swing.pressAt === null && state.swing.live) {
    event.preventDefault();
    takeSwing(state.swing.progress);
  }
});

// Draw the contact window straight from the rules, so the band over the
// plate is exactly the stretch of flight isContact() accepts — no more, no
// less, and it cannot drift if the numbers are retuned.
const band = (el_, from, to) => {
  el_.style.top    = laneY(from) + 'px';
  el_.style.height = (laneY(to) - laneY(from)) + 'px';
};

// Redrawn for every attempt, because every attempt has its own flight and
// its own window. The press window is the target, because pressing is the
// only thing the player does — drawing the contact window as a second band
// of equal weight showed them something they cannot aim at, in a stripe
// that overlapped this one.
function drawCues() {
  const attempt = state && state.swing ? state.swing.attempt : 0;
  const flight  = attemptFlightMs(attempt);
  const budget  = attemptWindowMs(attempt);
  const press   = pressWindow(SWING_LEAD_MS, flight, budget);
  band(el.pressZone, press.opens, press.shuts);

  // Contact gets a hairline at the plate instead of a band. Still off
  // PLATE_AT, so it cannot drift from where the rules put contact.
  el.contactZone.style.top    = (laneY(PLATE_AT) - 1) + 'px';
  el.contactZone.style.height = '2px';
}
drawCues();

// The release flash belongs on the release point, not near it.
el.pitchFlash.style.top = LANE_RELEASE_Y + 'px';

// The bat's load animation lasts exactly as long as the rule says it does.
document.documentElement.style.setProperty('--swing-lead', SWING_LEAD_MS + 'ms');

placeBall(0);

startInning();
