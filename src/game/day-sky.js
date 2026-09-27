import * as THREE from 'three';

const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Reversing a transition starts from the current appearance, without a jump.
export class SkyCycle {
  constructor() {
    this.value = 0;
    this.target = 0;
    this.from = 0;
    this.elapsed = 0;
    this.duration = 0;
  }

  setMode(mode) {
    const target = mode === 'day' ? 1 : 0;
    if (target === this.target) return;
    this.from = this.value;
    this.target = target;
    this.elapsed = 0;
    this.duration = Math.max(.25, Math.abs(target - this.value) * 6);
  }

  update(dt) {
    if (this.value === this.target) return this.value;
    this.elapsed = Math.min(this.duration, this.elapsed + Math.max(0, dt));
    if (this.elapsed >= this.duration) {
      this.value = this.target;
      return this.value;
    }
    const t = smooth(0, this.duration, this.elapsed);
    this.value = this.from + (this.target - this.from) * t;
    return this.value;
  }
}

export function skyAppearance(day) {
  const moonTravel = smooth(0, .65, day);
  const sunTravel = smooth(.22, 1, day);
  return {
    nightVisibility: 1 - smooth(.04, .6, day),
    moonVisibility: 1 - smooth(.32, .68, day),
    moonX: .72 + .12 * moonTravel,
    moonY: .86 - 1.02 * moonTravel,
    sunX: .52 + .2 * sunTravel,
    sunY: -.12 + .96 * sunTravel,
    sunVisibility: smooth(.22, .65, day)
  };
}

// Five distant silhouettes, four wing segments each. Animation never adds
// objects or textures and does not run expensive bird calculations per pixel.
export class DayBirds extends THREE.LineSegments {
  constructor() {
    const geometry = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(new Float32Array(5 * 4 * 2 * 3), 3);
    positions.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positions);
    super(geometry, new THREE.LineBasicMaterial({
      color: 0x284857, transparent: true, opacity: 0, depthTest: false, depthWrite: false
    }));
    this.elapsed = 0;
    this.visible = false;
    this.frustumCulled = false;
    this.renderOrder = .7;
  }

  update(dt, day, aspect) {
    if (day <= .1) {
      this.elapsed = 0;
      this.visible = false;
      return;
    }
    this.elapsed += dt;
    const phase = this.elapsed % 29;
    this.visible = phase > 3 && phase < 19;
    if (!this.visible) return;
    const progress = (phase - 3) / 16;
    const flock = Math.floor(this.elapsed / 29);
    const direction = flock % 2 === 0 ? 1 : -1;
    const centerX = direction > 0 ? -.12 + progress * 1.24 : 1.12 - progress * 1.24;
    const centerY = .64 + .06 * Math.sin(progress * Math.PI * 1.4 + flock * 1.7);
    this.material.opacity = .5 * smooth(.15, .8, day)
      * smooth(0, .08, progress) * (1 - smooth(.92, 1, progress));
    const attribute = this.geometry.getAttribute('position');
    const positions = attribute.array;
    const safeAspect = Math.max(.1, aspect);
    let cursor = 0;
    for (let bird = 0; bird < 5; bird++) {
      const size = .0045 + (bird % 3) * .0008;
      const x = centerX - direction * bird * .019 / safeAspect;
      const y = centerY + (bird % 2 ? 1 : -1) * bird * .006;
      const wing = Math.sin(this.elapsed * 6.5 + bird * 1.3);
      const vertices = [
        [-1.3, .15 + wing * .72], [-.63, .3 + wing * .25], [0, 0],
        [.63, .3 + wing * .25], [1.3, .15 + wing * .72]
      ];
      for (let edge = 0; edge < 4; edge++) {
        for (const index of [edge, edge + 1]) {
          positions[cursor++] = (x + vertices[index][0] * size / safeAspect) * 2 - 1;
          positions[cursor++] = (y + vertices[index][1] * size) * 2 - 1;
          positions[cursor++] = .07;
        }
      }
    }
    attribute.needsUpdate = true;
  }
}

// Inserted after the night shader's noise/fbm helpers. Colors stay cooler and
// softer than the terrain and characters, even in the brightest cloud patches.
export const DAY_SKY_GLSL = `
  vec3 daySky(vec2 uv) {
    float aspect = uResolution.x / max(uResolution.y, 1.);
    vec3 color = mix(vec3(.43, .60, .66), vec3(.13, .31, .47), smoothstep(.05, 1., uv.y));
    float haze = exp(-pow((uv.y - .22) * 4.2, 2.));
    color += vec3(.065, .052, .02) * haze;

    vec2 sunDelta = vec2((uv.x - uSunCenter.x) * aspect, uv.y - uSunCenter.y);
    float sunDistance = length(sunDelta);
    float sunDisk = 1. - smoothstep(.032, .034, sunDistance);
    float sunHalo = exp(-sunDistance * sunDistance / .010);
    float breathing = .98 + .02 * sin(uTime * .45);
    color += vec3(.18, .12, .035) * sunHalo * uSunVisibility * breathing;
    vec3 sunColor = mix(vec3(.98, .73, .38), vec3(1., .91, .65), smoothstep(.1, .65, uSunCenter.y));
    color = mix(color, sunColor, sunDisk * uSunVisibility);

    // A broad moving cloud bank with smaller billows drifting at another speed.
    vec2 cloudUv = vec2(uv.x * aspect, uv.y);
    vec2 drift = vec2(-uTime * .011, sin(uTime * .035) * .018);
    float lowClouds = fbm(cloudUv * vec2(2.2, 5.3) + drift);
    float highClouds = fbm(cloudUv * vec2(3.6, 8.2) + drift * .55 + vec2(8.4, 2.1));
    float banks = smoothstep(.44, .67, lowClouds);
    float wisps = smoothstep(.51, .73, highClouds);
    float cloudMask = smoothstep(.15, .36, uv.y) * (1. - smoothstep(.88, 1., uv.y));
    float cloudAlpha = clamp((banks * .7 + wisps * .25) * cloudMask * uCloudStrength * .62, 0., .78);
    vec3 cloudColor = mix(vec3(.45, .57, .63), vec3(.78, .83, .82), smoothstep(.43, .73, lowClouds));
    color = mix(color, cloudColor, cloudAlpha);

    vec2 edge = uv * (1. - uv.yx);
    float vignette = pow(clamp(edge.x * edge.y * 18., 0., 1.), .2);
    color *= mix(.82, 1., vignette);
    color *= pow(max(uBrightness, .01) / .4, .6);
    return mix(vec3(.003, .008, .016), color, uEnabled);
  }
`;
