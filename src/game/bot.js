import RAPIER from '@dimforge/rapier2d-compat';
import { GRAVITY, MAP, TURN } from './core.js';

const PROFILES = Object.freeze({
  easy: {
    weapons: ['bazooka', 'grenade', 'handgun'],
    targetLimit: 2,
    aimTime: .45,
    angleError: .11,
    powerError: .12,
    repositions: 0,
  },
  medium: {
    weapons: ['bazooka', 'grenade', 'homing', 'handgun', 'uzi', 'airstrike', 'prod'],
    targetLimit: 4,
    aimTime: .65,
    angleError: .035,
    powerError: .045,
    repositions: 1,
  },
  hard: {
    weapons: ['bazooka', 'grenade', 'cluster', 'homing', 'handgun', 'uzi', 'airstrike', 'sheep', 'prod', 'dynamite', 'mine', 'teleport'],
    targetLimit: Infinity,
    aimTime: .85,
    angleError: .008,
    powerError: .012,
    repositions: 3,
  },
});

const DAMAGE = Object.freeze({
  bazooka: 50, grenade: 50, cluster: 55, homing: 50,
  handgun: 30, uzi: 50, airstrike: 70, sheep: 75,
  prod: 5, dynamite: 75, mine: 50,
});

const BLAST_RADIUS = Object.freeze({
  bazooka: 3.5, grenade: 3.5, cluster: 4.2, homing: 3.5,
  airstrike: 4.5, sheep: 4.5, dynamite: 5, mine: 2.8,
});

export class Bot {
  constructor(game) {
    this.g = game;
    this.ray = new RAPIER.Ray({ x: 0, y: 0 }, { x: 1, y: 0 });
    this.groundRay = new RAPIER.Ray({ x: 0, y: 0 }, { x: 0, y: -1 });
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this.phase = 'thinking';
    this.action = null;
    this.repositions = 0;
    this.moveDirection = 0;
    this.moveRemaining = 0;
    this.aimRemaining = 0;
    this.controlTime = 0;
  }

  get profile() {
    return PROFILES[this.g.teams[this.g.turn.team]?.bot] || PROFILES.easy;
  }

  update(dt) {
    const g = this.g, t = g.turn, level = g.teams[t.team]?.bot, w = g.active;
    if (!level || !w?.alive) return;
    this.elapsed += dt;

    if (this.phase === 'charging' && t.state === TURN.WAITING_INPUT) {
      this.action = null;
      this.phase = 'thinking';
    }
    if (this.phase === 'charging' && t.state === TURN.CHARGING_SHOT) {
      if (t.charge >= this.action.power) t.release();
      g.activeMoved = true;
      return;
    }
    if (this.phase === 'controlling-sheep' && t.state === TURN.ACTION_RESOLVING) {
      this.controlSheep(dt);
      return;
    }
    if (this.phase === 'controlling-gun' && t.state === TURN.ACTION_RESOLVING) {
      this.controlGun(dt);
      return;
    }
    if (this.phase === 'retreating' && t.state === TURN.ACTION_RESOLVING) {
      this.retreat(dt);
      return;
    }
    if (t.state !== TURN.WAITING_INPUT || w.recoveryTime > 0) return;
    if (this.elapsed < 2) return;

    if (!this.action && this.moveRemaining > 0) {
      this.walk(dt, w);
      return;
    }

    if (!this.action) {
      const planned = this.chooseAction(level, w);
      if (planned && level === 'hard' && planned.score < 68 && this.tryReposition(w)) return;
      this.action = planned;
      if (!planned) {
        if (this.tryReposition(w)) return;
        t.shots = 0; t.settle(); this.phase = 'finished'; return;
      }
      this.phase = 'moving';
      this.aimRemaining = this.profile.aimTime;
    }

    if (this.moveRemaining > 0) {
      this.walk(dt, w);
      return;
    }

    if (this.phase === 'moving') {
      this.phase = 'aiming';
      this.aimRemaining = this.profile.aimTime;
    }
    if (this.phase === 'aiming') {
      this.aim(dt, w);
      return;
    }
    if (this.phase === 'ready') this.execute(w, t);
  }

