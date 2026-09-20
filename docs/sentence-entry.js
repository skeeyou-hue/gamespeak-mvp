/* ONE FULLY-SPECIFIED SENTENCE ENTRY — the commissioning spec.

   This is what an author and the language adviser have to produce for a
   single sentence. It is a worked example, not corpus: the sentence is
   one of the three seeds, its source block is a placeholder, and it has
   not been through an adviser. Nothing here goes in the game.

   Read it as the answer to "what am I paying for, per sentence".

   ---------------------------------------------------------------------
   THE TWO LAYERS, AND WHY IT IS TWO

   The vocabulary layer holds MORPHOLOGY: what a word is, so a near-miss
   can be proposed. The sentence bank holds the VERIFIED DISTRACTOR SET:
   which near-misses are actually admissible in this slot of this
   sentence. Morphology alone cannot decide that, for two reasons that
   only show up in context —

     a form may not exist   flipping gender on "el error" gives "la error"
     a form may also be RIGHT   and then two of the four balls in the air
                                are correct, which breaks the promise that
                                a failed slot is always the player's error

   So every distractor carries the axis it was perturbed on AND the reason
   it is wrong HERE. The `blocked` list is the other half of that work:
   what was considered and rejected, so the next author does not re-propose
   it and so the adviser's reasoning survives them.
   ------------------------------------------------------------------- */

