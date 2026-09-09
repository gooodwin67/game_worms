import * as THREE from 'three';
import { WEAPON_ICON_REGIONS } from './weapon-icon-regions.js';

const THOUGHT = new Set(['airstrike', 'napalm', 'mailstrike', 'minestrike', 'moleSquadron', 'frenchSheep', 'carpet', 'mbBomb', 'donkey', 'indianTest', 'armageddon', 'earthquake', 'scales', 'skipGo', 'surrender', 'selectWorm', 'freeze', 'lowGravity', 'fastWalk', 'laserSight', 'invisibility', 'teleport', 'girder', 'girderPack', 'jetPack', 'bungee', 'parachute', 'kamikaze', 'suicideBomber']);
const ALIASES = { bomb: 'homing', madCow: 'madCows', fragment: 'cluster' };
const WALKERS = new Set(['sheep', 'superSheep', 'sheepLauncher', 'moleBomb', 'madCow', 'oldWoman', 'salvation', 'skunk', 'donkey', 'mbBomb']);

export class WeaponArt {
  constructor(ids) { this.ids = ids; this.textures = new Map(); }
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
        if (data[p + 3] < 16 || Math.max(data[p], data[p + 1], data[p + 2]) < 24) queue.push(i);
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
  }
  thought(type) { return THOUGHT.has(type); }
  texture(type) { return this.textures.get(ALIASES[type] || type); }
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
  projectile(p, type, radius) {
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
    } else if (['bazooka', 'homing', 'magicBullet', 'pigeon', 'bomb', 'mortar'].includes(p.type)) {
      const v = p.body.linvel();
      // The atlas drawings point diagonally upward to the right.
      p.mesh.rotation.z = Math.atan2(v.y, v.x) - Math.PI / 6;
    } else if (p.type !== 'mine' && p.type !== 'dynamite') p.mesh.rotation.z += dt * 2;
  }
}

export function disposeWeaponMesh(mesh) {
  if (!mesh) return;
  mesh.removeFromParent();
  mesh.traverse(node => { if (node.isMesh) { node.geometry.dispose(); node.material.dispose(); } });
}
