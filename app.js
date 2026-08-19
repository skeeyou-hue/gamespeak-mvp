/* =========================================================================
   GameSpeak — a Spanish vocabulary quiz scored like a half-inning of baseball
   =========================================================================

   HOW IT WORKS
   1. You see one Spanish word and four English choices.
   2. Right answer  -> a "hit", worth WALK, SINGLE, or DOUBLE depending on
                       how hard that word is.
   3. Wrong answer  -> an "out".
   4. Three outs    -> the inning is over and you get a summary.

   Note on naming: WALK / SINGLE / DOUBLE are difficulty tiers, not literal
   play outcomes — WALK is the easiest tier. Change the labels in DIFFICULTY
   below if you'd rather call them EASY / MEDIUM / HARD.
   ========================================================================= */


/* -------------------------------------------------------------------------
   1. DIFFICULTY TIERS
   Each tier has a label, how many bases it's worth, and a message.
   ------------------------------------------------------------------------- */
const DIFFICULTY = {
  WALK:   { label: 'WALK',   bases: 1, praise: 'Walk! Take your base.' },
  SINGLE: { label: 'SINGLE', bases: 1, praise: 'Base hit!' },
  DOUBLE: { label: 'DOUBLE', bases: 2, praise: 'Double into the gap!' }
};


/* -------------------------------------------------------------------------
   2. THE VOCABULARY LIST
   20 baseball-related Spanish words. Each entry is:
     es   - the Spanish word (shown to the player)
     en   - the correct English meaning
     tag  - difficulty: 'WALK' (easiest), 'SINGLE', or 'DOUBLE' (hardest)
   Add or edit entries here — everything else adapts automatically.
   ------------------------------------------------------------------------- */
const VOCAB = [
  // --- WALK: everyday words, close cognates, high frequency (7) ---
  { es: 'el béisbol',     en: 'baseball',        tag: 'WALK'   },
  { es: 'la pelota',      en: 'the ball',        tag: 'WALK'   },
  { es: 'el bate',        en: 'the bat',         tag: 'WALK'   },
  { es: 'el guante',      en: 'the glove',       tag: 'WALK'   },
  { es: 'el equipo',      en: 'the team',        tag: 'WALK'   },
  { es: 'el jugador',     en: 'the player',      tag: 'WALK'   },
  { es: 'correr',         en: 'to run',          tag: 'WALK'   },

  // --- SINGLE: common baseball terms, some verbs (7) ---
  { es: 'el lanzador',    en: 'the pitcher',     tag: 'SINGLE' },
  { es: 'el bateador',    en: 'the batter',      tag: 'SINGLE' },
  { es: 'la carrera',     en: 'the run (score)', tag: 'SINGLE' },
  { es: 'la gorra',       en: 'the cap',         tag: 'SINGLE' },
  { es: 'atrapar',        en: 'to catch',        tag: 'SINGLE' },
  { es: 'lanzar',         en: 'to throw/pitch',  tag: 'SINGLE' },
  { es: 'ganar',          en: 'to win',          tag: 'SINGLE' },

  // --- DOUBLE: specialist vocabulary, false friends (6) ---
  { es: 'el receptor',    en: 'the catcher',           tag: 'DOUBLE' },
  { es: 'el jardinero',   en: 'the outfielder',        tag: 'DOUBLE' },
  { es: 'la entrada',     en: 'the inning',            tag: 'DOUBLE' },
  { es: 'el montículo',   en: "the pitcher's mound",   tag: 'DOUBLE' },
  { es: 'el árbitro',     en: 'the umpire',            tag: 'DOUBLE' },
  { es: 'ponchar',        en: 'to strike (someone) out', tag: 'DOUBLE' }
];

const MAX_OUTS = 3; // three outs and the inning is over


/* -------------------------------------------------------------------------
   3. GAME STATE
   Everything that changes during a game lives in this one object, so it is
   easy to see what the game "knows" at any moment.
   ------------------------------------------------------------------------- */
let state = {};

function newState() {
  return {
    deck: shuffle(VOCAB),  // the 20 words in random order
    index: 0,              // which word we're on (0-19)
    outs: 0,               // wrong answers so far
    hits: { WALK: 0, SINGLE: 0, DOUBLE: 0 }, // right answers by difficulty
    missed: [],            // words the player got wrong, for the summary
    locked: false          // true while feedback is showing, blocks double-clicks
  };
}


/* -------------------------------------------------------------------------
   4. GRAB THE PAGE ELEMENTS ONCE
   ------------------------------------------------------------------------- */
