/* OUTFIELDER — one half-inning, slot by slot, as a player meets it.

   Not a summary and not a distribution. This runs the real rule layer
   over the real authored entry and prints what was in the air, what was
   caught, what it cost and where the runners ended up.

   What is real here: the timing draw and the rushing model from
   outfield.js, the pace median and its warm-up, hitForPace, the grace
   and the reveal, and advanceOnHit from the shipped rules. Math.random
   is replaced by a seeded generator for the length of the run so a
   transcript can be re-read, and put back afterwards.

   What is NOT here: any sentence or candidate word that is not in
   docs/sentence-entry.js. Where a rung needs a slot nobody has authored,
   this says so and stops rather than filling the gap.

   Run with `node outfield-playthrough.js [rung] [seed]`.
   ------------------------------------------------------------------- */

const O = require('./outfield.js');
const T = require('./timed.js');
const E = require('./docs/sentence-entry.js');
const { LEVELS, advanceOnHit, HIT_ADVANCE } = T;
const { FIELDERS, SLOTS_BY_LEVEL, FLIGHT_MS, SETTLE_MS, HIT_BEAT_MS,
        REVEAL_MS, GRACE, OUTS_PER_HALF, PACE_MIN, PACE_WINDOW,
        WARMUP, makePace, hitForPace, fieldSlot } = O;
const { ENTRY, slotCeiling, validSet, slotSpec } = E;

/* Seeded generator, installed over Math.random for the run. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* WHICH SLOTS A RUNG BLANKS.

   An authoring decision, not a mechanic — but the gloss rule makes the
   default obvious. Slots whose distractors are lexical carry an English
   lemma, so grammar does less of the work and they are the easier ones;
   slots separated purely by morphology carry no gloss and are harder.
   Ordering by morphological density therefore builds the ladder for
   free: low rungs get the glossed noun slots, and each rung up adds a
   bare morphological one. */
function morphDensity(slot) {
  return slot.distractors.filter(d => d.axis !== 'lexical').length;
}

function slotsForRung(entry, n) {
  const authored = [...entry.slots].sort((a, b) =>
    morphDensity(a) - morphDensity(b) || a.token - b.token);
  const picked = authored.slice(0, n).map(s => s.token).sort((a, b) => a - b);
  const ceiling = slotCeiling(entry);
  if (n > ceiling.max) {
    return { ok: false, why:
      `this sentence carries at most ${ceiling.max} simultaneous slots ` +
      `(see the exclusions in docs/sentence-entry.js); the rung needs ${n}` };
  }
  if (picked.length < n) {
    return { ok: false, why:
      `only ${authored.length} slots are authored on this sentence and the ` +
      `rung needs ${n}. The tokens that could carry the rest — ` +
      entry.tokens.filter(t => !entry.slots.some(s => s.token === t.i) &&
                               !['CONJ', 'PREP'].includes(t.pos))
                  .map(t => t.form).join(', ') +
      ` — have no distractors written, and inventing them here would be ` +
      `exactly the thing the corpus rule forbids` };
  }
  if (!validSet(entry, picked)) {
    return { ok: false, why: `the ${n} lowest-density slots are not a valid ` +
      `set — one of them needs a token to its right that is also blanked` };
  }
  return { ok: true, tokens: picked };
}

/* Rendering the line as the player sees it. */
function render(entry, blanked, filled, live) {
  return entry.tokens.map(t => {
    if (!blanked.includes(t.i)) return t.form;
    if (filled[t.i]) return `[${filled[t.i]}]`;
    return t.i === live ? '[>______<]' : '[______]';
  }).join(' ') + '.';
}

const basesStr = b => {
  const on = ['1st', '2nd', '3rd'].filter((_, i) => b[i]);
  return on.length ? on.join(' + ') : 'empty';
};

