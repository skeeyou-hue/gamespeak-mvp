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

let state     = newTimedState(0);
let frame     = null;   // requestAnimationFrame handle for the countdown
let startedAt = 0;      // when the pitch on screen was thrown

const el = {
  pitchScreen: document.getElementById('pitch-screen'),
  tierBadge:   document.getElementById('tier-badge'),
  strikePips:  document.getElementById('strike-pips'),
  timerFill:   document.getElementById('timer-fill'),
  clockNum:    document.getElementById('clock-num'),
  payoff:      document.getElementById('payoff'),
  word:        document.getElementById('word'),
  choices:     document.getElementById('choices'),
  feedback:    document.getElementById('feedback'),

  hudRuns:  document.getElementById('hud-runs'),
  hudOuts:  document.getElementById('hud-outs'),
  hudBank:  document.getElementById('hud-bank'),
  pips:     ['first', 'second', 'third'].map(b => document.getElementById('pip-' + b)),

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

function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildChoices(word) {
  const wrong = TIMED_VOCAB.filter(w => w.en !== word.en).map(w => w.en);
  return shuffle([word.en, ...shuffle(wrong).slice(0, 3)]);
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
  state.bases.forEach((on, i) => el.pips[i].classList.toggle('on', on));

  // The banked swing is only shown here for now — spending it is the next
  // step, and it will use the sweeping marker we already agreed on.
  el.hudBank.classList.toggle('hidden', !state.bonus);
  if (state.bonus) {
    el.hudBank.textContent = `SWING BANKED · ${state.bonus.atBatsLeft}`;
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
  el.word.textContent = word.es;
  el.tierBadge.textContent = `${bucketForTag(word.tag).toUpperCase()} · ${(state.atBat.windowMs / 1000).toFixed(1)}s`;
  el.tierBadge.className = 'tier-badge tier-' + bucketForTag(word.tag);
  renderStrikes();
}

function renderChoices() {
  const word = state.deck[state.index];
  el.choices.innerHTML = '';
  buildChoices(word).forEach(text => {
    const button = document.createElement('button');
    button.className = 'choice';
    button.textContent = text;
    button.addEventListener('click', () => {
      resolvePitch(performance.now() - startedAt, text === word.en);
    });
    el.choices.appendChild(button);
  });
}

/* ---------- the at-bat loop ---------- */

function startAtBat() {
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

  el.choices.querySelectorAll('.choice').forEach(button => {
    button.disabled = true;
    if (button.textContent === word.en) button.classList.add('correct');
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
  state.deck = shuffle(TIMED_VOCAB);
  el.summary.classList.add('hidden');
  el.pitchScreen.classList.remove('hidden');
  renderHud();
  startAtBat();
}

el.playAgain.addEventListener('click', startInning);
startInning();