  enemies(w) { return this.g.worms.filter(other => other.alive && other.team !== w.team); }
  allies(w) { return this.g.worms.filter(other => other.alive && other !== w && other.team === w.team); }

  rankedTargets(w, level) {
    const enemies = this.enemies(w);
    const ranked = enemies.map((target) => {
      const distance = Math.hypot(target.x - w.x, target.y - w.y);
      const nearby = enemies.filter(other => other !== target && Math.hypot(other.x - target.x, other.y - target.y) < 5).length;
      const waterRisk = target.y < (this.g.waterLevel || 0) + 5 ? 5 : 0;
      const finish = target.hp <= 35 ? 8 : 0;
      const score = level === 'easy'
        ? -distance + Math.random() * 8
        : finish + nearby * (level === 'hard' ? 6 : 3) + waterRisk - distance * (level === 'hard' ? .12 : .3);
      return { target, score };
    });
    ranked.sort((a, b) => b.score - a.score);
    return ranked.slice(0, this.profile.targetLimit).map(item => item.target);
  }

  chooseAction(level, w) {
    const mask = this.g.terrain.captureCollisionMask();
    const candidates = [];
    for (const target of this.rankedTargets(w, level)) {
      for (const weapon of this.profile.weapons) {
        if (weapon === 'teleport') continue;
        const candidate = this.evaluateWeapon(level, weapon, w, target, mask);
        if (candidate) candidates.push(candidate);
      }
    }
    if (level === 'hard' && (candidates.length === 0 || w.hp <= 35 || w.y <= (this.g.waterLevel || 0) + 4)) {
      const teleport = this.evaluateTeleport(w);
      if (teleport) candidates.push(teleport);
    }
    candidates.sort((a, b) => b.score - a.score);
    if (!candidates.length) return null;
    if (level === 'easy') return candidates[Math.floor(Math.random() * Math.min(3, candidates.length))];
    if (level === 'medium' && candidates.length > 1 && Math.random() < .25) return candidates[1];
    return candidates[0];
  }

  evaluateWeapon(level, weapon, w, target, mask) {
    if (['bazooka', 'grenade', 'cluster', 'homing'].includes(weapon)) return this.evaluateProjectile(level, weapon, w, target, mask);
    if (weapon === 'handgun' || weapon === 'uzi') return this.evaluateGun(weapon, w, target);
    if (weapon === 'airstrike') return this.evaluateAirstrike(w, target, mask);
    if (weapon === 'sheep') return this.evaluateSheep(w, target, mask);
    if (weapon === 'prod') return this.evaluateProd(w, target);
    if (weapon === 'dynamite' || weapon === 'mine') return this.evaluatePlaced(weapon, w, target, mask);
    return null;
  }

  baseScore(weapon, w, target, impact, enemiesHit = 1) {
    const damage = DAMAGE[weapon] || 0;
    const killBonus = target.hp <= damage ? 45 : 0;
    const multiBonus = Math.max(0, enemiesHit - 1) * damage * .65;
    const waterBonus = target.y < (this.g.waterLevel || 0) + 5 ? 22 : 0;
    const distance = impact ? Math.hypot(impact.x - target.x, impact.y - target.y) : 0;
    return damage + killBonus + multiBonus + waterBonus - distance * 7;
  }

  muzzleClear(w, angle, mask) {
    const ux = Math.cos(angle), uy = Math.sin(angle);
    for (let distance = .35; distance <= 1.25; distance += .08) {
      if (this.g.terrain.isSolid(w.x + ux * distance, w.y + uy * distance, mask)) return false;
    }
    return true;
  }