function playHalfInning(entry, rungIndex, player, seed) {
  const slots = SLOTS_BY_LEVEL[rungIndex];
  const pick = slotsForRung(entry, slots);
  const name = LEVELS[rungIndex].name;

  console.log('='.repeat(74));
  console.log(`${name.toUpperCase()}  ·  ${slots} slots  ·  fielder: ${player.name}`);
  console.log('='.repeat(74));

  if (!pick.ok) {
    console.log(`\n  CANNOT BE PLAYED FROM THE BANK IN HAND.`);
    console.log(`  ${pick.why}.\n`);
    return null;
  }

  const blanked = pick.tokens;
  console.log(`\n  ${entry.es}`);
  console.log(`  blanked: ${blanked.map(i => entry.tokens[i].form).join(', ')}`);
  console.log(`  glossed: ${blanked.filter(i => slotSpec(entry, i).gloss)
    .map(i => `${entry.tokens[i].form} ("${slotSpec(entry, i).gloss}")`).join(', ') || 'none'}`);

  const pace = makePace(PACE_WINDOW);
  let bases = [false, false, false], runs = 0, outs = 0, ms = 0;
  const random = Math.random;

  while (outs < OUTS_PER_HALF) {
    const filled = {};
    console.log(`\n  ${'-'.repeat(70)}`);
    console.log(`  SENTENCE ${outs + 1} of ${OUTS_PER_HALF}   ·   ` +
                `outs ${outs}  ·  runners ${basesStr(bases)}  ·  runs ${runs}`);
    if (outs > 0) console.log(`  (the same sentence again — there is one authored entry, ` +
                              `not a bank. In play these are three different sentences.)`);

    for (const tok of blanked) {
      const slot = entry.slots.find(s => s.token === tok);
      const spec = slotSpec(entry, tok);
      let missed = 0, resolved = false;

      console.log(`\n    ${render(entry, blanked, filled, tok)}`);
      if (spec.gloss) console.log(`    gloss for this slot: "${spec.gloss}"`);
      else            console.log(`    no gloss — grammar separates these four`);

      while (!resolved) {
        const balls = [slot.answer, ...slot.distractors.map(d => d.form)];
        // shuffle so the answer is not always first in the air
        for (let i = balls.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [balls[i], balls[j]] = [balls[j], balls[i]];
        }
        const r = fieldSlot(player, FLIGHT_MS);
        ms += r.ms + SETTLE_MS;
        const drops = Math.floor(r.ms / FLIGHT_MS);

        const caught = r.right ? slot.answer
          : slot.distractors[Math.floor(Math.random() * slot.distractors.length)].form;
        const norm = pace.n() >= PACE_MIN ? pace.median() : null;
        pace.push(r.at);

        console.log(`      in the air:  ${balls.join('   ')}`);
        if (drops) console.log(`      ${drops} volley dropped — they come round again`);
        console.log(`      caught "${caught}" at ${Math.round(r.at)}ms` +
          (norm ? ` (${(r.at / norm).toFixed(2)}x their own pace of ${Math.round(norm)}ms)`
                : `  [pace still cold: ${pace.n()}/${PACE_MIN} catches]`));

        if (r.right) {
          filled[tok] = slot.answer;
          console.log(`      -> CAUGHT IT. strike sting. slot fills.`);
          resolved = true;
          break;
        }

        const why = slot.distractors.find(d => d.form === caught);
        console.log(`      -> wrong: ${why.axis} — ${why.wrongHere}`);

        if (missed++ < GRACE) {
          ms += HIT_BEAT_MS;
          console.log(`      -> foul. grace ${missed}/${GRACE}. slot stays live.`);
          continue;
        }

        const verdict = norm === null ? 'SINGLE' : hitForPace(r.at, norm);
        const play = advanceOnHit(bases, HIT_ADVANCE[verdict]);
        const scored = play.runs;
        bases = play.bases; runs += scored;
        ms += HIT_BEAT_MS + REVEAL_MS;
        filled[tok] = slot.answer;
        console.log(`      -> grace gone. ${verdict}` +
          (norm === null ? '  (cold — mildest verdict, not a judgement)' : '') +
          `. ${scored ? scored + ' run' + (scored > 1 ? 's' : '') + ' in. ' : ''}` +
          `runners ${basesStr(bases)}.`);
        console.log(`      -> REVEAL: the word was "${slot.answer}". slot resolves.`);
        resolved = true;
      }
    }
    outs++;
    console.log(`\n    ${render(entry, blanked, filled, -1)}`);
    console.log(`    SENTENCE COMPLETE — that is out ${outs}.`);
  }

  console.log(`\n  ${'-'.repeat(70)}`);
  console.log(`  HALF-INNING OVER.  ${runs} run${runs === 1 ? '' : 's'} in, ` +
    `${bases.filter(Boolean).length} left on, ${(ms / 60000).toFixed(1)} minutes.`);
  Math.random = random;
  return { runs, ms };
}

if (require.main === module) {
  const only = process.argv[2];
  const seed = Number(process.argv[3] || 20260920);
  const real = Math.random;
  Math.random = seeded(seed);

  console.log(`OUTFIELDER — a half-inning at each rung, seed ${seed}`);
  console.log(`grace ${GRACE} · reveal on exhaust · pace band, ${WARMUP} while cold\n`);

  LEVELS.forEach((lv, i) => {
    if (only && !lv.name.toLowerCase().startsWith(only.toLowerCase())) return;
    playHalfInning(ENTRY, i, FIELDERS[i], seed + i);
    console.log();
  });

  Math.random = real;
}