const ENTRY = {
  id: 'SENT-0001',

  /* Provenance. No invented sentences, so every entry has to say where it
     came from and be re-checkable. */
  source: {
    text:     'El bateador conectó un doble y tuvo dos carreras impulsadas.',
    origin:   'PLACEHOLDER — seed example, no real source',
    citation: null,
    retrieved: null,
    licence:  null
  },

  /* The adviser is a gate, not a review. Nothing ships unsigned. */
  adviser: { name: null, reviewed: null, verdict: null, notes:
    'The seed itself needs checking: "tuvo dos carreras impulsadas" reads ' +
    'as a calque of "had two RBIs" and a native sports register may prefer ' +
    '"impulsó dos carreras". Flagged rather than silently corrected.' },

  es: 'El bateador conectó un doble y tuvo dos carreras impulsadas.',
  en: 'The batter connected for a double and drove in two runs.',

  /* EVERY token, whether or not it is a slot. Two reasons: a token can
     become a slot at a different rung, and the agreement targets have to
     be resolvable even when they are not blanked themselves.

     Note the article is its own token. In the shipped VOCAB it is glued
     into the string ("el béisbol"), which makes agreement work impossible
     before it is split. */
  tokens: [
    { i: 0, form: 'El',         lemma: 'el',       pos: 'DET',
      morph: { gender: 'M', number: 'SG', definite: true } },
    { i: 1, form: 'bateador',   lemma: 'bateador', pos: 'NOUN',
      morph: { gender: 'M', number: 'SG' } },
    { i: 2, form: 'conectó',    lemma: 'conectar', pos: 'VERB',
      morph: { mood: 'IND', tense: 'PRET', person: 3, number: 'SG' } },
    { i: 3, form: 'un',         lemma: 'uno',      pos: 'DET',
      morph: { gender: 'M', number: 'SG', definite: false } },
    { i: 4, form: 'doble',      lemma: 'doble',    pos: 'NOUN',
      morph: { gender: 'M', number: 'SG' } },
    { i: 5, form: 'y',          lemma: 'y',        pos: 'CONJ', morph: {} },
    { i: 6, form: 'tuvo',       lemma: 'tener',    pos: 'VERB',
      morph: { mood: 'IND', tense: 'PRET', person: 3, number: 'SG' } },
    { i: 7, form: 'dos',        lemma: 'dos',      pos: 'NUM',
      morph: { number: 'PL' } },
    { i: 8, form: 'carreras',   lemma: 'carrera',  pos: 'NOUN',
      morph: { gender: 'F', number: 'PL' } },
    { i: 9, form: 'impulsadas', lemma: 'impulsar', pos: 'ADJ',
      morph: { gender: 'F', number: 'PL', nonfinite: 'PART' },
      agreesWith: 8, note: 'past participle used adjectivally' }
  ],

  /* Slots, left to right — the order they go live in. Five here, which is
     the Double-A rung. See THE RUNG PROBLEM at the foot of this file. */
  slots: [
    {
      token: 1, answer: 'bateador',
      teaches: 'noun gender and number, and the agreement with El',
      /* Lexical distractors are on this slot, so it carries a gloss — and
         the gloss is the English LEMMA, never the inflected form. "batter"
         settles WHICH word without settling its number; "batters" would
         hand over the morphology as well and turn the slot into a lookup. */
      gloss: 'batter',
      requires: [{ token: 0, why: 'gender and number come from the article' }],
      distractors: [
        { form: 'bateadores', axis: 'number',
          wrongHere: 'El is singular; "El bateadores" does not agree' },
        { form: 'bateadora',  axis: 'gender',
          wrongHere: 'El is masculine; the feminine takes La' },
        { form: 'bateo',      axis: 'lexical',
          wrongHere: 'same field, wrong word — the act, not the person' }
      ],
      blocked: [
        { form: 'batear', why: 'infinitive after a determiner is a different ' +
          'construction entirely, not a near-miss — the player rejects it on ' +
          'shape without reading it' }
      ]
    },
    {
      token: 2, answer: 'conectó',
      teaches: 'preterite, third person singular — the richest slot in the ' +
               'sentence, because a verb has three independent axes',
      /* No gloss. Every distractor here is separated by grammar, so an
         English hint would replace the retrieval with a lookup. */
      gloss: null,
      requires: [
        { token: 1, why: 'person and number come from the subject' },
        { token: 6, why: 'TENSE has no anchor unless another finite verb ' +
                         'in the sentence is given — blank every verb and ' +
                         'nothing says the narration is preterite' }
      ],
      distractors: [
        { form: 'conecta',    axis: 'tense',
          wrongHere: 'present; the narration is preterite throughout' },
        { form: 'conecté',    axis: 'person',
          wrongHere: 'first person; the subject is el bateador' },
        { form: 'conectaron', axis: 'number',
          wrongHere: 'third plural; the subject is singular' }
      ],
      blocked: [
        { form: 'conectado', why: 'participle — grammatical only with an ' +
          'auxiliary that is not in this sentence, so it tests a different ' +
          'thing than the slot is for' },
        { form: 'conectara', why: 'imperfect subjunctive is a real form and ' +
          'genuinely wrong here, but it is two steps of grammar away from ' +
          'the target and reads as noise at this level. Adviser call.' }
      ]
    },
    {
      token: 4, answer: 'doble',
      teaches: 'number on a noun, and the baseball vocabulary around it',
      gloss: 'double',
      requires: [{ token: 3, why: 'number comes from the determiner' }],
      distractors: [
        { form: 'dobles',   axis: 'number',
          wrongHere: 'un is singular' },
        { form: 'sencillo', axis: 'lexical',
          wrongHere: 'a single, not a double — same field, wrong fact' },
        { form: 'triple',   axis: 'lexical',
          wrongHere: 'a triple, not a double — same field, wrong fact' }
      ],
      blocked: [
        { form: 'doblar', why: 'verb; see the note on batear above' }
      ],
      /* THE NOUN PROBLEM, stated where it bites. A Spanish noun has ONE
         morphological axis the learner can be tested on — number — because
         its gender is inherent rather than inflected. So a noun slot yields
         exactly one true morphological near-miss, and the other two balls
         have to be lexical. Verbs yield three, participles two or three.
         This caps how much of a sentence can teach morphology, and it is
         a fact about Spanish, not about the design. */
      note: 'only one morphological axis available; two distractors are lexical'
    },
    {
      token: 8, answer: 'carreras',
      teaches: 'number agreement with the numeral dos',
      gloss: 'run',
      requires: [{ token: 7, why: 'number comes from the numeral' }],
      distractors: [
        { form: 'carrera',  axis: 'number',
          wrongHere: 'dos requires the plural' },
        { form: 'entradas', axis: 'lexical',
          wrongHere: 'innings, not runs' },
        { form: 'bases',    axis: 'lexical',
          wrongHere: 'bases, not runs' }
      ],
      blocked: [],
      note: 'only one morphological axis available; two distractors are lexical'
    },
    {
      token: 9, answer: 'impulsadas',
      teaches: 'participle agreeing with a feminine plural noun — the ' +
               'agreement is with token 8, which is itself a slot, so this ' +
               'slot is only solvable after that one is filled',
      gloss: null,
      requires: [{ token: 8, why: 'gender and number come from the noun' }],
      distractors: [
        { form: 'impulsados', axis: 'gender',
          wrongHere: 'carreras is feminine' },
        { form: 'impulsada',  axis: 'number',
          wrongHere: 'carreras is plural' },
        { form: 'impulsar',   axis: 'finiteness',
          wrongHere: 'infinitive cannot agree with anything' }
      ],
      blocked: [
        { form: 'impulsando', why: 'gerund; ungrammatical here but for a ' +
          'reason the player cannot see from the sentence alone' }
      ],
      /* Left-to-right filling earns its keep here. This slot's answer
         depends on a noun the player has already placed, so the sentence
         teaches agreement as a consequence rather than as a rule. Any
         slot ordering other than left-to-right would break that. */
      dependsOn: [8]
    }
  ],

  /* A free slot — the spec's "random unrelated noun" — is marked, not
     accidental, so the rate can be counted and held to a target. None in
     this entry. */
  freeSlots: [],

  /* The highest rung this sentence can serve, which is a PROPERTY OF THE
     SENTENCE rather than a free choice. See DETERMINABILITY below. */
  maxSlots: null          // computed by slotCeiling(), not authored
};

