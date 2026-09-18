import * as THREE from 'three';

const MAX_PARTICLE_GLINTS = 12;

export class ExplosionParticles {
  constructor(scene, capacity = 4096) {
    this.capacity = capacity; this.cursor = 0; this.time = 0;
    this.glintData = {
      positions: Array.from({ length: MAX_PARTICLE_GLINTS }, () => new THREE.Vector2()),
      colors: Array.from({ length: MAX_PARTICLE_GLINTS }, () => new THREE.Color()),
      strengths: new Float32Array(MAX_PARTICLE_GLINTS),
      count: 0
    };
    this.geometry = new THREE.BufferGeometry();
    this.origin = new Float32Array(capacity * 3); this.velocity = new Float32Array(capacity * 3); this.birth = new Float32Array(capacity).fill(-100); this.life = new Float32Array(capacity).fill(1); this.kind = new Float32Array(capacity); this.color = new Float32Array(capacity * 3);
    for (const [name, array, size] of [['position',this.origin,3],['velocity',this.velocity,3],['birth',this.birth,1],['life',this.life,1],['kind',this.kind,1],['color',this.color,3]]) this.geometry.setAttribute(name,new THREE.BufferAttribute(array,size).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, uniforms:{ time:{value:0}, pixelRatio:{value:Math.min(devicePixelRatio,2)} }, vertexShader:`attribute vec3 velocity,color;attribute float birth,life,kind;uniform float time,pixelRatio;varying float opacity,type;varying vec3 particleColor;void main(){float t=max(0.,time-birth);opacity=max(0.,1.-t/life);type=kind;particleColor=color;vec3 p=position+velocity*t+vec3(0.,-6.,0.)*t*t;float floorY=position.y-1.5;if(p.y<floorY){p.y=floorY+abs(p.y-floorY)*.25;}gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);gl_PointSize=(kind<.5?7.:5.)*pixelRatio*opacity;}`, fragmentShader:`varying float opacity,type;varying vec3 particleColor;void main(){if(length(gl_PointCoord-.5)>.5||opacity<=0.)discard;vec3 fire=mix(vec3(1.,.2,.04),vec3(1.,.85,.3),opacity);gl_FragColor=vec4(type<.42?fire:particleColor,opacity);}` });
    this.points = new THREE.Points(this.geometry,this.material); this.points.frustumCulled=false; scene.add(this.points);
  }
  emit(x,y,radius,colors=[]) {
    const count = Math.min(220, Math.ceil(radius*50));
    for(let n=0;n<count;n++) { const i=this.cursor;this.cursor=(i+1)%this.capacity; const angle=Math.random()*Math.PI*2,speed=2+Math.random()*radius*4;
      this.origin[i*3]=x;this.origin[i*3+1]=y;this.origin[i*3+2]=.3;this.velocity[i*3]=Math.cos(angle)*speed;this.velocity[i*3+1]=Math.sin(angle)*speed;this.birth[i]=this.time;this.life[i]=.5+Math.random()*1.1;this.kind[i]=Math.random();
      const color=colors.length?colors[Math.floor(Math.random()*colors.length)]:[.42,.30,.21];this.color[i*3]=color[0];this.color[i*3+1]=color[1];this.color[i*3+2]=color[2];
    }
    for(const name in this.geometry.attributes)this.geometry.attributes[name].needsUpdate=true;
  }
  update(time){
    this.time=time;
    this.material.uniforms.time.value=time;

    // Собираем только несколько последних живых частиц для мягких бликов на рельефе.
    // Все частицы по-прежнему рисуются, но не создают отдельные тяжёлые PointLight.
    let count = 0;
    for (let offset = 1; offset <= this.capacity && count < MAX_PARTICLE_GLINTS; offset++) {
      const i = (this.cursor - offset + this.capacity) % this.capacity;
      const age = this.time - this.birth[i];
      if (age <= 0 || age >= this.life[i]) continue;

      const fade = 1 - age / this.life[i];
      if (fade < .06) continue;
      const index = i * 3;
      let x = this.origin[index] + this.velocity[index] * age;
      let y = this.origin[index + 1] + this.velocity[index + 1] * age - 6 * age * age;
      const floorY = this.origin[index + 1] - 1.5;
      if (y < floorY) y = floorY + Math.abs(y - floorY) * .25;

      const isFire = this.kind[i] < .42;
      this.glintData.positions[count].set(x, y);
      this.glintData.colors[count].set(isFire ? '#ff9b4a' : '#e6a35c');
      this.glintData.strengths[count] = (isFire ? 3.0 : 2.2) * fade * fade;
      count++;
    }
    this.glintData.count = count;
    return this.glintData;
  }
  dispose(){this.points.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
