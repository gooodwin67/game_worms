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
const TARGET_WEAPONS = new Set(['homing','pigeon','magicBullet','airstrike','napalm','mailstrike','minestrike','moleSquadron','ninjaRope','donkey','indianTest','frenchSheep','madCows','carpet','armageddon','salvation']);
const GUN_WEAPONS = new Set(['handgun','uzi','minigun','longbow']);
const GROUND_PROJECTILES = new Set(['bazooka','homing','pigeon','magicBullet','mortar','moleBomb','bomb','mingVase','mbBomb','donkey','napalm','mailstrike','carpet','armageddon','salvation','skunk']);
export class Weapons {
  constructor(game) {
    this.g=game;this.fuse=3;this.projectile=null;this.retreat=0;this.drilling=0;this.drillTick=0;this.drillDirection=0;this.movementMode=null;this.hazards=[];this.message='';
    this.ray=new RAPIER.Ray({x:0,y:0},{x:1,y:0});this.velocity={x:0,y:0};this.target={x:48,y:20};this.targetSet=false;
    this.byCollider=new Map();this.pool=[];this.geometry=new THREE.CircleGeometry(1,16);
    for(let i=0;i<80;i++){const mesh=new THREE.Mesh(this.geometry,new THREE.MeshBasicMaterial());mesh.visible=false;game.scene.add(mesh);this.pool.push({active:false,mesh});}
    this.marker=new THREE.Mesh(new THREE.RingGeometry(.5,.65,24),new THREE.MeshBasicMaterial({color:0xff7799}));this.marker.visible=false;game.scene.add(this.marker);
    this.onCollision=(a,b,started)=>{if(!started)return;const p=this.byCollider.get(a),q=this.byCollider.get(b);if(p)p.hit=true;if(q)q.hit=true;};
  }
  resetTarget(){this.targetSet=false;this.marker.visible=false;this.message='';}
  setTarget(x,y){this.target.x=THREE.MathUtils.clamp(x,.7,MAP.width-.7);this.target.y=THREE.MathUtils.clamp(y,.8,MAP.height-1);this.targetSet=true;this.marker.position.set(this.target.x,this.target.y,.5);this.marker.visible=true;this.message='Цель выбрана';}
  usesTarget(type){return TARGET_WEAPONS.has(type)||type==='teleport';}
  spawn(type,x,y,vx,vy,remaining=3){
    const p=this.pool.find(item=>!item.active);if(!p)return null;
    const radius=(type==='sheep'||type==='superSheep'||type==='pigeon') ? .38 : type==='fragment' ? .12 : .23;
    const body=this.g.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x,y).setCcdEnabled(true));
    const bounce=(type==='grenade'||type==='cluster'||type==='banana'||type==='superBanana') ? .7 : type==='fragment' ? .4 : 0;
    const collider=this.g.world.createCollider(RAPIER.ColliderDesc.ball(radius).setMass(.4).setRestitution(bounce).setFriction(.65).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),body);
    this.velocity.x=vx;this.velocity.y=vy;body.setLinvel(this.velocity,true);
    if(['bazooka','napalm','mailstrike','carpet','armageddon','mbBomb','salvation'].includes(type))body.addForce({x:this.g.wind*body.mass(),y:0},true);
    Object.assign(p,{active:true,body,collider,type,remaining,age:0,x,y,hit:false,triggered:false,owner:this.g.active,ownerClear:false,dir:this.g.active?.facing||1,targetX:this.target.x,targetY:this.target.y,gas:false});
    p.mesh.material.color.setHex(COLORS[type]||0xffffff);p.mesh.scale.set(radius*(type==='sheep'||type==='superSheep'||type==='pigeon'?1.5:1),radius,1);p.mesh.position.set(x,y,.2);p.mesh.visible=true;
    this.byCollider.set(collider.handle,p);return p;
  }
  remove(p){this.byCollider.delete(p.collider.handle);this.g.world.removeRigidBody(p.body);p.active=false;p.mesh.visible=false;}
  busy(){if(this.drilling>0||this.retreat>0||this.movementMode)return true;for(const p of this.pool)if(p.active&&(p.type!=='mine'||p.triggered))return true;return false;}
  remote(){for(const p of this.pool)if(p.active&&p.owner===this.g.active&&(p.type==='sheep'||p.type==='superSheep'||p.type==='sheepLauncher'||p.type==='superBanana')){p.remaining=0;return true;}return false;}
  beginUtility(mode,duration=45){this.movementMode={mode,remaining:duration};this.g.turn.shots=0;this.g.turn.state=TURN.WAITING_INPUT;}
  endUtility(){this.movementMode=null;this.g.active.speedBoost=false;this.g.turn.settle();}
  fire(type,charge) {
    const g=this.g,w=g.active,dx=Math.cos(g.angle),dy=Math.sin(g.angle),speed=8+charge*24;
    this.message='';
    if(w.invisible&&type!=='invisibility')for(const worm of g.worms)if(worm.team===w.team)worm.invisible=false;
    let freeSlots=0;for(const item of this.pool)if(!item.active)freeSlots++;
    const transientCount=type==='frenchSheep'?5:type==='madCows'?4:type==='salvation'?5:type==='carpet'?8:type==='armageddon'?12:type==='airstrike'||type==='napalm'||type==='mailstrike'||type==='minestrike'?6:type==='moleSquadron'?4:1;
    if(freeSlots<transientCount&&type!=='teleport'&&type!=='blowTorch'&&type!=='pneumaticDrill'&&type!=='drill'&&type!=='uppercut'&&type!=='shotgun'){
      this.message='На карте недостаточно свободных слотов для этого оружия';return false;
    }
    if(this.usesTarget(type)&&!this.targetSet){this.message='Укажите цель на карте';return false;}
    if(type==='teleport'){
      if(g.world.intersectionWithShape(this.target,0,w.collider.shape,undefined,undefined,w.collider,w.body)){this.message='Для телепорта нужно свободное место';return false;}
      g.particles.emit(w.x,w.y,.7);w.body.setTranslation(this.target,true);w.body.setLinvel({x:0,y:0},true);
      w.x=w.previousX=this.target.x;w.y=w.previousY=this.target.y;w.vx=w.vy=0;w.grounded=false;
      g.particles.emit(w.x,w.y,.7);this.resetTarget();g.turn.settle();return true;
    }
    if(type==='flamethrower'){
      for(let i=1;i<=6;i++){const x=w.x+dx*i*.8,y=w.y+dy*i*.8;g.createExplosion(x,y,.45);this.hazards.push({kind:'fire',x,y,radius:.8,damage:10,remaining:3,tick:.2});}
      g.turn.settle();return true;
    }
    if(type==='salvation'){for(let i=0;i<5;i++)this.spawn('salvation',THREE.MathUtils.clamp(this.target.x+(i-2)*1.6,1,MAP.width-1),MAP.height+3+i,0,-9,12);this.resetTarget();return true;}
    if(type==='skunk'){this.spawn('skunk',w.x+dx,w.y+dy,dx*speed,dy*speed,5);return true;}
    if(type==='skipGo'){g.turn.shots=0;g.turn.settle();return true;}
    if(type==='surrender'){g.winner=`${g.teams.find((team,index)=>index!==w.team&&team.worms.some(worm=>worm.alive))?.name||'Противник'} побеждает!`;return true;}
    if(type==='selectWorm'){
      const team=g.teams[w.team],current=team.worms.indexOf(w);let next=current;
      do next=(next+1)%team.worms.length;while(next!==current&&!team.worms[next].alive);
      if(team.worms[next].alive){g.active=team.worms[next];g.turn.cursors[w.team]=next;g.angle=g.active.facing<0?Math.PI*.75:Math.PI*.25;}
      g.turn.shots=0;g.turn.settle();return true;
    }
    if(type==='freeze'){for(const worm of g.worms)if(worm.alive&&worm.team===w.team){worm.frozen=true;worm.body.setLinvel({x:0,y:0},true);}g.turn.settle();return true;}
    if(type==='scales'){const living=g.worms.filter(worm=>worm.alive);if(living.length){const average=living.reduce((sum,worm)=>sum+worm.hp,0)/living.length;for(const worm of living){worm.hp=Math.round(average);worm.health.value=worm.hp;worm.health.title=`${worm.hp} HP`;}}g.turn.settle();return true;}
    if(type==='lowGravity'){g.lowGravity=!g.lowGravity;g.world.gravity={x:0,y:g.lowGravity?GRAVITY*.5:GRAVITY};g.turn.settle();return true;}
    if(type==='fastWalk'){w.speedBoost=true;this.beginUtility('fastWalk');return true;}
    if(type==='laserSight'){w.laserSight=!w.laserSight;g.turn.settle();return true;}
    if(type==='invisibility'){for(const worm of g.worms)if(worm.alive&&worm.team===w.team)worm.invisible=!worm.invisible;g.turn.settle();return true;}
    if(type==='dragonBall'){this.spawn('dragonBall',w.x+dx,w.y+dy,dx*speed,dy*speed,5);g.turn.settle();return true;}
    if(type==='firePunch'||type==='battleAxe'||type==='baseballBat'||type==='prod'){
      for(const other of g.worms)if(other.alive&&other!==w){const x=other.x-w.x,y=other.y-w.y;if(x*w.facing>=-.3&&Math.hypot(x,y)<2.8){if(type!=='prod')g.damage(other,type==='battleAxe'?Math.max(1,Math.ceil(other.hp/2)):30);if(other.alive)other.body.applyImpulse({x:w.facing*(type==='baseballBat'?7:4),y:type==='prod'?2:6},true);}}
      if(type==='firePunch')g.createExplosion(w.x+w.facing*1.1,w.y,.7);g.turn.settle();return true;
    }
    if(type==='kamikaze'){this.explode(w.x+w.facing*1.8,w.y,2.2,50);g.damage(w,100);g.turn.settle();return true;}
    if(type==='suicideBomber'){for(const other of g.worms)if(other.alive&&other!==w&&Math.hypot(other.x-w.x,other.y-w.y)<4)other.poison=Math.max(other.poison||0,5);this.explode(w.x,w.y,2.5,30);g.damage(w,100);g.turn.settle();return true;}
    if(type==='earthquake'){for(const worm of g.worms)if(worm.alive){worm.body.applyImpulse({x:(Math.random()-.5)*4,y:3+Math.random()*4},true);}for(const p of this.pool)if(p.active&&p.type==='mine'){p.triggered=true;p.remaining=.2;}g.turn.settle();return true;}
    if(type==='drill'||type==='pneumaticDrill'||type==='blowTorch'){this.drilling=2.2;this.drillTick=0;this.drillDirection=type==='blowTorch'?w.facing:0;this.beginUtility(type==='blowTorch'?'blowTorch':'drill',2.2);return true;}
    if(type==='girder'||type==='girderPack'){g.terrain.createGirder(w.x+w.facing*2,w.y+1.3,g.angle,type==='girderPack'?5:3.5);if(type==='girderPack')this.girderStock=(this.girderStock||5)-1;g.turn.settle();return true;}
    if(type==='ninjaRope'){const dx=this.target.x-w.x,dyTarget=this.target.y-w.y;w.body.applyImpulse({x:dx*1.2,y:dyTarget*1.2},true);this.resetTarget();this.beginUtility('rope',1.2);return true;}
    if(type==='bungee'){this.beginUtility('bungee');return true;}
    if(type==='parachute'){this.beginUtility('parachute');return true;}
    if(type==='jetPack'){this.beginUtility('jetPack',30);return true;}
    if(type==='uppercut'){
      for(const other of g.worms)if(other.alive&&other!==w){const x=other.x-w.x,y=other.y-w.y;if(x*w.facing>=-.3&&Math.hypot(x,y)<2.8){g.damage(other,35);if(other.alive)other.body.applyImpulse({x:w.facing*4,y:9},true);}}
      g.particles.emit(w.x+w.facing,w.y+1,1);g.turn.settle();return true;
    }
    if(type==='shotgun'){this.shotgun();g.turn.shots--;g.turn.settle();return true;}
    if(GUN_WEAPONS.has(type)){this.fireGun(type);g.turn.settle();return true;}
    if(type==='mortar'){this.spawn('mortar',w.x+dx,w.y+dy,dx*speed,dy*speed,12);return true;}
    if(type==='dynamite'||type==='mine'||type==='sheep'||type==='superSheep'){
      const projectileSpeed=type==='sheep'||type==='superSheep'?5:1;
      const projectileY=type==='sheep'||type==='superSheep'?2:0;
      const fuse=type==='mine'?Infinity:type==='sheep'||type==='superSheep'?20:5;
      this.spawn(type,w.x+w.facing*.9,w.y+.2,w.facing*projectileSpeed,projectileY,fuse);
      this.retreat=type==='mine'||type==='dynamite'?2:0;
      this.message=type==='sheep'||type==='superSheep'?'Пробел / ЛКМ — взорвать овечку':'Можно отойти: A/D, W';return true;
    }
    if(type==='sheepLauncher'){this.spawn('sheepLauncher',w.x+w.facing*.9,w.y+.2,w.facing*5,2,20);this.retreat=0;this.message='Пробел / ЛКМ — взорвать овечку';return true;}
    if(['airstrike','napalm','mailstrike','minestrike','moleSquadron'].includes(type)){const dropType=type==='minestrike'?'mine':type==='moleSquadron'?'moleBomb':type==='napalm'?'napalm':type==='mailstrike'?'mailstrike':'bomb';const drops=type==='moleSquadron'?4:6;for(let i=0;i<drops;i++)this.spawn(dropType,THREE.MathUtils.clamp(this.target.x+(i-(drops-1)/2)*2.6,1,MAP.width-1),MAP.height+3+i*1.4,1,-9,type==='minestrike'?Infinity:12);this.resetTarget();return true;}
    if(type==='frenchSheep'||type==='madCows'){const count=type==='frenchSheep'?5:4;for(let i=0;i<count;i++)this.spawn(type==='frenchSheep'?'frenchSheep':'madCow',THREE.MathUtils.clamp(this.target.x+(i-(count-1)/2)*1.8,1,MAP.width-1),MAP.height+3+i,1,-9,20);this.resetTarget();return true;}
    if(type==='carpet'||type==='armageddon'){const count=type==='carpet'?8:12;for(let i=0;i<count;i++)this.spawn(type,THREE.MathUtils.clamp(this.target.x+(i-(count-1)/2)*2.2,1,MAP.width-1),MAP.height+3+i*.7,1,-10,12);this.resetTarget();return true;}
    if(type==='indianTest'){g.waterLevel=(g.waterLevel||0)+3;g.water.visible=true;g.water.scale.y=g.waterLevel;g.water.position.y=g.waterLevel/2-.5;for(const worm of g.worms)if(worm.alive)worm.radiation=Math.max(worm.radiation||0,5);g.createExplosion(this.target.x,this.target.y,4);this.resetTarget();g.turn.settle();return true;}
    if(type==='donkey'){this.spawn('donkey',this.target.x,MAP.height+5,0,-8,12);this.resetTarget();return true;}
    if(type==='banana'||type==='superBanana'||type==='holy'||type==='mbBomb'||type==='petrol'||type==='mingVase'||type==='oldWoman'){
      const launchSpeed=type==='oldWoman'?2:speed,launchY=type==='oldWoman'?0:dy*launchSpeed;
      this.spawn(type,w.x+dx,w.y+dy,dx*launchSpeed,launchY,type==='mbBomb'?12:type==='oldWoman'?5:this.fuse);this.retreat=2;this.message='Можно отойти: A/D, W';return true;
    }
    this.ray.origin.x=w.x;this.ray.origin.y=w.y;this.ray.dir.x=dx;this.ray.dir.y=dy;
    const obstruction=g.world.castRay(this.ray,1.15,true,undefined,undefined,w.collider,w.body);
    const offset=obstruction?Math.max(.65,obstruction.timeOfImpact-.24):1.05;
    this.spawn(type,w.x+dx*offset,w.y+dy*offset,dx*speed,dy*speed,type==='grenade'||type==='cluster'?this.fuse:12);
    return true;
  }
  update(dt) {
    const g=this.g;g.events.drainCollisionEvents(this.onCollision);this.retreat=Math.max(0,this.retreat-dt);this.projectile=null;
    if(this.movementMode){
      this.movementMode.remaining-=dt;
      const w=g.active,mode=this.movementMode.mode;
      if(mode==='jetPack'){
        const x=(g.keys.has('KeyD')||g.keys.has('ArrowRight')?1:0)-(g.keys.has('KeyA')||g.keys.has('ArrowLeft')?1:0);
        const y=(g.keys.has('ArrowUp')||g.keys.has('KeyW')?1:0)-(g.keys.has('ArrowDown')?1:0);
        w.body.setLinvel({x:x*6,y:y*6},true);w.grounded=false;
      } else if(mode==='parachute'){
        const v=w.body.linvel();w.body.setLinvel({x:v.x*.98,y:Math.max(v.y,-1.6)},true);
      } else if(mode==='bungee'){
        const v=w.body.linvel();w.body.setLinvel({x:v.x,y:Math.max(v.y,-4)},true);
      }
      if(this.movementMode.remaining<=0)this.endUtility();
    }
    for(let i=this.hazards.length-1;i>=0;i--){
      const hazard=this.hazards[i];hazard.remaining-=dt;hazard.tick-=dt;
      if(hazard.tick<=0){hazard.tick=1;for(const worm of g.worms)if(worm.alive&&Math.hypot(worm.x-hazard.x,worm.y-hazard.y)<hazard.radius){if(hazard.kind==='poison')worm.poison=Math.max(worm.poison||0,hazard.damage);else g.damage(worm,hazard.damage);}}
      if(hazard.remaining<=0)this.hazards.splice(i,1);
    }
    for(const worm of g.worms)if(worm.alive){
      if(worm.poison>0){worm.poisonTick=(worm.poisonTick||0)-dt;if(worm.poisonTick<=0){worm.poisonTick=1;g.damage(worm,5);worm.poison--;}}
      if(worm.radiation>0){worm.radiationTick=(worm.radiationTick||0)-dt;if(worm.radiationTick<=0){worm.radiationTick=1;g.damage(worm,2);worm.radiation--;}}
    }
    if(this.drilling>0){
      this.drilling=Math.max(0,this.drilling-dt);this.drillTick-=dt;
      if(!g.active.alive)this.drilling=0;
      else if(this.drillTick<=0){this.drillTick=.12;const w=g.active;const horizontal=this.drillDirection;g.createExplosion(w.x+horizontal*.85,w.y-(horizontal?0:.85),1.15);g.particles.emit(w.x+horizontal*.8,w.y-(horizontal?0:.8),.4);w.body.setLinvel(horizontal?{x:horizontal*2.5,y:0}:{x:0,y:-3},true);}
    }
    // All transient projectiles have a bounded lifetime; dormant mines persist between turns.
    for(let i=0;i<this.pool.length;i++){
      const p=this.pool[i];if(!p.active)continue;
      const pos=p.body.translation();p.x=pos.x;p.y=pos.y;p.age+=dt;p.remaining-=dt;
      if((p.type==='homing'||p.type==='pigeon'||p.type==='magicBullet')&&p.age>.35){
        const v=p.body.linvel(),a=Math.atan2(p.targetY-p.y,p.targetX-p.x),current=Math.atan2(v.y,v.x);
        const diff=Math.atan2(Math.sin(a-current),Math.cos(a-current)),angle=current+THREE.MathUtils.clamp(diff,-2.8*dt,2.8*dt);
        this.velocity.x=Math.cos(angle)*22;this.velocity.y=Math.sin(angle)*22;p.body.setLinvel(this.velocity,true);
      }
      if(p.type==='dragonBall'&&p.hit){
        for(const worm of g.worms)if(worm.alive&&worm!==p.owner&&Math.hypot(worm.x-p.x,worm.y-p.y)<1.2){g.damage(worm,30);if(worm.alive)worm.body.applyImpulse({x:p.dir*5,y:2},true);}
        this.remove(p);continue;
      }
      if(p.type==='sheep'||p.type==='superSheep'||p.type==='sheepLauncher'||p.type==='frenchSheep'||p.type==='madCow'){
        const v=p.body.linvel();
        if(p.type==='superSheep'){this.velocity.x=p.dir*8;this.velocity.y=Math.sin(p.age*4)*4;}
        else {this.velocity.x=p.dir*5;this.velocity.y=p.hit&&Math.abs(v.x)<1.5?4:v.y;}
        p.body.setLinvel(this.velocity,true);p.hit=false;
        for(const w of g.worms)if(w.alive&&w!==p.owner&&Math.hypot(w.x-p.x,w.y-p.y)<1.4)p.remaining=0;
      }
      if(p.type==='mine'&&!p.triggered&&p.age>1.5){
        if(!p.owner.alive||Math.hypot(p.owner.x-p.x,p.owner.y-p.y)>2.5)p.ownerClear=true;
        for(const w of g.worms)if(w.alive&&(w!==p.owner||p.ownerClear)&&Math.hypot(w.x-p.x,w.y-p.y)<2){p.triggered=true;p.remaining=.7;g.turn.state=TURN.ACTION_RESOLVING;g.turn.charge=0;g.turn.shots=0;this.retreat=0;break;}
      }
      p.mesh.position.set(p.x,p.y,.2);p.mesh.rotation.z+=dt*(p.type==='sheep'?0:2);
      if(p.type==='mine')p.mesh.material.color.setHex(p.triggered?(Math.floor(p.age*12)%2?0xff3333:0xffffff):0xf1b33c);
      if(p.y < -5 || p.x < -10 || p.x > MAP.width+10){this.remove(p);continue;}
      const impact=p.hit&&(GROUND_PROJECTILES.has(p.type)||p.type==='mortar'||p.type==='donkey'||p.type==='napalm'||p.type==='mailstrike'||p.type==='carpet'||p.type==='armageddon'||p.type==='moleBomb');
      if(p.remaining<=0||impact){this.detonate(p);continue;}
      if(p.type!=='mine')this.projectile=p;
    }
    if(g.turn.state===TURN.ACTION_RESOLVING&&!this.busy())g.turn.settle();
  }
  detonate(p){
    const {x,y,type}=p;this.remove(p);
    if(type==='dragonBall')return;
    const specs={
      bazooka:[3.5,50],homing:[3.5,50],pigeon:[4,75],magicBullet:[4.5,100],mortar:[1.8,35],
      grenade:[3.5,50],cluster:[2.4,25],banana:[3.2,75],superBanana:[4,85],holy:[5,100],
      dynamite:[5,75],mine:[2.8,50],sheep:[4.5,75],superSheep:[4.5,75],sheepLauncher:[4.5,75],
      moleBomb:[2.8,55],bomb:[2.6,30],napalm:[2.2,25],mailstrike:[2.8,45],carpet:[3.5,55],armageddon:[4,70],
      petrol:[2.4,35],mingVase:[3.2,70],mbBomb:[4.5,100],oldWoman:[4,75],donkey:[7,100],fragment:[1.1,18],
      frenchSheep:[4.5,75],madCow:[4.5,75],salvation:[1.8,20],skunk:[2.2,0]
    };
    const [radius,damage]=specs[type]||[3.5,55];this.explode(x,y,radius,damage);
    if(type==='cluster'||type==='banana'||type==='superBanana'){
      const count=type==='cluster'?7:type==='banana'?3:5;
      for(let i=0;i<count;i++){const a=type==='cluster' ? .15+i*(Math.PI-.3)/6 : Math.PI*2*i/count;this.spawn('fragment',x+Math.cos(a)*.5,y+.5,Math.cos(a)*10,Math.sin(a)*10,1.1+Math.random()*.7);}
    }
    if(type==='mortar')for(let i=0;i<5;i++){const a=Math.PI/2+(i-2)*.18;this.spawn('fragment',x,y,Math.cos(a)*8,Math.sin(a)*10,1.2);}
    if(type==='petrol'||type==='napalm')this.hazards.push({kind:'fire',x,y,radius:type==='napalm'?3.5:2.8,damage:type==='napalm'?12:15,remaining:type==='napalm'?4:5,tick:.2});
    if(type==='skunk')this.hazards.push({kind:'poison',x,y,radius:3.5,damage:5,remaining:8,tick:.2});
  }
  explode(x,y,r,damage){
    const g=this.g;g.createExplosion(x,y,r);g.particles.emit(x,y,r);
    for(const w of g.worms)if(w.alive){const pos=w.body.translation(),dx=pos.x-x,dy=pos.y-y,d=Math.hypot(dx,dy),reach=r*1.8;if(d>reach)continue;const f=1-d/reach;g.damage(w,Math.ceil(damage*f));if(w.alive)w.body.applyImpulse({x:dx/Math.max(d,.2)*f*9,y:(dy/Math.max(d,.2)+.6)*f*9},true);}
    for(const p of this.pool)if(p.active&&p.type==='mine'&&Math.hypot(p.x-x,p.y-y)<r*1.5){p.triggered=true;p.remaining=Math.min(p.remaining,.2);}
  }
  fireGun(type){
    const g=this.g,w=g.active,count=type==='handgun'?6:type==='uzi'?10:type==='minigun'?20:2,damage=type==='longbow'?15:5;
    for(let i=0;i<count;i++){
      const spread=w.laserSight||type==='longbow'?0:(Math.random()-.5)*.12;
      const a=g.angle+spread;this.ray.origin.x=w.x;this.ray.origin.y=w.y;this.ray.dir.x=Math.cos(a);this.ray.dir.y=Math.sin(a);
      const hit=g.world.castRay(this.ray,65,true,undefined,undefined,w.collider,w.body);if(!hit)continue;
      const target=g.wormByCollider.get(hit.collider.handle);
      if(target?.alive){g.damage(target,damage);if(target.alive)target.body.applyImpulse({x:this.ray.dir.x*(type==='minigun'?1.6:1),y:this.ray.dir.y*(type==='minigun'?1.6:1)},true);}
      if(type==='longbow'&&target?.alive)target.body.applyImpulse({x:this.ray.dir.x*2.5,y:this.ray.dir.y*2.5},true);
    }
  }
  shotgun(){
    const g=this.g,w=g.active;
    for(let i=0;i<1;i++){
      const a=g.angle+(w.laserSight?0:(Math.random()-.5)*.12);this.ray.origin.x=w.x;this.ray.origin.y=w.y;this.ray.dir.x=Math.cos(a);this.ray.dir.y=Math.sin(a);
      const hit=g.world.castRay(this.ray,65,true,undefined,undefined,w.collider,w.body);if(!hit)continue;
      const x=w.x+this.ray.dir.x*hit.timeOfImpact,y=w.y+this.ray.dir.y*hit.timeOfImpact,target=g.wormByCollider.get(hit.collider.handle);
      if(target?.alive){g.damage(target,25);if(target.alive)target.body.applyImpulse({x:this.ray.dir.x*1.1,y:this.ray.dir.y*1.1+.3},true);}else g.createExplosion(x,y,.45);
      g.particles.emit(x,y,.35);
    }
  }
  dispose(){for(const p of this.pool){p.mesh.removeFromParent();p.mesh.material.dispose();}this.geometry.dispose();this.marker.removeFromParent();this.marker.geometry.dispose();this.marker.material.dispose();}
}
