import * as THREE from 'three';
import RAPIER from '@dimforge/rapier2d-compat';
import { MAP, GRAVITY, TURN } from './core.js';

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
const COLORS = {bazooka:0xffd166,homing:0xff7799,pigeon:0xffffff,magicBullet:0x8b5cf6,mortar:0x94a3b8,grenade:0x70bd65,cluster:0xf5a742,fragment:0xffde99,dynamite:0xf04444,mine:0xf1b33c,sheep:0xffffff,moleBomb:0x8b5e3c,bomb:0x879cb5,napalm:0xf97316};
const TARGET_WEAPONS = new Set(['homing','pigeon','magicBullet','airstrike','napalm','mailstrike','minestrike','moleSquadron','donkey','mbBomb','frenchSheep','carpet','girder','girderPack']);
const GUN_WEAPONS = new Set(['handgun','uzi','minigun','longbow']);
const GROUND_PROJECTILES = new Set(['bazooka','homing','pigeon','magicBullet','mortar','bomb','petrol','mbBomb','donkey','napalm','mailstrike','carpet','armageddon','frenchSheep']);
export class Weapons {
  constructor(game) {
    this.g=game;this.fuse=3;this.bounce=.7;this.burst=null;this.cowCount=1;this.flame=null;this.kamikaze=null;this.projectile=null;this.retreat=0;this.drilling=0;this.drillTick=0;this.drillDirection=0;this.movementMode=null;this.hazards=[];this.message='';
    this.ray=new RAPIER.Ray({x:0,y:0},{x:1,y:0});this.velocity={x:0,y:0};this.target={x:48,y:20};this.targetSet=false;
    this.byCollider=new Map();this.pool=[];this.geometry=new THREE.PlaneGeometry(1,1);
    for(let i=0;i<80;i++){const mesh=new THREE.Mesh(this.geometry,new THREE.MeshBasicMaterial({transparent:true,alphaTest:.08,depthWrite:false,side:THREE.DoubleSide}));mesh.visible=false;game.scene.add(mesh);this.pool.push({active:false,mesh});}
    this.tether=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:0xe6cf9b}));this.tether.frustumCulled=false;this.tether.visible=false;game.scene.add(this.tether);
    this.marker=new THREE.Mesh(new THREE.RingGeometry(.5,.65,24),new THREE.MeshBasicMaterial({color:0xff7799}));this.marker.visible=false;game.scene.add(this.marker);
    this.onCollision=(a,b,started)=>{if(!started)return;const p=this.byCollider.get(a),q=this.byCollider.get(b);if(p)p.hit=true;if(q)q.hit=true;};
  }
  resetTarget(){this.targetSet=false;this.marker.visible=false;this.message='';}
  setTarget(x,y){this.target.x=THREE.MathUtils.clamp(x,.7,MAP.width-.7);this.target.y=THREE.MathUtils.clamp(y,.8,MAP.height-1);this.targetSet=true;this.marker.position.set(this.target.x,this.target.y,.5);this.marker.visible=true;this.message='Цель выбрана';}
  needsCharge(type){return ['bazooka','homing','grenade','cluster','banana','superBanana','holy','petrol'].includes(type);}
  usesTarget(type){return TARGET_WEAPONS.has(type)||type==='teleport';}
  spawn(type,x,y,vx,vy,remaining=3){
    const p=this.pool.find(item=>!item.active);if(!p)return null;
    const radius=(type==='sheep'||type==='superSheep'||type==='pigeon') ? .38 : type==='fragment' ? .12 : .23;
    const body=this.g.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x,y).setCcdEnabled(true));
    const bounce=(type==='grenade'||type==='cluster'||type==='banana'||type==='superBanana') ? this.bounce : type==='holy' ? .2 : type==='fragment' ? .4 : 0;
    const collider=this.g.world.createCollider(RAPIER.ColliderDesc.ball(radius).setMass(.4).setRestitution(bounce).setFriction(.65).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),body);
    if(this.dropping){vx=this.g.active.body.linvel().x;vy=this.g.active.body.linvel().y;}
    this.velocity.x=vx;this.velocity.y=vy;body.setLinvel(this.velocity,true);
    if(['bazooka','napalm','mailstrike','mbBomb'].includes(type))body.addForce({x:this.g.wind*body.mass(),y:0},true);
    Object.assign(p,{active:true,body,collider,type,remaining,age:0,x,y,hit:false,triggered:false,owner:this.g.active,ownerClear:false,dir:this.g.active?.facing||1,targetX:this.target.x,targetY:this.target.y,gas:false,stage:'walking',heading:Math.PI/2,damageOverride:null,radiusOverride:null,remoteFragment:false,tick:0,bounces:0,delay:0});
    this.g.weaponArt.projectile(p,type,radius);p.mesh.position.set(x,y,.2);p.mesh.visible=true;
    this.byCollider.set(collider.handle,p);return p;
  }
  remove(p){this.byCollider.delete(p.collider.handle);this.g.world.removeRigidBody(p.body);p.active=false;p.mesh.visible=false;}
  busy(){if(this.drilling>0||this.retreat>0||this.movementMode||this.burst||this.flame||this.kamikaze||this.hazards.some(h=>h.kind==='fire'))return true;for(const p of this.pool)if(p.active&&(p.type!=='mine'||p.triggered||p.age<1.5||Math.hypot(p.body.linvel().x,p.body.linvel().y)>.2))return true;return false;}
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
  beginUtility(mode,duration=45){this.movementMode={mode,remaining:duration,owner:this.g.active,airborne:false};this.continueTurn();}
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
      if(x||y>0||m.retreat)m.remaining-=dt;
      w.body.setLinvel({x:THREE.MathUtils.clamp(v.x+x*18*dt,-7,7),y:THREE.MathUtils.clamp(v.y+Math.max(0,y)*24*dt,-9,8)},true);
      if(x||y>0)g.particles.emit(pos.x,pos.y-.7,.12);
      this.message=`Ранец: ${Math.ceil(m.remaining/30*100)}% · WASD/стрелки — тяга · пробел — снять · Enter — сбросить оружие`;
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
    const g=this.g,w=g.active,dx=Math.cos(g.angle),dy=Math.sin(g.angle),speed=8+charge*24;
    this.message='';
    if(!Object.hasOwn(ARSENAL,type)&&type!=='uppercut'){this.message='Неизвестное оружие';return false;}
    let freeSlots=0;for(const item of this.pool)if(!item.active)freeSlots++;
    const transientCount=type==='frenchSheep'?5:type==='madCows'?this.cowCount:type==='carpet'?8:type==='armageddon'?12:type==='airstrike'?5:type==='napalm'||type==='mailstrike'||type==='minestrike'?6:type==='moleSquadron'?4:1;
    const noProjectile=new Set(['teleport','flamethrower','skipGo','surrender','selectWorm','freeze','scales','lowGravity','fastWalk','laserSight','invisibility','firePunch','battleAxe','baseballBat','prod','kamikaze','suicideBomber','earthquake','drill','pneumaticDrill','blowTorch','girder','girderPack','ninjaRope','bungee','parachute','jetPack','uppercut','shotgun','handgun','uzi','minigun','longbow','indianTest']);
    if(!noProjectile.has(type)&&freeSlots<transientCount&&type!=='teleport'&&type!=='blowTorch'&&type!=='pneumaticDrill'&&type!=='drill'&&type!=='uppercut'&&type!=='shotgun'){
      this.message='На карте недостаточно свободных слотов для этого оружия';return false;
    }
    if(this.usesTarget(type)&&!this.targetSet){this.message='Укажите цель на карте';return false;}
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
    if(type==='lowGravity'){g.lowGravity=true;g.world.gravity={x:0,y:GRAVITY*.5};this.continueTurn();return true;}
    if(type==='fastWalk'){for(const worm of g.teams[w.team].worms)worm.speedBoost=true;this.continueTurn();return true;}
    if(type==='laserSight'){for(const worm of g.teams[w.team].worms)worm.laserSight=true;this.continueTurn();return true;}
    if(type==='invisibility'){for(const worm of g.worms)if(worm.alive&&worm.team===w.team)worm.invisible=true;this.continueTurn();return true;}
    if(type==='dragonBall'){this.spawn('dragonBall',w.x+w.facing,w.y,w.facing*12,0,.25);g.turn.settle();return true;}
    if(type==='firePunch'||type==='battleAxe'||type==='baseballBat'||type==='prod'){
      for(const other of g.worms)if(other.alive&&other!==w){const x=other.x-w.x,y=other.y-w.y;if(x*w.facing>=-.3&&Math.hypot(x,y)<2.8){if(type!=='prod')g.damage(other,type==='battleAxe'?Math.max(1,Math.floor(other.hp/2)):30);if(other.alive&&!other.frozen)other.body.applyImpulse(type==='battleAxe'?{x:0,y:-2}:type==='baseballBat'?{x:dx*10,y:dy*10}:type==='prod'?{x:w.facing*1.2,y:.15}:{x:w.facing*4,y:6},true);}}
      if(type==='firePunch'){g.createExplosion(w.x+w.facing*1.1,w.y,.7);w.body.applyImpulse({x:w.facing*1.5,y:4},true);}g.turn.settle();return true;
    }
    if(type==='kamikaze'){this.kamikaze={owner:w,dx,dy,remaining:.7,victims:new Set()};return true;}
    if(type==='suicideBomber'){for(const other of g.worms)if(other.alive&&!other.frozen&&other!==w&&Math.hypot(other.x-w.x,other.y-w.y)<4)other.poison=Math.max(other.poison||0,5);this.explode(w.x,w.y,2.5,30);g.damage(w,w.hp,true);g.turn.settle();return true;}
    if(type==='earthquake'){for(const worm of g.worms)if(worm.alive&&!worm.frozen){worm.body.applyImpulse({x:(Math.random()-.5)*4,y:3+Math.random()*4},true);}for(const p of this.pool)if(p.active&&p.type==='mine')p.body.applyImpulse({x:(Math.random()-.5)*2,y:2},true);g.turn.settle();return true;}
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
    if(type==='mortar'){this.spawn('mortar',w.x+dx,w.y+dy,dx*32,dy*32,12);return true;}
    if(type==='dynamite'||type==='mine'||type==='sheep'||type==='superSheep'){
      const projectileSpeed=type==='sheep'||type==='superSheep'?5:1;
      const projectileY=type==='sheep'||type==='superSheep'?2:0;
      const fuse=type==='mine'?Infinity:type==='sheep'||type==='superSheep'?20:5;
      this.spawn(type,w.x+w.facing*.9,w.y+.2,w.facing*projectileSpeed,projectileY,fuse);
      this.retreat=type==='mine'||type==='dynamite'?2:0;
      this.message=type==='sheep'||type==='superSheep'?'Пробел / ЛКМ — взорвать овечку':'Можно отойти: A/D, W';return true;
    }
    if(type==='sheepLauncher'){this.spawn('sheepLauncher',w.x+dx,w.y+dy,dx*32,dy*32,20);this.retreat=0;this.message='Пробел / ЛКМ — взорвать овечку';return true;}
    if(['airstrike','napalm','mailstrike','minestrike','moleSquadron'].includes(type)){const dropType=type==='minestrike'?'mine':type==='moleSquadron'?'moleBomb':type==='napalm'?'napalm':type==='mailstrike'?'mailstrike':'bomb';const drops=type==='moleSquadron'?4:type==='airstrike'?5:6;for(let i=0;i<drops;i++)this.spawn(dropType,THREE.MathUtils.clamp(this.target.x+(i-(drops-1)/2)*2.6,1,MAP.width-1),MAP.height+3+i*1.4,w.facing*3,-9,type==='minestrike'?Infinity:12);this.resetTarget();return true;}
    if(type==='madCows'){for(let i=0;i<this.cowCount;i++){const p=this.spawn('madCow',w.x+w.facing,w.y+.2,0,0,20);p.delay=i*.6;p.body.setEnabled(false);p.mesh.visible=false;}return true;}
    if(type==='frenchSheep'){for(let i=0;i<5;i++)this.spawn('frenchSheep',THREE.MathUtils.clamp(this.target.x+(i-2)*1.8,1,MAP.width-1),MAP.height+3+i,w.facing*2,-9,20);this.resetTarget();return true;}
    if(type==='carpet'||type==='armageddon'){const count=type==='carpet'?8:12;for(let i=0;i<count;i++)this.spawn(type,THREE.MathUtils.clamp(type==='armageddon'?Math.random()*MAP.width:this.target.x+(i-(count-1)/2)*2.2,1,MAP.width-1),MAP.height+3+i*.7,1,-10,12);this.resetTarget();return true;}
    if(type==='indianTest'){g.waterLevel=(g.waterLevel||0)+3;g.water.visible=true;g.water.scale.y=g.waterLevel;g.water.position.y=g.waterLevel/2-.5;for(const worm of g.worms)if(worm.alive&&!worm.frozen)worm.radiation=Math.max(worm.radiation||0,5);this.resetTarget();g.turn.settle();return true;}
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
  update(dt) {
    const g=this.g;g.events.drainCollisionEvents(this.onCollision);this.retreat=Math.max(0,this.retreat-dt);this.projectile=null;
    if(this.flame){
      const f=this.flame;f.remaining-=dt;f.tick-=dt;
      if(!f.owner.alive||f.remaining<=0)this.flame=null;
      else if(f.tick<=0){f.tick=.15;const w=f.owner,dx=Math.cos(g.angle),dy=Math.sin(g.angle);
        this.ray.origin={x:w.x,y:w.y};this.ray.dir={x:dx,y:dy};
        const hit=g.world.castRay(this.ray,5,true,undefined,undefined,w.collider,w.body),reach=hit?hit.timeOfImpact:5;
        for(let d=.8;d<=reach+.1;d+=.6){const x=w.x+dx*d+g.wind*.04*d,y=w.y+dy*d;g.particles.emit(x,y,.25);this.hazards.push({kind:'fire',x,y,radius:.5,damage:3,remaining:.3,tick:0});}
        if(hit)g.createExplosion(w.x+dx*reach,w.y+dy*reach,.4);
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
      const hazard=this.hazards[i];hazard.remaining-=dt;hazard.tick-=dt;
      if(hazard.tick<=0){hazard.tick=1;for(const worm of g.worms)if(worm.alive&&!worm.frozen&&Math.hypot(worm.x-hazard.x,worm.y-hazard.y)<hazard.radius){if(hazard.kind==='poison')worm.poison=Math.max(worm.poison||0,hazard.damage);else g.damage(worm,hazard.damage);}}
      if(hazard.remaining<=0)this.hazards.splice(i,1);
    }
    if(this.drilling>0){
      this.drilling=Math.max(0,this.drilling-dt);this.drillTick-=dt;
      if(!g.active.alive)this.drilling=0;
      else if(this.drillTick<=0){this.drillTick=.12;const w=g.active;const horizontal=this.drillDirection;g.createExplosion(w.x+horizontal*.85,w.y-(horizontal?0:.85),1.15);g.particles.emit(w.x+horizontal*.8,w.y-(horizontal?0:.8),.4);for(const other of g.worms)if(other.alive&&other!==w&&!this.drillVictims.has(other)&&Math.hypot(other.x-(w.x+horizontal*.85),other.y-(w.y-(horizontal?0:.85)))<1.5){this.drillVictims.add(other);g.damage(other,15);}w.body.setLinvel(horizontal?{x:horizontal*2.5,y:0}:{x:0,y:-3},true);}
    }
    // All transient projectiles have a bounded lifetime; dormant mines persist between turns.
    for(let i=0;i<this.pool.length;i++){
      const p=this.pool[i];if(!p.active)continue;
      if(p.type==='madCow'&&!p.body.isEnabled()){p.delay-=dt;if(p.delay<=0){if(p.owner.alive)p.body.setTranslation({x:p.owner.x+p.dir,y:p.owner.y+.2},true);p.body.setEnabled(true);p.mesh.visible=true;}else continue;}
      const pos=p.body.translation();p.x=pos.x;p.y=pos.y;p.age+=dt;p.remaining-=dt;
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
      if(p.type==='carpet'&&p.hit&&p.bounces<4){this.explode(p.x,p.y,2.5,30);p.bounces++;p.body.setLinvel({x:p.dir*3,y:7},true);p.hit=false;}
      if(p.type==='mine'&&!p.triggered&&p.age>1.5){
        p.ownerClear=true;
        for(const w of g.worms)if(w.alive&&(w!==p.owner||p.ownerClear)&&Math.hypot(w.x-p.x,w.y-p.y)<2){p.triggered=true;p.remaining=3;this.endUtility(true);g.turn.state=TURN.ACTION_RESOLVING;g.turn.charge=0;g.turn.shots=0;this.retreat=0;break;}
      }
      p.mesh.position.set(p.x,p.y,.2);g.weaponArt.orient(p,dt);
      if(p.type==='mine')p.mesh.material.color.setHex(p.triggered?(Math.floor(p.age*12)%2?0xff3333:0xffffff):0xffffff);
      if((p.type!=='homing'&&p.y<(g.waterLevel||0)-.5)||p.y < -5 || p.x < -10 || p.x > MAP.width+10){this.remove(p);continue;}
      const impact=p.hit&&(GROUND_PROJECTILES.has(p.type)||p.type==='mortar'||p.type==='donkey'||p.type==='napalm'||p.type==='mailstrike'||p.type==='carpet'||p.type==='armageddon'||p.type==='moleBomb');
      if(p.type==='holy'&&p.remaining<=0&&p.age<30&&Math.hypot(p.body.linvel().x,p.body.linvel().y)>.15)continue;
      if(p.remaining<=0||impact||(p.type==='fragment'&&!p.remoteFragment&&p.hit)){this.detonate(p);continue;}
      if(p.type!=='mine')this.projectile=p;
    }
    if(this.movementMode&&!this.movementMode.owner.alive)this.endUtility(true);
    if(g.turn.state===TURN.ACTION_RESOLVING&&!this.busy())g.turn.settle();
  }
  detonate(p){
    const {x,y,type,owner,damageOverride,radiusOverride}=p;this.remove(p);
    if(type==='dragonBall')return;
    const specs={
      bazooka:[3.5,50],homing:[3.5,50],pigeon:[4,75],magicBullet:[4.5,100],mortar:[1.8,35],
      grenade:[3.5,50],cluster:[2.4,25],banana:[3.2,75],superBanana:[4,85],holy:[5,100],
      dynamite:[5,75],mine:[2.8,50],sheep:[4.5,75],superSheep:[4.5,75],sheepLauncher:[4.5,75],
      moleBomb:[2.8,55],bomb:[2.6,30],napalm:[2.2,25],mailstrike:[2.8,45],carpet:[3.5,55],armageddon:[4,70],
      petrol:[2.4,35],mingVase:[3.2,70],mbBomb:[4.5,100],oldWoman:[4,75],donkey:[7,100],fragment:[1.1,18],
      frenchSheep:[4.5,75],madCow:[4.5,75],salvation:[1.8,20],skunk:[2.2,0]
    };
    const [radius,damage]=specs[type]||[3.5,55];if(type!=='skunk')this.explode(x,y,radiusOverride??radius,damageOverride??damage);
    if(['cluster','banana','superBanana','mingVase','salvation'].includes(type)){
      const count=5;
      for(let i=0;i<count;i++){const a=.2+i*(Math.PI-.4)/(count-1),part=this.spawn('fragment',x+Math.cos(a)*.5,y+.5,Math.cos(a)*10,Math.sin(a)*10,type==='superBanana'?20:2);
        if(part){this.g.weaponArt.projectile(part,type==='superBanana'?'banana':type,.12);part.owner=owner;part.damageOverride=type==='cluster'?30:type==='mingVase'?25:75;part.radiusOverride=type==='cluster'||type==='mingVase'?1.3:3.2;part.remoteFragment=type==='superBanana';}}
    }
    if(type==='mortar')for(let i=0;i<5;i++){const a=Math.PI/2+(i-2)*.18,part=this.spawn('fragment',x,y,Math.cos(a)*8,Math.sin(a)*10,1.2);if(part){part.owner=owner;part.damageOverride=30;}}
    if(type==='petrol'||type==='napalm'||type==='frenchSheep')this.hazards.push({kind:'fire',x,y,radius:type==='napalm'?3.5:2.8,damage:type==='napalm'?12:15,remaining:type==='napalm'?4:5,tick:.2});
    if(type==='skunk')this.hazards.push({kind:'poison',x,y,radius:3.5,damage:5,remaining:8,tick:.2});
  }
  explode(x,y,r,damage){
    const g=this.g,colors=g.createExplosion(x,y,r);g.particles.emit(x,y,r,colors);
    for(const w of g.worms)if(w.alive){const pos=w.body.translation(),dx=pos.x-x,dy=pos.y-y,d=Math.hypot(dx,dy),reach=r*1.8;if(d>reach)continue;const f=1-d/reach;g.damage(w,Math.ceil(damage*f));if(w.alive&&!w.frozen){const impulse=13.5*Math.pow(f,.75),distance=Math.max(d,.2);w.body.applyImpulse({x:dx/distance*impulse,y:(dy/distance+.72)*impulse},true);w.slideTime=Math.max(w.slideTime,1.2);}}
    for(const p of this.pool)if(p.active&&p.type==='mine'&&Math.hypot(p.x-x,p.y-y)<r*1.5){p.triggered=true;p.remaining=Math.min(p.remaining,.2);}
  }
  fireGun(type){
    const g=this.g,w=g.active,count=1,damage=type==='longbow'?15:5;
    for(let i=0;i<count;i++){
      const spread=w.laserSight||type==='longbow'?0:(Math.random()-.5)*.12;
      const a=g.angle+spread;this.ray.origin.x=w.x;this.ray.origin.y=w.y;this.ray.dir.x=Math.cos(a);this.ray.dir.y=Math.sin(a);
      const hit=g.world.castRay(this.ray,65,true,undefined,undefined,w.collider,w.body);if(!hit)continue;
      const x=w.x+this.ray.dir.x*hit.timeOfImpact,y=w.y+this.ray.dir.y*hit.timeOfImpact;
      const target=g.wormByCollider.get(hit.collider.handle);
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
      const hit=g.world.castRay(this.ray,65,true,undefined,undefined,w.collider,w.body);if(!hit)continue;
      const x=w.x+this.ray.dir.x*hit.timeOfImpact,y=w.y+this.ray.dir.y*hit.timeOfImpact,target=g.wormByCollider.get(hit.collider.handle);
      if(target?.alive){g.damage(target,25);if(target.alive&&!target.frozen)target.body.applyImpulse({x:this.ray.dir.x*1.1,y:this.ray.dir.y*1.1+.3},true);}else g.createExplosion(x,y,.45);
      g.particles.emit(x,y,.35);
    }
  }
  dispose(){this.tether.removeFromParent();this.tether.geometry.dispose();this.tether.material.dispose();for(const p of this.pool){p.mesh.removeFromParent();p.mesh.material.dispose();}this.geometry.dispose();this.marker.removeFromParent();this.marker.geometry.dispose();this.marker.material.dispose();}
}