  traceProjectile(w, target, weapon, angle, speed, wind, mask) {
    if (!this.muzzleClear(w, angle, mask)) return null;
    const ux = Math.cos(angle), uy = Math.sin(angle);
    const startX = w.x + ux * 1.05, startY = w.y + uy * 1.05;
    const gravity = this.g.lowGravity ? GRAVITY * .5 : GRAVITY;
    const blast = BLAST_RADIUS[weapon], reach = blast * 1.8;
    let impact = null, impactWorm = null, closestTarget = Infinity;
    for (let time = .02; time <= 6; time += .022) {
      const x = startX + ux * speed * time + .5 * wind * time * time;
      const y = startY + uy * speed * time + .5 * gravity * time * time;
      closestTarget = Math.min(closestTarget, Math.hypot(x - target.x, y - target.y));
      if (x < -2 || x > MAP.width + 2 || y < -2) break;
      for (const worm of this.g.worms) {
        if (!worm.alive || (worm === w && time < .3)) continue;
        if (Math.hypot(x - worm.x, y - worm.y) <= .55) { impact = { x, y, time }; impactWorm = worm; break; }
      }
      if (impact || this.g.terrain.isSolid(x, y, mask)) { impact ||= { x, y, time }; break; }
    }
    if (!impact) return null;
    if (Math.hypot(impact.x - w.x, impact.y - w.y) <= reach + .8) return null;
    if (this.allies(w).some(ally => Math.hypot(impact.x - ally.x, impact.y - ally.y) <= reach + .3)) return null;
    const targetDistance = impactWorm === target ? 0 : Math.hypot(impact.x - target.x, impact.y - target.y);
    if (targetDistance > reach && closestTarget > blast) return null;
    const enemiesHit = this.enemies(w).filter(enemy => Math.hypot(impact.x - enemy.x, impact.y - enemy.y) <= reach).length;
    return { impact, enemiesHit, targetDistance };
  }

  evaluateProjectile(level, weapon, w, target, mask) {
    const gravity = this.g.lowGravity ? GRAVITY * .5 : GRAVITY;
    const wind = ['bazooka', 'homing'].includes(weapon) ? this.g.wind * (level === 'easy' ? 0 : level === 'medium' ? .6 : 1) : 0;
    const dx = target.x - w.x, dy = target.y - w.y;
    let best = null;
    for (let flight = 1.05; flight <= 5.2; flight += level === 'hard' ? .08 : .16) {
      let vx = (dx - .5 * wind * flight * flight) / flight;
      let vy = (dy - .5 * gravity * flight * flight) / flight;
      for (let pass = 0; pass < 4; pass++) {
        const angle = Math.atan2(vy, vx);
        vx = (dx - Math.cos(angle) * 1.05 - .5 * wind * flight * flight) / flight;
        vy = (dy - Math.sin(angle) * 1.05 - .5 * gravity * flight * flight) / flight;
      }
      const speed = Math.hypot(vx, vy);
      if (speed < 8 || speed > 32) continue;
      let angle = Math.atan2(vy, vx), power = (speed - 8) / 24;
      const exactAngle = angle, exactPower = power;
      angle += (Math.random() - .5) * this.profile.angleError * 2;
      power *= 1 + (Math.random() - .5) * this.profile.powerError * 2;
      power = Math.max(0, Math.min(1, power));
      let trace = this.traceProjectile(w, target, weapon, angle, 8 + power * 24, wind, mask);
      if (!trace) {
        angle = exactAngle; power = exactPower;
        trace = this.traceProjectile(w, target, weapon, angle, speed, wind, mask);
      }
      if (!trace) continue;
      const score = this.baseScore(weapon, w, target, trace.impact, trace.enemiesHit) - trace.targetDistance * 5;
      if (['grenade', 'cluster'].includes(weapon) && trace.impact.time < .9) continue;
      const fuse = ['grenade', 'cluster'].includes(weapon) ? Math.max(1, Math.min(5, trace.impact.time)) : undefined;
      if (!best || score > best.score) best = { kind: 'charged', weapon, target, angle, power, fuse, score };
    }
    return best;
  }

