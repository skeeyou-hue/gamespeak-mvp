/* =========================================================================
   AUDIO UNLOCK — shared by both modes

   No audio ships yet. This exists so that when it does, it works on the
   devices most likely to be handed to a tester.

   Mobile browsers refuse to start audio outside a real user gesture. A
   context created on page load is born 'suspended' and every later play()
   is silently dropped — no error, no console warning, nothing to debug. On
   iOS in particular a context can even report 'running' and still produce
   silence until a buffer has actually been played inside the gesture that
   unlocked it. The failure therefore does not look like "audio was never
   unlocked", it looks like "audio is broken", and it looks that way on
   every iOS device at once.

   So the start button does it. That press is the only guaranteed gesture
   in the session, and it happens before anything could want to make a
   sound. Wiring it now costs one function; wiring it after sound lands
   costs a round of confused bug reports first.

   Nothing here makes a noise. It creates one context, resumes it, and
   plays a single silent buffer.
   ========================================================================= */

// One context for the page. Creating a second one per press would leak them
// — browsers cap how many a document may hold, and hitting that cap is its
// own silent failure.
let audioCtx    = null;
let audioOpened = false;   // a gesture has been through unlockAudio()

function audioCtor() {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

// Whether this browser could play audio at all. Not the same question as
// whether it has been unlocked: a browser with no Web Audio at all is not a
// bug to report, it is a device to skip the sound on.
function audioSupported() { return audioCtor() !== null; }

/* Call from inside a real user gesture — a click or a key press — and from
   nowhere else. Returns the context, or null where there is nothing to
   unlock. Safe to call more than once: the second call resumes the same
   context rather than building another. */
function unlockAudio() {
  const Ctor = audioCtor();
  if (!Ctor) return null;

  try {
    if (!audioCtx) audioCtx = new Ctor();
  } catch (err) {
    return null;               // a device that will not give us one at all
  }

  // Suspended is the state a context is born in when there has been no
  // gesture. resume() is what a gesture buys.
  if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
    const resumed = audioCtx.resume();
    if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
  }

  // The iOS half. A context can be 'running' and still silent until a
  // buffer has played through it inside the gesture, so play one — a single
  // frame of silence, which is inaudible on every device and satisfies the
  // ones that need it.
  try {
    const buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(0);
  } catch (err) {
    // An unusable buffer path is not a reason to fail the press. The
    // context is still resumed, which is most of the unlock.
  }

  audioOpened = true;
  return audioCtx;
}

// For tests and for whatever plays the first sound: has a gesture been
// through here, and what does the context think its state is?
function audioStatus() {
  return {
    supported: audioSupported(),
    opened:    audioOpened,
    state:     audioCtx ? audioCtx.state : null,
    // Proof that repeated presses share one context rather than stacking up.
    context:   audioCtx,
    // Sound is not observable from a test runner, so what a sound DID is:
    // how many have started and which was last.
    played:    played,
    last:      lastPlayed,
    muted:     muted
  };
}

/* =========================================================================
   THE SOUNDS

   Synthesised, not sampled. There are no audio files in this repo and no
   asset pipeline to add them to, so every sound here is built out of
   oscillators and noise at play time. That is a real constraint with a real
   consequence, stated plainly: these are STINGS, not a recorded umpire. The
   phrase is already on screen — ¡Strike!, ¡Out!, ¡Safe! — and the sound is
   punctuation under it, in the register of a ballpark organ. A spoken
   umpire needs recordings, and recordings need licensing, hosting and a
   loading path that can fail; none of that exists yet.

   NOTHING HERE MAY GATE GAMEPLAY. Every entry point returns a boolean and
   swallows its own errors: no context, a suspended context, a browser that
   refuses an oscillator, an unknown sound name — all of them return false
   and the pitch carries on in silence. A call site that checked the return
   value and did something about it would be the bug this rule exists to
   prevent, so no call site does.
   ========================================================================= */

