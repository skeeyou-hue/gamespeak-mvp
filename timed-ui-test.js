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

  assert(errors.length === 0, 'no console/page errors (' + errors.join('; ') + ')');

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
