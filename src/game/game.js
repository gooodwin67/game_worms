import * as THREE from 'three';
import RAPIER from '@dimforge/rapier2d-compat';
import { GameLoop, TurnMachine, TURN, MAP, GRAVITY, COLORS, FIXED_DT } from './core.js';
import { Terrain } from './terrain.js';
import { ExplosionParticles } from './particles.js';
import { Weapons, Bot, ARSENAL } from './weapons.js';

const STANDING_SLOPE_NORMAL_Y = Math.cos(80 * Math.PI / 180);

// Зафиксированные параметры утки
const DUCK_PARAMS = {
  bodyScaleX: 0.9,
  bodyScaleY: 1.15,
  bodyScaleZ: 0.9,
  bodyPosY: 0.32,
  bodyRotX: 0,
  bodyRotY: 0,
  bodyRotZ: 0,
  headScale: 1,
  headPosX: 0,
  headPosY: 0.88,
  headPosZ: 0,
  headRotX: 0,
  headRotY: 0.66,
  headRotZ: 0.01,
  beakScaleX: 1,
  beakScaleY: 0.25,
  beakScaleZ: 1,
  beakPosY: -0.1,
  beakPosZ: 0.44,
  beakRotX: 0.18,
  eyeScale: 1.4,
  eyeWidth: 0.72,
  eyeHeight: 1.25,
  eyeSpread: 0.12,
  eyePosY: 0.11,
  eyePosZ: 0.4,
  pupilScale: 0.65,
  pupilShiftX: 0.02,
  helmetScale: 1.06,
  helmetPosY: 0.06,
  helmetPosZ: 0.02,
  helmetTiltX: -0.15,
  helmetTiltY: 1.71,
  helmetTiltZ: -0.42,
  helmetBrimWidth: 0.04,
  wingScaleY: 0.5,
  wingScaleXZ: 1.1,
  wingSpreadZ: 0.28,
  wingPosY: 0.38,
  wingPosX: 0,
  wingBaseRotZ: -0.07,
  wingBaseRotY: -0.22,
  tailScale: 0.75,
  tailPosX: -0.3,
  tailPosY: 0.26,
  tailRotZ: 0.71,
  tailRotY: -0.07
};

