import { ARSENAL, UNLIMITED_WEAPONS } from './arsenal.js';
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
    this.root.innerHTML = '<header><strong>АРСЕНАЛ</strong><button type="button" class="weapon-panel-close" aria-label="Закрыть арсенал">×</button></header><div class="weapon-grid"></div><p class="weapon-panel-caption" aria-live="polite">Выберите оружие</p><section class="weapon-angle-tuner" aria-label="Настройка угла текстуры"><strong>Угол текстуры</strong><div class="weapon-angle-row"><select class="weapon-angle-select" aria-label="Оружие для настройки"></select><output class="weapon-angle-value">0°</output></div><div class="weapon-angle-row weapon-angle-controls"><button type="button" data-angle-step="-10">−10°</button><button type="button" data-angle-step="-1">−1°</button><input class="weapon-angle-range" type="range" min="-180" max="180" step="1" aria-label="Угол текстуры"><button type="button" data-angle-step="1">+1°</button><button type="button" data-angle-step="10">+10°</button></div><div class="weapon-angle-row weapon-angle-actions"><button type="button" class="weapon-angle-reset">Сбросить угол</button><button type="button" class="weapon-angle-copy">Копировать данные</button></div><textarea class="weapon-angle-data" readonly aria-label="Сохранённые углы оружия" hidden></textarea><span class="weapon-angle-status" aria-live="polite">Автосохранение включено</span></section>';
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
        const count = document.createElement('span');
        count.className = 'weapon-count';
        count.textContent = UNLIMITED_WEAPONS.has(id) ? '∞' : '1';
        button.append(icon, count);
        button.addEventListener('pointerenter', () => { this.caption.textContent = ARSENAL[id]; });
        button.addEventListener('focus', () => { this.caption.textContent = ARSENAL[id]; });
        button.addEventListener('click', () => this.select(id));
        grid.append(button);
      }
    }
    this.buttons = this.root.querySelectorAll('[data-weapon]');
    this.setupAngleTuner();
    this.root.querySelector('.weapon-panel-close').addEventListener('click', () => this.close(true));
    this.root.addEventListener('contextmenu', e => { e.preventDefault(); this.close(); });
    toggle.setAttribute('aria-controls', this.root.id);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => this.flip());
    document.querySelector('#game-root').append(this.root);
  }
  get open() { return !this.root.hidden; }
  setupAngleTuner() {
    this.angleSelect = this.root.querySelector('.weapon-angle-select');
    this.angleRange = this.root.querySelector('.weapon-angle-range');
    this.angleValue = this.root.querySelector('.weapon-angle-value');
    this.anglePreview = this.root.querySelector('.weapon-angle-preview');
    this.angleData = this.root.querySelector('.weapon-angle-data');
    this.angleStatus = this.root.querySelector('.weapon-angle-status');
    for (const [id, name] of Object.entries(ARSENAL)) {
      const option = document.createElement('option'); option.value = id; option.textContent = name; this.angleSelect.append(option);
    }
    const currentWeapon = this.game.turn?.weapon;
    this.angleSelect.value = currentWeapon in ARSENAL ? currentWeapon : Object.keys(ARSENAL)[0];
    this.angleSelect.addEventListener('change', () => {
      this.game.turn.weapon = this.angleSelect.value;
      this.refreshAngleTuner();
    });
    this.angleRange.addEventListener('input', () => this.setAngle(this.angleRange.value));
    this.root.querySelectorAll('[data-angle-step]').forEach(button => button.addEventListener('click', () => {
      this.setAngle(Number(this.angleRange.value) + Number(button.dataset.angleStep));
    }));
    this.root.querySelector('.weapon-angle-reset').addEventListener('click', () => {
      const type = this.angleSelect.value;
      this.setAngle(this.game.weaponArt.defaultAimArtAngle(type));
    });
    this.root.querySelector('.weapon-angle-copy').addEventListener('click', () => this.copyAimAngles());
    this.refreshAngleTuner();
  }
  refreshAngleTuner() {
    const weaponArt = this.game.weaponArt;
    if (!weaponArt) return;
    const type = this.angleSelect.value;
    const angle = weaponArt.aimArtAngle(type) * 180 / Math.PI;
    this.angleRange.value = String(Math.round(angle));
    this.angleValue.value = `${angle.toFixed(1)}°`;
    this.angleValue.textContent = `${angle.toFixed(1)}°`;
    this.anglePreview?.remove();
    const icon = this.root.querySelector(`[data-weapon="${type}"] .weapon-icon`)?.cloneNode(true);
    if (icon) {
      icon.classList.add('weapon-angle-preview');
      icon.style.transform = `rotate(${-angle}deg)`;
      this.angleSelect.parentElement.prepend(icon);
      this.anglePreview = icon;
    }
    this.angleStatus.textContent = 'Автосохранение включено';
  }
  setAngle(angle) {
    const type = this.angleSelect.value;
    const value = this.game.weaponArt.setAimArtAngle(type, angle);
    this.refreshAngleTuner();
    this.angleStatus.textContent = `Сохранено: ${ARSENAL[type]} · ${value.toFixed(1)}°`;
  }
  async copyAimAngles() {
    const data = JSON.stringify(this.game.weaponArt.aimArtAngles(), null, 2);
    this.angleData.hidden = false;
    this.angleData.value = data;
    try {
      await navigator.clipboard.writeText(data);
      this.angleStatus.textContent = 'Данные скопированы';
    } catch {
      this.angleData.focus(); this.angleData.select();
      const copied = document.execCommand('copy');
      this.angleStatus.textContent = copied ? 'Данные скопированы' : 'Выделите текст и скопируйте вручную';
    }
  }
  canSelect() { const g = this.game; return (g.gameMode !== 'training' || g.trainingFreePractice) && g.humanInput() && g.turn.state === 'WAITING_INPUT' && !g.turn.lockedWeapon; }
  flip() {
    if (this.open) { this.close(); return; }
    if (!this.canSelect()) return;
    this.game.keys.clear();
    this.owner = this.game.active;
    this.weaponBeforeAnglePreview = this.game.turn.weapon;
    if (this.angleSelect && this.game.turn.weapon in ARSENAL) {
      this.angleSelect.value = this.game.turn.weapon;
      this.refreshAngleTuner();
    }
    this.refresh();
    this.root.hidden = false;
    this.toggle.setAttribute('aria-expanded', 'true');
  }
  close(focus = false) {
    if (this.weaponBeforeAnglePreview) {
      this.game.turn.weapon = this.weaponBeforeAnglePreview;
      this.weaponBeforeAnglePreview = null;
    }
    this.root.hidden = true;
    this.toggle.setAttribute('aria-expanded', 'false');
    if (focus) this.toggle.focus();
    else if (this.root.contains(document.activeElement)) document.activeElement.blur();
  }
  select(id) {
    if (!this.canSelect()) return;
    if (!this.game.canUseWeapon(id)) return;
    this.game.turn.weapon = id;
    this.weaponBeforeAnglePreview = null;
    this.game.activeMoved = true;
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
      const count = g.weaponCount(button.dataset.weapon);
      button.classList.toggle('selected', selected);
      button.classList.toggle('empty', count === 0);
      button.querySelector('.weapon-count').textContent = count === Infinity ? '∞' : String(count);
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = !this.canSelect() || count === 0;
    }
  }
}
