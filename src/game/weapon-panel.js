import { ARSENAL } from './arsenal.js';
import { WEAPON_ICON_REGIONS } from './weapon-icon-regions.js';

// Atlas cells follow ARSENAL's order; panel rows follow the classic families.
const ICONS = Object.keys(ARSENAL);
const GROUPS = [
  ['Util.', 'jetPack', 'lowGravity', 'fastWalk', 'laserSight', 'invisibility'],
  ['F1', 'bazooka', 'homing', 'mortar', 'pigeon', 'sheepLauncher'],
  ['F2', 'grenade', 'cluster', 'banana', 'battleAxe', 'earthquake'],
  ['F3', 'shotgun', 'handgun', 'uzi', 'minigun', 'longbow'],
  ['F4', 'firePunch', 'dragonBall', 'kamikaze', 'suicideBomber', 'prod'],
  ['F5', 'dynamite', 'mine', 'sheep', 'superSheep', 'moleBomb'],
  ['F6', 'airstrike', 'napalm', 'mailstrike', 'minestrike', 'moleSquadron'],
  ['F7', 'blowTorch', 'pneumaticDrill', 'girder', 'baseballBat', 'girderPack'],
  ['F8', 'ninjaRope', 'bungee', 'parachute', 'teleport', 'scales'],
  ['F9', 'superBanana', 'holy', 'flamethrower', 'salvation', 'mbBomb'],
  ['F10', 'petrol', 'skunk', 'mingVase', 'frenchSheep', 'carpet'],
  ['F11', 'madCows', 'oldWoman', 'donkey', 'indianTest', 'armageddon'],
  ['F12', 'skipGo', 'surrender', 'selectWorm', 'freeze', 'magicBullet'],
  ['Доп.', 'drill'],
];

export class WeaponPanel {
  constructor(game, toggle) {
    this.game = game;
    this.toggle = toggle;
    this.root = document.createElement('aside');
    this.root.className = 'weapon-panel';
    this.root.id = 'weapon-panel';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Арсенал');
    this.root.innerHTML = '<header><strong>АРСЕНАЛ</strong><button type="button" class="weapon-panel-close" aria-label="Закрыть арсенал">×</button></header><div class="weapon-grid"></div><p class="weapon-panel-caption" aria-live="polite">Выберите оружие</p>';
    const grid = this.root.querySelector('.weapon-grid');
    this.caption = this.root.querySelector('.weapon-panel-caption');
    for (const [label, ...ids] of GROUPS) {
      const key = document.createElement('span');
      key.className = 'weapon-group-key';
      key.textContent = label;
      grid.append(key);
      for (let col = 0; col < 5; col++) {
        const id = ids[col];
        if (!id) { const blank = document.createElement('span'); blank.className = 'weapon-empty'; grid.append(blank); continue; }
        const index = ICONS.indexOf(id);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'weapon-cell';
        button.dataset.weapon = id;
        button.title = ARSENAL[id];
        button.setAttribute('aria-label', ARSENAL[id]);
        const [x, y, width, height] = WEAPON_ICON_REGIONS[index];
        const ns = 'http://www.w3.org/2000/svg';
        const icon = document.createElementNS(ns, 'svg');
        icon.setAttribute('class', 'weapon-icon');
        icon.setAttribute('aria-hidden', 'true');
        icon.setAttribute('viewBox', `0 0 ${width} ${height}`);
        icon.setAttribute('focusable', 'false');
        // Clip before fitting to the button, so letterboxing cannot expose neighbors.
        const crop = document.createElementNS(ns, 'svg');
        crop.setAttribute('width', width);
        crop.setAttribute('height', height);
        crop.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
        crop.setAttribute('overflow', 'hidden');
        const atlas = document.createElementNS(ns, 'image');
        atlas.setAttribute('href', `${import.meta.env.BASE_URL}assets/weapon-atlas.png`);
        atlas.setAttribute('width', '749');
        atlas.setAttribute('height', '2098');
        crop.append(atlas);
        icon.append(crop);
        button.append(icon);
        button.addEventListener('pointerenter', () => { this.caption.textContent = ARSENAL[id]; });
        button.addEventListener('focus', () => { this.caption.textContent = ARSENAL[id]; });
        button.addEventListener('click', () => this.select(id));
        grid.append(button);
      }
    }
    this.buttons = this.root.querySelectorAll('[data-weapon]');
    this.root.querySelector('.weapon-panel-close').addEventListener('click', () => this.close(true));
    this.root.addEventListener('contextmenu', e => { e.preventDefault(); this.close(); });
    toggle.setAttribute('aria-controls', this.root.id);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => this.flip());
    document.querySelector('#game-root').append(this.root);
  }
  get open() { return !this.root.hidden; }
  canSelect() { const g = this.game; return g.gameMode !== 'training' && g.humanInput() && g.turn.state === 'WAITING_INPUT' && !g.turn.lockedWeapon; }
  flip() {
    if (this.open) { this.close(); return; }
    if (!this.canSelect()) return;
    this.game.keys.clear();
    this.owner = this.game.active;
    this.refresh();
    this.root.hidden = false;
    this.toggle.setAttribute('aria-expanded', 'true');
  }
  close(focus = false) {
    this.root.hidden = true;
    this.toggle.setAttribute('aria-expanded', 'false');
    if (focus) this.toggle.focus();
    else if (this.root.contains(document.activeElement)) document.activeElement.blur();
  }
  select(id) {
    if (!this.canSelect()) return;
    this.game.turn.weapon = id;
    this.game.weapons.resetTarget();
    this.close();
    this.refresh();
  }
  shortcut(code) {
    const group = GROUPS.find(row => row[0] === code);
    if (!group || !this.canSelect()) return;
    const ids = group.slice(1), current = ids.indexOf(this.game.turn.weapon);
    this.select(ids[(current + 1) % ids.length]);
  }
  refresh() {
    const g = this.game;
    if (this.open && (!this.canSelect() || this.owner !== g.active)) this.close();
    this.toggle.disabled = !this.canSelect();
    for (const button of this.buttons) {
      const selected = button.dataset.weapon === g.turn.weapon;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = !this.canSelect();
    }
  }
}
