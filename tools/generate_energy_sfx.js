import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargeProfiles } from '../src/core/audio-profiles.js';
import { synthesizeCharge } from './foley-synth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sampleRate = 44100;
const outDir = path.join(__dirname, '..', 'audio');
fs.mkdirSync(outDir, { recursive: true });

function writeWav(file, samples) {
  let peak = 0, energy = 0;
  for (const value of samples) {
    peak = Math.max(peak, Math.abs(value));
    energy += value * value;
  }
  const gain = Math.min(.89 / Math.max(peak, 1e-9), .16 / Math.max(Math.sqrt(energy / samples.length), 1e-9));
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value * gain)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, data]));
}

function shot(duration = .72) {
  const samples = [];
  for (let i = 0; i < duration * sampleRate; i++) {
    const t = i / sampleRate, p = Math.min(t / .35, 1);
    const boom = Math.sin(2 * Math.PI * (105 - 55 * p) * t) * Math.exp(-t * 8.5);
    const beam = Math.sin(2 * Math.PI * (820 + 1700 * Math.min(t / .22, 1)) * t) * Math.exp(-t * 11);
    const crack = (Math.random() * 2 - 1) * Math.exp(-t * 28) * .85;
    const tail = Math.sin(2 * Math.PI * 310 * t + 5 * Math.sin(2 * Math.PI * 7 * t)) * Math.exp(-t * 5.2) * .22;
    samples.push(boom * 1.2 + beam * .5 + crack + tail);
  }
  return samples;
}

function effect(kind, duration) {
  const samples = [];
  let filtered = 0;
  for (let i = 0; i < duration * sampleRate; i++) {
    const t = i / sampleRate;
    let value = 0;
    if (kind === 'explosion') {
      const boom = Math.sin(2 * Math.PI * (92 - 58 * Math.min(1, t / .5)) * t) * Math.exp(-t * 5.4);
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 8.5);
      filtered = filtered * .94 + noise * .06;
      value = boom * 1.4 + filtered * 1.8;
    } else if (kind === 'footstep') {
      const impact = (Math.random() * 2 - 1) * Math.exp(-t * 42);
      const thump = Math.sin(2 * Math.PI * (115 - 55 * t) * t) * Math.exp(-t * 22);
      value = impact * .72 + thump * .9;
    } else if (kind === 'jump') {
      const rise = Math.sin(2 * Math.PI * (180 + 520 * Math.min(1, t / duration)) * t) * Math.exp(-t * 2.8);
      const air = (Math.random() * 2 - 1) * Math.exp(-t * 7) * .28;
      value = rise + air;
    } else {
      const impact = Math.sin(2 * Math.PI * (125 - 80 * Math.min(1, t / .28)) * t) * Math.exp(-t * 10);
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 18) * .55;
      value = impact + noise;
    }
    samples.push(Math.tanh(value * 1.4));
  }
  return samples;
}

// Charge auditions should not overwrite the unrelated shot asset.
if (process.argv.includes('--shot')) writeWav(path.join(outDir, 'energy_shot.wav'), shot());
writeWav(path.join(outDir, 'energy_charge_natural.wav'), synthesizeCharge(chargeProfiles[0], 420));
writeWav(path.join(outDir, 'explosion.wav'), effect('explosion', .85));
writeWav(path.join(outDir, 'footstep.wav'), effect('footstep', .18));
writeWav(path.join(outDir, 'jump.wav'), effect('jump', .48));
writeWav(path.join(outDir, 'landing.wav'), effect('landing', .42));
