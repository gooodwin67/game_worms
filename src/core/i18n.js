const translations = {
  ru: {
    loading: 'Загрузка…',
    title: 'Worms · Hot Seat',
    subtitle: 'Соберите команды. Разрушайте ландшафт. Останьтесь последними.',
    start: 'Играть',
    game: 'Игра',
    score: 'Счёт',
    reward: 'Награда за рекламу',
    ad: 'Полноэкранная реклама',
  },
  en: {
    loading: 'Loading…',
    title: 'Worms · Hot Seat',
    subtitle: 'Build your teams. Break the terrain. Be the last team standing.',
    start: 'Play',
    game: 'Game',
    score: 'Score',
    reward: 'Rewarded ad',
    ad: 'Fullscreen ad',
  },
};

export class I18n {
  constructor(initialLanguage = 'ru') {
    this.language = initialLanguage === 'ru' ? 'ru' : 'en';
  }

  setLanguage(language) {
    this.language = language === 'ru' ? 'ru' : 'en';
    document.documentElement.lang = this.language;
    localStorage.setItem('game-language', this.language);
    this.render();
  }

  toggle() {
    this.setLanguage(this.language === 'ru' ? 'en' : 'ru');
  }

  render(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((element) => {
      const key = element.dataset.i18n;
      element.textContent = translations[this.language]?.[key] ?? key;
    });
    const languageButton = document.querySelector('#language-button');
    if (languageButton) languageButton.textContent = this.language.toUpperCase();
  }
}


