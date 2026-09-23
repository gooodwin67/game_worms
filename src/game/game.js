import * as THREE from 'three';
import RAPIER from '@dimforge/rapier2d-compat';
import { GameLoop, TurnMachine, TURN, MAP, GRAVITY, WIND_MAX, COLORS, FIXED_DT } from './core.js';
import { Terrain } from './terrain.js';
import { Water } from './water.js';
import { ExplosionParticles } from './particles.js';
import { Weapons, Bot, ARSENAL, UNLIMITED_WEAPONS } from './weapons.js';
import { WeaponPanel } from './weapon-panel.js';
import { WeaponArt, disposeWeaponMesh } from './weapon-art.js';
import { WEAPON_ICON_REGIONS } from './weapon-icon-regions.js';

const STANDING_SLOPE_NORMAL_Y = Math.cos(80 * Math.PI / 180);
const TARGET_CURSOR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='9' fill='none' stroke='%23ff3344' stroke-width='2'/%3E%3Cpath d='M16 1v8m0 14v8M1 16h8m14 0h8' stroke='%23ff3344' stroke-width='2'/%3E%3C/svg%3E\") 16 16, crosshair";
const NO_AIM_WEAPONS = new Set([
  'skipGo', 'surrender', 'selectWorm', 'freeze', 'scales', 'lowGravity', 'fastWalk', 'laserSight', 'invisibility',
  'firePunch', 'battleAxe', 'baseballBat', 'prod', 'kamikaze', 'suicideBomber', 'earthquake',
  'drill', 'pneumaticDrill', 'blowTorch', 'mine', 'dynamite', 'bungee', 'parachute', 'jetPack', 'uppercut'
]);
function clampAimToFacing(angle, facing) {
  const forward = facing < 0 ? Math.PI : 0;
  const offset = Math.atan2(Math.sin(angle - forward), Math.cos(angle - forward));
  return forward + THREE.MathUtils.clamp(offset, -Math.PI / 2, Math.PI / 2);
}
const TRAINING_SCENARIOS = Object.freeze({
  free: { map: 'free', mode: 'free', indestructible: false },
  jetPack: { map: 'open', mode: 'free', indestructible: true },
  bazooka: { map: 'target', mode: 'sequential', indestructible: true, order: [0, 1, 2] },
  mortar: { map: 'target', mode: 'sequential', indestructible: true, order: [0, 1, 2] },
  homing: { map: 'target', mode: 'sequential', indestructible: true, order: [2, 1, 0] },
  pigeon: { map: 'target', mode: 'sequential', indestructible: true, order: [1, 2, 0] },
  grenade: { map: 'target', mode: 'sequential', indestructible: true, order: [0, 2, 1] },
  shotgun: { map: 'target', mode: 'sequential', indestructible: true, order: [0, 1, 2] },
  longbow: { map: 'target', mode: 'sequential', indestructible: true, order: [2, 0, 1] },
  firePunch: { map: 'target', mode: 'close', indestructible: true },
  dynamite: { map: 'open', mode: 'sequential', indestructible: false, positions: [28, 45, 62] },
  mine: { map: 'target', mode: 'sequential', indestructible: true, order: [0, 1, 2] },
  sheep: { map: 'open', mode: 'sequential', indestructible: false, positions: [35, 52, 69] },
  airstrike: { map: 'target', mode: 'sequential', indestructible: true, order: [1, 0, 2] },
  ninjaRope: { map: 'open', mode: 'free', indestructible: true }
});
const TRAINING_BASE_WEAPONS = ['bazooka', 'grenade'];
const TRAINING_REWARD_WEAPONS = Object.keys(ARSENAL).filter(id => !TRAINING_BASE_WEAPONS.includes(id));
const TRAINING_MISSION_REWARDS = Object.freeze({
  bazooka: TRAINING_REWARD_WEAPONS.filter((_, index) => index % 2 === 0),
  grenade: TRAINING_REWARD_WEAPONS.filter((_, index) => index % 2 === 1)
});

