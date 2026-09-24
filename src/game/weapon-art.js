import * as THREE from 'three';
import { WEAPON_ICON_REGIONS } from './weapon-icon-regions.js';

const THOUGHT = new Set(['airstrike', 'napalm', 'mailstrike', 'minestrike', 'moleSquadron', 'frenchSheep', 'carpet', 'mbBomb', 'donkey', 'indianTest', 'armageddon', 'earthquake', 'scales', 'skipGo', 'surrender', 'selectWorm', 'freeze', 'lowGravity', 'fastWalk', 'laserSight', 'invisibility', 'teleport', 'girder', 'girderPack', 'jetPack', 'bungee', 'parachute', 'kamikaze', 'suicideBomber', 'firePunch']);
const AIM_ART_ANGLES = Object.freeze({
  bazooka: 10,
  homing: 27,
  mortar: 43,
  sheepLauncher: 9,
  shotgun: 17,
  handgun: 2,
  uzi: 5,
  minigun: 8,
  longbow: 27,
  prod: 20,
  flamethrower: 3,
  magicBullet: 45
});
const AIM_ANGLE_STORAGE_KEY = 'worms.weaponAimArtAngles.v1';

function readAimAngleOverrides() {
  try {
    const value = JSON.parse(localStorage.getItem(AIM_ANGLE_STORAGE_KEY) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, angle]) => Number.isFinite(angle)).map(([type, angle]) => [type, THREE.MathUtils.clamp(angle, -180, 180)]));
  } catch { return {}; }
}
const ALIASES = { bomb: 'homing', madCow: 'madCows', fragment: 'cluster' };
const WALKERS = new Set(['sheep', 'superSheep', 'sheepLauncher', 'moleBomb', 'madCow', 'oldWoman', 'salvation', 'skunk', 'donkey', 'mbBomb']);
// Один визуальный снаряд используется всеми ракетными боеприпасами.
const ROCKET_PROJECTILES = new Set(['bazooka', 'homing', 'mortar', 'napalm']);
const litMaterial = (options = {}) => new THREE.MeshPhongMaterial({
  specular: 0x72786a,
  shininess: 34,
  side: THREE.DoubleSide,
  ...options
});

