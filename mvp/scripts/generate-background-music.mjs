import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sampleRate = 22_050;
const durationSeconds = 32;
const sampleCount = sampleRate * durationSeconds;
const outputPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'audio',
  'all-in-life-light-theme.wav',
);
const midiToHz = (note) => 440 * 2 ** ((note - 69) / 12);
const smoothStep = (value) => value * value * (3 - 2 * value);
const segmentEnvelope = (time, length, edge = 0.42) => {
  const local = ((time % length) + length) % length;
  return (
    smoothStep(Math.min(1, local / edge)) *
    smoothStep(Math.min(1, (length - local) / edge))
  );
};
const chords = [
  [48, 52, 55, 59],
  [45, 48, 52, 55],
  [41, 45, 48, 52],
  [43, 47, 50, 52],
];
const melody = [64, 67, 69, 67, 62, 64, 67, 64, 60, 64, 67, 69, 67, 64, 62, 60];
const samples = new Float64Array(sampleCount);
let peak = 0;

for (let index = 0; index < sampleCount; index += 1) {
  const time = index / sampleRate;
  const chord = chords[Math.floor(time / 4) % chords.length];
  let pad = 0;
  for (let voice = 0; voice < chord.length; voice += 1) {
    const frequency = midiToHz(chord[voice]);
    pad +=
      Math.sin(2 * Math.PI * frequency * time + voice * 0.31) * 0.72 +
      Math.sin(2 * Math.PI * frequency * 2 * time + voice * 0.17) * 0.12;
  }
  pad = (pad / chord.length) * segmentEnvelope(time, 4) * 0.42;
  const bass =
    Math.sin(2 * Math.PI * midiToHz(chord[0] - 12) * time) *
    segmentEnvelope(time, 4, 0.3) *
    0.2;
  const melodyTime = time % 2;
  const melodyEnvelope =
    Math.min(1, melodyTime / 0.06) * Math.exp(-melodyTime * 2.35);
  const melodyFrequency = midiToHz(
    melody[Math.floor(time / 2) % melody.length],
  );
  const pluck =
    (Math.sin(2 * Math.PI * melodyFrequency * time) * 0.68 +
      Math.sin(2 * Math.PI * melodyFrequency * 2 * time) * 0.2 +
      Math.sin(2 * Math.PI * melodyFrequency * 3 * time) * 0.08) *
    melodyEnvelope *
    0.23;
  const beatTime = time % 1;
  const pulse =
    Math.sin(2 * Math.PI * 92 * time) *
    Math.min(1, beatTime / 0.025) *
    Math.exp(-beatTime * 8.5) *
    0.055;
  const loopEdge = Math.min(1, time / 0.12, (durationSeconds - time) / 0.12);
  const value = Math.tanh((pad + bass + pluck + pulse) * 1.08) * loopEdge;
  samples[index] = value;
  peak = Math.max(peak, Math.abs(value));
}

const dataSize = sampleCount * 2;
const wav = Buffer.alloc(44 + dataSize);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + dataSize, 4);
wav.write('WAVE', 8);
wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(dataSize, 40);
const scale = peak > 0 ? 0.58 / peak : 1;
for (let index = 0; index < sampleCount; index += 1) {
  wav.writeInt16LE(Math.round(samples[index] * scale * 32_767), 44 + index * 2);
}
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, wav);
console.log(
  `Generated ${outputPath} (${durationSeconds}s, ${sampleRate} Hz mono)`,
);
