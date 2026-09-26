/* OUTFIELDER — flow and DOM.

   The rules live in outfield-rules.js and never touch the document; this
   file never decides an outcome. It measures how long a volley was in the
   air, hands that to the rules, and renders whatever comes back.

   Nothing shared is touched. rules.js, timed.js and audio.js are READ —
   audio.js for the existing strike sting, timed.js for the level ladder
   and base running — and none is modified, so no part of this build can
   change Classic or the timed mode.
   ------------------------------------------------------------------- */
(function () {
  'use strict';

  const PACE_KEY = 'gamespeak.outfield.pace.v1';

  const el = {};
  const ids = ['outs','runs','levelChip','muteBtn','pauseBtn','air','callout',
               'gloss','sentence','diamond','legend','startVeil','levels','goBtn',
               'startCaveat','pauseVeil','pauseLevels','pauseMute','quitBtn',
               'resumeBtn','endVeil','endTitle','tally','againBtn','backBtn',
               'endCaveat','runsChip'];
  for (const id of ids) el[id] = document.getElementById(id);
  /* A missing id fails as `undefined.innerHTML` deep inside a render, which
     points at the render rather than at the typo. Name it here instead —
     endCaveat was in the markup and not in this list, and that is exactly
     how it surfaced. */
  const missing = ids.filter(id => !el[id]);
  if (missing.length) throw new Error('outfield: markup is missing ' + missing.join(', '));

  const entry = ENTRIES[0];
  const playable = rungsFor(entry);

  let level = playable[0].i;     // rung index into LEVELS
  let pendingLevel = level;      // applies at the next sentence
  let inning = null, pace = null, stored = null;
  let volleyStart = 0, ballEls = [], locked = true;


  /* ---- LANGUAGE BY RUNG -------------------------------------------------

     A first-time player met a screen that was Spanish end to end and it
     was too much at once. The scaffolding now fades as you climb: the
     chrome and the grammar notes are ENGLISH at Rookie and Single-A, and
     SPANISH from Double-A up, where a player has earned it.

     That also gives the bank's `wrongHere` strings somewhere honest to
     live. They are an author's note written for the adviser — English,
     detailed, explanatory — and showing them on a Spanish screen was a
     register mismatch dressed up as a feature. At the English rungs they
     are exactly right. At the Spanish rungs they are replaced by a terse
     Spanish tag naming the axis, which is what a player at that level
     needs and all they need.

     The Spanish here is UI copy rather than corpus, but it is still
     Spanish nobody has signed, so it carries the same provisional flag as
     everything else. */
  const LANG_BY_LEVEL = ['en', 'en', 'es', 'es', 'es'];
  const langFor = i => LANG_BY_LEVEL[i] || 'es';

  const COPY = {
    en: {
      hudOuts: 'OUT', hudRuns: 'R', runsTitle: 'Runs',
      mute: 'Mute (M)', unmute: 'Unmute (M)', pause: 'Pause',
      howPlay: 'A sentence drops in with gaps. Four balls in the air, each ' +
               'carrying one word. <b>Tap the one that fills the gap.</b> ' +
               'Gaps fill strictly left to right.',
      howScore: 'Miss twice on one gap and the batter gets a hit. Three ' +
                'finished sentences end the half-inning.',
      play: 'Play ball!',
      paused: 'PAUSED', levelNote: 'A level change takes effect next sentence.',
      quit: 'Quit', resume: 'Keep going', again: 'Another inning',
      changeLevel: 'Change level',
      endTitle: 'END OF THE HALF', endShutout: 'SHUTOUT INNING',
      caught: 'Caught it!',
      dropped: 'They dropped. Again — <b>costs time, not outs</b>.',
      foul: n => `Foul. ${n} left.`,
      thisGap: g => `this gap: “${g}”`,
      hit: { SINGLE: 'single', DOUBLE: 'double', TRIPLE: 'triple', HOMERUN: 'home run' },
      conceded: (h, runs) => `The batter gets a <b>${h}</b>.` +
        (runs ? ` ${runs} run${runs > 1 ? 's' : ''} in.` : ''),
      cold: ' <i>(no read on your pace yet — mildest call)</i>',
      atPace: r => ` <i>(${r} your own pace)</i>`,
      wasWord: w => `The word was <b>${w}</b>.`,
      sentenceDone: n => `Sentence complete. <b>Out ${n}</b>.`,
      onBase: on => `<b>Runners on ${on}.</b><br>Finish clean and they stay there.`,
      empty: '<b>Bases empty.</b><br>Every miss puts someone on.',
      bases: ['1st', '2nd', '3rd'], and: ' and ',
      basesAria: on => on.length ? 'Runners on ' + on.join(' and ') : 'Bases empty',
      tally: (runs, hits, mix, lob, caught) =>
        `Runs: <b>${runs}</b><br>Hits allowed: <b>${hits}</b>${mix}<br>` +
        `Words revealed: <b>${hits}</b><br>Left on base: <b>${lob}</b><br>` +
        `Clean catches: <b>${caught}</b>`,
      mixNames: { SINGLE: 'singles', DOUBLE: 'doubles', TRIPLE: 'triples', HOMERUN: 'home runs' },
      soundOn: 'Sound: on', soundOff: 'Sound: off',
      oneSentence: '<b>One sentence so far.</b> The bank holds a single ' +
        'sentence, so you will see it three times an inning. That is the ' +
        'bank being small, not the game repeating itself.',
      unreviewed: '<b>Unreviewed.</b> Nothing here has been signed off by a ' +
        'native speaker — the sentence, the hints and the wrong-answer notes ' +
        'are all provisional.',
      reviewed: n => `<b>Reviewed by ${n}.</b>`
    },
    es: {
      hudOuts: 'OUT', hudRuns: 'C', runsTitle: 'Carreras',
      mute: 'Silenciar (M)', unmute: 'Activar sonido (M)', pause: 'Pausa',
      howPlay: 'Cae una frase con huecos. Cuatro pelotas en el aire, cada una ' +
               'con una palabra. <b>Toca la que llena el hueco.</b> Se llenan ' +
               'de izquierda a derecha.',
      howScore: 'Falla dos veces en un hueco y el bateador conecta un hit. ' +
                'Tres frases completas terminan la entrada.',
      play: '¡Juguemos!',
      paused: 'PAUSA', levelNote: 'El nivel cambia en la próxima frase.',
      quit: 'Salir', resume: 'Seguir', again: 'Otra entrada',
      changeLevel: 'Cambiar nivel',
      endTitle: 'FIN DE LA ENTRADA', endShutout: 'ENTRADA EN BLANCO',
      caught: '¡Atrapada!',
      dropped: 'Se cayeron. Otra vez — <b>cuesta tiempo, no outs</b>.',
      foul: n => `Foul. Te queda ${n}.`,
      thisGap: g => `este hueco: “${g}”`,
      hit: { SINGLE: 'sencillo', DOUBLE: 'doble', TRIPLE: 'triple', HOMERUN: 'jonrón' },
      conceded: (h, runs) => `El bateador conecta un <b>${h}</b>.` +
        (runs ? ` ${runs} carrera${runs > 1 ? 's' : ''}.` : ''),
      cold: ' <i>(aún sin tu ritmo — el más suave)</i>',
      atPace: r => ` <i>(${r} tu ritmo)</i>`,
      wasWord: w => `La palabra era <b>${w}</b>.`,
      sentenceDone: n => `Frase completa. <b>Out ${n}</b>.`,
      onBase: on => `<b>Corredores en ${on}.</b><br>Termina limpio y se quedan ahí.`,
      empty: '<b>Bases limpias.</b><br>Cada error pone a alguien en base.',
      bases: ['1ra', '2da', '3ra'], and: ' y ',
      basesAria: on => on.length ? 'Corredores en ' + on.join(' y ') : 'Bases limpias',
      tally: (runs, hits, mix, lob, caught) =>
        `Carreras: <b>${runs}</b><br>Hits permitidos: <b>${hits}</b>${mix}<br>` +
        `Palabras reveladas: <b>${hits}</b><br>Dejados en base: <b>${lob}</b><br>` +
        `Atrapadas limpias: <b>${caught}</b>`,
      mixNames: { SINGLE: 'sencillos', DOUBLE: 'dobles', TRIPLE: 'triples', HOMERUN: 'jonrones' },
      soundOn: 'Sonido: sí', soundOff: 'Sonido: no',
      oneSentence: '<b>Una sola frase por ahora.</b> El banco tiene una frase, ' +
        'así que la verás tres veces por entrada. Es el banco, que es pequeño, ' +
        'no el juego repitiéndose.',
      unreviewed: '<b>Sin revisar.</b> Nada de esto lo ha firmado un hablante ' +
        'nativo — la frase, las pistas y las notas son provisionales.',
      reviewed: n => `<b>Revisado por ${n}.</b>`
    }
  };

  /* Why a wrong ball was wrong. At an English rung the bank's own note,
     which is written in English and explains. At a Spanish rung a terse
     tag naming the axis — all a player at that level needs, and it avoids
     inventing a Spanish sentence per distractor that nobody could check. */
  const AXIS_ES = {
    tense: 'tiempo equivocado',
    person: 'persona equivocada',
    number: 'número equivocado',
    gender: 'género equivocado',
    finiteness: 'no es una forma personal',
    lexical: 'palabra equivocada'
  };
  const whyWrong = ev => lang() === 'en'
    ? ev.wrongHere
    : (AXIS_ES[ev.axis] || AXIS_ES.lexical);

  /* Before the inning starts, the rung on show is the one being PICKED,
     not the one last played — otherwise the card switches to Spanish
     while the HUD chip behind it still reads Rookie. */
  const shownLevel = () => el.startVeil.hidden ? level : pendingLevel;
  const lang = () => langFor(shownLevel());
  const t = () => COPY[lang()];

  /* Static strings carry data-t; everything with one is re-rendered when
     the rung changes, including on the start card as a level is picked,
     so the switch is visible before a player commits to it. */
  function applyCopy() {
    const c = t();
    for (const node of document.querySelectorAll('[data-t]')) {
      const v = c[node.dataset.t];
      if (typeof v === 'string') node.innerHTML = v;
    }
    el.runsChip.title = c.runsTitle;
    el.pauseBtn.title = c.pause;
    el.startCaveat.innerHTML = c.oneSentence + '<br><br>' + caveat();
    el.endCaveat.innerHTML = c.oneSentence + '<br><br>' + caveat();
    renderHud();
  }

  /* ---- timers, all in one place ----------------------------------------
     A timer that outlives the state that scheduled it is the bug this
     codebase has already had three times: a tick firing into a replaced
     at-bat, an afterPitch fired and forgotten, a pitch clock left running
     behind the start card. Every setTimeout goes in here and every state
     change clears the set. */
  const timers = new Set();
  function later(fn, ms) { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; }
  function clearTimers() { for (const t of timers) clearTimeout(t); timers.clear(); }

  /* ---- the stored pace median ------------------------------------------
     Guarded at every access, same discipline as the mute key: a private
     window throws on write, cleared storage returns null, a partial write
     parses to garbage. Coming back empty is every new player's first
     inning, not an edge case.

     Wrong version, non-finite value or too few samples behind it are
     discard conditions. A different rung and an old timestamp are NOT —
     staleness has a known sign (a player who improves gets faster, so a
     stale median is too slow, which is the harsh direction) and the cap
     in the rules layer handles it. */
  function loadPace() {
    try {
      const raw = localStorage.getItem(PACE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || o.v !== 1) return null;
      if (!Number.isFinite(o.median) || o.median <= 0) return null;
      if (!Number.isFinite(o.samples) || o.samples < PACE_MIN) return null;
      return o;
    } catch (e) { return null; }
  }
  function savePace() {
    try {
      if (!pace || pace.n() < PACE_MIN) return;
      localStorage.setItem(PACE_KEY, JSON.stringify({
        v: 1, median: pace.median(), samples: pace.n(),
        rung: level, updated: Date.now()
      }));
    } catch (e) { /* private window, quota, blocked storage — play on */ }
  }

  /* ---- the ballpark, drawn once ---------------------------------------
     Static detail is built at load and never rebuilt; only ball positions
     move during play. */
  const R = (x, y, w, h, f) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"/>`;
  function drawPark() {
    let s = R(0,0,400,260,'#0E4C5C') + R(0,0,400,70,'#06222F');
    for (let i=0;i<400;i+=8) s += R(i,66,4,4,'#0E4C5C');
    for (let i=4;i<400;i+=8) s += R(i,70,4,4,'#06222F');
    s += R(0,74,400,10,'#1B5C74') + R(0,84,400,26,'#12313B');
    for (let y=86;y<108;y+=4)
      for (let x=(y%8?0:4);x<400;x+=8)
        s += R(x,y,4,4,['#1D3A46','#2b4f5c','#3a3550','#4a3a4e'][(x+y)%4]);
    s += R(0,110,400,4,'#06222F') + R(0,114,400,22,'#12313B') + R(0,114,400,4,'#1D3A46');
    for (let x=0;x<400;x+=40) s += R(x,118,3,18,'#0b242c');
    s += R(0,132,400,4,'#0b242c') + R(0,136,400,10,'#8A5A2B');
    for (let i=0;i<400;i+=28) s += R(i,146,14,114,'#0A3D24');
    for (let i=14;i<400;i+=28) s += R(i,146,14,114,'#0d4a2c');
    document.querySelector('.park').innerHTML = s;

    document.querySelector('.fielder').innerHTML =
      R(6,44,24,4,'#062a18') + R(20,2,8,4,'#8E4519') + R(18,6,12,8,'#8E4519') +
      R(22,8,4,4,'#a8632a') + R(12,12,6,4,'#F6C08A') + R(12,6,10,4,'#1D3A46') +
      R(13,10,8,6,'#F6C08A') + R(10,16,16,16,'#F4EDE0') + R(10,16,16,4,'#1D3A46') +
      R(16,20,4,8,'#F2A73B') + R(10,32,16,4,'#17375F') +
      R(11,36,6,8,'#17375F') + R(19,36,6,8,'#17375F');
  }

  function drawBases(bases) {
    const diamond = (cx, cy, half, colour) => {
      let out = '';
      for (let dy = -half; dy <= half; dy += 2) {
        const w = 2 * (half - Math.abs(dy));
        if (w > 0) out += R(cx - w/2, cy + dy, w, 2, colour);
      }
      return out;
    };
    const base = (x, y, on) => R(x-6, y-6, 12, 12, on ? '#F2A73B' : '#F4EDE0');
    el.diamond.innerHTML =
      R(0,0,104,104,'#0A3D24') + diamond(52,52,48,'#8E4519') + diamond(52,52,30,'#0A3D24') +
      base(52,10,bases[1]) + base(88,52,bases[0]) + base(16,52,bases[2]) + base(52,94,false);
    const c = t();
    const on = c.bases.filter((_, i) => bases[i]);
    el.diamond.setAttribute('aria-label', c.basesAria(on));
    el.legend.innerHTML = on.length ? c.onBase(on.join(c.and)) : c.empty;
  }

  /* ---- rendering -------------------------------------------------------- */
  function renderHud() {
    const st = inning ? inning.state() : { outs: 0, runs: 0 };
    el.outs.innerHTML = [0,1,2]
      .map(i => `<i class="out-pip${i < st.outs ? ' on' : ''}"></i>`).join('');
    el.runs.textContent = st.runs;
    el.levelChip.textContent = LEVELS[shownLevel()].name;
    const muted = isMuted(), c = t();
    el.muteBtn.setAttribute('aria-pressed', String(muted));
    el.muteBtn.innerHTML = muted ? '&#128263;' : '&#9836;';
    el.muteBtn.title = muted ? c.unmute : c.mute;
    el.pauseMute.setAttribute('aria-pressed', String(muted));
    el.pauseMute.textContent = muted ? c.soundOff : c.soundOn;
  }

  function renderSentence(revealToken) {
    const st = inning.state();
    el.sentence.innerHTML = entry.tokens.map(t => {
      if (!st.blanked.includes(t.i)) return `<span class="w">${t.form}</span>`;
      if (st.filled[t.i]) {
        const cls = revealToken === t.i ? 'slot revealed' : 'slot done';
        return `<span class="${cls}">${st.filled[t.i]}</span>`;
      }
      return `<span class="slot${t.i === st.liveToken ? ' live' : ''}">&nbsp;</span>`;
    }).join('') + '<span class="w stop">.</span>';

    /* The gloss appears only where Spanish grammar cannot separate the four
       balls — the noun slots, whose distractors are lexical. A gloss on a
       slot the morphology already settles would replace retrieval with
       translation. It is the English LEMMA, never the inflected form. */
    const g = inning.gloss();
    if (g && !st.completed) { el.gloss.textContent = t().thisGap(g); el.gloss.hidden = false; }
    else el.gloss.hidden = true;
  }

  function say(text, kind) {
    el.callout.className = 'callout' + (kind ? ' ' + kind : '');
    el.callout.innerHTML = text;
    el.callout.hidden = false;
  }
  const hush = () => { el.callout.hidden = true; };

  /* ---- the volley -------------------------------------------------------
     One shared flight window. All four are catchable for the same
     FLIGHT_MS and if none is taken the whole volley re-pitches together.
     Staggered per-ball windows would remove the cost of stalling, and the
     pace band's whole meaning rests on that cost existing. */
  const shuffle = a => {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  };

  function pitchVolley() {
    clearTimers();
    hush();
    const st = inning.state();
    if (st.completed) inning.beginSentence();
    renderSentence();

    const forms = inning.balls();
    el.air.querySelectorAll('.ball').forEach(n => n.remove());
    ballEls = forms.map((form, k) => {
      const b = document.createElement('button');
      b.className = 'ball';
      b.type = 'button';
      b.style.transitionDuration = '0ms';
      b.innerHTML = `<span class="orb"></span><span class="word">${form}</span>`;
      b.setAttribute('aria-label', form);
      b.addEventListener('click', ev => { ev.stopPropagation(); onCatch(form, b); });
      el.air.appendChild(b);
      return b;
    });

    const lanes = layoutBalls();
    void el.air.offsetHeight;                       // commit the start position
    const flight = flightFor(level);
    for (const b of ballEls) {
      b.style.transitionDuration = flight + 'ms';
      b.style.top = b.dataset.end;
    }
    volleyStart = performance.now();
    locked = false;
    later(onVolleyExpired, flight);
  }

  /* WHERE THE FOUR BALLS GO.

     Two failures to avoid, and the second is the worse one.

     A candidate whose word box leaves the viewport is an uncatchable
     ball. A candidate whose tap target OVERLAPS another's is worse than
     uncatchable: tapping it catches the wrong word, which scores an
     error the player did not make and teaches them the opposite of the
     thing the slot exists for. At 320px the four longest forms of one
     lemma need about 376px of word box between them, so they cannot
     share a row at all — no amount of nudging fixes arithmetic.

     So: one row while the words fit, two lanes when they do not. Each
     lane falls through its own band of the field and the bands do not
     meet, so two balls can share an x without ever sharing a point.

     Balls start ON SCREEN rather than above it. Starting above meant
     whether all four were in frame depended on how long the page had
     been running when you looked — which made the test that guards this
     a timing coin-flip rather than a measurement. */
  const LANE_ONE = { start: 6,  end: 92 };
  const LANE_TOP = { start: 4,  end: 46 };
  const LANE_LOW = { start: 52, end: 94 };

  function layoutBalls() {
    const M = 6;
    const W = el.air.clientWidth;
    const widths = ballEls.map(b => b.getBoundingClientRect().width);
    const needed = widths.reduce((a, w) => a + w, 0) + M * (ballEls.length + 1);
    const twoLanes = needed > W;

    const place = (group, band) => {
      const n = group.length;
      group.forEach(([b, w], k) => {
        const pct = (100 / (n + 1)) * (k + 1);
        b.style.left = pct + '%';
        b.style.top = band.start + '%';
        b.dataset.end = band.end + '%';
        b.style.marginLeft = '0px';
      });
      /* Then separate. Even tap targets that never cover each other's
         CENTRE can still overlap at the edges, and that sliver belongs to
         whichever box paints last — so a tap there catches a word the
         player was not aiming at. The decision was that an ambiguous tap
         costs nothing; a silent overlap makes it cost a wrong catch
         instead. Push apart, then clamp to the edges, and repeat because
         clamping one can re-collide the next. */
      const GAP = 2;
      const air = () => el.air.getBoundingClientRect();
      const nudge = (b, dx) => {
        b.style.marginLeft = (parseFloat(b.style.marginLeft) || 0) + dx + 'px';
      };
      for (let pass = 0; pass < 4; pass++) {
        let moved = false;
        const sorted = group.map(([b]) => b)
          .sort((x, y) => x.getBoundingClientRect().left - y.getBoundingClientRect().left);
        for (let k = 0; k + 1 < sorted.length; k++) {
          const a = sorted[k].getBoundingClientRect();
          const c = sorted[k + 1].getBoundingClientRect();
          const over = (a.right + GAP) - c.left;
          if (over > 0) { nudge(sorted[k], -over / 2); nudge(sorted[k + 1], over / 2); moved = true; }
        }
        for (const b of sorted) {
          const r = b.getBoundingClientRect(), A = air();
          if (r.right > A.right - M) { nudge(b, (A.right - M) - r.right); moved = true; }
          else if (r.left < A.left + M) { nudge(b, (A.left + M) - r.left); moved = true; }
        }
        if (!moved) break;
      }
    };

    const pairs = ballEls.map((b, i) => [b, widths[i]]);
    if (twoLanes) {
      place(pairs.slice(0, 2), LANE_TOP);
      place(pairs.slice(2), LANE_LOW);
    } else {
      place(pairs, LANE_ONE);
    }
    return twoLanes ? 2 : 1;
  }

  /* Kept for a resize mid-flight: re-place without restarting the fall. */
  function clampBalls() {
    if (!ballEls.length) return;
    const tops = ballEls.map(b => getComputedStyle(b).top);
    const durs = ballEls.map(b => b.style.transitionDuration);
    ballEls.forEach((b, i) => { b.style.transitionDuration = '0ms'; b.style.top = tops[i]; });
    layoutBalls();
    ballEls.forEach((b, i) => {
      b.style.transitionDuration = '0ms';
      b.style.top = tops[i];
      void b.offsetHeight;
      b.style.transitionDuration = durs[i];
      b.style.top = b.dataset.end;
    });
  }

  function freeze() {
    for (const b of ballEls) {
      const top = getComputedStyle(b).top;
      b.style.transitionDuration = '0ms';
      b.style.top = top;
    }
  }

  function onVolleyExpired() {
    if (locked) return;
    locked = true;
    inning.dropVolley();
    for (const b of ballEls) b.classList.add('gone');
    say(t().dropped);
    later(pitchVolley, 700);
  }

  /* ---- a catch ---------------------------------------------------------- */
  function onCatch(form, node) {
    if (locked) return;
    locked = true;
    const elapsed = performance.now() - volleyStart;
    freeze();
    const ev = inning.catchBall(form, elapsed);

    if (ev.type === 'CAUGHT') {
      node.classList.add('taken');
      for (const b of ballEls) if (b !== node) b.classList.add('gone');
      playSound('STRIKE');
      say(t().caught, 'good');
      renderSentence();
      later(afterSlot, SETTLE_MS);
      return;
    }

    node.classList.add('wrong');
    for (const b of ballEls) if (b !== node) b.classList.add('gone');

    if (ev.type === 'FOUL') {
      say(`<b>${ev.form}</b> — ${whyWrong(ev)}.<br>${t().foul(ev.of - ev.used + 1)}`, 'bad');
      later(pitchVolley, HIT_BEAT_MS);
      return;
    }

    // CONCEDE
    const c = t();
    const how = ev.cold ? c.cold : c.atPace((ev.elapsedMs / ev.paceMs).toFixed(2) + 'x');
    say(`<b>${ev.form}</b> — ${whyWrong(ev)}.<br>` +
        c.conceded(c.hit[ev.hit], ev.scored) + how, 'bad');
    drawBases(ev.bases);
    renderHud();
    later(() => {
      renderSentence(ev.token);
      say(t().wasWord(ev.answer), 'good');
      later(afterSlot, REVEAL_MS);
    }, HIT_BEAT_MS);
  }

  function afterSlot() {
    renderHud();
    if (inning.over()) return showEnd();
    const st = inning.state();
    if (st.completed) {
      renderSentence();
      el.gloss.hidden = true;
      say(t().sentenceDone(st.outs), 'good');
      /* applyPendingLevel restarts the inning, which pitches for itself.
         Calling pitchVolley() after it as well threw a second volley on
         top of the first and reset the flight clock under it. */
      later(() => { if (!applyPendingLevel()) pitchVolley(); }, 1400);
      return;
    }
    pitchVolley();
  }

  /* A level change takes effect at the next sentence, the same seam the
     timed mode uses. It restarts the inning, because sentence length is
     the rung and the sentence is already half built. */
  function applyPendingLevel() {
    if (pendingLevel === level) return false;
    level = pendingLevel;
    startInning();
    return true;
  }

  /* ---- start, pause, end ------------------------------------------------- */
  function startInning() {
    clearTimers();
    savePace();
    stored = loadPace();
    pace = makePace();
    inning = createInning({
      entry, rungIndex: level, pace,
      stored: stored ? stored.median : null, shuffle
    });
    drawBases([false, false, false]);
    applyCopy();
    renderSentence();
    el.startVeil.hidden = true;
    el.endVeil.hidden = true;
    el.pauseVeil.hidden = true;
    pitchVolley();
  }

  function showEnd() {
    clearTimers();
    locked = true;
    savePace();
    const st = inning.state();
    const hits = st.log.filter(e => e.type === 'CONCEDE');
    const mix = {};
    for (const h of hits) mix[h.hit] = (mix[h.hit] || 0) + 1;
    const lob = st.bases.filter(Boolean).length;
    const c = t();
    el.endTitle.textContent = st.runs === 0 ? c.endShutout : c.endTitle;
    const mixStr = hits.length
      ? ' — ' + Object.keys(mix).map(k => `${mix[k]} ${c.mixNames[k]}`).join(', ') : '';
    el.tally.innerHTML = c.tally(st.runs, hits.length, mixStr, lob,
      st.log.filter(e => e.type === 'CAUGHT').length);
    el.endVeil.hidden = false;
    el.againBtn.focus();
  }

  function showPause() {
    if (!inning || el.endVeil.hidden === false) return;
    clearTimers();
    locked = true;
    freeze();
    el.pauseVeil.hidden = false;
    el.resumeBtn.focus();
  }
  function resume() {
    el.pauseVeil.hidden = true;
    if (pendingLevel !== level) { level = pendingLevel; startInning(); return; }
    pitchVolley();
  }

  /* ---- level pickers ----------------------------------------------------- */
  function buildLevels(host) {
    host.innerHTML = '';
    for (const r of playable) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${r.name} · ${r.slots}`;
      b.setAttribute('aria-pressed', String(r.i === pendingLevel));
      b.addEventListener('click', () => {
        pendingLevel = r.i;
        buildLevels(el.levels); buildLevels(el.pauseLevels);
        applyCopy();
      });
      host.appendChild(b);
    }
  }

  /* ---- the provisional notice -------------------------------------------
     Read off the entry rather than typed, so it cannot say "unreviewed"
     after somebody records a review. */
  function caveat() {
    const signed = entry.adviser && entry.adviser.verdict;
    return signed ? t().reviewed(entry.adviser.name) : t().unreviewed;
  }

  /* ---- wiring ------------------------------------------------------------ */
  drawPark();
  drawBases([false, false, false]);
  buildLevels(el.levels);
  buildLevels(el.pauseLevels);
  applyCopy();

  el.goBtn.addEventListener('click', () => {
    unlockAudio();                       // the gesture that lets audio play at all
    level = pendingLevel;
    startInning();
  });
  el.pauseBtn.addEventListener('click', showPause);
  el.resumeBtn.addEventListener('click', resume);
  el.againBtn.addEventListener('click', startInning);
  el.backBtn.addEventListener('click', () => {
    clearTimers(); locked = true;
    el.endVeil.hidden = true; el.startVeil.hidden = false; el.goBtn.focus();
  });
  el.quitBtn.addEventListener('click', () => {
    clearTimers(); locked = true; savePace();
    el.pauseVeil.hidden = true; el.startVeil.hidden = false; el.goBtn.focus();
  });
  const toggleMute = () => { setMuted(!isMuted()); renderHud(); };
  el.muteBtn.addEventListener('click', toggleMute);
  el.pauseMute.addEventListener('click', toggleMute);

  /* A tap that hit no ball costs nothing: not a wrong catch, no grace
     spent, the volley runs on. Keeping the input model out of the
     difficulty is what stops the pace band measuring finger accuracy
     alongside retrieval. */
  el.air.addEventListener('click', ev => {
    if (ev.target.closest('.ball')) return;
    if (inning) inning.misTap();
  });

  addEventListener('keydown', ev => {
    if (ev.key === 'm' || ev.key === 'M') toggleMute();
    const playing = el.startVeil.hidden && el.endVeil.hidden && el.pauseVeil.hidden;
    if (ev.key === 'Escape' && playing) showPause();
  });
  addEventListener('resize', () => { if (ballEls.length) clampBalls(); });

  window.__outfield = { state: () => inning && inning.state(), pace: () => pace,
                       PACE_KEY, lang, flight: () => flightFor(level), level: () => level };
})();
