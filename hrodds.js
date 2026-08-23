const T = require('/home/user/gamespeak-mvp/timed.js');
const { VOCAB, bucketForTag, windowForTag, applyPitch } = T;
const sloped = a => ({ easy: Math.min(0.99, a + 0.12), medium: a, hard: Math.max(0.05, a - 0.15) });
console.log('CHANCE OF A HOME RUN FROM ONE AT-BAT   (swing connect 50%/attempt)');
console.log('  acc    ordinary at-bat, answered fast     bonus at-bat: question + 3 swings');
console.log('  ' + '-'.repeat(78));
for (const a of [0.60, 0.75, 0.85, 0.90]) {
  const acc = sloped(a);
  let hr = 0, n = 150000;
  for (let k = 0; k < n; k++) {
    const w = VOCAB[Math.floor(Math.random() * VOCAB.length)];
    const win = windowForTag(w.tag);
    let strikes = 0;
    for (;;) {
      const ok = Math.random() < acc[bucketForTag(w.tag)];
      const p = applyPitch(strikes, ok, ok ? win * 0.10 : win, win, w.tag);
      strikes = p.strikes;
      if (p.result === 'HIT') { if (p.hit === 'HOMERUN') hr++; break; }
      if (p.result === 'OUT') break;
    }
  }
  const pQ = Math.min(0.99, acc.hard + 0.10), bonus = pQ * (1 - Math.pow(0.5, 3));
  console.log('  ' + String(Math.round(a * 100) + '%').padEnd(7) +
    ((hr / n * 100).toFixed(1) + '%').padStart(6) + ' '.repeat(30) +
    ((bonus * 100).toFixed(1) + '%').padStart(6) +
    (bonus > hr / n ? '    bonus better' : '    ORDINARY BETTER'));
}
