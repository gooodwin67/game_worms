import * as THREE from 'three';
import RAPIER from '@dimforge/rapier2d-compat';
import { MAP } from './core.js';

export class Terrain {
  constructor(scene, world, customImage = null) {
    this.world = world;
    this.scale = MAP.pixelsPerUnit;
    this.canvas = document.createElement('canvas');
    this.canvas.width = MAP.width * this.scale;
    this.canvas.height = MAP.height * this.scale;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.hasCustomImage = !!customImage;

    if (customImage) {
      // Отрисовываем пользовательскую карту
      this.ctx.drawImage(customImage, 0, 0, this.canvas.width, this.canvas.height);

      // Превращаем чистый черный цвет фона (#000000) в прозрачный воздух
      const imgData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        // Если пиксель почти черный — делаем его прозрачным
        if (d[i] < 12 && d[i + 1] < 12 && d[i + 2] < 12) {
          d[i + 3] = 0;
        }
      }
      this.ctx.putImageData(imgData, 0, 0);
    } else {
      this.generateProcedural();
    }

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    // Шейдер: если карта из файла — берет её оригинальный цвет, иначе процедурную траву
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        mask: { value: this.texture },
        mapSize: { value: new THREE.Vector2(this.canvas.width, this.canvas.height) },
        useCustomTexture: { value: this.hasCustomImage ? 1.0 : 0.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec2 vWorldPos;
        void main() {
          vUv = uv;
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D mask;
        uniform vec2 mapSize;
        uniform float useCustomTexture;
        varying vec2 vUv;
        varying vec2 vWorldPos;

        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        void main() {
          vec2 px = 1.0 / mapSize;
          vec4 sampleCenter = texture2D(mask, vUv);

          if (sampleCenter.a < 0.4) discard;
          float edgeAlpha = smoothstep(0.4, 0.7, sampleCenter.a);

          // Проверка окружающих пикселей для контура среза взрыва
          float sampleSurround = (
            texture2D(mask, vUv + vec2(px.x * 2.0, 0.0)).a +
            texture2D(mask, vUv - vec2(px.x * 2.0, 0.0)).a +
            texture2D(mask, vUv + vec2(0.0, px.y * 2.0)).a +
            texture2D(mask, vUv - vec2(0.0, px.y * 2.0)).a
          ) * 0.25;

          vec3 finalColor;

          if (useCustomTexture > 0.5) {
            // Берем оригинальные цвета картинки
            finalColor = sampleCenter.rgb;

            // Тёмная окантовка на срезах взрывов и по краям острова
            float edgeDarkening = smoothstep(0.4, 0.95, sampleSurround);
            finalColor *= mix(0.35, 1.0, edgeDarkening);
          } else {
            // Процедурный грунт для стандартного режима
            float strata = noise(vec2(vWorldPos.x * 0.3, vWorldPos.y * 0.8));
            vec3 soil = mix(vec3(0.35, 0.22, 0.16), vec3(0.52, 0.35, 0.24), strata);

            float alphaUp = texture2D(mask, vUv + vec2(0.0, px.y * 5.0)).a;
            float grassMask = clamp((1.0 - alphaUp) * 1.5, 0.0, 1.0);
            vec3 grassColor = mix(vec3(0.24, 0.65, 0.22), vec3(0.48, 0.85, 0.32), noise(vWorldPos * 3.0));

            finalColor = mix(soil, grassColor, smoothstep(0.35, 0.8, grassMask));
            finalColor *= mix(0.7, 1.0, sampleSurround);
          }

          gl_FragColor = vec4(finalColor, edgeAlpha);
        }
      `,
      transparent: true
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(MAP.width, MAP.height), this.material);
    this.mesh.position.set(MAP.width / 2, MAP.height / 2, -0.15);
    scene.add(this.mesh);

    this.columns = Math.ceil(this.canvas.width / MAP.chunk);
    this.rows = Math.ceil(this.canvas.height / MAP.chunk);
    this.chunks = Array.from({ length: this.columns * this.rows }, () => []);
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.columns; x++) {
        this.rebuild(x, y);
      }
    }
  }

  generateProcedural() {
    this.seed = crypto.getRandomValues(new Uint32Array(1))[0];
    let randomState = this.seed;
    this.random = () => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 4294967296;
    };
    this.waves = Array.from({ length: 5 }, (_, i) => ({
      amplitude: 7 / (i + 1),
      frequency: (.045 + this.random() * .04) * (i + 1),
      phase: this.random() * Math.PI * 2
    }));

    const c = this.ctx;
    c.fillStyle = '#6b4c35';
    c.beginPath();
    c.moveTo(0, this.canvas.height);
    for (let x = 0; x <= this.canvas.width; x++) {
      c.lineTo(x, (MAP.height - this.surface(x / this.scale)) * this.scale);
    }
    c.lineTo(this.canvas.width, this.canvas.height);
    c.closePath();
    c.fill();

    c.globalCompositeOperation = 'destination-out';
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (let tunnel = 0; tunnel < 9; tunnel++) {
      let x = 4 + this.random() * (MAP.width - 8),
        y = 4 + this.random() * Math.max(1, this.surface(x) - 10);
      const direction = this.random() < .5 ? -1 : 1;
      c.beginPath();
      c.moveTo(x * this.scale, (MAP.height - y) * this.scale);
      const phase = this.random() * Math.PI * 2;
      for (let i = 0; i < 20; i++) {
        x = THREE.MathUtils.clamp(x + direction * (.7 + this.random()), 2, MAP.width - 2);
        y = THREE.MathUtils.clamp(y + Math.sin(i * .55 + phase) * .8, 3, this.surface(x) - 5);
        c.lineTo(x * this.scale, (MAP.height - y) * this.scale);
      }
      c.lineWidth = (2 + this.random() * 2.5) * this.scale;
      c.stroke();
      c.beginPath();
      c.ellipse(x * this.scale, (MAP.height - y) * this.scale, (1.8 + this.random() * 1.5) * this.scale, 1.5 * this.scale, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.globalCompositeOperation = 'source-over';
  }

  surface(x) {
    if (!this.waves) return 24;
    let y = 24;
    for (const wave of this.waves) y += wave.amplitude * Math.sin(x * wave.frequency + wave.phase);
    return THREE.MathUtils.clamp(y, 13, 37);
  }

  spawnHeight(x) {
    const radius = 0.38, halfHeight = 0.23;
    const requiredClearance = 1.4;
    const clearancePixels = Math.ceil(requiredClearance * this.scale);

    const left = Math.max(0, Math.floor((x - radius) * this.scale));
    const right = Math.min(this.canvas.width - 1, Math.floor((x + radius) * this.scale));
    const width = right - left + 1;
    const pixels = this.ctx.getImageData(left, 0, width, this.canvas.height).data;

    const centerCol = Math.floor((x - left / this.scale) * this.scale);
    const validFloors = [];

    for (let row = clearancePixels; row < this.canvas.height - 4; row++) {
      const idx = (row * width + centerCol) * 4 + 3;
      const prevIdx = ((row - 1) * width + centerCol) * 4 + 3;

      if (pixels[prevIdx] < 128 && pixels[idx] >= 128) {
        let hasClearance = true;
        for (let checkRow = row - clearancePixels; checkRow < row; checkRow++) {
          if (pixels[(checkRow * width + centerCol) * 4 + 3] >= 128) {
            hasClearance = false;
            break;
          }
        }
        if (hasClearance) validFloors.push(row);
      }
    }

    let targetRow = validFloors.length > 0
      ? validFloors[Math.floor(Math.random() * validFloors.length)]
      : Math.floor(this.canvas.height * 0.5);

    let centerY = 0;
    for (let column = 0; column < width; column++) {
      const pixelLeft = (left + column) / this.scale, pixelRight = pixelLeft + 1 / this.scale;
      const distance = Math.max(pixelLeft - x, x - pixelRight, 0);
      if (distance >= radius) continue;

      for (let r = Math.max(0, targetRow - 6); r < Math.min(this.canvas.height, targetRow + 10); r++) {
        if (pixels[(r * width + column) * 4 + 3] < 128) continue;
        const top = MAP.height - r / this.scale;
        centerY = Math.max(centerY, top + halfHeight + Math.sqrt(radius * radius - distance * distance));
        break;
      }
    }

    return (centerY || (MAP.height - targetRow / this.scale + halfHeight + radius)) + 0.002;
  }

  captureCollisionMask() {
    return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }

  isSolid(x, y, mask = null) {
    const px = Math.floor(x * this.scale), py = Math.floor((MAP.height - y) * this.scale);
    if (px < 0 || py < 0 || px >= this.canvas.width || py >= this.canvas.height) return false;
    const image = mask || this.ctx.getImageData(px, py, 1, 1);
    const offset = mask ? (py * mask.width + px) * 4 + 3 : 3;
    return image.data[offset] >= 128;
  }

  rebuild(cx, cy) {
    const list = this.chunks[cy * this.columns + cx];
    for (const collider of list) this.world.removeCollider(collider, true);
    list.length = 0;
    const px = cx * MAP.chunk, py = cy * MAP.chunk;
    const width = Math.min(MAP.chunk, this.canvas.width - px), height = Math.min(MAP.chunk, this.canvas.height - py);
    const data = this.ctx.getImageData(px, py, width, height).data;
    const used = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (used[y * width + x] || data[(y * width + x) * 4 + 3] < 128) continue;
      let end = x + 1;
      while (end < width && !used[y * width + end] && data[(y * width + end) * 4 + 3] >= 128) end++;
      let bottom = y + 1;
      outer: while (bottom < height) {
        for (let k = x; k < end; k++) if (used[bottom * width + k] || data[(bottom * width + k) * 4 + 3] < 128) break outer;
        bottom++;
      }
      for (let row = y; row < bottom; row++) for (let k = x; k < end; k++) used[row * width + k] = 1;
      list.push(this.world.createCollider(RAPIER.ColliderDesc.cuboid((end - x) / this.scale / 2, (bottom - y) / this.scale / 2).setTranslation((px + (x + end) / 2) / this.scale, MAP.height - (py + (y + bottom) / 2) / this.scale).setFriction(0.9)));
    }
  }

  createExplosion(x, y, radius) {
    if (!(radius > 0) || !Number.isFinite(x + y + radius)) return;
    const px = x * this.scale, py = (MAP.height - y) * this.scale, r = radius * this.scale;
    const c = this.ctx;
    const left = Math.max(0, Math.floor(px - r));
    const top = Math.max(0, Math.floor(py - r));
    const right = Math.min(this.canvas.width, Math.ceil(px + r));
    const bottom = Math.min(this.canvas.height, Math.ceil(py + r));
    const colors = [];
    if (right > left && bottom > top) {
      const image = c.getImageData(left, top, right - left, bottom - top);
      const stride = Math.max(1, Math.floor(Math.sqrt(image.width * image.height / 24)));
      for (let sy = 0; sy < image.height && colors.length < 24; sy += stride) {
        for (let sx = 0; sx < image.width && colors.length < 24; sx += stride) {
          const worldX = left + sx - px, worldY = top + sy - py;
          if (worldX * worldX + worldY * worldY > r * r) continue;
          const offset = (sy * image.width + sx) * 4;
          if (image.data[offset + 3] < 128) continue;
          colors.push([image.data[offset] / 255, image.data[offset + 1] / 255, image.data[offset + 2] / 255]);
        }
      }
    }
    if (!this.hasCustomImage) {
      colors.length = 0;
      const soil = [[.35, .22, .16], [.42, .28, .19], [.52, .35, .24], [.30, .19, .14]];
      const grass = [[.24, .65, .22], [.34, .74, .26], [.48, .85, .32]];
      const nearSurface = y + radius >= this.surface(x) - 1.5;
      colors.push(...soil, ...(nearSurface ? grass : []));
    }
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(px, py, r, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'source-over';
    this.texture.needsUpdate = true;
    const size = MAP.chunk;
    for (let cy = Math.max(0, Math.floor((py - r - 1) / size)); cy <= Math.min(this.rows - 1, Math.floor((py + r + 1) / size)); cy++) {
      for (let cx = Math.max(0, Math.floor((px - r - 1) / size)); cx <= Math.min(this.columns - 1, Math.floor((px + r + 1) / size)); cx++) {
        const dx = px - Math.max(cx * size, Math.min(px, (cx + 1) * size));
        const dy = py - Math.max(cy * size, Math.min(py, (cy + 1) * size));
        if (dx * dx + dy * dy <= (r + 1) * (r + 1)) this.rebuild(cx, cy);
      }
    }
    return colors;
  }

  createGirder(x, y, angle, length) {
    const c = this.ctx;
    c.save();
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = '#8b5a2b';
    c.lineWidth = .34 * this.scale;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo((x - Math.cos(angle) * length / 2) * this.scale, (MAP.height - (y - Math.sin(angle) * length / 2)) * this.scale);
    c.lineTo((x + Math.cos(angle) * length / 2) * this.scale, (MAP.height - (y + Math.sin(angle) * length / 2)) * this.scale);
    c.stroke();
    c.restore();
    this.texture.needsUpdate = true;
    for (let cy = 0; cy < this.rows; cy++) for (let cx = 0; cx < this.columns; cx++) this.rebuild(cx, cy);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