export class WeaponArt {
  constructor(ids) { this.ids = ids; this.textures = new Map(); this.equipmentTextures = new Map(); this.flameTexture = null; this.arrowSpriteTexture = null; this.dragonBallSpriteTexture = null; this.superSheepFlightTexture = null; this.detachedSmoke = []; this.aimAngleOverrides = readAimAngleOverrides(); }
  async load() {
    const image = new Image();
    image.src = `${import.meta.env.BASE_URL}assets/weapon-atlas.png`;
    await image.decode();
    this.ids.forEach((id, index) => {
      const [x, y, width, height] = WEAPON_ICON_REGIONS[index];
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, x, y, width, height, 0, 0, width, height);
      // Only clear black background connected to the crop border; keep dark details.
      const pixels = ctx.getImageData(0, 0, width, height), data = pixels.data;
      const seen = new Uint8Array(width * height), queue = [];
      const add = (i) => {
        if (seen[i]) return;
        seen[i] = 1;
        const p = i * 4;
        const darkBackground = Math.max(data[p], data[p + 1], data[p + 2]) < 24;
        const lightBackground = Math.min(data[p], data[p + 1], data[p + 2]) > 245;
        if (data[p + 3] < 16 || darkBackground || lightBackground) queue.push(i);
      };
      for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
      for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1); }
      for (let n = 0; n < queue.length; n++) {
        const i = queue[n]; data[i * 4 + 3] = 0;
        if (i % width) add(i - 1);
        if (i % width < width - 1) add(i + 1);
        if (i >= width) add(i - width);
        if (i < width * (height - 1)) add(i + width);
      }
      ctx.putImageData(pixels, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(id, texture);
    });

    const flyingSheepImage = new Image();
    flyingSheepImage.src = `${import.meta.env.BASE_URL}assets/super-sheep-flight.png`;
    await flyingSheepImage.decode();
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = flyingSheepImage.width; cropCanvas.height = flyingSheepImage.height;
    const cropContext = cropCanvas.getContext('2d', { willReadFrequently: true });
    cropContext.drawImage(flyingSheepImage, 0, 0);
    const pixels = cropContext.getImageData(0, 0, cropCanvas.width, cropCanvas.height).data;
    let minX = cropCanvas.width, minY = cropCanvas.height, maxX = -1, maxY = -1;
    for (let y = 0; y < cropCanvas.height; y++) for (let x = 0; x < cropCanvas.width; x++) {
      if (pixels[(y * cropCanvas.width + x) * 4 + 3] < 8) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    const spriteCanvas = document.createElement('canvas');
    spriteCanvas.width = maxX - minX + 1; spriteCanvas.height = maxY - minY + 1;
    spriteCanvas.getContext('2d').drawImage(flyingSheepImage, minX, minY, spriteCanvas.width, spriteCanvas.height, 0, 0, spriteCanvas.width, spriteCanvas.height);
    this.superSheepFlightTexture = new THREE.CanvasTexture(spriteCanvas);
    this.superSheepFlightTexture.colorSpace = THREE.SRGBColorSpace;

    // Дополнительные изображения экипировки берём из отдельного атласа.
    const equipmentImage = new Image();
    equipmentImage.src = `${import.meta.env.BASE_URL}assets/weapon-atlas2.png`;
    await equipmentImage.decode();
    const equipmentId = 'jetPack';
    const equipmentIndex = this.ids.indexOf(equipmentId);
    if (equipmentIndex >= 0) {
      const [x, y, width, height] = WEAPON_ICON_REGIONS[equipmentIndex];
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(equipmentImage, x, y, width, height, 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height), data = pixels.data;
      const seen = new Uint8Array(width * height), queue = [];
      const add = (i) => {
        if (seen[i]) return;
        seen[i] = 1;
        const p = i * 4;
        const darkBackground = Math.max(data[p], data[p + 1], data[p + 2]) < 24;
        const lightBackground = Math.min(data[p], data[p + 1], data[p + 2]) > 245;
        if (data[p + 3] < 16 || darkBackground || lightBackground) queue.push(i);
      };
      for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
      for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1); }
      for (let n = 0; n < queue.length; n++) {
        const i = queue[n]; data[i * 4 + 3] = 0;
        if (i % width) add(i - 1);
        if (i % width < width - 1) add(i + 1);
        if (i >= width) add(i - width);
        if (i < width * (height - 1)) add(i + width);
      }
      ctx.putImageData(pixels, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.equipmentTextures.set(equipmentId, texture);
    }
  }
  thought(type) { return THOUGHT.has(type); }
  defaultAimArtAngle(type) { return AIM_ART_ANGLES[type] || 0; }
  aimArtAngle(type) { return (this.aimAngleOverrides[type] ?? this.defaultAimArtAngle(type)) * Math.PI / 180; }
  setAimArtAngle(type, angle) {
    const value = THREE.MathUtils.clamp(Number(angle) || 0, -180, 180);
    if (Math.abs(value - this.defaultAimArtAngle(type)) < .05) delete this.aimAngleOverrides[type];
    else this.aimAngleOverrides[type] = Math.round(value * 10) / 10;
    try { localStorage.setItem(AIM_ANGLE_STORAGE_KEY, JSON.stringify(this.aimAngleOverrides)); } catch {}
    return this.aimArtAngle(type) * 180 / Math.PI;
  }
  aimArtAngles() {
    return Object.fromEntries(this.ids.map(type => [type, Math.round(this.aimArtAngle(type) * 1800 / Math.PI) / 10]));
  }
  texture(type) { return this.textures.get(ALIASES[type] || type); }
  equipmentTexture(type) { return this.equipmentTextures.get(type); }
  dimensions(type, size) {
    const image = this.texture(type).image, longest = Math.max(image.width, image.height);
    return [size * image.width / longest, size * image.height / longest];
  }
  create(type) {
    const group = new THREE.Group(), thought = this.thought(type);
    const plane = (width, height, material, z) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), litMaterial({ ...material, depthTest: false, depthWrite: false }));
      mesh.position.z = z; mesh.renderOrder = 20 + z; group.add(mesh); return mesh;
    };
    if (thought) {
      plane(1.12, 1.12, { color: 0xc7ddd9 }, 0);
      plane(1.02, 1.02, { color: 0x162732 }, .01);
      const dot = plane(.13, .13, { color: 0xc7ddd9 }, .01); dot.position.set(-.4, -.7, .01);
      const small = plane(.07, .07, { color: 0xc7ddd9 }, .01); small.position.set(-.53, -.87, .01);
    }
    const [width, height] = this.dimensions(type, thought ? .88 : 1.05);
    const icon = plane(width, height, { map: this.texture(type), transparent: true, alphaTest: .08 }, .02);
    if (!thought) icon.position.x = .37;
    return group;
  }
  createEquipment(type) {
    const texture = this.equipmentTexture(type);
    if (!texture) return null;
    const group = new THREE.Group();
    const image = texture.image;
    const longest = Math.max(image.width, image.height);
    const size = 1.7;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size * image.width / longest, size * image.height / longest),
      litMaterial({ map: texture, transparent: true, alphaTest: .08, depthTest: false, depthWrite: false })
    );
    mesh.position.z = .12;
    mesh.renderOrder = 18;
    group.add(mesh);
    return group;
  }
  fireballTexture() {
    if (this.flameTexture) return this.flameTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(255,255,235,1)');
    gradient.addColorStop(.28, 'rgba(255,244,120,1)');
    gradient.addColorStop(.62, 'rgba(255,145,20,.95)');
    gradient.addColorStop(1, 'rgba(255,70,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.arc(32, 32, 31, 0, Math.PI * 2); ctx.fill();
    this.flameTexture = new THREE.CanvasTexture(canvas);
    this.flameTexture.colorSpace = THREE.SRGBColorSpace;
    return this.flameTexture;
  }
  arrowTexture() {
    if (this.arrowSpriteTexture) return this.arrowSpriteTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#3a291b'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(8, 16); ctx.lineTo(108, 16); ctx.stroke();
    ctx.strokeStyle = '#bd8b4a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(8, 16); ctx.lineTo(108, 16); ctx.stroke();
    ctx.fillStyle = '#b9c4c0';
    ctx.beginPath(); ctx.moveTo(126, 16); ctx.lineTo(104, 7); ctx.lineTo(108, 16); ctx.lineTo(104, 25); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d8e4df';
    ctx.beginPath(); ctx.moveTo(126, 16); ctx.lineTo(107, 13); ctx.lineTo(108, 16); ctx.lineTo(107, 19); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#74452c';
    ctx.beginPath(); ctx.moveTo(12, 16); ctx.lineTo(1, 5); ctx.lineTo(25, 12); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(12, 16); ctx.lineTo(1, 27); ctx.lineTo(25, 20); ctx.closePath(); ctx.fill();
    this.arrowSpriteTexture = new THREE.CanvasTexture(canvas);
    this.arrowSpriteTexture.colorSpace = THREE.SRGBColorSpace;
    return this.arrowSpriteTexture;
  }
  dragonBallTexture() {
    if (this.dragonBallSpriteTexture) return this.dragonBallSpriteTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const trail = ctx.createLinearGradient(4, 0, 102, 0);
    trail.addColorStop(0, 'rgba(20,95,255,0)');
    trail.addColorStop(.58, 'rgba(30,125,255,.3)');
    trail.addColorStop(.85, 'rgba(75,205,255,.88)');
    trail.addColorStop(1, 'rgba(210,250,255,0)');
    ctx.fillStyle = trail;
    ctx.beginPath(); ctx.ellipse(61, 32, 57, 11, 0, 0, Math.PI * 2); ctx.fill();
    const aura = ctx.createRadialGradient(91, 32, 3, 91, 32, 29);
    aura.addColorStop(0, 'rgba(255,255,255,1)');
    aura.addColorStop(.3, 'rgba(132,240,255,1)');
    aura.addColorStop(.68, 'rgba(28,123,255,.95)');
    aura.addColorStop(1, 'rgba(10,55,255,0)');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(91, 32, 29, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f3ffff';
    ctx.beginPath(); ctx.arc(92, 32, 10, 0, Math.PI * 2); ctx.fill();
    this.dragonBallSpriteTexture = new THREE.CanvasTexture(canvas);
    this.dragonBallSpriteTexture.colorSpace = THREE.SRGBColorSpace;
    return this.dragonBallSpriteTexture;
  }
  mailEnvelopeTexture() {
    if (this.mailEnvelopeSpriteTexture) return this.mailEnvelopeSpriteTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 112; canvas.height = 72;
    const ctx = canvas.getContext('2d');
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#fff9e9';
    ctx.strokeStyle = '#66584b';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(5, 5, 102, 62, 6);
    ctx.fill(); ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#c6b89e';
    ctx.beginPath(); ctx.moveTo(8, 10); ctx.lineTo(56, 43); ctx.lineTo(104, 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, 63); ctx.lineTo(43, 35); ctx.moveTo(104, 63); ctx.lineTo(69, 35); ctx.stroke();
    ctx.fillStyle = '#d94747';
    ctx.beginPath(); ctx.arc(56, 44, 5, 0, Math.PI * 2); ctx.fill();
    this.mailEnvelopeSpriteTexture = new THREE.CanvasTexture(canvas);
    this.mailEnvelopeSpriteTexture.colorSpace = THREE.SRGBColorSpace;
    return this.mailEnvelopeSpriteTexture;
  }
  createMegaBombMesh() {
    const group = new THREE.Group();
    group.name = 'mb-mega-bomb';
    const make = (geometry, color, position, scale = [1, 1, 1], rotation = [0, 0, 0]) => {
      // Phong shading makes the spherical casing read as a volume under the
      // scene's existing hemisphere and directional lights. BasicMaterial was
      // unlit, so every surface stayed uniformly colored and looked flat.
      const mesh = new THREE.Mesh(geometry, litMaterial({
        color,
        depthTest: false,
        depthWrite: false
      }));
      mesh.position.set(...position); mesh.scale.set(...scale); mesh.rotation.set(...rotation); mesh.renderOrder = 24; group.add(mesh);
      return mesh;
    };
    make(new THREE.SphereGeometry(1, 32, 24), 0x202a29, [0, 0, 0], [.72, .72, .66]);
    make(new THREE.SphereGeometry(1, 32, 24), 0x596853, [0, .015, .035], [.66, .66, .61]);
    make(new THREE.TorusGeometry(.65, .045, 8, 32), 0x303a39, [0, 0, .08]);
    make(new THREE.TorusGeometry(.66, .024, 6, 32), 0xb3a66d, [0, 0, -.08], [1, 1, 1], [Math.PI / 2, 0, 0]);
    make(new THREE.CylinderGeometry(.19, .24, .13, 20), 0x303a39, [0, .63, .02]);
    make(new THREE.TorusGeometry(.16, .045, 8, 20), 0xc1b478, [0, .74, .02]);
    const hornDirections = Array.from({ length: 8 }, (_, i) => new THREE.Vector3(Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4), 0));
    hornDirections.push(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1));
    for (const direction of hornDirections) {
      const start = direction.clone().multiplyScalar(.56);
      const center = direction.clone().multiplyScalar(.73);
      const tip = direction.clone().multiplyScalar(.91);
      const horn = make(new THREE.ConeGeometry(.09, .34, 10), 0x343d3b, center.toArray());
      horn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      make(new THREE.SphereGeometry(.075, 10, 8), 0xc5b77c, start.toArray());
      make(new THREE.SphereGeometry(.065, 10, 8), 0x9d9a78, tip.toArray());
    }
    return group;
  }
  createRocketMesh() {
    const group = new THREE.Group();
    group.name = 'primitive-rocket';
    const material = (color, options = {}) => litMaterial({ color, depthTest: false, depthWrite: false, ...options });
    const add = (geometry, color, position = [0, 0, 0], rotation = 0) => {
      const mesh = new THREE.Mesh(geometry, material(color));
      mesh.position.set(...position);
      mesh.rotation.z = rotation;
      mesh.renderOrder = 21;
      group.add(mesh);
      return mesh;
    };

    // Dark silhouettes underneath the colored parts keep the small rocket readable.
    add(new THREE.CylinderGeometry(.185, .185, .68, 12), 0x16252b, [0, 0, -.015], Math.PI / 2);
    add(new THREE.ConeGeometry(.205, .31, 12), 0x16252b, [.49, 0, -.015], -Math.PI / 2);
    add(new THREE.CylinderGeometry(.15, .15, .59, 12), 0x71884f, [0, 0, .02], Math.PI / 2);
    add(new THREE.ConeGeometry(.17, .27, 12), 0xc9463d, [.48, 0, .02], -Math.PI / 2);

    const finShape = (top = true) => {
      const sign = top ? 1 : -1;
      const shape = new THREE.Shape();
      shape.moveTo(-.28, sign * .1);
      shape.lineTo(-.04, sign * .1);
      shape.lineTo(-.2, sign * .31);
      shape.lineTo(-.34, sign * .2);
      shape.closePath();
      return shape;
    };
    add(new THREE.ShapeGeometry(finShape(true)), 0x304536, [0, 0, 0]);
    add(new THREE.ShapeGeometry(finShape(false)), 0x304536, [0, 0, 0]);
    add(new THREE.CylinderGeometry(.047, .047, .43, 8), 0xb7cf72, [-.02, .04, .07], Math.PI / 2);
    add(new THREE.TorusGeometry(.17, .035, 6, 12), 0x263a33, [-.29, 0, .045]);
    const flameGlow = new THREE.Mesh(
      new THREE.CircleGeometry(.19, 16),
      material(0xff9d28, { transparent: true, opacity: .48 })
    );
    flameGlow.position.set(-.39, 0, -.005);
    flameGlow.renderOrder = 20;
    group.add(flameGlow);
    const outerFlame = add(new THREE.ConeGeometry(.14, .36, 8), 0xf06b1f, [-.53, 0, .025], Math.PI / 2);
    const innerFlame = add(new THREE.ConeGeometry(.09, .27, 8), 0xffe477, [-.62, 0, .04], Math.PI / 2);
    const smokeVertexShader = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
    const smokeFragmentShader = `precision mediump float;uniform float uOpacity;uniform float uSeed;uniform float uTime;varying vec2 vUv;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+uSeed*19.17)*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);}void main(){vec2 p=vUv*2.0-1.0;float d=length(p);float n=noise(p*2.7+vec2(uTime*.22,-uTime*.16));float detail=noise(p*6.0-vec2(uTime*.35,uTime*.12));float edge=1.0-smoothstep(.16+n*.22,1.16,d);float lobe=.82+.18*sin((p.x+n)*5.0+uSeed);vec3 color=mix(vec3(.28,.34,.35),vec3(.72,.76,.7),n*.68+detail*.32);float alpha=edge*lobe*(.72+.28*detail)*uOpacity;gl_FragColor=vec4(color,alpha);}`;
    const smokePuffs = Array.from({ length: 64 }, (_, index) => {
      const puff = new THREE.Mesh(
        new THREE.CircleGeometry(.24, 12),
        new THREE.ShaderMaterial({
          vertexShader: smokeVertexShader,
          fragmentShader: smokeFragmentShader,
          uniforms: {
            uOpacity: { value: 0 },
            uSeed: { value: Math.random() * 100 },
            uTime: { value: 0 }
          },
          transparent: true,
          depthTest: false,
          depthWrite: false
        })
      );
      puff.visible = false;
      puff.renderOrder = 19;
      puff.userData.smoke = { age: Infinity, life: 1.7, vx: 0, vy: 0, alpha: .2, startScale: .7, growth: 1.7, wobble: 0, phase: 0 };
      return puff;
    });
    group.userData.rocketArt = { flameGlow, outerFlame, innerFlame, smokePuffs, smokeTimer: 0, smokeIndex: 0, time: Math.random() * Math.PI * 2 };
    return group;
  }
  enableSuperSheepSmoke(p) {
    if (p.rocketMesh) return;
    p.rocketMesh = this.createRocketMesh();
    p.baseMesh.parent?.add(p.rocketMesh);
    p.rocketMesh.userData.rocketArt.smokePuffs.forEach(puff => p.baseMesh.parent?.add(puff));
    p.rocketMesh.visible = false;
  }
  hideRocket(p) {
    const art = p.rocketMesh?.userData.rocketArt;
    if (!art) return;
    if (art.detached) {
      this.detachedSmoke = this.detachedSmoke.filter(item => item !== art);
      art.detached = false;
    }
    art.smokePuffs.forEach(puff => { puff.visible = false; });
  }
  detachRocketSmoke(p) {
    const art = p.rocketMesh?.userData.rocketArt;
    if (!art || art.detached) return;
    art.detached = true;
    this.detachedSmoke.push(art);
  }
  updateDetachedSmoke(dt) {
    for (let i = this.detachedSmoke.length - 1; i >= 0; i--) {
      const art = this.detachedSmoke[i];
      let active = false;
      for (const puff of art.smokePuffs) {
        const smoke = puff.userData.smoke;
        if (!puff.visible) continue;
        active = true;
        smoke.age += dt;
        const progress = smoke.age / smoke.life;
        if (progress >= 1) {
          puff.visible = false;
          continue;
        }
        puff.position.x += smoke.vx * dt;
        puff.position.y += smoke.vy * dt;
        const size = smoke.startScale + progress * smoke.growth;
        puff.scale.setScalar(size);
        puff.rotation.z += dt * .7;
        const fade = 1 - THREE.MathUtils.smoothstep(progress, .04, 1);
        puff.material.uniforms.uTime.value = smoke.age;
        puff.material.uniforms.uOpacity.value = smoke.alpha * fade;
      }
      if (!active) {
        art.detached = false;
        this.detachedSmoke.splice(i, 1);
      }
    }
  }
  attachRocket(p) {
    const art = p.rocketMesh?.userData.rocketArt;
    if (!art || !art.detached) return;
    art.detached = false;
    this.detachedSmoke = this.detachedSmoke.filter(item => item !== art);
  }
  animateRocket(p, dt) {
    const art = p.rocketMesh?.userData.rocketArt || p.mesh.userData.rocketArt;
    if (!art) return;
    art.time += dt;
    const pulse = .5 + .5 * Math.sin(art.time * 30);
    const sway = Math.sin(art.time * 19) * .08 + Math.sin(art.time * 37) * .035;
    art.flameGlow.scale.setScalar(.88 + pulse * .24);
    art.flameGlow.material.opacity = .38 + pulse * .2;
    art.outerFlame.scale.set(1 + pulse * .28, .8 + pulse * .42, 1);
    art.outerFlame.rotation.z = -Math.PI / 2 + sway;
    art.innerFlame.scale.set(1 + pulse * .28, .72 + pulse * .5, 1);
    art.innerFlame.rotation.z = -Math.PI / 2 - sway * 1.35;

    const velocity = p.body.linvel();
    const speed = Math.hypot(velocity.x, velocity.y);
    const directionX = speed > .1 ? velocity.x / speed : Math.cos(p.mesh.rotation.z);
    const directionY = speed > .1 ? velocity.y / speed : Math.sin(p.mesh.rotation.z);
    art.smokeTimer -= dt;
    if (art.smokeTimer <= 0) {
      const puff = art.smokePuffs[art.smokeIndex++ % art.smokePuffs.length];
      const smoke = puff.userData.smoke;
      smoke.age = 0;
      smoke.life = 2.4 + Math.random() * 1.2;
      smoke.vx = -directionX * (.06 + Math.random() * .07) + (Math.random() - .5) * .08;
      smoke.vy = .045 + Math.random() * .08;
      smoke.alpha = .08 + Math.random() * .1;
      smoke.startScale = .98 + Math.random() * .34;
      smoke.growth = 1.9 + Math.random() * .95;
      smoke.wobble = .025 + Math.random() * .045;
      smoke.phase = Math.random() * Math.PI * 2;
      const offset = (Math.random() - .5) * .16;
      puff.position.set(
        p.mesh.position.x - directionX * .43 - directionY * offset,
        p.mesh.position.y - directionY * .43 + directionX * offset,
        .17
      );
      puff.scale.setScalar(smoke.startScale);
      puff.material.uniforms.uOpacity.value = smoke.alpha;
      puff.visible = true;
      art.smokeTimer = .02;
    }
    art.smokePuffs.forEach((puff, index) => {
      const smoke = puff.userData.smoke;
      if (!puff.visible) return;
      smoke.age += dt;
      const progress = smoke.age / smoke.life;
      if (progress >= 1) {
        puff.visible = false;
        return;
      }
      const wobble = Math.sin(smoke.age * 3.4 + smoke.phase) * smoke.wobble;
      puff.position.x += (smoke.vx - directionY * wobble) * dt;
      puff.position.y += (smoke.vy + directionX * wobble) * dt;
      const size = smoke.startScale + progress * smoke.growth;
      puff.scale.setScalar(size);
      puff.rotation.z += dt * (.5 + index * .08);
      const fade = 1 - THREE.MathUtils.smoothstep(progress, .04, 1);
      puff.material.uniforms.uTime.value = smoke.age;
      puff.material.uniforms.uOpacity.value = smoke.alpha * fade;
    });
  }
  projectile(p, type, radius) {
    if (p.megaBombMesh) p.megaBombMesh.visible = type === 'mbBomb';
    if (type === 'superSheepFlying') {
      p.baseMesh.visible = true;
      p.mesh = p.baseMesh;
      p.mesh.material.map = this.superSheepFlightTexture;
      p.mesh.material.color.setHex(0xffffff);
      p.mesh.material.transparent = true;
      p.mesh.material.alphaTest = .08;
      p.mesh.material.needsUpdate = true;
      const image = this.superSheepFlightTexture.image, longest = Math.max(image.width, image.height), size = 1.23;
      p.mesh.scale.set(size * image.width / longest, size * image.height / longest, 1);
      p.mesh.rotation.z = Math.PI / 2;
      return;
    }
    if (type === 'dragonBall') {
      p.baseMesh.visible = true;
      p.mesh = p.baseMesh;
      p.mesh.material.map = this.dragonBallTexture();
      p.mesh.material.color.setHex(0xffffff);
      p.mesh.material.needsUpdate = true;
      p.mesh.scale.set(1.05, .53, 1);
      p.mesh.rotation.z = 0;
      return;
    }
    if (type === 'arrow') {
      p.baseMesh.visible = true;
      p.mesh = p.baseMesh;
      p.mesh.material.map = this.arrowTexture();
      p.mesh.material.color.setHex(0xffffff);
      p.mesh.material.needsUpdate = true;
      p.mesh.scale.set(1.05, .27, 1);
      p.mesh.rotation.z = 0;
      return;
    }
    if (ROCKET_PROJECTILES.has(type)) {
      if (!p.rocketMesh) {
        p.rocketMesh = this.createRocketMesh();
        p.baseMesh.parent?.add(p.rocketMesh);
        p.rocketMesh.userData.rocketArt.smokePuffs.forEach(puff => p.baseMesh.parent?.add(puff));
      }
      this.attachRocket(p);
      p.baseMesh.visible = false;
      p.rocketMesh.visible = true;
      p.mesh = p.rocketMesh;
      p.mesh.scale.setScalar(Math.max(radius * 2.8, .65));
      p.mesh.rotation.z = 0;
      return;
    }
    if (p.rocketMesh) {
      p.rocketMesh.visible = false;
      this.hideRocket(p);
    }
    p.baseMesh.visible = true;
    p.mesh = p.baseMesh;
    if (type === 'flameShot' || type === 'napalm') {
      p.mesh.material.map = this.fireballTexture();
      p.mesh.material.color.setHex(0xffffff);
      p.mesh.material.needsUpdate = true;
      p.mesh.scale.set(type === 'napalm' ? .86 : .72, type === 'napalm' ? .86 : .72, 1);
      p.mesh.rotation.z = 0;
      return;
    }
    if (type === 'mailstrike') {
      p.mesh.material.map = this.mailEnvelopeTexture();
      p.mesh.material.color.setHex(0xffffff);
      p.mesh.material.needsUpdate = true;
      p.mesh.scale.set(.78, .5, 1);
      p.mesh.rotation.z = 0;
      return;
    }
    if (type === 'mbBomb') {
      if (!p.megaBombMesh) {
        p.megaBombMesh = this.createMegaBombMesh();
        p.baseMesh.parent?.add(p.megaBombMesh);
      }
      p.baseMesh.visible = false;
      p.mesh = p.megaBombMesh;
      p.mesh.scale.setScalar(1.15);
      p.mesh.visible = true;
      return;
    }
    const iconType = type === 'sheepLauncher' ? 'sheep' : type;
    p.mesh.material.map = this.texture(iconType);
    p.mesh.material.color.setHex(0xffffff);
    p.mesh.material.needsUpdate = true;
    const [width, height] = this.dimensions(iconType, Math.max(radius * 2.8, type === 'fragment' ? .32 : .65));
    p.mesh.scale.set(width, height, 1);
    p.mesh.rotation.z = 0;
  }
  orient(p, dt) {
    if (p.type === 'mailstrike') {
      const phase = p.age * p.mailSwayFrequency + p.mailSwayPhase;
      p.mesh.rotation.set(
        Math.sin(phase * .83 + 1.7) * .55,
        Math.sin(phase * 1.11 + 3.1) * .55,
        Math.sin(phase) * .75
      );
    } else if (p.type === 'mbBomb') {
      p.mesh.rotation.set(Math.sin(p.age * 1.1) * .12, Math.sin(p.age * .8 + 1) * .12, p.age * 1.4);
    } else if (p.type === 'dragonBall') {
      const v = p.body.linvel();
      p.mesh.rotation.z = Math.atan2(v.y, v.x);
    } else if (p.type === 'arrow') {
      if (!p.stuck) {
        const v = p.body.linvel();
        if (Math.hypot(v.x, v.y) > .1) {
          p.arrowVelocity = { x: v.x, y: v.y };
          p.arrowAngle = Math.atan2(v.y, v.x);
          p.body.setRotation(p.arrowAngle, true);
        }
      }
      p.mesh.rotation.z = p.arrowAngle ?? p.body.rotation();
    } else if (p.type === 'superSheep' && p.stage === 'flying') {
      p.mesh.rotation.z = p.heading;
      this.animateRocket(p, dt);
    } else if (WALKERS.has(p.type)) {
      p.mesh.rotation.z = 0;
      p.mesh.scale.x = Math.abs(p.mesh.scale.x) * p.dir;
    } else if (ROCKET_PROJECTILES.has(p.type) || ['magicBullet', 'pigeon', 'bomb', 'mortar'].includes(p.type)) {
      const v = p.body.linvel();
      p.mesh.rotation.z = Math.atan2(v.y, v.x) + (ROCKET_PROJECTILES.has(p.type) ? 0 : -Math.PI / 6);
      if (ROCKET_PROJECTILES.has(p.type)) this.animateRocket(p, dt);
    } else if (p.type !== 'mine' && p.type !== 'dynamite' && p.restingTime <= .08) p.mesh.rotation.z += dt * 2;
  }
}

export function disposeWeaponMesh(mesh) {
  if (!mesh) return;
  mesh.removeFromParent();
  mesh.traverse(node => { if (node.isMesh) { node.geometry.dispose(); node.material.dispose(); } });
}
