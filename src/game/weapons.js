import RAPIER from '@dimforge/rapier2d-compat';
import { GRAVITY } from './core.js';
export { Weapons, ARSENAL } from './arsenal.js';
export class Bot {
  constructor(game){this.g=game;this.ray=new RAPIER.Ray({x:0,y:0},{x:1,y:0});this.reset();}
  reset(){this.elapsed=0;this.planned=false;this.power=.5;}
  update(dt){
    const g=this.g,t=g.turn,level=g.teams[t.team]?.bot;if(!level||!g.active?.alive)return;
    this.elapsed+=dt;
    if(t.state==='WAITING_INPUT'&&this.elapsed>1&&!this.planned){
      const w=g.active;let target=null,best=Infinity;
      for(const other of g.worms)if(other.alive&&other.team!==w.team){const score=Math.hypot(other.x-w.x,other.y-w.y)+other.hp*.12;if(score<best){best=score;target=other;}}
      if(!target)return;
      const dx=target.x-w.x,dy=target.y-w.y;
      const wind=level==='hard'?g.wind:level==='medium'?g.wind*.5:0;
      let vx=0,vy=0,found=false;
      // Exact constant-acceleration solution for each candidate flight time; muzzle offset included.
      for(let time=1.1;time<=5;time+=.08){
        vx=(dx-.5*wind*time*time)/time;vy=(dy-.5*GRAVITY*time*time)/time;
        for(let j=0;j<4;j++){const a=Math.atan2(vy,vx);vx=(dx-Math.cos(a)*1.05-.5*wind*time*time)/time;vy=(dy-Math.sin(a)*1.05-.5*GRAVITY*time*time)/time;}
        const speed=Math.hypot(vx,vy);if(speed<8||speed>32)continue;
        this.ray.origin.x=w.x;this.ray.origin.y=w.y;this.ray.dir.x=vx/speed;this.ray.dir.y=vy/speed;
        if(g.world.castRay(this.ray,3,true,undefined,undefined,w.collider,w.body))continue;
        g.angle=Math.atan2(vy,vx);this.power=(speed-8)/24;found=true;break;
      }
      if(!found){t.shots=0;t.settle();return;}
      if(level==='easy'){g.angle+=(Math.random()-.5)*1.1;this.power*=.6+Math.random()*.8;}
      else if(level==='medium'){g.angle+=(Math.random()-.5)*.24;this.power*=.87+Math.random()*.26;}
      this.power=Math.max(0,Math.min(1,this.power));
      this.ray.dir.x=Math.cos(g.angle);this.ray.dir.y=Math.sin(g.angle);
      if(g.world.castRay(this.ray,2,true,undefined,undefined,w.collider,w.body)){t.shots=0;t.settle();return;}
      this.planned=true;t.beginCharge();
    }
    if(t.state==='CHARGING_SHOT'&&t.charge>=this.power)t.release();
  }
}

