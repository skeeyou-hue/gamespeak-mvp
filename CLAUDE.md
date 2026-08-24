# GameSpeak — working conventions

Spanish vocabulary scored like baseball. Two modes, no framework, no build
step, no runtime dependencies. Open `index.html` or `timed.html` in a
browser and it runs.

These are the conventions this codebase has earned, most of them by getting
something wrong first. The reasoning is kept with each rule, because a
convention whose reason has been forgotten is just a habit.

---

## Layout

```
rules.js      SHARED. VOCAB, shuffle, base-running. Both modes read it.
scene.js      SHARED. The ballpark SVG, injected into either mode.
scene.css     SHARED. The scene layer, the runners, the signage breakpoint.

index.html  app.js  style.css  test.js               Classic
timed.html  timed.js  timed-ui.js  timed.css         Tiered Timed Pitch
            timed-test.js  timed-ui-test.js

sim-innings.js   distribution questions, run with `node sim-innings.js`
docs/            reference material, not code
```

Test suites: `node test.js` (Classic, needs Playwright), `node timed-test.js`
(rules, pure Node), `node timed-ui-test.js` (Timed, needs Playwright).
Run all three before committing anything.

---

## Do not touch these without asking

Everything below this section is a convention: reasoning you are expected to
apply, argue with, and occasionally set aside with a reason. This section is
not that. These are rules. They hold until the person you are working for
says otherwise, in the message you are working from — not inferred from an
earlier approval, not implied by the change being small, not licensed by the
fact that touching one would make the current task easier.

**1. Tier assignments.** The `tag` on any of the 100 entries in `rules.js`,
and `TIMED_TIERS`. A tier is a word's clock and its consequence at once — in
Timed a mistagged word is both the wrong difficulty and, under the easy-out
rule, an instant out instead of a strike. Retiering is also the change most
likely to look like tidying: `el error` reads easy and is tagged `WALK`, and
that is a known open question, not an invitation.

**2. Scene files.** `scene.js`, `scene.css`, and the SVG inside them. They
are read by both modes, they are the only thing standing between the player
and a cropped diamond, and their tests measure geometry that a plausible-
looking edit breaks silently. Nine fielders were once entirely off screen
with every test green.

**3. Timing constants.** `PITCH_WINDUP_MS`, `PITCH_FLIGHT_MS`, `PLATE_AT`,
`CONTACT_WINDOW_MS`, `SWING_LEAD_MS`, `READY_READ_MS`, `READY_CUE_MS`,
`SPEED_BANDS`, and anything added later that sets a pitch's clock — as of
this writing `ATTEMPT_FLIGHT_MS` and `ATTEMPT_WINDOW_MS` on the bonus-swing
branch, which are not in this tree yet. These are coupled to
each other and the couplings are not local: speeding the flight from 2400ms
to 2000ms shrank the contact window and moved the fixed swing lead from 0.075
of the flight to 0.09, with nobody editing either. Any one of them is a
difficulty change wearing an implementation hat.

Two things this does not prohibit. Reading them, measuring them, and
simulating what a different value would do is always in scope — that is how
you make the case for changing one. And a rule can be lifted in the same
breath it is invoked: "yes, change the window" is enough. What is not enough
is the absence of an objection.

---

## Shared files are shared

`rules.js`, `scene.js` and `scene.css` are read by both modes. A change to
any of them is a change to Classic, whether or not Classic was the subject.

Say so before landing it. "This also changes Classic" is a decision the
person you are working for gets to make, not a side effect you mention
afterwards. When a change to a shared file is really only wanted in one
mode, that is a signal the thing belongs in that mode's own file instead.

## The rules layer stays clean

`timed.js` is rules. `timed-ui.js` is flow and DOM. Rules functions are pure,
take their randomness as a parameter (`roll`, `direction`) so they can be
driven deterministically, and never touch the document.

The payoff is that `timed-test.js` runs in plain Node with no browser, and
that a simulation can call the real rules rather than a model of them.

Presentation problems get presentation fixes. If a rule change is being
asked for to make something *read* better, that is a UI change wearing a
rules hat.

## Derive test edges from constants, never type them

A hand-written `0.70` stops testing the edge the moment the constant moves,
and it does it silently — the assertion still passes, it just no longer
means anything.

```js
const OPENS = T.PLATE_AT - T.contactWindowFraction();   // yes
for (const [p, verdict] of [[0.70, 'ON_TIME'], ...])    // no
```