  evaluateGun(weapon, w, target) {
    const dx = target.x - w.x, dy = target.y - w.y, distance = Math.hypot(dx, dy);
    if (distance > (weapon === 'handgun' ? 34 : 22) || distance < 2.2) return null;
    this.ray.origin.x = w.x; this.ray.origin.y = w.y; this.ray.dir.x = dx / distance; this.ray.dir.y = dy / distance;
    const hit = this.g.world.castRay(this.ray, distance + 1, true, undefined, undefined, w.collider, w.body);
    if (!hit || hit.collider.handle !== target.collider.handle) return null;
    const angle = Math.atan2(dy, dx);
    const score = this.baseScore(weapon, w, target, null) + (target.hp <= DAMAGE[weapon] ? 20 : 0);
    return { kind: 'instant', weapon, target, angle, score };
  }

  evaluateAirstrike(w, target, mask) {
    if (Math.hypot(w.x - target.x, w.y - target.y) < BLAST_RADIUS.airstrike * 1.8 + 1) return null;
    if (this.allies(w).some(ally => Math.hypot(ally.x - target.x, ally.y - target.y) < 7)) return null;
    for (let y = target.y + 1; y < MAP.height; y += .45) if (this.g.terrain.isSolid(target.x, y, mask)) return null;
    const enemiesHit = this.enemies(w).filter(enemy => Math.abs(enemy.x - target.x) < 7 && Math.abs(enemy.y - target.y) < 5).length;
    const score = this.baseScore('airstrike', w, target, target, enemiesHit) + enemiesHit * 12;
    return { kind: 'targeted', weapon: 'airstrike', target, targetPoint: { x: target.x, y: target.y }, angle: target.x >= w.x ? .4 : Math.PI - .4, score };
  }

  evaluateSheep(w, target, mask) {
    const dx = target.x - w.x, distance = Math.abs(dx);
    if (distance < 8 || distance > 28 || Math.abs(target.y - w.y) > 6) return null;
    const direction = Math.sign(dx) || 1;
    if (!this.muzzleClear(w, direction > 0 ? 0 : Math.PI, mask)) return null;
    let unsupported = 0;
    for (let x = w.x + direction; direction > 0 ? x < target.x : x > target.x; x += direction) {
      let ground = false;
      const expectedY = w.y + (target.y - w.y) * (Math.abs(x - w.x) / distance);
      for (let depth = .5; depth <= 3; depth += .5) if (this.g.terrain.isSolid(x, expectedY - depth, mask)) { ground = true; break; }
      unsupported = ground ? 0 : unsupported + 1;
      if (unsupported >= 3) return null;
    }
    if (this.allies(w).some(ally => Math.hypot(ally.x - target.x, ally.y - target.y) < 8)) return null;
    return { kind: 'sheep', weapon: 'sheep', target, angle: direction > 0 ? 0 : Math.PI, score: this.baseScore('sheep', w, target, null) + 8 };
  }

  evaluateProd(w, target) {
    const dx = target.x - w.x, dy = target.y - w.y, distance = Math.hypot(dx, dy);
    if (distance > 2.7) return null;
    const direction = Math.sign(dx) || w.facing;
    const edgeProbe = target.x + direction * 1.4;
    this.groundRay.origin.x = edgeProbe; this.groundRay.origin.y = target.y + .4;
    const groundAhead = this.g.world.castRay(this.groundRay, 3.2, true, undefined, undefined, target.collider, target.body);
    const fallBonus = groundAhead ? 0 : 75;
    return { kind: 'instant', weapon: 'prod', target, angle: direction > 0 ? 0 : Math.PI, score: 12 + fallBonus };
  }