/* ---------------------------------------------------------------------
   DETERMINABILITY — the constraint that decides which rungs a sentence
   can serve.

   One bank for every rung means the same sentence is shown with more of
   it blanked as the rung rises. That works only while every slot is
   still ANSWERABLE from what the player can see: the tokens left given,
   plus the slots already filled to its left, plus whatever else is on
   screen. Blank past that point and the sentence stops determining its
   own answers, and a failed slot stops being the player's error — which
   is the one promise the design makes.

   Each slot names what it needs. A morphological distractor is settled
   by grammar: "conecta vs conectó" is decided by the tense of the rest
   of the narration, "impulsadas vs impulsados" by the gender of the noun
   to its left. A LEXICAL distractor is not: carreras, entradas and bases
   are all feminine plural nouns, so grammar cannot separate them and no
   amount of Spanish context will.
   ------------------------------------------------------------------- */

/* Tokens that are never blanked: function words carry nothing to learn
   and nothing to resolve them against. */
const NEVER_BLANK = ['CONJ', 'PREP'];

/* The slots this sentence COULD carry, beyond the five authored above.
   Under one-bank-all-rungs every content token is a potential slot, so
   each needs its requirement recorded even where nobody has written its
   distractors yet. */
const LATENT = {
  0: { gloss: null, requires: [{ token: 1,
       why: 'the article agrees with a noun to its RIGHT — blank the noun ' +
            'and nothing has filled it yet when the article goes live' }] },
  3: { gloss: null, requires: [{ token: 4,
       why: 'same shape as El/bateador: the determiner leans right' }] },
  6: { gloss: null, requires: [{ token: 2, why: 'tense anchor, see token 2' }] },
  7: { gloss: 'two', requires: [] }
};

function slotSpec(entry, i) {
  const authored = entry.slots.find(s => s.token === i);
  if (authored) return { gloss: authored.gloss, requires: authored.requires || [] };
  return LATENT[i] || { gloss: null, requires: [] };
}

/* A slot is answerable when everything it requires is resolvable AT THE
   MOMENT IT GOES LIVE. Blanks fill left to right, so a requirement is met
   if the token it names is given, or if it is blanked but sits to the
   LEFT and has therefore already been filled. A requirement pointing
   right at another blank is not met — nothing has put a word there yet.

   The earlier version of this function ignored direction entirely and
   only asked whether a slot's distractors were lexical. That made
   El/bateador and un/doble look independently blankable when they are
   not, and it inflated the ceiling.

   GLOSS POLICY: a slot carries an English lemma only where Spanish
   grammar genuinely cannot separate the four balls — which is exactly
   the slots with lexical distractors. Where morphology does the
   separating, a gloss would replace retrieval with translation, so
   there is none, and the slot is answerable on grammar alone. */