function unlockedTrainingWeapons(profile = {}) {
  const unlocked = new Set(TRAINING_BASE_WEAPONS);
  for (const [missionId, rewards] of Object.entries(TRAINING_MISSION_REWARDS)) {
    if (profile.completedMissions?.includes(missionId)) rewards.forEach(id => unlocked.add(id));
  }
  if (profile.weaponPackOwned) Object.keys(ARSENAL).forEach(id => unlocked.add(id));
  return unlocked;
}

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
    this.canvas = canvas; this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-48, 48, 27, -27, .1, 200); this.camera.position.set(48, 27, 100);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); this.renderer.setPixelRatio(Math.min(devicePixelRatio || 2, 2)); this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.setClearColor(0x071a2f, 1); this.renderer.autoClear = false;

    // Полноэкранный фон не зависит от масштаба и панорамирования карты.
    this.backgroundScene = new THREE.Scene();
    this.backgroundCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10);
    this.backgroundCamera.position.z = 1;
    this.backgroundMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uEnabled: { value: 1 },
        uBrightness: { value: .4 },
        uCloudStrength: { value: 1.65 },
        uStarsEnabled: { value: 1 },
        uStarDensity: { value: 2.5 },
        uStarSize: { value: 2.3 },
        uStarBrightness: { value: 2.5 }
      },
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
      fragmentShader: `precision highp float;
        uniform float uTime;
        uniform vec2 uResolution;
        uniform float uEnabled;
        uniform float uBrightness;
        uniform float uCloudStrength;
        uniform float uStarsEnabled;
        uniform float uStarDensity;
        uniform float uStarSize;
        uniform float uStarBrightness;
        varying vec2 vUv;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
        float fbm(vec2 p){float value=0.,amplitude=.5;for(int i=0;i<4;i++){value+=noise(p)*amplitude;p*=2.;amplitude*=.5;}return value;}
        float starField(vec2 uv){
          vec2 grid=uv*vec2(164.,92.);
          vec2 cell=floor(grid),local=fract(grid)-.5;
          float seed=hash(cell),visible=step(1.-.012*uStarDensity,seed);
          float d=length(local);
          float core=1.-smoothstep(0.,.055*uStarSize,d);
          float crossX=(1.-smoothstep(0.,.018*uStarSize,abs(local.x)))*(1.-smoothstep(.02,.16*uStarSize,abs(local.y)));
          float crossY=(1.-smoothstep(0.,.018*uStarSize,abs(local.y)))*(1.-smoothstep(.02,.16*uStarSize,abs(local.x)));
          float twinkle=.72+.28*sin(uTime*1.2+seed*24.);
          return visible*(core*.75+(crossX+crossY)*.32)*twinkle;
        }
        float shootingStar(vec2 uv){
          float aspect=uResolution.x/max(uResolution.y,1.);
          float timeSlot=floor(uTime*.14);
          float phase=fract(uTime*.14);
          float seed=hash(vec2(timeSlot,83.7));
          float rare=step(.75,seed);
          float angle=mix(-.42,.42,hash(vec2(timeSlot,47.3)));
          float startX=mix(.15,.85,hash(vec2(timeSlot,19.6)));
          vec2 travel=vec2(sin(angle),-cos(angle))*1.68;
          vec2 head=vec2(startX,1.08)+travel*phase;
          vec2 direction=normalize(vec2(travel.x*aspect,travel.y));
          vec2 delta=uv-head;
          delta.x*=aspect;
          vec2 normal=vec2(-direction.y,direction.x);
          float along=dot(delta,-direction);
          float across=abs(dot(delta,normal));
          float trail=step(0.,along)*(1.-smoothstep(0.,.15,along))*(1.-smoothstep(.0006,.0028,across));
          float headGlow=1.-smoothstep(0.,.0045,length(delta));
          float fade=smoothstep(.02,.12,phase)*(1.-smoothstep(.84,1.,phase));
          return rare*(trail*.82+headGlow*1.15)*fade*smoothstep(.34,.8,uv.y);
        }
        void main(){
          vec2 uv=vUv;
          float aspect=uResolution.x/max(uResolution.y,1.);
          vec2 centered=uv-.5;
          centered.x*=aspect;
          vec3 color=mix(vec3(.035,.12,.19),vec3(.012,.042,.09),smoothstep(0.,1.,uv.y));

          vec2 cloudUv=centered*vec2(1.35,2.4);
          cloudUv.x+=uTime*.008;
          cloudUv.y+=sin(uTime*.025)*.035;
          float clouds=fbm(cloudUv*1.7)*.72+fbm(cloudUv*3.1+vec2(-uTime*.004,4.2))*.28;
          clouds=smoothstep(.36,.67,clouds);
          float cloudMask=smoothstep(.04,.4,uv.y)*(1.-smoothstep(.8,1.,uv.y));
          color+=vec3(.10,.22,.34)*clouds*cloudMask*.82*uCloudStrength;

          float horizon=exp(-pow((uv.y-.18)*5.,2.));
          color+=vec3(.09,.28,.36)*horizon*.58;
          float auroraNoise=fbm(vec2(uv.x*4.+uTime*.006,uv.y*1.3));
          float aurora=sin(uv.x*16.+auroraNoise*6.+sin(uTime*.07))*.5+.5;
          aurora=pow(aurora,5.);
          float auroraMask=smoothstep(.22,.56,uv.y)*(1.-smoothstep(.82,1.,uv.y));
          color+=vec3(.045,.28,.25)*aurora*auroraMask*.28;

          float stars=starField(uv)*smoothstep(.34,.76,uv.y);
          color+=vec3(.42,.70,.98)*stars*.72*uStarsEnabled*uStarBrightness;
          color+=vec3(.70,.86,1.)*shootingStar(uv)*uStarsEnabled*.55;
          float focus=smoothstep(.82,.08,length(centered*vec2(.72,1.)));
          color*=mix(1.,.78,focus);
          vec2 vignetteUv=uv*(1.-uv.yx);
          float vignette=pow(clamp(vignetteUv.x*vignetteUv.y*18.,0.,1.),.28);
          color*=mix(.56,1.,vignette)*uBrightness;
          color=mix(vec3(.003,.008,.016),color,uEnabled);
          gl_FragColor=vec4(color,1.);
        }`
    });
    this.backgroundMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.backgroundMaterial);
    this.backgroundScene.add(this.backgroundMesh);

    const moonTexture = new THREE.TextureLoader().load('/assets/moon-texture.png');
    moonTexture.colorSpace = THREE.SRGBColorSpace;
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: moonTexture,
      color: 0xffffff,
      transparent: true,
      opacity: .74 * .65,
      depthTest: false,
      depthWrite: false
    }));
    this.moonScaleFactor = .7;
    this.moon.position.set(.44, .72, .1);
    this.moon.scale.set(.18 * this.moonScaleFactor, .18 * this.moonScaleFactor, 1);
    this.moon.renderOrder = 1;
    this.moon.frustumCulled = false;
    this.backgroundScene.add(this.moon);

    const moonGlowCanvas = document.createElement('canvas');
    moonGlowCanvas.width = 128; moonGlowCanvas.height = 128;
    const moonGlowContext = moonGlowCanvas.getContext('2d');
    const moonGlowGradient = moonGlowContext.createRadialGradient(64, 64, 5, 64, 64, 64);
    moonGlowGradient.addColorStop(0, 'rgba(202, 232, 255, .38)');
    moonGlowGradient.addColorStop(.22, 'rgba(145, 205, 244, .20)');
    moonGlowGradient.addColorStop(.58, 'rgba(102, 164, 214, .09)');
    moonGlowGradient.addColorStop(1, 'rgba(64, 116, 172, 0)');
    moonGlowContext.fillStyle = moonGlowGradient;
    moonGlowContext.fillRect(0, 0, 128, 128);
    const moonGlowTexture = new THREE.CanvasTexture(moonGlowCanvas);
    moonGlowTexture.colorSpace = THREE.SRGBColorSpace;
    this.moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: moonGlowTexture,
      transparent: true,
      opacity: .42 * 1.15,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    }));
    this.moonGlowScaleFactor = 1.7;
    this.moonGlow.position.set(.44, .72, .05);
    this.moonGlow.renderOrder = 0;
    this.moonGlow.frustumCulled = false;
    this.backgroundScene.add(this.moonGlow);

    // Мягкое освещение для 3D моделей персонажей
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x445566, 1.4);
    this.scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.8);
    dirLight.position.set(20, 40, 50);
    this.scene.add(dirLight);

    this.loop = new GameLoop(this.update.bind(this), this.render.bind(this)); this.keys = new Set(); this.vector = new THREE.Vector3(); this.motion = { x: 0, y: 0 }; this.angle = Math.PI / 4; this.wind = 0; this.zoom = 1; this.time = 0; this.hudTime = 0; this.damageDisplayTime = 0; this.cameraFocus = null; this.cameraPan = { x: 0, y: 0 }; this.touchPointers = new Map(); this.touchGesture = null; this.mobileControls = null; this.turnIntroTime = 0; this.footstepTimer = 0; this.lowGravity = false; this.earthquakeShake = 0; this.earthquakeShakeX = 0; this.earthquakeShakeY = 0; this.lightingMode = 'soft';
    this.resize = this.resize.bind(this); window.addEventListener('resize', this.resize); window.visualViewport?.addEventListener('resize', this.resize); this.resize();
    this.inMenu = true; this.installUI(); this.installMobileControls(); this.bindInput();
  }


  createWeaponMesh(type) { return this.weaponArt.create(type); }

  createTrainingTarget() {
    const root = new THREE.Group();
    const red = new THREE.MeshBasicMaterial({ color: 0xe53935, side: THREE.DoubleSide });
    const white = new THREE.MeshBasicMaterial({ color: 0xf7f3e8, side: THREE.DoubleSide });
    const dark = new THREE.MeshBasicMaterial({ color: 0x5b2020, side: THREE.DoubleSide });
    const addDisc = (radius, material, z) => {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), material);
      disc.position.set(0, .28, z);
      root.add(disc);
    };

    const pole = new THREE.Mesh(new THREE.PlaneGeometry(.12, .7), dark);
    pole.position.set(0, -.3, -.02);
    root.add(pole);
    const foot = new THREE.Mesh(new THREE.PlaneGeometry(.72, .12), dark);
    foot.position.set(0, -.61, -.02);
    root.add(foot);
    addDisc(.66, red, 0);
    addDisc(.51, white, .01);
    addDisc(.37, red, .02);
    addDisc(.23, white, .03);
    addDisc(.105, red, .04);

    const bodyPivot = new THREE.Group();
    const headGroup = new THREE.Group();
    const wingLPivot = new THREE.Group();
    const wingRPivot = new THREE.Group();
    const tailPivot = new THREE.Group();
    const weaponPivot = new THREE.Group();
    root.add(bodyPivot, headGroup, wingLPivot, wingRPivot, tailPivot, weaponPivot);
    return {
      root, bodyPivot, headGroup, wingLPivot, wingRPivot, tailPivot, weaponPivot,
      currentWeapon: null, weaponMesh: null, currentEquipment: null, equipmentMesh: null,
      dispose: () => {
        root.removeFromParent();
        root.traverse(child => child.geometry?.dispose());
        red.dispose(); white.dispose(); dark.dispose();
      }
    };
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
      eyeGroup,
      helmetGroup,
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
    this.defaultMapImage = img.complete && img.naturalWidth !== 0 ? img : null;

    const targetTrainingMap = new Image();
    targetTrainingMap.src = `${import.meta.env.BASE_URL}training/2.png`;
    await new Promise(resolve => {
      targetTrainingMap.onload = resolve;
      targetTrainingMap.onerror = resolve;
    });
    this.targetTrainingMapImage = targetTrainingMap.complete && targetTrainingMap.naturalWidth !== 0 ? targetTrainingMap : null;

    const freeTrainingMap = new Image();
    freeTrainingMap.src = `${import.meta.env.BASE_URL}training/free.jpg`;
    await new Promise(resolve => {
      freeTrainingMap.onload = resolve;
      freeTrainingMap.onerror = resolve;
    });
    this.freeTrainingMapImage = freeTrainingMap.complete && freeTrainingMap.naturalWidth !== 0 ? freeTrainingMap : null;

    if (this.selectedMapImage && this.mapImageReady?.[this.selectedMapIndex]) {
      await this.mapImageReady[this.selectedMapIndex];
    }
    this.configure();
  }

  configure() {
    this.weaponPanel?.close();
    this.loop.pause();
    if (this.world) {
      this.terrain.dispose();
      this.particles.dispose();
      this.weapons.dispose();
      for (const crate of this.supplyCrates || []) crate.dispose();
      this.supplyCrates = [];
      this.water?.dispose();
      for (const w of this.worms) {
        disposeWeaponMesh(w.duck.weaponMesh);
        w.duck.dispose();
        w.label.remove();
        w.drowningDamagePopup?.remove();
      }
      this.events.free();
      this.world.free();
    }
    this.world = new RAPIER.World({ x: 0, y: GRAVITY });
    this.lowGravity = false;
    this.world.timestep = FIXED_DT;
    this.events = new RAPIER.EventQueue(true);
    // У каждой тренировки свой полигон: цели нужны только там, где они являются частью упражнения.
    this.trainingScenario = this.gameMode === 'training' ? TRAINING_SCENARIOS[this.trainingWeapon] : null;
    this.trainingFreePractice = this.trainingWeapon === 'free';
    const trainingProfile = this.getTrainingProfile?.() || {};
    const selectedTrainingWeapons = this.trainingLoadoutSelection || trainingProfile.loadout || ['bazooka'];
    const unlockedWeapons = this.trainingTestUnlockAll
      ? new Set(Object.keys(ARSENAL))
      : unlockedTrainingWeapons(trainingProfile);
    this.trainingLoadout = new Set(this.trainingFreePractice
      ? selectedTrainingWeapons.filter(id => unlockedWeapons.has(id))
      : []);
    if (this.trainingFreePractice && this.trainingLoadout.size === 0) this.trainingLoadout.add('bazooka');
    this.turnTimeLimit = Number(document.querySelector('#turn-time-limit')?.value || 0);
    this.weaponCrateFrequency = Number(document.querySelector('#weapon-crate-count')?.value || 5);
    this.windEnabled = document.querySelector('#wind-enabled')?.value !== 'no';
    this.targetTrainingActive = this.trainingScenario?.mode === 'sequential' || this.trainingScenario?.mode === 'close';
    this.targetTrainingStage = 0;
    this.trainingIndestructible = Boolean(this.trainingScenario?.indestructible);
    const useUploadedMap = this.gameMode !== 'training'
      && document.querySelector('input[name="mapSource"]:checked')?.value === 'custom'
      && this.uploadedMapImage;
    const selectedMap = this.selectedMapImage?.complete && this.selectedMapImage.naturalWidth > 0
      ? this.selectedMapImage
      : null;
    const mapImage = this.trainingScenario?.map === 'target'
      ? this.targetTrainingMapImage
      : this.trainingFreePractice
        ? this.freeTrainingMapImage
        : useUploadedMap || selectedMap;

    this.terrain = new Terrain(this.scene, this.world, mapImage);
    this.terrain.setLightingMode(this.lightingMode);
    const trainingPlatforms = this.trainingScenario?.map === 'target' ? this.terrain.findPlatformTops() : [];
    if (trainingPlatforms.length >= 4) {
      const [playerPlatform, ...targetPlatforms] = trainingPlatforms;
      if (this.trainingScenario?.mode === 'close') {
        const targetPlatform = targetPlatforms[0];
        const left = targetPlatform.x - targetPlatform.width / 2 + .8;
        const right = targetPlatform.x + targetPlatform.width / 2 - .8;
        const playerX = THREE.MathUtils.clamp(targetPlatform.x - 1.35, left, right - 1.1);
        this.targetTrainingPlayerPosition = { x: playerX, y: targetPlatform.surfaceY + .612 };
        this.targetTrainingTargets = [
          { x: playerX + 1.1, y: targetPlatform.surfaceY + .67 },
          { x: targetPlatform.x, y: targetPlatform.surfaceY + .67 },
          { x: targetPlatform.x + Math.min(1.1, targetPlatform.width / 4), y: targetPlatform.surfaceY + .67 }
        ];
      } else {
        this.targetTrainingPlayerPosition = { x: playerPlatform.x, y: playerPlatform.surfaceY + .612 };
        const order = this.trainingScenario?.order || [0, 1, 2];
        this.targetTrainingTargets = order.map(index => targetPlatforms[index] || targetPlatforms[0]).map(platform => ({ x: platform.x, y: platform.surfaceY + .67 }));
      }
    } else {
      this.targetTrainingPlayerPosition = { x: 10.5, y: this.terrain.spawnHeight(10.5) };
      const targetXs = this.trainingScenario?.positions || [46.7, 60, 73.7];
      this.targetTrainingTargets = this.trainingScenario?.mode === 'close'
        ? [11.8, 12.2, 12.6].map(x => ({ x, y: this.terrain.spawnHeight(x) }))
        : targetXs.map(x => ({ x, y: this.terrain.spawnHeight(x) }));
    }
    this.baseWaterSurface = Math.max(3.8, this.terrain.lowestSolidY() + 3);
    this.waterBottom = -6;
    this.water = new Water(this.scene, this.waterBottom, this.baseWaterSurface);
    this.particles = new ExplosionParticles(this.scene);
    this.weapons = new Weapons(this);
    this.bot = new Bot(this);

    this.worms = [];
    this.teams = [];
    this.wormByCollider = new Map();
    this.winner = null;
    this.winningTeam = null;
    this.victoryTime = 0;
    this.completedTurns = 0;
    this.supplyCrates = [];
    this.supplyDropPending = false;
    this.active = null;
    this.waterLevel = 0;
    this.time = 0;
    this.earthquakeShake = 0; this.earthquakeShakeX = 0; this.earthquakeShakeY = 0;
    this.angle = Math.PI / 4;
    this.keys.clear();

    const rows = this.teamRows.children;
    const count = this.trainingFreePractice ? 2 : this.gameMode === 'training' ? 2 : Math.max(2, Math.min(4, Number(this.teamCount.value) || 2));
    const defaultPerTeam = this.trainingFreePractice ? 3 : this.trainingScenario ? 1 : this.gameMode === 'training' ? 3 : 3;
    const wormCounts = Array.from({ length: count }, (_, index) => this.trainingFreePractice || this.trainingScenario || this.gameMode === 'training'
      ? defaultPerTeam
      : Math.max(1, Math.min(5, Number(rows[index]?.dataset.worms) || defaultPerTeam)));
    const spawnCount = wormCounts.reduce((sum, amount) => sum + amount, 0);
    const spawnSegment = (MAP.width - 10) / spawnCount;
    let spawnLocations;
    if (this.terrain.hasCustomImage) {
      const candidates = this.terrain.findSpawnPoints();
      const availableCandidates = this.trainingFreePractice
        ? candidates.filter(point => point.x >= MAP.width * .3 && point.x <= MAP.width * .7)
        : candidates;
      const pool = availableCandidates.length >= spawnCount ? availableCandidates : candidates;
      const selected = [];
      // Берём следующую точку максимально далеко от уже выбранных,
      // чтобы черви не скучивались на одной широкой платформе.
      if (pool.length) selected.push(pool[Math.floor(Math.random() * pool.length)]);
      while (selected.length < Math.min(spawnCount, pool.length)) {
        let best = [], bestDistance = -Infinity;
        for (const candidate of pool) {
          if (selected.includes(candidate)) continue;
          const distance = selected.length ? Math.min(...selected.map(point => Math.abs(point.x - candidate.x))) : Infinity;
          if (distance > bestDistance + .2) { bestDistance = distance; best = [candidate]; }
          else if (Math.abs(distance - bestDistance) <= .2) best.push(candidate);
        }
        if (!best.length) break;
        selected.push(best[Math.floor(Math.random() * best.length)]);
      }
      spawnLocations = selected;
    } else {
      spawnLocations = Array.from({ length: spawnCount }, (_, index) => ({ x: 5 + (index + .18 + Math.random() * .64) * spawnSegment, y: null }));
    }
    for (let i = spawnLocations.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spawnLocations[i], spawnLocations[j]] = [spawnLocations[j], spawnLocations[i]];
    }
    let spawnIndex = 0;

    // Перемешиваем пул имён для матча без повторов
    const availableNames = [...WORM_NAMES].sort(() => Math.random() - 0.5);
    let nameIndex = 0;

    for (let t = 0; t < count; t++) {
      const configuredName = (rows[t].querySelector('input').value.trim() || `Команда ${t + 1}`).slice(0, 10),
        name = (this.trainingFreePractice ? `Команда ${t + 1}` : this.gameMode === 'training' ? (t === 0 ? 'Учебный отряд' : 'Мишени') : configuredName).slice(0, 10),
        selectedBot = rows[t].querySelector('.team-type').value === 'bot' ? rows[t].querySelector('.team-difficulty-select').value : '',
        bot = this.trainingFreePractice ? '' : this.gameMode === 'training' && t > 0 ? 'target' : selectedBot;
      const inventory = Object.fromEntries(Object.keys(ARSENAL).map(id => [id, UNLIMITED_WEAPONS.has(id) ? Infinity : 1]));
      const team = { name, bot, passive: bot === 'target', color: COLORS[t], worms: [], inventory };
      this.teams.push(team);

      for (let i = 0; i < wormCounts[t]; i++) {
        const isTrainingTarget = this.targetTrainingActive && t === 1;
        const trainingPosition = this.trainingScenario && !this.trainingFreePractice
          ? (isTrainingTarget ? this.targetTrainingTargets[0] : this.targetTrainingPlayerPosition)
          : null;
        const rawSpawnLocation = spawnLocations[spawnIndex++];
        const spawnLocation = rawSpawnLocation || (this.terrain.hasCustomImage && spawnLocations.length
          ? spawnLocations[spawnIndex % spawnLocations.length]
          : null);
        const x = trainingPosition?.x ?? spawnLocation?.x ?? 5 + Math.random() * (MAP.width - 10),
          y = trainingPosition?.y ?? spawnLocation?.y ?? this.terrain.spawnHeight(x);
        const bodyDescription = isTrainingTarget
          ? RAPIER.RigidBodyDesc.fixed().setTranslation(x, y)
          : RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y).lockRotations().setLinearDamping(.12).setCcdEnabled(true);
        const body = this.world.createRigidBody(bodyDescription);
        const colliderDescription = isTrainingTarget
          ? RAPIER.ColliderDesc.ball(.66).setFriction(.2).setRestitution(.15).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
          : RAPIER.ColliderDesc.capsule(.23, .38).setMass(1).setFriction(.38).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(0).setCollisionGroups(0x00020003);
        const collider = this.world.createCollider(colliderDescription, body);

        // Игрок остаётся уткой, учебная мишень собирается из простых геометрических примитивов.
        const duck = isTrainingTarget ? this.createTrainingTarget() : this.createDuck(COLORS[t]);
        const mesh = new THREE.Group();
        mesh.add(duck.root);
        mesh.position.set(x, y, 0);
        this.scene.add(mesh);

        // Берём персональное имя из пула
        const wormName = isTrainingTarget ? 'Мишень 1' : availableNames[nameIndex % availableNames.length];
        nameIndex++;

        const label = document.createElement('div');
        label.className = 'worm-label';
        const turnMarker = document.createElement('strong');
        turnMarker.className = 'turn-marker';
        turnMarker.innerHTML = '<i>▼</i>';
        turnMarker.hidden = true;
        const fuelIndicator = document.createElement('span');
        fuelIndicator.className = 'jetpack-fuel-indicator';
        fuelIndicator.innerHTML = '<strong>100</strong>';
        fuelIndicator.hidden = true;
        const fuelValue = fuelIndicator.querySelector('strong');
        const text = document.createElement('span');
        text.className = 'worm-name';
        text.textContent = wormName;
        // Подкрашиваем рамку и текст в цвет команды
        text.style.borderColor = `#${COLORS[t].toString(16).padStart(6, '0')}`;
        text.style.color = `#${COLORS[t].toString(16).padStart(6, '0')}`;

        const health = document.createElement('progress');
        health.max = isTrainingTarget ? 40 : 100;
        health.value = isTrainingTarget ? 40 : 100;
        const healthBar = document.createElement('span');
        healthBar.className = 'worm-health-bar';
        const healthText = document.createElement('strong');
        healthText.className = 'worm-health-value';
        healthText.textContent = String(isTrainingTarget ? 40 : 100);
        healthBar.append(health, healthText);
        label.append(turnMarker, fuelIndicator, text, healthBar);
        this.labels.append(label);

        const worm = {
          body, collider, mesh, duck, label, health, fuelIndicator, fuelValue, team: t,
          name: wormName,
          hp: isTrainingTarget ? 40 : 100, displayedHp: isTrainingTarget ? 40 : 100, pendingHp: isTrainingTarget ? 40 : 100, healthRevealTime: 0, healthText, pendingDamage: 0, turnMarker, alive: true, state: 'airborne', facing: isTrainingTarget ? -1 : 1, deathTime: 0, deathSide: 1, deathStartRotation: 0, deadHelmet: null, poison: 0, radiation: 0,
          trainingTarget: isTrainingTarget,
          x, y, previousX: x, previousY: y, trainingSpawn: { x, y }, vx: 0, vy: 0,
          grounded: false, airborneTime: 0, airbornePeakY: y, hardFalling: false, knockedDown: false, impactVelocityX: 0, impactSpinDirection: 0, tumbleRotation: 0, recoverySide: -1, recoveryTime: 0, groundNormalX: 0, groundNormalY: 1,
          animTime: Math.random() * 5,
          victoryPhase: Math.random() * Math.PI * 2,
          jumpTapTime: -Infinity, backflipEligibleUntil: -Infinity, backflipRequested: false, backflipStart: -Infinity, backflipping: false, jumpFacing: 1, autoHopCooldown: 0
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
      w.vx = 0; w.vy = 0; w.slideTime = 0; w.grounded = true; w.airborneTime = 0; w.airbornePeakY = w.y; w.hardFalling = false; w.knockedDown = false; w.impactVelocityX = 0; w.impactSpinDirection = 0; w.tumbleRotation = 0; w.recoverySide = -w.facing; w.recoveryTime = 0; w.state = 'alive';
      w.previousX = w.x; w.previousY = w.y;
      w.mesh.position.set(w.x, w.y, 0);
    }

    this.camera.position.set(48, 27, 100);
    this.cameraPan.x = 0;
    this.cameraPan.y = 0;
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

      this.laserSightLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(.45, 0, .14), new THREE.Vector3(65, 0, .14)]),
        new THREE.LineBasicMaterial({ color: 0xff3b45, transparent: true, opacity: .8, depthWrite: false })
      );
      this.laserSightLine.frustumCulled = false;
      this.laserSightLine.visible = false;
      this.aim.add(this.laserSightLine);

      this.scene.add(this.aim);
    }
  }

  weaponCount(type, teamIndex = this.turn?.team) {
    if (this.gameMode === 'training') {
      if (this.trainingFreePractice) return this.trainingLoadout?.has(type) ? Infinity : 0;
      return type === this.trainingWeapon ? Infinity : 0;
    }
    if (UNLIMITED_WEAPONS.has(type)) return Infinity;
    return this.teams[teamIndex]?.inventory?.[type] ?? 0;
  }

  canUseWeapon(type, teamIndex = this.turn?.team) {
    if (this.trainingFreePractice) return this.trainingLoadout?.has(type) || false;
    return this.gameMode === 'training' || this.weaponCount(type, teamIndex) > 0;
  }

  consumeWeapon(type, teamIndex = this.turn?.team) {
    if (this.gameMode === 'training' || UNLIMITED_WEAPONS.has(type)) return true;
    const inventory = this.teams[teamIndex]?.inventory;
    if (!inventory || inventory[type] <= 0) return false;
    inventory[type]--;
    return true;
  }

  addWeaponToTeam(teamIndex, type) {
    const inventory = this.teams[teamIndex]?.inventory;
    if (!inventory || UNLIMITED_WEAPONS.has(type)) return;
    inventory[type] = (inventory[type] || 0) + 1;
  }

  randomSupplyWeapon() {
    const available = Object.keys(ARSENAL).filter(type => !UNLIMITED_WEAPONS.has(type));
    return available[Math.floor(Math.random() * available.length)];
  }

  createSupplyCrate() {
    const root = new THREE.Group();
    const crateTexture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/weapon-crate.png`);
    crateTexture.colorSpace = THREE.SRGBColorSpace;
    crateTexture.minFilter = THREE.LinearFilter;
    crateTexture.magFilter = THREE.NearestFilter;
    crateTexture.wrapS = THREE.ClampToEdgeWrapping;
    crateTexture.wrapT = THREE.ClampToEdgeWrapping;
    // У исходной картинки большие прозрачные поля — берём только область самого ящика.
    crateTexture.repeat.set(.56, .36);
    crateTexture.offset.set(.21, .31);
    const crateMaterial = new THREE.MeshBasicMaterial({ map: crateTexture, transparent: true, alphaTest: .08, side: THREE.DoubleSide });
    const ropeMaterial = new THREE.LineBasicMaterial({ color: 0xf1e1bb });
    const canopyMaterial = new THREE.MeshBasicMaterial({ color: 0xf04444, side: THREE.DoubleSide });
    const box = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.62), crateMaterial);
    box.position.set(0, .18, .08);
    root.add(box);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.45, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), canopyMaterial);
    canopy.position.y = 1.95;
    root.add(canopy);
    const parachuteParts = [canopy];
    for (const side of [-1, 1]) {
      const line = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(side * .72, .75, .05), new THREE.Vector3(side * 1.05, 1.7, 0)]);
      const rope = new THREE.Line(line, ropeMaterial);
      parachuteParts.push(rope);
      root.add(rope);
    }
    return { root, parachuteParts, dispose: () => { root.removeFromParent(); root.traverse(child => child.geometry?.dispose()); crateMaterial.dispose(); crateTexture.dispose(); ropeMaterial.dispose(); canopyMaterial.dispose(); } };
  }

  spawnSupplyCrate() {
    if (this.gameMode !== 'quick') return;
    this.showSupplyDropAnnouncement();
    this.audio?.play('supplyCrateDrop');
    let x = MAP.width / 2;
    let bestDistance = -Infinity;
    for (let attempt = 0; attempt < 24; attempt++) {
      const candidate = THREE.MathUtils.clamp(5 + Math.random() * (MAP.width - 10), 2, MAP.width - 2);
      const distance = Math.min(...this.worms.filter(w => w.alive).map(w => Math.abs(w.x - candidate)), MAP.width);
      if (this.terrain.landingHeight(candidate, .85, .55) === null) continue;
      if (distance >= 3.5) { x = candidate; break; }
      if (distance > bestDistance) { bestDistance = distance; x = candidate; }
    }
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, MAP.height + 4).setLinearDamping(1.8).setAngularDamping(4.5).setCcdEnabled(true));
    body.setGravityScale(1, true);
    body.lockRotations(true, true);
    body.setLinvel({ x: 0, y: -8 }, true);
    const collider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(.85, .55).setMass(1).setFriction(1.5).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max).setRestitution(0).setCollisionGroups(0x00040001), body);
    const visual = this.createSupplyCrate();
    this.scene.add(visual.root);
    const crate = { body, collider, visual, x, y: MAP.height + 4, type: this.randomSupplyWeapon(), landed: false, dropTime: 0, parachuteTime: 0, parachuteReleased: false, angleFrom: 0, angleTo: 0, angleBlend: 1, supplyCrate: true, dispose: () => { this.world.removeRigidBody(body); visual.dispose(); } };
    this.supplyCrates.push(crate);
    this.cameraFocus = crate;
  }

  updateSupplyCrates(dt) {
    for (let index = this.supplyCrates.length - 1; index >= 0; index--) {
      const crate = this.supplyCrates[index];
      const p = crate.body.translation();
      crate.dropTime += dt;
      const previousY = crate.y;
      crate.x = p.x;
      crate.y = p.y;
      if (!crate.landed && !crate.parachuteReleased) {
        crate.parachuteTime += dt;
        if (crate.parachuteTime >= 2) {
          crate.parachuteReleased = true;
          for (const part of crate.visual.parachuteParts) part.visible = false;
          crate.body.setGravityScale(2.5, true);
          crate.body.setLinvel({ x: crate.body.linvel().x, y: -14 }, true);
        }
      }
      const currentPosition = crate.body.translation();
      crate.visual.root.position.set(currentPosition.x, currentPosition.y, .35);
      crate.visual.root.rotation.z = crate.body.rotation();
      const waterSurface = this.water?.getHeightAt(currentPosition.x) ?? this.baseWaterSurface + this.waterLevel;
      if (!crate.inWater && previousY > waterSurface && currentPosition.y <= waterSurface) {
        crate.inWater = true;
        this.water?.splashAt(currentPosition.x, Math.max(Math.abs(crate.body.linvel().y), 1), 2.6);
      }
      const landingHeights = [-.85, -.42, 0, .42, .85].map(offset => this.terrain.landingHeight(currentPosition.x + offset, .08, .55)).filter(value => value !== null);
      const landingY = landingHeights.length ? Math.max(...landingHeights) : null;
      const velocity = crate.body.linvel();
      const restingOnGeometry = crate.body.isSleeping() && Math.abs(velocity.y) < .2;
      const timedOut = crate.dropTime > 8 && currentPosition.y < MAP.height + 1;
      if (!crate.landed && landingY !== null && (currentPosition.y <= landingY + .24 && velocity.y <= .5 || restingOnGeometry || timedOut)) {
        crate.landed = true;
        const leftY = this.terrain.landingHeight(currentPosition.x - .7, .08, .55);
        const rightY = this.terrain.landingHeight(currentPosition.x + .7, .08, .55);
        const slopeAngle = leftY !== null && rightY !== null ? Math.atan2(rightY - leftY, 1.4) : 0;
        crate.angleFrom = crate.body.rotation();
        crate.angleTo = slopeAngle;
        crate.angleBlend = 0;
        crate.body.setLinvel({ x: 0, y: 0 }, true);
        crate.body.setAngvel(0, true);
        crate.body.lockRotations(true, true);
        if (this.cameraFocus === crate) this.cameraFocus = null;
        for (const part of crate.visual.parachuteParts) part.visible = false;
      }
      if (crate.landed && crate.angleBlend < 1) {
        crate.angleBlend = Math.min(1, crate.angleBlend + dt / .25);
        const blend = 1 - Math.pow(1 - crate.angleBlend, 2);
        const angle = crate.angleFrom + (crate.angleTo - crate.angleFrom) * blend;
        crate.body.setRotation(angle, true);
        crate.visual.root.rotation.z = angle;
      }
      const collector = this.worms.find(w => w.alive && Math.hypot(w.x - currentPosition.x, w.y - currentPosition.y) < 1.15);
      if (!collector) continue;
      this.addWeaponToTeam(collector.team, crate.type);
      if (collector === this.active) this.weapons.message = `Подобрано: ${ARSENAL[crate.type]}`;
      if (this.cameraFocus === crate) this.cameraFocus = null;
      crate.dispose();
      this.supplyCrates.splice(index, 1);
    }
  }

  rebuildTeamHealthHud() {
    this.teamHealthHud.replaceChildren();
    this.teamHealthCards = this.teams.map((team) => {
      const card = document.createElement('div');
      card.className = 'team-health-card';
      card.style.setProperty('--team-color', `#${team.color.toString(16).padStart(6, '0')}`);
      card.innerHTML = '<span class="team-health-name"></span><strong class="team-health-value"></strong><div class="team-health-track"><i></i></div>';
      card.nameElement = card.querySelector('.team-health-name');
      card.valueElement = card.querySelector('.team-health-value');
      card.trackElement = card.querySelector('.team-health-track i');
      card.nameElement.textContent = team.name;
      card.renderedHealth = null;
      card.renderedActive = null;
      card.renderedEliminated = null;
      this.teamHealthHud.append(card);
      return card;
    });
  }

  showTurnAnnouncement(teamIndex) {
    const team = this.teams[teamIndex];
    if (!team || !this.turnAnnouncement) return;
    const phrases = ['Ваш выход!', 'Пора атаковать!', 'Покажите класс!', 'Не зевайте!'];
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    this.showFloatingAnnouncement(`Ход: ${team.name}`, phrase);
  }

  showSupplyDropAnnouncement() {
    this.showFloatingAnnouncement('Ловите оружие!', 'Ящик припасов падает с неба');
  }

  showFloatingAnnouncement(title, subtitle) {
    if (!this.turnAnnouncement) return;
    this.turnAnnouncement.querySelector('.turn-banner-panel strong').textContent = title;
    this.turnAnnouncement.querySelector('.turn-banner-panel > span:not(.turn-banner-emblem)').textContent = subtitle;
    this.turnAnnouncement.classList.remove('turn-announcement--show');
    void this.turnAnnouncement.offsetWidth;
    this.turnAnnouncement.classList.add('turn-announcement--show');
  }

  createExplosion(x, y, radius) { this.audio?.play('explosion'); this.weapons?.removeArrowsInBlast?.(x, y, radius); this.weapons?.detonateSupplyCrates?.(x, y, radius); const colors = this.trainingIndestructible ? [] : this.terrain.createExplosion(x, y, radius) || []; for (const w of this.worms) if (w.alive) w.body.wakeUp(); return colors; }
  startDrowning(w) {
    if (!w.alive) return;
    const remainingHp = Math.max(0, Math.ceil(w.hp));
    w.hp = 0;
    w.pendingHp = 0;
    w.health.title = '0 HP';
    w.alive = false;
    w.state = 'drowning';
    w.label.hidden = true;
    this.wormByCollider.delete(w.collider.handle);
    w.drowningTime = 0;
    w.drowningStartY = w.y;
    w.drowningStartX = w.x;
    w.drowningSurfaceY = this.water?.getHeightAt(w.x) ?? this.baseWaterSurface + this.waterLevel;
    w.drowningDuration = 12;
    w.drowningDistance = MAP.height + 12;
    w.drowningDiveDuration = .24;
    w.drowningDiveDistance = 2;
    w.drowningBubbleTimer = 0;
    w.drowningDamagePopup = document.createElement('strong');
    w.drowningDamagePopup.className = 'drowning-damage-popup';
    w.drowningDamagePopup.textContent = `-${remainingHp}`;
    this.labels.append(w.drowningDamagePopup);
    this.damageDisplayTime = Math.max(this.damageDisplayTime, 2.2);
    w.body.setLinvel({ x: 0, y: 0 }, true);
    w.body.setAngvel(0, true);
    w.body.setGravityScale(0, true);
    w.body.sleep();
    w.mesh.visible = true;
    if (w.duck.eyeGroup) w.duck.eyeGroup.scale.y = .12;
    this.cameraFocus = { x: w.x, y: w.drowningSurfaceY, drowningFocus: true };
  }

  damage(w, amount, force = false, impact = true) {
    if (!w.alive || (w.frozen && !force)) return;
    const previousHp = w.hp;
    if (!this.trainingFreePractice) w.hp = Math.max(0, w.hp - amount);
    w.pendingHp = w.hp;
    w.health.title = `${w.hp} HP`;
    if (amount > 0 && previousHp > 0) w.pendingDamage = (w.pendingDamage || 0) + Math.min(amount, previousHp);
    if (impact && amount > 0 && w.hp > 0 && !w.trainingTarget) {
      w.knockedDown = true;
      w.impactVelocityX = w.body.linvel().x;
      w.impactSpinDirection = 0;
      w.tumbleRotation = w.mesh.rotation.z;
    }
    if (w.hp === 0 && !this.trainingFreePractice) {
      if (w.trainingTarget && this.advanceTargetTraining(w)) return;
      w.alive = false;
      w.state = 'dead';
      w.mesh.visible = true;
      w.label.hidden = true;
      this.wormByCollider.delete(w.collider.handle);
      w.deathTime = 0;
      w.deathSide = w.impactSpinDirection || -w.facing;
      w.deathStartRotation = w.mesh.rotation.z;
      w.knockedDown = false;
      w.recoveryTime = 0;
      w.body.wakeUp();
      if (w.duck.eyeGroup) w.duck.eyeGroup.scale.y = .12;
      if (w.duck.helmetGroup) {
        this.scene.attach(w.duck.helmetGroup);
        w.duck.helmetGroup.updateMatrixWorld(true);
        const helmetPosition = w.duck.helmetGroup.getWorldPosition(new THREE.Vector3());
        const helmetBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(helmetPosition.x, helmetPosition.y)
          .setLinearDamping(.12)
          .setAngularDamping(.18)
          .setCcdEnabled(true));
        const helmetCollider = this.world.createCollider(RAPIER.ColliderDesc.ball(.45)
          .setMass(.35)
          .setFriction(.4)
          .setRestitution(.28)
          .setCollisionGroups(0x00080001), helmetBody);
        helmetBody.setRotation(w.mesh.rotation.z, true);
        helmetBody.applyImpulse({ x: w.vx * .18 + w.deathSide * .8, y: Math.max(1.8, w.vy * .15 + 2.4) }, true);
        helmetBody.applyTorqueImpulse(w.deathSide * 1.6, true);
        w.deadHelmet = { group: w.duck.helmetGroup, body: helmetBody, collider: helmetCollider };
      }
    }
  }

  start() { if (this.world) { this.inMenu = false; this.matchHudCollapsed = true; this.matchHud.hidden = true; this.matchHudToggle.hidden = false; this.matchHudToggle.textContent = 'Панель'; this.matchHudToggle.setAttribute('aria-expanded', 'false'); this.backgroundHudToggle.hidden = false; this.backgroundHud.hidden = this.backgroundHudCollapsed; this.teamHealthHud.hidden = false; this.windHud.hidden = false; this.labels.hidden = false; if (this.mobileControls) this.mobileControls.hidden = false; this.loop.start(); } }
  pause() { this.weaponPanel?.close(); this.loop.pause(); this.keys.clear(); if (this.mobileControls) this.mobileControls.hidden = true; if (this.turn?.state === TURN.CHARGING_SHOT) this.turn.cancelCharge(); }
  resume() { if (!this.inMenu && document.visibilityState === 'visible') this.start(); }
  get running() { return this.loop.running; }
  humanInput() { return this.running && !this.winner && this.active?.alive && !this.teams[this.turn.team].bot; }

  update(dt) {
    this.time += dt;
    this.water?.update(dt, this.baseWaterSurface + this.waterLevel);
    this.earthquakeShake = Math.max(0, this.earthquakeShake - dt);
    this.damageDisplayTime = Math.max(0, this.damageDisplayTime - dt);
    this.turnIntroTime = Math.max(0, this.turnIntroTime - dt);
    this.particles.update(this.time);
    for (const worm of this.worms) worm.recoveryTime = Math.max(0, worm.recoveryTime - dt);
    if (this.winner) this.victoryTime += dt;
    else { this.turn.update(dt); this.bot.update(dt); }

    if (this.humanInput() && this.turnIntroTime <= 0 && this.active.recoveryTime <= 0 && (this.turn.state === TURN.WAITING_INPUT || this.weapons.retreat > 0 || this.weapons.flame) && (!this.weapons.movementMode || (this.weapons.movementMode.mode === 'bungee' && !this.weapons.movementMode.airborne) || (this.weapons.movementMode.mode === 'parachute' && this.active.grounded))) {

      const w = this.active,
        direction = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
      w.autoHopCooldown = Math.max(0, (w.autoHopCooldown || 0) - dt);
      const jump = this.keys.delete('Space');
      const backflip = w.backflipRequested && this.time <= w.backflipEligibleUntil && !this.weapons.movementMode;
      w.backflipRequested = false;
      // Если боец пошёл, прыгнул или начал заряжать выстрел — скрываем плашку
      if (direction !== 0 || jump || backflip || this.turn.state === TURN.CHARGING_SHOT) {
        this.activeMoved = true;
      }

      if (this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.keys.has('KeyS') || this.keys.has('ArrowDown')) {
        this.activeMoved = true;
      }
      if (direction) {
        w.facing = direction;
        if (Math.cos(this.angle) * direction < 0) this.angle = Math.PI - this.angle;
        this.angle = clampAimToFacing(this.angle, w.facing);
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
          // При ходьбе другой боец является неподвижным препятствием, а не
          // динамическим телом, которое можно вытолкнуть своим корпусом.
          for (const other of this.worms) {
            if (other === w || !other.alive) continue;
            const closeVertically = Math.abs(other.y - w.y) < 1.05;
            const distanceX = other.x - w.x;
            if (closeVertically && direction * distanceX > 0 && Math.abs(distanceX) < .8) {
              this.motion.x = 0;
              break;
            }
          }
          if (this.motion.x !== 0 && w.autoHopCooldown <= 0 && this.terrain) {
            const nextFloor = this.terrain.landingHeight(w.x + direction * .46, .38, .61);
            const stepUp = nextFloor !== null && nextFloor - w.y > .22 && nextFloor - w.y < 1.1;
            if (stepUp) {
              // Небольшой автоматический подъём через кочку, без звука прыжка.
              w.autoHopCooldown = .35;
              this.motion.x = direction * Math.max(3.4, Math.abs(this.motion.x));
              this.motion.y = 2.25;
              w.grounded = false;
            }
          }
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
      const verticalAim = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
        (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
      if (verticalAim) this.angle = clampAimToFacing(this.angle + verticalAim * (w.facing < 0 ? -1 : 1) * dt, w.facing);
    }

    for (const w of this.worms) {
      w.previousX = w.x; w.previousY = w.y;
      if (!w.alive) continue;
      w.slideTime = Math.max(0, w.slideTime - dt);
      const walkable = w.grounded && w.groundNormalY >= STANDING_SLOPE_NORMAL_Y;
      const walkingThroughWorms = w === this.active && w.grounded && w.slideTime === 0 && this.humanInput() &&
        (this.turn.state === TURN.WAITING_INPUT || this.weapons.retreat > 0 || this.weapons.movementMode || this.weapons.flame) &&
        (this.keys.has('KeyA') || this.keys.has('KeyD') || this.keys.has('ArrowLeft') || this.keys.has('ArrowRight'));
      // Во время обычной ходьбы стоящие другие бойцы временно фиксируются:
      // активный игрок упирается в них, но физический решатель не может
      // вытолкнуть их. Их коллайдер при этом продолжает сталкиваться с землёй.
      w.collider.setCollisionGroups(0x00020003);
      const shouldFreeze = walkingThroughWorms && w !== this.active && w.grounded && !w.knockedDown;
      if (shouldFreeze && !w.walkingFrozen) {
        w.walkingFrozen = true;
        w.walkingFrozenVelocity = { x: w.vx, y: w.vy };
        w.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
      } else if (!shouldFreeze && w.walkingFrozen) {
        w.walkingFrozen = false;
        w.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        w.body.setLinvel(w.walkingFrozenVelocity || { x: 0, y: 0 }, true);
        w.body.wakeUp();
      }
      w.collider.setFriction(w.slideTime > 0 || !walkable ? .12 : .38);
      if (!walkable || w.body.isSleeping()) continue;

      const velocity = w.body.linvel(), nx = w.groundNormalX, ny = w.groundNormalY;
      const normalSpeed = velocity.x * nx + velocity.y * ny;
      if (normalSpeed > .3) continue;

      const tangentSpeed = velocity.x * ny - velocity.y * nx;
      let tangentDelta = this.world.gravity.y * nx * dt;
      const moving = w === this.active && this.humanInput() &&
        (this.turn.state === TURN.WAITING_INPUT || this.weapons.retreat > 0 || this.weapons.movementMode || this.weapons.flame) &&
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
      const w = this.active;
      const verticalAim = (this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('ArrowDown') ? 1 : 0);
      if (verticalAim) this.angle = clampAimToFacing(this.angle + verticalAim * (w.facing < 0 ? -1 : 1) * dt, w.facing);
    }
    this.weapons.updateMovement(dt);
    this.world.step(this.events);
    this.weapons.update(dt);
    this.terrain?.setParticleLights(this.particles.glintData, this.weapons.getFireLightData());
    this.syncWorms(dt);
    this.updateSupplyCrates(dt);
    this.updateDisplayedHealth(dt);
  }

  resetTrainingWorm(w) {
    const spawn = w.trainingSpawn || { x: MAP.width / 2, y: this.terrain.spawnHeight(MAP.width / 2) };
    w.body.setTranslation(spawn, true);
    w.body.setLinvel({ x: 0, y: 0 }, true);
    w.body.setAngvel(0, true);
    w.body.wakeUp();
    w.x = w.previousX = spawn.x;
    w.y = w.previousY = spawn.y;
    w.vx = w.vy = 0;
    w.airborneTime = 0;
    w.airbornePeakY = spawn.y;
    w.hardFalling = false;
    w.knockedDown = false;
    w.impactVelocityX = 0;
    w.impactSpinDirection = 0;
    w.recoveryTime = 0;
    w.state = 'alive';
    w.mesh.position.set(spawn.x, spawn.y, 0);
    w.mesh.rotation.z = 0;
  }

  syncWorms(dt = 0) {
    for (const w of this.worms) if (w.alive) {
      const wasGrounded = w.grounded, fallSpeed = w.vy;
      this.resolveTerrainPenetration(w);
      const p = w.body.translation(), v = w.body.linvel();
      w.x = p.x; w.y = p.y; w.vx = v.x; w.vy = v.y;
      if (w.knockedDown && w.impactSpinDirection === 0) {
        const horizontalImpulse = w.vx - w.impactVelocityX;
        w.impactSpinDirection = Math.abs(horizontalImpulse) > .05 ? -Math.sign(horizontalImpulse) : -w.facing;
      }
      if (w.y < -3 || w.x < -3 || w.x > MAP.width + 3) {
        if (this.gameMode === 'training' && !w.trainingTarget) this.resetTrainingWorm(w);
        else this.damage(w, w.hp, true);
        continue;
      }
      const waterSurface = this.water?.getHeightAt(w.x) ?? this.baseWaterSurface + this.waterLevel;
      if (w.y - .68 < waterSurface) {
        if (!w.inWater) this.water?.splashAt(w.x, Math.max(Math.abs(w.vy), 1.1), 2.2);
        w.inWater = true;
        this.startDrowning(w);
        continue;
      }
      w.inWater = false;
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
      // Убираем только мелкие вертикальные импульсы от контакта с поверхностью.
      // Сильные импульсы взрыва и отбрасывания остаются без изменений.
      if (w.grounded && w.vy > 0 && w.vy < 2.5) {
        w.body.setLinvel({ x: w.vx, y: 0 }, true);
        w.vy = 0;
      }
      if (!w.grounded) {
        w.airborneTime += dt;
        w.airbornePeakY = Math.max(w.airbornePeakY, w.y);
        w.hardFalling = w.knockedDown || (w.airborneTime >= .4 && (w.airbornePeakY - w.y >= 3.5 || w.vy < -5.5));
        if (w.knockedDown) {
          w.healthRevealTime = Math.max(w.healthRevealTime, .12);
          w.tumbleRotation += w.impactSpinDirection * dt * THREE.MathUtils.clamp(4.5 + Math.hypot(w.vx, w.vy) * .35, 5, 10);
        }
      } else {
        const wasActuallyAirborne = !wasGrounded && w.airborneTime >= .4;
        const impactSpeed = Math.hypot(w.vx, w.vy);
        const impactStillMoving = w.knockedDown && impactSpeed > .55;
        const hardLanding = (wasActuallyAirborne && (w.airbornePeakY - w.y >= 3.5 || fallSpeed < -5.5)) || (w.knockedDown && !impactStillMoving);
        if (wasActuallyAirborne && fallSpeed < -2) {
          w.slideTime = .45;
        }
        if (hardLanding) {
          w.recoverySide = w.knockedDown ? w.impactSpinDirection : -w.facing;
          w.recoveryTime = 1.45;
          w.healthRevealTime = Math.max(w.healthRevealTime, 1.45);
          this.audio?.play('landing');
        }
        w.airborneTime = 0;
        w.airbornePeakY = w.y;
        w.hardFalling = impactStillMoving;
        if (impactStillMoving) {
          w.healthRevealTime = Math.max(w.healthRevealTime, .12);
          w.tumbleRotation += w.impactSpinDirection * dt * THREE.MathUtils.clamp(4.5 + impactSpeed * .35, 5, 10);
        }
        if (!impactStillMoving) w.knockedDown = false;
        if (w.backflipping && this.time - w.backflipStart > .18) w.backflipping = false;
      }
      w.state = w.grounded ? 'alive' : 'airborne';
    }
    for (const w of this.worms) if (!w.alive && w.state === 'drowning') {
      w.drowningTime += dt;
      const progress = THREE.MathUtils.clamp(w.drowningTime / w.drowningDuration, 0, 1);
      const diveProgress = THREE.MathUtils.clamp(w.drowningTime / w.drowningDiveDuration, 0, 1);
      const slowProgress = THREE.MathUtils.clamp((w.drowningTime - w.drowningDiveDuration) / (w.drowningDuration - w.drowningDiveDuration), 0, 1);
      const remainingDistance = w.drowningDistance - w.drowningDiveDistance;
      const slowShape = slowProgress * slowProgress * (3 - 2 * slowProgress);
      const sinkDistance = w.drowningDiveDistance * diveProgress + remainingDistance * slowShape;
      w.mesh.position.set(w.drowningStartX, w.drowningStartY - sinkDistance, 0);
      w.mesh.rotation.z = Math.sin(w.drowningTime * 2.4) * .045 * (1 - progress);
      w.drowningBubbleTimer -= dt;
      if (w.drowningBubbleTimer <= 0 && progress < 1) {
        this.water?.emitBubbles(w.mesh.position.x, w.mesh.position.y + .28, 8);
        w.drowningBubbleTimer = .1;
      }
      if (w.drowningDamagePopup) {
        const fade = THREE.MathUtils.clamp(1 - w.drowningTime / 2.2, 0, 1);
        w.drowningDamagePopup.style.opacity = String(fade);
        if (fade <= 0) {
          w.drowningDamagePopup.remove();
          w.drowningDamagePopup = null;
        }
      }
      if (progress >= 1 && this.cameraFocus?.drowningFocus) this.cameraFocus = null;
    }

    for (const w of this.worms) if (!w.alive && w.state === 'dead') {
      w.previousX = w.x; w.previousY = w.y;
      const previousVx = w.vx, previousVy = w.vy;
      const p = w.body.translation(), v = w.body.linvel();
      w.x = p.x; w.y = p.y; w.vx = v.x; w.vy = v.y;
      if (w.deathTime > .5) {
        const impulseX = w.vx - previousVx, impulseY = w.vy - previousVy;
        if (Math.abs(impulseX) > .2 || Math.abs(impulseY) > .35) {
          w.deathSide = Math.abs(impulseX) > .2 ? -Math.sign(impulseX) : w.deathSide;
          w.deathSpinVelocity += w.deathSide * THREE.MathUtils.clamp(Math.abs(impulseX) * 1.8 + Math.abs(impulseY), 1, 8);
        }
      }
    }
  }

  updateDisplayedHealth(dt) {
    for (const w of this.worms) {
      if (w.healthRevealTime > 0) {
        const wasWaiting = w.healthRevealTime > 0;
        w.healthRevealTime = Math.max(0, w.healthRevealTime - dt);
        continue;
      }
      const target = w.pendingHp ?? w.hp;
      const difference = target - w.displayedHp;
      if (Math.abs(difference) < .05) {
        if (w.displayedHp !== target) {
          w.displayedHp = target;
          w.health.value = target;
          w.healthText.textContent = String(Math.ceil(target));
        }
        continue;
      }
      const healthStep = 48 * dt;
      w.displayedHp += Math.sign(difference) * Math.min(Math.abs(difference), healthStep);
      w.health.value = w.displayedHp;
      w.healthText.textContent = String(Math.ceil(w.displayedHp));
    }
  }

  damagePresentationComplete() {
    return this.worms.every(w => w.healthRevealTime <= 0 && Math.abs((w.pendingHp ?? w.hp) - w.displayedHp) < .05);
  }

  releaseDamagePopups(w) {
    const total = w.pendingDamage || 0;
    w.pendingDamage = 0;
    if (!w.label || w.label.hidden || total <= 0) return;
    this.damageDisplayTime = Math.max(this.damageDisplayTime, 1.4);
    const popup = document.createElement('strong');
    popup.className = 'worm-damage-popup';
    popup.textContent = `-${Math.ceil(total)}`;
    w.label.append(popup);
    setTimeout(() => popup.remove(), 2100);
  }
  releasePendingDamagePopups() { for (const w of this.worms) this.releaseDamagePopups(w); }

  advanceTargetTraining(target) {
    if (!this.targetTrainingActive) return false;
    const nextStage = this.targetTrainingStage + 1;
    if (nextStage >= this.targetTrainingTargets.length) {
      this.onTrainingMissionComplete?.(this.trainingWeapon);
      this.showFloatingAnnouncement('Миссия пройдена!', 'Новое оружие разблокировано');
      return false;
    }
    this.targetTrainingStage = nextStage;
    const position = this.targetTrainingTargets[nextStage];
    target.hp = 40;
    target.displayedHp = 40;
    target.pendingHp = 40;
    target.healthRevealTime = 0;
    target.pendingDamage = 0;
    target.health.max = 40;
    target.health.value = 40;
    target.healthText.textContent = '40';
    target.health.title = '40 HP';
    target.name = `Мишень ${nextStage + 1}`;
    target.label.querySelector('span').textContent = target.name;
    target.body.setTranslation(position, true);
    target.x = target.previousX = position.x;
    target.y = target.previousY = position.y;
    target.vx = target.vy = 0;
    target.mesh.position.set(position.x, position.y, 0);
    target.mesh.visible = true;
    target.label.hidden = false;
    return true;
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
    for (let lift = step; lift <= 6; lift += step) {
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
    this.camera.position.x -= this.earthquakeShakeX;
    this.camera.position.y -= this.earthquakeShakeY;
    this.earthquakeShakeX = 0;
    this.earthquakeShakeY = 0;
    const target = this.weapons.projectile || this.cameraFocus || this.active;
    const cameraPan = this.cameraFocus || this.weapons.projectile ? { x: 0, y: 0 } : this.cameraPan;
    const smoothing = 1 - Math.exp(-5 * dt);
    this.camera.zoom += (this.zoom - this.camera.zoom) * smoothing;
    this.camera.updateProjectionMatrix();

    const halfW = (this.camera.right - this.camera.left) / 2 / this.camera.zoom,
      halfH = (this.camera.top - this.camera.bottom) / 2 / this.camera.zoom;
    if (target) {
      let x = halfW >= MAP.width / 2
          ? MAP.width / 2
          : THREE.MathUtils.clamp(target.x + cameraPan.x, halfW, MAP.width - halfW),
        y = halfH >= MAP.height / 2
          ? THREE.MathUtils.clamp(MAP.height / 2 + cameraPan.y, MAP.height * .25, MAP.height * .75)
          : THREE.MathUtils.clamp(target.y + cameraPan.y, halfH, MAP.height - halfH);
      if (this.weaponPanel.open) this.mousePanPosition = null;
      if (this.mousePanPosition && !this.weaponPanel.open && !this.cameraFocus && !this.weapons.projectile) {
        const rect = this.canvas.getBoundingClientRect();
        const edgeZone = Math.min(rect.width, rect.height) * .12;
        const edgeAxis = (position, start, size) => {
          if (position < start + edgeZone) return -THREE.MathUtils.clamp((start + edgeZone - position) / edgeZone, 0, 1);
          if (position > start + size - edgeZone) return THREE.MathUtils.clamp((position - (start + size - edgeZone)) / edgeZone, 0, 1);
          return 0;
        };
        const edgeX = edgeAxis(this.mousePanPosition.x, rect.left, rect.width);
        const edgeY = edgeAxis(this.mousePanPosition.y, rect.top, rect.height);
        const panRate = .5;
        if (edgeX && halfW < MAP.width / 2) {
          const nextX = THREE.MathUtils.clamp(x + edgeX * halfW * 2 * panRate * dt, halfW, MAP.width - halfW);
          this.cameraPan.x += nextX - x;
          x = nextX;
        }
        if (edgeY) {
          const minY = halfH >= MAP.height / 2 ? MAP.height * .25 : halfH;
          const maxY = halfH >= MAP.height / 2 ? MAP.height * .75 : MAP.height - halfH;
          const nextY = THREE.MathUtils.clamp(y - edgeY * halfH * 2 * panRate * dt, minY, maxY);
          this.cameraPan.y += nextY - y;
          y = nextY;
        }
      }
      this.camera.position.x += (x - this.camera.position.x) * smoothing;
      this.camera.position.y += (y - this.camera.position.y) * smoothing;
      if (this.cameraFocus && !this.cameraFocus.supplyCrate && !this.cameraFocus.drowningFocus && !this.cameraFocus.explosionFocus && Math.hypot(x - this.camera.position.x, y - this.camera.position.y) < .35) this.cameraFocus = null;
    }
    if (this.earthquakeShake > 0) {
      const strength = Math.min(.88, this.earthquakeShake * 1.5);
      this.earthquakeShakeX = (Math.random() - .5) * strength;
      this.earthquakeShakeY = (Math.random() - .5) * strength;
      this.camera.position.x += this.earthquakeShakeX;
      this.camera.position.y += this.earthquakeShakeY;
    }
    this.camera.updateMatrixWorld();
    if (this.water?.bodyMaterial?.uniforms?.uMoonX) {
      this.water.bodyMaterial.uniforms.uMoonX.value = this.camera.position.x + .44 * halfW;
    }

    // Процедурные анимации для каждой утки
    // Процедурные анимации и оружие для каждой утки
    for (const w of this.worms) if (w.alive) {
      const isWinningWorm = this.winner && this.winningTeam === w.team;
      w.mesh.visible = !w.invisible;
      w.label.hidden = w.invisible;
      const jetPackFlight = this.weapons.movementMode?.mode === 'jetPack' ? this.weapons.movementMode : null;
      const showJetpackFuel = jetPackFlight?.owner === w && !this.winner;
      w.fuelIndicator.hidden = !showJetpackFuel;
      w.label.classList.toggle('jetpack-active', showJetpackFuel);
      if (showJetpackFuel) w.fuelValue.textContent = String(Math.ceil(this.weapons.jetPackFuel ?? 100));
      const showTurnMarker = w === this.active && !this.activeMoved && !this.winner;
      w.turnMarker.hidden = !showTurnMarker;
      w.turnMarker.classList.toggle('turn-marker-spring', showTurnMarker && this.turnIntroTime <= 1.2);
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
      const isJetPackFlying = w === this.active && this.weapons.movementMode?.mode === 'jetPack';
      const isWalking = !isJetPackFlying && w.grounded && Math.abs(w.vx) > 0.3;
      const isAirborne = !w.grounded;
      const isImpactTumbling = w.knockedDown && Math.hypot(w.vx, w.vy) > .55;
      const isRecovering = !isJetPackFlying && w.recoveryTime > 0;

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
        d.weaponMesh.visible = !isJetPackFlying;

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

      const equipmentType = !this.winner && w === this.active && !isRecovering &&
        (this.turn.weapon === 'jetPack' || this.weapons.movementMode?.mode === 'jetPack') ? 'jetPack' : null;
      if (d.currentEquipment !== equipmentType) {
        disposeWeaponMesh(d.equipmentMesh);
        d.equipmentMesh = equipmentType ? this.weaponArt.createEquipment(equipmentType) : null;
        if (d.equipmentMesh) w.mesh.add(d.equipmentMesh);
        d.currentEquipment = equipmentType;
      }
      if (d.equipmentMesh) {
        d.equipmentMesh.visible = Boolean(equipmentType);
        d.equipmentMesh.position.set(-w.facing * .45, .04, -.12);
        d.equipmentMesh.scale.set(1, 1, 1);
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
      } else if (isJetPackFlying) {
        // Ранец держит червя вертикально: полёт не должен выглядеть как падение или кувырок.
        w.mesh.rotation.z = 0;
        d.bodyPivot.scale.set(1, 1, 1);
        d.wingLPivot.rotation.z = p.wingBaseRotZ;
        d.wingRPivot.rotation.z = -p.wingBaseRotZ;
      } else if (isRecovering) {
        const elapsed = 1.45 - w.recoveryTime;
        const side = w.recoverySide;
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
      } else if (isAirborne || isImpactTumbling) {
        const flap = Math.sin(w.animTime * 22);
        const fallRotation = -w.facing * Math.PI * .86;
        const targetRotation = w.hardFalling ? fallRotation : THREE.MathUtils.clamp(w.vy * 0.04, -0.4, 0.4);
        if (w.backflipping) {
          const flipProgress = THREE.MathUtils.clamp((this.time - w.backflipStart) / .72, 0, 1);
          w.mesh.rotation.z = -w.jumpFacing * flipProgress * Math.PI * 2;
        } else if (w.knockedDown) {
          w.mesh.rotation.z = w.tumbleRotation;
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

    const shooter = this.active;
    const weaponVisual = shooter?.duck?.weaponMesh;
    const weaponIsVisible = shooter?.alive && !this.winner && shooter.recoveryTime <= 0 &&
      (this.turn.state === TURN.WAITING_INPUT || this.turn.state === TURN.CHARGING_SHOT) &&
      this.weapons.movementMode?.mode !== 'jetPack' && weaponVisual?.visible;
    if (weaponIsVisible) {
      const thought = this.weaponArt.thought(this.turn.weapon);
      const aimedRotation = (shooter.facing > 0 ? this.angle : Math.PI - this.angle) * shooter.facing;
      const artAngle = thought ? 0 : this.weaponArt.aimArtAngle(this.turn.weapon) * shooter.facing;
      weaponVisual.rotation.z = (thought ? 0 : aimedRotation - artAngle) - shooter.mesh.rotation.z;
    }

    for (const w of this.worms) if (!w.alive && w.state === 'dead') {
      w.deathTime += dt;
      w.mesh.position.set(w.x, w.y, 0);
      const fallProgress = THREE.MathUtils.smoothstep(Math.min(1, w.deathTime / .5), 0, 1);
      w.mesh.rotation.z = THREE.MathUtils.lerp(w.deathStartRotation, w.deathSide * Math.PI * .5, fallProgress);
      if (w.deadHelmet) {
        const helmet = w.deadHelmet;
        const helmetPosition = helmet.body.translation();
        helmet.group.position.set(helmetPosition.x, helmetPosition.y, .12);
        helmet.group.rotation.z = helmet.body.rotation();
      }
      w.deathSpinVelocity *= Math.max(0, 1 - dt * 3.5);
      w.mesh.rotation.z += w.deathSpinVelocity * dt;
    }

    const pointTargeting = this.weapons.usesTarget(this.turn.weapon) &&
      (this.turn.state === TURN.WAITING_INPUT || this.turn.state === TURN.CHARGING_SHOT);
    const waitingForTarget = pointTargeting && !this.weapons.targetSet;
    const showAim = !!this.active?.alive && !this.winner && !waitingForTarget && !NO_AIM_WEAPONS.has(this.turn.weapon) &&
      (this.turn.state === TURN.WAITING_INPUT || this.turn.state === TURN.CHARGING_SHOT);
    this.aim.visible = showAim;
    this.canvas.style.cursor = pointTargeting ? TARGET_CURSOR : 'default';
    const showLaserSight = showAim && !pointTargeting && this.active?.laserSight;
    this.laserSightLine.visible = !!showLaserSight;


    if (showAim) {
      this.aim.position.copy(this.active.mesh.position);
      this.aim.rotation.z = this.angle;

      if (showLaserSight) {
        const ray = this.weapons.ray;
        ray.origin.x = this.active.x;
        ray.origin.y = this.active.y;
        ray.dir.x = Math.cos(this.angle);
        ray.dir.y = Math.sin(this.angle);
        const hit = this.world.castRay(ray, 65, true, undefined, undefined, this.active.collider, this.active.body);
        const length = hit ? Math.max(.5, hit.timeOfImpact) : 65;
        this.laserSightLine.geometry.setFromPoints([
          new THREE.Vector3(.45, 0, .14),
          new THREE.Vector3(length, 0, .14)
        ]);
      }

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

    this.updateWormLabelPositions();
    this.backgroundMaterial.uniforms.uTime.value = this.time;
    this.renderer.clear();
    this.renderer.render(this.backgroundScene, this.backgroundCamera);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
    this.hudTime += dt;
    if (this.hudTime >= .05) { this.hudTime = 0; this.updateHUD(); }
  }

  updateMoonScale() {
    if (!this.moon) return;
    const aspect = this.width / Math.max(this.height, 1);
    const heightScale = .18 * (this.moonScaleFactor ?? .7);
    this.moon.scale.set(heightScale / Math.max(aspect, .1), heightScale, 1);
    if (this.moonGlow) {
      const glowHeightScale = .38 * (this.moonGlowScaleFactor ?? 1);
      this.moonGlow.scale.set(glowHeightScale / Math.max(aspect, .1), glowHeightScale, 1);
    }
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
    this.backgroundMaterial?.uniforms.uResolution.value.set(width, height);
    this.updateMoonScale();
  }

  installMobileControls() {
    const controls = document.createElement('div');
    controls.className = 'mobile-controls';
    controls.hidden = true;
    controls.innerHTML = [
      '<div class="mobile-control-group mobile-movement" aria-label="Передвижение">',
      '  <button type="button" data-key="KeyA" aria-label="Идти влево">◀</button>',
      '  <button type="button" data-key="KeyD" aria-label="Идти вправо">▶</button>',
      '  <button type="button" data-action="jump" aria-label="Прыгнуть">↟</button>',
      '</div>',
      '<div class="mobile-control-group mobile-camera" aria-label="Камера">',
      '  <button type="button" data-camera="panUp" aria-label="Камера вверх">▲</button>',
      '  <button type="button" data-camera="panLeft" aria-label="Камера влево">◀</button>',
      '  <button type="button" data-camera="reset" aria-label="Центрировать камеру">●</button>',
      '  <button type="button" data-camera="panRight" aria-label="Камера вправо">▶</button>',
      '  <button type="button" data-camera="panDown" aria-label="Камера вниз">▼</button>',
      '  <button type="button" data-camera="zoomOut" aria-label="Уменьшить">−</button>',
      '  <button type="button" data-camera="zoomIn" aria-label="Увеличить">+</button>',
      '</div>',
      '<div class="mobile-control-group mobile-action" aria-label="Прицел и огонь">',
      '  <button type="button" data-key="ArrowUp" aria-label="Поднять угол">⌃</button>',
      '  <button type="button" data-key="ArrowDown" aria-label="Опустить угол">⌄</button>',
      '  <button type="button" class="mobile-fire" data-action="fire" aria-label="Огонь">ОГОНЬ</button>',
      '</div>',
      '<div class="mobile-gesture-hint">Два пальца — двигать камеру и менять масштаб</div>'
    ].join('');
    document.querySelector('#game-root').append(controls);
    this.mobileControls = controls;

    const cameraStep = 7;
    const pressKey = event => {
      event.preventDefault();
      event.stopPropagation();
      const key = event.currentTarget.dataset.key;
      if (!this.humanInput() || !key) return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      this.keys.add(key);
      if (key === 'KeyW') {
        const activeWorm = this.active;
        if (activeWorm && this.time - activeWorm.jumpTapTime <= .38) activeWorm.backflipRequested = true;
        if (activeWorm) activeWorm.jumpTapTime = this.time;
      }
    };
    const releaseKey = event => {
      event.preventDefault();
      event.stopPropagation();
      const key = event.currentTarget.dataset.key;
      if (key) this.keys.delete(key);
    };
    controls.querySelectorAll('[data-key]').forEach(button => {
      button.addEventListener('pointerdown', pressKey);
      button.addEventListener('pointerup', releaseKey);
      button.addEventListener('pointercancel', releaseKey);
      button.addEventListener('lostpointercapture', releaseKey);
    });

    const pressAction = event => {
      event.preventDefault();
      event.stopPropagation();
      if (!this.humanInput()) return;
      const action = event.currentTarget.dataset.action;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      if (action === 'jump') {
        this.keys.add('KeyW');
        const activeWorm = this.active;
        if (activeWorm && this.time - activeWorm.jumpTapTime <= .38) activeWorm.backflipRequested = true;
        if (activeWorm) activeWorm.jumpTapTime = this.time;
      }
      if (action === 'fire' && !this.weapons.remote()) this.turn.beginCharge();
    };
    const releaseAction = event => {
      event.preventDefault();
      event.stopPropagation();
      if (event.currentTarget.dataset.action === 'fire' && this.humanInput()) this.turn.release();
    };
    controls.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('pointerdown', pressAction);
      button.addEventListener('pointerup', releaseAction);
      button.addEventListener('pointercancel', releaseAction);
      button.addEventListener('lostpointercapture', releaseAction);
    });

    controls.querySelectorAll('[data-camera]').forEach(button => {
      button.addEventListener('pointerdown', event => {
        event.preventDefault();
        event.stopPropagation();
        const action = event.currentTarget.dataset.camera;
        if (action === 'panLeft') this.cameraPan.x -= cameraStep;
        if (action === 'panRight') this.cameraPan.x += cameraStep;
        if (action === 'panUp') this.cameraPan.y += cameraStep;
        if (action === 'panDown') this.cameraPan.y -= cameraStep;
        if (action === 'zoomIn') this.zoom = THREE.MathUtils.clamp(this.zoom * 1.18, 1, 3);
        if (action === 'zoomOut') this.zoom = THREE.MathUtils.clamp(this.zoom / 1.18, 1, 3);
        if (action === 'reset') { this.cameraPan.x = 0; this.cameraPan.y = 0; this.zoom = 1.2; this.cameraFocus = null; }
      });
    });
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
      if (e.code === 'Space') {
        const w = this.active;
        if (w && this.time - w.jumpTapTime <= .38) w.backflipRequested = true;
        if (w) w.jumpTapTime = this.time;
      }
      if (e.code === 'Enter') { if (!this.weapons.remote()) this.turn.beginCharge(); }
      if (e.code === 'KeyX' && this.weapons.movementMode) this.weapons.dropWeapon();
      if (/Digit[1-5]/.test(e.code) && this.turn.state === TURN.WAITING_INPUT) {
        if (this.turn.weapon === 'madCows') this.weapons.cowCount = Number(e.code.slice(-1));
        else this.weapons.fuse = Number(e.code.slice(-1));
      }
      if (e.code === 'Equal' || e.code === 'NumpadAdd') this.weapons.bounce = .7;
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.weapons.bounce = .2;
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      if (e.code === 'Enter' && this.humanInput()) this.turn.release();
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      if (this.turn?.state === TURN.CHARGING_SHOT) {
        this.turn.cancelCharge();
      }
    });
    this.canvas.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch' && this.touchPointers.has(e.pointerId)) {
        this.touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.touchPointers.size >= 2 && this.touchGesture) {
          e.preventDefault();
          const points = [...this.touchPointers.values()];
          const firstPoint = points[0];
          const secondPoint = points[1];
          const midpointX = (firstPoint.x + secondPoint.x) / 2;
          const midpointY = (firstPoint.y + secondPoint.y) / 2;
          const distance = Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y);
          const rect = this.canvas.getBoundingClientRect();
          const viewWidth = (this.camera.right - this.camera.left) / this.camera.zoom;
          const viewHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;
          this.cameraPan.x = this.touchGesture.startPan.x - (midpointX - this.touchGesture.startMidpoint.x) * viewWidth / rect.width;
          this.cameraPan.y = this.touchGesture.startPan.y - (midpointY - this.touchGesture.startMidpoint.y) * viewHeight / rect.height;
          this.zoom = THREE.MathUtils.clamp(this.touchGesture.startZoom * distance / this.touchGesture.startDistance, 1, 3);
          return;
        }
      }
      const rect = this.canvas.getBoundingClientRect();
      if (e.pointerType === 'mouse') {
        if (this.weaponPanel.open) { this.mousePanPosition = null; return; }
        const viewWidth = (this.camera.right - this.camera.left) / this.camera.zoom;
        const viewHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;
        const mousePanSensitivity = 2;
        this.mousePanPosition = { x: e.clientX, y: e.clientY };
        this.cameraPan.x += e.movementX * viewWidth / rect.width * mousePanSensitivity;
        this.cameraPan.y -= e.movementY * viewHeight / rect.height * mousePanSensitivity;
      }
    });
    this.canvas.addEventListener('pointerleave', e => {
      if (e.pointerType === 'mouse') this.mousePanPosition = null;
    });
    this.canvas.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') {
        this.touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.touchPointers.size >= 2) {
          this.turn?.cancelCharge();
          const points = [...this.touchPointers.values()];
          const firstPoint = points[0];
          const secondPoint = points[1];
          this.touchGesture = {
            startDistance: Math.max(1, Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y)),
            startMidpoint: { x: (firstPoint.x + secondPoint.x) / 2, y: (firstPoint.y + secondPoint.y) / 2 },
            startPan: { x: this.cameraPan.x, y: this.cameraPan.y },
            startZoom: this.zoom
          };
          return;
        }
      }
      if (e.button === 0 && this.weaponPanel.open) { this.weaponPanel.close(); return; }
      if (e.button === 0 && this.humanInput()) {
        this.canvas.setPointerCapture(e.pointerId);
        if (this.weapons.remote()) return;
        if (this.turn.state === TURN.WAITING_INPUT && this.weapons.usesTarget(this.turn.weapon)) {
          const rect = this.canvas.getBoundingClientRect();
          this.vector.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1, 0).unproject(this.camera);
          this.weapons.setTarget(this.vector.x, this.vector.y);
          if (['homing', 'pigeon', 'magicBullet'].includes(this.turn.weapon)) return;
          if (e.pointerType === 'mouse') { this.turn.beginCharge(); return; }
        }
        if (e.pointerType === 'mouse') return;
        this.turn.beginCharge();
      }
    });
    this.canvas.addEventListener('pointerup', e => {
      if (e.pointerType === 'touch') {
        const hadGesture = Boolean(this.touchGesture);
        this.touchPointers.delete(e.pointerId);
        if (this.touchPointers.size < 2) this.touchGesture = null;
        if (hadGesture || this.touchPointers.size > 0) return;
      }
      if (e.button === 0 && e.pointerType !== 'mouse' && this.humanInput()) this.turn.release();
    });
    this.canvas.addEventListener('pointercancel', e => {
      if (e.pointerType === 'touch') {
        this.touchPointers.delete(e.pointerId);
        this.touchGesture = null;
      }
      this.turn?.cancelCharge();
    });
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(-e.deltaY * .001), 1, 3);
    }, { passive: false });
  }

  installUI() {
    const start = document.querySelector('#start-button');
    const startSubtitle = document.querySelector('.start-subtitle');
    start.hidden = true;
    const modeSelect = document.createElement('div');
    modeSelect.className = 'game-mode-select';
    modeSelect.innerHTML = `
      <button type="button" data-mode="training">
        <strong>Тренировка</strong>
        <span>Свободный режим без ограничений</span>
      </button>
      <button type="button" data-mode="quick">
        <strong>Быстрый матч</strong>
        <span>Игра на одном устройстве против игроков и ботов</span>
      </button>
      <button type="button" data-mode="missions">
        <strong>Прохождение миссий</strong>
        <span>Освойте базуку и гранаты в специальных заданиях</span>
      </button>
      <button type="button" data-mode="settings">
        <strong>Настройки</strong>
        <span>Звук и язык игры</span>
      </button>
    `;
    const trainingWeapons = [
      { id: 'bazooka', description: 'Траектория и сила выстрела' },
      { id: 'grenade', description: 'Бросок, запал и отскок' },
      { id: 'mortar', description: 'Навесная траектория и точный удар' }
    ].map(weapon => ({ ...weapon, title: weapon.title || ARSENAL[weapon.id] }));
    const trainingSelect = document.createElement('div');
    trainingSelect.className = 'training-select';
    trainingSelect.hidden = true;
    trainingSelect.innerHTML = `
      <div class="training-select-heading">
        <span class="training-kicker">УТИНАЯ АРТИЛЛЕРИЯ</span>
        <strong>МИССИИ</strong>
        <span>Выберите задание и отточите свои навыки</span>
      </div>
      <div class="mission-progress" aria-label="Прогресс миссий">
        <span class="mission-progress-medal" aria-hidden="true">★</span>
        <div class="mission-progress-copy"><strong>Прогресс миссий</strong><span class="mission-progress-value"></span></div>
        <div class="mission-progress-track"><span class="mission-progress-fill"></span></div>
      </div>
      <div class="mission-slider" aria-live="polite">
        <button type="button" class="mission-arrow mission-arrow-prev" aria-label="Предыдущая миссия">‹</button>
        <div class="mission-slides">
          <button type="button" class="mission-side mission-side-prev"></button>
          <article class="mission-card"></article>
          <button type="button" class="mission-side mission-side-next"></button>
        </div>
        <button type="button" class="mission-arrow mission-arrow-next" aria-label="Следующая миссия">›</button>
      </div>
      <div class="mission-dots" aria-label="Выбор миссии"></div>
      <div class="training-actions">
        <button type="button" class="training-back">← <span>Назад</span></button>
        <button type="button" class="mission-start"><span aria-hidden="true">▶</span> Начать миссию</button>
      </div>
    `;
    const arsenalIds = Object.keys(ARSENAL);
    const missionCard = trainingSelect.querySelector('.mission-card');
    const missionSlides = trainingSelect.querySelector('.mission-slides');
    const missionSidePrev = trainingSelect.querySelector('.mission-side-prev');
    const missionSideNext = trainingSelect.querySelector('.mission-side-next');
    const missionDots = trainingSelect.querySelector('.mission-dots');
    const missionProgressValue = trainingSelect.querySelector('.mission-progress-value');
    const missionProgressFill = trainingSelect.querySelector('.mission-progress-fill');
    const missionStart = trainingSelect.querySelector('.mission-start');
    let missionIndex = 0;

    const missionIcon = weapon => {
      const index = arsenalIds.indexOf(weapon.id);
      const [x, y, width, height] = WEAPON_ICON_REGIONS[index] || [0, 0, 1, 1];
      return `<svg class="mission-weapon-icon" aria-hidden="true" viewBox="0 0 ${width} ${height}" focusable="false"><svg width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}" overflow="hidden"><image href="${import.meta.env.BASE_URL}assets/weapon-atlas.png" width="749" height="2098"></image></svg></svg>`;
    };
    const missionDetails = {
      bazooka: { subtitle: 'Точный выстрел', objective: 'Поразьте все мишени минимальным количеством выстрелов', difficulty: 2, reward: 'Новая техника', tint: 'warm', map: 'training/2.png' },
      grenade: { subtitle: 'Взрывной бросок', objective: 'Уничтожьте все цели одним точным броском', difficulty: 1, reward: 'Новый арсенал', tint: 'violet', map: 'training/2.png' },
      mortar: { subtitle: 'Точный выстрел', objective: 'Поразьте все мишени минимальным количеством выстрелов', difficulty: 2, reward: 'Новая техника', tint: 'warm', map: 'training/2.png' }
    };
    const missionMapUrl = details => `${import.meta.env.BASE_URL}${details.map}`;
    const missionPreview = (weapon, side) => {
      const details = missionDetails[weapon.id];
      return `<span class="mission-side-number">${trainingWeapons.indexOf(weapon) + 1}</span>${missionIcon(weapon)}<strong>${weapon.title}</strong><span>${details.subtitle}</span><i class="mission-side-arrow">${side === 'prev' ? '‹' : '›'}</i>`;
    };
    const renderMissions = () => {
      const current = trainingWeapons[missionIndex];
      const previous = trainingWeapons[(missionIndex - 1 + trainingWeapons.length) % trainingWeapons.length];
      const next = trainingWeapons[(missionIndex + 1) % trainingWeapons.length];
      const details = missionDetails[current.id];
      const completed = new Set(this.getTrainingProfile?.()?.completedMissions || []);
      const completedCount = trainingWeapons.filter(weapon => completed.has(weapon.id)).length;
      missionProgressValue.textContent = `: ${completedCount}/${trainingWeapons.length}`;
      missionProgressFill.style.width = `${completedCount / trainingWeapons.length * 100}%`;
      missionSidePrev.innerHTML = missionPreview(previous, 'prev');
      missionSideNext.innerHTML = missionPreview(next, 'next');
      missionSidePrev.style.setProperty('--mission-map-image', `url("${missionMapUrl(missionDetails[previous.id])}")`);
      missionSideNext.style.setProperty('--mission-map-image', `url("${missionMapUrl(missionDetails[next.id])}")`);
      missionSidePrev.setAttribute('aria-label', `Миссия: ${previous.title}`);
      missionSideNext.setAttribute('aria-label', `Миссия: ${next.title}`);
      missionCard.className = `mission-card mission-card--${details.tint}`;
      missionCard.style.setProperty('--mission-map-image', `url("${missionMapUrl(details)}")`);
      missionCard.innerHTML = `
        <span class="mission-card-number">МИССИЯ ${missionIndex + 1}</span>
        <div class="mission-card-art">${missionIcon(current)}<span class="mission-card-glow"></span></div>
        <strong class="mission-card-title">${current.title}</strong>
        <span class="mission-card-subtitle">${details.subtitle}</span>
        <p>${details.objective}</p>
        <div class="mission-meta"><span>Сложность</span><b>${'●'.repeat(details.difficulty)}<i>${'●'.repeat(3 - details.difficulty)}</i></b></div>
        <div class="mission-rewards"><span>Награда</span><b>✦ ${details.reward}</b><em>ЗАГЛУШКА</em></div>
      `;
      missionDots.replaceChildren(...trainingWeapons.map((weapon, index) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = `mission-dot${index === missionIndex ? ' is-active' : ''}`;
        dot.setAttribute('aria-label', `Миссия ${index + 1}: ${weapon.title}`);
        dot.addEventListener('click', () => { missionIndex = index; renderMissions(); });
        return dot;
      }));
      missionStart.innerHTML = `<span aria-hidden="true">▶</span> ${completed.has(current.id) ? 'Повторить миссию' : 'Начать миссию'}`;
    };
    const stepMission = direction => {
      missionIndex = (missionIndex + direction + trainingWeapons.length) % trainingWeapons.length;
      missionSlides.classList.remove('mission-slides--next', 'mission-slides--prev');
      void missionSlides.offsetWidth;
      renderMissions();
      missionSlides.classList.add(direction > 0 ? 'mission-slides--next' : 'mission-slides--prev');
      window.setTimeout(() => missionSlides.classList.remove('mission-slides--next', 'mission-slides--prev'), 520);
    };
    trainingSelect.querySelector('.mission-arrow-prev').addEventListener('click', () => stepMission(-1));
    trainingSelect.querySelector('.mission-arrow-next').addEventListener('click', () => stepMission(1));
    missionSidePrev.addEventListener('click', () => stepMission(-1));
    missionSideNext.addEventListener('click', () => stepMission(1));
    missionStart.addEventListener('click', () => launchTraining(trainingWeapons[missionIndex].id));

    const trainingSettings = document.createElement('div');
    trainingSettings.className = 'training-select training-settings';
    trainingSettings.hidden = true;
    trainingSettings.innerHTML = `
      <div class="training-select-heading">
        <span class="training-kicker">СВОБОДНЫЙ РЕЖИМ</span>
        <strong>НАСТРОЙКА ТРЕНИРОВКИ</strong>
        <span>Выберите оружие, которое будет доступно без ограничений</span>
      </div>
      <p class="training-loadout-note">Базука и гранаты доступны сразу. Остальное оружие можно открыть за миссию или купить набором.</p>
      <div class="training-grid training-loadout-grid"></div>
      <p class="training-loadout-status" aria-live="polite"></p>
      <div class="training-actions">
        <button type="button" class="training-settings-back">← <span>Назад</span></button>
        <span class="training-loadout-help">Нажмите на оружие, чтобы добавить его в тренировку или убрать из неё</span>
        <label class="training-test-unlock">
          <input type="checkbox" class="training-test-unlock-input" checked>
          <span>Открыть всё оружие</span>
        </label>
        <button type="button" class="training-start">Начать тренировку</button>
      </div>
    `;
    const trainingLoadoutGrid = trainingSettings.querySelector('.training-loadout-grid');
    const trainingLoadoutStatus = trainingSettings.querySelector('.training-loadout-status');
    const trainingTestUnlockToggle = trainingSettings.querySelector('.training-test-unlock-input');
    const trainingStartButton = trainingSettings.querySelector('.training-start');
    let selectedTrainingWeapons = new Set(['bazooka']);
    let trainingTestUnlockAll = true;
    let previousTrainingTestUnlockAll = false;

    const renderTrainingLoadout = () => {
      const profile = this.getTrainingProfile?.() || {};
      const unlocked = trainingTestUnlockAll ? new Set(arsenalIds) : unlockedTrainingWeapons(profile);
      const loadout = trainingTestUnlockAll
        ? previousTrainingTestUnlockAll ? selectedTrainingWeapons : arsenalIds
        : (profile.loadout || ['bazooka']);
      selectedTrainingWeapons = new Set(loadout.filter(id => unlocked.has(id)));
      if (selectedTrainingWeapons.size === 0) selectedTrainingWeapons.add('bazooka');
      previousTrainingTestUnlockAll = trainingTestUnlockAll;
      trainingLoadoutGrid.replaceChildren();
      for (const id of arsenalIds) {
        const card = document.createElement('article');
        const selected = selectedTrainingWeapons.has(id);
        const isUnlocked = unlocked.has(id);
        const missionId = Object.entries(TRAINING_MISSION_REWARDS).find(([, rewards]) => rewards.includes(id))?.[0];
        card.className = `training-loadout-card${selected ? ' is-selected' : ''}${isUnlocked ? '' : ' is-locked'}`;
        const button = document.createElement('button');
        const status = selected ? '✓ В наборе' : '+ Добавить';
        button.type = 'button';
        button.className = 'training-tile training-loadout-tile';
        button.dataset.weapon = id;
        button.setAttribute('aria-label', `${ARSENAL[id]}. ${isUnlocked ? status : 'Заблокировано'}`);
        button.disabled = !isUnlocked;
        const index = arsenalIds.indexOf(id);
        const [x, y, width, height] = WEAPON_ICON_REGIONS[index];
        button.innerHTML = `
          <svg class="training-weapon-icon" aria-hidden="true" viewBox="0 0 ${width} ${height}" focusable="false">
            <svg width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}" overflow="hidden">
              <image href="${import.meta.env.BASE_URL}assets/weapon-atlas.png" width="749" height="2098"></image>
            </svg>
          </svg>
          <strong>${ARSENAL[id]}</strong>
          ${isUnlocked ? `<span class="training-loadout-action-label">${status}</span>` : ''}
        `;
        if (isUnlocked) {
          button.setAttribute('aria-pressed', String(selected));
          button.addEventListener('click', () => {
            if (selectedTrainingWeapons.has(id) && selectedTrainingWeapons.size === 1) {
              trainingLoadoutStatus.textContent = 'В наборе должно остаться хотя бы одно оружие.';
              return;
            }
            if (selectedTrainingWeapons.has(id)) selectedTrainingWeapons.delete(id);
            else selectedTrainingWeapons.add(id);
            this.saveTrainingLoadout?.([...selectedTrainingWeapons]);
            trainingLoadoutStatus.textContent = '';
            renderTrainingLoadout();
          });
        } else {
          const actions = document.createElement('div');
          actions.className = 'training-unlock-actions';

          const missionButton = document.createElement('button');
          missionButton.type = 'button';
          missionButton.className = 'training-unlock-button is-mission';
          missionButton.textContent = 'Миссия';
          missionButton.setAttribute('aria-label', `Пройти миссию «${ARSENAL[missionId]}», чтобы открыть «${ARSENAL[id]}»`);
          missionButton.addEventListener('click', () => launchTraining(missionId));

          const purchaseButton = document.createElement('button');
          purchaseButton.type = 'button';
          purchaseButton.className = 'training-unlock-button is-purchase';
          purchaseButton.textContent = 'Купить';
          purchaseButton.setAttribute('aria-label', `Купить набор оружия, чтобы открыть «${ARSENAL[id]}»`);
          purchaseButton.addEventListener('click', async () => {
            trainingLoadoutStatus.textContent = 'Открываю покупку набора оружия…';
            const result = await this.purchaseTrainingWeaponPack?.();
            if (result?.success) {
              trainingLoadoutStatus.textContent = 'Набор оружия открыт!';
              renderTrainingLoadout();
            } else if (result?.unconfigured) {
              trainingLoadoutStatus.textContent = 'Покупка пока недоступна: товар ещё не настроен в магазине.';
            } else {
              trainingLoadoutStatus.textContent = 'Покупка отменена или временно недоступна.';
            }
          });

          actions.append(missionButton, purchaseButton);
          card.append(button, actions);
        }
        if (isUnlocked) card.append(button);
        trainingLoadoutGrid.append(card);
      }
      trainingStartButton.disabled = selectedTrainingWeapons.size === 0;
    };
    trainingTestUnlockToggle.addEventListener('change', () => {
      trainingTestUnlockAll = trainingTestUnlockToggle.checked;
      trainingLoadoutStatus.textContent = trainingTestUnlockAll
        ? 'Тестовый режим: всё оружие открыто.'
        : 'Тестовый режим отключён. Доступность оружия снова зависит от миссий и покупки.';
      renderTrainingLoadout();
    });
    trainingStartButton.addEventListener('click', () => launchTraining('free'));
    trainingSettings.querySelector('.training-settings-back').addEventListener('click', () => {
      trainingSettings.hidden = true;
      modeSelect.hidden = false;
      if (startSubtitle) startSubtitle.hidden = false;
    });

    const setup = document.createElement('div');
    setup.className = 'match-setup';
    setup.hidden = true;
    setup.innerHTML = `
      <div class="quick-setup-grid">
        <section class="setup-card setup-map-card">
          <h2>🗺️ Карта</h2>
          <div class="setup-map-switcher"><button type="button" class="map-arrow map-prev" aria-label="Предыдущая карта">‹</button><img class="setup-map-preview" src="./maps/sky-islands.png" alt="Предпросмотр карты"><div class="setup-map-placeholder" hidden>Карта будет<br>сгенерирована<br>перед матчем</div><button type="button" class="map-arrow map-next" aria-label="Следующая карта">›</button></div>
          <strong class="setup-map-name">Небесные острова</strong>
          <p class="setup-map-description">Классическая карта с островами и удобными позициями.</p>
          <div class="map-thumbnails" aria-label="Миниатюры карт"></div>
          <div class="setup-map-actions"><button type="button" class="setup-random-map"><span aria-hidden="true">⚄</span> Случайная карта</button><button type="button" class="setup-generate-map"><span aria-hidden="true">⤨</span> Генерация</button></div>
          <div class="map-select-row" hidden><label><input type="radio" name="mapSource" value="generate"> Генерировать</label><label><input type="radio" name="mapSource" value="custom" checked> Из файла</label><input type="file" id="map-file-input" accept="image/png, image/jpeg, image/webp"></div>
        </section>
        <section class="setup-card setup-teams-card">
          <div class="setup-card-heading"><h2>🦆 Команды</h2></div>
          <div id="team-rows"></div>
          <button type="button" class="add-team-button add-team-slot"><span aria-hidden="true">⊕</span> Добавить команду</button>
        </section>
        <section class="setup-card setup-options-card">
          <h2>⚙️ Параметры матча</h2>
          <div class="match-options">
            <input id="team-count" type="number" min="2" max="4" value="2" hidden>
            <input id="worm-count" type="number" min="1" max="4" value="3" hidden>
            <label class="match-option"><span class="option-icon" aria-hidden="true">⌛</span><span>Время на ход</span><select id="turn-time-limit" aria-label="Время на ход"><option value="0">Без лимита</option><option value="45">45 сек</option><option value="60" selected>60 сек</option><option value="90">90 сек</option></select></label>
            <label class="match-option"><span class="option-icon" aria-hidden="true">≋</span><span class="option-label">Ветер</span><select id="wind-enabled" aria-label="Ветер"><option value="yes" selected>Да</option><option value="no">Нет</option></select></label>
            <label class="match-option"><span class="option-icon" aria-hidden="true">🌊</span><span class="option-label">Подъём воды</span><select aria-label="Подъём воды"><option>Выкл</option><option>Вкл</option></select></label>
            <label class="match-option"><span class="option-icon" aria-hidden="true">♥</span><span class="option-label">Здоровье утки</span><select aria-label="Здоровье утки"><option>50</option><option selected>100</option><option>150</option></select></label>
            <label class="match-option weapon-crates-option"><span class="option-icon" aria-hidden="true">📦</span><span class="option-label">Ящики с оружием</span><span class="weapon-crate-control"><input id="weapon-crate-count" type="range" min="1" max="10" step="1" value="5" aria-label="Частота появления ящиков с оружием"><output for="weapon-crate-count">5</output></span></label>
            <label class="match-option"><span class="option-icon" aria-hidden="true">⚑</span><span class="option-label">Количество раундов</span><select aria-label="Количество раундов"><option>Без лимита</option><option>3</option><option>5</option><option>10</option></select></label>
          </div>
        </section>
      </div>
      <div class="setup-actions"><button type="button" class="setup-back">← Назад</button><svg class="setup-doodle" viewBox="0 0 180 80" aria-hidden="true"><path d="M5 35 Q35 0 40 48 T75 55 M95 36 C75 12 127 6 123 34 L150 38 Q145 70 112 65 Q85 61 95 36 M98 13 L94 2 L105 8 L114 1 L119 14 M150 18 Q166 3 174 21 L176 36 L158 28"/><circle cx="112" cy="27" r="2"/></svg></div>
    `;
    start.before(modeSelect, trainingSelect, trainingSettings, setup);

    this.teamCount = setup.querySelector('#team-count');
    this.wormCount = setup.querySelector('#worm-count');
    this.teamRows = setup.querySelector('#team-rows');
    const weaponCrateCount = setup.querySelector('#weapon-crate-count');
    const weaponCrateOutput = setup.querySelector('.weapon-crate-control output');
    weaponCrateCount.addEventListener('input', () => { weaponCrateOutput.value = weaponCrateCount.value; });
    this.customMapImage = null;
    this.uploadedMapImage = null;
    const mapCatalog = [
      { file: 'sky-islands.png', name: 'Небесные острова', description: 'Классическая карта с островами и удобными позициями.' },
      { file: 'fortress-islands.jpg', name: 'Островные крепости', description: 'Карта с крепостями и открытыми площадками.' },
      { file: 'waterfall-valley.jpg', name: 'Долина водопадов', description: 'Высоты, впадины и водопады для тактических атак.' },
      { file: 'rocky-hills.jpg', name: 'Каменистые холмы', description: 'Неровный рельеф с множеством укрытий.' },
      { file: 'green-islands.jpg', name: 'Зелёные острова', description: 'Островная карта с естественными перепадами высоты.' },
      { file: 'desert-canyon.jpg', name: 'Пустынный каньон', description: 'Каньоны и открытые склоны для дальних выстрелов.' }
    ];
    this.mapCatalog = mapCatalog;
    this.mapImageReady = [];
    this.mapImageCache = this.mapCatalog.map(({ file }) => {
      const image = new Image();
      this.mapImageReady.push(new Promise(resolve => {
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
      }));
      image.src = `${import.meta.env.BASE_URL}maps/${encodeURIComponent(file)}`;
      return image;
    });
    this.selectedMapIndex = 0;
    this.selectedMapImage = this.mapImageCache[0];

    const mapThumbnails = setup.querySelector('.map-thumbnails');
    this.mapCatalog.forEach((map, index) => {
      const thumbnail = document.createElement('button');
      thumbnail.type = 'button';
      thumbnail.className = `map-thumbnail${index === 0 ? ' is-selected' : ''}`;
      thumbnail.title = map.name;
      thumbnail.innerHTML = `<img src="${this.mapImageCache[index].src}" alt="${map.name}">`;
      thumbnail.addEventListener('click', () => selectMap(index));
      mapThumbnails.append(thumbnail);
    });

    const fileInput = setup.querySelector('#map-file-input');
    const radioInputs = setup.querySelectorAll('input[name="mapSource"]');

    radioInputs.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
          fileInput.style.display = 'inline-block';
          if (!this.uploadedMapImage) fileInput.click();
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
          this.uploadedMapImage = img;
          this.customMapImage = img;
        };
        img.src = evt.target.result;
      };
      reader.readAsDataURL(file);
    });

    const mapPreview = setup.querySelector('.setup-map-preview');
    const mapPlaceholder = setup.querySelector('.setup-map-placeholder');
    const mapName = setup.querySelector('.setup-map-name');
    const mapDescription = setup.querySelector('.setup-map-description');
    const selectMap = index => {
      this.selectedMapIndex = (index + this.mapCatalog.length) % this.mapCatalog.length;
      const map = this.mapCatalog[this.selectedMapIndex];
      this.uploadedMapImage = null;
      this.selectedMapImage = this.mapImageCache[this.selectedMapIndex];
      mapPreview.src = this.selectedMapImage.src;
      mapPreview.hidden = false;
      mapPlaceholder.hidden = true;
      mapName.textContent = map.name;
      mapDescription.textContent = map.description;
      setup.querySelector('input[name="mapSource"][value="custom"]').checked = true;
      mapThumbnails.querySelectorAll('.map-thumbnail').forEach((thumbnail, thumbnailIndex) => thumbnail.classList.toggle('is-selected', thumbnailIndex === this.selectedMapIndex));
    };
    setup.querySelector('.map-prev').addEventListener('click', () => selectMap(this.selectedMapIndex - 1));
    setup.querySelector('.map-next').addEventListener('click', () => selectMap(this.selectedMapIndex + 1));
    setup.querySelector('.setup-random-map').addEventListener('click', () => selectMap(Math.floor(Math.random() * this.mapCatalog.length)));
    setup.querySelector('.setup-generate-map').addEventListener('click', () => {
      this.uploadedMapImage = null;
      this.selectedMapImage = null;
      mapPreview.hidden = true;
      mapPlaceholder.hidden = false;
      setup.querySelector('input[name="mapSource"][value="generate"]').checked = true;
      mapName.textContent = 'Случайная генерация';
      mapDescription.textContent = 'Новая карта будет создана перед матчем.';
    });

    for (let i = 0; i < 6; i++) {
      const row = document.createElement('div');
      row.className = 'team-row';
      row.style.setProperty('--team-color', `#${COLORS[i].toString(16).padStart(6, '0')}`);
      row.dataset.worms = '3';
      row.innerHTML = `<div class="team-identity"><svg class="team-duck-icon" viewBox="0 0 64 68" aria-hidden="true"><ellipse cx="31" cy="62" rx="22" ry="4" fill="#000" opacity=".3"/><path d="M18 36 C6 43 13 59 31 59 C49 59 56 45 52 38 L44 42 L37 32Z" fill="var(--team-color)" stroke="#162b27" stroke-width="2"/><circle cx="30" cy="27" r="18" fill="var(--team-color)" stroke="#162b27" stroke-width="2"/><path d="M34 29 Q62 26 51 38 Q42 43 33 36" fill="#ffbb28" stroke="#a46116" stroke-width="2"/><ellipse cx="34" cy="25" rx="3" ry="5" fill="#101d25"/><circle cx="35" cy="23" r="1" fill="white"/><path d="M11 22 Q8 3 29 3 Q48 3 48 20 L53 23 Q30 31 9 26Z" fill="#425c3c" stroke="#152c24" stroke-width="2"/><path d="M17 16 Q19 6 29 7" fill="none" stroke="#9fae7a" stroke-width="3" stroke-linecap="round"/><path d="M18 44 Q30 35 31 48 Q28 56 19 51" fill="#fff" opacity=".2"/></svg><span class="team-color-swatch" aria-hidden="true"></span><input aria-label="Имя команды ${i + 1}" maxlength="10" value="Команда ${i + 1}"></div><div class="team-type-control"><div class="team-type-picker" role="radiogroup" aria-label="Управление командой ${i + 1}"><button type="button" class="team-type-choice is-selected" data-value="human" aria-label="Человек" aria-pressed="true"><span aria-hidden="true">👤</span></button><button type="button" class="team-type-choice" data-value="bot" aria-label="Бот" aria-pressed="false"><span aria-hidden="true">🤖</span></button></div><select class="team-type" aria-label="Управление командой ${i + 1}"><option value="human">👤 Человек</option><option value="bot">🤖 Бот</option></select><div class="team-difficulty" hidden><div class="difficulty-picker" role="radiogroup" aria-label="Уровень бота"><button type="button" class="difficulty-choice" data-value="easy" aria-label="Лёгкий уровень" aria-pressed="false"><svg viewBox="0 0 80 64" aria-hidden="true"><path d="M14 32 40 15 66 32 40 49Z"/></svg></button><button type="button" class="difficulty-choice is-selected" data-value="medium" aria-label="Средний уровень" aria-pressed="true"><svg viewBox="0 0 80 64" aria-hidden="true"><path d="M14 40 40 23 66 40 40 57Z M14 17 40 0 66 17 40 34Z"/></svg></button><button type="button" class="difficulty-choice" data-value="hard" aria-label="Сложный уровень" aria-pressed="false"><svg viewBox="0 0 80 64" aria-hidden="true"><path d="M14 48 40 31 66 48 40 65Z M14 25 40 8 66 25 40 42Z M14 2 40 -15 66 2 40 19Z"/></svg></button></div><select class="team-difficulty-select" aria-label="Уровень бота"><option value="easy">Легкий</option><option value="medium" selected>Средний</option><option value="hard">Тяжелый</option></select></div></div><div class="worm-count-control"><span>Утки:</span><div><button type="button" class="worm-step-button" data-step="-1" aria-label="Уменьшить количество уток">‹</button><strong class="worm-count-value">3</strong><button type="button" class="worm-step-button" data-step="1" aria-label="Увеличить количество уток">›</button></div></div><button type="button" class="remove-team-button" aria-label="Удалить команду">×</button>`;
      const teamType = row.querySelector('.team-type');
      const difficulty = row.querySelector('.team-difficulty');
      const difficultySelect = row.querySelector('.team-difficulty-select');
      const difficultyPicker = row.querySelector('.difficulty-picker');
      const difficultyChoices = [...difficultyPicker.querySelectorAll('.difficulty-choice')];
      difficultySelect.hidden = true;
      const typeControl = row.querySelector('.team-type-control');
      const typePicker = row.querySelector('.team-type-picker');
      const typeChoices = typePicker.querySelectorAll('.team-type-choice');
      typeChoices[0].innerHTML = '<span aria-hidden="true">👤</span><span>Игрок</span>';
      typeChoices[1].innerHTML = '<span aria-hidden="true">🤖</span><span>Бот</span>';
      difficulty.prepend(typeChoices[1]);
      const typeSetting = document.createElement('div');
      typeSetting.className = 'team-type-setting';
      typeSetting.append(typePicker, difficulty);
      typeControl.insertBefore(typeSetting, teamType);
      difficultyChoices.forEach(choice => choice.addEventListener('click', () => {
        difficultySelect.value = choice.dataset.value;
        difficultyChoices.forEach(option => {
          const selected = option === choice;
          option.classList.toggle('is-selected', selected);
          option.setAttribute('aria-pressed', String(selected));
        });
      }));
      const syncTeamTypeChoice = () => {
        row.querySelectorAll('.team-type-choice').forEach(choice => {
          const selected = choice.dataset.value === teamType.value;
          choice.classList.toggle('is-selected', selected);
          choice.setAttribute('aria-pressed', String(selected));
        });
        difficulty.hidden = false;
        difficultyPicker.hidden = teamType.value !== 'bot';
      };
      row.querySelectorAll('.team-type-choice').forEach(choice => choice.addEventListener('click', () => {
        teamType.value = choice.dataset.value;
        syncTeamTypeChoice();
      }));
      teamType.addEventListener('change', syncTeamTypeChoice);
      if (i === 1) {
        teamType.value = 'bot';
      }
      syncTeamTypeChoice();
      row.querySelector('.remove-team-button').hidden = i < 2;
      row.hidden = i >= 2;
      this.teamRows.append(row);
    }
    const syncTeamRows = () => {
      setup.querySelectorAll('.add-team-button').forEach(button => { button.disabled = Number(this.teamCount.value) >= 4; });
      for (let i = 0; i < 6; i++) {
        const row = this.teamRows.children[i];
        row.hidden = i >= Math.max(2, Math.min(4, Number(this.teamCount.value) || 2));
        row.querySelector('.remove-team-button').hidden = i < 2;
      }
    };
    this.teamCount.addEventListener('input', syncTeamRows);
    setup.querySelectorAll('.add-team-button').forEach(button => button.addEventListener('click', () => {
      this.teamCount.value = String(Math.min(4, Number(this.teamCount.value || 2) + 1));
      syncTeamRows();
    }));
    this.teamRows.addEventListener('click', event => {
      const wormButton = event.target.closest('.worm-step-button');
      if (wormButton) {
        const row = wormButton.closest('.team-row');
        const worms = Math.max(1, Math.min(5, Number(row.dataset.worms || 1) + Number(wormButton.dataset.step)));
        row.dataset.worms = String(worms);
        row.querySelector('.worm-count-value').textContent = String(worms);
        return;
      }
      const button = event.target.closest('.remove-team-button');
      if (!button || Number(this.teamCount.value) <= 2) return;
      this.teamCount.value = String(Number(this.teamCount.value) - 1);
      syncTeamRows();
    });
    setup.querySelector('.setup-random-map').addEventListener('click', () => {
      setup.querySelector('input[name="mapSource"][value="custom"]').checked = true;
      fileInput.style.display = 'none';
    });

    const launchTraining = weapon => {
      this.gameMode = 'training';
      this.trainingWeapon = weapon;
      if (weapon === 'free') {
        this.trainingTestUnlockAll = trainingTestUnlockAll;
        this.trainingLoadoutSelection = [...selectedTrainingWeapons];
        this.saveTrainingLoadout?.(this.trainingLoadoutSelection);
        trainingSettings.hidden = true;
      } else {
        this.trainingTestUnlockAll = false;
      }
      start.click();
    };
    for (const button of modeSelect.querySelectorAll('button')) {
      button.addEventListener('click', () => {
        if (button.dataset.mode === 'training') {
          modeSelect.hidden = true;
          trainingSettings.hidden = false;
          trainingLoadoutStatus.textContent = '';
          renderTrainingLoadout();
          if (startSubtitle) startSubtitle.hidden = true;
        } else if (button.dataset.mode === 'missions') {
          modeSelect.hidden = true;
          trainingSelect.hidden = false;
          renderMissions();
          if (startSubtitle) startSubtitle.hidden = true;
        } else if (button.dataset.mode === 'settings') {
          const controls = document.querySelector('.global-controls');
          controls.hidden = !controls.hidden;
        } else {
          this.gameMode = 'quick';
          this.trainingWeapon = null;
          if (startSubtitle) startSubtitle.hidden = true;
          modeSelect.hidden = true;
          setup.hidden = false;
          setup.querySelector('.setup-actions').append(start);
          start.hidden = false;
          start.textContent = 'Начать матч';
        }
      });
    }
    trainingSelect.querySelector('.training-back').addEventListener('click', () => {
      trainingSelect.hidden = true;
      if (startSubtitle) startSubtitle.hidden = false;
      modeSelect.hidden = false;
    });
    setup.querySelector('.setup-back').addEventListener('click', () => {
      setup.hidden = true;
      start.hidden = true;
      if (startSubtitle) startSubtitle.hidden = false;
      modeSelect.hidden = false;
    });

    this.labels = document.createElement('div');
    this.labels.className = 'worm-labels';
    this.labels.hidden = true;

    this.turnAnnouncement = document.createElement('div');
    this.turnAnnouncement.className = 'turn-announcement';
    this.turnAnnouncement.setAttribute('aria-live', 'polite');
    this.turnAnnouncement.innerHTML = '<div class="turn-banner"><span class="turn-banner-wing turn-banner-wing--left" aria-hidden="true"></span><span class="turn-banner-wing turn-banner-wing--right" aria-hidden="true"></span><div class="turn-banner-panel"><span class="turn-banner-emblem" aria-hidden="true">⚔</span><strong></strong><span></span></div></div>';

    this.matchHud = document.createElement('section');
    this.matchHud.className = 'match-hud';
    this.matchHud.hidden = true;
    this.matchHudCollapsed = true;
    this.matchHud.innerHTML = '<div class="match-status" aria-live="polite"></div><div class="weapon-row"><button type="button" class="arsenal-toggle">Арсенал · ПКМ</button><button class="restart-match">Новый матч</button></div><label class="lighting-test-control"><span>Свет</span><select aria-label="Режим освещения карты"><option value="soft">Мягкий</option><option value="flashlight">Фонарик</option><option value="contour">Контуры</option><option value="warm">Тёплый</option><option value="neon">Неон</option></select></label><progress class="charge" max="1" value="0"></progress><p class="controls-help">ПКМ — арсенал · F1–F12 — оружие · ←/→ или A/D — ходить · ↑/↓ или W/S — угол оружия · Пробел — прыжок, дважды — двойной прыжок · мышь — камера · Enter — огонь · 1–5 — запал</p>';
    this.matchHudToggle = document.createElement('button');
    this.matchHudToggle.type = 'button';
    this.matchHudToggle.className = 'match-hud-toggle';
    this.matchHudToggle.textContent = 'Панель';
    this.matchHudToggle.setAttribute('aria-expanded', 'false');
    this.matchHudToggle.hidden = true;
    this.matchHudToggle.addEventListener('click', () => {
      this.matchHudCollapsed = !this.matchHudCollapsed;
      this.matchHud.hidden = this.matchHudCollapsed;
      this.matchHudToggle.textContent = this.matchHudCollapsed ? 'Панель' : 'Скрыть';
      this.matchHudToggle.setAttribute('aria-expanded', String(!this.matchHudCollapsed));
    });
    this.weaponPanel = new WeaponPanel(this, this.matchHud.querySelector('.arsenal-toggle'));

    const hint = document.createElement('p');
    hint.className = 'weapon-hint';
    this.matchHud.append(hint);
    this.weaponHint = hint;

    this.teamHealthHud = document.createElement('section');
    this.teamHealthHud.className = 'team-health-hud';
    this.teamHealthHud.hidden = true;
    this.teamHealthCards = [];

    this.windHud = document.createElement('aside');
    this.windHud.className = 'wind-hud';
    this.windHud.hidden = true;
    this.windHud.setAttribute('aria-label', 'Ветер');
    this.windHud.innerHTML = '<div class="wind-hud-heading"><span class="wind-hud-icon" aria-hidden="true">≋</span><strong>ВЕТЕР</strong><b class="wind-hud-value">ШТИЛЬ</b></div><div class="wind-track" aria-hidden="true"><span class="wind-fill"></span><i class="wind-center"></i></div><div class="wind-hud-scale"><span>←</span><small>штиль</small><span>→</span></div>';
    this.windValue = this.windHud.querySelector('.wind-hud-value');
    this.windFill = this.windHud.querySelector('.wind-fill');

    this.backgroundHudCollapsed = true;
    this.backgroundHudToggle = document.createElement('button');
    this.backgroundHudToggle.type = 'button';
    this.backgroundHudToggle.className = 'background-hud-toggle';
    this.backgroundHudToggle.textContent = 'Фон';
    this.backgroundHudToggle.hidden = true;
    this.backgroundHudToggle.setAttribute('aria-expanded', 'false');
    this.backgroundHudToggle.addEventListener('click', () => {
      this.backgroundHudCollapsed = !this.backgroundHudCollapsed;
      this.backgroundHud.hidden = this.backgroundHudCollapsed;
      this.backgroundHudToggle.setAttribute('aria-expanded', String(!this.backgroundHudCollapsed));
    });
    this.backgroundHud = document.createElement('aside');
    this.backgroundHud.className = 'background-hud';
    this.backgroundHud.hidden = true;
    this.backgroundHud.setAttribute('aria-label', 'Настройки фона');
    this.backgroundHud.innerHTML = '<div class="background-hud-heading"><strong>ФОН И ЗВЁЗДЫ</strong><button type="button" class="background-hud-close" aria-label="Закрыть настройки фона">×</button></div><label class="background-hud-check"><input type="checkbox" data-background-uniform="uEnabled" checked><span>Фон</span></label><label class="background-hud-range"><span>Яркость фона <output>40%</output></span><input type="range" data-background-uniform="uBrightness" min=".4" max="1.8" step=".05" value=".4"></label><label class="background-hud-range"><span>Облака <output>165%</output></span><input type="range" data-background-uniform="uCloudStrength" min="0" max="1.8" step=".05" value="1.65"></label><label class="background-hud-check"><input type="checkbox" data-background-uniform="uStarsEnabled" checked><span>Звёзды</span></label><label class="background-hud-range"><span>Размер звёзд <output>230%</output></span><input type="range" data-background-uniform="uStarSize" min=".5" max="3" step=".1" value="2.3"></label><label class="background-hud-range"><span>Плотность звёзд <output>250%</output></span><input type="range" data-background-uniform="uStarDensity" min=".3" max="2.5" step=".1" value="2.5"></label><label class="background-hud-range"><span>Яркость звёзд <output>250%</output></span><input type="range" data-background-uniform="uStarBrightness" min=".2" max="2.5" step=".1" value="2.5"></label><label class="background-hud-check"><input type="checkbox" data-moon-property="visible" checked><span>Луна</span></label><label class="background-hud-range"><span>Размер луны <output>70%</output></span><input type="range" data-moon-property="scale" min=".5" max="1.5" step=".05" value=".7"></label><label class="background-hud-range"><span>Яркость луны <output>65%</output></span><input type="range" data-moon-property="opacity" min=".3" max="1.4" step=".05" value=".65"></label><label class="background-hud-check"><input type="checkbox" data-moon-property="glowVisible" checked><span>Ореол луны</span></label><label class="background-hud-range"><span>Размер ореола <output>170%</output></span><input type="range" data-moon-property="glowScale" min=".4" max="1.8" step=".05" value="1.7"></label><label class="background-hud-range"><span>Яркость ореола <output>115%</output></span><input type="range" data-moon-property="glowOpacity" min=".2" max="2" step=".05" value="1.15"></label>';
    this.backgroundHud.querySelector('.background-hud-close').addEventListener('click', () => {
      this.backgroundHudCollapsed = true;
      this.backgroundHud.hidden = true;
      this.backgroundHudToggle.setAttribute('aria-expanded', 'false');
    });
    this.backgroundHud.querySelectorAll('[data-background-uniform]').forEach(control => {
      const uniformName = control.dataset.backgroundUniform;
      const uniform = this.backgroundMaterial.uniforms[uniformName];
      const output = control.closest('label')?.querySelector('output');
      const updateBackgroundUniform = () => {
        uniform.value = control.type === 'checkbox' ? (control.checked ? 1 : 0) : Number(control.value);
        if (output && control.type !== 'checkbox') output.textContent = `${Math.round(Number(control.value) * 100)}%`;
      };
      control.addEventListener('input', updateBackgroundUniform);
      control.addEventListener('change', updateBackgroundUniform);
    });
    this.backgroundHud.querySelectorAll('[data-moon-property]').forEach(control => {
      const property = control.dataset.moonProperty;
      const output = control.closest('label')?.querySelector('output');
      const updateMoon = () => {
        const value = control.type === 'checkbox' ? control.checked : Number(control.value);
        if (property === 'visible') this.moon.visible = value;
        if (property === 'scale') {
          this.moonScaleFactor = value;
          this.updateMoonScale();
        }
        if (property === 'opacity') this.moon.material.opacity = .74 * value;
        if (property === 'glowVisible') this.moonGlow.visible = value;
        if (property === 'glowScale') {
          this.moonGlowScaleFactor = value;
          this.updateMoonScale();
        }
        if (property === 'glowOpacity') this.moonGlow.material.opacity = .42 * value;
        if (output && control.type !== 'checkbox') output.textContent = `${Math.round(value * 100)}%`;
      };
      control.addEventListener('input', updateMoon);
      control.addEventListener('change', updateMoon);
    });

    document.querySelector('#game-root').append(this.labels, this.turnAnnouncement, this.matchHud, this.matchHudToggle, this.teamHealthHud, this.windHud, this.backgroundHudToggle, this.backgroundHud);
    this.weaponButtons = this.weaponPanel.buttons;
    this.status = this.matchHud.querySelector('.match-status');
    this.chargeBar = this.matchHud.querySelector('.charge');
    this.lightingModeSelect = this.matchHud.querySelector('.lighting-test-control select');
    this.lightingModeSelect.addEventListener('change', () => {
      this.lightingMode = this.lightingModeSelect.value;
      this.terrain?.setLightingMode(this.lightingMode);
    });

    this.matchHud.querySelector('.restart-match').addEventListener('click', () => {
      this.pause();
      this.inMenu = true;
      this.matchHud.hidden = true;
      this.matchHudToggle.hidden = true;
      this.matchHudCollapsed = true;
      this.backgroundHud.hidden = true;
      this.backgroundHudToggle.hidden = true;
      this.backgroundHudCollapsed = true;
      this.teamHealthHud.hidden = true;
      this.windHud.hidden = true;
      this.labels.hidden = true;
      trainingSelect.hidden = true;
      setup.hidden = true;
      start.hidden = true;
      modeSelect.hidden = false;
      if (startSubtitle) startSubtitle.hidden = false;
      document.querySelector('#start-screen').hidden = false;
      document.querySelector('#start-screen').classList.add('overlay--visible');
    });

    // При клике на "Старт" обновляем мир под выбранный режим карты
    start.addEventListener('click', async () => {
      const mapSource = document.querySelector('input[name="mapSource"]:checked')?.value;
      if (this.gameMode !== 'training' && mapSource === 'custom' && this.selectedMapImage) {
        await this.mapImageReady[this.selectedMapIndex];
      }
      this.configure();
      this.start();
    });
  }

  updateHUD() {
    const t = this.turn;
    this.weaponPanel.refresh();
    const botThinking = this.teams[t.team]?.bot && t.state === TURN.WAITING_INPUT && this.bot.elapsed < 2;
    const turnState = botThinking ? 'ДУМАЕТ…' : t.state;
    const trainingProgress = this.targetTrainingActive ? `Мишень ${Math.min(this.targetTrainingStage + 1, 3)}/3 · ` : '';
    const turnTime = Number.isFinite(t.remaining) ? `${Math.ceil(t.remaining)} с` : '∞';
    const text = this.winner || `${trainingProgress}${this.teams[t.team].name} · ${turnTime} · ${turnState} · Запал ${this.weapons.fuse} с · ${t.weapon === 'shotgun' ? `Выстрелов: ${t.shots}` : ARSENAL[t.weapon] || t.weapon}`;
    const hints = { girder: 'Прицел — угол; ЛКМ — поставить в свободном месте', girderPack: 'ЛКМ — поставить балку; за ход можно поставить пять', mbBomb: 'ЛКМ — сбросить бомбу сверху', holy: 'Удерживайте пробел — сила броска; взрыв после 3 секунд и остановки', moleBomb: 'Пробел — выпустить, затем начать бурение, затем взорвать', skunk: 'Пробел — выпустить; ещё раз — выпустить газ', salvation: 'Пробел — выпустить; ещё раз — взорвать', superBanana: 'Пробел — бросить; затем разделить; затем взорвать осколки', homing: 'ЛКМ — отметить цель; затем удерживайте пробел для пуска', pigeon: 'ЛКМ — выбрать цель; пробел — выпустить голубя', magicBullet: 'ЛКМ — выбрать цель; пробел — выпустить волшебную пулю', airstrike: 'ЛКМ на карте — вызвать авиаудар', napalm: 'ЛКМ на карте — вызвать огненный удар', mailstrike: 'ЛКМ на карте — вызвать почтовый удар', minestrike: 'ЛКМ на карте — сбросить минное поле', moleSquadron: 'ЛКМ на карте — вызвать эскадрон кротов', donkey: 'ЛКМ на карте — сбросить бетонного осла', indianTest: 'Пробел — поднять воду и заразить незамороженных бойцов', frenchSheep: 'ЛКМ на карте — выбрать точку удара', madCows: '1–5 — размер стада; пробел — выпустить в выбранном направлении', carpet: 'ЛКМ на карте — выбрать зону бомбардировки', armageddon: 'Пробел — метеоритный дождь по всей карте', teleport: 'ЛКМ в свободном месте — телепортироваться', ninjaRope: 'Прицел + пробел — зацепиться; A/D — качаться; W/S — длина; пробел — отпустить', sheep: 'Пробел — выпустить овечку; ещё раз — взорвать', superSheep: 'Пробел — выпустить, затем взлететь, затем взорвать; A/D или ←/→ — поворот', sheepLauncher: 'Пробел — выпустить овечку; ещё раз — взорвать', drill: 'Пробел — бурить вниз', pneumaticDrill: 'Пробел — бурить вниз', blowTorch: 'Пробел — прокладывать горизонтальный тоннель', uppercut: 'Пробел — ударить противника перед собой', mine: 'Пробел — установить мину; затем отойти', dynamite: 'Пробел — установить динамит; затем отойти', jetPack: 'Пробел — включить/снять; W/↑ — тяга вверх, A/D — в стороны; Enter — сбросить оружие', bungee: 'Стрелки — спускаться на банджи', parachute: 'Стрелки — управлять парашютом', fastWalk: 'A/D — двигаться с удвоенной скоростью' };
    hints.homing = 'ЛКМ — выбрать цель; Enter — выпустить ракету';
    const hint = this.weapons.message || hints[t.weapon] || (this.weapons.needsCharge(t.weapon) ? 'Удерживайте Enter для силы выстрела' : 'Enter — применить оружие');
    if (this.weaponHint.textContent !== hint) this.weaponHint.textContent = hint;
    if (this.status.textContent !== text) this.status.textContent = text;
    this.chargeBar.value = t.charge;
    const windStrength = THREE.MathUtils.clamp(Math.abs(this.wind) / WIND_MAX, 0, 1);
    this.windValue.textContent = windStrength < .01 ? 'ШТИЛЬ' : `${this.wind < 0 ? '←' : '→'} ${Math.abs(this.wind).toFixed(1)}`;
    this.windFill.classList.toggle('wind-fill--left', this.wind < 0 && windStrength >= .01);
    this.windFill.classList.toggle('wind-fill--right', this.wind >= 0 && windStrength >= .01);
    this.windFill.style.width = `${windStrength * 50}%`;

    this.teams.forEach((team, index) => {
      const card = this.teamHealthCards[index];
      if (!card) return;
      const health = team.worms.reduce((sum, worm) => sum + worm.hp, 0);
      const maximum = Math.max(1, team.worms.length * 100);
      const active = index === t.team;
      const eliminated = health === 0 || team.surrendered;
      if (card.renderedActive !== active) {
        card.renderedActive = active;
        card.classList.toggle('active', active);
      }
      if (card.renderedEliminated !== eliminated) {
        card.renderedEliminated = eliminated;
        card.classList.toggle('eliminated', eliminated);
      }
      if (card.renderedHealth !== health) {
        card.renderedHealth = health;
        card.valueElement.textContent = String(health);
        card.trackElement.style.width = `${health / maximum * 100}%`;
      }
    });

    for (const button of this.weaponButtons) {
      button.classList.toggle('selected', button.dataset.weapon === t.weapon);
      button.disabled = !this.humanInput() || t.state !== TURN.WAITING_INPUT || !!t.lockedWeapon;
    }

    for (const w of this.worms) if (w.alive) {
      const isActive = (w === this.active);
      w.label.classList.toggle('active', isActive);

      // Скрываем плашку активного игрока, если он уже сдвинулся или целится
      const turnAllowsLabelHide = this.turn.state === TURN.WAITING_INPUT || this.turn.state === TURN.CHARGING_SHOT;
      const showingJetpackFuel = this.weapons.movementMode?.mode === 'jetPack' && this.weapons.movementMode.owner === w;
      if (isActive && this.activeMoved && turnAllowsLabelHide && !showingJetpackFuel) {
        w.label.style.display = 'none';
      } else {
        w.label.style.display = 'flex';
      }
    }
  }

  updateWormLabelPositions() {
    for (const w of this.worms) if (w.alive && !w.label.hidden) {
      this.vector.copy(w.mesh.position);
      this.vector.y += 1.4;
      this.vector.project(this.camera);
      const x = (this.vector.x * .5 + .5) * this.width;
      const y = (-this.vector.y * .5 + .5) * this.height;
      w.label.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) translate(-50%,-100%)`;
    }
    for (const p of this.weapons.pool) {
      if (!p.fuseLabel) continue;
      const running = p.active && (p.type === 'sheep' ? p.runFuseStarted : p.type === 'sheepLauncher' ? p.stage === 'running' : p.type === 'superSheep' ? p.stage === 'flying' : p.type === 'moleBomb');
      p.fuseLabel.hidden = !running;
      if (!running) continue;
      p.fuseValue.textContent = String(Math.max(0, Math.ceil(p.remaining)));
      this.vector.set(p.x, p.y + (p.type === 'superSheep' ? 1 : .8), 0);
      this.vector.project(this.camera);
      const x = (this.vector.x * .5 + .5) * this.width;
      const y = (-this.vector.y * .5 + .5) * this.height;
      p.fuseLabel.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) translate(-50%,-100%)`;
    }
    for (const w of this.worms) if (w.state === 'drowning' && w.drowningDamagePopup) {
      const popupRise = Math.min(w.drowningTime * .8, 1.4);
      this.vector.set(w.drowningStartX, w.drowningSurfaceY + .45 + popupRise, 0);
      this.vector.project(this.camera);
      const x = (this.vector.x * .5 + .5) * this.width;
      const y = (-this.vector.y * .5 + .5) * this.height;
      w.drowningDamagePopup.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) translate(-50%,-100%)`;
    }
  }
}