const el = {
  quizScreen:  document.getElementById('quiz-screen'),
  atBat:       document.getElementById('at-bat'),
  wordTag:     document.getElementById('word-tag'),
  word:        document.getElementById('word'),
  choices:     document.getElementById('choices'),
  feedback:    document.getElementById('feedback'),

  scoreWalk:   document.getElementById('score-walk'),
  scoreSingle: document.getElementById('score-single'),
  scoreDouble: document.getElementById('score-double'),
  outsDisplay: document.getElementById('outs-display'),

  summary:     document.getElementById('summary-screen'),
  summaryTitle:document.getElementById('summary-title'),
  summarySub:  document.getElementById('summary-sub'),
  sumWalk:     document.getElementById('sum-walk'),
  sumSingle:   document.getElementById('sum-single'),
  sumDouble:   document.getElementById('sum-double'),
  sumHits:     document.getElementById('sum-hits'),
  sumBases:    document.getElementById('sum-bases'),
  sumAvg:      document.getElementById('sum-avg'),
  missedBlock: document.getElementById('missed-block'),
  missedList:  document.getElementById('missed-list'),
  playAgain:   document.getElementById('play-again')
};


/* -------------------------------------------------------------------------
   5. SMALL HELPERS
   ------------------------------------------------------------------------- */

// Return a shuffled COPY of an array (Fisher-Yates shuffle).
function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Build the four answer choices: the correct meaning plus three wrong ones
// borrowed from other words in the list, then shuffled.
function buildChoices(correctWord) {
  const wrongOptions = VOCAB
    .filter(w => w.en !== correctWord.en)   // never repeat the right answer
    .map(w => w.en);

  const distractors = shuffle(wrongOptions).slice(0, 3);
  return shuffle([correctWord.en, ...distractors]);
}


/* -------------------------------------------------------------------------
   6. DRAWING THE SCREEN
   ------------------------------------------------------------------------- */

// Update the scoreboard numbers and the three out-dots.
function renderScoreboard() {
  el.scoreWalk.textContent   = state.hits.WALK;
  el.scoreSingle.textContent = state.hits.SINGLE;
  el.scoreDouble.textContent = state.hits.DOUBLE;

  // Fill in one dot per out recorded.
  const dots = el.outsDisplay.querySelectorAll('.out-dot');
  dots.forEach((dot, i) => dot.classList.toggle('filled', i < state.outs));
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
   7. ANSWERING A QUESTION
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
    // A hit — credited to the tier this word belongs to.
    state.hits[current.tag]++;
    el.feedback.textContent = `${DIFFICULTY[current.tag].praise} (${current.tag})`;
    el.feedback.className   = 'feedback good';
  } else {
    // An out — remember the word so we can list it in the summary.
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
    endInning('Through the lineup!', 'You used all 20 words without going down.');
  } else {
    renderQuestion();
  }
}


/* -------------------------------------------------------------------------
   8. END OF INNING SUMMARY
   ------------------------------------------------------------------------- */
function endInning(title, subtitle) {
  const totalHits = state.hits.WALK + state.hits.SINGLE + state.hits.DOUBLE;
  const totalBases =
      state.hits.WALK   * DIFFICULTY.WALK.bases +
      state.hits.SINGLE * DIFFICULTY.SINGLE.bases +
      state.hits.DOUBLE * DIFFICULTY.DOUBLE.bases;

  const atBats  = totalHits + state.outs;
  // Batting average, shown baseball-style: .500 rather than 0.5
  const average = atBats === 0 ? 0 : totalHits / atBats;

  el.summaryTitle.textContent = title;
  el.summarySub.textContent   = subtitle;
  el.sumWalk.textContent      = state.hits.WALK;
  el.sumSingle.textContent    = state.hits.SINGLE;
  el.sumDouble.textContent    = state.hits.DOUBLE;
  el.sumHits.textContent      = totalHits;
  el.sumBases.textContent     = totalBases;
  el.sumAvg.textContent       = average.toFixed(3).replace(/^0/, '');

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

  // Swap the quiz screen out for the summary screen.
  el.quizScreen.classList.add('hidden');
  el.summary.classList.remove('hidden');
}


/* -------------------------------------------------------------------------
   9. STARTING (AND RESTARTING) THE GAME
   ------------------------------------------------------------------------- */
function startInning() {
  state = newState();
  el.summary.classList.add('hidden');
  el.quizScreen.classList.remove('hidden');
  renderScoreboard();
  renderQuestion();
}

el.playAgain.addEventListener('click', startInning);

// Kick things off as soon as the page loads.
startInning();
