import * as THREE from 'three';
export class ExplosionParticles {
  constructor(scene, capacity = 4096) {
    this.capacity = capacity; this.cursor = 0; this.time = 0;
    this.geometry = new THREE.BufferGeometry();
    this.origin = new Float32Array(capacity * 3); this.velocity = new Float32Array(capacity * 3); this.birth = new Float32Array(capacity).fill(-100); this.life = new Float32Array(capacity).fill(1); this.kind = new Float32Array(capacity);
    for (const [name, array, size] of [['position',this.origin,3],['velocity',this.velocity,3],['birth',this.birth,1],['life',this.life,1],['kind',this.kind,1]]) this.geometry.setAttribute(name,new THREE.BufferAttribute(array,size).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, uniforms:{ time:{value:0}, pixelRatio:{value:Math.min(devicePixelRatio,2)} }, vertexShader:`attribute vec3 velocity;attribute float birth,life,kind;uniform float time,pixelRatio;varying float opacity,type;void main(){float t=max(0.,time-birth);opacity=max(0.,1.-t/life);type=kind;vec3 p=position+velocity*t+vec3(0.,-6.,0.)*t*t;float floorY=position.y-1.5;if(p.y<floorY){p.y=floorY+abs(p.y-floorY)*.25;}gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);gl_PointSize=(kind<.5?7.:4.)*pixelRatio*opacity;}`, fragmentShader:`varying float opacity,type;void main(){if(length(gl_PointCoord-.5)>.5||opacity<=0.)discard;gl_FragColor=vec4(type<.5?mix(vec3(1.,.2,.04),vec3(1.,.85,.3),opacity):vec3(.37,.49,.33),opacity);}` });
    this.points = new THREE.Points(this.geometry,this.material); this.points.frustumCulled=false; scene.add(this.points);
  }
  emit(x,y,radius) {
    const count = Math.min(220, Math.ceil(radius*50));
    for(let n=0;n<count;n++) { const i=this.cursor;this.cursor=(i+1)%this.capacity; const angle=Math.random()*Math.PI*2,speed=2+Math.random()*radius*4;
      this.origin[i*3]=x;this.origin[i*3+1]=y;this.origin[i*3+2]=.3;this.velocity[i*3]=Math.cos(angle)*speed;this.velocity[i*3+1]=Math.sin(angle)*speed;this.birth[i]=this.time;this.life[i]=.5+Math.random()*1.1;this.kind[i]=Math.random();
    }
    for(const name in this.geometry.attributes)this.geometry.attributes[name].needsUpdate=true;
  }
  update(time){this.time=time;this.material.uniforms.time.value=time;}
  dispose(){this.points.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
