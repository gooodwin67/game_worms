const UNLOCK_EVENTS = ['pointerdown', 'touchstart', 'keydown'];

export class AudioManager {
  constructor() {
    this.enabled = true;
    this.context = null;
    this.elements = new Set();
    this._unlock = this.unlock.bind(this);
    UNLOCK_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, this._unlock, { passive: true });
    });
  }

  register(audioElement) {
    if (audioElement) this.elements.add(audioElement);
    return audioElement;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.elements.forEach((audio) => {
      audio.muted = !this.enabled;
      if (!this.enabled) audio.pause();
    });
  }

  pauseAll() {
    this.elements.forEach((audio) => audio.pause());
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

