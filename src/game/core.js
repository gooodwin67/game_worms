export const FIXED_DT = 1 / 60;
export const MAP = Object.freeze({ width: 96, height: 54, pixelsPerUnit: 16, chunk: 32 });
export const TURN = Object.freeze({ WAITING_INPUT: 'WAITING_INPUT', CHARGING_SHOT: 'CHARGING_SHOT', ACTION_RESOLVING: 'ACTION_RESOLVING', SETTLING: 'SETTLING', NEXT_TURN: 'NEXT_TURN' });
export const GRAVITY = -12;
export const WIND_MAX = 3;
export const COLORS = [0x55d9ba, 0xff867b, 0xa995ff, 0xffd166, 0x63c5ff, 0xf58cda];
export class GameLoop {
  constructor(update, render) {
    this.update = update; this.render = render; this.running = false; this.accumulator = 0;
    this.frame = this.frame.bind(this);
  }
  start() { if (this.running) return; this.running = true; this.last = performance.now(); this.id = requestAnimationFrame(this.frame); }
  pause() { this.running = false; cancelAnimationFrame(this.id); this.accumulator = 0; }
  frame(now) {
    if (!this.running) return;
    const dt = Math.min((now - this.last) / 1000, 0.1); this.last = now; this.accumulator += dt;
    while (this.accumulator >= FIXED_DT) { this.update(FIXED_DT); this.accumulator -= FIXED_DT; }
    this.render(dt, this.accumulator / FIXED_DT); this.id = requestAnimationFrame(this.frame);
  }
}
export class TurnMachine {
  constructor(game) { this.game = game; this.team = -1; this.cursors = game.teams.map(() => -1); this.state = TURN.NEXT_TURN; this.remaining = 45; this.charge = 0; this.still = 0; this.shots = 2; this.weapon = 'bazooka'; }
  next() {
    const g = this.game;
    g.weapons.endUtility();
    g.weapons.girderStock = 5;
    g.lowGravity = false;
    g.world.gravity = { x: 0, y: GRAVITY };
    this.lockedWeapon = null;
    let survivors = 0, winner = null;
    for (const team of g.teams) if (!team.surrendered && team.worms.some(w => w.alive)) { survivors++; winner = team; }
    if (survivors <= 1) { g.winner = winner ? `${winner.name} побеждает!` : 'Ничья'; return; }
    do { this.team = (this.team + 1) % g.teams.length; } while (g.teams[this.team].surrendered || !g.teams[this.team].worms.some(w => w.alive));
    const worms = g.teams[this.team].worms;
    do { this.cursors[this.team] = (this.cursors[this.team] + 1) % worms.length; } while (!worms[this.cursors[this.team]].alive);
    g.active = worms[this.cursors[this.team]]; g.wind = (Math.random() * 2 - 1) * WIND_MAX;
    for (const worm of g.worms) if (worm.team === this.team) { worm.frozen = false; worm.speedBoost = false; worm.invisible = false; worm.laserSight = false; }
    for (const worm of g.worms) if (worm.alive && !worm.frozen && (worm.poison || worm.radiation)) g.damage(worm, Math.min(worm.hp - 1, 2));
    this.remaining = 45; this.shots = 2; this.charge = 0; this.weapon = 'bazooka'; this.state = TURN.WAITING_INPUT;
    g.angle = g.active.facing < 0 ? Math.PI * .75 : Math.PI * .25;
    g.keys.clear(); g.weapons.resetTarget(); g.bot.reset();
  }
  beginCharge() { if (this.state === TURN.WAITING_INPUT && this.game.active?.alive) { this.charge = 0; this.state = TURN.CHARGING_SHOT; if (!this.game.weapons.needsCharge(this.weapon)) this.release(); } }
  release() {
    if (this.state !== TURN.CHARGING_SHOT) return;
    this.state = TURN.ACTION_RESOLVING;
    if (this.game.weapons.fire(this.weapon, this.charge) === false) { this.state = TURN.WAITING_INPUT; this.charge = 0; return; }
    if (this.state === TURN.ACTION_RESOLVING || this.state === TURN.SETTLING) {
      if (!this.game.weapons.drilling && !['skipGo','surrender','freeze','selectWorm','scales','teleport','girder','girderPack'].includes(this.weapon)) this.game.weapons.retreat = Math.max(this.game.weapons.retreat, 3);
      if (this.weapon !== 'freeze') for (const worm of this.game.teams[this.team].worms) worm.invisible = false;
    }
  }
  settle() { this.still = 0; this.state = TURN.SETTLING; }
  update(dt) {
    if (this.game.winner) return;
    if (this.state === TURN.NEXT_TURN) { this.next(); return; }
    if (this.state === TURN.WAITING_INPUT || this.state === TURN.CHARGING_SHOT) {
      this.remaining = Math.max(0, this.remaining - dt);
      if (!this.game.active.alive) { this.game.weapons.endUtility(); this.shots = 0; this.settle(); return; }
      if (this.state === TURN.CHARGING_SHOT) this.charge = Math.min(1, this.charge + dt / 1.5);
      if (this.remaining === 0) { if (this.state === TURN.CHARGING_SHOT) this.release(); this.game.weapons.endUtility(); this.shots = 0; this.settle(); }
    }
    if (this.state === TURN.SETTLING) {
      if (this.game.weapons.busy()) { this.still = 0; return; }
      let stable = true;
      for (const w of this.game.worms) {
        if (!w.alive || w.body.isSleeping()) continue;
        if (w.vx * w.vx + w.vy * w.vy > 0.025 || !w.grounded) { stable = false; break; }
      }
      this.still = stable ? this.still + dt : 0;
      if (this.still >= 0.6) {
        if ((this.weapon === 'shotgun' || this.weapon === 'longbow') && this.shots > 0 && this.remaining > 0 && this.game.active.alive) this.state = TURN.WAITING_INPUT;
        else this.state = TURN.NEXT_TURN;
      }
    }
  }
}
