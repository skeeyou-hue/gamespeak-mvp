/* =========================================================================
   GameSpeak — a Spanish vocabulary quiz scored like a half-inning of baseball
   =========================================================================

   HOW IT WORKS
   1. You see one Spanish word and four English choices.
   2. Right answer  -> you reach base. How far depends on how hard the word
                       is: WALK, SINGLE, DOUBLE, TRIPLE, or HOME RUN.
   3. Wrong answer  -> an "out".
   4. Three outs    -> the inning is over and you get a box score.

   Runners on base advance by real baseball rules (see section 3), and runs
   score whenever a runner is pushed past third.

   Note on naming: WALK / SINGLE / DOUBLE / TRIPLE / HOME RUN are difficulty
   tiers as well as play outcomes — WALK is the easiest tier. Change the
   labels in DIFFICULTY below if you'd rather call them EASY ... HARDEST.
   ========================================================================= */


/* -------------------------------------------------------------------------
   1. DIFFICULTY TIERS
   Each tier has a label, how many bases the batter takes, how many total
   bases it's worth on the stat line, and a message.

   'advance' is the base-running distance: a single moves everyone up 1, a
   double 2, and so on. A walk is special (see advanceOnWalk) because it
   only pushes runners who are forced, so its advance is 0.
   ------------------------------------------------------------------------- */
const DIFFICULTY = {
  WALK:    { label: 'WALK',     advance: 0, bases: 1, praise: 'Walk! Take your base.' },
  SINGLE:  { label: 'SINGLE',   advance: 1, bases: 1, praise: 'Base hit!' },
  DOUBLE:  { label: 'DOUBLE',   advance: 2, bases: 2, praise: 'Double into the gap!' },
  TRIPLE:  { label: 'TRIPLE',   advance: 3, bases: 3, praise: 'Triple! Standing up at third.' },
  HOMERUN: { label: 'HOME RUN', advance: 4, bases: 4, praise: '¡Jonrón! Gone.' }
};


/* The word list and the base-running rules live in rules.js,
   shared with Tiered Timed Pitch. */

const MAX_OUTS = 3; // three outs and the inning is over

// There is no opposing side in the game yet, so the visiting line on the
// outfield scorebug is a placeholder. Replace this when one exists.
const VISITOR_RUNS = 2;


/* -------------------------------------------------------------------------
   3. BASE-RUNNING RULES
   Bases are a three-slot array: [first, second, third], each true or false.
   Both functions are pure — they take the current bases and hand back the
   new bases plus how many runs scored, without touching game state. That
   makes them easy to test on their own.
   ------------------------------------------------------------------------- */


/* -------------------------------------------------------------------------
   4. GAME STATE
   Everything that changes during a game lives in this one object, so it is
   easy to see what the game "knows" at any moment.
   ------------------------------------------------------------------------- */
let state = {};

function newState(inning) {
  return {
    inning,                 // which inning this is, counting from 1
    deck: shuffle(VOCAB),   // the words in random order
    index: 0,               // which word we're on
    outs: 0,                // wrong answers so far
    runs: 0,                // runs driven in this inning
    bases: [false, false, false],  // [first, second, third]
    hits: { WALK: 0, SINGLE: 0, DOUBLE: 0, TRIPLE: 0, HOMERUN: 0 },
    missed: [],             // words the player got wrong, for the box score
    locked: false           // true while feedback is showing, blocks double-clicks
  };
}


/* -------------------------------------------------------------------------
   5. GRAB THE PAGE ELEMENTS ONCE
   ------------------------------------------------------------------------- */
