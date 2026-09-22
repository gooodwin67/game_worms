import * as THREE from 'three';
import { WEAPON_ICON_REGIONS } from './weapon-icon-regions.js';

const THOUGHT = new Set(['airstrike', 'napalm', 'mailstrike', 'minestrike', 'moleSquadron', 'frenchSheep', 'carpet', 'mbBomb', 'donkey', 'indianTest', 'armageddon', 'earthquake', 'scales', 'skipGo', 'surrender', 'selectWorm', 'freeze', 'lowGravity', 'fastWalk', 'laserSight', 'invisibility', 'teleport', 'girder', 'girderPack', 'jetPack', 'bungee', 'parachute', 'kamikaze', 'suicideBomber']);
const ALIASES = { bomb: 'homing', madCow: 'madCows', fragment: 'cluster' };
const WALKERS = new Set(['sheep', 'superSheep', 'sheepLauncher', 'moleBomb', 'madCow', 'oldWoman', 'salvation', 'skunk', 'donkey', 'mbBomb']);
// Один визуальный снаряд используется всеми ракетными боеприпасами.
const ROCKET_PROJECTILES = new Set(['bazooka', 'homing', 'mortar']);

export class WeaponArt {
  constructor(ids) { this.ids = ids; this.textures = new Map(); this.equipmentTextures = new Map(); this.flameTexture = null; this.detachedSmoke = []; }
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
  texture(type) { return this.textures.get(ALIASES[type] || type); }
  equipmentTexture(type) { return this.equipmentTextures.get(type); }
  dimensions(type, size) {
    const image = this.texture(type).image, longest = Math.max(image.width, image.height);
    return [size * image.width / longest, size * image.height / longest];
  }
  create(type) {
    const group = new THREE.Group(), thought = this.thought(type);
    const plane = (width, height, material, z) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ ...material, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
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
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: .08, depthTest: false, depthWrite: false, side: THREE.DoubleSide })
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
  createRocketMesh() {
    const group = new THREE.Group();
    group.name = 'primitive-rocket';
    const material = (color, options = {}) => new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, side: THREE.DoubleSide, ...options });
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
    const art = p.mesh.userData.rocketArt;
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
    const iconType = type === 'sheepLauncher' ? 'sheep' : type;
    p.mesh.material.map = this.texture(iconType);
    p.mesh.material.color.setHex(0xffffff);
    p.mesh.material.needsUpdate = true;
    const [width, height] = this.dimensions(iconType, Math.max(radius * 2.8, type === 'fragment' ? .32 : .65));
    p.mesh.scale.set(width, height, 1);
    p.mesh.rotation.z = 0;
  }
  orient(p, dt) {
    if (WALKERS.has(p.type)) {
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
