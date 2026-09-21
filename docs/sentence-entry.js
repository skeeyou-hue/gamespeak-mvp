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

/* THE DATA LIVES IN outfield-bank.js, NOT HERE.

   This file is the commissioning brief: the schema, the reasoning, and
   the rules an author has to work to. It used to carry its own copy of
   the worked entry, which made two copies of the same sentence that
   nothing kept in sync — the defect this codebase already names for
   constants, in a file whose whole subject is not restating things.

   The worked example below is the bank's first entry, read from it. */
const { ENTRIES } = require('../outfield-bank.js');
const ENTRY = ENTRIES[0];

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
/* The determinability helpers are the RULES layer, not documentation —
   the game runs on them, so they cannot live in docs/. Re-exported here
   so this file still answers slotCeiling(ENTRY) for anyone reading the
   brief. */
const { NEVER_BLANK, slotSpec, answerable, validSet, slotCeiling,
        exclusions } = (() => {
  const R = require('../outfield-rules.js');
  return { ...R, slotSpec: (entry, i) => ({
    gloss: (entry.slots.find(s => s.token === i) || {}).gloss || null,
    requires: (entry.tokens[i] || {}).requires || []
  }) };
})();
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
                   slotSpec, NEVER_BLANK };
