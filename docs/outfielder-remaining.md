# Outfielder — what is unbuilt between the mockup and a playable inning

Ordered. Each item says what it needs before it can start. Nothing here
needs another simulation; where a number is still open it is marked as
needing a **playtest**, which is a different thing.

The design is settled: grace 1, reveal on exhaust, pace-relative hit band
with persistence, one bank serving every rung, per-slot lemma gloss on
lexical slots only. What remains is content and code.

---

## 0. The corpus — the long pole, and it blocks almost everything

Nothing is playable without sentences. This is the only item whose lead
time is measured in weeks rather than days, and it is the one to start
first even though it is the one that cannot be coded.

**Depends on:** nothing further. The schema, the gloss policy, the rung
decision and the worked example are all settled, so an author can be
briefed today from `docs/sentence-entry.js`.

**What it is:**

1. **Source the sentences.** Real sources only. Each entry records where
   it came from and when.
2. **Author the token morphology** — every content token, not just the
   blanked ones, because one bank serves every rung.
3. **Author the distractor sets** — four balls per slot, each with its
   perturbation axis and the reason it is wrong *in that slot*, plus the
   blocked list.
4. **Adviser sign-off**, per sentence, on all four questions in
   `docs/sentence-entry.js`.

**How many.** A half-inning is three sentences. Repeating inside a
session is the thing to avoid, so the floor is well above three — but
that number is a judgement about how a session feels, not a distribution,
so it is a **playtest** question and is deliberately not guessed here.

**The constraint the worked example turned up.** A sentence's rung
ceiling is a property of the sentence: content tokens, minus one for
every slot whose disambiguating token lies to its *right*. The worked
entry has 9 content tokens and 3 such pairs — `El`/`bateador`,
`un`/`doble`, and the two finite verbs that anchor each other's tense —
so it carries **6 slots and cannot serve Major League at all.** A
sentence needs roughly 12 tokens to reach 7 slots. Authors have to be
told this up front or half the bank will top out at Triple-A.

---

## 1. Bank file and its validator — buildable now, with no content

The first thing that should exist in code, because it is what an author
delivers into and it can be written and tested against the one worked
entry that already exists.

**Depends on:** nothing. `docs/sentence-entry.js` is the schema.

- `outfield-bank.js` — the entries, in the worked-example shape.
- A validator, run in the test suite, asserting per entry: exactly four
  balls a slot, no duplicate forms in a slot, the answer matches its
  token's form, every slot's `requires` satisfiable under left-to-right
  filling, a gloss present on every slot with a lexical distractor and
  absent on every slot without one, and the computed slot ceiling
  recorded so a rung can never be handed a sentence that cannot carry it.

Writing this before the content arrives means a bad entry is caught on
delivery rather than in play.

---

## 2. The rules layer — buildable now

`outfield.js` today is a *simulation* that models the mechanic. The game
needs the same rules as a pure module, in the shape `timed.js` already
establishes: no DOM, randomness taken as a parameter, so the tests run in
plain Node.

**Depends on:** 1, for the slot-selection functions to have something to
select from.

- Slot selection for a rung: lowest morphological density first, which is
  what makes the gloss policy double as the difficulty ladder — low rungs
  get the glossed noun slots, each rung up adds a bare morphological one.
- The slot state machine: live slot, wrong catch, foul inside grace,
  concede, reveal, advance.
- The pace median: rolling window, `PACE_MIN` before it engages, built
  from all catches.
- Verdict: `hitForPace`, and `SINGLE` while cold.
- Runners: `advanceOnHit` and `HIT_ADVANCE`, reused from `timed.js`
  unchanged.

Most of the logic exists inside `outfield.js`'s `halfInning`. It needs
lifting out, not inventing.

---

## 3. The pace store — buildable now, small and independent

**Depends on:** nothing.

`localStorage`, every access in its own `try/catch`, same discipline as
the mute key. Shape `{ v, median, samples, rung, updated }`. Written
after a half-inning when the window holds at least `PACE_MIN` real
samples. Discard on wrong version, non-finite value, or too few samples.
**Do not** discard for a different rung or an old timestamp — cap
instead. Never seed the window with copies of the stored value; hold it
beside the window and drop it once the window is warm. While cold, no
verdict derived from it may exceed `DOUBLE`.

