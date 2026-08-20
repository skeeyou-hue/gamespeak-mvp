/* =========================================================================
   GameSpeak browser tests

   Run with:   node test.js
   Requires Playwright (the game itself has no dependencies):
               npm install -D playwright && npx playwright install chromium

   The tests drive the real page in a real browser. Base-running rules are
   also checked directly against advanceOnWalk / advanceOnHit, which are
   pure functions, so each rule can be pinned down one case at a time.
   ========================================================================= */

const { chromium } = require('playwright');
const path = require('path');

const URL = 'file://' + path.join(__dirname, 'index.html');

let passed = 0, failed = 0;
const assert = (cond, msg) => {
  if (cond) { passed++; console.log('ok   - ' + msg); }
  else      { failed++; console.error('FAIL - ' + msg); }
};
const section = title => console.log('\n# ' + title);

// Base helpers: b(1,3) means runners on first and third.
const b = (...bases) => [1, 2, 3].map(n => bases.includes(n));
const show = state => state.map((on, i) => on ? ['1B', '2B', '3B'][i] : null)
                           .filter(Boolean).join('+') || 'empty';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(URL);
  await page.waitForSelector('.choice');

  // Answer the current question; pass false to deliberately answer wrong.
  async function answer(correct = true) {
    const es = await page.evaluate(() => document.getElementById('word').textContent);
    const en = await page.evaluate(w => VOCAB.find(v => v.es === w).en, es);
    const buttons = page.locator('.choice');
    const n = await buttons.count();
    for (let i = 0; i < n; i++) {
      const t = (await buttons.nth(i).textContent()).trim();
      if (correct ? t === en : t !== en) { await buttons.nth(i).click(); break; }
    }
    await page.waitForTimeout(1550);   // the game pauses 1400ms on feedback
  }

  // Start an inning with a chosen sequence of tags, so plays are predictable.
  async function stackDeck(tags) {
    await page.evaluate(list => {
      startInning();
      state.deck = list.map(tag => VOCAB.find(v => v.tag === tag));
      state.index = 0;
      renderQuestion();
    }, tags);
  }

  /* ===================================================================
     A. STRUCTURE AND VOCABULARY
     =================================================================== */
  section('Structure and vocabulary');

  const vocabCount = await page.evaluate(() => VOCAB.length);
  const tally = await page.evaluate(() =>
    VOCAB.reduce((a, w) => { a[w.tag] = (a[w.tag] || 0) + 1; return a; }, {}));

  assert((await page.locator('.choice').count()) === 4, 'four answer choices rendered');
  assert((await page.locator('#word').textContent()).trim().length > 0, 'a Spanish word is shown');
  const tag = (await page.locator('#word-tag').textContent()).trim();
  assert(['WALK', 'SINGLE', 'DOUBLE', 'TRIPLE', 'HOME RUN'].includes(tag),
         'difficulty tag is a known tier, got ' + tag);
  assert(vocabCount >= 20, `vocabulary list has ${vocabCount} words`);
  console.log('     tag mix:', JSON.stringify(tally));
  assert(['WALK', 'SINGLE', 'DOUBLE', 'TRIPLE', 'HOMERUN'].every(t => tally[t] > 0),
         'all five difficulty tiers present');
  assert(new Set(await page.evaluate(() => VOCAB.map(w => w.en))).size === vocabCount,
         'every English meaning is unique, so choices can never duplicate');

  section('HUD');

  assert((await page.locator('.tally').count()) === 0,
         'the per-hit-type tally row is gone from the HUD');
  assert((await page.locator('.scoreboard').count()) === 0,
         'the full-width scoreboard bar is gone');
  assert((await page.locator('#score-runs').count()) === 1 &&
         (await page.locator('#outs-display').count()) === 1,
         'runs and outs still on screen');
  assert((await page.locator('#diamond .pip').count()) === 3,
         'diamond draws three bases');
  assert((await page.locator('#diamond .home-plate').count()) === 1,
         'diamond draws home plate too');
  // The four marks must not overlap each other, which is what broke the
  // old CSS version.
  const marks = await page.evaluate(() =>
    ['pip-third', 'pip-second', 'pip-first'].map(id => {
      const r = document.getElementById(id).getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }).concat([(() => {
      const r = document.querySelector('.home-plate').getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    })()]));
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w &&
                             a.y < b.y + b.h && b.y < a.y + a.h;
  let collisions = 0;
  for (let i = 0; i < marks.length; i++)
    for (let j = i + 1; j < marks.length; j++)
      if (overlaps(marks[i], marks[j])) collisions++;
  assert(collisions === 0, 'all four diamond marks are visually separate');

  section('Structure and vocabulary, continued');

  const shown = await page.evaluate(() => document.getElementById('word').textContent);
  const choices = await page.locator('.choice').allTextContents();
  const correct = await page.evaluate(w => VOCAB.find(v => v.es === w).en, shown);
  assert(new Set(choices).size === 4, 'no duplicate answer choices');
  assert(choices.includes(correct), 'the correct answer is among the choices');

  /* ===================================================================
     B. BASE-RUNNING RULES (pure functions, one case at a time)
     =================================================================== */
  section('Walks — only forced runners advance');

  const walkCases = [
    [b(),        b(1),       0, 'empty  -> batter to first'],
    [b(1),       b(1, 2),    0, '1B     -> runner forced to second'],
    [b(2),       b(1, 2),    0, '2B     -> runner on second is NOT forced, stays put'],
    [b(3),       b(1, 3),    0, '3B     -> runner on third is NOT forced, stays put'],
    [b(1, 2),    b(1, 2, 3), 0, '1B+2B  -> both forced up'],
    [b(1, 3),    b(1, 2, 3), 0, '1B+3B  -> first forced to second, third stays'],
    [b(2, 3),    b(1, 2, 3), 0, '2B+3B  -> neither forced, batter fills first'],
    [b(1, 2, 3), b(1, 2, 3), 1, 'loaded -> forced run scores']
  ];

  for (const [before, after, runs, label] of walkCases) {
    const got = await page.evaluate(x => advanceOnWalk(x), before);
    assert(JSON.stringify(got) === JSON.stringify({ bases: after, runs }),
           `walk: ${label}  [got ${show(got.bases)}, ${got.runs}r]`);
  }

  section('Hits — every runner advances as far as the batter');

  const hitCases = [
    // single: one base for everybody
    [1, b(),        b(1),       0, 'single, empty'],
    [1, b(1),       b(1, 2),    0, 'single, 1B -> 2B'],
    [1, b(2),       b(1, 3),    0, 'single, 2B -> 3B (does NOT score)'],
    [1, b(3),       b(1),       1, 'single, 3B scores'],
    [1, b(1, 2),    b(1, 2, 3), 0, 'single, 1B+2B both up one'],
    [1, b(2, 3),    b(1, 3),    1, 'single, 3B scores and 2B takes third'],
    [1, b(1, 2, 3), b(1, 2, 3), 1, 'single, loaded scores one and stays loaded'],
    // double: two bases
    [2, b(),        b(2),       0, 'double, empty'],
    [2, b(1),       b(2, 3),    0, 'double, 1B -> 3B (does NOT score)'],
    [2, b(2),       b(2),       1, 'double, 2B scores'],
    [2, b(3),       b(2),       1, 'double, 3B scores'],
    [2, b(1, 2, 3), b(2, 3),    2, 'double, loaded scores two'],
    // triple: three bases
    [3, b(),        b(3),       0, 'triple, empty'],
    [3, b(1),       b(3),       1, 'triple, 1B scores'],
    [3, b(1, 2, 3), b(3),       3, 'triple, loaded clears and scores three'],
    // home run: everybody, batter included
    [4, b(),        b(),        1, 'home run, empty -> solo shot'],
    [4, b(1),       b(),        2, 'home run, 1B -> two runs'],
    [4, b(1, 2, 3), b(),        4, 'home run, loaded -> grand slam, four runs']
  ];

  for (const [advance, before, after, runs, label] of hitCases) {
    const got = await page.evaluate(([x, n]) => advanceOnHit(x, n), [before, advance]);
    assert(JSON.stringify(got) === JSON.stringify({ bases: after, runs }),
           `${label}  [got ${show(got.bases)}, ${got.runs}r]`);
  }

  section('Base running through the real UI');

  // Triple, then a single: the runner on third should score.
  await stackDeck(['TRIPLE', 'SINGLE']);
  await answer();
  assert(JSON.stringify(await page.evaluate(() => state.bases)) === JSON.stringify(b(3)),
         'after a triple the batter stands on third');
  assert((await page.locator('#score-runs').textContent()) === '0', 'no run yet on the triple');
  assert(await page.locator('#pip-third').evaluate(e => e.classList.contains('on')),
         'scoreboard diamond lights up third base');
  assert(await page.locator('#runner-third').evaluate(e => e.classList.contains('on')),
         'a runner appears on third out on the field');
  assert(!(await page.locator('#runner-first').evaluate(e => e.classList.contains('on'))),
         'first base stays empty on the field');

  await answer();
  assert((await page.locator('#score-runs').textContent()) === '1',
         'the single drives the runner home: 1 run on the scoreboard');
  assert(JSON.stringify(await page.evaluate(() => state.bases)) === JSON.stringify(b(1)),
         'the batter is left on first');

  // A grand slam: load them up with three walks, then a home run.
  await stackDeck(['WALK', 'WALK', 'WALK', 'HOMERUN']);
  await answer(); await answer(); await answer();
  assert(JSON.stringify(await page.evaluate(() => state.bases)) === JSON.stringify(b(1, 2, 3)),
         'three walks load the bases');
  assert((await page.locator('#score-runs').textContent()) === '0',
         'loading the bases scores nobody');
  await answer();
  assert((await page.locator('#score-runs').textContent()) === '4', 'grand slam scores four');
  assert(JSON.stringify(await page.evaluate(() => state.bases)) === JSON.stringify(b()),
         'the home run clears the bases');
  assert(!(await page.locator('.pip.on').count()), 'diamond goes dark after the bases clear');

  // A wrong answer must not move anybody.
  await stackDeck(['DOUBLE', 'SINGLE']);
  await answer();
  const beforeOut = await page.evaluate(() => state.bases);
  await answer(false);
  assert(JSON.stringify(await page.evaluate(() => state.bases)) === JSON.stringify(beforeOut),
         'an out leaves the runners exactly where they were');
  assert((await page.locator('.out-dot.filled').count()) === 1, 'one out shown after first miss');

  /* ===================================================================
     C. OUTS, THE BOX SCORE, AND STARTING OVER
     =================================================================== */
  section('Outs, box score, and reset');

  // Two runners stranded, then three outs.
  await stackDeck(['WALK', 'WALK', 'DOUBLE', 'DOUBLE', 'DOUBLE']);
  await answer(); await answer();               // runners on first and second
  await answer(false); await answer(false); await answer(false);

  assert(await page.locator('#summary-screen').isVisible(), 'summary screen appears after 3 outs');
  assert(!(await page.locator('#quiz-screen').isVisible()), 'quiz screen hidden on summary');
  assert((await page.locator('#summary-title').textContent()).includes('Inning over'),
         'summary title says inning over');
  assert((await page.locator('#missed-list li').count()) === 3, 'three missed words listed');
  assert((await page.locator('#sum-walk').textContent()) === '2', 'box score counts the two walks');
  assert((await page.locator('#sum-lob').textContent()) === '2',
         'box score reports two runners left on base');
  assert((await page.locator('#sum-runs').textContent()) === '0', 'no runs scored in that inning');

  // A clean 0-for-3 inning, for the averages.
  await stackDeck(['SINGLE', 'SINGLE', 'SINGLE']);
  await answer(false); await answer(false); await answer(false);
  assert((await page.locator('#sum-avg').textContent()) === '.000',
         'batting average .000 after 0-for-3');
  assert((await page.locator('#sum-hits').textContent()) === '0', 'zero hits recorded');
  assert((await page.locator('#sum-lob').textContent()) === '0', 'nobody left on base');

  await page.click('#play-again');
  assert(await page.locator('#quiz-screen').isVisible(), 'play again returns to the quiz');
  assert((await page.locator('.out-dot.filled').count()) === 0, 'outs reset to zero');
  assert(JSON.stringify(await page.evaluate(() => state.hits)) ===
         JSON.stringify({ WALK: 0, SINGLE: 0, DOUBLE: 0, TRIPLE: 0, HOMERUN: 0 }),
         'hit tally reset');
  assert((await page.locator('#score-runs').textContent()) === '0', 'runs reset to zero');
  assert((await page.locator('.pip.on').count()) === 0, 'bases start empty');
  assert(!(await page.locator('.runner.on').count()), 'no runners on the field at first pitch');

  /* ===================================================================
     D. A PERFECT INNING, ALL THE WAY THROUGH
     =================================================================== */
  section('A perfect inning');

  const expected = { WALK: 0, SINGLE: 0, DOUBLE: 0, TRIPLE: 0, HOMERUN: 0 };
  for (let i = 0; i < vocabCount; i++) {
    const es = await page.evaluate(() => document.getElementById('word').textContent);
    expected[await page.evaluate(w => VOCAB.find(v => v.es === w).tag, es)]++;
    await answer();
  }

  const basesPerTier = await page.evaluate(() =>
    Object.fromEntries(Object.entries(DIFFICULTY).map(([k, v]) => [k, v.bases])));
  const totalBases = Object.entries(expected)
    .reduce((sum, [tier, n]) => sum + n * basesPerTier[tier], 0);

  assert(await page.locator('#summary-screen').isVisible(), 'inning ends after all the words');
  assert((await page.locator('#summary-title').textContent()).includes('lineup'),
         'batted through the lineup message');
  assert((await page.locator('#sum-hits').textContent()) === String(vocabCount),
         `${vocabCount} hits recorded`);
  assert((await page.locator('#sum-bases').textContent()) === String(totalBases),
         `total bases = ${totalBases}, weighted by tier`);
  assert((await page.locator('#sum-avg').textContent()) === '1.000',
         'batting average 1.000 on a perfect inning');
  assert(Number(await page.locator('#sum-runs').textContent()) > 0,
         'a perfect inning drives in runs');
  assert(await page.locator('#missed-block').isHidden(),
         'missed-words block hidden when nothing was missed');

  assert(errors.length === 0, 'no console/page errors (' + errors.join('; ') + ')');

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
