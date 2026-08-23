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
  // --- WALK: everyday words, close cognates, high frequency (19) ---
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
  { es: 'jugar',          en: 'to play',         tag: 'WALK'   },
  { es: 'practicar',      en: 'to practice',     tag: 'WALK'   },
  { es: 'rápido',         en: 'fast',            tag: 'WALK'   },
  { es: 'el uniforme',    en: 'the uniform',     tag: 'WALK'   },
  { es: 'el aficionado',  en: 'the fan',         tag: 'WALK'   },
  { es: 'el campeón',     en: 'the champion',    tag: 'WALK'   },
  { es: 'la liga',        en: 'the league',      tag: 'WALK'   },

  { es: 'el error',       en: 'the error',       tag: 'WALK'   },


  // --- SINGLE: common baseball terms, some verbs (13) ---
  { es: 'el lanzador',    en: 'the pitcher',     tag: 'SINGLE' },
  { es: 'el bateador',    en: 'the batter',      tag: 'SINGLE' },
  { es: 'la carrera',     en: 'the run (score)', tag: 'SINGLE' },
  { es: 'la gorra',       en: 'the cap',         tag: 'SINGLE' },
  { es: 'atrapar',        en: 'to catch',        tag: 'SINGLE' },
  { es: 'lanzar',         en: 'to throw/pitch',  tag: 'SINGLE' },
  { es: 'ganar',          en: 'to win',          tag: 'SINGLE' },




  { es: 'entrenar',       en: 'to train',        tag: 'SINGLE' },

  { es: 'el jonrón',      en: 'the homer',       tag: 'SINGLE' },
  { es: 'el out',         en: 'the out',         tag: 'SINGLE' },

  { es: 'el entrenador',  en: 'the coach',       tag: 'SINGLE' },


  { es: 'la jugada',      en: 'the play (on the field)', tag: 'SINGLE' },
  { es: 'el campeonato',  en: 'the championship', tag: 'SINGLE' },

  // --- DOUBLE: specialist vocabulary, false friends (31).
  //     el jardín and el cuadro are the real traps: "the garden" and "the
  //     square" are both perfectly good translations and both wrong here.
  //     el toque joins them — "the touch" is right everywhere but a ballpark. ---
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
  { es: 'fildear',        en: 'to field',                tag: 'DOUBLE' },
  { es: 'el rodado',      en: 'the ground ball',         tag: 'DOUBLE' },
  { es: 'el toque',       en: 'the bunt',                tag: 'DOUBLE' },
  { es: 'el corredor',    en: 'the runner',              tag: 'DOUBLE' },
  { es: 'el conteo',      en: 'the count',               tag: 'DOUBLE' },
  { es: 'la señal',       en: 'the sign',                tag: 'DOUBLE' },
  { es: 'el promedio',    en: 'the batting average',     tag: 'DOUBLE' },
  { es: 'la rompiente',   en: 'the breaking ball',       tag: 'DOUBLE' },
  { es: 'el turno al bate', en: 'the at-bat',            tag: 'DOUBLE' },
  { es: 'el equipo local', en: 'the home team',          tag: 'DOUBLE' },
  { es: 'la temporada',   en: 'the season',              tag: 'DOUBLE' },
  { es: 'el público',     en: 'the crowd',               tag: 'DOUBLE' },
  { es: 'anotar',         en: 'to score',                tag: 'DOUBLE' },
  { es: 'el sencillo',    en: 'the single (hit)',        tag: 'DOUBLE' },
  { es: 'la curva',       en: 'the curveball',           tag: 'DOUBLE' },
  { es: 'las gradas',     en: 'the stands',              tag: 'DOUBLE' },
  { es: 'deslizarse',     en: 'to slide',                tag: 'DOUBLE' },
  { es: 'la derrota',     en: 'the defeat',              tag: 'DOUBLE' },
  { es: 'el banco',       en: 'the bench (dugout)',      tag: 'DOUBLE' },
  { es: 'el marcador',    en: 'the scoreboard',          tag: 'DOUBLE' },

  // --- TRIPLE: positions and pitches you'd only know from the game (19).
  //     Mostly phrases from here on: the hard tiers are where a language
  //     stops being a list of nouns and starts being how a thing is said. ---
  { es: 'el toletero',    en: 'the slugger',        tag: 'TRIPLE' },
  { es: 'el campocorto',  en: 'the shortstop',      tag: 'TRIPLE' },
  { es: 'la recta',       en: 'the fastball',       tag: 'TRIPLE' },
  { es: 'el relevista',   en: 'the relief pitcher', tag: 'TRIPLE' },
  { es: 'la antesala',    en: 'third base',         tag: 'TRIPLE' },
  { es: 'el antesalista', en: 'the third baseman',  tag: 'TRIPLE' },
  { es: 'el cerrador',    en: 'the closer',         tag: 'TRIPLE' },
  { es: 'el abridor',     en: 'the starting pitcher', tag: 'TRIPLE' },
  { es: 'la línea',       en: 'the line drive',     tag: 'TRIPLE' },
  { es: 'la inicial',     en: 'first base',         tag: 'TRIPLE' },
  { es: 'la intermedia',  en: 'second base',        tag: 'TRIPLE' },
  { es: 'el jardinero central',   en: 'the center fielder',      tag: 'TRIPLE' },
  { es: 'el jardinero izquierdo', en: 'the left fielder',        tag: 'TRIPLE' },
  { es: 'el jardinero derecho',   en: 'the right fielder',       tag: 'TRIPLE' },
  { es: 'el bateador designado',  en: 'the designated hitter',   tag: 'TRIPLE' },
  { es: 'el lanzador zurdo',      en: 'the left-handed pitcher', tag: 'TRIPLE' },
  { es: 'la doble matanza',       en: 'the double play',         tag: 'TRIPLE' },
  { es: 'la base robada',         en: 'the stolen base',         tag: 'TRIPLE' },
  { es: 'el corredor emergente',  en: 'the pinch runner',        tag: 'TRIPLE' },

  // --- HOME RUN: Caribbean broadcast vocabulary, the hardest tier (18).
  //     el camarero is "the waiter", la mascota is "the pet", la efectividad
  //     is "the effectiveness" and el pisa y corre is "the step-on-it-and-run".
  //     None is guessable from the Spanish; you have to have heard the game
  //     called. This is where the phrases live. ---
  { es: 'el cuadrangular',      en: 'the home run',           tag: 'HOMERUN' },
  { es: 'la carrera impulsada', en: 'the run batted in (RBI)', tag: 'HOMERUN' },
  { es: 'el emergente',         en: 'the pinch hitter',       tag: 'HOMERUN' },
  { es: 'el inicialista',       en: 'the first baseman',      tag: 'HOMERUN' },
  { es: 'la almohadilla',       en: 'the base (bag)',         tag: 'HOMERUN' },
  { es: 'el camarero',          en: 'the second baseman',     tag: 'HOMERUN' },
  { es: 'el imparable',         en: 'the base hit (safe hit)', tag: 'HOMERUN' },
  { es: 'la mascota',           en: "the catcher's mitt",     tag: 'HOMERUN' },
  { es: 'la efectividad',       en: 'the earned run average (ERA)', tag: 'HOMERUN' },
  { es: 'el salvamento',        en: 'the save',               tag: 'HOMERUN' },
  { es: 'la blanqueada',        en: 'the shutout',            tag: 'HOMERUN' },
  { es: 'la base por bolas',    en: 'the walk (base on balls)', tag: 'HOMERUN' },
  { es: 'la carrera limpia',    en: 'the earned run',         tag: 'HOMERUN' },
  { es: 'el elevado de sacrificio', en: 'the sacrifice fly',  tag: 'HOMERUN' },
  { es: 'el pisa y corre',      en: 'the hit and run',        tag: 'HOMERUN' },
  { es: 'el cuerpo de lanzadores', en: 'the pitching staff',  tag: 'HOMERUN' },
  { es: 'el juego sin hit ni carrera', en: 'the no-hitter',   tag: 'HOMERUN' },
  { es: 'batear para el ciclo', en: 'to hit for the cycle',   tag: 'HOMERUN' }
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