const el = {
  quizScreen:  document.getElementById('quiz-screen'),
  atBat:       document.getElementById('at-bat'),
  wordTag:     document.getElementById('word-tag'),
  word:        document.getElementById('word'),
  choices:     document.getElementById('choices'),
  feedback:    document.getElementById('feedback'),

  scoreRuns:   document.getElementById('score-runs'),
  outsDisplay: document.getElementById('outs-display'),

  // The scorebug out on the outfield wall
  boardAwayRuns: document.getElementById('board-away-runs'),
  boardHomeRuns: document.getElementById('board-home-runs'),
  boardInning:   document.getElementById('board-inning'),
  boardOuts:     document.getElementById('board-outs'),

  // Base state shows up twice: as the HUD diamond in the corner, and as
  // runners out on the field itself.
  pips:        [document.getElementById('pip-first'),
                document.getElementById('pip-second'),
                document.getElementById('pip-third')],
  runners:     [document.getElementById('runner-first'),
                document.getElementById('runner-second'),
                document.getElementById('runner-third')],

  summary:      document.getElementById('summary-screen'),
  summaryTitle: document.getElementById('summary-title'),
  summarySub:   document.getElementById('summary-sub'),
  sumRuns:      document.getElementById('sum-runs'),
  sumWalk:      document.getElementById('sum-walk'),
  sumSingle:    document.getElementById('sum-single'),
  sumDouble:    document.getElementById('sum-double'),
  sumTriple:    document.getElementById('sum-triple'),
  sumHomerun:   document.getElementById('sum-homerun'),
  sumHits:      document.getElementById('sum-hits'),
  sumBases:     document.getElementById('sum-bases'),
  sumAvg:       document.getElementById('sum-avg'),
  sumLob:       document.getElementById('sum-lob'),
  missedBlock:  document.getElementById('missed-block'),
  missedList:   document.getElementById('missed-list'),
  playAgain:    document.getElementById('play-again'),

  startScreen:  document.getElementById('start-screen'),
  startButton:  document.getElementById('start-button'),
  startCount:   document.getElementById('start-count')
};


/* -------------------------------------------------------------------------
   6. SMALL HELPERS
   ------------------------------------------------------------------------- */


// Build the four answer choices: the correct meaning plus three wrong ones
// borrowed from other words in the list, then shuffled.
function buildChoices(correctWord) {
  const wrongOptions = VOCAB
    .filter(w => w.en !== correctWord.en)   // never repeat the right answer
    .map(w => w.en);

  const distractors = shuffle(wrongOptions).slice(0, 3);
  return shuffle([correctWord.en, ...distractors]);
}

// "1 run" / "2 runs", for the feedback line.
function runWord(count) {
  return count === 1 ? '1 run' : `${count} runs`;
}


/* -------------------------------------------------------------------------
   7. DRAWING THE SCREEN
   ------------------------------------------------------------------------- */

// Update runs, the out-dots, and the base state. The per-tier hit counts
// are still tracked in state — they show up in the box score at the end of
// the inning, not on the HUD during play.
function renderScoreboard() {
  el.scoreRuns.textContent = state.runs;

  // The outfield scorebug reads from the same state as the HUD.
  el.boardAwayRuns.textContent = VISITOR_RUNS;
  el.boardHomeRuns.textContent = state.runs;
  el.boardInning.textContent   = state.inning;
  el.boardOuts.textContent     = `${state.outs} OUT`;

  // Fill in one dot per out recorded.
  const dots = el.outsDisplay.querySelectorAll('.out-dot');
  dots.forEach((dot, i) => dot.classList.toggle('filled', i < state.outs));

  // Light up the scoreboard diamond and the runners on the field together.
  state.bases.forEach((occupied, i) => {
    el.pips[i].classList.toggle('on', occupied);
    el.runners[i].classList.toggle('on', occupied);
  });
}

// Show the current word and its four answer buttons.
function renderQuestion() {
  const current = state.deck[state.index];

  el.atBat.textContent   = `At-bat ${state.index + 1} of ${state.deck.length}`;
  el.word.textContent    = current.es;
  el.wordTag.textContent = DIFFICULTY[current.tag].label;
  el.wordTag.className   = `tag tag-${current.tag.toLowerCase()}`; // colors the tag
  el.feedback.innerHTML  = '&nbsp;'; // keeps the line height steady

  // Rebuild the answer buttons from scratch each time.
  el.choices.innerHTML = '';
  buildChoices(current).forEach(choiceText => {
    const button = document.createElement('button');
    button.className = 'choice';
    button.textContent = choiceText;
    button.addEventListener('click', () => handleAnswer(choiceText, button));
    el.choices.appendChild(button);
  });
}


/* -------------------------------------------------------------------------
   8. ANSWERING A QUESTION
   ------------------------------------------------------------------------- */
function handleAnswer(picked, clickedButton) {
  if (state.locked) return;  // ignore extra clicks while feedback shows
  state.locked = true;

  const current   = state.deck[state.index];
  const isCorrect = picked === current.en;

  // Mark every button: green for the right answer, red for a wrong pick.
  el.choices.querySelectorAll('.choice').forEach(button => {
    button.disabled = true;
    if (button.textContent === current.en) button.classList.add('correct');
  });
  if (!isCorrect) clickedButton.classList.add('wrong');

  if (isCorrect) {
    // Credit the hit, then run the bases.
    const tier = DIFFICULTY[current.tag];
    state.hits[current.tag]++;

    const play = current.tag === 'WALK'
      ? advanceOnWalk(state.bases)
      : advanceOnHit(state.bases, tier.advance);

    state.bases = play.bases;
    state.runs += play.runs;

    el.feedback.textContent = play.runs > 0
      ? `${tier.praise} ${runWord(play.runs)} in.`
      : tier.praise;
    el.feedback.className = 'feedback good';
  } else {
    // An out — runners stay where they are.
    state.outs++;
    state.missed.push(current);
    el.feedback.textContent = `Out. "${current.es}" means "${current.en}".`;
    el.feedback.className   = 'feedback bad';
  }

  renderScoreboard();

  // Pause so the player can read the feedback, then move on.
  setTimeout(nextTurn, 1400);
}

