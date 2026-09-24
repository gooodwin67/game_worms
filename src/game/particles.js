import * as THREE from 'three';

const MAX_PARTICLE_GLINTS = 12;

export class ExplosionParticles {
  constructor(scene, capacity = 4096) {
    this.scene = scene; this.capacity = capacity; this.cursor = 0; this.time = 0; this.blasts = [];
    this.blastFlashGeometry = new THREE.CircleGeometry(1, 32);
    this.blastRingGeometry = new THREE.RingGeometry(.79, .845, 32);
    this.glintData = {
      positions: Array.from({ length: MAX_PARTICLE_GLINTS }, () => new THREE.Vector2()),
      colors: Array.from({ length: MAX_PARTICLE_GLINTS }, () => new THREE.Color()),
      strengths: new Float32Array(MAX_PARTICLE_GLINTS),
      count: 0
    };
    this.glintStrengths = new Float32Array(capacity);
    this.geometry = new THREE.BufferGeometry();
    this.origin = new Float32Array(capacity * 3); this.velocity = new Float32Array(capacity * 3); this.birth = new Float32Array(capacity).fill(-100); this.life = new Float32Array(capacity).fill(1); this.kind = new Float32Array(capacity); this.color = new Float32Array(capacity * 3);
    for (const [name, array, size] of [['position',this.origin,3],['velocity',this.velocity,3],['birth',this.birth,1],['life',this.life,1],['kind',this.kind,1],['color',this.color,3]]) this.geometry.setAttribute(name,new THREE.BufferAttribute(array,size).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, uniforms:{ time:{value:0}, pixelRatio:{value:Math.min(devicePixelRatio,2)} }, vertexShader:`attribute vec3 velocity,color;attribute float birth,life,kind;uniform float time,pixelRatio;varying float opacity,type;varying vec3 particleColor;void main(){float t=max(0.,time-birth);opacity=max(0.,1.-t/life);type=kind;particleColor=color;vec3 p=position+velocity*t;if(kind>.75){float sway=sin(time*2.4+birth*3.1+position.y*2.7)*.12;p+=vec3(sway*t,.28*t*t,0.);}else{p+=vec3(0.,-6.,0.)*t*t;float floorY=position.y-1.5;if(p.y<floorY)p.y=floorY+abs(p.y-floorY)*.25;}gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);gl_PointSize=(kind>.75?21.:kind<.5?8.:5.)*pixelRatio*(.72+.28*opacity);}`, fragmentShader:`uniform float time;varying float opacity,type;varying vec3 particleColor;void main(){vec2 point=gl_PointCoord*2.-1.;float d=length(point);if(d>1.||opacity<=0.)discard;if(type>.75){float cloud=.5+.5*sin(point.x*5.3+point.y*4.1+time*1.7);float edge=1.-smoothstep(.08,1.,d);vec3 smoke=mix(vec3(.16,.2,.22),vec3(.38,.43,.42),cloud);gl_FragColor=vec4(smoke,edge*opacity*.68*(.78+.22*cloud));return;}vec3 fire=mix(vec3(1.,.2,.04),vec3(1.,.85,.3),opacity);gl_FragColor=vec4(type<.42?fire:particleColor,opacity);}` });
    this.points = new THREE.Points(this.geometry,this.material); this.points.frustumCulled=false; scene.add(this.points);
  }
  emit(x,y,radius,colors=[],options={}) {
    const count = Math.min(220, Math.ceil(radius*50));
    const smokeCount = radius >= .65 ? Math.min(110, Math.ceil(radius * 28)) : 0;
    const glintStrength = options.glintStrength ?? (radius >= 1.5 ? 1 : .025);
    for(let n=0;n<count;n++) { const i=this.cursor;this.cursor=(i+1)%this.capacity; const smoke=n<smokeCount,angle=Math.random()*Math.PI*2;
      this.glintStrengths[i]=glintStrength;
      if(smoke){const speed=.15+Math.random()*.62;this.origin[i*3]=x+(Math.random()-.5)*radius*.46;this.origin[i*3+1]=y+(Math.random()-.5)*radius*.28;this.origin[i*3+2]=.31;this.velocity[i*3]=Math.cos(angle)*speed;this.velocity[i*3+1]=.35+Math.random()*1.05;this.birth[i]=this.time;this.life[i]=1.8+Math.random()*1.5;this.kind[i]=.9;this.color[i*3]=.2+Math.random()*.12;this.color[i*3+1]=.24+Math.random()*.13;this.color[i*3+2]=.25+Math.random()*.13;}
      else{const speed=2+Math.random()*radius*4;this.origin[i*3]=x;this.origin[i*3+1]=y;this.origin[i*3+2]=.3;this.velocity[i*3]=Math.cos(angle)*speed;this.velocity[i*3+1]=Math.sin(angle)*speed;this.birth[i]=this.time;this.life[i]=.5+Math.random()*1.1;this.kind[i]=Math.random()*.72;const color=colors.length?colors[Math.floor(Math.random()*colors.length)]:[.42,.30,.21];this.color[i*3]=color[0];this.color[i*3+1]=color[1];this.color[i*3+2]=color[2];}
    }
    if(radius>=1.5){const flash=new THREE.Mesh(this.blastFlashGeometry,new THREE.MeshBasicMaterial({color:0xff9d32,transparent:true,opacity:.5,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending}));const ring=new THREE.Mesh(this.blastRingGeometry,new THREE.MeshBasicMaterial({color:0xffc15a,transparent:true,opacity:.65,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));flash.position.set(x,y,.42);ring.position.set(x,y,.41);flash.renderOrder=17;ring.renderOrder=18;this.scene.add(flash,ring);this.blasts.push({flash,ring,x,y,radius,birth:this.time,life:.24});}
    for(const name in this.geometry.attributes)this.geometry.attributes[name].needsUpdate=true;
  }
  update(time){
    this.time=time;
    this.material.uniforms.time.value=time;

    for(let i=this.blasts.length-1;i>=0;i--){const blast=this.blasts[i],age=time-blast.birth,progress=THREE.MathUtils.clamp(age/blast.life,0,1);if(progress>=1){blast.flash.removeFromParent();blast.ring.removeFromParent();blast.flash.material.dispose();blast.ring.material.dispose();this.blasts.splice(i,1);continue;}const fade=1-progress;blast.flash.scale.setScalar(blast.radius*(.28+progress*1.05));blast.flash.material.opacity=.5*fade*fade;blast.ring.scale.setScalar(blast.radius*(.18+progress*1.55));blast.ring.material.opacity=.65*fade;}

    // Собираем только несколько последних живых частиц для мягких бликов на рельефе.
    // Все частицы по-прежнему рисуются, но не создают отдельные тяжёлые PointLight.
    let count = 0;
    for (let offset = 1; offset <= this.capacity && count < MAX_PARTICLE_GLINTS; offset++) {
      const i = (this.cursor - offset + this.capacity) % this.capacity;
      const life = this.life[i];
      if (this.glintStrengths[i] <= 0 || !Number.isFinite(life) || life <= 0) continue;
      const age = this.time - this.birth[i];
      if (!Number.isFinite(age) || age <= 0 || age >= life) continue;

      const fade = 1 - age / life;
      if (fade < .06) continue;
      const index = i * 3;
      let x = this.origin[index] + this.velocity[index] * age;
      let y = this.origin[index + 1] + this.velocity[index + 1] * age - 6 * age * age;
      const floorY = this.origin[index + 1] - 1.5;
      if (y < floorY) y = floorY + Math.abs(y - floorY) * .25;

      const isFire = this.kind[i] < .42;
      this.glintData.positions[count].set(x, y);
      this.glintData.colors[count].set(isFire ? '#ff9b4a' : '#e6a35c');
      this.glintData.strengths[count] = (isFire ? 3.0 : 2.2) * fade * fade * this.glintStrengths[i];
      count++;
    }
    this.glintData.count = count;
    return this.glintData;
  }
  dispose(){for(const blast of this.blasts){blast.flash.removeFromParent();blast.ring.removeFromParent();blast.flash.material.dispose();blast.ring.material.dispose();}this.blasts.length=0;this.points.removeFromParent();this.geometry.dispose();this.material.dispose();this.blastFlashGeometry.dispose();this.blastRingGeometry.dispose();}
}
