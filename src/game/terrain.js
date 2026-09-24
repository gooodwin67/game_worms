import * as THREE from 'three';
import RAPIER from '@dimforge/rapier2d-compat';
import { MAP } from './core.js';

const MAX_PARTICLE_GLINTS = 12;

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
      this.removeTinyIslands(imgData, 48);
      this.ctx.putImageData(imgData, 0, 0);
    } else {
      this.generateProcedural();
    }

    // Цвет грунта храним отдельно от разрушаемой маски. После destination-out
    // браузер может обнулить RGB прозрачных пикселей CanvasTexture, из-за чего
    // оставшийся грунт иногда становится чёрным после первого взрыва.
    this.colorCanvas = document.createElement('canvas');
    this.colorCanvas.width = this.canvas.width;
    this.colorCanvas.height = this.canvas.height;
    this.colorCtx = this.colorCanvas.getContext('2d');
    this.colorCtx.drawImage(this.canvas, 0, 0);
    this.blastRimCanvas = document.createElement('canvas');
    this.blastRimCanvas.width = this.canvas.width;
    this.blastRimCanvas.height = this.canvas.height;
    this.blastRimCtx = this.blastRimCanvas.getContext('2d');
    this.normalCanvas = document.createElement('canvas');
    this.normalCanvas.width = this.canvas.width;
    this.normalCanvas.height = this.canvas.height;
    this.normalCtx = this.normalCanvas.getContext('2d', { willReadFrequently: true });
    this.normalTexture = new THREE.CanvasTexture(this.normalCanvas);
    this.normalTexture.minFilter = THREE.LinearFilter;
    this.normalTexture.magFilter = THREE.LinearFilter;
    this.normalTexture.generateMipmaps = false;
    this.updateNormalMap();

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.colorTexture = new THREE.CanvasTexture(this.colorCanvas);
    this.colorTexture.minFilter = THREE.LinearFilter;
    this.colorTexture.magFilter = THREE.LinearFilter;
    this.colorTexture.generateMipmaps = false;
    this.blastRimTexture = new THREE.CanvasTexture(this.blastRimCanvas);
    this.blastRimTexture.minFilter = THREE.LinearFilter;
    this.blastRimTexture.magFilter = THREE.LinearFilter;
    this.blastRimTexture.generateMipmaps = false;

    // Шейдер: если карта из файла — берет её оригинальный цвет, иначе процедурную траву
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        mask: { value: this.texture },
        colorMap: { value: this.colorTexture },
        normalMap: { value: this.normalTexture },
        blastRim: { value: this.blastRimTexture },
        mapSize: { value: new THREE.Vector2(this.canvas.width, this.canvas.height) },
        useCustomTexture: { value: this.hasCustomImage ? 1.0 : 0.0 },
        lightPos: { value: new THREE.Vector2(MAP.width * .5, MAP.height * .78) },
        lightHeight: { value: 8.0 },
        lightRadius: { value: 16.0 },
        lightMode: { value: 0 },
        lightColor: { value: new THREE.Color('#fff1c8') },
        particleLightPos: { value: Array.from({ length: MAX_PARTICLE_GLINTS }, () => new THREE.Vector2()) },
        particleLightColor: { value: Array.from({ length: MAX_PARTICLE_GLINTS }, () => new THREE.Color()) },
        particleLightStrength: { value: new Float32Array(MAX_PARTICLE_GLINTS) },
        particleLightRadius: { value: new Float32Array(MAX_PARTICLE_GLINTS) },
        particleLightCount: { value: 0 }
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
        uniform sampler2D colorMap;
        uniform sampler2D normalMap;
        uniform sampler2D blastRim;
        uniform vec2 mapSize;
        uniform float useCustomTexture;
        uniform vec2 lightPos;
        uniform float lightHeight;
        uniform float lightRadius;
        uniform int lightMode;
        uniform vec3 lightColor;
        uniform vec2 particleLightPos[12];
        uniform vec3 particleLightColor[12];
        uniform float particleLightStrength[12];
        uniform float particleLightRadius[12];
        uniform float particleLightCount;
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
          vec4 colorCenter = texture2D(colorMap, vUv);

          if (sampleCenter.a < 0.4) discard;
          float edgeAlpha = smoothstep(0.4, 0.7, sampleCenter.a);

          // Псевдорельеф из яркости соседних пикселей — аналог bump map из SVG-фильтра.
          vec3 normal = normalize(texture2D(normalMap, vUv).rgb * 2.0 - 1.0);
          vec3 lightDirection = normalize(vec3(lightPos - vWorldPos, lightHeight));
          float diffuse = max(dot(normal, lightDirection), 0.0);
          vec3 reflected = reflect(-lightDirection, normal);
          float specular = pow(max(reflected.z, 0.0), 28.0);

          vec3 finalColor;
          float blastRimAmount = texture2D(blastRim, vUv).a;

          if (useCustomTexture > 0.5) {
            // Берем оригинальные цвета картинки
            finalColor = colorCenter.rgb;

          } else {
            // Процедурный грунт для стандартного режима
            float strata = noise(vec2(vWorldPos.x * 0.3, vWorldPos.y * 0.8));
            vec3 soil = mix(vec3(0.35, 0.22, 0.16), vec3(0.52, 0.35, 0.24), strata);

            float alphaUp = texture2D(mask, vUv + vec2(0.0, px.y * 5.0)).a;
            float grassMask = clamp((1.0 - alphaUp) * 1.5, 0.0, 1.0);
            vec3 grassColor = mix(vec3(0.24, 0.65, 0.22), vec3(0.48, 0.85, 0.32), noise(vWorldPos * 3.0));

            finalColor = mix(soil, grassColor, smoothstep(0.35, 0.8, grassMask));
          }

          // Кромка рисуется отдельной маской взрывов, поэтому естественные края
          // карты не затемняются вместе с кратерами.
          float rimVariation = noise(vWorldPos * vec2(11.0, 17.0));
          vec3 exposedSoil = mix(vec3(.22, .14, .10), vec3(.39, .25, .15), rimVariation);
          finalColor = mix(finalColor, exposedSoil, blastRimAmount * .68);
          finalColor *= mix(1.0, .35, blastRimAmount);

          // Общее освещение применяется и к пользовательской текстуре: раньше
          // вычислялся рельефный normal, но исходное изображение им не затенялось.
          float terrainLight = 0.82 + diffuse * 0.22;
          finalColor *= terrainLight;

          // Слабые локальные блики от разлетающихся частиц взрыва.
          // Ограниченное число источников сохраняет стоимость шейдера предсказуемой.
          for (int i = 0; i < 12; i++) {
            float enabled = step(float(i) + .5, particleLightCount);
            float particleDistance = distance(particleLightPos[i], vWorldPos);
            float particleRadius = particleLightRadius[i];
            float particleFalloff = (1.0 - smoothstep(.08, particleRadius, particleDistance)) * enabled;
            vec3 particleDirection = normalize(vec3(particleLightPos[i] - vWorldPos, 2.2));
            float particleDiffuse = max(dot(normal, particleDirection), 0.0);
            vec3 particleReflected = reflect(-particleDirection, normal);
            float particleSpecular = pow(max(particleReflected.z, 0.0), 22.0);
            float strength = particleLightStrength[i];
            float particleGlow = particleFalloff * strength;
            vec3 particleTint = particleLightColor[i];
            if (lightMode == 1) {
              particleTint = vec3(1.0);
              particleGlow *= 1.2;
            } else if (lightMode == 2) {
              particleTint = lightColor;
              particleGlow *= .78;
            } else if (lightMode == 3) {
              particleTint = mix(particleLightColor[i], lightColor, .45);
              particleGlow *= 1.1;
            } else if (lightMode == 4) {
              particleTint = lightColor;
              particleGlow *= .95;
            }
            finalColor += finalColor * (particleGlow * .22 + particleDiffuse * particleGlow * .34);
            finalColor += particleTint * (particleGlow * .28 + particleSpecular * particleGlow * .2);
          }

          gl_FragColor = vec4(finalColor, edgeAlpha);
        }
      `,
      transparent: true
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(MAP.width, MAP.height), this.material);
    this.mesh.position.set(MAP.width / 2, MAP.height / 2, -0.15);
    this.earthquakeOffset = { x: 0, y: 0 };
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

  removeTinyIslands(imageData, minimumPixels) {
    const width = imageData.width, height = imageData.height, data = imageData.data;
    const visited = new Uint8Array(width * height);
    const solid = index => data[index * 4 + 3] >= 128;
    const neighbours = (index, visit) => {
      const x = index % width, y = Math.floor(index / width);
      if (x > 0) visit(index - 1);
      if (x + 1 < width) visit(index + 1);
      if (y > 0) visit(index - width);
      if (y + 1 < height) visit(index + width);
    };

    for (let start = 0; start < visited.length; start++) {
      if (visited[start] || !solid(start)) continue;
      const component = [start];
      visited[start] = 1;
      for (let head = 0; head < component.length; head++) {
        neighbours(component[head], next => {
          if (!visited[next] && solid(next)) { visited[next] = 1; component.push(next); }
        });
      }
      if (component.length >= minimumPixels) continue;
      for (const index of component) data[index * 4 + 3] = 0;
    }
  }

  updateNormalMap(x = 0, y = 0, width = this.canvas.width, height = this.canvas.height) {
    const step = 3, padding = step;
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.canvas.width, Math.ceil(x + width)), y1 = Math.min(this.canvas.height, Math.ceil(y + height));
    if (x1 <= x0 || y1 <= y0) return;
    const sourceX = Math.max(0, x0 - padding), sourceY = Math.max(0, y0 - padding);
    const sourceRight = Math.min(this.canvas.width, x1 + padding), sourceBottom = Math.min(this.canvas.height, y1 + padding);
    const sourceWidth = sourceRight - sourceX, sourceHeight = sourceBottom - sourceY;
    const colorData = this.colorCtx.getImageData(sourceX, sourceY, sourceWidth, sourceHeight).data;
    const maskData = this.ctx.getImageData(sourceX, sourceY, sourceWidth, sourceHeight).data;
    const output = this.normalCtx.createImageData(x1 - x0, y1 - y0), outputData = output.data;
    const heightAt = (px, py) => {
      const index = ((py - sourceY) * sourceWidth + px - sourceX) * 4;
      const alpha = maskData[index + 3] / 255;
      return ((colorData[index] * .299 + colorData[index + 1] * .587 + colorData[index + 2] * .114) / 255) * alpha;
    };
    const strength = 10;
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) {
      const left = heightAt(Math.max(0, px - step), py), right = heightAt(Math.min(this.canvas.width - 1, px + step), py);
      const top = heightAt(px, Math.max(0, py - step)), bottom = heightAt(px, Math.min(this.canvas.height - 1, py + step));
      let nx = (left - right) * strength, ny = (bottom - top) * strength, nz = 1;
      const length = Math.hypot(nx, ny, nz); nx /= length; ny /= length; nz /= length;
      const index = ((py - y0) * (x1 - x0) + px - x0) * 4;
      outputData[index] = (nx * .5 + .5) * 255;
      outputData[index + 1] = (ny * .5 + .5) * 255;
      outputData[index + 2] = (nz * .5 + .5) * 255;
      outputData[index + 3] = 255;
    }
    this.normalCtx.putImageData(output, x0, y0);
    this.normalTexture.needsUpdate = true;
  }

  addTrainingBlock(x, y, width, height) {
    const left = Math.round((x - width / 2) * this.scale), top = Math.round((MAP.height - y - height / 2) * this.scale);
    const blockWidth = Math.round(width * this.scale), blockHeight = Math.round(height * this.scale);
    this.ctx.save(); this.ctx.globalCompositeOperation = 'source-over'; this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(left, top, blockWidth, blockHeight); this.ctx.restore();

    const c = this.colorCtx;
    c.save(); c.globalCompositeOperation = 'source-over';
    const sourceTop = Math.max(0, this.canvas.height - blockHeight - 2);
    c.drawImage(this.colorCanvas, left, sourceTop, blockWidth, blockHeight, left, top, blockWidth, blockHeight);
    c.restore();
    this.paintGrassEdge(left, blockWidth, () => top, Math.floor(x * 83 + y * 19));

    this.texture.needsUpdate = true; this.colorTexture.needsUpdate = true;
    const normalPadding = Math.round(this.scale * .4 + 4);
    this.updateNormalMap(left - normalPadding, top - normalPadding, blockWidth + normalPadding * 2, blockHeight + normalPadding * 2);
    const size = MAP.chunk;
    for (let cy = Math.max(0, Math.floor((top - normalPadding) / size)); cy <= Math.min(this.rows - 1, Math.floor((top + blockHeight) / size)); cy++) {
      for (let cx = Math.max(0, Math.floor(left / size)); cx <= Math.min(this.columns - 1, Math.floor((left + blockWidth) / size)); cx++) this.rebuild(cx, cy);
    }
  }

  addSurfaceGrass() {
    const mask = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
    const surface = new Int32Array(this.canvas.width).fill(-1);
    for (let px = 0; px < this.canvas.width; px++) {
      let py = this.canvas.height - 1;
      while (py > 0 && mask[(py * this.canvas.width + px) * 4 + 3] < 128) py--;
      if (mask[(py * this.canvas.width + px) * 4 + 3] < 128) continue;
      while (py > 0 && mask[((py - 1) * this.canvas.width + px) * 4 + 3] >= 128) py--;
      surface[px] = py;
    }
    this.paintGrassEdge(0, this.canvas.width, px => surface[px], 76423);
    this.colorTexture.needsUpdate = true;
    this.updateNormalMap();
  }

  paintGrassEdge(startX, width, surfaceAt, seed) {
    const c = this.colorCtx, clumpSpacing = Math.max(10, Math.round(this.scale * .9));
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const depthAt = [];
    for (let i = 0; i <= Math.ceil(width / clumpSpacing) + 1; i++) depthAt.push(random() < .34 ? 0 : 2 + Math.floor(random() * 6));
    const shades = [[76, 105, 44], [98, 125, 52], [116, 139, 61], [62, 88, 39]];
    c.save(); c.globalCompositeOperation = 'source-over';
    for (let offset = 0; offset < width; offset++) {
      const y = surfaceAt(startX + offset);
      if (y < 0) continue;
      const knot = offset / clumpSpacing, index = Math.floor(knot), blend = knot - index;
      const smoothBlend = blend * blend * (3 - 2 * blend);
      const depth = Math.round(depthAt[index] + (depthAt[index + 1] - depthAt[index]) * smoothBlend);
      if (!depth) continue;
      for (let row = 0; row < depth; row++) {
        const shade = shades[(index + row + Math.floor(offset / 3)) % shades.length];
        const alpha = row === 0 ? .78 : .58;
        c.fillStyle = `rgba(${shade[0]}, ${shade[1]}, ${shade[2]}, ${alpha})`;
        c.fillRect(startX + offset, y + row, 1, 1);
      }
    }
    c.restore();
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

  spawnHeight(x, useFallback = true) {
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

    if (!validFloors.length && !useFallback) return null;
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

  findSpawnPoints(step = .65) {
    const points = [];
    for (let x = .8; x < MAP.width - .8; x += step) {
      const y = this.spawnHeight(x, false);
      if (y !== null) points.push({ x, y });
    }
    return points;
  }

  landingHeight(x, halfWidth = .52, halfHeight = .36) {
    const left = Math.max(0, Math.floor((x - halfWidth) * this.scale));
    const right = Math.min(this.canvas.width - 1, Math.floor((x + halfWidth) * this.scale));
    const width = right - left + 1;
    const pixels = this.ctx.getImageData(left, 0, width, this.canvas.height).data;
    const centerColumn = Math.floor((x - left / this.scale) * this.scale);
    const rowHasSolid = row => pixels[(row * width + centerColumn) * 4 + 3] >= 128;
    for (let row = 0; row < this.canvas.height; row++) {
      if (!rowHasSolid(row) || (row > 0 && rowHasSolid(row - 1))) continue;
      return MAP.height - row / this.scale + halfHeight + .002;
    }
    return null;
  }

  findPlatformTops(minPixels = 800) {
    const width = this.canvas.width, height = this.canvas.height;
    const data = this.ctx.getImageData(0, 0, width, height).data;
    const visited = new Uint8Array(width * height);
    const regions = [];
    const solid = index => data[index * 4 + 3] >= 128;

    for (let start = 0; start < visited.length; start++) {
      if (visited[start] || !solid(start)) continue;
      const queue = [start];
      visited[start] = 1;
      const add = next => {
        if (visited[next] || !solid(next)) return;
        visited[next] = 1;
        queue.push(next);
      };
      let head = 0, count = 0;
      let minX = width, maxX = 0, minY = height, maxY = 0;
      while (head < queue.length) {
        const index = queue[head++], x = index % width, y = Math.floor(index / width);
        count++;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        if (x > 0) add(index - 1);
        if (x + 1 < width) add(index + 1);
        if (y > 0) add(index - width);
        if (y + 1 < height) add(index + width);
      }
      if (count < minPixels) continue;

      const centerPixel = Math.round((minX + maxX) / 2);
      let surfaceRow = minY;
      for (let y = minY; y <= maxY; y++) {
        if (solid(y * width + centerPixel)) { surfaceRow = y; break; }
      }
      regions.push({
        x: (centerPixel + .5) / this.scale,
        surfaceY: MAP.height - surfaceRow / this.scale,
        width: (maxX - minX + 1) / this.scale
      });
    }
    return regions.sort((a, b) => a.x - b.x);
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

  lowestSolidY() {
    const data = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
    for (let row = this.canvas.height - 1; row >= 0; row--) {
      for (let column = 0; column < this.canvas.width; column++) {
        if (data[(row * this.canvas.width + column) * 4 + 3] >= 128) return MAP.height - row / this.scale;
      }
    }
    return 0;
  }

  setLightPosition(x, y) {
    this.material.uniforms.lightPos.value.set(x, y);
  }

  setParticleLights(...sources) {
    const positions = this.material.uniforms.particleLightPos.value;
    const colors = this.material.uniforms.particleLightColor.value;
    const strengths = this.material.uniforms.particleLightStrength.value;
    const radii = this.material.uniforms.particleLightRadius.value;
    const lightMode = this.material.uniforms.lightMode.value;
    const defaultRadius = lightMode === 1 ? 2.4 : lightMode === 2 ? 3.1 : lightMode === 3 ? 5.4 : lightMode === 4 ? 4.2 : 6.0;
    let count = 0;
    for (const data of sources) {
      let sourceCount = 0;
      const sourceLimit = Math.ceil(MAX_PARTICLE_GLINTS / sources.length);
      const available = data?.count || 0;
      const takeCount = Math.min(available, sourceLimit, MAX_PARTICLE_GLINTS - count);
      while (data && sourceCount < takeCount) {
        // Sources may contain more lights than the terrain shader can process.
        // Sample across the whole set instead of always taking its first entries.
        const sourceIndex = Math.floor(sourceCount * available / takeCount);
        const position = data.positions[sourceIndex];
        const color = data.colors[sourceIndex];
        const strength = data.strengths[sourceIndex];
        sourceCount++;
        if (!position || !color || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(strength) || strength <= 0) continue;
        positions[count].copy(position);
        colors[count].copy(color);
        strengths[count] = strength;
        radii[count] = defaultRadius * (data.radiusScale || 1);
        count++;
      }
    }
    for (let i = 0; i < MAX_PARTICLE_GLINTS; i++) {
      if (i >= count) { strengths[i] = 0; radii[i] = defaultRadius; }
    }
    this.material.uniforms.particleLightCount.value = count;
  }

  setLightingMode(mode) {
    const presets = {
      soft: { index: 0, radius: 13, color: '#fff1c8' },
      flashlight: { index: 1, radius: 8, color: '#ffffff' },
      contour: { index: 2, radius: 12, color: '#8fe8ff' },
      warm: { index: 3, radius: 11, color: '#ffad5c' },
      neon: { index: 4, radius: 12, color: '#59d9ff' }
    };
    const preset = presets[mode] || presets.soft;
    this.material.uniforms.lightMode.value = preset.index;
    this.material.uniforms.lightRadius.value = preset.radius;
    this.material.uniforms.lightColor.value.set(preset.color);
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

  setEarthquakeOffset(x, y) {
    const dx = x - this.earthquakeOffset.x, dy = y - this.earthquakeOffset.y;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return { x: 0, y: 0 };
    this.earthquakeOffset.x = x;
    this.earthquakeOffset.y = y;
    this.mesh.position.x += dx;
    this.mesh.position.y += dy;
    for (const collider of this.chunks.flat()) {
      const position = collider.translation();
      collider.setTranslation({ x: position.x + dx, y: position.y + dy });
    }
    return { x: dx, y: dy };
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
    const roughnessPoints = Array.from({ length: 32 }, () => (Math.random() - .5) * .11);
    const pointCount = Math.max(36, Math.min(96, Math.round(r * 1.4)));
    const edgePoints = [];
    for (let i = 0; i <= pointCount; i++) {
      const angle = i / pointCount * Math.PI * 2;
      const controlPosition = i / pointCount * roughnessPoints.length;
      const controlIndex = Math.floor(controlPosition) % roughnessPoints.length;
      const nextIndex = (controlIndex + 1) % roughnessPoints.length;
      const blend = controlPosition - Math.floor(controlPosition);
      const smoothBlend = blend * blend * (3 - 2 * blend);
      const offset = THREE.MathUtils.lerp(roughnessPoints[controlIndex], roughnessPoints[nextIndex], smoothBlend);
      const edgeRadius = r * (1 + offset);
      const edgeX = px + Math.cos(angle) * edgeRadius;
      const edgeY = py + Math.sin(angle) * edgeRadius;
      edgePoints.push([edgeX, edgeY]);
      if (i === 0) c.moveTo(edgeX, edgeY);
      else c.lineTo(edgeX, edgeY);
    }
    c.closePath();
    c.fill();
    c.globalCompositeOperation = 'source-over';
    this.texture.needsUpdate = true;
    this.blastRimCtx.beginPath();
    edgePoints.forEach(([edgeX, edgeY], index) => {
      if (index === 0) this.blastRimCtx.moveTo(edgeX, edgeY);
      else this.blastRimCtx.lineTo(edgeX, edgeY);
    });
    this.blastRimCtx.closePath();
    this.blastRimCtx.strokeStyle = 'rgba(255, 255, 255, .95)';
    this.blastRimCtx.lineWidth = this.scale * .375;
    this.blastRimCtx.lineJoin = 'round';
    this.blastRimCtx.stroke();
    this.blastRimTexture.needsUpdate = true;
    if (this.hasCustomImage && radius >= 1.5) {
      // Трещины добавляются только крупным взрывам, не мини-взрывам и бурению.
      const crackCount = Math.max(24, Math.min(54, Math.round(radius * 8.4)));
      this.colorCtx.save();
      this.colorCtx.strokeStyle = 'rgba(27, 19, 16, .72)';
      this.colorCtx.lineWidth = Math.max(.75, this.scale * .05);
      this.colorCtx.lineCap = 'square';
      this.colorCtx.lineJoin = 'miter';
      for (let i = 0; i < crackCount; i++) {
        const angle = (i / crackCount) * Math.PI * 2 + (Math.random() - .5) * .42;
        const length = this.scale * (.32 + Math.random() * .48);
        const startRadius = r * (.99 + Math.random() * .04);
        const segmentCount = 4 + Math.floor(Math.random() * 4);
        let sideways = 0;
        this.colorCtx.beginPath();
        this.colorCtx.moveTo(px + Math.cos(angle) * startRadius, py + Math.sin(angle) * startRadius);
        for (let segment = 1; segment <= segmentCount; segment++) {
          sideways += (Math.random() - .5) * this.scale * .16;
          const distance = startRadius + length * (segment / segmentCount);
          const pointX = px + Math.cos(angle) * distance - Math.sin(angle) * sideways;
          const pointY = py + Math.sin(angle) * distance + Math.cos(angle) * sideways;
          this.colorCtx.lineTo(pointX, pointY);
        }
        this.colorCtx.stroke();
      }
      this.colorCtx.restore();
      this.colorTexture.needsUpdate = true;
    }
    const normalPadding = this.scale * .8 + 4;
    this.updateNormalMap(px - r - normalPadding, py - r - normalPadding, (r + normalPadding) * 2, (r + normalPadding) * 2);
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
    const normalX = Math.sin(angle), normalY = Math.cos(angle);
    const startX = (x - Math.cos(angle) * length / 2) * this.scale;
    const startY = (MAP.height - (y - Math.sin(angle) * length / 2)) * this.scale;
    const endX = (x + Math.cos(angle) * length / 2) * this.scale;
    const endY = (MAP.height - (y + Math.sin(angle) * length / 2)) * this.scale;
    const middleX = (startX + endX) / 2, middleY = (startY + endY) / 2;
    for (const c of [this.ctx, this.colorCtx]) {
      c.save();
      c.globalCompositeOperation = 'source-over';
      c.lineCap = 'square';
      c.lineJoin = 'bevel';
      c.strokeStyle = '#202a31';
      c.lineWidth = .46 * this.scale;
      c.beginPath(); c.moveTo(startX, startY); c.lineTo(endX, endY); c.stroke();

      const steel = c.createLinearGradient(
        middleX + normalX * .17 * this.scale, middleY + normalY * .17 * this.scale,
        middleX - normalX * .17 * this.scale, middleY - normalY * .17 * this.scale
      );
      steel.addColorStop(0, '#d1dadd');
      steel.addColorStop(.28, '#83949d');
      steel.addColorStop(.58, '#aebbc0');
      steel.addColorStop(1, '#485860');
      c.strokeStyle = steel;
      c.lineWidth = .34 * this.scale;
      c.beginPath(); c.moveTo(startX, startY); c.lineTo(endX, endY); c.stroke();

      c.strokeStyle = '#34434a';
      c.lineWidth = .075 * this.scale;
      c.beginPath(); c.moveTo(startX, startY); c.lineTo(endX, endY); c.stroke();

      for (const side of [-1, 1]) {
        const offsetX = normalX * side * .12 * this.scale;
        const offsetY = normalY * side * .12 * this.scale;
        c.strokeStyle = side > 0 ? '#e0e6e6' : '#68777d';
        c.lineWidth = .045 * this.scale;
        c.beginPath();
        c.moveTo(startX + offsetX, startY + offsetY);
        c.lineTo(endX + offsetX, endY + offsetY);
        c.stroke();
        c.strokeStyle = '#27343a';
        c.lineWidth = .015 * this.scale;
        c.beginPath();
        c.moveTo(startX + offsetX - normalX * .025 * this.scale, startY + offsetY - normalY * .025 * this.scale);
        c.lineTo(endX + offsetX - normalX * .025 * this.scale, endY + offsetY - normalY * .025 * this.scale);
        c.stroke();
      }

      for (let t = .1; t < .95; t += .13) {
        const boltX = startX + (endX - startX) * t;
        const boltY = startY + (endY - startY) * t;
        for (const side of [-1, 1]) {
          const bx = boltX + normalX * side * .12 * this.scale;
          const by = boltY + normalY * side * .12 * this.scale;
          c.beginPath(); c.arc(bx, by, .045 * this.scale, 0, Math.PI * 2);
          c.fillStyle = '#28343a'; c.fill();
          c.beginPath(); c.arc(bx - .01 * this.scale, by - .01 * this.scale, .022 * this.scale, 0, Math.PI * 2);
          c.fillStyle = '#e2e8e8'; c.fill();
        }
      }
      c.restore();
    }
    this.texture.needsUpdate = true;
    this.colorTexture.needsUpdate = true;
    const normalPadding = this.scale * .25 + 4;
    this.updateNormalMap(Math.min(startX, endX) - normalPadding, Math.min(startY, endY) - normalPadding, Math.abs(endX - startX) + normalPadding * 2, Math.abs(endY - startY) + normalPadding * 2);
    for (let cy = 0; cy < this.rows; cy++) for (let cx = 0; cx < this.columns; cx++) this.rebuild(cx, cy);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.colorTexture.dispose();
    this.normalTexture.dispose();
    this.blastRimTexture.dispose();
  }
}