It must play correctly when the read comes back empty, which is every new
player's first inning rather than an edge case.

---

## 4. Two things the spec does not yet say, and the UI cannot be built without

These are decisions, not work. Both are cheap to settle and both block
item 5.

**4a. How a ball is caught.** The spec says "you catch the one" and never
says how. Tap the ball on a phone, click on desktop, is the obvious
answer, but it decides hit-target size, whether a mis-tap between two
balls counts as a catch or as nothing, and whether there is a keyboard
path. The mockup shows four static candidates and dodges the question.

**4b. Whether the four balls share one flight.** "Four balls in the air
at once" plus "letting balls drop costs time, not outs" reads as one
shared window: four arrive, you take one, and if you take none the whole
volley re-pitches. The simulation assumes exactly that. It should be said
out loud before it is animated, because the alternative — staggered
arrivals, each ball its own window — is a different game and a different
`FLIGHT_MS`.

---

## 5. The UI — the largest build, and the one that needs everything else

**Depends on:** 1, 2, 3, 4a, 4b.

`outfield.html`, `outfield-ui.js`, `outfield.css`. Standalone, no home
screen, no mode switcher, per the standing instruction.

- Ball flight: four candidates over one shared window, positioned so no
  word box leaves the viewport. The mockup's clamp is the starting point
  and the test that four of four stay on screen at 320 / 390 / 1024 goes
  with it.
- The sentence strip: filled slots, the live slot, the ones still to
  come, and the per-slot gloss appearing only on glossed slots.
- The reveal: grace exhausted, the correct word landing in the slot,
  legibly and long enough to read. `REVEAL_MS` is proposed at 1200 and is
  a **playtest** number — it is the teaching moment, and too short makes
  the whole grace mechanic pointless.
- Basepaths and the HUD: outs as completed sentences, runs, level, mute.
- Level select on the start screen, pause veil with level change and
  mute, matching the seam the timed mode already uses.
- **Layout at seven slots.** A Major League sentence is mostly blanks and
  is long. Nothing has checked that it fits a 320px screen without the
  sentence strip eating the ball area. Measure it, do not assume it.

**Audio needs no work.** A correct catch plays the existing `STRIKE`
sting from `audio.js`, which is a call, not a change. `audio.js` is
shared, so anything added there would reach Classic — nothing is.

---

## 6. Tests

**Depends on:** 1, 2, 3 for the rules suite; 5 for the UI suite.

- `outfield-test.js` — pure Node. Slot selection, the grace/reveal state
  machine, the pace median and its warm-up, verdicts at the band edges
  read from `PACE_BANDS` rather than typed, runner advancement, and the
  bank validator over every entry.
- `outfield-ui-test.js` — Playwright. Four of four candidates on screen
  at three widths, the live slot reachable by `elementFromPoint` rather
  than `isVisible`, the gloss present exactly on glossed slots, the
  reveal actually rendering the correct word, no console errors.

Assert the invariant, not the value: the band edges come from the
constants, and a test that types `0.50` stops testing the edge the moment
the constant moves.

---

## 7. The constants, which need a playtest and not a sim

`FLIGHT_MS` 4000, `SETTLE_MS` 600, `HIT_BEAT_MS` 1500, `REVEAL_MS` 1200.
None are in the tree and none have been checked against a human reading
a real sentence with four real candidates. The simulation sweeps showed
`FLIGHT_MS` is a pacing knob rather than a difficulty one, which means it
should be set by how the screen feels, and that is a playtest.

**Depends on:** 5 and real content.

---

## The order, condensed

| # | Item | Blocked by | Can start |
|---|------|-----------|-----------|
| 0 | Corpus + adviser | nothing | **now, and first** |
| 1 | Bank file + validator | nothing | now |
| 2 | Rules layer | 1 | now |
| 3 | Pace store | nothing | now |
| 4 | Catch input + shared flight | nothing — decisions | now |
| 5 | UI | 1, 2, 3, 4 | after those |
| 6 | Tests | 1–3, then 5 | alongside |
| 7 | Constants | 5 + content | last, by playtest |

Items 1, 2, 3 and 4 are all unblocked today. Item 0 is unblocked today
and has the longest lead, so it is the one to start even though it is the
one that produces no code.
