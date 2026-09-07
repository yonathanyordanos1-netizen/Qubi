/**
 * Generates the Qubi reward SFX pack as raw 16-bit PCM WAV files:
 *   assets/sounds/quest_complete.mp3-name.wav — Duolingo-like 3-note success chime
 *   assets/sounds/pop.wav   — soft "bubble pop" for the primary CTA
 *   assets/sounds/click.wav — short UI tick for the secondary button
 * Pure Node (no deps) — run once via `node scripts/generate-sounds.js`.
 * RIFF files with PCM fmt are universally decodable (Android SoundPool, iOS, Web).
 */
const fs = require('fs');
const path = require('path');

const SR = 44100;

function writeWav(name, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 18); // PCM
  header.writeUInt16LE(1, 20); // mono
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  const out = path.join(__dirname, '..', 'assets', 'sounds', name);
  fs.writeFileSync(out, Buffer.concat([header, data]));
  console.log('wrote', out, `${(samples.length / SR).toFixed(2)}s`);
}

const sec = (ms) => Math.round((ms / 1000) * SR);
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
const bell = (f, t, a, d) => Math.sin(2 * Math.PI * f * t) * env(t, a, d);

// ── quest_complete: sparkle → ascending major arpeggio → shimmering fifth ──
{
  const dur = 0.95;
  const n = sec(dur * 1000);
  const s = new Float64Array(n);
  const notes = [
    { f: 659.26, at: 0.0, g: 0.5, dur: 0.34 }, // E5 sparkle
    { f: 783.99, at: 0.1, g: 0.55, dur: 0.34 }, // G5
    { f: 987.77, at: 0.2, g: 0.62, dur: 0.46 }, // B5
    { f: 1318.5, at: 0.3, g: 0.72, dur: 0.62 }, // E6 resolve
    { f: 1975.5, at: 0.3, g: 0.2, dur: 0.5 }, // B6 shimmer overtone
  ];
  for (const { f, at, g, dur: d } of notes) {
    const start = sec(at * 1000);
    const len = sec(d * 1000);
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / SR;
      s[start + i] += g * bell(f, t, 0.004, d * 0.32);
      s[start + i] += g * 0.35 * bell(f * 2, t, 0.003, d * 0.18);
    }
  }
  for (let i = 0; i < n; i++) s[i] *= Math.min(1, (n - i) / sec(80));
  writeWav('quest_complete.wav', s);
}

// ── pop: soft sine blip with fast pitch rise (Duolingo "boop") ──
{
  const dur = 0.14;
  const n = sec(dur * 1000);
  const s = new Float64Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const p = t / dur;
    const f = 520 + 340 * p;
    phase += (2 * Math.PI * f) / SR;
    s[i] = Math.sin(phase) * 0.8 * env(t, 0.004, 0.035);
  }
  for (let i = 0; i < n; i++) s[i] *= Math.min(1, (n - i) / sec(10));
  writeWav('pop.wav', s);
}

// ── click: dry high tick (secondary button) ──
{
  const dur = 0.05;
  const n = sec(dur * 1000);
  const s = new Float64Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 1500 - 500 * (t / dur);
    phase += (2 * Math.PI * f) / SR;
    s[i] = Math.sin(phase) * 0.55 * env(t, 0.001, 0.012);
  }
  for (let i = 0; i < n; i++) s[i] *= Math.min(1, (n - i) / sec(4));
  writeWav('click.wav', s);
}

console.log('done.');
