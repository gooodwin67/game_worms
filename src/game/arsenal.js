import * as THREE from 'three';
import RAPIER from '@dimforge/rapier2d-compat';
import { MAP, GRAVITY, TURN } from './core.js';

const MAX_FIRE_GLINTS = 12;

export const ARSENAL = Object.freeze({
  bazooka:'Базука', homing:'Самонаводящаяся ракета', mortar:'Миномёт', pigeon:'Почтовый голубь', sheepLauncher:'Овцемёт', drill:'Бурение',
  grenade:'Граната', cluster:'Осколочная граната', banana:'Банано-бомба', battleAxe:'Боевой топор', earthquake:'Землетрясение',
  shotgun:'Дробовик ×2', handgun:'Пистолет', uzi:'Узи', minigun:'Пулемёт', longbow:'Лук',
  firePunch:'Огненный удар', dragonBall:'Шар дракона', kamikaze:'Камикадзе', suicideBomber:'Суицидальная бомба', prod:'Тычок',
  dynamite:'Динамит', mine:'Мина', sheep:'Овечка', superSheep:'Супер-овца', moleBomb:'Крото-бомба',
  airstrike:'Авиаудар', napalm:'Удар напалмом', mailstrike:'Почтовый удар', minestrike:'Минный удар', moleSquadron:'Эскадрон кротов',
  blowTorch:'Паяльная лампа', pneumaticDrill:'Отбойный молоток', girder:'Балка', baseballBat:'Бейсбольная бита', girderPack:'Набор балок',
  ninjaRope:'Верёвка ниндзя', bungee:'Банджи', parachute:'Парашют', teleport:'Телепортация', scales:'Весы правосудия',
  superBanana:'Супер банано-бомба', holy:'Святая ручная граната', flamethrower:'Огнемёт', salvation:'Армия Спасения', mbBomb:'Бомба МБ',
  petrol:'Коктейль Молотова', skunk:'Скунс', mingVase:'Ваза Мин', frenchSheep:'Удар французских овец', carpet:'Ковровая бомбардировка',
  madCows:'Бешеные коровы', oldWoman:'Старушка', donkey:'Бетонный осёл', indianTest:'Индийское ядерное испытание', armageddon:'Армагеддон',
  skipGo:'Пропуск хода', surrender:'Капитуляция', selectWorm:'Выбор червя', freeze:'Заморозка', magicBullet:'Волшебная пуля Простака',
  jetPack:'Реактивный ранец', lowGravity:'Низкая гравитация', fastWalk:'Быстрая ходьба', laserSight:'Лазерный прицел', invisibility:'Невидимость',
});
export const UNLIMITED_WEAPONS = new Set(['bazooka', 'grenade', 'firePunch', 'prod']);
const COLORS = {bazooka:0xffd166,homing:0xff7799,pigeon:0xffffff,magicBullet:0x8b5cf6,mortar:0x94a3b8,grenade:0x70bd65,cluster:0xf5a742,fragment:0xffde99,dynamite:0xf04444,mine:0xf1b33c,sheep:0xffffff,moleBomb:0x8b5e3c,bomb:0x879cb5,napalm:0xf97316};
const TARGET_WEAPONS = new Set(['homing','pigeon','magicBullet','airstrike','napalm','mailstrike','minestrike','moleSquadron','donkey','mbBomb','frenchSheep','carpet','girder','girderPack']);
const GUN_WEAPONS = new Set(['handgun','uzi','minigun','longbow']);
const THROWN_GRENADES = new Set(['grenade','cluster','banana','superBanana','holy']);
const GROUND_PROJECTILES = new Set(['bazooka','homing','pigeon','magicBullet','mortar','bomb','petrol','mbBomb','donkey','napalm','flameShot','mailstrike','carpet','armageddon','frenchSheep']);
export class Weapons {
  constructor(game) {
    this.g=game;this.fuse=3;this.bounce=.7;this.burst=null;this.cowCount=1;this.flame=null;this.kamikaze=null;this.earthquake=null;this.projectile=null;this.retreat=0;this.drilling=0;this.drillTick=0;this.drillDirection=0;this.movementMode=null;this.jetPackFuel=100;this.hazards=[];this.message='';
    this.ray=new RAPIER.Ray({x:0,y:0},{x:1,y:0});this.velocity={x:0,y:0};this.target={x:48,y:20};this.targetSet=false;
    this.visualBullets=[];this.bulletGeometry=new THREE.CircleGeometry(.075,10);this.bulletMaterial=new THREE.MeshBasicMaterial({color:0xffe08a,transparent:true,depthWrite:false});
    this.byCollider=new Map();this.pool=[];this.geometry=new THREE.PlaneGeometry(1,1);
    for(let i=0;i<160;i++){const mesh=new THREE.Mesh(this.geometry,new THREE.MeshBasicMaterial({transparent:true,alphaTest:.08,depthWrite:false,side:THREE.DoubleSide}));mesh.visible=false;game.scene.add(mesh);this.pool.push({active:false,mesh,baseMesh:mesh,rocketMesh:null});}
    this.fireParticles=this.createFireParticleSystem(256);
    this.fireGlintData={
      positions:Array.from({length:MAX_FIRE_GLINTS},()=>new THREE.Vector2()),
      colors:Array.from({length:MAX_FIRE_GLINTS},()=>new THREE.Color('#ff6a1a')),
      strengths:new Float32Array(MAX_FIRE_GLINTS),
      count:0
    };
    this.tether=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:0xe6cf9b}));this.tether.frustumCulled=false;this.tether.visible=false;game.scene.add(this.tether);
    this.marker=new THREE.Group();
    const markerMaterial=new THREE.MeshBasicMaterial({color:0xff6688,transparent:true,opacity:.95,depthWrite:false,side:THREE.DoubleSide});
    const markerCoreMaterial=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide});
    this.marker.add(
      new THREE.Mesh(new THREE.RingGeometry(.48,.55,32),markerMaterial),
      new THREE.Mesh(new THREE.PlaneGeometry(.9,.035),markerMaterial),
      new THREE.Mesh(new THREE.PlaneGeometry(.035,.9),markerMaterial),
      new THREE.Mesh(new THREE.CircleGeometry(.065,16),markerCoreMaterial)
    );
    this.marker.visible=false;game.scene.add(this.marker);
    this.onCollision=(a,b,started)=>{if(!started)return;const p=this.byCollider.get(a),q=this.byCollider.get(b);if(p?.type==='fragment'&&q?.type==='fragment')return;if(p&&p.type!=='flameShot'&&!(p.ignoreOwner&&this.g.wormByCollider.get(b)===p.ignoreOwner))p.hit=true;if(q&&q.type!=='flameShot'&&!(q.ignoreOwner&&this.g.wormByCollider.get(a)===q.ignoreOwner))q.hit=true;};
  }
  resetTarget(){this.targetSet=false;this.marker.visible=false;this.message='';}
  setTarget(x,y){this.target.x=THREE.MathUtils.clamp(x,.7,MAP.width-.7);this.target.y=THREE.MathUtils.clamp(y,.8,MAP.height-1);this.targetSet=true;this.marker.position.set(this.target.x,this.target.y,.5);this.marker.visible=true;this.message='Цель выбрана';}
  createFireParticleSystem(maxParticles){
    const geometry=new THREE.BufferGeometry();
    const positions=new Float32Array(maxParticles*3),colors=new Float32Array(maxParticles*4),sizes=new Float32Array(maxParticles),lifes=new Float32Array(maxParticles);
    const vertexShader=`attribute float aSize;attribute float aLife;varying float vLife;varying vec4 vColor;void main(){vLife=aLife;vColor=color;vec4 mvPosition=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mvPosition;gl_PointSize=aSize;}`;
    const fragmentShader=`uniform float uTime;varying float vLife;varying vec4 vColor;void main(){vec2 p=gl_PointCoord*2.0-1.0;float d=length(p);if(d>1.0)discard;float edge=smoothstep(1.0,.05,d);float flicker=.88+.12*sin(uTime*9.0+vLife*31.0);float core=1.0-smoothstep(.05,.65,d);vec3 color=mix(vColor.rgb,vec3(1.0,.88,.42),core*.72);gl_FragColor=vec4(color,vColor.a*edge*flicker);}`;
    const material=new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms:{uTime:{value:0}},vertexColors:true,transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending});
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,4));geometry.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));geometry.setAttribute('aLife',new THREE.BufferAttribute(lifes,1));
    const mesh=new THREE.Points(geometry,material);mesh.frustumCulled=false;this.g.scene.add(mesh);
    const particles=Array.from({length:maxParticles},(_,index)=>({index,active:false,life:0,maxLife:0,x:0,y:0,vx:0,vy:0,size:0,seed:Math.random()}));
    return {maxParticles,geometry,material,mesh,positions,colors,sizes,lifes,particles,next:0};
  }
  needsCharge(type){return ['bazooka','homing','grenade','cluster','banana','superBanana','holy','petrol'].includes(type);}
  usesTarget(type){return TARGET_WEAPONS.has(type)||type==='teleport';}
  spawn(type,x,y,vx,vy,remaining=3){
    const p=this.pool.find(item=>!item.active);if(!p)return null;
    const radius=(type==='sheep'||type==='superSheep'||type==='pigeon') ? .38 : type==='fragment' ? .12 : .23;
    const body=this.g.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x,y).setLinearDamping(type==='dynamite'?8:0).setCcdEnabled(true));
    if(type==='flameShot')body.setGravityScale(0,true);
    if(type==='napalm')body.setGravityScale(1.35,true);
    const bounce=(type==='grenade'||type==='cluster'||type==='banana'||type==='superBanana') ? Math.min(this.bounce, .28) : type==='holy' ? .2 : type==='fragment' ? .15 : 0;
    const colliderDescription=RAPIER.ColliderDesc.ball(radius).setMass(.4).setRestitution(bounce).setFriction(.05).setSensor(type==='flameShot').setActiveEvents(type==='flameShot'?0:RAPIER.ActiveEvents.COLLISION_EVENTS);
    // Мина срабатывает по радиусу, а не от физического контакта с бойцом.
    // Поэтому она должна лежать под ним спокойно и не выталкивать его сразу
    // после установки; с землёй при этом столкновение сохраняется.
    if(type==='dynamite')colliderDescription.setCollisionGroups(0x00100001);
    if(type==='mine')colliderDescription.setCollisionGroups(0x00200001);
    const collider=this.g.world.createCollider(colliderDescription,body);
    if(this.dropping){vx=this.g.active.body.linvel().x;vy=this.g.active.body.linvel().y;}
    this.velocity.x=vx;this.velocity.y=vy;body.setLinvel(this.velocity,true);
    if(['bazooka','mailstrike','mbBomb'].includes(type))body.addForce({x:this.g.wind*body.mass(),y:0},true);
    Object.assign(p,{active:true,body,collider,type,remaining,age:0,x,y,hit:false,restingTime:0,triggered:false,owner:this.g.active,ownerClear:false,dir:this.g.active?.facing||1,targetX:this.target.x,targetY:this.target.y,gas:false,stage:'walking',heading:Math.PI/2,damageOverride:null,radiusOverride:null,remoteFragment:false,tick:0,bounces:0,delay:0,flameStartX:x,flameStartY:y,flameVx:vx,flameInitialVy:vy,flameDrop:0,flameDistance:5.33,flameWobbleAmp:.45+Math.random()*.25,flameWobbleFreq:10+Math.random()*5,flameWobblePhase:Math.random()*Math.PI*2,flameWobblePhase2:Math.random()*Math.PI*2,napalmPhase:Math.random()*Math.PI*2});
    this.g.weaponArt.projectile(p,type,radius);p.mesh.position.set(x,y,.2);p.mesh.visible=true;
    this.byCollider.set(collider.handle,p);return p;
  }
  remove(p,preserveSmoke=false){this.byCollider.delete(p.collider.handle);this.g.world.removeRigidBody(p.body);p.active=false;if(p.rocketMesh){if(preserveSmoke)this.g.weaponArt.detachRocketSmoke(p);else this.g.weaponArt.hideRocket(p);}p.mesh.visible=false;}
  showBullet(x1,y1,x2,y2){
    const mesh=new THREE.Mesh(this.bulletGeometry,this.bulletMaterial);mesh.position.set(x1,y1,.35);this.g.scene.add(mesh);
    const distance=Math.hypot(x2-x1,y2-y1);this.visualBullets.push({mesh,x1,y1,x2,y2,age:0,duration:THREE.MathUtils.clamp(distance/42,.045,.18)});
  }
  moveGroundedWorms(dx,dy){
    if(!dx&&!dy)return;
    for(const worm of this.g.worms){
      if(!worm.alive||!worm.grounded)continue;
      const position=worm.body.translation();
      worm.body.setTranslation({x:position.x+dx,y:position.y+dy},true);
      worm.x+=dx;worm.y+=dy;worm.previousX+=dx;worm.previousY+=dy;
    }
  }
  busy(){if(this.drilling>0||this.retreat>0||this.movementMode||this.burst||this.flame||this.kamikaze||this.earthquake||this.hazards.some(h=>h.kind==='fire'))return true;for(const p of this.pool)if(p.active&&(p.type!=='mine'||p.triggered||p.age<1.5||Math.hypot(p.body.linvel().x,p.body.linvel().y)>.2))return true;return false;}
  remote(){
    const owned=this.pool.filter(p=>p.active&&p.owner===this.g.active);
    const fragments=owned.filter(p=>p.remoteFragment);
    if(fragments.length){for(const p of fragments)p.remaining=0;return true;}
    for(const p of owned){
      if(p.type==='superSheep'&&p.stage==='walking'){p.stage='flying';p.heading=Math.PI/2;p.hit=false;p.body.setGravityScale(0,true);return true;}
      if(p.type==='moleBomb'&&p.stage==='walking'){p.stage='burrowing';p.body.setLinvel({x:p.dir*3,y:6},true);p.hit=false;return true;}
      if(p.type==='skunk'&&!p.gas){p.gas=true;return true;}
      if(['sheep','superSheep','sheepLauncher','superBanana','moleBomb','salvation','skunk'].includes(p.type)){p.remaining=0;return true;}
    }
    if(this.movementMode){this.endUtility();return true;}
    return false;
  }
  continueTurn(){this.g.turn.charge=0;this.g.turn.state=TURN.WAITING_INPUT;}
  beginUtility(mode,duration=45){if(mode==='jetPack')this.jetPackFuel=100;this.movementMode={mode,remaining:duration,owner:this.g.active,airborne:false};this.continueTurn();}
  createFireHazard(x,y,radius,damage,duration=6,surfaceY=null,density=1,spread=1){
    // Любой источник огня использует одну и ту же точку ближайшей поверхности:
    // бутылка, напалм, авиаудар, ящик и огнемёт не имеют отдельных правил.
    const hazard={kind:'fire',x,y,radius,damage,remaining:duration,duration,tick:0,tickInterval:1,age:0,smokeRemaining:0,groundDamageIndex:0,particleSlots:[]};
    const system=this.fireParticles;
    const particleCount=Math.min(72,Math.max(8,Math.round(radius*5*density)));
    for(let i=0;i<particleCount;i++){
      let p=null;for(let attempt=0;attempt<system.maxParticles;attempt++){const candidate=system.particles[system.next];system.next=(system.next+1)%system.maxParticles;if(!candidate.active){p=candidate;break;}}
      if(!p)break;
      hazard.particleSlots.push(p);p.active=true;p.grounded=false;p.supportCheck=0;p.smokeStarted=false;p.smokeAge=0;p.renderY=y;p.life=duration;p.maxLife=duration;p.x=x+(Math.random()-.5)*radius*1.4*spread;p.y=y+.15+Math.random()*.25*spread;p.vx=(Math.random()-.5)*radius*.22*spread;p.vy=-2.2;p.size=7+Math.random()*10+radius*1.5;p.seed=Math.random()*10;
    }
    this.hazards.push(hazard);return hazard;
  }
  detonateSupplyCrates(x,y,radius){
    const g=this.g;if(!g.supplyCrates?.length||g.supplyCrateChainReaction)return;
    const targets=g.supplyCrates.filter(crate=>Math.hypot(crate.x-x,crate.y-y)<=radius+1.05);if(!targets.length)return;
    g.supplyCrateChainReaction=true;
    try{for(const crate of targets){const index=g.supplyCrates.indexOf(crate);if(index<0)continue;const cx=crate.x,cy=crate.y;crate.dispose();g.supplyCrates.splice(index,1);this.createFireHazard(cx,cy,2.5,12,6);this.explode(cx,cy,1.8,30);}}finally{g.supplyCrateChainReaction=false;}
  }
  endUtility(finish=false){
    const drilling=this.drilling>0;this.drilling=0;this.movementMode=null;this.tether.visible=false;this.message='';
    if(!this.g.turn)return;
    if(finish||drilling||this.g.turn.remaining<=0||!this.g.active?.alive){this.g.turn.shots=0;this.g.turn.settle();}
    else if(this.g.turn.state===TURN.WAITING_INPUT||this.g.turn.state===TURN.CHARGING_SHOT)this.continueTurn();
  }
  dropWeapon(){
    if(!this.movementMode||this.g.turn.state!==TURN.WAITING_INPUT)return;
    const type=this.g.turn.weapon;
    if(!['grenade','cluster','banana','superBanana','holy','petrol','dynamite','mine','sheep','superSheep','mingVase','moleBomb','skunk','salvation','oldWoman'].includes(type)){this.message='Выберите бросаемое оружие; Enter — сбросить';return;}
    this.g.turn.state=TURN.ACTION_RESOLVING;
    this.dropping=true;let fired;try{fired=this.fire(type,0);}finally{this.dropping=false;}
    if(fired===false){this.continueTurn();return;}
    for(const worm of this.g.teams[this.g.turn.team].worms)worm.invisible=false;
    if(this.movementMode){this.movementMode.remaining=Math.min(this.movementMode.remaining,3);this.movementMode.retreat=true;}
  }
  updateMovement(dt){
    const g=this.g,m=this.movementMode;if(!m)return;
    const w=m.owner;
    if(!w.alive||w!==g.active||g.turn.remaining<=0){this.endUtility(true);return;}
    const x=(g.keys.has('KeyD')||g.keys.has('ArrowRight')?1:0)-(g.keys.has('KeyA')||g.keys.has('ArrowLeft')?1:0);
    const y=(g.keys.has('KeyW')||g.keys.has('ArrowUp')?1:0)-(g.keys.has('KeyS')||g.keys.has('ArrowDown')?1:0);
    const v=w.body.linvel(),pos=w.body.translation();
    if(!w.grounded)m.airborne=true;
    if(m.mode==='jetPack'){
      if(x||y>0||m.retreat){m.remaining-=dt*4;this.jetPackFuel=THREE.MathUtils.clamp(m.remaining/30*100,0,100);}
      w.body.setLinvel({x:THREE.MathUtils.clamp(v.x+x*18*dt,-7,7),y:THREE.MathUtils.clamp(v.y+Math.max(0,y)*24*dt,-9,8)},true);
      if(x||y>0)g.particles.emit(pos.x-w.facing*.45,pos.y-.7,.12);
      this.message='WASD/стрелки — тяга · пробел — снять · Enter — сбросить оружие';
    }else if(m.mode==='parachute'){
      if(v.y<0)w.body.setLinvel({x:THREE.MathUtils.clamp(v.x+(x*5+g.wind)*dt,-5,5),y:Math.max(v.y,-(y<0?3:y>0?1:1.6))},true);
      if(m.airborne&&w.grounded){this.endUtility();return;}
      m.remaining-=dt;
    }else if(m.mode==='rope'||m.mode==='bungee'){
      if(m.mode==='bungee'&&!m.airborne){m.anchor={x:pos.x,y:pos.y};return;}
      m.length=THREE.MathUtils.clamp(m.length-y*5*dt,1.5,35);
      const dx=pos.x-m.anchor.x,dy=pos.y-m.anchor.y,d=Math.max(.01,Math.hypot(dx,dy)),nx=dx/d,ny=dy/d;
      const outward=Math.max(0,v.x*nx+v.y*ny),stretch=Math.max(0,d-m.length);
      const pull=stretch*(m.mode==='bungee'?35:100)+outward*(d>=m.length?10:0);
      w.body.applyImpulse({x:(x*8-nx*pull)*dt*w.body.mass(),y:-ny*pull*dt*w.body.mass()},true);
      const positions=this.tether.geometry.attributes.position;positions.setXYZ(0,m.anchor.x,m.anchor.y,.3);positions.setXYZ(1,pos.x,pos.y,.3);positions.needsUpdate=true;this.tether.visible=true;
      m.remaining-=dt;
    }else m.remaining-=dt;
    if(m.remaining<=0)this.endUtility(g.turn.state!==TURN.WAITING_INPUT);
  }
  fire(type,charge) {
    const g=this.g,w=g.active,dx=Math.cos(g.angle),dy=Math.sin(g.angle),baseSpeed=8+charge*24,speed=baseSpeed*(THROWN_GRENADES.has(type)?1.2:1);
    this.message='';
    if(!Object.hasOwn(ARSENAL,type)&&type!=='uppercut'){this.message='Неизвестное оружие';return false;}
    let freeSlots=0;for(const item of this.pool)if(!item.active)freeSlots++;
    const transientCount=type==='frenchSheep'?5:type==='madCows'?this.cowCount:type==='carpet'?8:type==='armageddon'?12:type==='airstrike'?5:type==='napalm'||type==='mailstrike'||type==='minestrike'?6:type==='moleSquadron'?4:1;
    const noProjectile=new Set(['teleport','flamethrower','skipGo','surrender','selectWorm','freeze','scales','lowGravity','fastWalk','laserSight','invisibility','firePunch','battleAxe','baseballBat','prod','kamikaze','suicideBomber','earthquake','drill','pneumaticDrill','blowTorch','girder','girderPack','ninjaRope','bungee','parachute','jetPack','uppercut','shotgun','handgun','uzi','minigun','longbow','indianTest']);
    if(!noProjectile.has(type)&&freeSlots<transientCount&&type!=='teleport'&&type!=='blowTorch'&&type!=='pneumaticDrill'&&type!=='drill'&&type!=='uppercut'&&type!=='shotgun'){
      this.message='На карте недостаточно свободных слотов для этого оружия';return false;
    }
    if(this.usesTarget(type)&&!this.targetSet){this.message='Укажите цель на карте';return false;}
    if(this.usesTarget(type))this.resetTarget();
    if(type==='teleport'){
      if(g.world.intersectionWithShape(this.target,0,w.collider.shape,undefined,undefined,w.collider,w.body)){this.message='Для телепорта нужно свободное место';return false;}
      g.particles.emit(w.x,w.y,.7);w.body.setTranslation(this.target,true);w.body.setLinvel({x:0,y:0},true);
      w.x=w.previousX=this.target.x;w.y=w.previousY=this.target.y;w.vx=w.vy=0;w.grounded=false;
      g.particles.emit(w.x,w.y,.7);this.resetTarget();g.turn.settle();return true;
    }
    if(type==='flamethrower'){this.flame={owner:w,remaining:2,tick:0};return true;}
    if(type==='salvation'||type==='skunk'||type==='oldWoman'||type==='moleBomb'){this.spawn(type,w.x+w.facing,w.y+.2,w.facing*2,0,type==='moleBomb'?20:5);return true;}
    if(type==='skipGo'){this.endUtility();g.turn.shots=0;g.turn.settle();return true;}
    if(type==='surrender'){g.teams[w.team].surrendered=true;g.turn.shots=0;g.turn.settle();return true;}
    if(type==='selectWorm'){
      const team=g.teams[w.team],current=team.worms.indexOf(w);let next=current;
      do next=(next+1)%team.worms.length;while(next!==current&&!team.worms[next].alive);
      if(team.worms[next].alive){g.active=team.worms[next];g.turn.cursors[w.team]=next;g.angle=g.active.facing<0?Math.PI*.75:Math.PI*.25;}
      this.endUtility();this.continueTurn();return true;
    }
    if(type==='freeze'){this.endUtility();for(const worm of g.worms)if(worm.alive&&worm.team===w.team){worm.frozen=true;worm.body.setLinvel({x:0,y:0},true);}g.turn.settle();return true;}
    if(type==='scales'){
      const teams=g.teams.map(t=>t.worms.filter(worm=>worm.alive)).filter(t=>t.length);
      const total=teams.flat().reduce((sum,worm)=>sum+worm.hp,0),share=Math.floor(total/teams.length);let extra=total%teams.length;
      for(const team of teams){const budget=share+(extra-->0?1:0),old=team.reduce((sum,worm)=>sum+worm.hp,0);let left=budget;
        team.forEach((worm,i)=>{const hp=i===team.length-1?left:Math.floor(budget*worm.hp/old);left-=hp;worm.hp=hp;worm.health.max=Math.max(100,hp);worm.health.value=hp;worm.health.title=`${hp} HP`;if(hp===0)g.damage(worm,0,true);});}
      g.turn.settle();return true;
    }
    if(type==='lowGravity'){g.lowGravity=true;g.world.gravity={x:0,y:GRAVITY*.5};g.returnToBazooka=true;this.continueTurn();return true;}
    if(type==='fastWalk'){for(const worm of g.teams[w.team].worms)worm.speedBoost=true;g.returnToBazooka=true;this.continueTurn();return true;}
    if(type==='laserSight'){for(const worm of g.teams[w.team].worms)worm.laserSight=true;g.returnToBazooka=true;this.continueTurn();return true;}
    if(type==='invisibility'){for(const worm of g.worms)if(worm.alive&&worm.team===w.team)worm.invisible=true;g.turn.shots=0;g.turn.settle();return true;}
    if(type==='dragonBall'){this.spawn('dragonBall',w.x+w.facing,w.y,w.facing*12,0,.25);g.turn.settle();return true;}
    if(type==='firePunch'||type==='battleAxe'||type==='baseballBat'||type==='prod'){
      for(const other of g.worms)if(other.alive&&other!==w){const x=other.x-w.x,y=other.y-w.y;if(x*w.facing>=-.3&&Math.hypot(x,y)<2.8){if(type!=='prod')g.damage(other,type==='battleAxe'?Math.max(1,Math.floor(other.hp/2)):30);if(other.alive&&!other.frozen)other.body.applyImpulse(type==='battleAxe'?{x:0,y:-2}:type==='baseballBat'?{x:dx*10,y:dy*10}:type==='prod'?{x:w.facing*1.2,y:.15}:{x:w.facing*4,y:6},true);}}
      if(type==='firePunch'){g.createExplosion(w.x+w.facing*1.1,w.y,.7);w.body.applyImpulse({x:w.facing*1.5,y:4},true);}g.turn.settle();return true;
    }
    if(type==='kamikaze'){this.kamikaze={owner:w,dx,dy,remaining:.7,victims:new Set()};return true;}
    if(type==='suicideBomber'){for(const other of g.worms)if(other.alive&&!other.frozen&&other!==w&&Math.hypot(other.x-w.x,other.y-w.y)<4)other.poison=Math.max(other.poison||0,5);this.explode(w.x,w.y,2.5,30);g.damage(w,w.hp,true);g.turn.settle();return true;}
    if(type==='earthquake'){this.earthquake={remaining:4,tick:0,offsetTime:0};return true;}
    if(type==='drill'||type==='pneumaticDrill'||type==='blowTorch'){this.drilling=2.2;this.drillTick=0;this.drillDirection=type==='blowTorch'?w.facing:0;this.drillVictims=new Set();this.beginUtility(type==='blowTorch'?'blowTorch':'drill',2.2);g.turn.state=TURN.ACTION_RESOLVING;return true;}
    if(type==='girder'||type==='girderPack'){
      const length=3.5,shape=new RAPIER.Cuboid(length/2,.2),a=g.angle;
      if(Math.abs(Math.cos(a))*length/2+Math.abs(Math.sin(a))*.2>Math.min(this.target.x,MAP.width-this.target.x)||Math.abs(Math.sin(a))*length/2+.2>Math.min(this.target.y,MAP.height-this.target.y)||g.world.intersectionWithShape(this.target,a,shape)){this.message='Балка должна целиком помещаться в свободном месте';return false;}
      g.terrain.createGirder(this.target.x,this.target.y,a,length);this.resetTarget();
      if(type==='girderPack'){this.girderStock=(this.girderStock??5)-1;if(this.girderStock>0){g.turn.lockedWeapon=type;this.continueTurn();return true;}}
      g.turn.settle();return true;
    }
    if(type==='ninjaRope'){
      this.ray.origin={x:w.x,y:w.y};this.ray.dir={x:dx,y:dy};
      const hit=g.world.castRay(this.ray,35,true,undefined,undefined,w.collider,w.body,c=>!g.wormByCollider.has(c.handle)&&!this.byCollider.has(c.handle));
      if(!hit){this.message='Верёвка не достаёт до поверхности';return false;}
      this.beginUtility('rope');Object.assign(this.movementMode,{anchor:{x:w.x+dx*hit.timeOfImpact,y:w.y+dy*hit.timeOfImpact},length:Math.max(1.5,hit.timeOfImpact)});return true;
    }
    if(type==='bungee'){this.beginUtility('bungee');Object.assign(this.movementMode,{anchor:{x:w.x,y:w.y},length:4});return true;}
    if(type==='parachute'){this.beginUtility('parachute');return true;}
    if(type==='jetPack'){this.beginUtility('jetPack',30);return true;}
    if(type==='uppercut'){
      for(const other of g.worms)if(other.alive&&other!==w){const x=other.x-w.x,y=other.y-w.y;if(x*w.facing>=-.3&&Math.hypot(x,y)<2.8){g.damage(other,35);if(other.alive&&!other.frozen)other.body.applyImpulse({x:w.facing*4,y:9},true);}}
      g.particles.emit(w.x+w.facing,w.y+1,1);g.turn.settle();return true;
    }
    if(type==='shotgun'){g.turn.lockedWeapon=type;this.shotgun();g.turn.shots--;g.turn.settle();return true;}
    if(GUN_WEAPONS.has(type)){if(type==='longbow'){g.turn.lockedWeapon=type;this.fireGun(type);g.turn.shots--;g.turn.settle();}else this.burst={type,left:type==='handgun'?6:type==='uzi'?10:20,tick:0,owner:w};return true;}
    if(type==='mortar'){
      const mortarSpeed=20;
      const mortarVy=Math.max(dy*mortarSpeed,4.5);
      const mortar=this.spawn('mortar',w.x+dx*1.1,w.y+Math.max(.15,dy*.25),dx*mortarSpeed,mortarVy,12);
      if(mortar)mortar.ignoreOwner=w;
      return true;
    }
    if(type==='dynamite'||type==='mine'||type==='sheep'||type==='superSheep'){
      const projectileSpeed=type==='sheep'||type==='superSheep'?5:type==='dynamite'?0:1;
      const projectileY=type==='sheep'||type==='superSheep'?2:0;
      const fuse=type==='mine'?Infinity:type==='sheep'||type==='superSheep'?20:5;
      this.spawn(type,w.x+w.facing*.9,w.y+.2,w.facing*projectileSpeed,projectileY,fuse);
      this.retreat=type==='mine'||type==='dynamite'?2:0;
      this.message=type==='sheep'||type==='superSheep'?'Пробел / ЛКМ — взорвать овечку':'Можно отойти: A/D, W';return true;
    }
    if(type==='sheepLauncher'){this.spawn('sheepLauncher',w.x+dx,w.y+dy,dx*32,dy*32,20);this.retreat=0;this.message='Пробел / ЛКМ — взорвать овечку';return true;}
    if(['airstrike','napalm','mailstrike','minestrike','moleSquadron'].includes(type)){const dropType=type==='airstrike'?'bazooka':type==='minestrike'?'mine':type==='moleSquadron'?'moleBomb':type==='napalm'?'napalm':type==='mailstrike'?'mailstrike':'bomb';const drops=type==='moleSquadron'?4:type==='airstrike'?5:6;for(let i=0;i<drops;i++)this.spawn(dropType,THREE.MathUtils.clamp(this.target.x+(i-(drops-1)/2)*2.6,1,MAP.width-1),MAP.height+3+i*1.4,type==='napalm'?0:w.facing*3,type==='napalm'?-1.5:-9,type==='minestrike'?Infinity:12);this.resetTarget();return true;}
    if(type==='madCows'){for(let i=0;i<this.cowCount;i++){const p=this.spawn('madCow',w.x+w.facing,w.y+.2,0,0,20);p.delay=i*.6;p.body.setEnabled(false);p.mesh.visible=false;}return true;}
    if(type==='frenchSheep'){for(let i=0;i<5;i++)this.spawn('frenchSheep',THREE.MathUtils.clamp(this.target.x+(i-2)*1.8,1,MAP.width-1),MAP.height+3+i,w.facing*2,-9,20);this.resetTarget();return true;}
    if(type==='carpet'||type==='armageddon'){const count=type==='carpet'?8:12;for(let i=0;i<count;i++)this.spawn(type,THREE.MathUtils.clamp(type==='armageddon'?Math.random()*MAP.width:this.target.x+(i-(count-1)/2)*2.2,1,MAP.width-1),MAP.height+3+i*.7,1,-10,12);this.resetTarget();return true;}
    if(type==='indianTest'){g.waterLevel=(g.waterLevel||0)+3;g.water.visible=true;for(const worm of g.worms)if(worm.alive&&!worm.frozen)worm.radiation=Math.max(worm.radiation||0,5);this.resetTarget();g.turn.settle();return true;}
    if(type==='donkey'||type==='mbBomb'){this.spawn(type,this.target.x,MAP.height+5,0,-8,12);this.resetTarget();return true;}
    if(type==='banana'||type==='superBanana'||type==='holy'||type==='petrol'){
      const launchSpeed=type==='oldWoman'?2:speed,launchY=type==='oldWoman'?0:dy*launchSpeed;
      this.spawn(type,w.x+dx,w.y+dy,dx*launchSpeed,launchY,type==='holy'?3:type==='superBanana'?20:this.fuse);this.retreat=2;this.message='Можно отойти: A/D, W';return true;
    }
    if(type==='mingVase'){this.spawn(type,w.x+w.facing*.9,w.y+.2,w.facing,0,5);this.retreat=3;return true;}
    this.ray.origin.x=w.x;this.ray.origin.y=w.y;this.ray.dir.x=dx;this.ray.dir.y=dy;
    const obstruction=g.world.castRay(this.ray,1.15,true,undefined,undefined,w.collider,w.body);
    const offset=obstruction?Math.max(.65,obstruction.timeOfImpact-.24):1.05;
    this.spawn(type,w.x+dx*offset,w.y+dy*offset,dx*speed,dy*speed,type==='grenade'||type==='cluster'?this.fuse:12);
    return true;
  }
  updateFireParticles(dt){
    const system=this.fireParticles,positions=system.positions,colors=system.colors,sizes=system.sizes,lifes=system.lifes;
    const friction=Math.pow(.35,dt);
    const terrain=this.g.terrain;
    system.material.uniforms.uTime.value+=dt;
    for(const hazard of this.hazards)if(hazard.kind==='fire'){
      if(hazard.remaining<=0){if(hazard.smokeRemaining<=0)hazard.smokeRemaining=1.5;hazard.smokeRemaining-=dt;}
      for(const p of hazard.particleSlots){
      if(!p.active)continue;
      if(hazard.remaining<=0&&hazard.smokeRemaining<=0){p.active=false;continue;}
      if(!p.grounded){
        const previousY=p.y;
        p.vy+=GRAVITY*dt;p.vx*=friction;p.x+=p.vx*dt;p.y+=p.vy*dt;
        if(terrain){
          let impactY=null;
          if(p.vy<=0){
            for(let probe=previousY;probe>=p.y;probe-=.04)if(terrain.isSolid(p.x,probe)){impactY=probe;break;}
          }
          if(impactY==null&&terrain.isSolid(p.x,p.y))impactY=p.y;
          if(impactY!=null){
            let surfaceY=impactY;
            for(let lift=0;lift<=3&&terrain.isSolid(p.x,surfaceY);lift+=.04)surfaceY+=.04;
            if(!terrain.isSolid(p.x,surfaceY)){p.y=surfaceY+.015;p.vy=0;p.vx*=.18;p.grounded=true;}
          }
        }
      }
      const index=p.index,ratio=THREE.MathUtils.clamp(hazard.remaining/hazard.duration,0,1),extinguishFade=hazard.remaining<=0?THREE.MathUtils.clamp(hazard.smokeRemaining/1.5,0,1):1,smoke=p.grounded&&hazard.remaining<=0&&extinguishFade<.62,smokeRatio=THREE.MathUtils.clamp(hazard.smokeRemaining/1.5,0,1),phase=system.material.uniforms.uTime.value*6+p.seed,orbitX=p.grounded&&!smoke?Math.cos(phase)*.12:0,orbitY=p.grounded&&!smoke?Math.sin(phase)*.12:0,smokeSway=smoke?Math.sin(system.material.uniforms.uTime.value*3.2+p.seed)*.18:0;
      if(smoke&&!p.smokeStarted){p.smokeStarted=true;p.smokeAge=0;p.smokeBaseY=p.renderY??p.y;}
      if(smoke)p.smokeAge+=dt;
      const smokeRise=smoke?p.smokeAge*.85:0;
      const renderY=smoke?p.smokeBaseY+smokeRise:p.y+orbitY;
      if(!smoke)p.renderY=renderY;else p.renderY=renderY;
      positions[index*3]=p.x+orbitX+smokeSway;positions[index*3+1]=renderY;positions[index*3+2]=.42;
      const airborneFade=hazard.remaining<=0?THREE.MathUtils.clamp(hazard.smokeRemaining/1.5,0,1):1;
      colors[index*4]=smoke?.18:1;colors[index*4+1]=smoke?.18:.18+.72*ratio;colors[index*4+2]=smoke?.2:.02;colors[index*4+3]=smoke?smokeRatio*.55:.82*extinguishFade;sizes[index]=p.size*(smoke?1.8:1);lifes[index]=smoke?smokeRatio:extinguishFade;
      }
    }
    const fireCandidates=[];
    for(const hazard of this.hazards)if(hazard.kind==='fire')for(const p of hazard.particleSlots){
      if(!p.active||p.smokeStarted)continue;
      const fade=hazard.remaining>0?1:THREE.MathUtils.clamp(hazard.smokeRemaining/1.5,0,1);
      if(fade>0)fireCandidates.push({p,fade});
    }
    const glintCount=Math.min(MAX_FIRE_GLINTS,fireCandidates.length);
    for(let i=0;i<glintCount;i++){
      // Берём частицы равномерно по всей зоне огня, а не только первые слоты.
      const candidate=fireCandidates[Math.floor(i*fireCandidates.length/glintCount)];
      const { p, fade }=candidate;
      const flicker=.78+.22*Math.sin(system.material.uniforms.uTime.value*8+p.seed*4.7);
      this.fireGlintData.positions[i].set(p.x,p.renderY??p.y);
      this.fireGlintData.colors[i].set('#ff6418');
      this.fireGlintData.strengths[i]=1.2*fade*flicker;
    }
    this.fireGlintData.count=glintCount;
    for(let i=0;i<system.maxParticles;i++)if(!system.particles[i].active){sizes[i]=0;lifes[i]=0;colors[i*4+3]=0;}
    system.geometry.attributes.position.needsUpdate=true;system.geometry.attributes.color.needsUpdate=true;system.geometry.attributes.aSize.needsUpdate=true;system.geometry.attributes.aLife.needsUpdate=true;
  }
  getFireLightData(){return this.fireGlintData;}
  update(dt) {
    const g=this.g;g.events.drainCollisionEvents(this.onCollision);g.weaponArt.updateDetachedSmoke(dt);this.retreat=Math.max(0,this.retreat-dt);this.projectile=null;
    for(let i=this.visualBullets.length-1;i>=0;i--){const bullet=this.visualBullets[i];bullet.age+=dt;const t=Math.min(1,bullet.age/bullet.duration);bullet.mesh.position.set(THREE.MathUtils.lerp(bullet.x1,bullet.x2,t),THREE.MathUtils.lerp(bullet.y1,bullet.y2,t),.35);bullet.mesh.scale.setScalar(1-t*.35);if(t>=1){bullet.mesh.removeFromParent();this.visualBullets.splice(i,1);}}
    if(this.earthquake){
      if(this.earthquake.offsetTime>0){this.earthquake.offsetTime-=dt;if(this.earthquake.offsetTime<=0&&g.terrain){const delta=g.terrain.setEarthquakeOffset(0,0);this.moveGroundedWorms(delta.x,delta.y);}}
      this.earthquake.tick-=dt;
      if(this.earthquake.tick<=0){
        g.earthquakeShake=.88;
        if(g.terrain){const delta=g.terrain.setEarthquakeOffset((Math.random()-.5)*.48,(Math.random()-.5)*.24);this.moveGroundedWorms(delta.x,delta.y);this.earthquake.offsetTime=.1;}
        for(const worm of g.worms)if(worm.alive&&!worm.frozen){
          const baseAngle=[Math.PI/2,Math.PI*.75,Math.PI*.25][Math.floor(Math.random()*3)];
          const angle=baseAngle+(Math.random()-.5)*.18;
          const power=3.2+Math.random()*1.2;
          const impulseX=Math.cos(angle)*power,impulseY=Math.sin(angle)*power;
          worm.body.applyImpulse({x:impulseX,y:impulseY},true);
          worm.knockedDown=true;worm.impactVelocityX=impulseX;worm.impactSpinDirection=impulseX<0?-1:1;worm.tumbleRotation=worm.mesh.rotation.z;worm.slideTime=Math.max(worm.slideTime,.35);
        }
        this.earthquake.remaining--;this.earthquake.tick=.55;
        if(this.earthquake.remaining<=0)this.earthquake=null;
      }
    }
    if(this.flame){
      const f=this.flame;f.remaining-=dt;f.tick-=dt;
      if(!f.owner.alive||f.remaining<=0)this.flame=null;
      else if(f.tick<=0){f.tick=.015;const w=f.owner,a=g.angle;let dx=Math.cos(a),dy=Math.sin(a);const length=Math.hypot(dx,dy);dx/=length;dy/=length;
        const speed=6+Math.random()*.5,spread=(Math.random()-.5)*1.1,muzzleX=w.x+dx*1.35,muzzleY=w.y+.5,p=this.spawn('flameShot',muzzleX,muzzleY,dx*speed,dy*speed+spread,2.2);if(p){p.damageOverride=5;p.radiusOverride=.45;p.ignoreOwner=w;g.particles.emit(p.x,p.y,.12);}
      }
    }
    if(this.kamikaze){
      const k=this.kamikaze,w=k.owner;k.remaining-=dt;
      if(!w.alive)this.kamikaze=null;
      else{const pos=w.body.translation();g.createExplosion(pos.x+k.dx,pos.y+k.dy,1);
        for(const other of g.worms)if(other.alive&&other!==w&&!k.victims.has(other)&&Math.hypot(other.x-pos.x,other.y-pos.y)<2){k.victims.add(other);g.damage(other,30);if(other.alive&&!other.frozen)other.body.applyImpulse({x:k.dx*5,y:6},true);}
        w.body.setLinvel({x:k.dx*18,y:k.dy*18},true);
        if(k.remaining<=0){this.kamikaze=null;this.explode(pos.x,pos.y,2.2,50);g.damage(w,w.hp,true);}
      }
    }
    if(this.burst){const b=this.burst;b.tick-=dt;if(!b.owner.alive)this.burst=null;else if(b.tick<=0){this.fireGun(b.type);b.left--;b.tick=.1;if(!b.left)this.burst=null;}}
    for(let i=this.hazards.length-1;i>=0;i--){
      const hazard=this.hazards[i];hazard.remaining-=dt;hazard.tick-=dt;hazard.age=(hazard.age||0)+dt;
      if(hazard.remaining>0&&hazard.tick<=0){hazard.tick=hazard.kind==='fire'?.7+Math.random()*.8:hazard.tickInterval||1;if(hazard.kind==='fire'&&!g.trainingIndestructible){const groundParticles=hazard.particleSlots.filter(p=>p.active&&!p.smokeStarted&&(g.terrain.isSolid(p.x,p.y-.04)||g.terrain.isSolid(p.x,p.y-.12)));const limit=Math.min(8,groundParticles.length);for(let i=0;i<limit;i++){const particle=groundParticles[(hazard.groundDamageIndex++)%groundParticles.length];g.terrain.createExplosion(particle.x,particle.y-.08,.45);}}for(const worm of g.worms)if(worm.alive&&!worm.frozen){const inFire=hazard.kind==='fire'?hazard.particleSlots.some(p=>p.active&&p.grounded&&!p.smokeStarted&&Math.hypot(worm.x-p.x, worm.y-p.y)<.9):Math.hypot(worm.x-hazard.x,worm.y-hazard.y)<hazard.radius;if(!inFire)continue;if(hazard.kind==='poison')worm.poison=Math.max(worm.poison||0,hazard.damage);else{const appliedDamage=Math.max(1,hazard.damage*.5);g.damage(worm,appliedDamage,false,false);if(worm.alive){g.audio?.play('landing');const dx=worm.x-hazard.x,dy=worm.y-hazard.y,distance=Math.max(.25,Math.hypot(dx,dy)),impulse=2.25;worm.knockedDown=true;worm.impactVelocityX=worm.body.linvel().x;worm.impactSpinDirection=dx<0?-1:1;worm.tumbleRotation=worm.mesh.rotation.z;worm.body.applyImpulse({x:dx/distance*impulse,y:(dy/distance+.72)*impulse},true);worm.slideTime=Math.max(worm.slideTime,.35);}}}}
      if(hazard.remaining<=0&&!hazard.particleSlots?.some(p=>p.active)){this.hazards.splice(i,1);}
    }
    this.updateFireParticles(dt);
    if(this.drilling>0){
      this.drilling=Math.max(0,this.drilling-dt);this.drillTick-=dt;
      if(!g.active.alive)this.drilling=0;
      else if(this.drillTick<=0){this.drillTick=.12;const w=g.active;const horizontal=this.drillDirection;g.createExplosion(w.x+horizontal*.85,w.y-(horizontal?0:.85),1.15);g.particles.emit(w.x+horizontal*.8,w.y-(horizontal?0:.8),.4);for(const other of g.worms)if(other.alive&&other!==w&&!this.drillVictims.has(other)&&Math.hypot(other.x-(w.x+horizontal*.85),other.y-(w.y-(horizontal?0:.85)))<1.5){this.drillVictims.add(other);g.damage(other,15);}w.body.setLinvel(horizontal?{x:horizontal*2.5,y:0}:{x:0,y:-3},true);}
    }
    // All transient projectiles have a bounded lifetime; dormant mines persist between turns.
    for(let i=0;i<this.pool.length;i++){
      const p=this.pool[i];if(!p.active)continue;
      if(p.type==='madCow'&&!p.body.isEnabled()){p.delay-=dt;if(p.delay<=0){if(p.owner.alive)p.body.setTranslation({x:p.owner.x+p.dir,y:p.owner.y+.2},true);p.body.setEnabled(true);p.mesh.visible=true;}else continue;}
      if(p.type==='flameShot'){
        const baseSpeed=Math.hypot(p.flameVx,p.flameInitialVy)||1,nx=-p.flameInitialVy/baseSpeed,ny=p.flameVx/baseSpeed;
        const wobble=Math.sin(p.age*p.flameWobbleFreq+p.flameWobblePhase)*p.flameWobbleAmp+Math.sin(p.age*p.flameWobbleFreq*1.73+p.flameWobblePhase2)*p.flameWobbleAmp*.35;
        p.body.setLinvel({x:p.flameVx+nx*wobble,y:p.flameInitialVy-p.flameDrop*p.age+ny*wobble},true);
      }
      const previousX=p.x,previousY=p.y,pos=p.body.translation();p.x=pos.x;p.y=pos.y;p.age+=dt;p.remaining-=dt;
      if((p.type==='mortar'||p.type==='fragment')&&p.age>.2)p.ignoreOwner=null;
      const currentVelocity=p.body.linvel();
      if(p.hit&&Math.hypot(currentVelocity.x,currentVelocity.y)<1.1)p.restingTime+=dt;else p.restingTime=0;
      if(p.restingTime>.08)p.body.setAngvel(0,true);
      if(p.type==='napalm'){
        const v=p.body.linvel(),sway=Math.sin(p.age*2.4+p.napalmPhase)*.7+Math.sin(p.age*1.35+p.napalmPhase*1.7)*.25,targetX=this.g.wind*.22+sway;
        p.body.setLinvel({x:v.x+(targetX-v.x)*Math.min(1,dt*1.8),y:v.y},true);
      }
      if(p.type==='flameShot'){
        const moveX=p.x-previousX,moveY=p.y-previousY,moveDistance=Math.hypot(moveX,moveY);
        if(moveDistance>.001){
          this.ray.origin.x=previousX;this.ray.origin.y=previousY;this.ray.dir.x=moveX/moveDistance;this.ray.dir.y=moveY/moveDistance;
          const obstacle=g.world.castRay(this.ray,moveDistance,true,undefined,undefined,p.collider,p.body,c=>!this.byCollider.has(c.handle)&&c.handle!==p.owner?.collider?.handle);
          if(obstacle){
            const impactDistance=Math.max(0,obstacle.timeOfImpact-.05),impactX=previousX+this.ray.dir.x*impactDistance,impactY=previousY+this.ray.dir.y*impactDistance;
            p.body.setTranslation({x:impactX,y:impactY},true);p.x=impactX;p.y=impactY;p.hit=true;
          }
        }
      }
      if(p.type==='flameShot'&&Math.hypot(p.x-p.flameStartX,p.y-p.flameStartY)>=p.flameDistance)p.remaining=0;
      // Одного коэффициента трения недостаточно: на склоне гравитация всё
      // равно разгоняет предмет вдоль поверхности. После первого контакта с
      // землёй гасим именно касательную скорость, не мешая сильному удару,
      // отскоку или дальнейшему движению в воздухе.
      if(p.hit&&p.type!=='flameShot'){
        this.ray.origin.x=p.x;this.ray.origin.y=p.y;
        this.ray.dir.x=0;this.ray.dir.y=-1;
        const groundHit=g.world.castRayAndGetNormal(this.ray,.38,true,undefined,undefined,p.collider,p.body,c=>!g.wormByCollider.has(c.handle)&&!this.byCollider.has(c.handle));
        if(groundHit&&groundHit.normal.y>.1){
          const v=p.body.linvel(),nx=groundHit.normal.x,ny=groundHit.normal.y;
          const tangentX=ny,tangentY=-nx;
          const normalSpeed=v.x*nx+v.y*ny;
          const tangentSpeed=v.x*tangentX+v.y*tangentY;
          const damp=Math.exp(-14*dt);
          p.body.setLinvel({x:nx*normalSpeed+tangentX*tangentSpeed*damp,y:ny*normalSpeed+tangentY*tangentSpeed*damp},true);
          const angularVelocity=p.body.angvel();
          if(Math.abs(tangentSpeed)<.35&&Math.abs(normalSpeed)<.6){
            p.body.setAngvel(0,true);
          }else{
            p.body.setAngvel(angularVelocity*Math.exp(-10*dt),true);
          }
        }
      }
      if((p.type==='homing'||p.type==='pigeon'||p.type==='magicBullet')&&p.age>.35){
        const v=p.body.linvel(),a=Math.atan2(p.targetY-p.y,p.targetX-p.x),current=Math.atan2(v.y,v.x);
        const rate=p.type==='homing'?2.8:p.type==='pigeon'?4:7;
        let desired=a;
        if(p.type!=='homing'){
          this.ray.origin={x:p.x,y:p.y};this.ray.dir={x:Math.cos(a),y:Math.sin(a)};
          const obstacle=g.world.castRay(this.ray,3,true,undefined,undefined,p.collider,p.body,c=>!g.wormByCollider.has(c.handle)&&!this.byCollider.has(c.handle));
          if(obstacle)desired=Math.PI/2;
        }
        const diff=Math.atan2(Math.sin(desired-current),Math.cos(desired-current)),angle=current+THREE.MathUtils.clamp(diff,-rate*dt,rate*dt),speed=p.type==='homing'?THREE.MathUtils.clamp(Math.hypot(v.x,v.y),8,32):22;
        this.velocity.x=Math.cos(angle)*speed;this.velocity.y=Math.sin(angle)*speed;p.body.setLinvel(this.velocity,true);
      }
      if(p.type==='dragonBall'&&(p.hit||p.remaining<=0)){
        for(const worm of g.worms)if(worm.alive&&worm!==p.owner&&Math.hypot(worm.x-p.x,worm.y-p.y)<1.2){g.damage(worm,30);if(worm.alive)worm.body.applyImpulse({x:p.dir*5,y:2},true);}
        this.remove(p);continue;
      }
      if(['sheep','superSheep','sheepLauncher','madCow','oldWoman','salvation','skunk','moleBomb'].includes(p.type)){
        const v=p.body.linvel();
        if(p.type==='superSheep'&&p.stage==='flying'){
          const turn=(g.keys.has('ArrowLeft')||g.keys.has('KeyA')?1:0)-(g.keys.has('ArrowRight')||g.keys.has('KeyD')?1:0);
          p.heading+=turn*3*dt;p.body.setLinvel({x:Math.cos(p.heading)*12,y:Math.sin(p.heading)*12},true);if(p.hit)p.remaining=0;
        }else if(p.type==='moleBomb'&&(p.stage==='burrowing'||p.y>MAP.height)){
          p.stage='burrowing';if(v.y<0||p.hit){p.tick-=dt;if(p.tick<=0){g.createExplosion(p.x,p.y-.5,.8);p.tick=.1;}p.body.setLinvel({x:p.dir*2,y:-3},true);}
        }else if(p.type!=='sheepLauncher'||p.stage==='running'||p.hit){
          if(p.type==='sheepLauncher')p.stage='running';
          if(p.type==='madCow'&&p.hit&&Math.abs(v.x)<1)p.remaining=0;
          const walkSpeed=['oldWoman','salvation','skunk'].includes(p.type)?2:5;
          p.body.setLinvel({x:p.dir*walkSpeed,y:p.hit&&Math.abs(v.x)<1.5?4:v.y},true);
        }
        if(p.type==='skunk'&&p.gas){p.tick-=dt;if(p.tick<=0){p.tick=.3;this.hazards.push({kind:'poison',x:p.x,y:p.y,radius:2,damage:5,remaining:4,tick:0});}}
        if(p.type==='madCow')for(const w of g.worms)if(w.alive&&w!==p.owner&&Math.hypot(w.x-p.x,w.y-p.y)<1)p.remaining=0;
        p.hit=false;
      }
      if(p.type==='donkey'&&p.hit){this.explode(p.x,p.y,2.5,100);p.body.setLinvel({x:0,y:-8},true);p.hit=false;}
      if(p.type==='dynamite'&&p.hit){p.body.setLinvel({x:0,y:0},true);p.body.setAngvel(0,true);p.body.lockRotations(true,true);p.hit=false;}
      if(p.type==='carpet'&&p.hit&&p.bounces<4){this.explode(p.x,p.y,2.5,30);p.bounces++;p.body.setLinvel({x:p.dir*3,y:7},true);p.hit=false;}
      if(p.type==='mine'&&!p.triggered&&p.age>1.5){
        p.ownerClear=true;
        for(const w of g.worms)if(w.alive&&(w!==p.owner||p.ownerClear)&&Math.hypot(w.x-p.x,w.y-p.y)<2){p.triggered=true;p.remaining=3;this.endUtility(true);g.turn.state=TURN.ACTION_RESOLVING;g.turn.charge=0;g.turn.shots=0;this.retreat=0;break;}
      }
      p.mesh.position.set(p.x,p.y,.2);g.weaponArt.orient(p,dt);
      if(p.type==='mine')p.mesh.material?.color.setHex(p.triggered?(Math.floor(p.age*12)%2?0xff3333:0xffffff):0xffffff);
      if((p.type!=='homing'&&p.y<(g.waterLevel||0)-.5)||p.y < -5 || p.x < -10 || p.x > MAP.width+10){this.remove(p);continue;}
      const impact=p.hit&&(GROUND_PROJECTILES.has(p.type)||p.type==='mortar'||p.type==='donkey'||p.type==='napalm'||p.type==='mailstrike'||p.type==='carpet'||p.type==='armageddon'||p.type==='moleBomb');
      if(p.type==='holy'&&p.remaining<=0&&p.age<30&&Math.hypot(p.body.linvel().x,p.body.linvel().y)>.15)continue;
      if(p.remaining<=0||impact||(p.type==='fragment'&&!p.remoteFragment&&p.hit&&p.age>.14)){this.detonate(p);continue;}
      if(p.type!=='mine')this.projectile=p;
    }
    if(this.movementMode&&!this.movementMode.owner.alive)this.endUtility(true);
    if(g.turn.state===TURN.ACTION_RESOLVING&&!this.busy())g.turn.settle();
  }
  detonate(p){
    const {x,y,type,owner,damageOverride,radiusOverride}=p;this.remove(p,true);
    this.g.cameraFocus={x,y,explosionFocus:true};
    if(type==='dragonBall')return;
    const specs={
      bazooka:[3.5,50],homing:[3.5,50],pigeon:[4,75],magicBullet:[4.5,100],mortar:[1.8,35],
      grenade:[3.5,50],cluster:[2.4,25],banana:[3.2,75],superBanana:[4,85],holy:[5,100],
      dynamite:[5,75],mine:[2.8,50],sheep:[4.5,75],superSheep:[4.5,75],sheepLauncher:[4.5,75],
      moleBomb:[2.8,55],bomb:[2.6,30],napalm:[2.2,25],mailstrike:[2.8,45],carpet:[3.5,55],armageddon:[4,70],
      petrol:[2.4,35],mingVase:[3.2,70],mbBomb:[4.5,100],oldWoman:[4,75],donkey:[7,100],fragment:[1.1,18],
      frenchSheep:[4.5,75],flameShot:[.45,5],madCow:[4.5,75],salvation:[1.8,20],skunk:[2.2,0]
    };
    const [radius,damage]=specs[type]||[3.5,55];if(type!=='skunk'&&type!=='napalm'&&type!=='petrol')this.explode(x,y,radiusOverride??radius,damageOverride??damage,p.ignoreOwner||null,type==='mortar'?.35:1);
    if(['cluster','banana','superBanana','mingVase','salvation'].includes(type)){
      const count=5;
      for(let i=0;i<count;i++){const a=.2+i*(Math.PI-.4)/(count-1),part=this.spawn('fragment',x+Math.cos(a)*.5,y+.5,Math.cos(a)*10,Math.sin(a)*10,type==='superBanana'?20:2);
        if(part){this.g.weaponArt.projectile(part,type==='superBanana'?'banana':type,.12);part.owner=owner;part.damageOverride=type==='cluster'?30:type==='mingVase'?25:75;part.radiusOverride=type==='cluster'||type==='mingVase'?1.3:3.2;part.remoteFragment=type==='superBanana';}}
    }
    if(type==='mortar')for(let i=0;i<5;i++){const a=Math.PI/2+(i-2)*.32,spread=.5,part=this.spawn('fragment',x+Math.cos(a)*spread,y+Math.sin(a)*spread,Math.cos(a)*(8+Math.random()*2),Math.sin(a)*(4.5+Math.random()*2),1.2);if(part){part.owner=owner;part.ignoreOwner=owner;part.damageOverride=30;}}
    if(type==='petrol'||type==='napalm'||type==='frenchSheep'||type==='flameShot')this.createFireHazard(x,y,type==='napalm'?3.5:type==='flameShot'?.7:2.8,type==='napalm'?12:type==='flameShot'?6:15,6,null,type==='petrol'?4:1,type==='petrol'?1.5:1);
    if(type==='skunk')this.hazards.push({kind:'poison',x,y,radius:3.5,damage:5,remaining:8,tick:.2});
  }
  explode(x,y,r,damage,ignoreOwner=null,impulseScale=1){
    const g=this.g,colors=g.createExplosion(x,y,r);g.particles.emit(x,y,r,colors);
    for(const w of g.worms)if(w.alive&&w!==ignoreOwner){const pos=w.body.translation(),dx=pos.x-x,dy=pos.y-y,d=Math.hypot(dx,dy),reach=r*1.8;if(d>reach)continue;const f=1-d/reach;g.damage(w,Math.ceil(damage*f));if(w.alive&&!w.frozen){const impulse=13.5*impulseScale*Math.pow(f,.75),distance=Math.max(d,.2);w.body.applyImpulse({x:dx/distance*impulse,y:(dy/distance+.72)*impulse},true);w.slideTime=Math.max(w.slideTime,1.2);}}
    for(const p of this.pool)if(p.active&&p.type==='mine'&&Math.hypot(p.x-x,p.y-y)<r*1.5){p.triggered=true;p.remaining=Math.min(p.remaining,.2);}
  }
  fireGun(type){
    const g=this.g,w=g.active,count=1,damage=type==='longbow'?15:5;
    for(let i=0;i<count;i++){
      const spread=w.laserSight||type==='longbow'?0:(Math.random()-.5)*.12;
      const a=g.angle+spread;this.ray.origin.x=w.x;this.ray.origin.y=w.y;this.ray.dir.x=Math.cos(a);this.ray.dir.y=Math.sin(a);
      const hit=g.world.castRay(this.ray,65,true,undefined,undefined,w.collider,w.body);const distance=hit?.timeOfImpact??65;
      const x=w.x+this.ray.dir.x*distance,y=w.y+this.ray.dir.y*distance;this.showBullet(w.x,w.y,x,y);
      const target=hit&&g.wormByCollider.get(hit.collider.handle);
      g.particles.emit(x,y,.15);
      if(!target){if(type==='longbow')g.terrain.createGirder(x-this.ray.dir.x*.4,y-this.ray.dir.y*.4,a,1);else g.createExplosion(x,y,.18);}
      if(target?.alive){g.damage(target,damage);if(target.alive&&!target.frozen)target.body.applyImpulse({x:this.ray.dir.x*(type==='minigun'?1.6:1),y:this.ray.dir.y*(type==='minigun'?1.6:1)},true);}
      if(type==='longbow'&&target?.alive&&!target.frozen)target.body.applyImpulse({x:this.ray.dir.x*2.5,y:this.ray.dir.y*2.5},true);
    }
  }
  shotgun(){
    const g=this.g,w=g.active;
    for(let i=0;i<1;i++){
      const a=g.angle;this.ray.origin.x=w.x;this.ray.origin.y=w.y;this.ray.dir.x=Math.cos(a);this.ray.dir.y=Math.sin(a);
      const hit=g.world.castRay(this.ray,65,true,undefined,undefined,w.collider,w.body);const distance=hit?.timeOfImpact??65;
      const x=w.x+this.ray.dir.x*distance,y=w.y+this.ray.dir.y*distance;this.showBullet(w.x,w.y,x,y);const target=hit&&g.wormByCollider.get(hit.collider.handle);
      if(target?.alive){g.damage(target,25);if(target.alive&&!target.frozen)target.body.applyImpulse({x:this.ray.dir.x*1.1,y:this.ray.dir.y*1.1+.3},true);}else g.createExplosion(x,y,.45);
      g.particles.emit(x,y,.35);
    }
  }
  dispose(){this.hazards.length=0;for(const bullet of this.visualBullets){bullet.mesh.removeFromParent();}this.visualBullets.length=0;this.bulletGeometry.dispose();this.bulletMaterial.dispose();this.fireParticles.mesh.removeFromParent();this.fireParticles.geometry.dispose();this.fireParticles.material.dispose();this.tether.removeFromParent();this.tether.geometry.dispose();this.tether.material.dispose();for(const p of this.pool){p.baseMesh.removeFromParent();p.baseMesh.material.dispose();if(p.rocketMesh){const smokePuffs=p.rocketMesh.userData.rocketArt?.smokePuffs||[];p.rocketMesh.removeFromParent();p.rocketMesh.traverse(child=>{child.geometry?.dispose();if(child.material?.dispose)child.material.dispose();});for(const puff of smokePuffs){puff.removeFromParent();puff.geometry?.dispose();puff.material?.dispose();}}}this.geometry.dispose();this.marker.removeFromParent();this.marker.traverse(child=>{child.geometry?.dispose();if(child.material?.dispose)child.material.dispose();});}
}
