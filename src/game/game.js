import * as THREE from 'three';
import RAPIER from '@dimforge/rapier2d-compat';
import { GameLoop, TurnMachine, TURN, MAP, GRAVITY, COLORS, FIXED_DT } from './core.js';
import { Terrain } from './terrain.js';
import { ExplosionParticles } from './particles.js';
import { Weapons, Bot, ARSENAL } from './weapons.js';
import { WeaponPanel } from './weapon-panel.js';
import { WeaponArt, disposeWeaponMesh } from './weapon-art.js';

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
const WORM_NAMES = [
  'Крякен', 'Селезень', 'Сержант Кряк', 'Бомбардир', 'Дональд',
  'Крякадзе', 'Перочин', 'Майор Пух', 'Даффи', 'Штурмовик',
  'Пулемётчик', 'Крылан', 'Генерал Гусь', 'Лапчатый', 'Охотник',
  'Взрывутка', 'Ути-Пути', 'Снайпер', 'Крякозябра', 'Броникряк',
  'Зенитка', 'Терминатор', 'Динамит', 'Капитан Плавник', 'Рядовой Кряк',
  'Адмирал Клюв', 'Фугас', 'Осколок', 'Плюх', 'Вжик',
  'Партизан', 'Громила', 'Шквал', 'Клюворез', 'Торпеда',
  'Рикошет', 'Калибр', 'Патрон', 'Базукер', 'Корсар'
];