export class Game {
  constructor(canvas) {
    this.canvas = canvas; this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x101e30);
    this.camera = new THREE.OrthographicCamera(-48, 48, 27, -27, .1, 200); this.camera.position.set(48, 27, 100);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); this.renderer.setPixelRatio(Math.min(devicePixelRatio || 2, 2)); this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Мягкое освещение для 3D моделей персонажей
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x445566, 1.4);
    this.scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.8);
    dirLight.position.set(20, 40, 50);
    this.scene.add(dirLight);

    this.loop = new GameLoop(this.update.bind(this), this.render.bind(this)); this.keys = new Set(); this.vector = new THREE.Vector3(); this.motion = { x: 0, y: 0 }; this.angle = Math.PI / 4; this.wind = 0; this.zoom = 1; this.time = 0; this.hudTime = 0; this.lowGravity = false;
    this.resize = this.resize.bind(this); window.addEventListener('resize', this.resize); window.visualViewport?.addEventListener('resize', this.resize); this.resize();
    this.inMenu = true; this.installUI(); this.bindInput();
  }


  createWeaponMesh(type) {
    const group = new THREE.Group();
    const darkMat = new THREE.MeshToonMaterial({ color: 0x242d38 });
    const woodMat = new THREE.MeshToonMaterial({ color: 0x8b5a2b });
    const metalMat = new THREE.MeshToonMaterial({ color: 0x718096 });

    switch (type) {
      case 'bazooka': {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 12), new THREE.MeshToonMaterial({ color: 0x4a5d3f }));
        barrel.rotation.z = -Math.PI / 2;
        barrel.position.x = 0.2;
        const exhaust = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.15, 12), darkMat);
        exhaust.rotation.z = Math.PI / 2;
        exhaust.position.x = -0.22;
        group.add(barrel, exhaust);
        break;
      }
      case 'handgun':
      case 'uzi':
      case 'minigun':
      case 'shotgun': {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8), metalMat);
        barrel.rotation.z = -Math.PI / 2;
        barrel.position.x = 0.25;
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.06), woodMat);
        stock.position.x = -0.15;
        group.add(barrel, stock);
        break;
      }
      case 'mortar':
      case 'homing':
      case 'pigeon':
      case 'magicBullet': {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.75, 10), metalMat);
        barrel.rotation.z = -Math.PI / 2;
        barrel.position.x = 0.22;
        group.add(barrel);
        break;
      }
      case 'longbow': {
        const bow = new THREE.Mesh(new THREE.TorusGeometry(.2, .035, 8, 16, Math.PI), woodMat);
        bow.rotation.z = -Math.PI / 2;
        group.add(bow);
        break;
      }
      case 'grenade':
      case 'cluster': {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), new THREE.MeshToonMaterial({ color: type === 'grenade' ? 0x2e6f40 : 0xd97706 }));
        const pin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.04), darkMat);
        pin.position.y = 0.12;
        group.add(ball, pin);
        break;
      }
      case 'dynamite': {
        for (let i = -1; i <= 1; i++) {
          const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 8), new THREE.MeshToonMaterial({ color: 0xdc2626 }));
          stick.position.set(0.05, i * 0.06, 0);
          stick.rotation.z = Math.PI / 2;
          group.add(stick);
        }
        break;
      }
      case 'mine': {
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.08, 12), new THREE.MeshToonMaterial({ color: 0xd97706 }));
        const light = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
        light.position.y = 0.05;
        group.add(disc, light);
        break;
      }
      case 'sheep': {
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), new THREE.MeshToonMaterial({ color: 0xf8fafc }));
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), darkMat);
        head.position.set(0.15, 0.05, 0);
        group.add(body, head);
        break;
      }
      case 'drill':
      case 'pneumaticDrill':
      case 'blowTorch': {
        const motor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.14), new THREE.MeshToonMaterial({ color: 0xfacc15 }));
        const bit = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.25, 8), metalMat);
        bit.rotation.z = -Math.PI / 2;
        bit.position.x = 0.22;
        group.add(motor, bit);
        break;
      }
      case 'teleport':
      case 'airstrike':
      case 'jetPack': {
        const device = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.06), darkMat);
        const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 6), metalMat);
        antenna.position.set(0.06, 0.16, 0);
        group.add(device, antenna);
        break;
      }
      default: {
        // Заглушка/рукопашная
        const item = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), metalMat);
        group.add(item);
      }
    }
    return group;
  }

  // Фабрика сборки 3D-персонажа (Боевая утка)
  createDuck(teamColor) {
    const p = DUCK_PARAMS;
    const root = new THREE.Group();

    // Общие материалы
    const bodyMat = new THREE.MeshToonMaterial({ color: teamColor });
    const beakMat = new THREE.MeshToonMaterial({ color: 0xfcb823 });
    const scleraMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x11161b });
    const wingMat = new THREE.MeshToonMaterial({ color: 0x6e87ca });
    const helmetMat = new THREE.MeshToonMaterial({ color: 0x485a3a });
    const strapMat = new THREE.MeshBasicMaterial({ color: 0x272c20 });

    // 1. Тело
    const bodyPivot = new THREE.Group();
    bodyPivot.position.set(0, p.bodyPosY, 0);
    bodyPivot.rotation.set(p.bodyRotX, p.bodyRotY, p.bodyRotZ);
    root.add(bodyPivot);

    const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 20), bodyMat);
    bodyMesh.scale.set(p.bodyScaleX, p.bodyScaleY, p.bodyScaleZ);
    bodyPivot.add(bodyMesh);

    // 2. Хвост
    const tailPivot = new THREE.Group();
    tailPivot.position.set(p.tailPosX, p.tailPosY, 0);
    tailPivot.rotation.set(0, p.tailRotY, p.tailRotZ);
    tailPivot.scale.setScalar(p.tailScale);
    root.add(tailPivot);

    const tailMesh = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 12), bodyMat);
    tailPivot.add(tailMesh);

    // 3. Крылья
    const wingGeo = new THREE.SphereGeometry(0.18, 14, 14);
    wingGeo.scale(0.2, 1.3, 0.5);
    wingGeo.translate(0, -0.12, 0);

    const wingLPivot = new THREE.Group();
    wingLPivot.position.set(p.wingPosX, p.wingPosY, p.wingSpreadZ);
    wingLPivot.rotation.set(0, p.wingBaseRotY, p.wingBaseRotZ);
    root.add(wingLPivot);

    const wingLMesh = new THREE.Mesh(wingGeo, wingMat);
    wingLMesh.scale.set(p.wingScaleXZ, p.wingScaleY, p.wingScaleXZ);
    wingLPivot.add(wingLMesh);

    const wingRPivot = new THREE.Group();
    wingRPivot.position.set(p.wingPosX, p.wingPosY, -p.wingSpreadZ);
    wingRPivot.rotation.set(0, -p.wingBaseRotY, -p.wingBaseRotZ);
    root.add(wingRPivot);

    const wingRMesh = new THREE.Mesh(wingGeo, wingMat);
    wingRMesh.scale.set(p.wingScaleXZ, p.wingScaleY, p.wingScaleXZ);
    wingRPivot.add(wingRMesh);

    // 4. Голова
    const headGroup = new THREE.Group();
    headGroup.position.set(p.headPosX, p.headPosY, p.headPosZ);
    headGroup.rotation.set(p.headRotX, p.headRotY, p.headRotZ);
    root.add(headGroup);

    const headPivot = new THREE.Group();
    headPivot.scale.setScalar(p.headScale);
    headGroup.add(headPivot);

    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.48, 24, 24), bodyMat);
    headPivot.add(headMesh);

    // 5. Клюв
    const beakPivot = new THREE.Group();
    beakPivot.position.set(0, p.beakPosY, p.beakPosZ);
    beakPivot.rotation.set(p.beakRotX, 0, 0);
    headGroup.add(beakPivot);

    const beakMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.23, 0.11, 20), beakMat);
    beakMesh.scale.set(p.beakScaleX, p.beakScaleY, p.beakScaleZ);
    beakPivot.add(beakMesh);

    // 6. Глаза
    const eyeGroup = new THREE.Group();
    eyeGroup.scale.setScalar(p.eyeScale);
    eyeGroup.position.set(0, p.eyePosY, p.eyePosZ);
    headGroup.add(eyeGroup);

    function createEye(isLeft) {
      const eye = new THREE.Group();
      eye.position.set(isLeft ? -p.eyeSpread : p.eyeSpread, 0, 0);

      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), scleraMat);
      sclera.scale.set(p.eyeWidth, p.eyeHeight, 0.6);
      eye.add(sclera);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), pupilMat);
      pupil.scale.set(0.65, 1.2, 0.4);
      pupil.scale.multiplyScalar(p.pupilScale);
      pupil.position.set(isLeft ? p.pupilShiftX : -p.pupilShiftX, 0.01, 0.08);
      eye.add(pupil);

      return eye;
    }
    eyeGroup.add(createEye(true), createEye(false));

    // 7. Каска
    const helmetGroup = new THREE.Group();
    helmetGroup.scale.setScalar(p.helmetScale);
    helmetGroup.position.set(0, p.helmetPosY, p.helmetPosZ);
    helmetGroup.rotation.set(p.helmetTiltX, p.helmetTiltY, p.helmetTiltZ);
    headGroup.add(helmetGroup);

    const helmetDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.51, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.47),
      helmetMat
    );
    helmetGroup.add(helmetDome);

    const helmetBrim = new THREE.Mesh(new THREE.TorusGeometry(0.5, p.helmetBrimWidth, 10, 28), helmetMat);
    helmetBrim.rotation.x = Math.PI / 2;
    helmetBrim.position.y = 0.02;
    helmetGroup.add(helmetBrim);

    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.02, 8, 24, Math.PI), strapMat);
    strap.rotation.z = Math.PI;
    strap.rotation.y = Math.PI / 2;
    helmetGroup.add(strap);

    // Приводим масштаб фигурки к физическому коллайдеру червяка (0.23, 0.38)
    const scaleFactor = 1.12;
    root.scale.set(scaleFactor, scaleFactor, scaleFactor);
    root.position.y = -0.68; // Опираем лапки на дно капсулы

    // Слот для оружия (расположен у переднего крыла со смещением вперед)
    const weaponPivot = new THREE.Group();
    weaponPivot.position.set(0.15, p.wingPosY, p.wingSpreadZ + 0.05);
    root.add(weaponPivot);


    // Черный контурный силуэт позади утки для четкого контраста на любом фоне
    const outlineMat = new THREE.MeshBasicMaterial({ color: 0x050508, side: THREE.BackSide });

    // Дублируем меши тела и головы с небольшим масштабом для обводки
    const bodyOutline = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 16), outlineMat);
    bodyOutline.scale.set(p.bodyScaleX * 1.18, p.bodyScaleY * 1.15, p.bodyScaleZ * 1.18);
    bodyPivot.add(bodyOutline);

    const headOutline = new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 16), outlineMat);
    headOutline.scale.setScalar(p.headScale * 1.16);
    headPivot.add(headOutline);

    // Вращающиеся узлы для процедурной анимации
    return {
      root,
      bodyPivot,
      headGroup,
      wingLPivot,
      wingRPivot,
      tailPivot,
      weaponPivot,
      currentWeapon: null,
      weaponMesh: null,
      dispose: () => {
        root.removeFromParent();
        root.traverse(child => {
          if (child.isMesh) {
            child.geometry.dispose();
            if (child.material.dispose) child.material.dispose();
          }
        });
      }
    };
  }

  async load() {
    await RAPIER.init();

    // Загружаем картинку карты (PNG с прозрачностью)
    const img = new Image();
    img.src = './map.png'; // путь к твоему файлу
    await new Promise(resolve => {
      img.onload = resolve;
      img.onerror = () => resolve(); // если файл не найден, создастся процедурная
    });
    this.customMapImage = img.complete && img.naturalWidth !== 0 ? img : null;

    this.configure();
  }

  configure() {
    this.loop.pause();
    if (this.world) {
      this.terrain.dispose();
      this.particles.dispose();
      this.weapons.dispose();
      if (this.water) { this.water.removeFromParent(); this.water.geometry.dispose(); this.water.material.dispose(); }
      for (const w of this.worms) {
        w.duck.dispose();
        w.label.remove();
      }
      this.events.free();
      this.world.free();
    }
    this.world = new RAPIER.World({ x: 0, y: GRAVITY });
    this.lowGravity = false;
    this.world.timestep = FIXED_DT;
    this.events = new RAPIER.EventQueue(true);
    // Проверяем, какой режим выбран в стартовом меню
    const useFile = document.querySelector('input[name="mapSource"]:checked')?.value === 'custom';
    const mapImage = (useFile && this.customMapImage) ? this.customMapImage : null;

    this.terrain = new Terrain(this.scene, this.world, mapImage);
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(MAP.width, 1), new THREE.MeshBasicMaterial({ color: 0x2f8fb3, transparent: true, opacity: .72 }));
    this.water.position.set(MAP.width / 2, -.5, -.05);
    this.water.visible = false;
    this.scene.add(this.water);
    this.particles = new ExplosionParticles(this.scene);
    this.weapons = new Weapons(this);
    this.bot = new Bot(this);

    this.worms = [];
    this.teams = [];
    this.wormByCollider = new Map();
    this.winner = null;
    this.active = null;
    this.waterLevel = 0;
    this.time = 0;
    this.angle = Math.PI / 4;
    this.keys.clear();

    const count = Math.max(2, Math.min(6, Number(this.teamCount.value) || 3)),
      perTeam = Math.max(1, Math.min(4, Number(this.wormCount.value) || 3));
    const rows = this.teamRows.children;

    for (let t = 0; t < count; t++) {
      const name = rows[t].querySelector('input').value.trim() || `Игрок ${t + 1}`,
        bot = rows[t].querySelector('select').value;
      const team = { name, bot, worms: [] };
      this.teams.push(team);

      for (let i = 0; i < perTeam; i++) {
        const x = 5 + (i * count + t) * (MAP.width - 10) / Math.max(1, count * perTeam - 1),
          y = this.terrain.spawnHeight(x);
        const body = this.world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y).lockRotations().setLinearDamping(.12).setCcdEnabled(true)
        );
        const collider = this.world.createCollider(
          RAPIER.ColliderDesc.capsule(.23, .38).setMass(1).setFriction(.38).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(0),
          body
        );

        // Создаем 3D-утку для команды
        const duck = this.createDuck(COLORS[t]);
        const mesh = new THREE.Group();
        mesh.add(duck.root);
        mesh.position.set(x, y, 0);
        this.scene.add(mesh);

        const label = document.createElement('div');
        label.className = 'worm-label';
        const text = document.createElement('span');
        text.textContent = `${name} · ${i + 1}`;
        const health = document.createElement('progress');
        health.max = 100;
        health.value = 100;
        label.append(text, health);
        this.labels.append(label);

        const worm = {
          body, collider, mesh, duck, label, health, team: t,
          hp: 100, alive: true, state: 'airborne', facing: 1, slideTime: 0, speedBoost: false, invisible: false, frozen: false, poison: 0, radiation: 0,
          x, y, previousX: x, previousY: y, vx: 0, vy: 0,
          grounded: false, groundNormalX: 0, groundNormalY: 1,
          animTime: Math.random() * 5
        };

        this.worms.push(worm);
        team.worms.push(worm);
        this.wormByCollider.set(collider.handle, worm);
      }
    }

    this.groundRay = new RAPIER.Ray({ x: 0, y: 0 }, { x: 0, y: -1 });
    this.contactNormal = { x: 0, y: 0 };
    this.readSupportManifold = (manifold, flipped) => {
      if (manifold.numSolverContacts() === 0) return;
      manifold.normal(this.contactNormal);
      const sign = flipped ? 1 : -1;
      const nx = this.contactNormal.x * sign, ny = this.contactNormal.y * sign;
      if (ny <= 0) return;
      for (let i = 0; i < manifold.numSolverContacts(); i++) {
        if (manifold.solverContactDist(i) > .05) continue;
        const w = this.supportWorm;
        if (!w.grounded || ny > w.groundNormalY) { w.groundNormalX = nx; w.groundNormalY = ny; }
        w.grounded = true; break;
      }
    };
    this.readSupportCollider = collider => this.world.contactPair(this.supportWorm.collider, collider, this.readSupportManifold);
    this.turn = new TurnMachine(this);
    this.turn.next();

    this.world.step(this.events);
    this.syncWorms();

    this.motion.x = 0; this.motion.y = 0;
    for (const w of this.worms) {
      w.body.setLinvel(this.motion, false);
      w.body.sleep();
      w.vx = 0; w.vy = 0; w.slideTime = 0; w.grounded = true; w.state = 'alive';
      w.previousX = w.x; w.previousY = w.y;
      w.mesh.position.set(w.x, w.y, 0);
    }

    this.camera.position.set(48, 27, 100);
    this.zoom = 1.2;

    if (!this.aim) {
      this.aim = new THREE.Group();
      const barLength = 3.5;
      const barHeight = 0.12;

      const barGeo = new THREE.PlaneGeometry(barLength, barHeight);
      barGeo.translate(barLength / 2, 0, 0);

      const bgMat = new THREE.MeshBasicMaterial({ color: 0x1c2b3d, transparent: true, opacity: 0.65 });
      this.aimBackground = new THREE.Mesh(barGeo, bgMat);
      this.aimBackground.position.set(0.9, 0, 0.09);
      this.aim.add(this.aimBackground);

      this.aimFillMat = new THREE.MeshBasicMaterial({ color: 0x44ff66, transparent: true, opacity: 0.95 });
      this.aimFill = new THREE.Mesh(barGeo, this.aimFillMat);
      this.aimFill.position.set(0.9, 0, 0.1);
      this.aim.add(this.aimFill);

      const crosshairGeo = new THREE.RingGeometry(0.18, 0.26, 20);
      const crosshairMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
      this.aimReticle = new THREE.Mesh(crosshairGeo, crosshairMat);
      this.aimReticle.position.set(0.9 + barLength + 0.3, 0, 0.1);
      this.aim.add(this.aimReticle);

      this.chargeColorStart = new THREE.Color(0x44ff66);
      this.chargeColorMid = new THREE.Color(0xffd166);
      this.chargeColorEnd = new THREE.Color(0xff3344);
      this.tempColor = new THREE.Color();

      this.scene.add(this.aim);
    }
  }

  createExplosion(x, y, radius) { this.terrain.createExplosion(x, y, radius); for (const w of this.worms) if (w.alive) w.body.wakeUp(); }
  damage(w, amount, force = false) {
    if (!w.alive || (w.frozen && !force)) return;
    w.hp = Math.max(0, w.hp - amount);
    w.health.value = w.hp;
    w.health.title = `${w.hp} HP`;
    if (w.hp === 0) {
      w.alive = false;
      w.state = 'dead';
      w.mesh.visible = false;
      w.label.hidden = true;
      this.wormByCollider.delete(w.collider.handle);
      this.world.removeRigidBody(w.body);
    }
  }

  start() { if (this.world) { this.inMenu = false; this.matchHud.hidden = false; this.labels.hidden = false; this.loop.start(); } }
  pause() { this.loop.pause(); this.keys.clear(); if (this.turn?.state === TURN.CHARGING_SHOT) { this.turn.state = TURN.WAITING_INPUT; this.turn.charge = 0; } }
  resume() { if (!this.inMenu && document.visibilityState === 'visible') this.start(); }
  get running() { return this.loop.running; }
  humanInput() { return this.running && !this.winner && this.active?.alive && !this.teams[this.turn.team].bot; }

  update(dt) {
    this.time += dt;
    this.particles.update(this.time);
    if (!this.winner) { this.turn.update(dt); this.bot.update(dt); }

    if (this.humanInput() && (this.turn.state === TURN.WAITING_INPUT || this.weapons.retreat > 0) && (!this.weapons.movementMode || (this.weapons.movementMode.mode === 'bungee' && !this.weapons.movementMode.airborne) || (this.weapons.movementMode.mode === 'parachute' && this.active.grounded))) {
      const w = this.active,
        direction = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
      const jump = this.keys.delete('KeyW');
      if (direction) {
        w.facing = direction;
        if (Math.cos(this.angle) * direction < 0) this.angle = Math.PI - this.angle;
      }
      if (w.grounded) {
        if (direction) {
          const blend = 1 - Math.exp(-9 * dt);
          const walkSpeed = w.speedBoost ? 6.8 : 3.4;
          this.motion.x = w.vx + (direction * walkSpeed * w.groundNormalY - w.vx) * blend;
          this.motion.y = w.vy + (-direction * walkSpeed * w.groundNormalX - w.vy) * blend;
          w.body.setLinvel(this.motion, true);
        }
        if (jump) {
          this.motion.x = w.facing * 3.8 + w.vx * .25;
          this.motion.y = 5.8;
          w.body.setLinvel(this.motion, true);
          w.grounded = false;
        }
      }
      if (this.keys.has('ArrowUp')) this.angle += dt;
      if (this.keys.has('ArrowDown')) this.angle -= dt;
    }

    for (const w of this.worms) {
      w.previousX = w.x; w.previousY = w.y;
      if (!w.alive) continue;
      w.slideTime = Math.max(0, w.slideTime - dt);
      const walkable = w.grounded && w.groundNormalY >= STANDING_SLOPE_NORMAL_Y;
      w.collider.setFriction(w.slideTime > 0 || !walkable ? .12 : .38);
      if (!walkable || w.body.isSleeping()) continue;

      const velocity = w.body.linvel(), nx = w.groundNormalX, ny = w.groundNormalY;
      const normalSpeed = velocity.x * nx + velocity.y * ny;
      if (normalSpeed > .3) continue;

      const tangentSpeed = velocity.x * ny - velocity.y * nx;
      let tangentDelta = this.world.gravity.y * nx * dt;
      const moving = w === this.active && this.humanInput() &&
        (this.turn.state === TURN.WAITING_INPUT || this.weapons.retreat > 0 || this.weapons.movementMode) &&
        (this.keys.has('KeyA') || this.keys.has('KeyD') || this.keys.has('ArrowLeft') || this.keys.has('ArrowRight'));

      if (!moving) {
        const braking = w.slideTime > 0 ? 1.2 : 7;
        tangentDelta -= tangentSpeed * (1 - Math.exp(-braking * dt));
        if (w.slideTime === 0 && Math.abs(tangentSpeed) < .3 && Math.abs(normalSpeed) < .3) {
          this.motion.x = 0; this.motion.y = 0;
          w.body.setLinvel(this.motion, false);
          w.body.sleep();
          w.vx = 0; w.vy = 0;
          continue;
        }
      }
      this.motion.x = ny * tangentDelta * w.body.mass();
      this.motion.y = -nx * tangentDelta * w.body.mass();
      w.body.applyImpulse(this.motion, false);
    }
    if (this.humanInput() && (this.weapons.burst || this.weapons.flame)) {
      if (this.keys.has('ArrowUp')) this.angle += dt;
      if (this.keys.has('ArrowDown')) this.angle -= dt;
    }
    this.weapons.updateMovement(dt);
    this.world.step(this.events);
    this.weapons.update(dt);
    this.syncWorms();
  }

  syncWorms() {
    for (const w of this.worms) if (w.alive) {
      const wasGrounded = w.grounded, fallSpeed = w.vy;
      const p = w.body.translation(), v = w.body.linvel();
      w.x = p.x; w.y = p.y; w.vx = v.x; w.vy = v.y;
      if (w.y < -3 || w.x < -3 || w.x > MAP.width + 3) { this.damage(w, w.hp, true); continue; }
      if (this.waterLevel > 0 && w.y < this.waterLevel) { this.damage(w, w.hp, true); continue; }
      if (w.body.isSleeping()) continue;

      w.grounded = false; w.groundNormalX = 0; w.groundNormalY = 1;
      this.supportWorm = w;
      this.world.contactPairsWith(w.collider, this.readSupportCollider);

      if (!w.grounded && w.vy <= .2) {
        for (let i = -1; i <= 1; i++) {
          const offset = i * .25;
          this.groundRay.origin.x = w.x + offset;
          this.groundRay.origin.y = w.y - .23;
          const footDepth = Math.sqrt(.38 * .38 - offset * offset);
          const hit = this.world.castRayAndGetNormal(this.groundRay, footDepth + .08, true, undefined, undefined, w.collider, w.body);
          if (hit && hit.normal.y > 0) {
            w.grounded = true;
            w.groundNormalX = hit.normal.x;
            w.groundNormalY = hit.normal.y;
            break;
          }
        }
      }
      if (w.grounded && !wasGrounded && fallSpeed < -1) w.slideTime = .45;
      w.state = w.grounded ? 'alive' : 'airborne';
    }
  }

  render(dt, alpha) {
    const target = this.weapons.projectile || this.active;
    const smoothing = 1 - Math.exp(-5 * dt);
    this.camera.zoom += (this.zoom - this.camera.zoom) * smoothing;
    this.camera.updateProjectionMatrix();

    const halfW = (this.camera.right - this.camera.left) / 2 / this.camera.zoom,
      halfH = (this.camera.top - this.camera.bottom) / 2 / this.camera.zoom;
    if (target) {
      const x = halfW >= MAP.width / 2 ? MAP.width / 2 : THREE.MathUtils.clamp(target.x, halfW, MAP.width - halfW),
        y = halfH >= MAP.height / 2 ? MAP.height / 2 : THREE.MathUtils.clamp(target.y, halfH, MAP.height - halfH);
      this.camera.position.x += (x - this.camera.position.x) * smoothing;
      this.camera.position.y += (y - this.camera.position.y) * smoothing;
    }
    this.camera.updateMatrixWorld();

    // Процедурные анимации для каждой утки
    // Процедурные анимации и оружие для каждой утки
    for (const w of this.worms) if (w.alive) {
      w.mesh.visible = !w.invisible || w === this.active;
      w.label.hidden = w.invisible && w !== this.active;
      w.animTime += dt;
      const posX = w.previousX + (w.x - w.previousX) * alpha;
      const posY = w.previousY + (w.y - w.previousY) * alpha;
      w.mesh.position.set(posX, posY, 0);

      // Разворот в сторону взгляда
      w.duck.root.scale.x = Math.abs(w.duck.root.scale.x) * w.facing;

      const d = w.duck;
      const p = DUCK_PARAMS;
      const isWalking = w.grounded && Math.abs(w.vx) > 0.3;
      const isAirborne = !w.grounded;

      // Отображение оружия у активного стрелка
      const isShootingActive = (w === this.active) &&
        (this.turn.state === TURN.WAITING_INPUT || this.turn.state === TURN.CHARGING_SHOT);

      if (isShootingActive) {
        if (d.currentWeapon !== this.turn.weapon) {
          if (d.weaponMesh) d.weaponMesh.removeFromParent();
          d.weaponMesh = this.createWeaponMesh(this.turn.weapon);
          d.weaponPivot.add(d.weaponMesh);
          d.currentWeapon = this.turn.weapon;
        }
        d.weaponPivot.visible = true;

        // Поворот оружия по направлению прицеливания с учётом стороны взгляда
        const aimAngle = (w.facing > 0) ? this.angle : (Math.PI - this.angle);
        d.weaponPivot.rotation.z = aimAngle;
      } else {
        if (d.weaponPivot) d.weaponPivot.visible = false;
      }

      // Состояния анимации утки
      if (isWalking) {
        const step = w.animTime * 11;
        const wobble = Math.sin(step);
        w.mesh.rotation.z = wobble * 0.12;
        d.wingLPivot.rotation.x = Math.cos(step) * 0.4;
        d.wingRPivot.rotation.x = -Math.cos(step) * 0.4;
        d.wingLPivot.rotation.z = p.wingBaseRotZ + Math.abs(wobble) * 0.3;
        d.wingRPivot.rotation.z = -p.wingBaseRotZ - Math.abs(wobble) * 0.3;
        d.bodyPivot.position.y = p.bodyPosY + Math.abs(Math.cos(step)) * 0.05;
      } else if (isAirborne) {
        const flap = Math.sin(w.animTime * 22);
        w.mesh.rotation.z = THREE.MathUtils.clamp(w.vy * 0.04, -0.4, 0.4);
        d.wingLPivot.rotation.z = p.wingBaseRotZ + flap * 0.85;
        d.wingRPivot.rotation.z = -p.wingBaseRotZ - flap * 0.85;
        d.wingLPivot.rotation.x = 0.2;
        d.wingRPivot.rotation.x = -0.2;
        d.tailPivot.rotation.z = p.tailRotZ + flap * 0.15;
      } else {
        const breath = Math.sin(w.animTime * 3) * 0.03;
        w.mesh.rotation.z = 0;
        d.bodyPivot.scale.set(p.bodyScaleX * (1 + breath * 0.3), p.bodyScaleY * (1 - breath), p.bodyScaleZ * (1 + breath * 0.3));
        d.headGroup.position.y = p.headPosY - breath * 0.25;

        // Если утка держит оружие, приподнимаем крыло, иначе обычное дыхание
        if (isShootingActive) {
          d.wingLPivot.rotation.set(0, p.wingBaseRotY, p.wingBaseRotZ - 0.4);
        } else {
          d.wingLPivot.rotation.set(0, p.wingBaseRotY, p.wingBaseRotZ + breath * 0.6);
        }
        d.wingRPivot.rotation.set(0, -p.wingBaseRotY, -p.wingBaseRotZ - breath * 0.6);
        d.tailPivot.rotation.set(0, p.tailRotY, p.tailRotZ);
      }
    }

    const showAim = !!this.active?.alive && !this.winner &&
      (this.turn.state === TURN.WAITING_INPUT || this.turn.state === TURN.CHARGING_SHOT);
    this.aim.visible = showAim;

    if (showAim) {
      this.aim.position.copy(this.active.mesh.position);
      this.aim.rotation.z = this.angle;

      const charge = THREE.MathUtils.clamp(this.turn.charge, 0, 1);
      this.aimFill.scale.x = charge;
      this.aimFill.scale.y = 1 + charge * 0.4;

      if (charge < 0.5) {
        this.tempColor.copy(this.chargeColorStart).lerp(this.chargeColorMid, charge * 2);
      } else {
        this.tempColor.copy(this.chargeColorMid).lerp(this.chargeColorEnd, (charge - 0.5) * 2);
      }
      this.aimFillMat.color.copy(this.tempColor);

      if (charge > 0.95) {
        const pulse = 1 + Math.sin(this.time * 25) * 0.2;
        this.aimReticle.scale.set(pulse, pulse, 1);
        this.aimReticle.material.color.setHex(0xff3344);
      } else {
        this.aimReticle.scale.set(1, 1, 1);
        this.aimReticle.material.color.setHex(0xffffff);
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.hudTime += dt;
    if (this.hudTime >= .05) { this.hudTime = 0; this.updateHUD(); }
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth),
      height = Math.max(1, this.canvas.clientHeight),
      aspect = width / height;
    this.width = width;
    this.height = height;
    const h = Math.max(MAP.height, MAP.width / aspect) / 2;
    this.camera.left = -h * aspect;
    this.camera.right = h * aspect;
    this.camera.top = h;
    this.camera.bottom = -h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  bindInput() {
    window.addEventListener('keydown', e => {
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || !this.humanInput()) return;
      if (['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { if (!this.weapons.remote()) this.turn.beginCharge(); }
      if (e.code === 'Enter') this.weapons.dropWeapon();
      if (/Digit[1-5]/.test(e.code) && this.turn.state === TURN.WAITING_INPUT) {
        if (this.turn.weapon === 'madCows') this.weapons.cowCount = Number(e.code.slice(-1));
        else this.weapons.fuse = Number(e.code.slice(-1));
      }
      if (e.code === 'Equal' || e.code === 'NumpadAdd') this.weapons.bounce = .7;
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.weapons.bounce = .2;
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      if (e.code === 'Space' && this.humanInput()) this.turn.release();
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      if (this.turn?.state === TURN.CHARGING_SHOT) {
        this.turn.state = TURN.WAITING_INPUT;
        this.turn.charge = 0;
      }
    });
    this.canvas.addEventListener('pointermove', e => {
      if (!this.humanInput()) return;
      const rect = this.canvas.getBoundingClientRect();
      this.vector.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1, 0).unproject(this.camera);
      if (this.turn.state === TURN.WAITING_INPUT || this.turn.state === TURN.CHARGING_SHOT) {
        this.angle = Math.atan2(this.vector.y - this.active.y, this.vector.x - this.active.x);
        this.active.facing = Math.cos(this.angle) < 0 ? -1 : 1;
      }
    });
    this.canvas.addEventListener('pointerdown', e => {
      if (e.button === 0 && this.humanInput()) {
        this.canvas.setPointerCapture(e.pointerId);
        if (this.weapons.remote()) return;
        if (this.turn.state === TURN.WAITING_INPUT && this.weapons.usesTarget(this.turn.weapon)) {
          const rect = this.canvas.getBoundingClientRect();
          this.vector.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1, 0).unproject(this.camera);
          this.weapons.setTarget(this.vector.x, this.vector.y);
          if (['homing', 'pigeon', 'magicBullet'].includes(this.turn.weapon)) return;
        }
        this.turn.beginCharge();
      }
    });
    this.canvas.addEventListener('pointerup', e => {
      if (e.button === 0 && this.humanInput()) this.turn.release();
    });
    this.canvas.addEventListener('pointercancel', () => {
      if (this.turn?.state === TURN.CHARGING_SHOT) this.turn.state = TURN.WAITING_INPUT;
    });
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(-e.deltaY * .001), 1, 3);
    }, { passive: false });
  }

  installUI() {
    const start = document.querySelector('#start-button');
    const setup = document.createElement('div');
    setup.className = 'match-setup';
    setup.innerHTML = `
      <div class="match-options">
        <label>Команды <input id="team-count" type="number" min="2" max="6" value="3"></label>
        <label>Червей <input id="worm-count" type="number" min="1" max="4" value="3"></label>
      </div>
      <div class="map-select-row" style="margin: 10px 0; display: flex; gap: 8px; align-items: center; justify-content: center;">
        <label style="cursor: pointer;"><input type="radio" name="mapSource" value="generate" checked> Генерировать</label>
        <label style="cursor: pointer;"><input type="radio" name="mapSource" value="custom"> Из файла</label>
        <input type="file" id="map-file-input" accept="image/png, image/jpeg, image/webp" style="display: none; max-width: 140px; font-size: 11px;">
      </div>
      <div id="team-rows"></div>
    `;
    start.before(setup);

    this.teamCount = setup.querySelector('#team-count');
    this.wormCount = setup.querySelector('#worm-count');
    this.teamRows = setup.querySelector('#team-rows');
    this.customMapImage = null;

    const fileInput = setup.querySelector('#map-file-input');
    const radioInputs = setup.querySelectorAll('input[name="mapSource"]');

    radioInputs.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
          fileInput.style.display = 'inline-block';
          if (!this.customMapImage) fileInput.click();
        } else {
          fileInput.style.display = 'none';
        }
      });
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const img = new Image();
        img.onload = () => {
          this.customMapImage = img;
        };
        img.src = evt.target.result;
      };
      reader.readAsDataURL(file);
    });

    for (let i = 0; i < 6; i++) {
      const row = document.createElement('div');
      row.className = 'team-row';
      row.innerHTML = `<input aria-label="Имя команды ${i + 1}" maxlength="24" value="Игрок ${i + 1}"><select aria-label="Управление командой ${i + 1}"><option value="">Человек</option><option value="easy">Бот · легко</option><option value="medium">Бот · средне</option><option value="hard">Бот · сложно</option></select>`;
      row.hidden = i >= 3;
      this.teamRows.append(row);
    }
    this.teamCount.addEventListener('input', () => {
      for (let i = 0; i < 6; i++) this.teamRows.children[i].hidden = i >= Math.max(2, Math.min(6, Number(this.teamCount.value) || 3));
    });

    this.labels = document.createElement('div');
    this.labels.className = 'worm-labels';
    this.labels.hidden = true;

    this.matchHud = document.createElement('section');
    this.matchHud.className = 'match-hud';
    this.matchHud.hidden = true;
    this.matchHud.innerHTML = '<div class="match-status" aria-live="polite"></div><div class="weapon-row"><button data-weapon="bazooka">Базука</button><button data-weapon="grenade">Граната</button><button data-weapon="shotgun">Дробовик ×2</button><button class="restart-match">Новый матч</button></div><progress class="charge" max="1" value="0"></progress><p class="controls-help">A/D или ←/→ — ходить · W — прыжок · мышь или ↑/↓ — прицел · удерживайте пробел / ЛКМ — сила · 1–5 — запал · колесо — зум</p>';

    const weaponRow = this.matchHud.querySelector('.weapon-row');
    weaponRow.querySelectorAll('[data-weapon]').forEach(button => button.remove());
    for (const [id, name] of Object.entries(ARSENAL)) {
      const button = document.createElement('button');
      button.dataset.weapon = id;
      button.textContent = name;
      weaponRow.insertBefore(button, weaponRow.lastElementChild);
    }

    const hint = document.createElement('p');
    hint.className = 'weapon-hint';
    this.matchHud.append(hint);
    this.weaponHint = hint;

    document.querySelector('#game-root').append(this.labels, this.matchHud);
    this.weaponButtons = this.matchHud.querySelectorAll('[data-weapon]');
    this.status = this.matchHud.querySelector('.match-status');
    this.chargeBar = this.matchHud.querySelector('.charge');

    this.matchHud.querySelectorAll('[data-weapon]').forEach(button => button.addEventListener('click', () => {
      if (this.humanInput() && this.turn.state === TURN.WAITING_INPUT && !this.turn.lockedWeapon) {
        this.turn.weapon = button.dataset.weapon;
        this.weapons.resetTarget();
      }
    }));

    this.matchHud.querySelector('.restart-match').addEventListener('click', () => {
      this.pause();
      this.inMenu = true;
      this.matchHud.hidden = true;
      this.labels.hidden = true;
      document.querySelector('#start-screen').hidden = false;
      document.querySelector('#start-screen').classList.add('overlay--visible');
    });

    // При клике на "Старт" обновляем мир под выбранный режим карты
    start.addEventListener('click', () => {
      this.configure();
      this.start();
    });
  }

  updateHUD() {
    const t = this.turn;
    const text = this.winner || `${this.teams[t.team].name} · ${Math.ceil(t.remaining)} с · ${t.state} · Ветер ${this.wind >= 0 ? '→' : '←'} ${Math.abs(this.wind).toFixed(1)} · Запал ${this.weapons.fuse} с · ${t.weapon === 'shotgun' ? `Выстрелов: ${t.shots}` : t.weapon}`;
    const hints = { girder: 'Прицел — угол; ЛКМ — поставить в свободном месте', girderPack: 'ЛКМ — поставить балку; за ход можно поставить пять', mbBomb: 'ЛКМ — сбросить бомбу сверху', holy: 'Удерживайте пробел — сила броска; взрыв после 3 секунд и остановки', moleBomb: 'Пробел — выпустить, затем начать бурение, затем взорвать', skunk: 'Пробел — выпустить; ещё раз — выпустить газ', salvation: 'Пробел — выпустить; ещё раз — взорвать', superBanana: 'Пробел — бросить; затем разделить; затем взорвать осколки', homing: 'ЛКМ — отметить цель; затем удерживайте пробел для пуска', pigeon: 'ЛКМ — выбрать цель; пробел — выпустить голубя', magicBullet: 'ЛКМ — выбрать цель; пробел — выпустить волшебную пулю', airstrike: 'ЛКМ на карте — вызвать авиаудар', napalm: 'ЛКМ на карте — вызвать огненный удар', mailstrike: 'ЛКМ на карте — вызвать почтовый удар', minestrike: 'ЛКМ на карте — сбросить минное поле', moleSquadron: 'ЛКМ на карте — вызвать эскадрон кротов', donkey: 'ЛКМ на карте — сбросить бетонного осла', indianTest: 'Пробел — поднять воду и заразить незамороженных бойцов', frenchSheep: 'ЛКМ на карте — выбрать точку удара', madCows: '1–5 — размер стада; пробел — выпустить в выбранном направлении', carpet: 'ЛКМ на карте — выбрать зону бомбардировки', armageddon: 'Пробел — метеоритный дождь по всей карте', teleport: 'ЛКМ в свободном месте — телепортироваться', ninjaRope: 'Прицел + пробел — зацепиться; A/D — качаться; W/S — длина; пробел — отпустить', sheep: 'Пробел — выпустить овечку; ещё раз — взорвать', superSheep: 'Пробел — выпустить, затем взлететь, затем взорвать; A/D или ←/→ — поворот', sheepLauncher: 'Пробел — выпустить овечку; ещё раз — взорвать', drill: 'Пробел — бурить вниз', pneumaticDrill: 'Пробел — бурить вниз', blowTorch: 'Пробел — прокладывать горизонтальный тоннель', uppercut: 'Пробел — ударить противника перед собой', mine: 'Пробел — установить мину; затем отойти', dynamite: 'Пробел — установить динамит; затем отойти', jetPack: 'Пробел — включить/снять; W/↑ — тяга вверх, A/D — в стороны; Enter — сбросить оружие', bungee: 'Стрелки — спускаться на банджи', parachute: 'Стрелки — управлять парашютом', fastWalk: 'A/D — двигаться с удвоенной скоростью' };
    const hint = this.weapons.message || hints[t.weapon] || (this.weapons.needsCharge(t.weapon) ? 'Удерживайте пробел / ЛКМ для силы выстрела' : 'Пробел / ЛКМ — применить оружие');
    if (this.weaponHint.textContent !== hint) this.weaponHint.textContent = hint;
    if (this.status.textContent !== text) this.status.textContent = text;
    this.chargeBar.value = t.charge;

    for (const button of this.weaponButtons) {
      button.classList.toggle('selected', button.dataset.weapon === t.weapon);
      button.disabled = !this.humanInput() || t.state !== TURN.WAITING_INPUT || !!t.lockedWeapon;
    }

    for (const w of this.worms) if (w.alive) {
      this.vector.copy(w.mesh.position);
      this.vector.y += 1.4;
      this.vector.project(this.camera);
      w.label.style.transform = `translate(${(this.vector.x * .5 + .5) * this.width}px,${(-this.vector.y * .5 + .5) * this.height}px) translate(-50%,-100%)`;
      w.label.classList.toggle('active', w === this.active);
    }
  }
}
