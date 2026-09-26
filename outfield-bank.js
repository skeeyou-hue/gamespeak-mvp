/* OUTFIELDER — THE SENTENCE BANK.

   EVERYTHING HERE IS PROVISIONAL. No entry has been seen by a native
   speaker, and none ships as finished content. The point of the playable
   slice is to give a reviewer something to play so they can say what is
   wrong with it; until one has, treat every sentence, gloss, distractor
   and "wrong here" note as a proposal.

   The schema and its reasoning are documented in docs/sentence-entry.js,
   which reads its worked example from this file so there is one copy of
   the data.

   ---------------------------------------------------------------------
   WHY THE BANK IS ONE SENTENCE

   Two reasons, and neither is that the work was skipped.

   1. EVERY PUBLISHED SOURCE IS UNREACHABLE FROM HERE. es.wikipedia.org,
      wbsc.org, rfebs.es, img.mlbstatic.com, lasmayores.com and
      espndeportes.espn.com all fail at the network egress proxy. Search
      returns summaries, and a search summary is not a verbatim quotation
      — attributing one to a source as though it were would be inventing
      content with a citation stapled on, which is worse than inventing
      it plainly.

   2. THE OTHER TWO MISSION-SPEC SEEDS CANNOT CARRY A ROOKIE INNING.
      Recorded below with the reason, so nobody re-derives it.
   ------------------------------------------------------------------- */

/* REJECTED, with cause. Both are the seeds from the mission spec, which
   were offered as shape examples rather than corpus. Neither survives
   the determinability rule.

   "Bateé un doble y un sencillo."
     5 content tokens, 2 right-leaning determiner pairs (un/doble,
     un/sencillo) -> a ceiling of 3, which is exactly Rookie. But the
     third slot has to be the verb, and THE VERB'S PERSON IS NOT
     DETERMINABLE: Spanish drops the subject, so "___ un doble y un
     sencillo" is equally Bateé, Bateó or Batearon and nothing on screen
     decides between them. Without the verb the ceiling is 2. Below
     Rookie.

   "Ponché a siete bateadores."
     3 content tokens and no right-leaning pairs, so nominally 3 — but
     the same null-subject problem removes the verb, leaving 2. Below
     Rookie.

   THE RULE THIS TURNED UP, which belongs in the commissioning brief:
   A FINITE VERB CAN ONLY BE A SLOT IF THE SENTENCE NAMES ITS SUBJECT.
   The worked entry gets away with blanking two verbs because "El
   bateador" is right there. A subjectless sentence can still be played,
   but every one of its verbs is a given, which costs it a slot and
   usually a rung. Commission sentences with explicit subjects. */
const REJECTED = [
  { es: 'El bateador terminó 1-de-4.',
    origin: 'SABR Spanish style guide',
    why: 'ceiling 1, Rookie needs 3. TWO tokens cannot be slots at all rather ' +
         'than merely conflicting: `terminó` is the only finite verb, so ' +
         'blanking it leaves nothing on screen saying the tense — "El bateador ' +
         '___ 1-de-4" is equally termina, terminó and terminará; and `1-de-4` ' +
         'is a fact rather than a form, since 2-de-4 and 1-de-3 are equally ' +
         'grammatical and a gloss would BE the answer. That leaves El and ' +
         'bateador, which are a right-leaning pair, so one of the two.' },
  { es: 'Bateé un doble y un sencillo.',
    origin: 'mission-spec seed, offered as shape only',
    why: 'null subject — the verb\'s person is undeterminable; ceiling 2, Rookie needs 3' },
  { es: 'Ponché a siete bateadores.',
    origin: 'mission-spec seed, offered as shape only',
    why: 'null subject — same cause; ceiling 2, Rookie needs 3' }
];

/* ANALYSED, PASSES, NOT YET AUTHORED. Kept here so the provenance is not
   lost between the analysis and the authoring. It is not an entry and the
   game cannot see it. */
const PENDING = [
  { es: 'La bateadora golpeó la pelota con tanta fuerza que se salió del campo.',
    origin: 'ingles.com, bilingual dictionary example',
    ceiling: 6, rungs: 'Rookie through Triple-A',
    structure: '10 content tokens, 4 right-leaning pairs — La/bateadora, ' +
               'la/pelota, tanta/fuerza, and the two finite verbs anchoring ' +
               "each other's tense.",
    adviserFlags: [
      'SENSE, not grammar. Nothing in this sentence is baseball-specific: ' +
      'bateadora, pelota, fuerza and campo all read as cricket just as well. ' +
      'The caution about lanzador/bowler generalises — a bilingual dictionary ' +
      'example carries no sport marker at all, so the sense has to be assigned ' +
      'rather than assumed.',
      'REGISTER. "se salió del campo" is a literal rendering; Spanish baseball ' +
      'coverage is likelier to say "salió del parque" or "se fue de jonrón". ' +
      'Flagged, not corrected — changing it would stop it being attested.',
      'The clitic `se` is a defensible slot (person, from la pelota) but ' +
      '"le salió" is also grammatical and means something else, so whether it ' +
      'is separable by grammar alone is an adviser call.'
    ] }
];

