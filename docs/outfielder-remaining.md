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

## 4. ~~Two things the spec does not yet say~~ — SETTLED

**4a. How a ball is caught. DECIDED.** Tap the ball directly, generous
hit target. An ambiguous mis-tap — between two balls, or on nothing —
catches nothing and costs nothing: it is not a wrong catch, it does not
touch the grace, and it does not end the volley. Only the flight running
out drops the volley.

That last clause matters more than it looks. A mis-tap that counted as a
wrong catch would make the input model part of the difficulty, and the
pace band would then be measuring finger accuracy alongside retrieval.
Costing nothing keeps the band measuring the one thing it is for.

**4b. Whether the four balls share one flight. DECIDED: one shared
window.** All four are catchable for the same `FLIGHT_MS`, and if none
is taken the whole volley re-pitches together. Every simulation here
assumed exactly this.

Staggered per-ball windows were rejected for a specific reason rather
than a stylistic one: staggering removes the cost of stalling. With one
shared window, taking longer than the flight costs a whole re-pitch,
which is what makes deliberation a trade rather than a free action — and
the strand strategy, the pace band's entire meaning, is built on that
trade existing. With per-ball windows a player can simply wait for the
next ball at no cost, and "slow down and finish clean" stops being a
decision.

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
- **Layout at seven slots — MEASURED, AND IT DOES NOT FIT AT 320px.**
  See section 8.

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

## 7. The 320px problem — measured, fixed, and 320 x 568 dropped

A seven-slot Major League line was measured against the real styles,
using a width probe built from the longest real forms in `rules.js`
VOCAB and the worked entry — a ruler, not a sentence, making no
grammatical claim. `?probe` on the mockup renders it.

**What it found.** At a 92px slot min-width, seven slots wrapped to five
rows and took the sentence strip from 154px to 208px, while the ball
area was already on its 200px floor. 320 x 640 overflowed by 19px and
320 x 568 by 91px.

**The fix, and why it is the whole of the fix.** Slot min-width is now
**72px**. That saves one wrapped row, which brings the seven-slot strip
back to 154px — the same height five slots took before — and 320 x 640
fits with 234px of ball area and four of four candidates on screen.

Below 72px nothing further happens. The cost is row COUNT, and no
further narrowing removes another row, so 64px and 56px measure
identically to 72px. There is no reason to go smaller and no gain hiding
below. It remains a min-width, so a long word still expands its own
slot.

| viewport | before | after |
|---|---|---|
| 320 x 640 | overflows 19px | **fits**, air 234px |
| 320 x 568 | overflows 91px | overflows 38px — **not a target** |
| 390 x 844 | fits | fits, air 490px |
| 1024 x 700 | fits | fits, air 453px |

### 320 x 568 IS DROPPED. Do not re-derive this at UI time.

320 x 568 is the first-generation iPhone SE, a 2016 phone. It is **not a
support target** and nothing should be rebuilt for it.

This is recorded because the arithmetic looks like an open problem and
will invite someone to solve it. It is not open — it was decided.

The budget at 320 x 568 is: HUD 79px (it wraps to two rows at this
width) plus basepath strip 145px plus deck 168px at its most aggressive
typography, leaving 176px for a ball area whose floor is 200px. Twenty-
four short, and **none of the three is typography** — which is exactly
why it reads as a layout bug worth chasing.

The three structural fixes that would close it, all of them rejected:

- **Shrink or overlay the 104px basepath diamond.** The runners are the
  scoreboard for a mode whose whole point is that errors put people on
  base. Shrinking them for a phone nobody targets is the wrong trade.
- **Stop the HUD wrapping at 320.** The wrap is what stopped the base
  diamond going off screen at 320-412px in the timed mode. Undoing it
  reintroduces a regression that has already been fixed once.
- **Lower the ball area's 200px floor.** Balls need room to be
  distinguishable and, now that catching is a direct tap, room to be a
  generous hit target. This trades against the input model.

Each costs something real on phones that ARE targets, to buy a phone
that is not. 390px and up is fine at every rung, with four of four
candidates on screen, nothing overlapping the sentence, and the live
slot reachable by `elementFromPoint` at every viewport tested.

---

## 8. The constants, which need a playtest and not a sim

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
| 4 | Catch input + shared flight | — | **settled** |
| 5 | UI | 1, 2, 3, 4 | after those |
| 6 | Tests | 1–3, then 5 | alongside |
| 7 | 320px layout | — | **done** — 72px slot, 320x568 dropped |
| 8 | Constants | 5 + content | last, by playtest |

Items 1, 2, 3 and 4 are all unblocked today. Item 0 is unblocked today
and has the longest lead, so it is the one to start even though it is the
one that produces no code.
