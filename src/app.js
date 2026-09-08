import { GAME_CONFIG } from './config.js';
import { AudioManager } from './core/audio.js';
import { I18n } from './core/i18n.js';
import { chooseNewestState, normalizeState } from './core/storage.js';
import { YandexSdk } from './core/yandex-sdk.js';
import { Game } from './game/game.js';

export class App {
  constructor() {
    this.game = new Game(document.querySelector('#game-canvas'));
    this.audio = new AudioManager();
    this.i18n = new I18n(localStorage.getItem('game-language') || 'ru');
    this.sdk = new YandexSdk({
      onPause: () => this.pause(),
      onResume: () => this.resume(),
    });
    this.state = normalizeState();
    this.saveTimer = 0;
    this.started = false;
  }

  async init() {
    await this.sdk.init();

    const platformLanguage = this.sdk.getLanguage();
    if (!localStorage.getItem('game-language') && platformLanguage) {
      this.i18n.setLanguage(platformLanguage);
    } else {
      this.i18n.setLanguage(this.i18n.language);
    }

    await Promise.all([this.game.load(), this.loadState()]);
    this.audio.setEnabled(this.state.soundEnabled);
    this.renderState();
    this.bindEvents();

    this.showScreen('start-screen');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    this.sdk.notifyGameReady();

    if (GAME_CONFIG.mobileStickyBanner.enabled) {
      const syncBanner = () => this.sdk.syncMobileStickyBanner(GAME_CONFIG.mobileStickyBanner);
      void syncBanner();
      window.addEventListener('resize', syncBanner, { passive: true });
      window.visualViewport?.addEventListener('resize', syncBanner, { passive: true });
    }
  }

  async loadState() {
    const local = this.readLocalState();
    const cloud = await this.sdk.getPlayerData([GAME_CONFIG.storageKey]).catch(() => null);
    this.state = chooseNewestState(local, cloud?.[GAME_CONFIG.storageKey]);
    this.writeLocalState();
  }

  readLocalState() {
    try {
      return JSON.parse(localStorage.getItem(GAME_CONFIG.localStorageKey)) || {};
    } catch {
      return {};
    }
  }

  writeLocalState() {
    localStorage.setItem(GAME_CONFIG.localStorageKey, JSON.stringify(this.state));
  }

  saveState({ flush = false } = {}) {
    this.state.updatedAt = Date.now();
    this.writeLocalState();
    clearTimeout(this.saveTimer);
    const save = () => this.sdk
      .setPlayerData({ [GAME_CONFIG.storageKey]: this.state }, flush)
      .catch((error) => console.warn('Cloud save failed.', error));
    if (flush) return save();
    this.saveTimer = window.setTimeout(save, 800);
    return Promise.resolve();
  }

  bindEvents() {
    document.querySelector('#start-button').addEventListener('click', async () => {
      await this.audio.unlock();
      this.game.configure();
      this.started = true;
      this.showScreen(null);
      document.querySelector('#hud').hidden = false;
      this.game.start();
      this.sdk.setGameplayActive(true);
    });

    document.querySelector('#reward-button').addEventListener('click', () => {
      this.sdk.showRewardedAd({
        onRewarded: () => {
          this.state.score += 10;
          this.renderState();
          void this.saveState();
        },
      });
    });

    document.querySelector('#fullscreen-ad-button').addEventListener('click', () => {
      this.sdk.showFullscreenAd();
    });

    document.querySelector('#sound-button').addEventListener('click', () => {
      this.state.soundEnabled = !this.state.soundEnabled;
      this.audio.setEnabled(this.state.soundEnabled);
      this.renderState();
      void this.saveState();
    });

    document.querySelector('#language-button').addEventListener('click', () => this.i18n.toggle());

    document.querySelector('#game-root').addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.resume();
      else this.pause();
    });

    window.addEventListener('pagehide', () => {
      void this.saveState({ flush: true });
    });
  }

  pause() {
    this.game.pause();
    this.audio.pauseAll();
  }

  resume() {
    if (!this.started) return;
    this.game.resume();
    void this.audio.resume();
  }

  showScreen(id) {
    ['loading-screen', 'start-screen'].forEach((screenId) => {
      const element = document.querySelector(`#${screenId}`);
      const visible = screenId === id;
      element.hidden = !visible;
      element.classList.toggle('overlay--visible', visible);
    });
  }

  renderState() {
    document.querySelector('#score').textContent = String(this.state.score);
    document.querySelector('#sound-button').textContent = this.state.soundEnabled ? '🔊' : '🔇';
    this.i18n.render();
  }
}


