const UNLOCK_EVENTS = ['pointerdown', 'touchstart', 'keydown'];

export class AudioManager {
  constructor() {
    this.enabled = true;
    this.context = null;
    this.elements = new Set();
    this.sfx = new Map();
    this.activeLoops = new Map();
    this.previewAudio = null;
    this._unlock = this.unlock.bind(this);
    UNLOCK_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, this._unlock, { passive: true });
    });

    this.registerSfx('energyCharge', 'energy_charge_natural.wav', { loop: true, volume: 0.8 });
    this.registerSfx('energyShot', 'energy_shot.wav', { volume: 0.85 });
    this.registerSfx('explosion', 'explosion.wav', { volume: 0.9 });
    this.registerSfx('footstep', 'footstep.wav', { volume: 0.42 });
    this.registerSfx('jump', 'jump.wav', { volume: 0.55 });
    this.registerSfx('landing', 'landing.wav', { volume: 0.7 });
  }

  register(audioElement) {
    if (audioElement) this.elements.add(audioElement);
    return audioElement;
  }

  registerSfx(name, fileName, { loop = false, volume = 1 } = {}) {
    const audio = this.register(new Audio(`${import.meta.env.BASE_URL}audio/${fileName}`));
    audio.preload = 'auto';
    audio.loop = loop;
    audio.volume = volume;
    this.sfx.set(name, audio);
    return audio;
  }

  play(name) {
    if (!this.enabled) return;
    const source = this.sfx.get(name);
    if (!source) return;
    const audio = source.cloneNode();
    audio.muted = false;
    audio.loop = false;
    audio.volume = source.volume;
    this.register(audio);
    audio.addEventListener('ended', () => this.elements.delete(audio), { once: true });
    void audio.play().catch(() => {});
  }

  startLoop(name) {
    if (!this.enabled || this.activeLoops.has(name)) return;
    const audio = this.sfx.get(name);
    if (!audio) return;
    audio.currentTime = 0;
    audio.muted = false;
    this.activeLoops.set(name, audio);
    void audio.play().catch(() => {});
  }

  preview(name) {
    if (this.previewAudio) {
      this.previewAudio.pause();
      this.elements.delete(this.previewAudio);
      this.previewAudio = null;
    }
    if (!this.enabled) return;
    const source = this.sfx.get(name);
    if (!source) return;
    const audio = source.cloneNode();
    audio.loop = false;
    audio.muted = false;
    audio.volume = source.volume;
    this.previewAudio = this.register(audio);
    const cleanup = () => {
      this.elements.delete(audio);
      if (this.previewAudio === audio) this.previewAudio = null;
    };
    audio.addEventListener('ended', cleanup, { once: true });
    void audio.play().catch(cleanup);
  }

  stopLoop(name) {
    const audio = this.activeLoops.get(name);
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    this.activeLoops.delete(name);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.elements.forEach((audio) => {
      audio.muted = !this.enabled;
      if (!this.enabled) audio.pause();
    });
    if (!this.enabled) this.activeLoops.clear();
  }

  pauseAll() {
    this.elements.forEach((audio) => audio.pause());
    this.activeLoops.clear();
    void this.context?.suspend?.();
  }

  async resume() {
    if (!this.enabled) return;
    await this.context?.resume?.().catch(() => {});
  }

  async unlock() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!this.context && AudioContextClass) this.context = new AudioContextClass();
    await this.resume();
    if (this.context?.state === 'running') {
      UNLOCK_EVENTS.forEach((eventName) => window.removeEventListener(eventName, this._unlock));
    }
  }
}
