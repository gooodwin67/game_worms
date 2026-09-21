import * as THREE from 'three';
import { MAP } from './core.js';

const SPRING_SPACING = .16;
const TENSION = .013;
const DAMPING = .04;
const SPREAD = .095;
const PROPAGATION_ITERATIONS = 4;
const AMBIENT_WAVE_AMPLITUDE = .11;
const WATER_SIDE_OVERHANG = 24;

class Spring {
  constructor(x, surfaceY) {
    this.x = x;
    this.height = surfaceY;
    this.velocity = 0;
  }
}

export class Water {
  constructor(scene, bottomY, surfaceY) {
    this.scene = scene;
    this.bottomY = bottomY;
    this.surfaceY = surfaceY;
    this.time = 0;
    this.bubbles = [];
    this.maxBubbles = 300;
    this.springs = [];
    this.splashCursor = 0;
    this.startX = -WATER_SIDE_OVERHANG;
    this.width = MAP.width + WATER_SIDE_OVERHANG * 2;

    const springCount = Math.ceil(this.width / SPRING_SPACING) + 1;
    for (let i = 0; i < springCount; i++) {
      this.springs.push(new Spring(this.startX + i / (springCount - 1) * this.width, surfaceY));
    }
    this.propagationDeltas = new Float32Array(springCount);

    const vertices = new Float32Array(springCount * 2 * 3);
    const indices = [];
    for (let i = 0; i < springCount - 1; i++) {
      const top = i * 2;
      const bottom = top + 1;
      indices.push(top, bottom, top + 2, top + 2, bottom, bottom + 2);
    }

    this.bodyGeometry = new THREE.BufferGeometry();
    this.bodyGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage));
    this.bodyGeometry.setIndex(indices);
    this.bodyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBottomY: { value: bottomY },
        uSurfaceY: { value: surfaceY },
        uDeepColor: { value: new THREE.Color('#126b91') },
        uShallowColor: { value: new THREE.Color('#35a8c7') }
      },
      vertexShader: `
        varying float vWorldY;
        varying vec2 vWorldPosition;
        void main() {
          vWorldY = position.y;
          vWorldPosition = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uBottomY;
        uniform float uSurfaceY;
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;
        varying float vWorldY;
        varying vec2 vWorldPosition;

        float softBlob(vec2 point, vec2 center, vec2 size) {
          vec2 normalizedPoint = (point - center) / size;
          return exp(-dot(normalizedPoint, normalizedPoint) * 1.65);
        }

        void main() {
          float depth = clamp((vWorldY - uBottomY) / max(uSurfaceY - uBottomY, .001), 0.0, 1.0);
          vec3 color = mix(uDeepColor, uShallowColor, pow(depth, .7));
          float driftA = sin(uTime * .17);
          float driftB = cos(uTime * .13);
          float driftC = sin(uTime * .11 + 2.4);
          float x = vWorldPosition.x;
          float darkPatches = 0.0;
          darkPatches += softBlob(vWorldPosition, vec2(${MAP.width * .18} + driftA * 1.4, uBottomY + 1.0 + driftB * .35), vec2(8.0, 1.7));
          darkPatches += softBlob(vWorldPosition, vec2(${MAP.width * .51} + driftB * 1.8, uBottomY + 1.6 + driftC * .55), vec2(10.0, 2.0));
          darkPatches += softBlob(vWorldPosition, vec2(${MAP.width * .82} + driftC * 1.3, uBottomY + 2.1 + driftA * .45), vec2(7.0, 1.5));
          darkPatches += softBlob(vWorldPosition, vec2(${MAP.width * .36} + driftC * 2.0, uBottomY + 4.0 + driftB * .3), vec2(11.0, 1.8));
          float surfaceProtection = 1.0 - smoothstep(.70, 1.0, depth);
          color *= 1.0 - clamp(darkPatches, 0.0, 1.15) * surfaceProtection * .14;
          float deepPulse = .5 + .5 * sin(x * .18 - uTime * .12 + vWorldY * .45);
          color += vec3(.025, .055, .065) * deepPulse * (1.0 - depth);
          gl_FragColor = vec4(color, .88);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.bodyMesh = new THREE.Mesh(this.bodyGeometry, this.bodyMaterial);
    this.bodyMesh.position.z = .28;
    this.bodyMesh.frustumCulled = false;
    scene.add(this.bodyMesh);

    const rimVertices = new Float32Array(springCount * 2 * 3);
    this.surfaceGeometry = new THREE.BufferGeometry();
    this.surfaceGeometry.setAttribute('position', new THREE.BufferAttribute(rimVertices, 3).setUsage(THREE.DynamicDrawUsage));
    this.surfaceGeometry.setIndex(indices);
    this.surfaceMaterial = new THREE.MeshBasicMaterial({
      color: 0x49b2ce,
      transparent: true,
      opacity: .56,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.surfaceMesh = new THREE.Mesh(this.surfaceGeometry, this.surfaceMaterial);
    this.surfaceMesh.position.z = .5;
    this.surfaceMesh.frustumCulled = false;
    scene.add(this.surfaceMesh);

    this.createSeaweed();

    this.bubbleGeometry = new THREE.CircleGeometry(.055, 8);
    this.bubbleMaterial = new THREE.MeshBasicMaterial({ color: 0xd8f6ff, transparent: true, opacity: .62, depthWrite: false });
    for (let i = 0; i < 20; i++) this.addBubble(Math.random() * MAP.width, THREE.MathUtils.randFloat(bottomY + .35, surfaceY - .4));

    this.splashGeometry = new THREE.CircleGeometry(.09, 7);
    this.splashParticles = Array.from({ length: 256 }, () => {
      const material = new THREE.MeshBasicMaterial({ color: 0xb8efff, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(this.splashGeometry, material);
      mesh.visible = false;
      mesh.position.z = .62;
      scene.add(mesh);
      return { mesh, material, active: false, age: 0, life: 0, velocityX: 0, velocityY: 0 };
    });
    this.updateGeometry();
  }

  get visible() { return this.bodyMesh.visible; }
  set visible(value) { this.bodyMesh.visible = value; this.surfaceMesh.visible = value; }

  addBubble(x, y) {
    if (this.bubbles.length >= this.maxBubbles || y >= this.surfaceY - .15) return;
    const mesh = new THREE.Mesh(this.bubbleGeometry, this.bubbleMaterial);
    const scale = .65 + Math.random() * 1.1;
    mesh.scale.set(scale, scale, 1);
    mesh.position.set(x, y, .72);
    this.scene.add(mesh);
    this.bubbles.push({ mesh, baseX: x, speedY: .9 + Math.random() * 1.3, wobbleSpeed: 2 + Math.random() * 3, wobbleSize: .05 + Math.random() * .08, phase: Math.random() * Math.PI * 2 });
  }

  emitBubbles(x, y, count = 2) {
    const surfaceY = this.getHeightAt(x);
    for (let i = 0; i < count; i++) {
      this.addBubble(
        x + THREE.MathUtils.randFloat(-.24, .24),
        Math.min(y + THREE.MathUtils.randFloat(-.12, .16), surfaceY - .18)
      );
    }
  }

  createSeaweed() {
    const bladeCount = Math.max(48, Math.floor(MAP.width / 1.15));
    const segmentCount = 7;
    const verticesPerBlade = (segmentCount + 1) * 2;
    const positions = new Float32Array(bladeCount * verticesPerBlade * 3);
    const colors = new Float32Array(bladeCount * verticesPerBlade * 3);
    const indices = [];
    const greens = ['#17604f', '#145447', '#1b7160', '#205d46'];
    this.seaweedBlades = Array.from({ length: bladeCount }, (_, bladeIndex) => {
      const color = new THREE.Color(greens[Math.floor(Math.random() * greens.length)]);
      const descriptor = {
        baseX: Math.random() * MAP.width,
        height: Math.min(THREE.MathUtils.randFloat(6.4, 15), Math.max(1, (this.surfaceY - this.bottomY) * .86)),
        width: THREE.MathUtils.randFloat(.2, .38),
        phase: Math.random() * Math.PI * 2,
        sway: THREE.MathUtils.randFloat(.28, .62),
        color
      };
      const firstVertex = bladeIndex * verticesPerBlade;
      for (let segment = 0; segment < segmentCount; segment++) {
        const leftBottom = firstVertex + segment * 2;
        const rightBottom = leftBottom + 1;
        const leftTop = leftBottom + 2;
        const rightTop = leftBottom + 3;
        indices.push(leftBottom, rightBottom, leftTop, rightBottom, rightTop, leftTop);
      }
      for (let vertex = 0; vertex < verticesPerBlade; vertex++) {
        const offset = (firstVertex + vertex) * 3;
        colors[offset] = color.r;
        colors[offset + 1] = color.g;
        colors[offset + 2] = color.b;
      }
      return descriptor;
    });

    this.seaweedGeometry = new THREE.BufferGeometry();
    this.seaweedGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.seaweedGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.seaweedGeometry.setIndex(indices);
    this.seaweedMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: .88,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.seaweedMesh = new THREE.Mesh(this.seaweedGeometry, this.seaweedMaterial);
    this.seaweedMesh.position.z = .36;
    this.seaweedMesh.frustumCulled = false;
    this.scene.add(this.seaweedMesh);
    this.updateSeaweed();
  }

  updateSeaweed() {
    const positions = this.seaweedGeometry.attributes.position;
    const segmentCount = 7;
    const verticesPerBlade = 16;
    for (let bladeIndex = 0; bladeIndex < this.seaweedBlades.length; bladeIndex++) {
      const blade = this.seaweedBlades[bladeIndex];
      const firstVertex = bladeIndex * verticesPerBlade;
      for (let segment = 0; segment <= segmentCount; segment++) {
        const progress = segment / segmentCount;
        const sway = Math.sin(this.time * 1.05 + blade.phase + progress * 2.1) * blade.sway * progress * progress
          + Math.sin(this.time * .52 + blade.phase * 1.7 + progress * 3) * blade.sway * .28 * progress;
        const centerX = blade.baseX + sway;
        const halfWidth = blade.width * (1 - progress * .72) * .5;
        const y = this.bottomY + progress * blade.height;
        const vertex = firstVertex + segment * 2;
        positions.setXYZ(vertex, centerX - halfWidth, y, 0);
        positions.setXYZ(vertex + 1, centerX + halfWidth, y, 0);
      }
    }
    positions.needsUpdate = true;
  }

  emitSplash(x, impact) {
    const surfaceY = this.getHeightAt(x);
    for (let i = 0; i < 96; i++) {
      const particle = this.splashParticles[this.splashCursor];
      this.splashCursor = (this.splashCursor + 1) % this.splashParticles.length;
      particle.active = true;
      particle.age = 0;
      particle.life = THREE.MathUtils.randFloat(.8, 1.2);
      const angle = THREE.MathUtils.randFloat(THREE.MathUtils.degToRad(12), THREE.MathUtils.degToRad(168));
      const speed = THREE.MathUtils.randFloat(6.5, 11.5) + impact * .45;
      particle.velocityX = Math.cos(angle) * speed;
      particle.velocityY = Math.sin(angle) * speed * .7;
      particle.mesh.position.set(x + THREE.MathUtils.randFloat(-.08, .08), surfaceY + .04, 0.62);
      particle.mesh.rotation.z = angle - Math.PI / 2;
      particle.mesh.scale.set(THREE.MathUtils.randFloat(.9, 1.8), THREE.MathUtils.randFloat(1.2, 2.4), 1);
      particle.material.opacity = .85;
      particle.mesh.visible = true;
    }
    this.emitSplashBubbles(x, 72);
  }

  emitSplashBubbles(x, count) {
    while (this.bubbles.length + count > this.maxBubbles) {
      const oldest = this.bubbles.shift();
      if (!oldest) break;
      this.scene.remove(oldest.mesh);
    }
    this.emitBubbles(x, this.getHeightAt(x) - .45, count);
  }

  updateSplashParticles(dt) {
    for (const particle of this.splashParticles) {
      if (!particle.active) continue;
      particle.age += dt;
      if (particle.age >= particle.life) {
        particle.active = false;
        particle.mesh.visible = false;
        continue;
      }
      const fade = 1 - particle.age / particle.life;
      particle.velocityY -= 8 * dt;
      particle.mesh.position.x += particle.velocityX * dt;
      particle.mesh.position.y += particle.velocityY * dt;
      particle.mesh.scale.y = .8 + Math.max(0, particle.velocityY) * .16;
      particle.material.opacity = fade * .85;
      if (particle.mesh.position.y < this.getHeightAt(particle.mesh.position.x) - .04) {
        particle.active = false;
        particle.mesh.visible = false;
      }
    }
  }

  getAmbientHeight(spring) {
    const wave = Math.sin(spring.x * .55 + this.time * .85) * .55
      + Math.sin(spring.x * 1.15 - this.time * .48 + 1.7) * .28
      + Math.sin(spring.x * 2.35 + this.time * .31 + 4.2) * .17;
    return this.surfaceY + wave * AMBIENT_WAVE_AMPLITUDE;
  }

  setSurfaceY(surfaceY) {
    const delta = surfaceY - this.surfaceY;
    if (Math.abs(delta) < 1e-6) return;
    this.surfaceY = surfaceY;
    for (const spring of this.springs) spring.height += delta;
    this.bodyMaterial.uniforms.uSurfaceY.value = surfaceY;
  }

  splashAt(x, impactVelocity = 1, radius = 2) {
    const safeRadius = Math.max(.1, radius);
    const impact = Math.min(Math.abs(impactVelocity), 2.8);
    for (const spring of this.springs) {
      const distance = Math.abs(spring.x - x);
      if (distance > safeRadius) continue;
      const normalized = distance / safeRadius;
      const influence = Math.cos(normalized * Math.PI * .5);
      spring.velocity -= impact * influence * .16;
      if (normalized > .25 && normalized < .85) spring.velocity += impact * influence * .045;
    }
    this.emitSplash(x, impact);
  }

  updateGeometry() {
    const bodyPositions = this.bodyGeometry.attributes.position;
    const surfacePositions = this.surfaceGeometry.attributes.position;
    for (let i = 0; i < this.springs.length; i++) {
      const spring = this.springs[i];
      const top = i * 2;
      bodyPositions.setXYZ(top, spring.x, spring.height, 0);
      bodyPositions.setXYZ(top + 1, spring.x, this.bottomY, 0);
      surfacePositions.setXYZ(top, spring.x, spring.height + .055, 0);
      surfacePositions.setXYZ(top + 1, spring.x, spring.height - .055, 0);
    }
    bodyPositions.needsUpdate = true;
    surfacePositions.needsUpdate = true;
  }

  update(dt, surfaceY = this.surfaceY) {
    this.setSurfaceY(surfaceY);
    this.time += dt;
    this.bodyMaterial.uniforms.uTime.value = this.time;
    for (const spring of this.springs) {
      const ambientHeight = this.getAmbientHeight(spring);
      const displacement = spring.height - ambientHeight;
      const acceleration = -TENSION * displacement - DAMPING * spring.velocity;
      spring.velocity += acceleration + (ambientHeight - spring.height) * .0018;
      spring.height += spring.velocity;
    }
    for (let iteration = 0; iteration < PROPAGATION_ITERATIONS; iteration++) {
      const deltas = this.propagationDeltas;
      deltas.fill(0);
      for (let i = 0; i < this.springs.length; i++) {
        const spring = this.springs[i];
        if (i > 0) deltas[i - 1] += SPREAD * (spring.height - this.springs[i - 1].height);
        if (i < this.springs.length - 1) deltas[i + 1] += SPREAD * (spring.height - this.springs[i + 1].height);
      }
      for (let i = 0; i < this.springs.length; i++) {
        this.springs[i].velocity += deltas[i];
        this.springs[i].height += deltas[i];
      }
    }
    this.updateGeometry();
    this.updateSeaweed();
    this.updateSplashParticles(dt);

    if (Math.random() < dt * 4) this.addBubble(Math.random() * MAP.width, this.bottomY + Math.random() * 1.2);
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const bubble = this.bubbles[i];
      bubble.mesh.position.y += bubble.speedY * dt;
      bubble.mesh.position.x = bubble.baseX + Math.sin(this.time * bubble.wobbleSpeed + bubble.phase) * bubble.wobbleSize;
      if (bubble.mesh.position.y >= this.getHeightAt(bubble.mesh.position.x) - .08) {
        this.scene.remove(bubble.mesh);
        this.bubbles.splice(i, 1);
      }
    }
  }

  getHeightAt(x) {
    const position = THREE.MathUtils.clamp((x - this.startX) / this.width, 0, 1) * (this.springs.length - 1);
    const left = Math.floor(position);
    const right = Math.min(left + 1, this.springs.length - 1);
    return THREE.MathUtils.lerp(this.springs[left].height, this.springs[right].height, position - left);
  }

  dispose() {
    this.bodyMesh.removeFromParent();
    this.surfaceMesh.removeFromParent();
    this.seaweedMesh.removeFromParent();
    for (const bubble of this.bubbles) bubble.mesh.removeFromParent();
    for (const particle of this.splashParticles) {
      particle.mesh.removeFromParent();
      particle.material.dispose();
    }
    this.bodyGeometry.dispose();
    this.bodyMaterial.dispose();
    this.surfaceGeometry.dispose();
    this.surfaceMaterial.dispose();
    this.seaweedGeometry.dispose();
    this.seaweedMaterial.dispose();
    this.bubbleGeometry.dispose();
    this.bubbleMaterial.dispose();
    this.splashGeometry.dispose();
    this.bubbles.length = 0;
  }
}