const ENTRIES = [
  {
    id: 'SENT-0001',
    provisional: true,
    source: {
      text:     'El bateador conectó un doble y tuvo dos carreras impulsadas.',
      origin:   'mission-spec seed, offered as shape only — NOT sourced corpus',
      citation: null, retrieved: null, licence: null
    },
    adviser: { name: null, reviewed: null, verdict: null, notes:
      '"tuvo dos carreras impulsadas" reads as a calque of "had two RBIs"; a ' +
      'native sports register may prefer "impulsó dos carreras". Flagged, not ' +
      'silently corrected.' },

    es: 'El bateador conectó un doble y tuvo dos carreras impulsadas.',
    en: 'The batter connected for a double and drove in two runs.',

    tokens: [
      { i: 0, form: 'El', lemma: 'el', pos: 'DET',
        morph: { gender: 'M', number: 'SG', definite: true },
        requires: [{ token: 1, why: 'the article agrees with a noun to its RIGHT' }] },
      { i: 1, form: 'bateador', lemma: 'bateador', pos: 'NOUN',
        morph: { gender: 'M', number: 'SG' },
        requires: [{ token: 0, why: 'gender and number come from the article' }] },
      { i: 2, form: 'conectó', lemma: 'conectar', pos: 'VERB',
        morph: { mood: 'IND', tense: 'PRET', person: 3, number: 'SG' },
        requires: [
          { token: 1, why: 'person and number come from the named subject' },
          { token: 6, why: 'tense has no anchor unless another finite verb is given' }] },
      { i: 3, form: 'un', lemma: 'uno', pos: 'DET',
        morph: { gender: 'M', number: 'SG', definite: false },
        requires: [{ token: 4, why: 'the determiner leans right, as El does' }] },
      { i: 4, form: 'doble', lemma: 'doble', pos: 'NOUN',
        morph: { gender: 'M', number: 'SG' },
        requires: [{ token: 3, why: 'number comes from the determiner' }] },
      { i: 5, form: 'y', lemma: 'y', pos: 'CONJ', morph: {} },
      { i: 6, form: 'tuvo', lemma: 'tener', pos: 'VERB',
        morph: { mood: 'IND', tense: 'PRET', person: 3, number: 'SG' },
        requires: [{ token: 2, why: 'tense anchor, mutually with conectó' }] },
      { i: 7, form: 'dos', lemma: 'dos', pos: 'NUM', morph: { number: 'PL' } },
      { i: 8, form: 'carreras', lemma: 'carrera', pos: 'NOUN',
        morph: { gender: 'F', number: 'PL' },
        requires: [{ token: 7, why: 'number comes from the numeral' }] },
      { i: 9, form: 'impulsadas', lemma: 'impulsar', pos: 'ADJ',
        morph: { gender: 'F', number: 'PL', nonfinite: 'PART' },
        agreesWith: 8,
        requires: [{ token: 8, why: 'gender and number come from the noun' }] }
    ],

    slots: [
      { token: 1, answer: 'bateador', gloss: 'batter',
        teaches: 'noun gender and number, and the agreement with El',
        distractors: [
          { form: 'bateadores', axis: 'number',
            wrongHere: 'El is singular; "El bateadores" does not agree' },
          { form: 'bateadora', axis: 'gender',
            wrongHere: 'El is masculine; the feminine takes La' },
          { form: 'bateo', axis: 'lexical',
            wrongHere: 'same field, wrong word — the act, not the person' }
        ],
        blocked: [{ form: 'batear', why: 'an infinitive after a determiner is a ' +
          'different construction, rejected on shape without being read' }] },

      { token: 2, answer: 'conectó', gloss: null,
        teaches: 'preterite, third person singular — three independent axes',
        distractors: [
          { form: 'conecta', axis: 'tense',
            wrongHere: 'present; the narration is preterite throughout' },
          { form: 'conecté', axis: 'person',
            wrongHere: 'first person; the subject is el bateador' },
          { form: 'conectaron', axis: 'number',
            wrongHere: 'third plural; the subject is singular' }
        ],
        blocked: [
          { form: 'conectado', why: 'participle — needs an auxiliary this sentence ' +
            'does not have, so it tests something else' },
          { form: 'conectara', why: 'imperfect subjunctive is real and genuinely ' +
            'wrong here, but two steps of grammar away. Adviser call.' }] },

      { token: 4, answer: 'doble', gloss: 'double',
        teaches: 'number on a noun, and the vocabulary around it',
        distractors: [
          { form: 'dobles', axis: 'number', wrongHere: 'un is singular' },
          { form: 'sencillo', axis: 'lexical', wrongHere: 'a single, not a double' },
          { form: 'triple', axis: 'lexical', wrongHere: 'a triple, not a double' }
        ],
        blocked: [{ form: 'doblar', why: 'verb; see batear above' }],
        note: 'one morphological axis available; two distractors are lexical' },

      { token: 8, answer: 'carreras', gloss: 'run',
        teaches: 'number agreement with the numeral dos',
        distractors: [
          { form: 'carrera', axis: 'number', wrongHere: 'dos requires the plural' },
          { form: 'entradas', axis: 'lexical', wrongHere: 'innings, not runs' },
          { form: 'bases', axis: 'lexical', wrongHere: 'bases, not runs' }
        ],
        blocked: [],
        note: 'one morphological axis available; two distractors are lexical' },

      { token: 9, answer: 'impulsadas', gloss: null,
        teaches: 'a participle agreeing with a noun the player has already placed',
        distractors: [
          { form: 'impulsados', axis: 'gender', wrongHere: 'carreras is feminine' },
          { form: 'impulsada', axis: 'number', wrongHere: 'carreras is plural' },
          { form: 'impulsar', axis: 'finiteness',
            wrongHere: 'an infinitive cannot agree with anything' }
        ],
        blocked: [{ form: 'impulsando', why: 'gerund; ungrammatical here but for a ' +
          'reason the player cannot see from the sentence alone' }],
        dependsOn: [8] }
    ],
    freeSlots: []
  }
];

