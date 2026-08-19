# GameSpeak ⚾

A single-page Spanish vocabulary quiz scored like a half-inning of baseball.
Plain HTML, CSS, and JavaScript — no frameworks, no build step, no dependencies.

## Run it

Open `index.html` in a browser. That's it.

(Or serve it locally: `python3 -m http.server 8000`, then visit
<http://localhost:8000>.)

## How the game works

- You see one Spanish word and four English choices.
- **Right answer** → a *hit*, credited to that word's difficulty tier:
  `WALK` (easiest), `SINGLE`, or `DOUBLE` (hardest).
- **Wrong answer** → an *out*.
- **Three outs** → the inning ends and you get a summary with your hits,
  total bases, batting average, and the words you missed.
- Get through all 20 words without three outs and you've batted through
  the lineup.

## Files

| File | What's in it |
| --- | --- |
| `index.html` | Page structure: scoreboard, quiz screen, summary screen |
| `style.css`  | All styling; colors are CSS variables at the top |
| `app.js`     | The word list and all game logic |

## Editing the vocabulary

The whole word list is the `VOCAB` array near the top of `app.js`:

```js
{ es: 'el lanzador', en: 'the pitcher', tag: 'SINGLE' },
```

Add, remove, or retag entries freely — the wrong-answer choices are drawn
from the other words in the list, so nothing else needs updating.
