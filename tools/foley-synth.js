const sr = 44100;
const tau = Math.PI * 2;
const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
function random(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function lowpass(cutoff) {
  const a = Math.exp(-tau * cutoff / sr);
  const gain = Math.sqrt((1 + a) / (1 - a));
  let state = 0;
  return (x) => { state = a * state + (1 - a) * x; return state * gain; };
}
// Noise-excited resonances move continuously upward with stored energy.
// Cutoffs are bounded for this state-variable filter's stability.
function resonator(damping) {
  let low = 0, band = 0;
  return (input, frequency) => {
    const f = 2 * Math.sin(Math.PI * Math.max(25, Math.min(3500, frequency)) / sr);
    low += f * band;
    const high = input - low - damping * band;
    band += f * high;
    return band * Math.sqrt(damping);
  };
}
export function synthesizeCharge(profile, seed, duration = 2.55) {
  const rng = random(seed), noise = () => rng() * 2 - 1;
  const bass = lowpass(100), wind = lowpass(1800), motion = lowpass(9);
  const filters = [resonator(.22), resonator(.32), resonator(.4)];
  const samples = new Float64Array(Math.ceil(sr * duration));
  let phase = 0, pulsePhase = 0, nextSpark = .1, spark = 0, sparkDecay = .98;
  let drift = 0, previous = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sr;
    // All variants share: ignition, accumulating energy, tense ready plateau.
    const progress = Math.min(1, t / (duration - .30));
    const energy = smooth(progress) ** profile.curve;
    const ignition = smooth(t / .10);
    const release = smooth((duration - t) / .09);
    const white = noise();
    const air = wind(white), low = bass(noise());
    drift = motion(noise());
    const high = (white - previous) * .7;
    previous = white;
    const center = profile.frequency + profile.rise * energy;
    const driftAmount = profile.texture === 'core' ? .045 : .012;
    const frequency = center * (1 + drift * driftAmount);
    const ratios = profile.texture === 'crystal' ? [1, 2.17, 3.43] : [1, 1.43, 2.61];
    const resonant = filters.reduce((sum, filter, j) => sum + filter(air, frequency * ratios[j]) / (j + 1), 0);
    // Subtle integrated core pitch; broadband moving resonances stay dominant.
    phase = (phase + tau * (profile.frequency * .65 + profile.rise * .13 * energy) / sr) % tau;
    const core = Math.sin(phase + drift * .12);
    pulsePhase = (pulsePhase + tau * (1.5 + 14 * energy) / sr) % tau;
    const pulse = 1 - profile.pulse * (.5 + .5 * Math.sin(pulsePhase + drift * .35));
    if (t >= nextSpark) {
      spark = .35 + rng() * .65;
      sparkDecay = Math.exp(-1 / (sr * (.0015 + rng() * .012)));
      nextSpark = t + (.15 - Math.log(Math.max(.0001, rng()))) / (3 + 65 * energy * profile.sparks);
    }
    spark *= sparkDecay;
    const plasma = profile.texture === 'plasma';
    const coil = profile.texture === 'coil';
    const coreGain = profile.texture === 'core' ? .22 : coil ? .16 : .07;
    const bed = air * profile.air * (.12 + .25 * energy) + low * (.22 - .08 * energy);
    const field = resonant * profile.resonance * (1.2 + energy * 1.6);
    const arcs = (high * (plasma ? 1 : .5) + resonant * .25) * spark * profile.sparks * (.2 + energy);
    const tension = high * profile.air * energy * energy * .08;
    const raw = (bed + field + core * coreGain) * pulse + arcs + tension;
    // A little peak rounding, without the old heavy saturation of tonal carriers.
    samples[i] = Math.tanh(raw * .8) * ignition * release * (.18 + .82 * energy);
  }
  return samples;
}