function answerable(entry, blanked, i) {
  const spec = slotSpec(entry, i);
  for (const r of spec.requires) {
    if (blanked.includes(r.token) && r.token > i) return false;
  }
  return true;
}

function validSet(entry, blanked) {
  return blanked.every(i => answerable(entry, blanked, i));
}

/* The largest set of tokens this sentence can carry as slots at once,
   by exhaustive search over the content tokens. This is the sentence's
   rung ceiling and it is a property of the sentence. */
function slotCeiling(entry) {
  const content = entry.tokens
    .filter(t => !NEVER_BLANK.includes(t.pos))
    .map(t => t.i);
  let best = [];
  for (let mask = 0; mask < (1 << content.length); mask++) {
    const set = content.filter((_, k) => mask & (1 << k));
    if (set.length <= best.length) continue;
    if (validSet(entry, set)) best = set;
  }
  return { content, max: best.length, example: best };
}

/* Why a token had to be left out of the maximum set — the exclusions,
   stated as pairs, so an author can see what to change. */
function exclusions(entry) {
  const content = entry.tokens
    .filter(t => !NEVER_BLANK.includes(t.pos)).map(t => t.i);
  const out = [];
  for (const i of content) {
    for (const r of slotSpec(entry, i).requires) {
      if (r.token > i && content.includes(r.token)) {
        out.push({ slot: i, blocks: r.token, why: r.why });
      }
    }
  }
  return out;
}