  retreatPathClear(w, direction, distance, mask) {
    for (let offset = .75; offset <= distance; offset += .75) {
      const x = w.x + direction * offset;
      if (x < 1 || x > MAP.width - 1 || this.g.terrain.isSolid(x, w.y + .2, mask)) return false;
      let support = false;
      for (let depth = .45; depth <= 2.6; depth += .35) if (this.g.terrain.isSolid(x, w.y - depth, mask)) { support = true; break; }
      if (!support) return false;
    }
    return true;
  }

  evaluatePlaced(weapon, w, target, mask) {
    const distance = Math.hypot(target.x - w.x, target.y - w.y);
    const limit = weapon === 'dynamite' ? 4.2 : 5.2;
    if (distance > limit) return null;
    const direction = Math.sign(target.x - w.x) || 1;
    const retreatDirection = -direction;
    if (!this.canWalk(w, retreatDirection)) return null;
    const retreatDistance = weapon === 'dynamite' ? 9.5 : 5.4;
    if (!this.retreatPathClear(w, retreatDirection, retreatDistance, mask)) return null;
    const placement = { x: w.x + direction * .9, y: w.y + .2 };
    const radius = BLAST_RADIUS[weapon] * 1.8;
    if (weapon === 'dynamite' && Math.hypot(target.x - placement.x, target.y - placement.y) > radius) return null;
    if (this.allies(w).some(ally => Math.hypot(ally.x - placement.x, ally.y - placement.y) < radius)) return null;
    const score = this.baseScore(weapon, w, target, placement) + (weapon === 'mine' ? 10 : 0);
    return { kind: 'placed', weapon, target, angle: direction > 0 ? 0 : Math.PI, retreatDirection, score };
  }

  evaluateTeleport(w) {
    let best = null;
    for (let x = 4; x < MAP.width - 4; x += 5) {
      const y = this.g.terrain.spawnHeight(x);
      if (!Number.isFinite(y) || y <= (this.g.waterLevel || 0) + 4) continue;
      if (this.g.worms.some(other => other.alive && other !== w && Math.hypot(other.x - x, other.y - y) < 1.5)) continue;
      const nearestEnemy = Math.min(...this.enemies(w).map(enemy => Math.hypot(enemy.x - x, enemy.y - y)));
      const edgeSafety = Math.min(x, MAP.width - x);
      const height = y * .45;
      const score = nearestEnemy * 1.2 + Math.min(edgeSafety, 12) + height + (w.hp < 30 ? 35 : -25);
      if (!best || score > best.score) best = { kind: 'targeted', weapon: 'teleport', targetPoint: { x, y }, angle: 0, score };
    }
    return best;
  }

  canWalk(w, direction) {
    this.groundRay.origin.x = w.x + direction * .85; this.groundRay.origin.y = w.y + .25;
    return !!this.g.world.castRay(this.groundRay, 2.2, true, undefined, undefined, w.collider, w.body);
  }

  tryReposition(w) {
    if (this.repositions >= this.profile.repositions) return false;
    const target = this.rankedTargets(w, this.g.teams[this.g.turn.team].bot)[0];
    if (!target) return false;
    const toward = Math.sign(target.x - w.x) || 1;
    const directions = [toward, -toward];
    const direction = directions.find(candidate => this.canWalk(w, candidate));
    if (!direction) return false;
    this.repositions++;
    this.moveDirection = direction;
    this.moveRemaining = .7 + this.repositions * .18;
    this.action = null;
    this.phase = 'moving';
    return true;
  }

  walk(dt, w) {
    if (!w.grounded || !this.canWalk(w, this.moveDirection)) { this.moveRemaining = 0; this.action = null; return; }
    const velocity = w.body.linvel();
    w.facing = this.moveDirection;
    w.body.setLinvel({ x: this.moveDirection * 2.5, y: velocity.y }, true);
    this.g.activeMoved = true;
    this.moveRemaining = Math.max(0, this.moveRemaining - dt);
    if (this.moveRemaining === 0) {
      w.body.setLinvel({ x: 0, y: velocity.y }, true);
      this.action = null;
    }
  }

