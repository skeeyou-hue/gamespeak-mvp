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


/* -------------------------------------------------------------------------
   2. THE VOCABULARY LIST
   Baseball-related Spanish words. Each entry is:
     es   - the Spanish word (shown to the player)
     en   - the correct English meaning
     tag  - difficulty, which doubles as the hit type earned
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
  { es: 'el receptor',    en: 'the catcher',             tag: 'DOUBLE' },
  { es: 'el jardinero',   en: 'the outfielder',          tag: 'DOUBLE' },
  { es: 'la entrada',     en: 'the inning',              tag: 'DOUBLE' },
  { es: 'el montículo',   en: "the pitcher's mound",     tag: 'DOUBLE' },
  { es: 'el árbitro',     en: 'the umpire',              tag: 'DOUBLE' },
  { es: 'ponchar',        en: 'to strike (someone) out', tag: 'DOUBLE' },

  // --- TRIPLE: positions and pitches you'd only know from the game (5) ---
  { es: 'el toletero',    en: 'the slugger',        tag: 'TRIPLE' },
  { es: 'el campocorto',  en: 'the shortstop',      tag: 'TRIPLE' },
  { es: 'la recta',       en: 'the fastball',       tag: 'TRIPLE' },
  { es: 'el relevista',   en: 'the relief pitcher', tag: 'TRIPLE' },
  { es: 'la antesala',    en: 'third base',         tag: 'TRIPLE' },

  // --- HOME RUN: Caribbean broadcast vocabulary, the hardest tier (5) ---
  { es: 'el cuadrangular',      en: 'the home run',           tag: 'HOMERUN' },
  { es: 'la carrera impulsada', en: 'the run batted in (RBI)', tag: 'HOMERUN' },
  { es: 'el emergente',         en: 'the pinch hitter',       tag: 'HOMERUN' },
  { es: 'el inicialista',       en: 'the first baseman',      tag: 'HOMERUN' },
  { es: 'la almohadilla',       en: 'the base (bag)',         tag: 'HOMERUN' }
];

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

// A WALK only moves runners who are FORCED to move. The batter takes first,
// which forces a runner on first, who forces a runner on second, and so on.
// A runner on second with first base empty does not move at all.
function advanceOnWalk(bases) {
  const [first, second, third] = bases;

  if (!first)  return { bases: [true, second, third], runs: 0 };
  if (!second) return { bases: [true, true, third],   runs: 0 };
  if (!third)  return { bases: [true, true, true],    runs: 0 };

  // Bases loaded: the runner on third is forced home.
  return { bases: [true, true, true], runs: 1 };
}

// A HIT moves every runner the same number of bases the batter takes:
// 1 on a single, 2 on a double, 3 on a triple, 4 on a home run. Anyone
// pushed past third scores.
function advanceOnHit(bases, advance) {
  const next = [false, false, false];
  let runs = 0;

  // Existing runners first: index 0 is first base, 2 is third.
  bases.forEach((occupied, index) => {
    if (!occupied) return;
    const destination = index + advance;   // 3 or more means home
    if (destination > 2) runs++;
    else next[destination] = true;
  });

  // Then the batter, who ends up on base number `advance`.
  if (advance > 3) runs++;                 // home run: the batter scores too
  else next[advance - 1] = true;

  return { bases: next, runs };
}


/* -------------------------------------------------------------------------
   4. THE BANKED HOME-RUN SWING
   Three SINGLE-tier hits in a row bank a bonus swing. The player does not
   have to use it right away — it sits in state until they spend it, or
   until it times out after a random number of later at-bats.

   All of this is pure: applyAtBatToBonus takes the current bonus, the
   current streak, what just happened, and a 0..1 roll, and hands back the
   new bonus and streak. No state is touched here, so every rule can be
   tested one case at a time.
   ------------------------------------------------------------------------- */

const BONUS_STREAK   = 3;   // SINGLE-tier hits in a row needed to bank one
const BONUS_LIFE_MIN = 1;   // shortest a banked swing survives, in at-bats
const BONUS_LIFE_MAX = 3;   // longest

// How many later at-bats a freshly banked swing survives. `roll` is a
// number in [0, 1) — Math.random() in the game, a fixed value in tests.
function rollBonusLife(roll) {
  const span = BONUS_LIFE_MAX - BONUS_LIFE_MIN + 1;
  return BONUS_LIFE_MIN + Math.floor(roll * span);
}

// Fold one finished at-bat into the bonus state.
//
//   bonus   - { atBatsLeft } if one is banked, otherwise null
//   streak  - SINGLE-tier hits in a row before this at-bat
//   outcome - 'WALK' | 'SINGLE' | 'DOUBLE' | 'TRIPLE' | 'HOMERUN' | 'OUT'
//   roll    - only read when this at-bat banks a new swing
//
// Order matters: an existing swing ages FIRST, so the at-bat that banks a
// swing never also ages it. Anything that isn't a single — including an
// out, a walk, or a bigger hit — resets the streak to zero.
function applyAtBatToBonus(bonus, streak, outcome, roll) {
  // 1. A banked swing gets one at-bat older, and expires at zero.
  let nextBonus = bonus ? { atBatsLeft: bonus.atBatsLeft - 1 } : null;
  if (nextBonus && nextBonus.atBatsLeft <= 0) nextBonus = null;

  // 2. The streak only survives on a single.
  const nextStreak = outcome === 'SINGLE' ? streak + 1 : 0;

  // 3. Three in a row banks a fresh swing, replacing any older one, and
  //    starts the streak over.
  if (nextStreak >= BONUS_STREAK) {
    return { bonus: { atBatsLeft: rollBonusLife(roll) }, streak: 0, banked: true };
  }

  return { bonus: nextBonus, streak: nextStreak, banked: false };
}


/* -------------------------------------------------------------------------
   5. GAME STATE
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
    singleStreak: 0,        // SINGLE-tier hits in a row, toward a banked swing
    bonus: null,            // { atBatsLeft } once a swing is banked
    missed: [],             // words the player got wrong, for the box score
    locked: false           // true while feedback is showing, blocks double-clicks
  };
}


/* -------------------------------------------------------------------------
   6. GRAB THE PAGE ELEMENTS ONCE
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
  playAgain:    document.getElementById('play-again')
};


/* -------------------------------------------------------------------------
   7. SMALL HELPERS
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

// "1 run" / "2 runs", for the feedback line.
function runWord(count) {
  return count === 1 ? '1 run' : `${count} runs`;
}


/* -------------------------------------------------------------------------
   8. DRAWING THE SCREEN
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
   9. ANSWERING A QUESTION
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

  // Every finished at-bat ages a banked swing and moves the streak along.
  const bonusStep = applyAtBatToBonus(
    state.bonus, state.singleStreak, isCorrect ? current.tag : 'OUT', Math.random());
  state.bonus        = bonusStep.bonus;
  state.singleStreak = bonusStep.streak;

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
   10. END OF INNING BOX SCORE
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
   11. STARTING (AND RESTARTING) THE GAME
   ------------------------------------------------------------------------- */
function startInning() {
  // Carry the inning count forward; the first inning is 1.
  state = newState((state.inning || 0) + 1);
  el.summary.classList.add('hidden');
  el.quizScreen.classList.remove('hidden');
  renderScoreboard();
  renderQuestion();
}

el.playAgain.addEventListener('click', startInning);

// Kick things off as soon as the page loads.
startInning();
