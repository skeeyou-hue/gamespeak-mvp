# GameSpeak ⚾

A single-page Spanish vocabulary quiz scored like a half-inning of baseball.
Plain HTML, CSS, and JavaScript — no frameworks, no build step, no dependencies.

## Run it

Open `index.html` in a browser. That's it.

(Or serve it locally: `python3 -m http.server 8000`, then visit
<http://localhost:8000>.)

## How the game works

- You see one Spanish word and four English choices.
- **Right answer** → you reach base, according to that word's difficulty
  tier: `WALK` (easiest), `SINGLE`, `DOUBLE`, `TRIPLE`, or `HOME RUN`.
- **Runners advance** by real baseball rules. A walk only pushes runners who
  are *forced*; a hit moves every runner as far as the batter goes (1 base on
  a single, 2 on a double, 3 on a triple, 4 on a homer). Anyone pushed past
  third scores.
- **Wrong answer** → an *out*. Runners stay where they are.
- **Three outs** → the inning ends and you get a box score: runs, the
  breakdown by hit type, total bases, left on base, batting average, and the
  words you missed.
- Get through the whole word list without three outs and you've batted
  through the lineup.

During play the HUD is deliberately minimal: runs and outs in one top
corner, the base diamond in the other, and nothing else. The hit-type
breakdown belongs to the box score at the end of the inning, not the screen
during an at-bat.

The base state shows up in two places: the HUD diamond, and runners out on
the field itself. The HUD diamond is the one that's always visible — on a
narrow screen the quiz card covers the middle of the infield, and first and
third sit off the edges.

## Files

| File | What's in it |
| --- | --- |
| `index.html` | Page structure: scoreboard, quiz screen, summary screen |
| `style.css`  | All styling; colors are CSS variables at the top |
| — | The ballpark behind the game is an inline SVG at the top of `index.html`: golden hour in San Juan, home of the fictional **Cotorras de San Juan** (teal `#0E4C5C`, gold `#F2A73B`, cream `#F4EDE0`). It is decorative only — `aria-hidden`, `pointer-events: none`. The nine fielders in it are static art with no fielding logic behind them. |
| `app.js`     | The word list, base-running rules, and all game logic |
| `test.js`    | Browser tests (see below) |

## Editing the vocabulary

The whole word list is the `VOCAB` array near the top of `app.js`:

```js
{ es: 'el lanzador', en: 'the pitcher', tag: 'SINGLE' },
```

Add, remove, or retag entries freely — the wrong-answer choices are drawn
from the other words in the list, so nothing else needs updating. Keep each
English meaning unique, or a question could offer the same answer twice.

## Running the tests

The game itself has no dependencies. The tests drive it in a real browser,
so they need Playwright:

```bash
npm install -D playwright
npx playwright install chromium
node test.js
```

`test.js` covers the base-running rules case by case — every combination of
runners for a walk, single, double, triple, and home run — plus the inning
and box-score behavior.