  aim(dt, w) {
    const desired = this.action.angle ?? this.g.angle;
    const difference = Math.atan2(Math.sin(desired - this.g.angle), Math.cos(desired - this.g.angle));
    this.g.angle += difference * Math.min(1, dt * 6);
    if (Math.abs(Math.cos(desired)) > .05) w.facing = Math.cos(desired) < 0 ? -1 : 1;
    this.g.activeMoved = true;
    this.aimRemaining -= dt;
    if (this.aimRemaining <= 0) { this.g.angle = desired; this.phase = 'ready'; }
  }

  execute(w, t) {
    const action = this.action;
    t.weapon = action.weapon;
    this.g.angle = action.angle ?? this.g.angle;
    if (action.fuse) this.g.weapons.fuse = action.fuse;
    if (action.targetPoint) this.g.weapons.setTarget(action.targetPoint.x, action.targetPoint.y);
    if (action.kind === 'charged') {
      this.phase = 'charging';
      t.beginCharge();
      return;
    }
    t.beginCharge();
    if (t.state === TURN.WAITING_INPUT) { this.action = null; this.phase = 'thinking'; return; }
    if (action.kind === 'sheep') { this.phase = 'controlling-sheep'; this.controlTime = 0; }
    else if (action.weapon === 'handgun' || action.weapon === 'uzi') this.phase = 'controlling-gun';
    else if (action.kind === 'placed') { this.phase = 'retreating'; this.moveDirection = action.retreatDirection; this.moveRemaining = action.weapon === 'dynamite' ? 1.9 : 1.8; }
    else this.phase = 'finished';
  }

  controlSheep(dt) {
    this.controlTime += dt;
    const projectile = this.g.weapons.pool.find(item => item.active && item.type === 'sheep' && item.owner === this.g.active);
    if (!projectile) { this.phase = 'finished'; return; }
    const target = this.action.target;
    const closeToTarget = Math.hypot(projectile.x - target.x, projectile.y - target.y) < 3.5;
    const safeDistance = BLAST_RADIUS.sheep * 1.8 + .8;
    const closeToAlly = this.allies(this.g.active).some(ally => Math.hypot(projectile.x - ally.x, projectile.y - ally.y) < safeDistance);
    const closeToSelf = Math.hypot(projectile.x - this.g.active.x, projectile.y - this.g.active.y) < safeDistance;
    if ((closeToTarget || this.controlTime > 8) && !closeToAlly && !closeToSelf) {
      this.g.weapons.remote();
      this.phase = 'finished';
    }
  }

  controlGun(dt) {
    const burst = this.g.weapons.burst;
    if (!burst) { this.phase = 'finished'; return; }
    let target = this.action.target;
    if (!target?.alive) target = this.rankedTargets(this.g.active, this.g.teams[this.g.turn.team].bot)[0];
    if (!target || !this.evaluateGun(this.action.weapon, this.g.active, target)) {
      this.g.weapons.burst = null;
      this.phase = 'finished';
      return;
    }
    this.action.target = target;
    const desired = Math.atan2(target.y - this.g.active.y, target.x - this.g.active.x);
    const difference = Math.atan2(Math.sin(desired - this.g.angle), Math.cos(desired - this.g.angle));
    this.g.angle += difference * Math.min(1, dt * 10);
    this.g.active.facing = Math.cos(this.g.angle) < 0 ? -1 : 1;
  }

  retreat(dt) {
    const w = this.g.active;
    if (!w?.alive || this.moveRemaining <= 0 || !w.grounded || !this.canWalk(w, this.moveDirection)) { this.phase = 'finished'; return; }
    const velocity = w.body.linvel();
    w.facing = this.moveDirection;
    w.body.setLinvel({ x: this.moveDirection * (this.action.weapon === 'dynamite' ? 5 : 3), y: velocity.y }, true);
    this.moveRemaining = Math.max(0, this.moveRemaining - dt);
    this.g.activeMoved = true;
  }
}