export class Game {
  constructor(canvas, audio = null) {
    this.audio = audio;
    this.canvas = canvas; this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x101e30);
    this.camera = new THREE.OrthographicCamera(-48, 48, 27, -27, .1, 200); this.camera.position.set(48, 27, 100);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); this.renderer.setPixelRatio(Math.min(devicePixelRatio || 2, 2)); this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Мягкое освещение для 3D моделей персонажей
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x445566, 1.4);
    this.scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.8);
    dirLight.position.set(20, 40, 50);
    this.scene.add(dirLight);

    this.loop = new GameLoop(this.update.bind(this), this.render.bind(this)); this.keys = new Set(); this.vector = new THREE.Vector3(); this.motion = { x: 0, y: 0 }; this.angle = Math.PI / 4; this.wind = 0; this.zoom = 1; this.time = 0; this.hudTime = 0; this.footstepTimer = 0; this.lowGravity = false;
    this.resize = this.resize.bind(this); window.addEventListener('resize', this.resize); window.visualViewport?.addEventListener('resize', this.resize); this.resize();
    this.inMenu = true; this.installUI(); this.bindInput();
  }


  createWeaponMesh(type) { return this.weaponArt.create(type); }

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
    this.weaponArt = new WeaponArt(Object.keys(ARSENAL));
    await this.weaponArt.load();

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
    this.weaponPanel?.close();
    this.loop.pause();
    if (this.world) {
      this.terrain.dispose();
      this.particles.dispose();
      this.weapons.dispose();
      if (this.water) { this.water.removeFromParent(); this.water.geometry.dispose(); this.water.material.dispose(); }
      for (const w of this.worms) {
        disposeWeaponMesh(w.duck.weaponMesh);
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
    this.winningTeam = null;
    this.victoryTime = 0;
    this.active = null;
    this.waterLevel = 0;
    this.time = 0;
    this.angle = Math.PI / 4;
    this.keys.clear();

    const count = Math.max(2, Math.min(6, Number(this.teamCount.value) || 3)),
      perTeam = Math.max(1, Math.min(4, Number(this.wormCount.value) || 3));
    const rows = this.teamRows.children;
    const spawnCount = count * perTeam;
    const spawnSegment = (MAP.width - 10) / spawnCount;
    const spawnXs = Array.from({ length: spawnCount }, (_, index) =>
      5 + (index + .18 + Math.random() * .64) * spawnSegment
    );
    for (let i = spawnXs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spawnXs[i], spawnXs[j]] = [spawnXs[j], spawnXs[i]];
    }
    let spawnIndex = 0;

    // Перемешиваем пул имён для матча без повторов
    const availableNames = [...WORM_NAMES].sort(() => Math.random() - 0.5);
    let nameIndex = 0;

    for (let t = 0; t < count; t++) {
      const name = rows[t].querySelector('input').value.trim() || `Команда ${t + 1}`,
        bot = rows[t].querySelector('select').value;
      const team = { name, bot, color: COLORS[t], worms: [] };
      this.teams.push(team);

      for (let i = 0; i < perTeam; i++) {
        const x = spawnXs[spawnIndex++],
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

        // Берём персональное имя из пула
        const wormName = availableNames[nameIndex % availableNames.length];
        nameIndex++;

        const label = document.createElement('div');
        label.className = 'worm-label';
        const text = document.createElement('span');
        text.textContent = wormName;
        // Подкрашиваем рамку и текст в цвет команды
        text.style.borderColor = `#${COLORS[t].toString(16).padStart(6, '0')}`;
        text.style.color = `#${COLORS[t].toString(16).padStart(6, '0')}`;

        const health = document.createElement('progress');
        health.max = 100;
        health.value = 100;
        label.append(text, health);
        this.labels.append(label);

        const worm = {
          body, collider, mesh, duck, label, health, team: t,
          name: wormName,
          hp: 100, alive: true, state: 'airborne', facing: 1, slideTime: 0, speedBoost: false, invisible: false, frozen: false, poison: 0, radiation: 0,
          x, y, previousX: x, previousY: y, vx: 0, vy: 0,
          grounded: false, airborneTime: 0, airbornePeakY: y, hardFalling: false, recoveryTime: 0, groundNormalX: 0, groundNormalY: 1,
          animTime: Math.random() * 5,
          victoryPhase: Math.random() * Math.PI * 2,
          jumpTapTime: -Infinity, backflipEligibleUntil: -Infinity, backflipRequested: false, backflipStart: -Infinity, backflipping: false, jumpFacing: 1
        };

        this.worms.push(worm);
        team.worms.push(worm);
        this.wormByCollider.set(collider.handle, worm);
      }
    }

    this.rebuildTeamHealthHud();

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
      w.vx = 0; w.vy = 0; w.slideTime = 0; w.grounded = true; w.airborneTime = 0; w.airbornePeakY = w.y; w.hardFalling = false; w.recoveryTime = 0; w.state = 'alive';
      w.previousX = w.x; w.previousY = w.y;
      w.mesh.position.set(w.x, w.y, 0);
    }

    this.camera.position.set(48, 27, 100);
    this.zoom = 1.2;

    if (!this.aim) {
      this.aim = new THREE.Group();

      // 1. Конус силы выстрела (трапеция со скруглением на конце)
      // Размеры: длина 2.6, ширина у основания 0.12, на конце 0.55
      const coneLength = 2.6;
      const coneGeo = new THREE.PlaneGeometry(coneLength, 0.6, 1, 1);
      // Смещаем pivot к началу (дулу оружия)
      coneGeo.translate(coneLength / 2, 0, 0);

      this.aimConeMat = new THREE.ShaderMaterial({
        uniforms: {
          charge: { value: 0.0 }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float charge;
          varying vec2 vUv;

          void main() {
            // Если заряд нулевой — конус полностью скрыт
            if (charge <= 0.001) discard;

            // vUv.x идёт от 0.0 (дуло) до 1.0 (макс. длина)
            // Обрезаем длину конуса строго по уровню заряда
            if (vUv.x > charge) discard;

            // Форма конуса: узкий у дула, широкий на конце
            float halfWidth = mix(0.12, 0.48, vUv.x);
            float distFromCenter = abs(vUv.y - 0.5);

            // Скругляем вершину растущего конуса
            float tipDist = (vUv.x - (charge - 0.08)) / 0.08;
            if (tipDist > 0.0) {
              halfWidth *= sqrt(max(0.0, 1.0 - tipDist * tipDist));
            }

            if (distFromCenter > halfWidth) discard;

            // Концентрические градиентные слои как в Worms:
            // Красный -> Красно-оранжевый -> Оранжевый -> Желто-песочный
            float t = vUv.x;
            vec3 colDarkRed   = vec3(0.78, 0.12, 0.10);
            vec3 colOrangeRed = vec3(0.92, 0.32, 0.12);
            vec3 colOrange    = vec3(0.96, 0.62, 0.22);
            vec3 colYellow    = vec3(0.98, 0.82, 0.52);

            vec3 color = colDarkRed;
            if (t > 0.65) {
              color = mix(colOrange, colYellow, (t - 0.65) / 0.35);
            } else if (t > 0.3) {
              color = mix(colOrangeRed, colOrange, (t - 0.3) / 0.35);
            } else {
              color = mix(colDarkRed, colOrangeRed, t / 0.3);
            }

            // Тонкое затемнение по внешним боковым краям конуса
            float edgeFactor = smoothstep(halfWidth, halfWidth * 0.7, distFromCenter);
            color = mix(color * 0.75, color, edgeFactor);

            gl_FragColor = vec4(color, 0.95);
          }
        `,
        transparent: true,
        depthWrite: false
      });

      this.aimCone = new THREE.Mesh(coneGeo, this.aimConeMat);
      this.aimCone.position.set(0.65, 0, 0.1);
      this.aim.add(this.aimCone);

      // 2. Аутентичный прицел-перекрестие Worms (кружок + перекрестие + точка)
      this.aimReticle = new THREE.Group();

      // Внешнее кольцо
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.24, 0.29, 24),
        new THREE.MeshBasicMaterial({ color: 0xff6b7a, side: THREE.DoubleSide })
      );

      // Перекрестие
      const crossH = new THREE.Mesh(
        new THREE.PlaneGeometry(0.58, 0.05),
        new THREE.MeshBasicMaterial({ color: 0xff6b7a })
      );
      const crossV = new THREE.Mesh(
        new THREE.PlaneGeometry(0.05, 0.58),
        new THREE.MeshBasicMaterial({ color: 0xff6b7a })
      );

      // Центральная белая точка
      const centerDot = new THREE.Mesh(
        new THREE.CircleGeometry(0.05, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      centerDot.position.z = 0.01;

      this.aimReticle.add(ring, crossH, crossV, centerDot);
      // Прицел находится сразу за максимальной границей конуса
      this.aimReticle.position.set(0.65 + coneLength + 0.35, 0, 0.12);
      this.aim.add(this.aimReticle);

      this.scene.add(this.aim);
    }
  }

  rebuildTeamHealthHud() {
    this.teamHealthHud.replaceChildren();
    this.teamHealthCards = this.teams.map((team) => {
      const card = document.createElement('div');
      card.className = 'team-health-card';
      card.style.setProperty('--team-color', `#${team.color.toString(16).padStart(6, '0')}`);
      card.innerHTML = '<span class="team-health-name"></span><strong class="team-health-value"></strong><div class="team-health-track"><i></i></div>';
      card.querySelector('.team-health-name').textContent = team.name;
      this.teamHealthHud.append(card);
      return card;
    });
  }

  createExplosion(x, y, radius) { this.audio?.play('explosion'); const colors = this.terrain.createExplosion(x, y, radius) || []; for (const w of this.worms) if (w.alive) w.body.wakeUp(); return colors; }
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

  start() { if (this.world) { this.inMenu = false; this.matchHud.hidden = false; this.teamHealthHud.hidden = false; this.audioTestHud.hidden = false; this.labels.hidden = false; this.loop.start(); } }
  pause() { this.weaponPanel?.close(); this.loop.pause(); this.keys.clear(); if (this.turn?.state === TURN.CHARGING_SHOT) this.turn.cancelCharge(); }
  resume() { if (!this.inMenu && document.visibilityState === 'visible') this.start(); }
  get running() { return this.loop.running; }
  humanInput() { return this.running && !this.winner && this.active?.alive && !this.teams[this.turn.team].bot; }

  update(dt) {
    this.time += dt;
    this.particles.update(this.time);
    for (const worm of this.worms) worm.recoveryTime = Math.max(0, worm.recoveryTime - dt);
    if (this.winner) this.victoryTime += dt;
    else { this.turn.update(dt); this.bot.update(dt); }

    if (this.humanInput() && this.active.recoveryTime <= 0 && (this.turn.state === TURN.WAITING_INPUT || this.weapons.retreat > 0) && (!this.weapons.movementMode || (this.weapons.movementMode.mode === 'bungee' && !this.weapons.movementMode.airborne) || (this.weapons.movementMode.mode === 'parachute' && this.active.grounded))) {

      const w = this.active,
        direction = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
      const jump = this.keys.delete('KeyW');
      const backflip = w.backflipRequested && this.time <= w.backflipEligibleUntil && !this.weapons.movementMode;
      w.backflipRequested = false;
      // Если боец пошёл, прыгнул или начал заряжать выстрел — скрываем плашку
      if (direction !== 0 || jump || backflip || this.turn.state === TURN.CHARGING_SHOT) {
        this.activeMoved = true;
      }

      if (this.keys.has('ArrowUp') || this.keys.has('ArrowDown')) {
        this.activeMoved = true;
      }
      if (direction) {
        w.facing = direction;
        if (Math.cos(this.angle) * direction < 0) this.angle = Math.PI - this.angle;
      }
      if (backflip) {
        this.audio?.play('jump');
        this.footstepTimer = 0;
        w.airbornePeakY = w.y;
        w.backflipping = true;
        w.backflipStart = this.time;
        w.backflipEligibleUntil = -Infinity;
        this.motion.x = -w.jumpFacing * 2.25;
        this.motion.y = 7.6;
        w.body.setLinvel(this.motion, true);
        w.grounded = false;
      } else if (w.grounded) {
        if (direction) {
          this.footstepTimer -= dt;
          if (this.footstepTimer <= 0) { this.audio?.play('footstep'); this.footstepTimer = w.speedBoost ? .18 : .28; }
          const blend = 1 - Math.exp(-9 * dt);
          const walkSpeed = w.speedBoost ? 6.8 : 3.4;
          this.motion.x = w.vx + (direction * walkSpeed * w.groundNormalY - w.vx) * blend;
          this.motion.y = w.vy + (-direction * walkSpeed * w.groundNormalX - w.vy) * blend;
          w.body.setLinvel(this.motion, true);
        }
        if (jump) {
          this.audio?.play('jump');
          this.footstepTimer = 0;
          w.airbornePeakY = w.y;
          w.jumpFacing = w.facing;
          w.backflipEligibleUntil = this.time + .38;
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
    this.syncWorms(dt);
  }

  syncWorms(dt = 0) {
    for (const w of this.worms) if (w.alive) {
      const wasGrounded = w.grounded, fallSpeed = w.vy;
      this.resolveTerrainPenetration(w);
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
      if (!w.grounded) {
        w.airborneTime += dt;
        w.airbornePeakY = Math.max(w.airbornePeakY, w.y);
        w.hardFalling = w.airborneTime >= .4 && (w.airbornePeakY - w.y >= 3.5 || w.vy < -5.5);
      } else {
        const wasActuallyAirborne = !wasGrounded && w.airborneTime >= .4;
        const hardLanding = wasActuallyAirborne && (w.airbornePeakY - w.y >= 3.5 || fallSpeed < -5.5);
        if (wasActuallyAirborne && fallSpeed < -2) {
          w.slideTime = .45;
        }
        if (hardLanding) {
          w.recoveryTime = 1.45;
          this.audio?.play('landing');
        }
        w.airborneTime = 0;
        w.airbornePeakY = w.y;
        w.hardFalling = false;
        if (w.backflipping && this.time - w.backflipStart > .18) w.backflipping = false;
      }
      w.state = w.grounded ? 'alive' : 'airborne';
    }
  }

  resolveTerrainPenetration(w) {
    const position = w.body.translation();
    const embedded = this.terrain.isSolid(position.x, position.y) ||
      this.terrain.isSolid(position.x - .27, position.y - .12) ||
      this.terrain.isSolid(position.x + .27, position.y - .12) ||
      this.terrain.isSolid(position.x, position.y + .32);
    if (!embedded) return false;

    const samples = [[0, .34], [-.28, .14], [.28, .14], [-.3, -.12], [.3, -.12], [0, -.49]];
    const isClear = y => samples.every(([dx, dy]) => !this.terrain.isSolid(position.x + dx, y + dy));
    const step = 1 / MAP.pixelsPerUnit;
    for (let lift = step; lift <= 2.5; lift += step) {
      if (!isClear(position.y + lift)) continue;
      w.body.setTranslation({ x: position.x, y: position.y + lift + .03 }, true);
      const velocity = w.body.linvel();
      w.body.setLinvel({ x: velocity.x, y: Math.max(0, velocity.y) }, true);
      w.body.wakeUp();
      w.grounded = false;
      return true;
    }
    return false;
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
      const isWinningWorm = this.winner && this.winningTeam === w.team;
      w.mesh.visible = !w.invisible || w === this.active;
      w.label.hidden = w.invisible && w !== this.active;
      w.animTime += dt;
      const posX = w.previousX + (w.x - w.previousX) * alpha;
      const posY = w.previousY + (w.y - w.previousY) * alpha;
      w.mesh.position.set(posX, posY, 0);

      // Разворот в сторону взгляда
      w.duck.root.scale.x = Math.abs(w.duck.root.scale.x) * (isWinningWorm ? 1 : w.facing);

      const d = w.duck;
      const p = DUCK_PARAMS;
      d.bodyPivot.scale.set(1, 1, 1);
      d.bodyPivot.position.y = p.bodyPosY;
      d.headGroup.position.y = p.headPosY;
      d.headGroup.rotation.set(p.headRotX, p.headRotY, p.headRotZ);
      const isWalking = w.grounded && Math.abs(w.vx) > 0.3;
      const isAirborne = !w.grounded;
      const isRecovering = w.recoveryTime > 0;

      // Отображение оружия у активного стрелка
      const isShootingActive = !this.winner && (w === this.active) && !isRecovering &&
        (this.turn.state === TURN.WAITING_INPUT || this.turn.state === TURN.CHARGING_SHOT);

      if (isShootingActive) {
        if (d.currentWeapon !== this.turn.weapon) {
          disposeWeaponMesh(d.weaponMesh);
          d.weaponMesh = this.createWeaponMesh(this.turn.weapon);
          w.mesh.add(d.weaponMesh);
          d.currentWeapon = this.turn.weapon;
        }
        d.weaponPivot.visible = false;
        d.weaponMesh.visible = true;

        // Поворот оружия по направлению прицеливания с учётом стороны взгляда
        const aimAngle = (w.facing > 0) ? this.angle : (Math.PI - this.angle);
        const thought = this.weaponArt.thought(this.turn.weapon);
        d.weaponMesh.position.set(thought ? w.facing * .95 : w.facing * .28, thought ? 1.9 : -.05, 2);
        d.weaponMesh.scale.x = thought ? 1 : w.facing;
        d.weaponMesh.rotation.z = thought ? -w.mesh.rotation.z : aimAngle * w.facing;
      } else {
        if (d.weaponPivot) d.weaponPivot.visible = false;
        if (d.weaponMesh) d.weaponMesh.visible = false;
      }

      // Состояния анимации утки
      if (isWinningWorm) {
        const jump = Math.abs(Math.sin(this.victoryTime * 4.4 + w.victoryPhase));
        const flap = Math.sin(this.victoryTime * 18 + w.victoryPhase * 1.7);
        w.mesh.position.y += jump * .72;
        w.mesh.rotation.z = Math.sin(this.victoryTime * 8.8 + w.victoryPhase) * .07;
        d.headGroup.rotation.set(0, 0, 0);
        d.headGroup.position.y = p.headPosY + jump * .08;
        d.bodyPivot.scale.set(1 + jump * .05, 1 - jump * .08, 1 + jump * .05);
        d.wingLPivot.rotation.set(.18, p.wingBaseRotY, p.wingBaseRotZ + flap * 1.05);
        d.wingRPivot.rotation.set(-.18, -p.wingBaseRotY, -p.wingBaseRotZ - flap * 1.05);
        d.tailPivot.rotation.set(0, p.tailRotY, p.tailRotZ + flap * .12);
      } else if (isRecovering) {
        const elapsed = 1.45 - w.recoveryTime;
        const side = -w.facing;
        if (elapsed < .34) {
          const impact = elapsed / .34;
          w.mesh.rotation.z = side * (1.35 - impact * .12);
          d.bodyPivot.scale.set(1.08, .78, 1.08);
          d.headGroup.position.y = p.headPosY - .18;
        } else if (elapsed < .92) {
          const rise = THREE.MathUtils.smoothstep(elapsed, .34, .92);
          w.mesh.rotation.z = side * 1.23 * (1 - rise);
          d.bodyPivot.scale.set(1.08 - rise * .08, .78 + rise * .22, 1.08 - rise * .08);
          d.headGroup.position.y = p.headPosY - .18 * (1 - rise);
        } else {
          const settle = (elapsed - .92) / .53;
          w.mesh.rotation.z = Math.sin(elapsed * 38) * .13 * (1 - settle);
          d.bodyPivot.scale.set(1, 1, 1);
          d.headGroup.position.y = p.headPosY + Math.sin(elapsed * 24) * .035 * (1 - settle);
          d.wingLPivot.rotation.z = p.wingBaseRotZ + Math.sin(elapsed * 31) * .5 * (1 - settle);
          d.wingRPivot.rotation.z = -p.wingBaseRotZ - Math.sin(elapsed * 31) * .5 * (1 - settle);
        }
      } else if (isWalking) {
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
        const fallRotation = -w.facing * Math.PI * .86;
        const targetRotation = w.hardFalling ? fallRotation : THREE.MathUtils.clamp(w.vy * 0.04, -0.4, 0.4);
        if (w.backflipping) {
          const flipProgress = THREE.MathUtils.clamp((this.time - w.backflipStart) / .72, 0, 1);
          w.mesh.rotation.z = -w.jumpFacing * flipProgress * Math.PI * 2;
        } else {
          w.mesh.rotation.z += (targetRotation - w.mesh.rotation.z) * Math.min(1, dt * (w.hardFalling ? 7 : 10));
        }
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

      // Перекрестие прицела всегда сохраняет горизонтальное положение (не крутится вокруг своей оси)
      this.aimReticle.rotation.z = -this.angle;

      const charge = THREE.MathUtils.clamp(this.turn.charge, 0, 1);

      // Конус заполняется только при наборе силы
      this.aimConeMat.uniforms.charge.value = charge;

      // При максимальном заряде прицел пульсирует
      if (charge > 0.96) {
        const pulse = 1.0 + Math.sin(this.time * 24) * 0.15;
        this.aimReticle.scale.set(pulse, pulse, 1);
      } else {
        this.aimReticle.scale.set(1, 1, 1);
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
    this.canvas.addEventListener('contextmenu', e => { e.preventDefault(); this.weaponPanel.flip(); });
    window.addEventListener('keydown', e => {
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || !this.humanInput()) return;
      if (e.code === 'Escape' && this.weaponPanel.open) { e.preventDefault(); this.weaponPanel.close(true); return; }
      if (/^F([1-9]|1[0-2])$/.test(e.code)) { e.preventDefault(); if (!e.repeat) this.weaponPanel.shortcut(e.code); return; }
      if (this.weaponPanel.open) return;
      if (['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyW') {
        const w = this.active;
        if (w && this.time - w.jumpTapTime <= .38) w.backflipRequested = true;
        if (w) w.jumpTapTime = this.time;
      }
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
        this.turn.cancelCharge();
      }
    });
    this.canvas.addEventListener('pointermove', e => {
      if (!this.humanInput() || this.weaponPanel.open) return;
      const rect = this.canvas.getBoundingClientRect();
      this.vector.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1, 0).unproject(this.camera);
      if (this.turn.state === TURN.WAITING_INPUT || this.turn.state === TURN.CHARGING_SHOT) {
        this.angle = Math.atan2(this.vector.y - this.active.y, this.vector.x - this.active.x);
        this.active.facing = Math.cos(this.angle) < 0 ? -1 : 1;
        this.activeMoved = true; // <-- Мышь сдвинулась для прицела — плашка исчезает
      }
    });
    this.canvas.addEventListener('pointerdown', e => {
      if (e.button === 0 && this.weaponPanel.open) { this.weaponPanel.close(); return; }
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
      this.turn?.cancelCharge();
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
      row.innerHTML = `<input aria-label="Имя команды ${i + 1}" maxlength="24" value="Команда ${i + 1}"><select aria-label="Управление командой ${i + 1}"><option value="">Человек</option><option value="easy">Бот · легко</option><option value="medium">Бот · средне</option><option value="hard">Бот · сложно</option></select>`;
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
    this.matchHud.innerHTML = '<div class="match-status" aria-live="polite"></div><div class="weapon-row"><button type="button" class="arsenal-toggle">Арсенал · ПКМ</button><button class="restart-match">Новый матч</button></div><progress class="charge" max="1" value="0"></progress><p class="controls-help">ПКМ — арсенал · F1–F12 — оружие · A/D — ходить · W — прыжок · дважды W — сальто назад · мышь / ↑↓ — прицел · пробел / ЛКМ — огонь · 1–5 — запал</p>';
    this.weaponPanel = new WeaponPanel(this, this.matchHud.querySelector('.arsenal-toggle'));

    const hint = document.createElement('p');
    hint.className = 'weapon-hint';
    this.matchHud.append(hint);
    this.weaponHint = hint;

    this.audioTestHud = document.createElement('aside');
    this.audioTestHud.className = 'audio-test-hud';
    this.audioTestHud.hidden = true;
    this.audioTestHud.innerHTML = '<strong>Тест звука заряда</strong><span class="audio-test-caption">Натуральный вариант</span><div class="audio-test-buttons"></div>';
    const audioButtons = this.audioTestHud.querySelector('.audio-test-buttons');
    const audioVariants = [['▶ Натуральный', 'energyCharge']];
    for (const [label, name] of audioVariants) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        this.audioTestHud.querySelector('.audio-test-caption').textContent = `Играет: ${label}`;
        this.audio?.preview(name);
      });
      audioButtons.append(button);
    }

    this.teamHealthHud = document.createElement('section');
    this.teamHealthHud.className = 'team-health-hud';
    this.teamHealthHud.hidden = true;
    this.teamHealthCards = [];

    document.querySelector('#game-root').append(this.labels, this.matchHud, this.teamHealthHud, this.audioTestHud);
    this.weaponButtons = this.weaponPanel.buttons;
    this.status = this.matchHud.querySelector('.match-status');
    this.chargeBar = this.matchHud.querySelector('.charge');

    this.matchHud.querySelector('.restart-match').addEventListener('click', () => {
      this.pause();
      this.inMenu = true;
      this.matchHud.hidden = true;
      this.teamHealthHud.hidden = true;
      this.audioTestHud.hidden = true;
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
    this.weaponPanel.refresh();
    const botThinking = this.teams[t.team]?.bot && t.state === TURN.WAITING_INPUT && this.bot.elapsed < 2;
    const turnState = botThinking ? 'ДУМАЕТ…' : t.state;
    const text = this.winner || `${this.teams[t.team].name} · ${Math.ceil(t.remaining)} с · ${turnState} · Ветер ${this.wind >= 0 ? '→' : '←'} ${Math.abs(this.wind).toFixed(1)} · Запал ${this.weapons.fuse} с · ${t.weapon === 'shotgun' ? `Выстрелов: ${t.shots}` : ARSENAL[t.weapon] || t.weapon}`;
    const hints = { girder: 'Прицел — угол; ЛКМ — поставить в свободном месте', girderPack: 'ЛКМ — поставить балку; за ход можно поставить пять', mbBomb: 'ЛКМ — сбросить бомбу сверху', holy: 'Удерживайте пробел — сила броска; взрыв после 3 секунд и остановки', moleBomb: 'Пробел — выпустить, затем начать бурение, затем взорвать', skunk: 'Пробел — выпустить; ещё раз — выпустить газ', salvation: 'Пробел — выпустить; ещё раз — взорвать', superBanana: 'Пробел — бросить; затем разделить; затем взорвать осколки', homing: 'ЛКМ — отметить цель; затем удерживайте пробел для пуска', pigeon: 'ЛКМ — выбрать цель; пробел — выпустить голубя', magicBullet: 'ЛКМ — выбрать цель; пробел — выпустить волшебную пулю', airstrike: 'ЛКМ на карте — вызвать авиаудар', napalm: 'ЛКМ на карте — вызвать огненный удар', mailstrike: 'ЛКМ на карте — вызвать почтовый удар', minestrike: 'ЛКМ на карте — сбросить минное поле', moleSquadron: 'ЛКМ на карте — вызвать эскадрон кротов', donkey: 'ЛКМ на карте — сбросить бетонного осла', indianTest: 'Пробел — поднять воду и заразить незамороженных бойцов', frenchSheep: 'ЛКМ на карте — выбрать точку удара', madCows: '1–5 — размер стада; пробел — выпустить в выбранном направлении', carpet: 'ЛКМ на карте — выбрать зону бомбардировки', armageddon: 'Пробел — метеоритный дождь по всей карте', teleport: 'ЛКМ в свободном месте — телепортироваться', ninjaRope: 'Прицел + пробел — зацепиться; A/D — качаться; W/S — длина; пробел — отпустить', sheep: 'Пробел — выпустить овечку; ещё раз — взорвать', superSheep: 'Пробел — выпустить, затем взлететь, затем взорвать; A/D или ←/→ — поворот', sheepLauncher: 'Пробел — выпустить овечку; ещё раз — взорвать', drill: 'Пробел — бурить вниз', pneumaticDrill: 'Пробел — бурить вниз', blowTorch: 'Пробел — прокладывать горизонтальный тоннель', uppercut: 'Пробел — ударить противника перед собой', mine: 'Пробел — установить мину; затем отойти', dynamite: 'Пробел — установить динамит; затем отойти', jetPack: 'Пробел — включить/снять; W/↑ — тяга вверх, A/D — в стороны; Enter — сбросить оружие', bungee: 'Стрелки — спускаться на банджи', parachute: 'Стрелки — управлять парашютом', fastWalk: 'A/D — двигаться с удвоенной скоростью' };
    const hint = this.weapons.message || hints[t.weapon] || (this.weapons.needsCharge(t.weapon) ? 'Удерживайте пробел / ЛКМ для силы выстрела' : 'Пробел / ЛКМ — применить оружие');
    if (this.weaponHint.textContent !== hint) this.weaponHint.textContent = hint;
    if (this.status.textContent !== text) this.status.textContent = text;
    this.chargeBar.value = t.charge;

    this.teams.forEach((team, index) => {
      const card = this.teamHealthCards[index];
      if (!card) return;
      const health = team.worms.reduce((sum, worm) => sum + worm.hp, 0);
      const maximum = Math.max(1, team.worms.length * 100);
      card.classList.toggle('active', index === t.team);
      card.classList.toggle('eliminated', health === 0 || team.surrendered);
      card.querySelector('.team-health-value').textContent = String(health);
      card.querySelector('.team-health-track i').style.width = `${health / maximum * 100}%`;
    });

    for (const button of this.weaponButtons) {
      button.classList.toggle('selected', button.dataset.weapon === t.weapon);
      button.disabled = !this.humanInput() || t.state !== TURN.WAITING_INPUT || !!t.lockedWeapon;
    }

    for (const w of this.worms) if (w.alive) {
      this.vector.copy(w.mesh.position);
      this.vector.y += 1.4;
      this.vector.project(this.camera);
      w.label.style.transform = `translate(${(this.vector.x * .5 + .5) * this.width}px,${(-this.vector.y * .5 + .5) * this.height}px) translate(-50%,-100%)`;

      const isActive = (w === this.active);
      w.label.classList.toggle('active', isActive);

      // Скрываем плашку активного игрока, если он уже сдвинулся или целится
      if (isActive && this.activeMoved) {
        w.label.style.display = 'none';
      } else {
        w.label.style.display = 'flex';
      }
    }
  }
}
