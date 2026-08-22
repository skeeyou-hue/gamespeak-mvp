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
    state.deck = list.map(t => VOCAB.find(w => w.tag === t));
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

  // The band drawn over the plate must be exactly the stretch of flight the
  // rules accept — aiming at a lie is the one bug this screen cannot have.
  const zone = await page.evaluate(() => {
    const z = document.getElementById('contact-zone');
    return {
      top:    parseFloat(z.style.top),
      height: parseFloat(z.style.height),
      opens:  laneY(PLATE_AT - CONTACT_WINDOW),
      shuts:  laneY(PLATE_AT + CONTACT_WINDOW),
      plateY: laneY(PLATE_AT)
    };
  });
  assert(Math.abs(zone.top - zone.opens) < 0.01 &&
         Math.abs(zone.top + zone.height - zone.shuts) < 0.01,
         `the drawn contact zone is exactly the accepted window (${zone.top}px + ${zone.height}px)`);
  assert(zone.plateY > zone.top && zone.plateY < zone.top + zone.height,
         'and the plate sits inside it, not at one end');

  // Home plate is drawn at 156-170.5 in the field art. The ball is over the
  // plate when the rules say it is, or the picture is lying about the timing.
  assert(zone.plateY > 156 && zone.plateY < 170.5,
         `the ball crosses the drawn plate at PLATE_AT (y=${zone.plateY})`);

  await page.click('#bank-button');
  assert(await page.locator('#swing-screen').isVisible(), 'the swing screen takes over');
  assert(await page.locator('#pitch-screen').isHidden(), 'the question is set aside');

  // The abandoned pitch must not be able to charge a strike while the swing
  // is up. Squeeze its window down to nothing and wait well past it.
  await page.evaluate(() => { state.atBat.windowMs = 200; });
  await page.waitForTimeout(650);
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

  const call = await page.evaluate(() => ({
    es: document.getElementById('coach-phrase').textContent,
    en: document.getElementById('coach-gloss').textContent
  }));
  const orders = await page.evaluate(() => COACH_PHRASES);
  assert(orders.some(p => p.es === call.es && p.en === call.en),
         `the coach calls a real instruction ("${call.es}" / "${call.en}")`);
  assert(!known.some(p => p.es === call.es),
         'and it came from the coach bank, not the bench one');
  assert(call.es !== shout.es, 'the two voices are not saying the same thing');
  assert((await page.evaluate(() => state.swing.coach)) === call.es,
         'the coach line on screen is the one the swing recorded');

  // Both banks are really being drawn from, not stuck on their first entry.
  const spread = { bench: new Set(), coach: new Set() };
  for (let i = 0; i < 40; i++) {
    const pair = await page.evaluate(() => {
      const rnd = window.__realRandom;
      const b = DUGOUT_PHRASES[Math.floor(rnd() * DUGOUT_PHRASES.length)];
      const c = COACH_PHRASES[Math.floor(rnd() * COACH_PHRASES.length)];
      return [b.es, c.es];
    });
    spread.bench.add(pair[0]);
    spread.coach.add(pair[1]);
  }
  assert(spread.bench.size > 5 && spread.coach.size > 4,
         `both banks vary across draws (${spread.bench.size} bench, ${spread.coach.size} coach)`);

  section('The ball in flight');

  // The ball is really travelling, and the element really follows it.
  const frameA = await page.evaluate(() => ({
    progress: state.swing.progress,
    top:      parseFloat(document.getElementById('pitch-ball').style.top)
  }));
  await page.waitForTimeout(240);
  const frameB = await page.evaluate(() => ({
    progress: state.swing.progress,
    top:      parseFloat(document.getElementById('pitch-ball').style.top)
  }));
  assert(frameB.progress > frameA.progress, 'the ball is closing while the swing is live');
  assert(frameB.top > frameA.top, 'and the drawn ball comes down the lane with it');

  const drawn = await page.evaluate(p => {
    placeBall(p);
    const b = document.getElementById('pitch-ball');
    return { top: parseFloat(b.style.top), transform: b.style.transform, want: laneY(p) };
  }, 0.5);
  assert(Math.abs(drawn.top - drawn.want) < 0.01,
         'the ball is drawn at exactly the height its progress says');

  const sizes = await page.evaluate(() => [0, 0.5, 1].map(p => laneScale(p)));
  assert(sizes[0] < sizes[1] && sizes[1] < sizes[2],
         `the ball grows the whole way in (${sizes.map(s => s.toFixed(2)).join(' → ')})`);

  section('Letting it go by');

  // Nobody swung. One pitch means one chance, so the ball reaching the mitt
  // has to settle the at-bat by itself.
  let outsBefore = (await look()).outs;
  await page.waitForTimeout(2200);
  v = await look();
  assert((await page.evaluate(() => state.swing && state.swing.verdict)) === 'LOOKING' ||
         v.outs === outsBefore + 1,
         'a pitch nobody swings at is an out');
  assert((await page.locator('#swing-feedback').textContent()).toLowerCase().includes('called strike'),
         'and the feedback says it was taken');
  await page.waitForTimeout(1700);
  assert(await page.locator('#pitch-screen').isVisible(), 'play returns after a called strike');

  section('Connecting');

  await stack(['DOUBLE', 'DOUBLE', 'DOUBLE']);
  await bank(2);
  await page.click('#bank-button');
  await page.evaluate(() => { state.bases = [true, true, false]; takeSwing(PLATE_AT); });
  v = await look();
  assert(v.hits.HOMERUN >= 1, 'a swing as the ball crosses the plate is a home run');
  assert(v.runs === 3, 'two on plus the batter scores three');
  assert(v.bases.every(x => !x), 'the bases are cleared');
  assert((await page.evaluate(() => state.swing.verdict)) === 'ON_TIME', 'the verdict is on time');
  assert((await page.evaluate(() => state.bonus)) === null, 'the swing is spent');
  assert(await page.locator('#swing-figure').evaluate(e => e.classList.contains('bat-flip')),
         'the bat flip fires on the home run');
  assert(await page.locator('#pitch-ball').evaluate(e => e.classList.contains('struck')),
         'and the ball is sent back up the middle');
  assert((await page.locator('#swing-feedback').textContent()).includes('JONRÓN'), 'and the dugout gets its payoff');

  await page.waitForTimeout(2600);
  assert(await page.locator('#pitch-screen').isVisible(), 'play returns to the next at-bat');
  assert(!(await page.locator('#swing-figure').evaluate(e => e.classList.contains('bat-flip'))),
         'the bat flip is cleared before the next one');
  assert(!(await page.locator('#pitch-ball').evaluate(e => e.classList.contains('struck'))),
         'and the ball is back on the mound for the next one');

  section('Missing early and late');

  // Out in front of it.
  await stack(['DOUBLE', 'DOUBLE']);
  await bank(1);
  outsBefore = (await look()).outs;
  await page.click('#bank-button');
  await page.evaluate(() => takeSwing(0.05));
  v = await look();
  assert(v.outs === outsBefore + 1, 'a swing before the ball arrives is an out');
  assert((await page.evaluate(() => state.swing.verdict)) === 'EARLY', 'and it is scored early');
  assert((await page.evaluate(() => state.bonus)) === null, 'the swing is spent either way');
  assert(!(await page.locator('#swing-figure').evaluate(e => e.classList.contains('bat-flip'))),
         'no bat flip on a miss');
  assert((await page.locator('#swing-feedback').textContent()).toLowerCase().includes('in front'),
         'the feedback says which side of it they were on');
  await page.waitForTimeout(1700);
  assert(await page.locator('#pitch-screen').isVisible(), 'and play moves on');

  // Under it late.
  await stack(['DOUBLE', 'DOUBLE']);
  await bank(1);
  outsBefore = (await look()).outs;
  await page.click('#bank-button');
  await page.evaluate(() => takeSwing(0.97));
  assert((await look()).outs === outsBefore + 1, 'a swing after it has gone by is an out too');
  assert((await page.evaluate(() => state.swing.verdict)) === 'LATE', 'and it is scored late');
  assert((await page.locator('#swing-feedback').textContent()).toLowerCase().includes('late'),
         'the feedback says so');
  await page.waitForTimeout(1700);

  section('Swinging with the keyboard');

  await stack(['DOUBLE', 'DOUBLE']);
  await bank(2);
  await page.click('#bank-button');
  await page.evaluate(() => { state.swing.progress = PLATE_AT; });
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

  const SPANISH = await page.evaluate(() => VOCAB.map(w => w.es));
  const ENGLISH = await page.evaluate(() => VOCAB.map(w => w.en));

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

  /* ===================================================================
     H. THE BALLPARK
     Timed mode plays in the same park Classic does, mounted from scene.js.
     These mirror Classic's scene checks, on the same window-size matrix.
     =================================================================== */
  section('The shared ballpark');

  assert((await page.locator('.scene svg').count()) === 1, 'the park is mounted from scene.js');
  assert((await page.locator('.fielder').count()) === 9, 'all nine fielders are out there');
  assert((await page.locator('.runner').count()) === 3, 'and three base-runner slots');
  assert((await page.locator('#scorebug').count()) === 1, 'the outfield scorebug came with it');
  assert(await page.evaluate(() =>
           document.querySelector('.scene').getAttribute('aria-hidden') === 'true' &&
           getComputedStyle(document.querySelector('.scene')).pointerEvents === 'none'),
         'the park is decorative: no clicks, hidden from screen readers');

  section('The park reads Timed mode state');

  await stack(['DOUBLE', 'DOUBLE']);
  await page.evaluate(() => {
    state.runs = 5; state.outs = 2; state.bases = [true, false, true];
    renderHud();
  });
  const park = await page.evaluate(() => ({
    sju:     document.getElementById('board-home-runs').textContent,
    outs:    document.getElementById('board-outs').textContent,
    inning:  document.getElementById('board-inning').textContent,
    runners: ['first', 'second', 'third']
               .map(b => document.getElementById('runner-' + b).classList.contains('on')),
    pips:    ['first', 'second', 'third']
               .map(b => document.getElementById('pip-' + b).classList.contains('on')),
    state:   { runs: state.runs, outs: state.outs, inning: state.inning }
  }));
  assert(park.sju === String(park.state.runs), `the scorebug shows Timed's runs (${park.sju})`);
  assert(park.outs === `${park.state.outs} OUT`, 'and Timed\'s out count');
  assert(park.inning === String(park.state.inning), 'and Timed\'s inning');
  assert(JSON.stringify(park.runners) === JSON.stringify([true, false, true]),
         'runners on the field match the base state');
  assert(JSON.stringify(park.pips) === JSON.stringify(park.runners),
         'and the HUD diamond agrees with them');

  section('The park and the Timed HUD share the screen');

  const FIELDERS = ['fielder-p', 'fielder-c', 'fielder-1b', 'fielder-2b', 'fielder-3b',
                    'fielder-ss', 'fielder-lf', 'fielder-cf', 'fielder-rf'];
  const SIZES = [[760, 900], [900, 900], [1024, 768], [1180, 860],
                 [1290, 940], [1440, 900], [1600, 800], [480, 900]];

  let hudClean = true, edgeClean = true, signClean = true;
  for (const [w, h] of SIZES) {
    const sized = await browser.newPage({ viewport: { width: w, height: h } });
    await sized.goto(URL);
    await sized.waitForSelector('.choice');
    const r = await sized.evaluate(ids => {
      const R = el => el.getBoundingClientRect();
      const hit = (a, c) => a.left < c.right && c.left < a.right &&
                            a.top < c.bottom && c.top < a.bottom;
      // Every chrome element Timed mode puts on top of the park.
      const chrome = [...document.querySelectorAll('.hud-chip, .hud-bank')].map(R);
      const hud = [], sliced = [], clipped = [];
      for (const id of ids) {
        const f = R(document.getElementById(id));
        if (chrome.some(c => hit(f, c))) hud.push(id);
        const off = f.right < 0 || f.left > innerWidth;
        const inside = f.left >= 0 && f.right <= innerWidth;
        if (!off && !inside) sliced.push(id);
      }
      // Signage is either fully on screen or hidden outright, never sliced.
      for (const id of ['scorebug', 'wall-sign']) {
        const el = document.getElementById(id);
        if (getComputedStyle(el).display === 'none') continue;
        const b = R(el);
        if (b.left < 0 || b.right > innerWidth) clipped.push(id);
      }
      return { hud, sliced, clipped };
    }, FIELDERS);
    await sized.close();
    if (r.hud.length)     { hudClean = false;  console.error(`     ${w}x${h} HUD: ${r.hud.join(',')}`); }
    if (r.sliced.length)  { edgeClean = false; console.error(`     ${w}x${h} sliced: ${r.sliced.join(',')}`); }
    if (r.clipped.length) { signClean = false; console.error(`     ${w}x${h} clipped: ${r.clipped.join(',')}`); }
  }
  assert(hudClean,  `no fielder collides with Timed's HUD chips, across ${SIZES.length} window sizes`);
  assert(edgeClean, `no fielder is cut in half by the screen edge, across ${SIZES.length} window sizes`);
  assert(signClean, `the scorebug and wall sign are never sliced, across ${SIZES.length} window sizes`);

  assert(errors.length === 0, 'no console/page errors (' + errors.join('; ') + ')');

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