/* ---------------------------------------------------------------------
   THE VALIDATOR.

   Runs in the test suite over every entry. It exists because the failure
   it catches — two correct balls in the air, or a slot that cannot be
   answered from the screen — is silent in play: the player is simply
   marked wrong for a right answer and never learns why.
   ------------------------------------------------------------------- */
/* Browser: outfield-rules.js is already loaded. Node: pull it in, which
   also puts its names in scope. */
if (typeof require !== 'undefined' && typeof module !== 'undefined') {
  require('./outfield-rules.js');
}
const R = { NEVER_BLANK, slotCeiling, rungsFor };

function validate(entry) {
  const errs = [];
  const say = m => errs.push(`${entry.id}: ${m}`);

  const byIndex = new Map(entry.tokens.map(t => [t.i, t]));
  entry.tokens.forEach((t, k) => {
    if (t.i !== k) say(`token ${k} has i=${t.i}; indices must match position`);
    if (!t.pos) say(`token ${t.i} (${t.form}) has no part of speech`);
    for (const r of t.requires || []) {
      if (!byIndex.has(r.token)) say(`token ${t.i} requires missing token ${r.token}`);
      if (!r.why) say(`token ${t.i} requires ${r.token} with no reason given`);
    }
  });

  for (const s of entry.slots) {
    const tok = byIndex.get(s.token);
    if (!tok) { say(`slot on missing token ${s.token}`); continue; }
    if (tok.form !== s.answer) {
      say(`slot ${s.token} answers "${s.answer}" but the token is "${tok.form}"`);
    }
    if (R.NEVER_BLANK.includes(tok.pos)) {
      say(`slot ${s.token} (${tok.form}) is a ${tok.pos} and must never be blanked`);
    }
    const forms = [s.answer, ...s.distractors.map(d => d.form)];
    if (forms.length !== 4) say(`slot ${s.token} has ${forms.length} balls, not 4`);
    if (new Set(forms).size !== forms.length) say(`slot ${s.token} has a duplicate ball`);
    for (const d of s.distractors) {
      if (!d.axis) say(`slot ${s.token}: "${d.form}" has no perturbation axis`);
      if (!d.wrongHere) say(`slot ${s.token}: "${d.form}" has no reason it is wrong here`);
      if (d.form === s.answer) say(`slot ${s.token}: "${d.form}" is the answer`);
    }
    /* The gloss rule, both ways round. A lexical distractor cannot be
       separated by grammar, so the slot must carry one; a slot without
       one must not, or the gloss replaces retrieval with translation. */
    const lexical = s.distractors.some(d => d.axis === 'lexical');
    if (lexical && !s.gloss) say(`slot ${s.token} has lexical distractors and no gloss`);
    if (!lexical && s.gloss) say(`slot ${s.token} is settled by grammar but carries a gloss`);
    /* A finite verb with no named subject cannot be a slot: Spanish drops
       the subject, so the person is undeterminable from the screen. */
    if (tok.pos === 'VERB' && tok.morph && tok.morph.person &&
        !(tok.requires || []).some(r => byIndex.get(r.token) &&
                                        ['NOUN', 'PRON'].includes(byIndex.get(r.token).pos))) {
      say(`slot ${s.token} (${tok.form}) is a finite verb with no subject token to fix its person`);
    }
  }

  const ceiling = R.slotCeiling(entry);
  const playable = R.rungsFor(entry);
  if (!playable.length) say('carries no rung at all');
  return { ok: errs.length === 0, errors: errs, ceiling: ceiling.max, playable };
}

const validateAll = () => ENTRIES.map(e => ({ id: e.id, ...validate(e) }));

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ENTRIES, REJECTED, PENDING, validate, validateAll };
  Object.assign(globalThis, module.exports);
}