This has bitten twice. Both times the test kept passing while the thing it
was meant to protect had moved.

## Timing constants are milliseconds unless they are genuinely a proportion

A reaction window is a property of the human, not the pitch: 240ms is 240ms
whether the ball takes two seconds to arrive or one.

The contact window was a fraction of the flight, which tied two levers to one
knob. Speeding the pitch from 2400ms to 2000ms shrank the window from 288ms
to 240ms with nobody editing it, and moved the fixed 180ms swing lead from
0.075 of the flight to 0.09 — the gap between them doubled as a side effect
of a speed change nobody connected to difficulty.

Store the millisecond budget, derive the fraction where a fraction is needed.
If two constants must hold a relationship, assert the relationship at every
value the other constant can take, not just at today's.

## Simulate distribution questions, do not guess at them

"How often does X happen" is almost never a playtest question. A playtest
tells you how something feels; it is a sample size of one and it cannot tell
you whether the thing you just saw was a 2% tail or a 20% outcome.

`sim-innings.js` drives the real rule layer — `applyPitch`, the real buckets,
the real deck through the real shuffle — and sweeps the only genuinely
unknown input, the player. Extend it rather than reasoning about the shape of
a distribution in prose.

When a proposed constant is checked against a simulation and fails, say so
and propose what the data supports. Do not build to a number on anyone's
say-so once the data disagrees with it.

**A type check verifies the code does what you said. A simulation verifies
you should have said it.** No type system would have caught any of the five
findings below. In every one the code was correct and the belief about it
was wrong, and each came out the other way round from the intuition:

- Three-answer innings were assumed a real risk of the easy-out rule. They
  are a 0.7% tail at 60% accuracy and round to zero above it.
- The easy tier was 42% of the deck and 60-67% of the outs. Nobody would
  have guessed the second number from the first.
- The inning cap was proposed at 15, sized off the median. A cap at the
  median truncates half the distribution by construction; the sweep
  supported 40.
- The bonus was assumed to fail because a home run clears the bases. Forcing
  every hit to one tier showed chasing home runs is the *best* strategy at
  every accuracy band. The real cause was that a bonus at-bat is a worse
  home-run machine than an ordinary one — 70.0% against 97.9% at 85%.
- Accepting the bonus past the extension ceiling looks like a bargain
  locally: 0.29 outs given up per home run won. It costs 3.64 runs an inning
  at 85%, because the at-bat it spends comes out of the pool the cap bounds.

Two of the five contradicted something said out loud rather than merely
assumed — the cap at 15, proposed by the person asking for the work, and the
bases-clearing explanation, asserted by the person doing it. Neither was a
careless claim. Being confident in a claim is not evidence about the claim,
and the person who is most sure is not exempt from running the sweep.

## Never invent content to satisfy a test or a spec

If a bank is specified as four phrases and only three of them have a real
trigger, ship three and say why. `¡Bola!` sat in the umpire bank for several
commits as a defined-but-unreachable call. That is a dead branch dressed up
as content, and a test asserting it was unreachable was guarding a mistake
rather than a behaviour.

The same applies to vocabulary: a word nobody can vouch for does not go in
the list to round a count up to fifty. Say the gap exists.

## Show results before finalizing

Anything with a visual or subjective outcome gets shown before it is treated
as done: a screenshot, a filmstrip at real intervals, the actual word list,
the measured numbers.

A passing test suite does not prove a thing renders. It proved nothing when
nine fielders were entirely off screen on a phone and every test was green,
because the edge check accepted a fielder that had left the viewport
altogether.

## Tests for every new mechanic, and test the invariant

Every mechanic gets coverage in the suite that owns it, following the
patterns already there: rules in `timed-test.js`, flow and DOM in the UI
suites, phrase banks tested for size, both languages, distinctness, and no
overlap with the other banks.

Prefer the invariant over the value. `assert(press > contact * 5)` survives a
restyle; `assert(height === 34)` does not. Assert what must remain true, and
name the failure the test exists to catch.

Where a test measures the page, measure the right thing. `isVisible()` is
true for an element sitting under an opaque overlay; `elementFromPoint` is
the question actually being asked.

## Commits

One idea per commit. Two unrelated fixes are two commits even when they were
asked for in the same breath.

The message says what changed, what it costs, and what was found on the way —
including anything discovered to be wrong that nobody asked about. Numbers,
not adjectives.
