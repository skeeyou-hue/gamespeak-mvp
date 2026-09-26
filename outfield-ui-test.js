/* =========================================================================
   Tests for the Outfielder screen.

   Run with:  NODE_PATH=/opt/node22/lib/node_modules node outfield-ui-test.js

   Where a test measures the page it measures the question actually being
   asked. isVisible() is true for a ball sitting under an opaque callout;
   elementFromPoint is whether a finger landing there would hit it.
   ========================================================================= */

const { chromium } = require('playwright');
const path = require('path');
const R = require('./outfield-rules.js');
const B = require('./outfield-bank.js');

let passed = 0, failed = 0;
const assert = (cond, msg) => {
  if (cond) { passed++; console.log('ok   - ' + msg); }
  else      { failed++; console.error('FAIL - ' + msg); }
};
const section = t => console.log('\n# ' + t);

const URL = 'file://' + path.resolve(__dirname, 'outfield.html');
const entry = B.ENTRIES[0];
const ENTRIES_EN = entry.en;

/* Helpers that run in the page. The suite never decides an outcome — it
   asks the running game what happened. */
const live = p => p.evaluate(() => window.__outfield.state());
const tap = (p, pick) => p.evaluate(pick => {
  const st = window.__outfield.state();
  const slot = ENTRIES[0].slots.find(s => s.token === st.liveToken);
  const balls = [...document.querySelectorAll('.ball:not(.gone)')];
  if (!balls.length) return null;
  const want = pick === 'right' ? slot.answer : null;
  const target = want
    ? balls.find(b => b.querySelector('.word').textContent === want)
    : balls.find(b => b.querySelector('.word').textContent !== slot.answer);
  if (!target) return null;
  const word = target.querySelector('.word').textContent;
  target.click();
  const after = window.__outfield.state();
  return { word, last: after.log[after.log.length - 1] || null };
}, pick);