let played  = 0;      // how many sounds have actually been started
let lastPlayed = null;

/* Muted is a property of the shared layer rather than of either mode, so a
   player who silences the game has silenced all of it. It is off by
   default: the sounds are tied to outcomes the player caused, and a game
   that starts silent teaches nobody that it has a voice. The control is on
   the pause veil, which is the one seam with no clock running.

   Muting does NOT close or suspend the context. The unlock is a one-time
   gesture and throwing it away would mean needing another one to come back,
   which a pause screen cannot ask for. Silence here is a decision not to
   start a sound, nothing more. */
let muted = false;

function setMuted(on) { muted = !!on; return muted; }
function isMuted() { return muted; }

// A pitched note with an attack-decay envelope. Scheduled rather than
// played immediately, so a two-note figure is one function call.
function tone(ctx, at, { freq, endFreq, dur, type = 'triangle', peak = 0.2 }) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, at + dur);
  // A hard 0 cannot be reached by an exponential ramp, hence the floor.
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

// Filtered noise. The crack of a bat is a transient, not a pitch: a very
// short burst of broadband noise with almost no decay time.
function noise(ctx, at, { dur, peak = 0.5, hz = 2200, q = 0.7 }) {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data   = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // Shaped on the way in so the burst is loudest at its own front edge.
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 2.5);
  }
  const src    = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain   = ctx.createGain();
  src.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(hz, at);
  filter.Q.setValueAtTime(q, at);
  gain.gain.setValueAtTime(peak, at);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(at);
}

/* One entry per sound. Keys are the umpire call names from timed.js and
   CRACK — but this file deliberately does not import that bank: audio.js is
   shared with Classic, which has no umpire, and a shared file that knows
   one mode's rules is a shared file waiting to break the other. The mapping
   from a call to a name is the caller's job. */
const SOUNDS = {
  // Clipped, mid, unresolved. A strike is an interruption.
  STRIKE: (ctx, t) => {
    tone(ctx, t, { freq: 392, dur: 0.10, type: 'square', peak: 0.13 });
  },
  // Down a fourth, darker, with a little weight under it.
  OUT: (ctx, t) => {
    tone(ctx, t, { freq: 330, endFreq: 220, dur: 0.26, type: 'sawtooth', peak: 0.12 });
    tone(ctx, t + 0.02, { freq: 110, dur: 0.22, type: 'triangle', peak: 0.10 });
  },
  // Up a fifth and open. The only call in the bank that is good news.
  SAFE: (ctx, t) => {
    tone(ctx, t, { freq: 523.25, dur: 0.13, peak: 0.15 });
    tone(ctx, t + 0.085, { freq: 783.99, dur: 0.22, peak: 0.15 });
  },
  // Wood. A transient with a short pitched body under it, nothing more.
  CRACK: (ctx, t) => {
    noise(ctx, t, { dur: 0.045, peak: 0.55, hz: 2400, q: 0.6 });
    tone(ctx, t, { freq: 240, endFreq: 90, dur: 0.09, type: 'triangle', peak: 0.16 });
  }
};

/* Play one. Returns whether a sound was actually started, for tests and for
   nothing else — no caller may branch on it. */
function playSound(name) {
  const make = SOUNDS[name];
  if (!make) return false;                    // unknown name is not a crash
  if (muted) return false;                    // asked for silence, given silence
  if (!audioCtx || !audioOpened) return false; // never unlocked: stay silent
  if (audioCtx.state !== 'running') return false;
  try {
    make(audioCtx, audioCtx.currentTime);
  } catch (err) {
    return false;                             // a refused node ends here
  }
  played++;
  lastPlayed = name;
  return true;
}

function soundNames() { return Object.keys(SOUNDS); }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { unlockAudio, audioStatus, audioSupported, playSound, soundNames,
                     setMuted, isMuted };
}