// Decide whether to ask another word or end the inning.
function nextTurn() {
  state.locked = false;
  state.index++;

  if (state.outs >= MAX_OUTS) {
    endInning('Inning over', 'Three outs — side retired.');
  } else if (state.index >= state.deck.length) {
    endInning('Through the lineup!', `You used all ${state.deck.length} words without going down.`);
  } else {
    renderQuestion();
  }
}


/* -------------------------------------------------------------------------
   9. END OF INNING BOX SCORE
   ------------------------------------------------------------------------- */
function endInning(title, subtitle) {
  const h = state.hits;
  const totalHits = h.WALK + h.SINGLE + h.DOUBLE + h.TRIPLE + h.HOMERUN;
  const totalBases =
      h.WALK    * DIFFICULTY.WALK.bases +
      h.SINGLE  * DIFFICULTY.SINGLE.bases +
      h.DOUBLE  * DIFFICULTY.DOUBLE.bases +
      h.TRIPLE  * DIFFICULTY.TRIPLE.bases +
      h.HOMERUN * DIFFICULTY.HOMERUN.bases;

  const atBats  = totalHits + state.outs;
  // Batting average, shown baseball-style: .500 rather than 0.5
  const average = atBats === 0 ? 0 : totalHits / atBats;

  // Left on base: runners still standing when the inning ended.
  const leftOnBase = state.bases.filter(Boolean).length;

  el.summaryTitle.textContent = title;
  el.summarySub.textContent   = subtitle;
  el.sumRuns.textContent      = state.runs;
  el.sumWalk.textContent      = h.WALK;
  el.sumSingle.textContent    = h.SINGLE;
  el.sumDouble.textContent    = h.DOUBLE;
  el.sumTriple.textContent    = h.TRIPLE;
  el.sumHomerun.textContent   = h.HOMERUN;
  el.sumHits.textContent      = totalHits;
  el.sumBases.textContent     = totalBases;
  el.sumAvg.textContent       = average.toFixed(3).replace(/^0/, '');
  el.sumLob.textContent       = leftOnBase;

  // List the missed words, or hide that block if there were none.
  if (state.missed.length > 0) {
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

  // Swap the quiz screen out for the box score.
  el.quizScreen.classList.add('hidden');
  el.summary.classList.remove('hidden');
}


/* -------------------------------------------------------------------------
   10. STARTING (AND RESTARTING) THE GAME
   ------------------------------------------------------------------------- */
// The start screen puts a state on the board before play begins, so the
// inning number cannot simply be "one more than whatever is there" any
// more — that would make the first pitch of the session the second inning.
let started = false;

function startInning() {
  // Carry the inning count forward; the first inning is 1.
  state = newState(started ? state.inning + 1 : 1);
  started = true;
  el.startScreen.classList.add('hidden');
  el.summary.classList.add('hidden');
  el.quizScreen.classList.remove('hidden');
  renderScoreboard();
  renderQuestion();
}

/* The start screen. Nothing is live behind it: no word is drawn and no
   state exists until it is pressed, so the first thing a player sees is a
   choice rather than a question already waiting on them.

   It is shown once, at load. The summary's "play another inning" goes
   straight back to a live inning rather than through here — the gesture
   this screen exists to collect has already happened by then, and making
   someone press start twice for the same session is a step, not a gate. */
function showStart() {
  el.startScreen.classList.remove('hidden');
  el.quizScreen.classList.add('hidden');
  el.summary.classList.add('hidden');
  el.startCount.textContent = VOCAB.length;
  // The board reads what a scorebug reads before the first pitch: inning
  // one, nobody on, nobody out. Not inning zero, which is not a thing.
  state = newState(1);
  renderScoreboard();
}

el.playAgain.addEventListener('click', startInning);
el.startButton.addEventListener('click', () => {
  unlockAudio();          // inside the gesture, which is the whole point
  startInning();
});

// Nothing runs until the player says so.
showStart();
