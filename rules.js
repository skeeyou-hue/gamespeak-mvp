/* =========================================================================
   GameSpeak — rules and data shared by both game modes.

   What lives here is what Classic and Tiered Timed Pitch genuinely agree
   on: the word list, and the base-running rules that turn a hit into runs.
   Everything a mode decides for itself — how a hit is earned, what a tier
   means, how an at-bat ends — stays in that mode's own file.

   All of it is pure: no DOM, no clock, no state. Loaded as a plain <script>
   in the browser and require()d under Node, so the same functions back both
   modes and their tests.
   ========================================================================= */


/* -------------------------------------------------------------------------
   2. THE VOCABULARY LIST
   Baseball-related Spanish words. Each entry is:
     es   - the Spanish word (shown to the player)
     en   - the correct English meaning
     tag  - difficulty, which doubles as the hit type earned
   Add or edit entries here — everything else adapts automatically.
   ------------------------------------------------------------------------- */
const VOCAB = [
  // --- WALK: everyday words, close cognates, high frequency (11) ---
  { es: 'el béisbol',     en: 'baseball',        tag: 'WALK'   },
  { es: 'la pelota',      en: 'the ball',        tag: 'WALK'   },
  { es: 'el bate',        en: 'the bat',         tag: 'WALK'   },
  { es: 'el guante',      en: 'the glove',       tag: 'WALK'   },
  { es: 'el equipo',      en: 'the team',        tag: 'WALK'   },
  { es: 'el jugador',     en: 'the player',      tag: 'WALK'   },
  { es: 'correr',         en: 'to run',          tag: 'WALK'   },
  { es: 'el estadio',     en: 'the stadium',     tag: 'WALK'   },
  { es: 'el juego',       en: 'the game',        tag: 'WALK'   },
  { es: 'batear',         en: 'to bat',          tag: 'WALK'   },
  { es: 'perder',         en: 'to lose',         tag: 'WALK'   },

  // --- SINGLE: common baseball terms, some verbs (11) ---
  { es: 'el lanzador',    en: 'the pitcher',     tag: 'SINGLE' },
  { es: 'el bateador',    en: 'the batter',      tag: 'SINGLE' },
  { es: 'la carrera',     en: 'the run (score)', tag: 'SINGLE' },
  { es: 'la gorra',       en: 'the cap',         tag: 'SINGLE' },
  { es: 'atrapar',        en: 'to catch',        tag: 'SINGLE' },
  { es: 'lanzar',         en: 'to throw/pitch',  tag: 'SINGLE' },
  { es: 'ganar',          en: 'to win',          tag: 'SINGLE' },
  { es: 'anotar',         en: 'to score',        tag: 'SINGLE' },
  { es: 'el sencillo',    en: 'the single (hit)', tag: 'SINGLE' },
  { es: 'la curva',       en: 'the curveball',   tag: 'SINGLE' },
  { es: 'las gradas',     en: 'the stands',      tag: 'SINGLE' },

  // --- DOUBLE: specialist vocabulary, false friends (11).
  //     el jardín and el cuadro are the real traps: "the garden" and "the
  //     square" are both perfectly good translations and both wrong here. ---
  { es: 'el receptor',    en: 'the catcher',             tag: 'DOUBLE' },
  { es: 'el jardinero',   en: 'the outfielder',          tag: 'DOUBLE' },
  { es: 'la entrada',     en: 'the inning',              tag: 'DOUBLE' },
  { es: 'el montículo',   en: "the pitcher's mound",     tag: 'DOUBLE' },
  { es: 'el árbitro',     en: 'the umpire',              tag: 'DOUBLE' },
  { es: 'ponchar',        en: 'to strike (someone) out', tag: 'DOUBLE' },
  { es: 'el jardín',      en: 'the outfield',            tag: 'DOUBLE' },
  { es: 'el cuadro',      en: 'the infield',             tag: 'DOUBLE' },
  { es: 'el ponche',      en: 'the strikeout',           tag: 'DOUBLE' },
  { es: 'el elevado',     en: 'the fly ball',            tag: 'DOUBLE' },
  { es: 'el cambio',      en: 'the changeup',            tag: 'DOUBLE' },

  // --- TRIPLE: positions and pitches you'd only know from the game (9) ---
  { es: 'el toletero',    en: 'the slugger',        tag: 'TRIPLE' },
  { es: 'el campocorto',  en: 'the shortstop',      tag: 'TRIPLE' },
  { es: 'la recta',       en: 'the fastball',       tag: 'TRIPLE' },
  { es: 'el relevista',   en: 'the relief pitcher', tag: 'TRIPLE' },
  { es: 'la antesala',    en: 'third base',         tag: 'TRIPLE' },
  { es: 'el antesalista', en: 'the third baseman',  tag: 'TRIPLE' },
  { es: 'el cerrador',    en: 'the closer',         tag: 'TRIPLE' },
  { es: 'el abridor',     en: 'the starting pitcher', tag: 'TRIPLE' },
  { es: 'la línea',       en: 'the line drive',     tag: 'TRIPLE' },

  // --- HOME RUN: Caribbean broadcast vocabulary, the hardest tier (8).
  //     el camarero is "the waiter" and la mascota is "the pet". Neither is
  //     guessable from the Spanish; you have to have heard the game called. ---
  { es: 'el cuadrangular',      en: 'the home run',           tag: 'HOMERUN' },
  { es: 'la carrera impulsada', en: 'the run batted in (RBI)', tag: 'HOMERUN' },
  { es: 'el emergente',         en: 'the pinch hitter',       tag: 'HOMERUN' },
  { es: 'el inicialista',       en: 'the first baseman',      tag: 'HOMERUN' },
  { es: 'la almohadilla',       en: 'the base (bag)',         tag: 'HOMERUN' },
  { es: 'el camarero',          en: 'the second baseman',     tag: 'HOMERUN' },
  { es: 'el imparable',         en: 'the base hit (safe hit)', tag: 'HOMERUN' },
  { es: 'la mascota',           en: "the catcher's mitt",     tag: 'HOMERUN' }
];


/* -------------------------------------------------------------------------
   SHUFFLING
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


/* -------------------------------------------------------------------------
   BASE RUNNING
   Bases are a three-slot array: [first, second, third], each true or false.
   Both functions take the current bases and hand back the new bases plus
   how many runs scored, without touching game state.

   Only Classic uses advanceOnWalk — Tiered Timed Pitch has no walks, since
   a WALK-tagged word there is just an easy word. It lives here anyway: it
   is the sibling of advanceOnHit, and splitting the pair across two files
   is how they drift apart.
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VOCAB, shuffle, advanceOnWalk, advanceOnHit };
  // Sibling files under Node reach these by bare name, the same way they do
  // in the browser where <script src="rules.js"> puts them in scope.
  Object.assign(globalThis, module.exports);
}