(async () => {
  const browser = await chromium.launch();

  /* ---------------------------------------------------------------- */
  section('The page loads clean and gates entry');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    await page.goto(URL);
    await page.waitForTimeout(250);

    assert(errs.length === 0, 'no console or page errors on first load' + (errs.length ? ': ' + errs[0] : ''));
    assert(await page.locator('#startVeil').isVisible(), 'the start card is up');
    assert(await page.locator('.ball').count() === 0,
           'and nothing is in the air until it is pressed — the inning is gated');

    // The levels offered are the rungs the bank can actually carry, not a
    // typed list that can drift from it.
    const offered = await page.locator('#levels button').allInnerTexts();
    const expect = R.rungsFor(entry).map(r => `${r.name} · ${r.slots}`);
    assert(JSON.stringify(offered) === JSON.stringify(expect),
           `the level picker offers exactly the playable rungs (${offered.join(', ')})`);

    const startCav = (await page.locator('#startCaveat').innerText()).toLowerCase();
    assert(startCav.includes('unreviewed'),
           'the start card says the content is unreviewed');
    assert(startCav.includes('one sentence so far'),
           'and warns that the bank holds one sentence, so three a half-inning is the bank and not a bug');

    await page.click('#goBtn');
    await page.waitForTimeout(350);
    assert(await page.locator('#startVeil').isHidden(), 'pressing it starts the inning');
    assert(await page.locator('.ball').count() === 4, 'four balls are in the air');
    await page.close();
  }

  /* ---------------------------------------------------------------- */
  section('Every candidate is catchable, at every width');
  for (const [w, h] of [[320, 640], [390, 844], [1024, 700]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(URL);
    await page.click('#goBtn');
    await page.waitForTimeout(500);

    const r = await page.evaluate(() => {
      const balls = [...document.querySelectorAll('.ball')];
      return {
        onscreen: balls.filter(b => {
          const q = b.getBoundingClientRect();
          return q.left >= 0 && q.right <= innerWidth && q.top >= 0 && q.bottom <= innerHeight;
        }).length,
        // A ball under an opaque callout is visible and untappable.
        reachable: balls.filter(b => {
          const q = b.querySelector('.word').getBoundingClientRect();
          const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
          return hit && hit.closest('.ball') === b;
        }).length,
        xOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        minTarget: Math.min(...balls.map(b => {
          const q = b.getBoundingClientRect();
          return Math.min(q.width, q.height);
        })),
        overlaps: (() => {
          let n = 0;
          for (let i = 0; i < balls.length; i++)
            for (let j = i + 1; j < balls.length; j++) {
              const a = balls[i].getBoundingClientRect(), c = balls[j].getBoundingClientRect();
              if (a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom) n++;
            }
          return n;
        })(),
        distinct: new Set(balls.map(b => {
          const q = b.querySelector('.word').getBoundingClientRect();
          const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
          const own = hit && hit.closest('.ball');
          return own ? own.querySelector('.word').textContent : null;
        }).filter(Boolean)).size
      };
    });
    assert(r.onscreen === 4, `${w}px: four of four wholly on screen`);
    assert(r.reachable === 4, `${w}px: and all four answer elementFromPoint — nothing is under the callout`);
    assert(r.xOverflow === 0, `${w}px: no horizontal overflow`);
    // The target is generous by intent, not by accident.
    assert(r.minTarget >= 44, `${w}px: the smallest hit target is ${Math.round(r.minTarget)}px`);
    // Overlapping tap targets are worse than an unreachable ball: the tap
    // lands on a DIFFERENT word and scores an error the player did not
    // make. At 320px the four forms of one lemma cannot share a row, so
    // this is the assertion that forced the two-lane layout.
    assert(r.overlaps === 0, `${w}px: no two tap targets overlap (${r.overlaps} pairs)`);
    assert(r.distinct === 4, `${w}px: each ball's centre resolves to itself, not a neighbour`);
    await page.close();
  }

  /* ---------------------------------------------------------------- */
  section('A catch fills the slot; a second wrong catch concedes and reveals');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(URL);
    await page.click('#goBtn');
    await page.waitForTimeout(350);

    const before = await live(page);
    const good = await tap(page, 'right');
    assert(good && good.last.type === 'CAUGHT', `catching the right ball is a catch (${good && good.word})`);
    const afterGood = await live(page);
    assert(afterGood.filled[before.liveToken] === good.word, 'and the word lands in the slot');
    assert(afterGood.liveToken !== before.liveToken, 'and the live slot moves on');

    await page.waitForTimeout(R.SETTLE_MS + 400);
    const tok = (await live(page)).liveToken;
    const f = await tap(page, 'wrong');
    assert(f && f.last.type === 'FOUL', `the first wrong catch is a foul (${f && f.word})`);
    assert((await live(page)).liveToken === tok, 'and the slot stays live');

    await page.waitForTimeout(R.HIT_BEAT_MS + 500);
    const c = await tap(page, 'wrong');
    assert(c && c.last.type === 'CONCEDE', `the second concedes a hit (${c && c.last.hit})`);
    assert(c.last.cold === true, 'and it is scored cold, because the window has not warmed yet');
    assert(R.RANK[c.last.hit] <= R.RANK[R.COLD_CAP],
           `a cold verdict cannot exceed ${R.COLD_CAP}`);

    // The reveal is the teaching moment; it has to actually render.
    await page.waitForTimeout(R.HIT_BEAT_MS + 300);
    const shown = await page.evaluate(() => {
      const s = document.querySelector('.slot.revealed');
      return { text: s && s.textContent.trim(),
               callout: document.getElementById('callout').textContent };
    });
    const answer = entry.slots.find(s => s.token === tok).answer;
    assert(shown.text === answer, `the correct word "${answer}" is shown in the slot it belonged to`);
    assert(shown.callout.includes(answer), 'and named in the call-out');
    await page.close();
  }

  /* ---------------------------------------------------------------- */
  section('The gloss appears only where grammar cannot separate the four');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(URL);
    await page.locator('#levels button', { hasText: 'Double-A' }).click();
    await page.click('#goBtn');
    await page.waitForTimeout(350);

    let checked = 0, wrong = 0;
    for (let i = 0; i < R.SLOTS_BY_LEVEL[2]; i++) {
      const st = await live(page);
      if (st.liveToken == null) break;
      const slot = entry.slots.find(s => s.token === st.liveToken);
      const g = await page.evaluate(() => {
        const n = document.getElementById('gloss');
        return n.hidden ? null : n.textContent;
      });
      checked++;
      const should = !!slot.gloss;
      if (!!g !== should) wrong++;
      if (should && g && !g.includes(slot.gloss)) wrong++;
      await tap(page, 'right');
      await page.waitForTimeout(R.SETTLE_MS + 350);
    }
    assert(checked === R.SLOTS_BY_LEVEL[2], `checked every slot of the rung (${checked})`);
    assert(wrong === 0, 'each slot shows a gloss if and only if its distractors are lexical');
    await page.close();
  }

  /* ---------------------------------------------------------------- */
  section('The flight is per rung, and Rookie is the slowest');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(URL);
    for (const r of R.rungsFor(entry)) {
      await page.locator('#levels button', { hasText: R.LEVELS[r.i].name }).click();
      await page.click('#goBtn');
      await page.waitForTimeout(250);
      const flight = await page.evaluate(() => window.__outfield.flight());
      assert(flight === R.FLIGHT_BY_LEVEL[r.i],
             `${R.LEVELS[r.i].name}: the volley runs for ${flight}ms, from the ladder`);
      // the ball animation is driven by that same number, not a second copy
      const dur = await page.evaluate(() =>
        parseFloat(getComputedStyle(document.querySelector('.ball')).transitionDuration) * 1000);
      assert(Math.round(dur) === flight,
             `${R.LEVELS[r.i].name}: and the balls actually fall over it (${Math.round(dur)}ms)`);
      await page.click('#pauseBtn'); await page.waitForTimeout(120);
      await page.click('#quitBtn'); await page.waitForTimeout(120);
    }
    // The property the calibration was for: slowest rung, longest look.
    const flights = R.rungsFor(entry).map(r => R.FLIGHT_BY_LEVEL[r.i]);
    assert(flights.every((f, i) => i === 0 || f < flights[i - 1]),
           `the flight shortens as the rung rises (${flights.join(' > ')}ms)`);
    assert(R.FLIGHT_BY_LEVEL[0] === Math.max(...R.FLIGHT_BY_LEVEL),
           'and Rookie is the longest look on the whole ladder');
    await page.close();
  }

  /* ---------------------------------------------------------------- */
  section('English at the low rungs, Spanish once a player has climbed');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(URL);

    // Switching on the start card, before committing to a rung.
    for (const [name, want, marker] of [
      ['Rookie', 'en', 'Play ball'],
      ['Single-A', 'en', 'Play ball'],
      ['Double-A', 'es', 'Juguemos']
    ]) {
      await page.locator('#levels button', { hasText: name }).click();
      await page.waitForTimeout(80);
      const got = await page.evaluate(() => window.__outfield.lang());
      assert(got === want, `${name} is ${want}`);
      assert((await page.locator('#goBtn').innerText()).includes(marker),
             `${name}: the card follows (“${marker}”)`);
    }

    // And the grammar note changes register with it.
    const noteFor = async (levelName) => {
      await page.goto(URL);
      await page.locator('#levels button', { hasText: levelName }).click();
      await page.click('#goBtn');
      await page.waitForTimeout(300);
      const first = await tap(page, 'wrong');
      const text = await page.locator('#callout').innerText();
      return { form: first.word, axis: first.last.axis, text };
    };
    const en = await noteFor('Rookie');
    const bankNote = entry.slots
      .flatMap(s => s.distractors).find(d => d.form === en.form).wrongHere;
    assert(en.text.includes(bankNote),
           'at an English rung the bank\'s own explanation is shown in full');

    const es = await noteFor('Double-A');
    assert(!es.text.includes(entry.slots.flatMap(s => s.distractors)
             .find(d => d.form === es.form).wrongHere),
           'at a Spanish rung the English author note is NOT shown');
    assert(/equivocad|forma personal/.test(es.text),
           `and a terse Spanish tag names the axis instead (${es.axis})`);
    await page.close();
  }

  /* ---------------------------------------------------------------- */
  section('The sentence sits above the balls, and nothing crowds it');
  for (const [w, h] of [[320, 640], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(URL);
    await page.locator('#levels button', { hasText: 'Double-A' }).click();
    await page.click('#goBtn');
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const box = s => document.querySelector(s).getBoundingClientRect();
      const hud = box('.hud'), deck = box('.deck'), air = box('.air'), strip = box('.strip');
      const live = document.querySelector('.slot.live');
      const g = document.getElementById('gloss');
      return {
        order: [['hud', hud.top], ['deck', deck.top], ['air', air.top], ['strip', strip.top]]
          .sort((a, b) => a[1] - b[1]).map(x => x[0]).join('>'),
        total: Math.round(hud.height + deck.height + air.height + strip.height),
        viewport: innerHeight,
        yOver: document.documentElement.scrollHeight - innerHeight,
        /* The live slot is marked by colour rather than a caret, so what
           matters is that it is TELLABLE APART from the slots that are
           not live — measured, not eyeballed. */
        liveDistinct: (() => {
          const cs = getComputedStyle(live);
          const other = [...document.querySelectorAll('.slot')]
            .find(n => n !== live && !n.classList.contains('done') &&
                                     !n.classList.contains('revealed'));
          if (!other) return true;
          const os = getComputedStyle(other);
          return cs.borderTopColor !== os.borderTopColor &&
                 cs.backgroundColor !== os.backgroundColor;
        })(),
        /* And that nothing it draws spills outside the deck it lives in. */
        withinDeck: live.getBoundingClientRect().top >= deck.top &&
                    live.getBoundingClientRect().bottom <= deck.bottom
      };
    });
    assert(r.order === 'hud>deck>air>strip',
           `${w}px: the sentence is read before the balls (${r.order})`);
    assert(r.total === r.viewport && r.yOver === 0,
           `${w}px: the four bands still account for exactly the viewport (${r.total}/${r.viewport})`);
    assert(r.liveDistinct, `${w}px: the live slot differs from an empty one in both border and fill`);
    assert(r.withinDeck, `${w}px: and draws nothing outside the sentence band`);
    await page.close();
  }

  /* ---------------------------------------------------------------- */
  section('A finished sentence shows its whole translation');
  for (const [rung, label] of [['Rookie', 'In English'], ['Double-A', 'En inglés']]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(URL);
    await page.locator('#levels button', { hasText: rung }).click();
    await page.click('#goBtn');
    await page.waitForTimeout(300);

    // Mid-sentence it must NOT be there, or it would hand over every
    // remaining answer.
    const mid = await page.evaluate(() => document.getElementById('gloss').textContent);
    assert(!mid.includes(entry.en),
           `${rung}: the translation is absent while the sentence is still being built`);

    for (let i = 0; i < 12; i++) {
      const done = await page.evaluate(() => {
        const st = window.__outfield.state();
        if (st.completed || st.liveToken == null) return true;
        const slot = ENTRIES[0].slots.find(s => s.token === st.liveToken);
        const t = [...document.querySelectorAll('.ball:not(.gone)')]
          .find(x => x.querySelector('.word').textContent === slot.answer);
        if (t) t.click();
        return false;
      });
      if (done) break;
      await page.waitForTimeout(R.SETTLE_MS + 300);
    }
    await page.waitForTimeout(350);

    const done = await page.evaluate(() => {
      const g = document.getElementById('gloss');
      return { text: g.textContent, hidden: g.hidden, full: g.classList.contains('full'),
               filled: document.querySelectorAll('.slot.done,.slot.revealed').length,
               blanks: document.querySelectorAll('.slot:not(.done):not(.revealed)').length };
    });
    assert(!done.hidden && done.text.includes(entry.en),
           `${rung}: the whole English sentence is shown, read off the entry`);
    assert(done.text.includes(label), `${rung}: labelled in the rung's own language (“${label}”)`);
    assert(done.full, `${rung}: and styled as the payoff rather than a per-slot hint`);
    assert(done.blanks === 0 && done.filled === R.SLOTS_BY_LEVEL[
             R.LEVELS.findIndex(l => l.name === rung)],
           `${rung}: every slot is filled by the time it appears, so it can leak nothing`);
    await page.close();
  }

  /* ---------------------------------------------------------------- */
  section('A tap on nothing costs nothing');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(URL);
    await page.click('#goBtn');
    await page.waitForTimeout(400);
    const before = await live(page);
    // a corner of the field with no ball in it
    await page.mouse.click(8, await page.evaluate(() =>
      Math.round(document.querySelector('.air').getBoundingClientRect().bottom - 12)));
    await page.waitForTimeout(150);
    const after = await live(page);
    assert(after.liveToken === before.liveToken, 'the live slot does not move');
    assert(after.missed === before.missed, 'no grace is spent');
    assert(after.outs === before.outs && after.runs === before.runs, 'no out, no run');
    assert(after.log.length === before.log.length, 'and nothing is even recorded');
    await page.close();
  }

  /* ---------------------------------------------------------------- */
  section('Three completed sentences end the half-inning');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(URL);
    await page.click('#goBtn');
    await page.waitForTimeout(350);
    for (let i = 0; i < 60; i++) {
      if (await page.locator('#endVeil').isVisible()) break;
      const r = await tap(page, 'right');
      await page.waitForTimeout(r ? R.SETTLE_MS + 380 : 300);
    }
    assert(await page.locator('#endVeil').isVisible(), 'the end card comes up');
    const st = await live(page);
    assert(st.outs === R.OUTS_PER_HALF, `after exactly ${R.OUTS_PER_HALF} sentences`);
    const tally = await page.locator('#tally').innerText();
    assert(/Runs:\s*0/.test(tally), 'a clean inning concedes nothing');
    const endCav = (await page.locator('#endCaveat').innerText()).toLowerCase();
    assert(endCav.includes('unreviewed') && endCav.includes('one sentence so far'),
           'and the end card repeats both notices');

    // A warm window is stored for next time; a cold one is not.
    const storedAfterClean = await page.evaluate(k => localStorage.getItem(k), 'gamespeak.outfield.pace.v1');
    const n = await page.evaluate(() => window.__outfield.pace().n());
    assert(n >= R.PACE_MIN ? !!storedAfterClean : !storedAfterClean,
           `the pace median is stored only once it is warm (${n} catches, ${storedAfterClean ? 'stored' : 'not stored'})`);
    if (storedAfterClean) {
      const o = JSON.parse(storedAfterClean);
      assert(o.v === 1 && Number.isFinite(o.median) && o.median > 0 && o.samples >= R.PACE_MIN,
             'and what is stored is versioned, finite and backed by enough samples');
    }
    await page.close();
  }

  /* ---------------------------------------------------------------- */
  section('Storage never gates play');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(() => {
      // a private window: reads return null, writes throw
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get: () => ({ getItem: () => null,
                      setItem: () => { throw new Error('QuotaExceededError'); },
                      removeItem: () => {} })
      });
    });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(URL);
    await page.click('#goBtn');
    await page.waitForTimeout(400);
    assert(await page.locator('.ball').count() === 4, 'the inning runs with storage throwing on every write');
    const r = await tap(page, 'right');
    assert(r && r.last.type === 'CAUGHT', 'and a catch still scores');
    assert(errs.length === 0, 'with nothing thrown to the page' + (errs.length ? ': ' + errs[0] : ''));
    await page.close();
  }

  /* ---------------------------------------------------------------- */
  section('A garbage stored median is discarded, not trusted');
  {
    for (const [label, val] of [
      ['half-written JSON', '{"v":1,"median":'],
      ['wrong version', '{"v":99,"median":2000,"samples":20}'],
      ['non-finite median', '{"v":1,"median":null,"samples":20}'],
      ['too few samples', '{"v":1,"median":2000,"samples":1}']
    ]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.addInitScript(v => localStorage.setItem('gamespeak.outfield.pace.v1', v), val);
      const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      await page.goto(URL);
      await page.click('#goBtn');
      await page.waitForTimeout(350);
      await tap(page, 'wrong'); await page.waitForTimeout(R.HIT_BEAT_MS + 450);
      const c = await tap(page, 'wrong');
      assert(errs.length === 0 && c && c.last.type === 'CONCEDE',
             `${label}: play continues and the verdict is reached`);
      assert(c.last.hit === R.WARMUP,
             `${label}: and it falls back to the cold verdict rather than a stored number`);
      await page.close();
    }
  }

  /* ---------------------------------------------------------------- */
  section('Pause covers the field, and mute persists');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(URL);
    await page.click('#goBtn');
    await page.waitForTimeout(400);
    await page.click('#pauseBtn');
    await page.waitForTimeout(150);
    const covered = await page.evaluate(() => {
      const b = document.querySelector('.ball');
      if (!b) return true;
      const q = b.getBoundingClientRect();
      const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      return !hit || !hit.closest('.ball');
    });
    assert(covered, 'no ball is tappable through the pause veil');

    await page.click('#pauseMute');
    const muted = await page.evaluate(() => isMuted());
    assert(muted === true, 'mute toggles from the pause card');
    await page.click('#resumeBtn');
    await page.waitForTimeout(250);
    await page.reload();
    await page.waitForTimeout(250);
    assert(await page.evaluate(() => isMuted()) === true, 'and survives a reload');
    await page.close();
  }

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
