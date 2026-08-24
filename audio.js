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
    context:   audioCtx
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { unlockAudio, audioStatus, audioSupported };
}
