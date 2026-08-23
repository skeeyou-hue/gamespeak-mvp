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
  /* =================================================================== */
  section('Timed reads the expanded word list');

  // Every word has to be dealable in this mode too: a tier with no entry in
  // TIMED_TIERS would leave an at-bat with no clock at all.
  const noClock = await page.evaluate(() =>
    VOCAB.filter(w => !TIMED_TIERS[w.tag] || !windowForTag(w.tag)).map(w => w.es));
  assert(noClock.length === 0,
         `every word maps to a real countdown${noClock.length ? ': ' + noClock.join(', ') : ''}`);

  // A fresh inning, because earlier sections stack the deck on purpose.
  const deck = await page.evaluate(() => {
    startInning();
    return { len: state.deck.length, vocab: VOCAB.length };
  });
  assert(deck.len === deck.vocab, `a fresh inning deals the whole list (${deck.len} words)`);

  // Both prompt directions have to work on the new words specifically, not
  // just on whichever ones happened to be dealt.
  const newest = ['el camarero', 'el jardín', 'el abridor', 'la mascota', 'el ponche'];
  const faces = await page.evaluate(list => list.map(es => {
    const w = VOCAB.find(v => v.es === es);
    if (!w) return { es, missing: true };
    const a = promptFor(w, 'ES_TO_EN'), b = promptFor(w, 'EN_TO_ES');
    return { es, ok: a.prompt === w.es && a.answer === w.en &&
                      b.prompt === w.en && b.answer === w.es };
  }), newest);
  assert(faces.every(f => f.ok),
         `the new words work in both directions (${faces.filter(f => f.ok).length}/${newest.length})`);

  /* =================================================================== */
  section('The umpire calls it on the real events');

  const ump = () => page.evaluate(() => {
    const n = [...document.querySelectorAll('.ump-call')]
      .find(x => x.closest('.card') && !x.closest('.card').classList.contains('hidden'));
    return n ? { es: n.querySelector('.ump-es').textContent,
                 en: n.querySelector('.ump-en').textContent,
                 shown: n.classList.contains('show'),
                 tone: n.classList.contains('safe') ? 'safe'
                     : n.classList.contains('against') ? 'against' : '' } : null;
  });

  // A fresh pitch has nothing to call.
  await stack(['DOUBLE', 'DOUBLE', 'DOUBLE', 'DOUBLE']);
  let umpSays = await ump();
  assert(umpSays.shown === false && umpSays.es === '', 'no call before anything has happened');

  // A fast right answer: safe.
  await page.evaluate(() => resolvePitch(100, true));
  umpSays = await ump();
  assert(umpSays.es === '¡Safe!' && umpSays.en === 'Safe!', `a hit is called ¡Safe! ("${umpSays.es}")`);
  assert(umpSays.tone === 'safe', 'and it reads as the batter\'s call, not against him');
  await page.waitForFunction(() =>
    document.querySelector('#pitch-screen .ump-call').classList.contains('show') === false,
    { timeout: 4000 });
  assert(true, 'and it clears when the next pitch is thrown');

  // A wrong answer: a swinging strike.
  await page.evaluate(() => resolvePitch(200, false));
  umpSays = await ump();
  assert(umpSays.es === '¡Strike!' && umpSays.tone === 'against', 'a wrong answer is called ¡Strike!');
  assert((await look()).strikes === 1, 'and the strike really was registered');

  // resolvePitch locks the screen until the next pitch is thrown, so each
  // one of these has to wait for the game to come back round.
  const unlocked = () => page.waitForFunction(() => !state.locked, { timeout: 6000 });

  // The clock running out charges a strike, so it is called one. The umpire
  // and the strike pips have to agree about what just happened.
  await unlocked();
  const strikesBefore = (await look()).strikes;
  await page.evaluate(() => resolvePitch(state.atBat.windowMs, false));
  umpSays = await ump();
  assert(umpSays.es === '¡Strike!', 'the countdown running out is called ¡Strike!');
  assert((await look()).strikes === strikesBefore + 1,
         'and the strike it calls is the strike the scoreboard charged');

  // The third strike outranks it: an at-bat that ends is an out either way.
  await unlocked();
  await page.evaluate(() => resolvePitch(state.atBat.windowMs, false));
  umpSays = await ump();
  assert(umpSays.es === '¡Out!', 'the third strike is called ¡Out! even on a timeout');
  assert((await look()).outs >= 1, 'and the out really was charged');

  /* =================================================================== */
  section('Pause');

  // This section measures the clock across more than a second of wall time,
  // so it has to start from a quiet game: a feedback timeout left in flight
  // by an earlier section would land in the middle of it and re-throw the
  // pitch, resetting the very clock being measured.
  await page.waitForFunction(() => !state.locked, { timeout: 8000 });
  await page.waitForTimeout(1700);          // longer than the feedback pause
  await stack(['TRIPLE', 'TRIPLE', 'TRIPLE']);
  assert(await page.locator('#pause-veil').isHidden(), 'no veil while play is live');
  assert(!(await page.locator('#pause-button').isDisabled()), 'the pause button is live during a pitch');

  await page.waitForTimeout(400);
  await page.click('#pause-button');
  assert(await page.locator('#pause-veil').isVisible(), 'the veil covers the card');
  assert((await page.evaluate(() => state.paused)) === true, 'and the game knows it is paused');

  // Really covered, not merely "visible: false" — the word is still in the
  // layout, so the check has to be what is actually on top of it.
  const covered = await page.evaluate(() => {
    const w = document.getElementById('word').getBoundingClientRect();
    const top = document.elementFromPoint(w.left + w.width / 2, w.top + w.height / 2);
    return top && top.closest('#pause-veil') !== null;
  });
  assert(covered, 'the word cannot be read through it — a pause is not free thinking time');

  // The clock is measured off state, not off a rendered string: the display
  // only moves on a frame, and this has to be exact.
  const held = await page.evaluate(() => Math.round(performance.now() - startedAt));
  await page.waitForTimeout(900);
  const stillHeld = await page.evaluate(() => Math.round(performance.now() - startedAt));
  assert(stillHeld - held > 800,
         'the raw clock keeps running while stopped — nothing is being faked');
  assert((await page.evaluate(() => document.getElementById('clock-num').textContent)) ===
         (await page.evaluate(() => document.getElementById('clock-num').textContent)),
         'but the countdown on screen is frozen');
  assert((await look()).strikes === 0, 'and it cannot expire into a strike while stopped');

  await page.evaluate(() => resolvePitch(100, true));
  assert((await look()).index === 0, 'a pitch cannot be resolved while paused');

  // Resume rebases the clock so the pause costs the player nothing and gives
  // them nothing: elapsed picks up within a frame of where it stopped.
  await page.click('#pause-resume');
  const resumed = await page.evaluate(() => Math.round(performance.now() - startedAt));
  assert((await page.evaluate(() => state.paused)) === false, 'resume clears the pause');
  assert(await page.locator('#pause-veil').isHidden(), 'and takes the veil away');
  assert(Math.abs(resumed - held) < 120,
         `the clock carries on from where it stopped (${held}ms -> ${resumed}ms, not ${stillHeld}ms)`);

  await page.waitForTimeout(300);
  const running = await page.evaluate(() => Math.round(performance.now() - startedAt));
  assert(running > resumed + 200,
         `and it is genuinely running again (${resumed}ms -> ${running}ms)`);

  await page.keyboard.press('KeyP');
  assert((await page.evaluate(() => state.paused)) === true, 'P pauses');
  await page.keyboard.press('Escape');
  assert((await page.evaluate(() => state.paused)) === false, 'Escape resumes');

  section('Pause is only live when a clock is');

  await stack(['TRIPLE', 'TRIPLE']);
  await page.evaluate(() => resolvePitch(100, true));
  assert(await page.locator('#pause-button').isDisabled(),
         'the button is dead during the feedback pause, when no clock is running');
  await page.evaluate(() => togglePause());
  assert((await page.evaluate(() => state.paused)) === false,
         'and pausing there does nothing rather than half-freezing the game');
  await page.waitForFunction(() => !state.locked, { timeout: 6000 });
  assert(!(await page.locator('#pause-button').isDisabled()), 'it comes back with the next pitch');

  // The pause button joined a row that was already full. Nothing in the HUD
  // may sit on top of anything else, with the bank badge showing or not.
  let hudClash = [];
  for (const w of [360, 390, 470, 768, 1440]) {
    const sized = await browser.newPage({ viewport: { width: w, height: 900 } });
    await sized.goto(URL);
    await sized.waitForSelector('.choice');
    await sized.evaluate(() => { state.bonus = { atBatsLeft: 2 }; renderHud(); });
    const bad = await sized.evaluate(() => {
      const items = [...document.querySelectorAll('.hud > *')]
        .filter(e => getComputedStyle(e).display !== 'none')
        .map(e => ({ id: e.id || e.className, r: e.getBoundingClientRect() }));
      const hit = (a, b) => a.left < b.right && b.left < a.right &&
                            a.top < b.bottom && b.top < a.bottom;
      const out = [];
      for (let i = 0; i < items.length; i++)
        for (let j = i + 1; j < items.length; j++)
          if (hit(items[i].r, items[j].r)) out.push(`${items[i].id}/${items[j].id}`);
      return out;
    });
    await sized.close();
    if (bad.length) hudClash.push(`${w}px: ${bad.join(', ')}`);
  }
  assert(hudClash.length === 0,
         `nothing in the HUD overlaps, bank badge showing, across 5 widths${hudClash.length ? ' — ' + hudClash.join(' | ') : ''}`);

  /* =================================================================== */
  section('Missing an easy word ends the at-bat');

  await stack(['WALK', 'DOUBLE', 'DOUBLE']);
  let outsWas = (await look()).outs;
  await page.evaluate(() => resolvePitch(500, false));
  v = await look();
  assert(v.outs === outsWas + 1, 'a missed WALK is an out on the first pitch');
  assert((await page.locator('#feedback').textContent()).includes('That one you know'),
         'and the feedback says so rather than claiming strike three');
  assert((await page.evaluate(() => {
    const n = [...document.querySelectorAll('.ump-call')]
      .find(x => !x.closest('.card').classList.contains('hidden'));
    return n.querySelector('.ump-es').textContent;
  })) === '¡Out!', 'the umpire calls it an out, matching what the scoreboard did');
  await page.waitForFunction(() => !state.locked, { timeout: 6000 });
  assert((await look()).index === 1, 'and the at-bat is over — the deck moved on');

  // The same miss on a medium word is only a strike, and the word comes back.
  await stack(['DOUBLE', 'DOUBLE', 'DOUBLE']);
  outsWas = (await look()).outs;
  const wordWas = (await look()).word;
  await page.evaluate(() => resolvePitch(500, false));
  v = await look();
  assert(v.outs === outsWas, 'a missed DOUBLE costs no out');
  assert(v.strikes === 1, 'just a strike');
  await page.waitForFunction(() => !state.locked, { timeout: 6000 });
  assert((await look()).word === wordWas, 'and the same word comes back for another look');

  section('Spending a banked swing');

  // The pitch only goes live after the ready beat; tests that drive a swing
  // have to wait for it, the same as a player does.
  const live = () => page.waitForFunction(() => state.swing && state.swing.live,
                                          { timeout: 8000 });
  // Wait for a swing to be fully put away rather than guessing at how long
  // the feedback pause plus the bat flip takes.
  const settled = () => page.waitForFunction(
    () => state.swing === null &&
          !document.getElementById('pitch-screen').classList.contains('hidden'),
    { timeout: 8000 });

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
    const p = document.getElementById('press-zone');
    const w = pressWindow();
    return {
      top:    parseFloat(z.style.top),
      height: parseFloat(z.style.height),
      opens:  laneY(PLATE_AT - contactWindowFraction()),
      shuts:  laneY(PLATE_AT + contactWindowFraction()),
      plateY: laneY(PLATE_AT),
      pressTop:    parseFloat(p.style.top),
      pressHeight: parseFloat(p.style.height),
      pressOpens:  laneY(w.opens),
      pressShuts:  laneY(w.shuts),
      lead:        SWING_LEAD_MS
    };
  });
  // Contact is a hairline on the plate, not a band competing with the target.
  assert(Math.abs(zone.top + zone.height / 2 - zone.plateY) < 0.6,
         `the contact marker sits on PLATE_AT (${zone.top}px, plate at ${zone.plateY})`);
  assert(zone.height <= 3,
         `and it is a hairline, not a second band to aim at (${zone.height}px)`);

  // Home plate is drawn at 156-170.5 in the field art. The ball is over the
  // plate when the rules say it is, or the picture is lying about the timing.
  assert(zone.plateY > 156 && zone.plateY < 170.5,
         `the ball crosses the drawn plate at PLATE_AT (y=${zone.plateY})`);

  // The press cue has to be drawn where the rules say to commit, not where
  // contact happens — otherwise the screen is showing an unreachable target.
  assert(Math.abs(zone.pressTop - zone.pressOpens) < 0.01 &&
         Math.abs(zone.pressTop + zone.pressHeight - zone.pressShuts) < 0.01,
         `the drawn press cue is exactly the press window (${zone.pressTop}px + ${zone.pressHeight}px)`);
  assert(zone.pressTop < zone.top,
         'and it sits earlier in the flight than contact, as the load requires');

  // The target has to be the loud one. If contact were drawn as heavily as
  // the press cue the player would aim at the wrong one, which is exactly
  // what the two-band version did.
  const weight = await page.evaluate(() => ({
    pressW:   parseFloat(getComputedStyle(document.getElementById('press-zone')).width),
    contactW: parseFloat(getComputedStyle(document.getElementById('contact-zone')).width),
    cue: getComputedStyle(document.getElementById('press-zone'), '::after').content
  }));
  assert(zone.pressHeight > zone.height * 5,
         `the press target dominates the contact marker (${zone.pressHeight}px vs ${zone.height}px)`);
  assert(weight.pressW > weight.contactW,
         `and is the wider of the two (${weight.pressW}px vs ${weight.contactW}px)`);
  assert(weight.cue.includes('SWING'), `the target is labelled (${weight.cue})`);

  await page.click('#bank-button');
  assert(await page.locator('#swing-screen').isVisible(), 'the swing screen takes over');

  // The ready beat: nothing is live on the frame the screen changes.
  const atOpen = await page.evaluate(() => ({
    live: state.swing.live,
    btn:  document.getElementById('swing-go').disabled,
    cue:  document.getElementById('ready-cue').textContent,
    hold: readyHoldMs()
  }));
  assert(atOpen.live === false, 'the pitch is not live on the frame the screen appears');
  assert(atOpen.btn === true, 'and the swing button is dead until it is');
  assert(atOpen.cue.trim().length > 0, `the ready cue is showing ("${atOpen.cue.trim()}")`);
  const beforeLive = await page.evaluate(() => takeSwing(0.75) || state.swing.pressAt);
  assert(beforeLive === null, 'a press during the ready beat does nothing at all');
  await page.waitForFunction(() => state.swing && state.swing.live, { timeout: 4000 });
  assert((await page.evaluate(() => state.swing.progress)) === 0,
         'and the ball has not moved before the clock starts');
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

  // The bug a tester actually hit: a 6.4px ball on top of the pitcher's
  // figure is not findable until it has already travelled half the flight.
  const atRelease = await page.evaluate(() => {
    placeBall(0);
    const b = document.getElementById('pitch-ball').getBoundingClientRect();
    return { px: b.width, flying: document.getElementById('pitch-ball').classList.contains('flying') };
  });
  assert(atRelease.px >= 12,
         `the ball is findable the moment it appears (${atRelease.px.toFixed(1)}px at release)`);
  assert(!atRelease.flying, 'and carries no motion trail while it is still in the hand');

  const moving = await page.evaluate(() => {
    placeBall(0.3);
    return document.getElementById('pitch-ball').classList.contains('flying');
  });
  assert(moving, 'the trail appears once it is actually travelling');

  // The release flash marks the one frame worth reacting to, and it has to
  // sit on the release point rather than near it.
  const flash = await page.evaluate(() => {
    const f = document.getElementById('pitch-flash');
    popRelease();
    return { top: parseFloat(f.style.top), want: LANE_RELEASE_Y,
             anim: getComputedStyle(f).animationName };
  });
  assert(flash.top === flash.want, `the release flash is on the release point (y=${flash.top})`);
  assert(flash.anim === 'releaseFlash', 'and it actually fires');

  section('The load — the press is not the contact');

  // Pressing commits the swing; the barrel arrives SWING_LEAD_MS later and
  // the ball keeps coming in between. Nothing is settled at the press.
  const LEAD = await page.evaluate(() => SWING_LEAD_MS);
  await page.evaluate(() => { for (let i = 1; i < 99999; i++) cancelAnimationFrame(i); });
  await page.evaluate(() => { state.swing.progress = 0.4; placeBall(0.4); takeSwing(0.4); });
  const midLoad = await page.evaluate(() => ({
    press:   state.swing.pressAt,
    result:  state.swing.result,
    verdict: state.swing.verdict,
    loading: document.getElementById('swing-figure').classList.contains('swinging')
  }));
  assert(midLoad.press === 0.4, 'the press is recorded where the ball was');
  assert(midLoad.result === null && midLoad.verdict === null,
         'and nothing is settled yet — the barrel is still on its way');
  assert(midLoad.loading, 'the bat is visibly coming through during the load');

  await page.waitForTimeout(LEAD + 120);
  const landed = await page.evaluate(() => ({
    contact: state.swing.contactAt,
    verdict: state.swing.verdict,
    result:  state.swing.result
  }));
  // Derived, not a hand-picked threshold: how far the ball travels during
  // the load depends on how fast the pitch is, and both are constants.
  const want = await page.evaluate(() => contactProgress(0.4));
  assert(Math.abs(landed.contact - want) < 1e-9 && landed.contact > 0.4,
         `the ball moved on during the load (pressed 0.4, met at ${landed.contact.toFixed(3)})`);
  assert(landed.result !== null, 'and the swing settles once the barrel arrives');

  await settled();

  section('Letting it go by');

  // Nobody swung. One pitch means one chance, so the ball reaching the mitt
  // has to settle the at-bat by itself. Needs its own live pitch: the load
  // section above spent the previous one.
  await stack(['DOUBLE', 'DOUBLE']);
  await bank(1);
  let outsBefore = (await look()).outs;
  await page.click('#bank-button');
  await live();
  // The whole flight plus a margin, taken from the constants so a retune of
  // the pitch speed cannot leave this waiting too little.
  await page.waitForTimeout(await page.evaluate(
    () => PITCH_WINDUP_MS + PITCH_FLIGHT_MS + 300));
  v = await look();
  assert((await page.evaluate(() => state.swing && state.swing.verdict)) === 'LOOKING' ||
         v.outs === outsBefore + 1,
         'a pitch nobody swings at is an out');
  assert((await page.locator('#swing-feedback').textContent()).toLowerCase().includes('called strike'),
         'and the feedback says it was taken');
  await settled();
  assert(await page.locator('#pitch-screen').isVisible(), 'play returns after a called strike');

  section('Connecting');

  await stack(['DOUBLE', 'DOUBLE', 'DOUBLE']);
  await bank(2);
  await page.click('#bank-button');
  await live();
  await page.evaluate(() => {
    state.bases = [true, true, false];
    takeSwing(PLATE_AT - leadProgress());   // one load ahead: the band's centre
  });
  await page.waitForTimeout(LEAD + 120);
  v = await look();
  assert(v.hits.HOMERUN >= 1, 'committing one load ahead of the plate is a home run');
  assert(v.runs === 3, 'two on plus the batter scores three');
  assert(v.bases.every(x => !x), 'the bases are cleared');
  assert((await page.evaluate(() => state.swing.verdict)) === 'ON_TIME', 'the verdict is on time');
  let swingCall = await ump();
  assert(swingCall.es === '¡Safe!' && swingCall.tone === 'safe',
         'the umpire calls the banked home run ¡Safe!');
  assert((await page.evaluate(() => state.bonus)) === null, 'the swing is spent');
  assert(await page.locator('#swing-figure').evaluate(e => e.classList.contains('bat-flip')),
         'the bat flip fires on the home run');
  assert(await page.locator('#pitch-ball').evaluate(e => e.classList.contains('struck')),
         'and the ball is sent back up the middle');
  assert((await page.locator('#swing-feedback').textContent()).includes('JONRÓN'), 'and the dugout gets its payoff');

  await settled();
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
  await live();
  await page.evaluate(() => takeSwing(0.05));
  await page.waitForTimeout(LEAD + 120);
  v = await look();
  assert(v.outs === outsBefore + 1, 'a swing before the ball arrives is an out');
  assert((await page.evaluate(() => state.swing.verdict)) === 'EARLY', 'and it is scored early');
  swingCall = await ump();
  assert(swingCall.es === '¡Out!' && swingCall.tone === 'against',
         'the umpire calls a missed swing ¡Out!');
  assert((await page.evaluate(() => state.bonus)) === null, 'the swing is spent either way');
  assert(!(await page.locator('#swing-figure').evaluate(e => e.classList.contains('bat-flip'))),
         'no bat flip on a miss');
  assert((await page.locator('#swing-feedback').textContent()).toLowerCase().includes('in front'),
         'the feedback says which side of it they were on');
  await settled();
  assert(await page.locator('#pitch-screen').isVisible(), 'and play moves on');

  // Under it late.
  await stack(['DOUBLE', 'DOUBLE']);
  await bank(1);
  outsBefore = (await look()).outs;
  await page.click('#bank-button');
  await live();
  await page.evaluate(() => takeSwing(0.97));
  await page.waitForTimeout(LEAD + 120);
  assert((await look()).outs === outsBefore + 1, 'a swing after it has gone by is an out too');
  assert((await page.evaluate(() => state.swing.verdict)) === 'LATE', 'and it is scored late');
  assert((await page.locator('#swing-feedback').textContent()).toLowerCase().includes('late'),
         'the feedback says so');
  await settled();

  // With the tightened window the load is deeper than the window, so pressing
  // as the ball reaches the plate is late. The band is drawn on the press
  // window, above the plate, and that is what the player aims at — so the
  // check is that the band's own centre connects.
  await stack(['DOUBLE', 'DOUBLE']);
  await bank(1);
  await page.click('#bank-button');
  await live();
  await page.evaluate(() => takeSwing(PLATE_AT));
  await page.waitForTimeout(LEAD + 120);
  assert((await page.evaluate(() => state.swing.verdict)) === 'LATE',
         'pressing as the ball reaches the plate is late at this window width');
  await settled();

  await stack(['DOUBLE', 'DOUBLE']);
  await bank(1);
  await page.click('#bank-button');
  await live();
  await page.evaluate(() => {
    const w = pressWindow();
    takeSwing((w.opens + w.shuts) / 2);      // dead centre of the drawn band
  });
  await page.waitForTimeout(LEAD + 120);
  assert((await page.evaluate(() => state.swing.verdict)) === 'ON_TIME',
         'pressing at the centre of the drawn SWING band is on time');
  assert((await page.evaluate(() => state.swing.result)) === 'HOMERUN', 'and it is a home run');
  await settled();

  section('A spent swing does not seed the next one');

  // The whole loop, through the real UI: bank, spend, and confirm the count
  // starts from nothing rather than from one.
  await stack(['DOUBLE', 'DOUBLE', 'DOUBLE', 'DOUBLE', 'DOUBLE']);
  await bank(2);
  await page.evaluate(() => { state.hitStreak = 0; });
  await page.click('#bank-button');
  await live();
  await page.evaluate(() => {
    const w = pressWindow();
    takeSwing((w.opens + w.shuts) / 2);
  });
  await page.waitForTimeout(LEAD + 120);
  assert((await page.evaluate(() => state.swing.result)) === 'HOMERUN',
         'the banked swing connects');
  await settled();
  assert((await page.evaluate(() => state.hitStreak)) === 0,
         'and the streak is back at zero, not one');
  assert((await page.evaluate(() => state.bonus)) === null, 'with nothing banked');

  // Two more hits must not be enough to re-bank.
  await page.evaluate(() => { resolvePitch(100, true); });
  await page.waitForFunction(() => !state.locked, { timeout: 6000 });
  await page.evaluate(() => { resolvePitch(100, true); });
  await page.waitForFunction(() => !state.locked, { timeout: 6000 });
  assert((await page.evaluate(() => state.hitStreak)) === 2, 'two hits later the streak is two');
  assert((await page.evaluate(() => state.bonus)) === null,
         'and no swing is banked yet — the spent one did not count toward it');

  await page.evaluate(() => { resolvePitch(100, true); });
  await page.waitForFunction(() => !state.locked, { timeout: 6000 });
  assert((await page.evaluate(() => state.bonus)) !== null,
         'the third hit banks the next one, a full three after the last');

  section('Swinging with the keyboard');

  await stack(['DOUBLE', 'DOUBLE']);
  await bank(2);
  await page.click('#bank-button');
  await live();
  await page.evaluate(() => { state.swing.progress = PLATE_AT - leadProgress(); });
  await page.keyboard.press('Space');
  assert((await page.evaluate(() => state.swing && state.swing.pressAt)) !== null,
         'space bar commits the swing too');
  await page.waitForTimeout(LEAD + 120);
  assert((await page.evaluate(() => state.swing && state.swing.result)) === 'HOMERUN',
         'and it settles the same way a click does');

  // A second press mid-load must not start a second swing.
  await settled();
  await stack(['DOUBLE', 'DOUBLE']);
  await bank(1);
  await page.click('#bank-button');
  await live();
  await page.evaluate(() => takeSwing(0.3));
  await page.evaluate(() => takeSwing(0.75));
  assert((await page.evaluate(() => state.swing.pressAt)) === 0.3,
         'a second press during the load is ignored — you only commit once');
  await settled();

  /* =================================================================== */
  section('Pause cannot be used to win the swing');

  await stack(['DOUBLE', 'DOUBLE', 'DOUBLE']);
  await bank(2);
  await page.click('#bank-button');
  await live();
  await page.waitForFunction(() => state.swing && state.swing.progress > 0.5, { timeout: 6000 });
  const mid = await page.evaluate(() => state.swing.progress);
  await page.click('#pause-button');
  const stopped = await page.evaluate(() => ({
    paused: state.paused, live: state.swing.live, progress: state.swing.progress,
    btn: document.getElementById('swing-go').disabled
  }));
  assert(stopped.paused && stopped.progress === 0,
         `a paused swing goes back to the mound (was ${mid.toFixed(2)}, now ${stopped.progress})`);
  assert(stopped.live === false && stopped.btn === true,
         'and nothing is swingable while it is stopped');
  await page.evaluate(() => takeSwing(0.72));
  assert((await page.evaluate(() => state.swing.pressAt)) === null,
         'a press while paused does nothing at all');

  await page.click('#pause-resume');
  assert((await page.evaluate(() => state.swing.live)) === false,
         'resuming restarts the ready beat rather than releasing the ball');
  await live();
  assert((await page.evaluate(() => state.swing.progress)) < 0.2,
         'and the ball starts from the pitcher again');
  await page.evaluate(() => {
    const w = pressWindow();
    takeSwing((w.opens + w.shuts) / 2);
  });
  await page.waitForTimeout(LEAD + 120);
  assert((await page.evaluate(() => state.swing.result)) === 'HOMERUN',
         'and the re-thrown pitch is a real one that can still be hit');
  await settled();

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
  // Phone sizes are in the matrix on purpose: the framing bug a tester hit
  // only ever showed up on tall, narrow screens.
  const SIZES = [[390, 844], [375, 667], [412, 915], [768, 1024],
                 [760, 900], [1024, 768], [1290, 940], [1440, 900], [1600, 700]];

  let hudClean = true, edgeClean = true, signClean = true, diamondClean = true;
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
        // Fully on screen, or it counts as cropped. The old rule let a
        // fielder pass by being entirely off the side, which is how nine
        // fielders went missing on a phone without a single test failing.
        //
        // The bottom edge is the one exception, and only for the catcher:
        // he is the nearest figure to the camera and is composed to sit in
        // the frame's bottom edge, the way a shot from behind the plate
        // actually looks. Every other edge is a hard bound for all nine.
        const bottomCut = f.bottom > innerHeight && id !== 'fielder-c';
        if (f.left < 0 || f.right > innerWidth || f.top < 0 || bottomCut) {
          sliced.push(id);
        }
      }
      // Signage is either fully on screen or hidden outright, never sliced.
      for (const id of ['scorebug', 'wall-sign']) {
        const el = document.getElementById(id);
        if (getComputedStyle(el).display === 'none') continue;
        const b = R(el);
        if (b.left < 0 || b.right > innerWidth) clipped.push(id);
      }
      // The diamond itself: every bag, the rubber, the plate. This is the
      // check the tester's complaint was really about.
      const diamond = [];
      for (const id of ['bag-first', 'bag-second', 'bag-third', 'rubber', 'home-plate-bag']) {
        const b = R(document.getElementById(id));
        if (b.left < 0 || b.right > innerWidth || b.top < 0 || b.bottom > innerHeight) {
          diamond.push(id);
        }
      }
      return { hud, sliced, clipped, diamond };
    }, FIELDERS);
    await sized.close();
    if (r.diamond.length) { diamondClean = false;
      console.error(`     ${w}x${h} off screen: ${r.diamond.join(',')}`); }
    if (r.hud.length)     { hudClean = false;  console.error(`     ${w}x${h} HUD: ${r.hud.join(',')}`); }
    if (r.sliced.length)  { edgeClean = false; console.error(`     ${w}x${h} sliced: ${r.sliced.join(',')}`); }
    if (r.clipped.length) { signClean = false; console.error(`     ${w}x${h} clipped: ${r.clipped.join(',')}`); }
  }
  assert(diamondClean,
         `every base, the rubber and the plate are on screen, across ${SIZES.length} window sizes`);
  assert(hudClean,  `no fielder collides with Timed's HUD chips, across ${SIZES.length} window sizes`);
  assert(edgeClean, `all nine fielders are fully on screen, across ${SIZES.length} window sizes`);
  assert(signClean, `the scorebug and wall sign are never sliced, across ${SIZES.length} window sizes`);

  assert(errors.length === 0, 'no console/page errors (' + errors.join('; ') + ')');

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
