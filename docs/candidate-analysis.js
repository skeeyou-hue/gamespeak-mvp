/* CANDIDATE ANALYSIS — no distractors authored, no bank change.
   Tokens and their agreement requirements only, run through the real
   slotCeiling / exclusions / validSet from outfield-rules.js. */
const R = require('../outfield-rules.js');

const C1 = {
  id: 'CAND-1', es: 'La bateadora golpeó la pelota con tanta fuerza que se salió del campo.',
  tokens: [
    { i:0,  form:'La',        lemma:'el',      pos:'DET',  morph:{gender:'F',number:'SG',definite:true},
      requires:[{token:1, why:'article agrees with a noun to its RIGHT'}] },
    { i:1,  form:'bateadora', lemma:'bateador',pos:'NOUN', morph:{gender:'F',number:'SG'},
      requires:[{token:0, why:'gender and number come from the article'}] },
    { i:2,  form:'golpeó',    lemma:'golpear', pos:'VERB', morph:{mood:'IND',tense:'PRET',person:3,number:'SG'},
      requires:[{token:1, why:'person and number from the named subject'},
                {token:10,why:'TENSE anchor — the other finite verb'}] },
    { i:3,  form:'la',        lemma:'el',      pos:'DET',  morph:{gender:'F',number:'SG',definite:true},
      requires:[{token:4, why:'article agrees with a noun to its RIGHT'}] },
    { i:4,  form:'pelota',    lemma:'pelota',  pos:'NOUN', morph:{gender:'F',number:'SG'},
      requires:[{token:3, why:'gender and number from the article'}] },
    { i:5,  form:'con',       lemma:'con',     pos:'PREP', morph:{} },
    { i:6,  form:'tanta',     lemma:'tanto',   pos:'DET',  morph:{gender:'F',number:'SG'},
      requires:[{token:7, why:'quantifier agrees with a noun to its RIGHT'}] },
    { i:7,  form:'fuerza',    lemma:'fuerza',  pos:'NOUN', morph:{gender:'F',number:'SG'},
      requires:[{token:6, why:'gender and number from the quantifier'}] },
    { i:8,  form:'que',       lemma:'que',     pos:'CONJ', morph:{} },
    { i:9,  form:'se',        lemma:'se',      pos:'PRON', morph:{person:3,number:'SG'},
      requires:[{token:4, why:'the clitic matches the subject of its verb, la pelota'}] },
    { i:10, form:'salió',     lemma:'salir',   pos:'VERB', morph:{mood:'IND',tense:'PRET',person:3,number:'SG'},
      requires:[{token:4, why:'person and number from its subject, la pelota'},
                {token:2, why:'TENSE anchor — the other finite verb'}] },
    /* del is de+el. A contraction cannot be blanked as one thing without
       asking two questions at once, so it is treated as a preposition and
       never blanked. */
    { i:11, form:'del',       lemma:'de',      pos:'PREP', morph:{} },
    { i:12, form:'campo',     lemma:'campo',   pos:'NOUN', morph:{gender:'M',number:'SG'} }
  ]
};

const C2 = {
  id: 'CAND-2', es: 'El bateador terminó 1-de-4.',
  tokens: [
    { i:0, form:'El',        lemma:'el',      pos:'DET',  morph:{gender:'M',number:'SG',definite:true},
      requires:[{token:1, why:'article agrees with a noun to its RIGHT'}] },
    { i:1, form:'bateador',  lemma:'bateador',pos:'NOUN', morph:{gender:'M',number:'SG'},
      requires:[{token:0, why:'gender and number come from the article'}] },
    { i:2, form:'terminó',   lemma:'terminar',pos:'VERB', morph:{mood:'IND',tense:'PRET',person:3,number:'SG'},
      requires:[{token:1, why:'person and number from the named subject'}],
      blankable:false,
      why:'the only finite verb in the sentence — blank it and nothing on ' +
          'screen says the tense. "El bateador ___ 1-de-4" is equally ' +
          'termina, terminó and terminará.' },
    { i:3, form:'1-de-4',    lemma:'1-de-4',  pos:'NUM',  morph:{},
      blankable:false,
      why:'a scoreline is a fact, not a form. 2-de-4 and 1-de-3 are equally ' +
          'grammatical and nothing on screen decides; a gloss would BE the answer.' }
  ]
};

for (const c of [C1, C2]) {
  console.log('\n' + '='.repeat(72));
  console.log(c.id + '  ' + c.es);
  console.log('='.repeat(72));
  const ceil = R.slotCeiling(c);
  const exc  = R.exclusions(c);
  console.log('  tokens ' + c.tokens.length + '  |  content tokens ' + ceil.content.length +
              ' (' + ceil.content.map(i => c.tokens[i].form).join(' ') + ')');
  const un = R.unblankable(c);
  console.log('  cannot be a slot at all:');
  for (const u of un) console.log('    [' + u.form + '] ' + u.why);
  console.log('  right-leaning pairs — a slot whose decider is a LATER blank:');
  if (!exc.length) console.log('    none');
  for (const x of exc) console.log('    [' + c.tokens[x.slot].form + '] needs [' +
    (c.tokens[x.blocks] ? c.tokens[x.blocks].form : '#' + x.blocks) + '] given — ' + x.why);
  console.log('  heuristic  content - pairs = ' + (ceil.content.length - exc.length));
  console.log('  slotCeiling (exhaustive, the authority) = ' + ceil.max);
  console.log('  one maximal set: ' + ceil.example.map(i => c.tokens[i].form).join(', '));
  const RUNGS = R.LEVELS.map((lv,i)=>[lv.name, R.SLOTS_BY_LEVEL[i]]);
  console.log('  rungs it could carry if every slot were authored:');
  console.log('    ' + RUNGS.map(([n,k]) => n + ' ' + k + ': ' + (k <= ceil.max ? 'yes' : 'NO')).join('  |  '));
}
