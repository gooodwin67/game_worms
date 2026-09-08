export class YandexSdk {
  constructor({ onPause = () => {}, onResume = () => {} } = {}) {
    this.ysdk = null;
    this.player = null;
    this.payments = null;
    this.onPause = onPause;
    this.onResume = onResume;
    this.gameplayRequested = false;
    this.platformPaused = false;
    this.adPaused = false;
    this.gameReadyNotified = false;
    this.stickyVisible = null;
  }

  async init() {
    if (!window.YaGames?.init) return null;
    try {
      this.ysdk = await window.YaGames.init();
      window.ysdk = this.ysdk;
      this._subscribeToPlatformEvents();
      return this.ysdk;
    } catch (error) {
      console.warn('Yandex Games SDK initialization failed; local mode is active.', error);
      return null;
    }
  }

  getLanguage() {
    const language = this.ysdk?.environment?.i18n?.lang;
    if (!language) return undefined;
    return language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  }

  notifyGameReady() {
    if (this.gameReadyNotified || !this.ysdk?.features?.LoadingAPI?.ready) return;
    this.gameReadyNotified = true;
    this.ysdk.features.LoadingAPI.ready();
  }

  setGameplayActive(active) {
    this.gameplayRequested = Boolean(active);
    this._applyGameplayState();
  }

  _applyGameplayState() {
    const active = this.gameplayRequested && !this.platformPaused && !this.adPaused;
    this.ysdk?.features?.GameplayAPI?.[active ? 'start' : 'stop']?.();
  }

  _setAdPaused(paused) {
    this.adPaused = Boolean(paused);
    this._applyGameplayState();
    (paused ? this.onPause : this.onResume)();
  }

  showFullscreenAd(callbacks = {}) {
    if (!this.ysdk?.adv?.showFullscreenAdv) {
      callbacks.onClose?.(false);
      return false;
    }
    this.ysdk.adv.showFullscreenAdv({
      callbacks: {
        onOpen: () => {
          this._setAdPaused(true);
          callbacks.onOpen?.();
        },
        onClose: (wasShown) => {
          this._setAdPaused(false);
          callbacks.onClose?.(wasShown);
        },
        onError: (error) => {
          this._setAdPaused(false);
          callbacks.onError?.(error);
        },
      },
    });
    return true;
  }

  showRewardedAd(callbacks = {}) {
    if (!this.ysdk?.adv?.showRewardedVideo) {
      callbacks.onClose?.(false);
      return false;
    }
    this.ysdk.adv.showRewardedVideo({
      callbacks: {
        onOpen: () => {
          this._setAdPaused(true);
          callbacks.onOpen?.();
        },
        onRewarded: () => callbacks.onRewarded?.(),
        onClose: (wasShown) => {
          this._setAdPaused(false);
          callbacks.onClose?.(wasShown);
        },
        onError: (error) => {
          this._setAdPaused(false);
          callbacks.onError?.(error);
        },
      },
    });
    return true;
  }

  async syncMobileStickyBanner({ showAtHeight = 640, hideBelowHeight = 560 } = {}) {
    if (!this.ysdk?.adv) return false;
    const device = this.ysdk.deviceInfo;
    const isMobile = typeof device?.isMobile === 'function'
      ? device.isMobile()
      : device?.type === 'mobile';
    if (!isMobile) return false;

    const height = Math.round(window.visualViewport?.height || window.innerHeight || 0);
    const threshold = this.stickyVisible ? hideBelowHeight : showAtHeight;
    const shouldShow = height >= threshold;
    const method = shouldShow ? 'showBannerAdv' : 'hideBannerAdv';
    if (!this.ysdk.adv[method]) return false;
    const result = await this.ysdk.adv[method]().catch(() => null);
    this.stickyVisible = Boolean(result?.stickyAdvIsShowing);
    return this.stickyVisible;
  }

  async getPlayer({ force = false } = {}) {
    if (!this.ysdk?.getPlayer) return null;
    if (!this.player || force) this.player = await this.ysdk.getPlayer();
    return this.player;
  }

  async authorizePlayer() {
    if (!this.ysdk?.auth?.openAuthDialog) return null;
    await this.ysdk.auth.openAuthDialog();
    return this.getPlayer({ force: true });
  }

  async getPlayerData(keys) {
    const player = await this.getPlayer();
    return player?.getData ? player.getData(keys) : null;
  }

  async setPlayerData(data, flush = false) {
    const player = await this.getPlayer();
    if (!player?.setData) return false;
    await player.setData(data, flush);
    return true;
  }

  async getLeaderboardEntries(name, options = {}) {
    return this.ysdk?.leaderboards?.getEntries?.(name, options) ?? null;
  }

  async getLeaderboardPlayerEntry(name) {
    return this.ysdk?.leaderboards?.getPlayerEntry?.(name) ?? null;
  }

  async setLeaderboardScore(name, score) {
    if (!this.ysdk?.leaderboards?.setScore) return false;
    await this.ysdk.leaderboards.setScore(name, Math.max(0, Math.floor(score)));
    return true;
  }

  async getPayments() {
    if (!this.ysdk?.getPayments) return null;
    if (!this.payments) this.payments = await this.ysdk.getPayments();
    return this.payments;
  }

  async purchase(productId, developerPayload = '') {
    const payments = await this.getPayments();
    if (!payments) return null;
    return payments.purchase({ id: productId, developerPayload });
  }

  async getPendingPurchases() {
    const payments = await this.getPayments();
    return payments?.getPurchases ? payments.getPurchases() : [];
  }

  async consumePurchase(purchaseToken) {
    const payments = await this.getPayments();
    if (payments?.consumePurchase && purchaseToken) {
      await payments.consumePurchase(purchaseToken);
    }
  }

  _subscribeToPlatformEvents() {
    if (!this.ysdk?.on) return;
    this.ysdk.on('game_api_pause', () => {
      this.platformPaused = true;
      this._applyGameplayState();
      this.onPause();
    });
    this.ysdk.on('game_api_resume', () => {
      this.platformPaused = false;
      this._applyGameplayState();
      this.onResume();
    });
  }
}
