/* =========================================================================
   Tiered Timed Pitch — countdown UI tests

   Run with:  node timed-ui-test.js     (needs Playwright)

   The rules are already covered in Node by timed-test.js. These drive the
   page instead, and mostly do it by handing resolvePitch a known elapsed
   time rather than racing a real clock — the exception is one genuine
   wall-clock test that the countdown really does expire on its own.
   ========================================================================= */

const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.join(__dirname, 'timed.html');

let passed = 0, failed = 0;
const assert = (cond, msg) => {
  if (cond) { passed++; console.log('ok   - ' + msg); }
  else      { failed++; console.error('FAIL - ' + msg); }
};
const section = title => console.log('\n# ' + title);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(URL);
  await page.waitForSelector('.choice');
  await page.evaluate(() => { window.__realRandom = Math.random; });
  const unpinRandom = () => page.evaluate(() => { Math.random = window.__realRandom; });

  // Stack the deck with words of chosen tiers and start a fresh at-bat.
  const stack = tags => page.evaluate(list => {
    startInning();
    state.deck = list.map(t => TIMED_VOCAB.find(w => w.tag === t));
    state.index = 0;
    startAtBat();
  }, tags);

  const look = () => page.evaluate(() => ({
    word:    document.getElementById('word').textContent,
    badge:   document.getElementById('tier-badge').textContent,
    payoff:  document.getElementById('payoff').textContent,
    strikes: state.atBat ? state.atBat.strikes : null,
    outs:    state.outs, runs: state.runs, index: state.index,
    hits:    state.hits, bases: state.bases
  }));

  /* =================================================================== */
  section('The clock is sized by the word');

  await stack(['WALK']);
  let v = await look();
  assert(v.badge.startsWith('EASY') && v.badge.includes('3.0'), `an easy word shows ${v.badge}`);
  await stack(['DOUBLE']);
  assert((await look()).badge.includes('MEDIUM · 4.0'), 'a medium word shows MEDIUM · 4.0s');
  await stack(['TRIPLE']);
  assert((await look()).badge.includes('HARD · 5.0'), 'a hard word shows HARD · 5.0s');

  section('The bar says what a correct answer is worth right now');

  await stack(['DOUBLE']);   // 4s window
  for (const [ms, label] of [[0, 'HOME RUN'], [900, 'HOME RUN'], [1200, 'TRIPLE'],
                             [2000, 'DOUBLE'], [3000, 'SINGLE'], [4200, 'TOO LATE']]) {
    const shown = await page.evaluate(t => { renderClock(t); return document.getElementById('payoff').textContent; }, ms);
    assert(shown === label, `at ${ms}ms of 4000 the bar reads ${label}`);
  }
  const width = await page.evaluate(() => { renderClock(2000); return document.getElementById('timer-fill').style.width; });
  assert(width === '50%', 'the bar is half drained halfway through the window');

  /* =================================================================== */
  section('Answering');

  await stack(['DOUBLE', 'DOUBLE']);
  await page.evaluate(() => resolvePitch(500, true));
  v = await look();
  assert(v.hits.HOMERUN === 1, 'a fast correct answer is a home run');
  assert(v.runs === 1 && v.bases.every(b => !b), 'the homer scores and leaves the bases empty');
  assert(v.strikes === 0, 'a hit leaves the count untouched');

  await stack(['DOUBLE']);
  await page.evaluate(() => resolvePitch(3000, true));
  assert((await look()).hits.SINGLE === 1, 'a slow correct answer is only a single');

  section('Strikes keep the same word alive');

  await stack(['TRIPLE', 'DOUBLE']);
  const firstWord = (await look()).word;
  await page.evaluate(() => resolvePitch(800, false));
  v = await look();
  assert(v.strikes === 1 && v.outs === 0, 'a wrong answer is a strike, not an out');
  assert((await page.locator('#feedback').textContent()).includes('Strike 1'), 'the feedback says strike one');
  await page.waitForTimeout(1700);
  v = await look();
  assert(v.word === firstWord, 'the same word comes back for the next pitch');
  assert(v.index === 0, 'and the deck has not advanced');
  assert((await page.locator('.choice').first().isDisabled()) === false, 'the choices are live again');

  await page.evaluate(() => resolvePitch(9999, true));
  v = await look();
  assert(v.strikes === 2, 'a correct answer that lands late is strike two');

  await page.waitForTimeout(1700);
  await page.evaluate(() => resolvePitch(800, false));
  v = await look();
  assert(v.outs === 1, 'strike three is an out');
  assert((await page.evaluate(() => state.missed.length)) === 1, 'the word that struck you out is remembered');
  await page.waitForTimeout(1700);
  v = await look();
  assert(v.word !== firstWord && v.index === 1, 'a new word arrives after the out');
  assert(v.strikes === 0, 'and the count resets with the new at-bat');

  section('The countdown really does run out on its own');

  await stack(['WALK']);   // 3s window, left alone
  const before = await look();
  await page.waitForTimeout(3400);
  v = await look();
  assert(v.strikes === 1, 'letting a 3s clock expire is a strike, with no input at all');
  assert(v.word === before.word, 'and the same word is still up');

  /* =================================================================== */
  section('Banking rides on top of the at-bats');

  await stack(['DOUBLE', 'DOUBLE', 'DOUBLE', 'DOUBLE']);
  await page.evaluate(() => { Math.random = () => 0.5; });   // pin the life to 2
  assert((await page.evaluate(() => state.bonus)) === null, 'nothing banked at the start');

  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => resolvePitch(400, true));
    await page.waitForTimeout(1700);
  }
  const bonus = await page.evaluate(() => state.bonus);
  assert(bonus && bonus.atBatsLeft === 2, 'three at-bats ending in hits bank a swing');
  assert(!(await page.locator('#hud-bank').isHidden()), 'and the HUD says so');
  assert((await page.evaluate(() => state.hitStreak)) === 0, 'the streak resets on banking');

  // The mix matters: it is any hit, not three singles.
  const mix = await page.evaluate(() => state.hits);
  assert(mix.HOMERUN === 3, 'those three were all home runs, and still banked a swing');

  /* =================================================================== */
  section('End of the inning');

  await stack(['DOUBLE', 'DOUBLE', 'DOUBLE']);
  for (let ab = 0; ab < 3; ab++) {
    for (let k = 0; k < 3; k++) {
      await page.evaluate(() => resolvePitch(800, false));
      await page.waitForTimeout(1700);
    }
  }
  assert(await page.locator('#summary-screen').isVisible(), 'three outs ends the inning');
  assert((await page.locator('#summary-title').textContent()).includes('Inning over'), 'the summary says so');
  assert((await page.locator('#missed-list li').count()) === 3, 'all three struck-out words are listed');

  /* =================================================================== */
  section('Spending a banked swing');

  const bank = (life = 2) => page.evaluate(n => {
    state.bonus = { atBatsLeft: n };
    renderHud();
  }, life);

  await stack(['DOUBLE', 'DOUBLE', 'DOUBLE']);
  assert(await page.locator('#bank-button').isHidden(), 'no swing button without a banked swing');
  await bank(2);
  assert(await page.locator('#bank-button').isVisible(), 'the swing button appears once one is banked');
  assert((await page.locator('#bank-life').textContent()).includes('2 at-bats'),
         'and says how long it lasts');

  // The sweet spot the player aims at must be the one the rules accept.
  const sweet = await page.evaluate(() => ({
    left:  document.getElementById('swing-sweet').style.left,
    width: document.getElementById('swing-sweet').style.width,
    min:   SWING_SWEET_MIN,
    max:   SWING_SWEET_MAX
  }));
  assert(sweet.left === (sweet.min * 100) + '%' &&
         sweet.width === ((sweet.max - sweet.min) * 100) + '%',
         `the drawn sweet spot matches the constants (${sweet.left} + ${sweet.width})`);

  await page.click('#bank-button');
  assert(await page.locator('#swing-screen').isVisible(), 'the swing screen takes over');
  assert(await page.locator('#pitch-screen').isHidden(), 'the question is set aside');
  // What matters is not the handle but the behaviour: the abandoned pitch
  // must not be able to charge a strike while the swing is up. Wait past
  // the window it was on and check nothing happened.
  await page.waitForTimeout(4600);
  assert((await page.evaluate(() => state.atBat.strikes)) === 0,
         'the abandoned pitch cannot charge a strike during the swing');
  assert(await page.locator('#swing-screen').isVisible(),
         'and the swing is still the thing on screen');

  const shout = await page.evaluate(() => ({
    es: document.getElementById('dugout-phrase').textContent,
    en: document.getElementById('dugout-gloss').textContent
  }));
  const known = await page.evaluate(() => DUGOUT_PHRASES);
  assert(known.some(p => p.es === shout.es && p.en === shout.en),
         `the dugout shouts a real phrase from the bank ("${shout.es}" / "${shout.en}")`);

  // The marker is actually moving.
  const a = await page.evaluate(() => state.swing.position);
  await page.waitForTimeout(220);
  const bpos = await page.evaluate(() => state.swing.position);
  assert(a !== bpos, 'the marker sweeps while the swing is live');

  section('Connecting');

  await page.evaluate(() => { state.bases = [true, true, false]; takeSwing(0.5); });
  v = await look();
  assert(v.hits.HOMERUN >= 1, 'a swing inside the sweet spot is a home run');
  assert(v.runs === 3, 'two on plus the batter scores three');
  assert(v.bases.every(x => !x), 'the bases are cleared');
  assert((await page.evaluate(() => state.bonus)) === null, 'the swing is spent');
  assert(await page.locator('#swing-figure').evaluate(e => e.classList.contains('bat-flip')),
         'the bat flip fires on the home run');
  assert((await page.locator('#swing-feedback').textContent()).includes('JONRÓN'), 'and the dugout gets its payoff');

  await page.waitForTimeout(2600);
  assert(await page.locator('#pitch-screen').isVisible(), 'play returns to the next at-bat');
  assert(!(await page.locator('#swing-figure').evaluate(e => e.classList.contains('bat-flip'))),
         'the bat flip is cleared before the next one');
  assert((await look()).index === 1, 'the swing consumed the at-bat');

  section('Missing');

  await stack(['DOUBLE', 'DOUBLE']);
  await bank(1);
  const outsBefore = (await look()).outs;
  await page.click('#bank-button');
  await page.evaluate(() => takeSwing(0.05));
  v = await look();
  assert(v.outs === outsBefore + 1, 'a swing outside the sweet spot is an out');
  assert((await page.evaluate(() => state.bonus)) === null, 'and the swing is spent either way');
  assert(!(await page.locator('#swing-figure').evaluate(e => e.classList.contains('bat-flip'))),
         'no bat flip on a miss');
  assert((await page.locator('#swing-feedback').textContent()).toLowerCase().includes('miss'),
         'the feedback says what happened');
  await page.waitForTimeout(1700);
  assert(await page.locator('#pitch-screen').isVisible(), 'and play moves on');

  section('Swinging with the keyboard');

  await stack(['DOUBLE', 'DOUBLE']);
  await bank(2);
  await page.click('#bank-button');
  await page.evaluate(() => { state.swing.position = 0.5; });
  await page.keyboard.press('Space');
  assert((await page.evaluate(() => state.swing && state.swing.result)) === 'HOMERUN',
         'space bar takes the swing too');
  await page.waitForTimeout(2600);

  /* =================================================================== */
  section('Both prompt directions');

  // Re-throw the current pitch with a direction we choose, so both ways can
  // be checked deterministically.
  const forceDirection = dir => page.evaluate(d => {
    state.atBat.direction = d;
    renderQuestion();
    throwPitch();
  }, dir);

  const face = () => page.evaluate(() => {
    const w = state.deck[state.index];
    return {
      prompt:    document.getElementById('word').textContent,
      promptLang: document.getElementById('word').lang,
      hint:      document.getElementById('direction-hint').textContent,
      choices:   [...document.querySelectorAll('.choice')].map(b => b.textContent),
      direction: state.atBat.direction,
      word:      w
    };
  });

  const SPANISH = await page.evaluate(() => TIMED_VOCAB.map(w => w.es));
  const ENGLISH = await page.evaluate(() => TIMED_VOCAB.map(w => w.en));

  await stack(['TRIPLE', 'TRIPLE']);
  await forceDirection('ES_TO_EN');
  let f = await face();
  assert(f.prompt === f.word.es, `Spanish-first shows the Spanish ("${f.prompt}")`);
  assert(f.promptLang === 'es', 'and marks the prompt as Spanish for screen readers');
  assert(f.hint === '→ English', 'the hint says to answer in English');
  assert(f.choices.every(c => ENGLISH.includes(c)), 'every choice is an English meaning');
  assert(f.choices.includes(f.word.en), 'the right English answer is among them');
  assert(new Set(f.choices).size === 4, 'no duplicate choices');

  await forceDirection('EN_TO_ES');
  f = await face();
  assert(f.prompt === f.word.en, `English-first shows the English ("${f.prompt}")`);
  assert(f.promptLang === 'en', 'and marks the prompt as English');
  assert(f.hint === '→ Español', 'the hint says to answer in Spanish');
  assert(f.choices.every(c => SPANISH.includes(c)), 'every choice is a Spanish word');
  assert(f.choices.includes(f.word.es), 'the right Spanish answer is among them');
  assert(new Set(f.choices).size === 4, 'no duplicate choices in this direction either');

  section('Answering in the reversed direction');

  // Click the Spanish word that matches the English prompt.
  const target = f.word.es;
  await page.locator('.choice', { hasText: target }).first().click();
  assert((await page.evaluate(() => state.atBat.result)) === 'HIT',
         'picking the right Spanish word is a hit');

  await stack(['TRIPLE']);
  await forceDirection('EN_TO_ES');
  f = await face();
  const wrongOne = f.choices.find(c => c !== f.word.es);
  await page.locator('.choice', { hasText: wrongOne }).first().click();
  assert((await page.evaluate(() => state.atBat.strikes)) === 1,
         'picking the wrong Spanish word is a strike');

  section('A re-pitch keeps the direction it came in on');

  const beforeRepitch = await face();
  await page.waitForTimeout(1700);
  const afterRepitch = await face();
  assert(afterRepitch.direction === beforeRepitch.direction,
         `the direction is unchanged after a strike (${afterRepitch.direction})`);
  assert(afterRepitch.prompt === beforeRepitch.prompt,
         'the same prompt comes back, in the same language');
  assert(afterRepitch.hint === beforeRepitch.hint, 'and the hint still says the same thing');
  assert(afterRepitch.choices.every(c => SPANISH.includes(c)),
         'the choices are still in the answer language');
  assert((await page.evaluate(() => state.atBat.strikes)) === 1,
         'and it is still the same at-bat, one strike in');

  // Strike two on the same word, still no drift.
  await page.evaluate(() => resolvePitch(9999, false));
  await page.waitForTimeout(1700);
  const afterTwo = await face();
  assert(afterTwo.direction === beforeRepitch.direction && afterTwo.prompt === beforeRepitch.prompt,
         'two strikes deep, the direction still has not drifted');

  section('Fresh words get a fresh roll');

  // Earlier sections pinned Math.random to fix a roll; put the real one
  // back before asking whether the direction actually varies.
  await unpinRandom();
  const seen = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < 400; i++) out.push(newAtBat('DOUBLE').direction);
    return [...new Set(out)];
  });
  assert(seen.length === 2, `both directions appear across fresh at-bats (${seen.join(', ')})`);

  assert(errors.length === 0, 'no console/page errors (' + errors.join('; ') + ')');

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