/* ---------------------------------------------------------------------
   WHAT THIS COSTS, COUNTED

   This entry, at the Double-A rung:

     10  token morphology records
      5  slot definitions
     20  balls (5 slots x 4 candidates), each with an axis and a reason
      4  blocked forms with reasons
      1  source block, 1 translation, 1 adviser signature

   So roughly 20 authored candidates and 40 authored items in total for
   ONE sentence at ONE rung — not the 4 a naive count suggests.

   ---------------------------------------------------------------------
   ONE BANK, ALL RUNGS: WHAT IT MEANS FOR THE DIFFICULTY LEVER

   The lever does not change, because it was never sentence length. The
   brief said "sentence length is the difficulty lever" and then measured
   it in SLOTS — three at Rookie up to six or seven at Major League. One
   sentence serving every rung means the same sentence shown with more of
   it blanked, and the lever is the slot count, exactly as specified.

   What changes is that the lever gets better for free. At Rookie three
   of ten tokens are blank and seven are given; at Major League seven are
   blank and three are given. Difficulty rises on two axes at once — more
   slots to fill AND less context to fill them from — where a bank of
   longer sentences would only have moved the first. Nobody designed that
   second axis; it falls out of the decision.

   It also means a sentence's ceiling is a property OF THE SENTENCE. A
   sentence cannot serve Major League unless seven of its tokens are
   independently blankable, which is a thing to test at authoring time
   and a reason to reject a sentence, not a thing to discover in play.

   ---------------------------------------------------------------------
   THE AUTHORING RULE. PUT THIS AT THE TOP OF THE BRIEF.

   ===================================================================
   A SLOT'S DISAMBIGUATING TOKEN CANNOT BE A LATER BLANK.
   ===================================================================

   Blanks fill strictly left to right, one live slot at a time. When a
   slot goes live, everything to its right that is also blanked is still
   empty. So if what decides a slot's answer sits to its RIGHT and is
   itself a blank, the player is being asked a question the screen has
   not finished asking.

   This is the rule authors will get wrong, because nothing about it is
   visible while writing a single slot. Each slot looks fine on its own.
   The defect only exists in the combination.

   In Spanish it bites in three predictable places:

     DETERMINERS LEAN RIGHT.  "El ___" cannot be answered until the noun
       is there — the article agrees with a word that comes after it. So
       El and bateador cannot both be blanks. Nor un and doble. This is
       the most common instance and it is the one that looks most
       harmless.

     PARTICIPLES AND ADJECTIVES LEAN LEFT, and are therefore SAFE. The
       participle in "carreras impulsadas" agrees with a noun already to
       its left, which the player has already placed. Blank both and it
       still works — the agreement is taught as a consequence of what
       they just did. This is the good case and it is worth authoring
       towards.

     FINITE VERBS ANCHOR EACH OTHER'S TENSE. "conectó ... y tuvo" tells
       the player the narration is preterite only while at least one of
       them is given. Blank every finite verb in a sentence and nothing
       on screen says which tense it is in. One verb must stay.

   ---------------------------------------------------------------------
   THE TWELVE-TOKEN RULE, WHICH FALLS OUT OF THE ABOVE

   The ceiling is: CONTENT TOKENS, MINUS ONE FOR EVERY RIGHT-LEANING
   PAIR. Function words never count as content.

   The worked entry: 9 content tokens, 3 right-leaning pairs
   (El/bateador, un/doble, the two verbs) = 6 slots. It serves Rookie
   through Triple-A and CANNOT serve Major League, whoever authors it.

   A sentence that must reach Major League's 7 slots therefore needs
   roughly TWELVE TOKENS — 7 slots plus the 2-3 tokens held back as
   agreement anchors plus the function words that are never blanked.
   Ten will usually not do it. Commission for twelve and up.

   A sentence is not wrong for topping out at Triple-A. It is wrong for
   being SOLD as a Major League sentence when it is not, which is why
   slotCeiling() runs in the validator and the ceiling is stored on the
   entry rather than assumed from its length.

   The subtraction above is a PLANNING HEURISTIC, not the definition.
   It matches slotCeiling() exactly on the worked entry, but overlapping
   pairs — one token anchoring two others, or a chain — need not behave
   additively, and no attempt has been made to prove they do.
   slotCeiling()'s exhaustive search is the authority and the validator
   is where the number comes from. Use the subtraction to brief an
   author and to sanity-check a draft; use the function to accept one.

   ---------------------------------------------------------------------
   THE RUNG PROBLEM, WHICH HAS TO BE DECIDED BEFORE ANYONE IS COMMISSIONED

   Sentence length is the difficulty lever: 3 slots at Rookie up to 7 at
   Major League. Two ways to get there, and they cost very differently:

     A. ONE SENTENCE SERVES EVERY RUNG. Blank 3 of its tokens at Rookie
        and 7 at Major League. Then every content token needs a full
        verified distractor set, because any of them might be the live
        slot. For this sentence that is 9 slots x 4 = 36 balls, and the
        bank is ~1.8x the work per sentence but serves all five rungs.

     B. A BANK PER RUNG. Short sentences for Rookie, long ones for Major
        League, each authored only for the slots it uses. Cheaper per
        sentence, but five banks to source, and a Rookie player never
        meets the sentences a Major League player does.

   A is the better buy and it is not close — 1.8x the authoring for 5x the
   reuse — but it changes the brief you hand an author, so it is a
   decision and not an implementation detail.

   ADOPTED: A.

/* ---------------------------------------------------------------------
   WHAT THIS COSTS, COUNTED

   This entry, at the Double-A rung:

     10  token morphology records
      5  slot definitions
     20  balls (5 slots x 4 candidates), each with an axis and a reason
      4  blocked forms with reasons
      1  source block, 1 translation, 1 adviser signature

   So roughly 20 authored candidates and 40 authored items in total for
   ONE sentence at ONE rung — not the 4 a naive count suggests.

   ---------------------------------------------------------------------
   THE AUTHORING RULE. PUT THIS AT THE TOP OF THE BRIEF.

   ===================================================================
   A SLOT'S DISAMBIGUATING TOKEN CANNOT BE A LATER BLANK.
   ===================================================================

   Blanks fill strictly left to right, one live slot at a time. When a
   slot goes live, everything to its right that is also blanked is still
   empty. So if what decides a slot's answer sits to its RIGHT and is
   itself a blank, the player is being asked a question the screen has
   not finished asking.

   This is the rule authors will get wrong, because nothing about it is
   visible while writing a single slot. Each slot looks fine on its own.
   The defect only exists in the combination.

   In Spanish it bites in three predictable places:

     DETERMINERS LEAN RIGHT.  "El ___" cannot be answered until the noun
       is there — the article agrees with a word that comes after it. So
       El and bateador cannot both be blanks. Nor un and doble. This is
       the most common instance and it is the one that looks most
       harmless.

     PARTICIPLES AND ADJECTIVES LEAN LEFT, and are therefore SAFE. The
       participle in "carreras impulsadas" agrees with a noun already to
       its left, which the player has already placed. Blank both and it
       still works — the agreement is taught as a consequence of what
       they just did. This is the good case and it is worth authoring
       towards.

     FINITE VERBS ANCHOR EACH OTHER'S TENSE. "conectó ... y tuvo" tells
       the player the narration is preterite only while at least one of
       them is given. Blank every finite verb in a sentence and nothing
       on screen says which tense it is in. One verb must stay.

   ---------------------------------------------------------------------
   THE TWELVE-TOKEN RULE, WHICH FALLS OUT OF THE ABOVE

   The ceiling is: CONTENT TOKENS, MINUS ONE FOR EVERY RIGHT-LEANING
   PAIR. Function words never count as content.

   The worked entry: 9 content tokens, 3 right-leaning pairs
   (El/bateador, un/doble, the two verbs) = 6 slots. It serves Rookie
   through Triple-A and CANNOT serve Major League, whoever authors it.

   A sentence that must reach Major League's 7 slots therefore needs
   roughly TWELVE TOKENS — 7 slots plus the 2-3 tokens held back as
   agreement anchors plus the function words that are never blanked.
   Ten will usually not do it. Commission for twelve and up.

   A sentence is not wrong for topping out at Triple-A. It is wrong for
   being SOLD as a Major League sentence when it is not, which is why
   slotCeiling() runs in the validator and the ceiling is stored on the
   entry rather than assumed from its length.

   The subtraction above is a PLANNING HEURISTIC, not the definition.
   It matches slotCeiling() exactly on the worked entry, but overlapping
   pairs — one token anchoring two others, or a chain — need not behave
   additively, and no attempt has been made to prove they do.
   slotCeiling()'s exhaustive search is the authority and the validator
   is where the number comes from. Use the subtraction to brief an
   author and to sanity-check a draft; use the function to accept one.

   ---------------------------------------------------------------------
   THE RUNG PROBLEM, WHICH HAS TO BE DECIDED BEFORE ANYONE IS COMMISSIONED

   Sentence length is the difficulty lever: 3 slots at Rookie up to 7 at
   Major League. Two ways to get there, and they cost very differently:

     A. ONE SENTENCE SERVES EVERY RUNG. Blank 3 of its tokens at Rookie
        and 7 at Major League. Then every content token needs a full
        verified distractor set, because any of them might be the live
        slot. For this sentence that is 9 slots x 4 = 36 balls, and the
        bank is ~1.8x the work per sentence but serves all five rungs.

     B. A BANK PER RUNG. Short sentences for Rookie, long ones for Major
        League, each authored only for the slots it uses. Cheaper per
        sentence, but five banks to source, and a Rookie player never
        meets the sentences a Major League player does.

   A is the better buy and it is not close — 1.8x the authoring for 5x the
   reuse — but it changes the brief you hand an author, so it is a
   decision and not an implementation detail.

   ---------------------------------------------------------------------
   WHAT THE AUTHOR CANNOT DO AND THE ADVISER MUST

   Proposing a near-miss is mechanical once the morphology is there.
   Deciding whether it is admissible is not, and it is the entire risk:

     · is the form real Spanish
     · is it wrong in THIS slot
     · is it wrong for a reason the player can see from the sentence
     · is it wrong at a level of grammar this rung has met

   The third and fourth are the ones a non-native author will miss, and a
   miss on the second is the one that ships two correct balls and silently
   marks a player wrong for a right answer.
   ------------------------------------------------------------------- */

module.exports = { ENTRY, slotCeiling, exclusions, validSet, answerable,
                   slotSpec, NEVER_BLANK, LATENT };
