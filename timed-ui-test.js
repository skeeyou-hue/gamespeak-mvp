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
  section('Three in a row offers a shot, it does not bank one');

  // A long deck: this section plays a dozen at-bats and must not run out.
  await stack(Array.from({ length: 24 }, () => 'DOUBLE'));
  assert((await page.evaluate(() => state.offersLeft)) === 0, 'nothing held at the start');

  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => resolvePitch(400, true));
    await page.waitForTimeout(1700);
  }
  assert(await page.locator('#offer-screen').isVisible(),
         'three at-bats ending in hits put an offer on screen');
  assert((await page.evaluate(() => state.offersLeft)) === 3,
         'and the bank it opens carries three chances');
  assert((await page.evaluate(() => state.hitStreak)) === 0, 'the streak is spent on the offer');
  assert((await page.locator('#hud-bank').textContent()).includes('3'),
         'the HUD says how many chances are left');

  // Declining spends one chance and hands the at-bat straight back.
  await page.click('#offer-pass');
  assert((await page.evaluate(() => state.offersLeft)) === 2, 'declining spends one chance');
  assert(await page.locator('#offer-screen').isHidden(), 'and the offer goes away');
  assert(await page.locator('#pitch-screen').isVisible(), 'play carries straight on');

  // It is re-offered by the NEXT streak, not by the next at-bat.
  await page.waitForFunction(() => !state.locked, { timeout: 6000 });
  await page.evaluate(() => resolvePitch(400, true));
  await page.waitForTimeout(1700);
  assert(await page.locator('#offer-screen').isHidden(),
         'one hit later there is no offer — it takes another three');
  for (let i = 0; i < 2; i++) {
    await page.waitForFunction(() => !state.locked, { timeout: 6000 });
    await page.evaluate(() => resolvePitch(400, true));
    await page.waitForTimeout(1700);
  }
  assert(await page.locator('#offer-screen').isVisible(), 'the next streak re-offers it');
  assert((await page.evaluate(() => state.offersLeft)) === 2,
         'and it is the same bank, not a fresh one');

  // Three declines and it is gone.
  await page.click('#offer-pass');
  assert((await page.evaluate(() => state.offersLeft)) === 1, 'two declines leave one');
  for (let i = 0; i < 3; i++) {
    await page.waitForFunction(() => !state.locked, { timeout: 6000 });
    await page.evaluate(() => resolvePitch(400, true));
    await page.waitForTimeout(1700);
  }
  await page.click('#offer-pass');
  assert((await page.evaluate(() => state.offersLeft)) === 0, 'the third decline expires it');

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
  section('The cap ends the half-inning');

  // Drive a real inning to the cap with a clean count, the case the cap
  // exists for: a player good enough that three outs never arrive.
  const capped = await page.evaluate(async () => {
    startInning();
    const cap = AT_BATS_PER_INNING;
    state.deck = Array.from({ length: cap + 5 },
                            () => VOCAB.find(w => w.tag === 'DOUBLE'));
    state.index = 0;
    startAtBat();
    for (let i = 0; i < cap; i++) {
      state.atBat.over = false;
      resolvePitch(10, true);            // a hit every time
      state.locked = false;
      state.index = i + 1;
      if (!document.getElementById('summary-screen').classList.contains('hidden')) break;
      state.atBat = newAtBat('DOUBLE');
    }
    const over = inningOver(state.outs, state.index, state.deck.length);
    if (over) finishInning(over);
    return {
      over, atBats: state.index, outs: state.outs,
      title: document.getElementById('summary-title').textContent,
      sub:   document.getElementById('summary-sub').textContent,
      summaryUp: !document.getElementById('summary-screen').classList.contains('hidden'),
      dots: [...document.querySelectorAll('#hud-outs .out-dot')]
              .filter(d => d.classList.contains('filled')).length
    };
  });
  assert(capped.over === 'CAP', `a clean inning ends on the cap (${capped.atBats} at-bats)`);
  assert(capped.summaryUp, 'and the summary takes over');
  assert(capped.outs === 3, 'the count resolves to three, not to whatever it was');
  assert(capped.dots === 3,
         'and the HUD agrees — three filled dots under a summary that says the side was retired');
  assert(/matanza|hilo|Atrapada/.test(capped.title),
         `the ending has a call on it, not a counter (${capped.title})`);
  assert(capped.sub.includes(String(await page.evaluate(() => AT_BATS_PER_INNING))),
         'and the subtitle says what actually ended it');

  // Bases empty is the path that cannot be a double play. Same requirement:
  // the count still has to reach three.
  const empty = await page.evaluate(() => {
    startInning();
    state.outs = 0;
    state.bases = [false, false, false];
    state.index = AT_BATS_PER_INNING;
    finishInning('CAP');
    return {
      outs: state.outs,
      title: document.getElementById('summary-title').textContent,
      bases: state.bases.slice()
    };
  });
  assert(empty.outs === 3, 'with the bases empty the count still resolves to three');
  assert(empty.title === '¡Tres al hilo!',
         `and the beat is one an empty diamond can support (${empty.title})`);
  assert(empty.bases.every(b => !b), 'nobody is left on');

  // A runner on: the beat can be a real play, and the runner it retires
  // comes off, so LOB in the summary agrees with the call.
  const withRunner = await page.evaluate(() => {
    startInning();
    state.outs = 1;
    state.bases = [true, true, false];
    state.index = AT_BATS_PER_INNING;
    finishInning('CAP');
    return {
      title: document.getElementById('summary-title').textContent,
      lob: document.getElementById('sum-lob').textContent
    };
  });
  assert(withRunner.title === '¡Doble matanza!', 'with runners on it is a double play');
  assert(withRunner.lob === '1',
         `and the box score's LOB agrees with it — one taken, one stranded (${withRunner.lob})`);

  // Three outs still ends it the old way, and still says so.
  const byOuts = await page.evaluate(() => {
    startInning();
    state.outs = 3;
    state.index = 5;
    finishInning(inningOver(state.outs, state.index, state.deck.length));
    return document.getElementById('summary-title').textContent;
  });
  assert(byOuts === 'Inning over', `three outs still ends it as it always did (${byOuts})`);

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

  section('Taking the shot');

  // A helper that gets an offer on screen the way the game does.
  const toOffer = async () => {
    await stack(Array.from({ length: 30 }, () => 'DOUBLE'));
    for (let i = 0; i < 3; i++) {
      await page.waitForFunction(() => !state.locked, { timeout: 8000 });
      await page.evaluate(() => resolvePitch(400, true));
      await page.waitForTimeout(1700);
    }
    await page.waitForSelector('#offer-screen:not(.hidden)', { timeout: 8000 });
  };
  const live = () => page.waitForFunction(() => state.swing && state.swing.live,
                                          { timeout: 9000 });
  const settled = () => page.waitForFunction(
    () => state.swing === null &&
          !document.getElementById('pitch-screen').classList.contains('hidden'),
    { timeout: 12000 });
  const LEAD = await page.evaluate(() => SWING_LEAD_MS);
  // Dead centre of the band drawn for a given attempt.
  const centre = a => page.evaluate(n => {
    const w = pressWindow(SWING_LEAD_MS, attemptFlightMs(n), attemptWindowMs(n));
    return (w.opens + w.shuts) / 2;
  }, a);

  await toOffer();
  // The offer states the reward in at-bats, because that is what it pays in.
  const terms = await page.evaluate(() => ({
    reward: document.getElementById('offer-reward').textContent,
    clock:  document.getElementById('offer-terms').textContent,
    extra:  BONUS_EXTRA_AT_BATS
  }));
  assert(terms.reward.includes(String(terms.extra)),
         `the offer says what it pays in at-bats ("${terms.reward.trim()}")`);
  assert(terms.clock.includes('7'), 'and how long the question gives you');

  await page.click('#offer-take');
  await page.waitForTimeout(300);
  const q = await page.evaluate(() => ({
    tag: state.deck[state.index].tag,
    windowMs: state.atBat.windowMs,
    bonusWindow: BONUS_QUESTION_MS,
    offersLeft: state.offersLeft,
    badge: document.getElementById('tier-badge').textContent
  }));
  assert(q.tag === 'HOMERUN', 'accepting puts a HOMERUN-tier word up');
  assert(q.windowMs === q.bonusWindow,
         `on its own clock, not the swing's (${q.windowMs}ms)`);
  assert(q.offersLeft === 0, 'and the bank is spent whichever way the question goes');
  assert(q.badge.includes('BONUS'), 'the badge says it is the bonus');

  section('Missing the question is the only out in the mechanic');

  const outsBeforeQ = (await look()).outs;
  const capBeforeQ = await page.evaluate(() => state.cap);
  await page.evaluate(() => resolvePitch(200, false));
  await page.waitForTimeout(300);
  assert((await look()).outs === outsBeforeQ + 1, 'missing the bonus word is an out');
  assert((await page.evaluate(() => state.cap)) === capBeforeQ,
         'and the inning does not grow — the reward was never earned');
  assert((await page.locator('#feedback').textContent()).includes('No shot'),
         'the feedback says the shot is gone');
  await page.waitForFunction(() => !state.locked, { timeout: 9000 });
  assert(await page.locator('#pitch-screen').isVisible(), 'and play carries on');

  section('Winning the question extends the inning');

  await toOffer();
  const capBefore = await page.evaluate(() => state.cap);
  await page.click('#offer-take');
  await page.waitForTimeout(300);
  await page.evaluate(() => resolvePitch(200, true));
  await page.waitForTimeout(2300);
  const won = await page.evaluate(() => ({
    cap: state.cap, extra: BONUS_EXTRA_AT_BATS,
    swingUp: !document.getElementById('swing-screen').classList.contains('hidden'),
    attempt: state.swing && state.swing.attempt
  }));
  assert(won.cap === capBefore + won.extra,
         `the inning grows by ${won.extra} at-bats (${capBefore} to ${won.cap})`);
  assert(won.swingUp, 'and the swing is earned');
  assert(won.attempt === 0, 'starting on the first of three attempts');

  section('Fouling them off');

  const pips = () => page.evaluate(() =>
    [...document.querySelectorAll('.foul-pip')].filter(p => p.classList.contains('used')).length);
  assert((await pips()) === 0, 'no fouls yet');

  for (let a = 0; a < 2; a++) {
    await live();
    const outsWas = (await look()).outs;
    await page.evaluate(() => takeSwing(0.02));
    await page.waitForTimeout(LEAD + 200);
    assert((await page.evaluate(() => state.swing.attempt)) === a + 1,
           `a miss on attempt ${a + 1} moves to the next one`);
    assert((await look()).outs === outsWas, '  and costs no out');
    assert((await page.evaluate(() => state.swing.result)) === null,
           '  the at-bat is still alive');
    assert((await pips()) === a + 1, `  ${a + 1} foul pip(s) lit`);
    assert((await page.locator('#swing-feedback').textContent()).toLowerCase().includes('foul'),
           '  and it is called a foul');
    await page.waitForTimeout(1300);
  }

  // The third attempt is the one that ends it — and still is not an out.
  await live();
  const outsBeforeThird = (await look()).outs;
  await page.evaluate(() => takeSwing(0.02));
  await page.waitForTimeout(LEAD + 250);
  assert((await page.evaluate(() => state.swing.result)) === 'MISS',
         'a miss on the third ends the at-bat');
  assert((await look()).outs === outsBeforeThird,
         'and it STILL costs no out — the risk was on the question');
  assert((await page.locator('#swing-feedback').textContent()).toLowerCase().includes('inning is still yours'),
         'the feedback says so rather than charging one');
  await settled();

  section('Connecting on the third, at its own timing');

  await toOffer();
  await page.click('#offer-take');
  await page.waitForTimeout(300);
  await page.evaluate(() => { state.bases = [true, true, false]; resolvePitch(200, true); });
  await page.waitForTimeout(2300);

  // Foul two off, then connect on the third band — which is a different band.
  for (let a = 0; a < 2; a++) {
    await live();
    await page.evaluate(() => takeSwing(0.02));
    await page.waitForTimeout(LEAD + 200);
    await page.waitForTimeout(1300);
  }
  await live();
  const bands = await page.evaluate(() => {
    const w0 = pressWindow(SWING_LEAD_MS, attemptFlightMs(0), attemptWindowMs(0));
    const w2 = pressWindow(SWING_LEAD_MS, attemptFlightMs(2), attemptWindowMs(2));
    const z = document.getElementById('press-zone');
    return { first: (w0.shuts - w0.opens) * 170, third: (w2.shuts - w2.opens) * 170,
             drawn: parseFloat(z.style.height), want: (w2.shuts - w2.opens) * 170 };
  });
  assert(Math.abs(bands.drawn - bands.want) < 0.01,
         `the drawn band is the THIRD attempt's, not the first's (${bands.drawn.toFixed(1)}px)`);
  const times = await page.evaluate(() => [0, 1, 2].map(a => attemptWindowMs(a)));
  assert(times[2] < times[0],
         `and it is tighter in time than attempt one (${times[0]}ms to ${times[2]}ms)`);
  // This assertion used to read the other way. At 200ms the third band was
  // 21.3px against 20.4px — shorter in time and still a bigger target, which
  // is a mixed signal. Measured on the page, not just in the rules, because
  // the drawn band is what the player aims at.
  assert(bands.third < bands.first,
         `and NARROWER on the page too (${bands.third.toFixed(1)}px against attempt one's ${bands.first.toFixed(1)}px) — the squeeze has to beat the speed-up or it is decoration`);

  const runsBefore = (await look()).runs;
  await page.evaluate(async () => {
    const w = pressWindow(SWING_LEAD_MS, attemptFlightMs(2), attemptWindowMs(2));
    takeSwing((w.opens + w.shuts) / 2);
  });
  await page.waitForTimeout(LEAD + 250);
  const hit = await look();
  assert((await page.evaluate(() => state.swing.result)) === 'HOMERUN',
         'the centre of the third band connects');
  assert(hit.runs === runsBefore + 3, 'two on plus the batter scores three');
  assert(hit.hits.HOMERUN >= 1, 'and it goes down as a home run');
  assert(await page.locator('#swing-figure').evaluate(e => e.classList.contains('bat-flip')),
         'the bat flip fires');
  await settled();
  assert((await page.evaluate(() => state.hitStreak)) === 0,
         'and the shot never seeds the next streak');

  section('The cue is redrawn per attempt');

  const perAttempt = await page.evaluate(() => {
    const out = [];
    for (let a = 0; a < SWING_ATTEMPTS; a++) {
      const w = pressWindow(SWING_LEAD_MS, attemptFlightMs(a), attemptWindowMs(a));
      out.push({ flight: attemptFlightMs(a), win: attemptWindowMs(a),
                 band: +((w.shuts - w.opens) * 170).toFixed(1) });
    }
    return out;
  });
  assert(perAttempt[1].band > perAttempt[0].band,
         `attempt two's band is bigger than attempt one's (${perAttempt[0].band} to ${perAttempt[1].band}) — speed alone is decoration`);
  assert(perAttempt[2].win < perAttempt[1].win && perAttempt[2].band < perAttempt[1].band,
         `attempt three squeezes the window instead (${perAttempt[1].win}ms to ${perAttempt[2].win}ms, ${perAttempt[1].band}px to ${perAttempt[2].band}px)`);

  section('The ball still flies, and the load still leads');

  await toOffer();
  await page.click('#offer-take');
  await page.waitForTimeout(300);
  await page.evaluate(() => resolvePitch(200, true));
  await page.waitForTimeout(2300);
  await live();

  await page.waitForFunction(() => state.swing && state.swing.progress > 0, { timeout: 6000 });
  const a1 = await page.evaluate(() => state.swing.progress);
  await page.waitForTimeout(240);
  const a2 = await page.evaluate(() => state.swing.progress);
  assert(a2 > a1, `the ball is closing while the swing is live (${a1.toFixed(2)} to ${a2.toFixed(2)})`);

  await page.evaluate(() => { state.swing.progress = 0.4; takeSwing(0.4); });
  const midLoad = await page.evaluate(() => ({
    press: state.swing.pressAt, result: state.swing.result,
    loading: document.getElementById('swing-figure').classList.contains('swinging')
  }));
  assert(midLoad.press === 0.4 && midLoad.result === null,
         'pressing commits but settles nothing — the barrel is still on its way');
  assert(midLoad.loading, 'and the bat is visibly coming through');
  await page.waitForTimeout(LEAD + 200);
  const want = await page.evaluate(() => contactProgress(0.4, SWING_LEAD_MS, attemptFlightMs(0)));
  assert(Math.abs((await page.evaluate(() => state.swing.contactAt)) - want) < 1e-9,
         'and the barrel arrives where this attempt\'s flight says it does');
  await page.waitForTimeout(1400);

  section('Swinging with the keyboard');

  await live();
  await page.evaluate(async () => {
    const w = pressWindow(SWING_LEAD_MS, attemptFlightMs(state.swing.attempt),
                          attemptWindowMs(state.swing.attempt));
    state.swing.progress = (w.opens + w.shuts) / 2;
  });
  await page.keyboard.press('Space');
  assert((await page.evaluate(() => state.swing.pressAt)) !== null, 'space bar commits the swing');
  await page.waitForTimeout(LEAD + 200);
  assert((await page.evaluate(() => state.swing.result)) === 'HOMERUN',
         'and it settles the same way a click does');
  await settled();

  /* =================================================================== */
  section('Pause cannot be used to win the swing');

  await toOffer();
  await page.click('#offer-take');
  await page.waitForTimeout(300);
  await page.evaluate(() => resolvePitch(200, true));
  await page.waitForTimeout(2300);
  await live();
  await page.waitForFunction(() => state.swing && state.swing.progress > 0.5, { timeout: 9000 });
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
  await live();
  assert((await page.evaluate(() => state.swing.progress)) < 0.2,
         'resuming throws it again from the mound');
  assert((await page.evaluate(() => state.swing.attempt)) === 0,
         'and it does not burn an attempt — the pause is not a foul');
  await page.evaluate(async () => {
    const w = pressWindow(SWING_LEAD_MS, attemptFlightMs(0), attemptWindowMs(0));
    takeSwing((w.opens + w.shuts) / 2);
  });
  await page.waitForTimeout(LEAD + 250);
  assert((await page.evaluate(() => state.swing.result)) === 'HOMERUN',
         'and the re-thrown pitch is a real one that can still be hit');
  await settled();

  section('The offer alongside the other two rules');

  // The easy-out rule is untouched by any of this: a missed WALK is still an
  // out on the spot, whatever the offer state.
  await stack(['WALK', 'DOUBLE', 'DOUBLE']);
  await page.evaluate(() => { state.offersLeft = 2; renderHud(); });
  const outsWasEasy = (await look()).outs;
  await page.evaluate(() => resolvePitch(500, false));
  await page.waitForTimeout(300);
  assert((await look()).outs === outsWasEasy + 1,
         'a missed easy word is still an instant out with a bank in hand');
  assert((await page.evaluate(() => state.offersLeft)) === 2,
         'and the bank survives it — an out is not a decline');
  await page.waitForFunction(() => !state.locked, { timeout: 8000 });

  // The extension really reaches the thing that ends the inning.
  const grown = await page.evaluate(() => {
    startInning();
    const base = state.cap;
    state.cap = extendInning(state.cap);
    return {
      base, grown: state.cap,
      atBase: inningOver(0, base, state.deck.length, state.cap),
      atGrown: inningOver(0, state.cap, state.deck.length, state.cap)
    };
  });
  assert(grown.grown > grown.base, `the cap grew (${grown.base} to ${grown.grown})`);
  assert(grown.atBase === null,
         'and the inning no longer ends at the old cap — the extension is real');
  assert(grown.atGrown === 'CAP', 'it ends at the new one');

  // Two bonuses pay and no more, so the inning cannot grow without bound.
  const ceiling = await page.evaluate(() => {
    startInning();
    for (let i = 0; i < 6; i++) state.cap = extendInning(state.cap);
    return { cap: state.cap, max: AT_BATS_PER_INNING + MAX_INNING_EXTENSION };
  });
  assert(ceiling.cap === ceiling.max,
         `six wins still cannot push the inning past ${ceiling.max} at-bats`);

  section('At the ceiling the offer stops coming');

  // Behind the ceiling the deal pays in the home run alone, which is the
  // variant measured dominated. Driven on the page rather than asserted in
  // the rules, because the trap the player meets is a SCREEN.
  await stack(Array.from({ length: 30 }, () => 'DOUBLE'));
  await page.evaluate(() => {
    state.cap = AT_BATS_PER_INNING + MAX_INNING_EXTENSION;   // both bonuses won
    state.offersLeft = BONUS_STREAK_OFFERS;                  // and a bank in hand
    renderHud();
  });
  assert(await page.locator('#hud-bank').isVisible(),
         'a bank in hand shows on the HUD to start with');

  for (let i = 0; i < 4; i++) {
    await page.waitForFunction(() => !state.locked, { timeout: 8000 });
    await page.evaluate(() => resolvePitch(400, true));
    await page.waitForTimeout(1700);
  }
  const atCeiling = await page.evaluate(() => ({
    offerUp: !document.getElementById('offer-screen').classList.contains('hidden'),
    pitching: !document.getElementById('pitch-screen').classList.contains('hidden'),
    offersLeft: state.offersLeft,
    streak: state.hitStreak,
    bankShown: !document.getElementById('hud-bank').classList.contains('hidden')
  }));
  assert(atCeiling.offerUp === false,
         `four hits in a row at the ceiling put no offer on screen (streak ${atCeiling.streak})`);
  assert(atCeiling.pitching, 'play carries straight on into the next at-bat');
  assert(atCeiling.streak >= 3,
         'and the streak is genuinely long enough that it would have offered otherwise');
  assert(atCeiling.offersLeft === 0 && atCeiling.bankShown === false,
         'the bank held from before is cleared rather than left promising a shot that cannot be redeemed');

  // The same streak with room left still offers, so it is the ceiling doing
  // the suppressing and not something about this deck or this run.
  await page.evaluate(() => { state.cap = AT_BATS_PER_INNING; });
  await page.waitForFunction(() => !state.locked, { timeout: 8000 });
  await page.evaluate(() => resolvePitch(400, true));
  await page.waitForSelector('#offer-screen:not(.hidden)', { timeout: 8000 });
  assert(await page.locator('#offer-screen').isVisible(),
         'and with room back on the cap the very next hit offers again — it is the ceiling, not the deck');
  await page.click('#offer-pass');
  await page.waitForFunction(() => !state.locked, { timeout: 8000 });

  // The last paying win says so, because the offers stop after it.
  const lastCall = await page.evaluate(() => {
    startInning();
    state.cap = AT_BATS_PER_INNING + MAX_INNING_EXTENSION - BONUS_EXTRA_AT_BATS;
    state.bonusQ = { word: state.deck[state.index], direction: 'ES_EN' };
    settleBonusQuestion(true);
    return { text: document.getElementById('feedback').textContent, cap: state.cap,
             ceiling: AT_BATS_PER_INNING + MAX_INNING_EXTENSION };
  });
  assert(lastCall.cap === lastCall.ceiling,
         `winning the second bonus reaches the ceiling exactly (${lastCall.cap} at-bats)`);
  assert(/as long as this inning goes/i.test(lastCall.text),
         `and it says so ("${lastCall.text.trim()}") rather than letting the offers just stop`);

  const notLast = await page.evaluate(() => {
    startInning();
    state.bonusQ = { word: state.deck[state.index], direction: 'ES_EN' };
    settleBonusQuestion(true);
    return document.getElementById('feedback').textContent;
  });
  assert(!/as long as this inning goes/i.test(notLast),
         'a bonus with room still behind it does not say that');

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
