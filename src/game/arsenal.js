import * as THREE from 'three';
import RAPIER from '@dimforge/rapier2d-compat';
import { MAP, GRAVITY, TURN } from './core.js';

const MAX_FIRE_GLINTS = 12;
const ROCKET_LIGHT_PROJECTILES = new Set(['bazooka', 'homing', 'mortar', 'napalm']);

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
const NINJA_ROPE_MAX_LENGTH=20;
export class Weapons {
  constructor(game) {
    this.g=game;this.fuse=3;this.bounce=.7;this.burst=null;this.cowCount=1;this.flame=null;this.kamikaze=null;this.earthquake=null;this.pendingFirePunch=null;this.pendingBatSwing=null;this.pendingAirLaunches=[];this.projectile=null;this.lastSpawnedProjectile=null;this.retreat=0;this.drilling=0;this.drillTick=0;this.drillAngle=null;this.movementMode=null;this.ropeMiss=null;this.jetPackFuel=100;this.hazards=[];this.message='';this.ropeUsePending=false;this.ropeUseOwner=null;this.ropeUseTeam=null;this.ropeUseAirborne=false;this.ropeUseStarted=false;this.ropeUseStartPosition=null;
    this.ray=new RAPIER.Ray({x:0,y:0},{x:1,y:0});this.velocity={x:0,y:0};this.target={x:48,y:20};this.targetSet=false;
    this.visualBullets=[];this.bulletGeometry=new THREE.CircleGeometry(.075,10);this.bulletMaterial=new THREE.MeshBasicMaterial({color:0xffe08a,transparent:true,depthWrite:false});
    this.byCollider=new Map();this.pool=[];this.geometry=new THREE.PlaneGeometry(1,1);
    for(let i=0;i<160;i++){const mesh=new THREE.Mesh(this.geometry,new THREE.MeshPhongMaterial({color:0xffffff,specular:0x72786a,shininess:34,transparent:true,alphaTest:.08,depthWrite:false,side:THREE.DoubleSide}));mesh.visible=false;game.scene.add(mesh);this.pool.push({active:false,mesh,baseMesh:mesh,rocketMesh:null});}
    this.fireParticles=this.createFireParticleSystem(256);
    this.fireGlintData={
      positions:Array.from({length:MAX_FIRE_GLINTS},()=>new THREE.Vector2()),
      colors:Array.from({length:MAX_FIRE_GLINTS},()=>new THREE.Color('#ff6a1a')),
      strengths:new Float32Array(MAX_FIRE_GLINTS),
      count:0
    };
    this.projectileGlintData={
      positions:Array.from({length:this.pool.length},()=>new THREE.Vector2()),
      colors:Array.from({length:this.pool.length},()=>new THREE.Color('#ffd28a')),
      strengths:new Float32Array(this.pool.length),
      radiusScale:1.6,
      count:0
    };
    const ropeCanvas=document.createElement('canvas');ropeCanvas.width=ropeCanvas.height=64;const ropeCtx=ropeCanvas.getContext('2d');
    ropeCtx.fillStyle='#80603f';ropeCtx.fillRect(0,0,64,64);
    for(let offset=-64;offset<128;offset+=16){ropeCtx.strokeStyle='#c49a66';ropeCtx.lineWidth=7;ropeCtx.beginPath();ropeCtx.moveTo(offset,0);ropeCtx.lineTo(offset+64,64);ropeCtx.stroke();ropeCtx.strokeStyle='#4c3929';ropeCtx.lineWidth=4;ropeCtx.beginPath();ropeCtx.moveTo(offset+7,0);ropeCtx.lineTo(offset+71,64);ropeCtx.stroke();}
    for(let offset=-64;offset<128;offset+=16){ropeCtx.strokeStyle='rgba(218,184,132,.8)';ropeCtx.lineWidth=5;ropeCtx.beginPath();ropeCtx.moveTo(offset,64);ropeCtx.lineTo(offset+64,0);ropeCtx.stroke();ropeCtx.strokeStyle='rgba(54,40,29,.75)';ropeCtx.lineWidth=3;ropeCtx.beginPath();ropeCtx.moveTo(offset+8,64);ropeCtx.lineTo(offset+72,0);ropeCtx.stroke();}
    this.ropeTexture=new THREE.CanvasTexture(ropeCanvas);this.ropeTexture.colorSpace=THREE.SRGBColorSpace;this.ropeTexture.wrapS=THREE.RepeatWrapping;this.ropeTexture.wrapT=THREE.RepeatWrapping;this.ropeTexture.repeat.set(1,2);
    this.ropeMaterial=new THREE.MeshPhongMaterial({map:this.ropeTexture,color:0xffffff,specular:0x392817,shininess:9});
    this.ropeSegmentGeometry=new THREE.CylinderGeometry(.09,.09,1,8,1);
    this.ropeJointGeometry=new THREE.SphereGeometry(.09,8,6);
    this.tether=new THREE.Group();this.tether.frustumCulled=false;this.tether.visible=false;this.ropeSegments=[];this.ropeJoints=[];game.scene.add(this.tether);
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
    this.girderPreview=this.createGirderPreview();
    this.girderPreview.visible=false;
    game.scene.add(this.girderPreview);
    this.onCollision=(a,b,started)=>{
      if(!started)return;
      const p=this.byCollider.get(a),q=this.byCollider.get(b);
      if(p?.type==='fragment'&&q?.type==='fragment')return;
      const wormB=this.g.wormByCollider.get(b),wormA=this.g.wormByCollider.get(a);
      if(p&&p.type!=='flameShot'&&!(p.type==='arrow'&&p.stuck)&&!(p.type==='arrow'&&(p.hitColliders?.has(b)||wormB&&p.hitWorms?.has(wormB)))&&!(p.ignoreOwner&&wormB===p.ignoreOwner)){
        p.hit=true;
        if(p.type==='arrow'||p.type==='dragonBall'){p.hitCollider=b;p.hitWorm=wormB||p.hitWorm;}
        if(p.type==='moleBomb'&&wormB)p.hitWorm=wormB;
      }
      if(q&&q.type!=='flameShot'&&!(q.type==='arrow'&&q.stuck)&&!(q.type==='arrow'&&(q.hitColliders?.has(a)||wormA&&q.hitWorms?.has(wormA)))&&!(q.ignoreOwner&&wormA===q.ignoreOwner)){
        q.hit=true;
        if(q.type==='arrow'||q.type==='dragonBall'){q.hitCollider=a;q.hitWorm=wormA||q.hitWorm;}
        if(q.type==='moleBomb'&&wormA)q.hitWorm=wormA;
      }
    };
  }
  isGirder(type=this.g.turn.weapon){return type==='girder'||type==='girderPack';}
  createGirderPreview(){
    const group=new THREE.Group();
    group.renderOrder=45;
    const dark=new THREE.MeshPhongMaterial({color:0x202a31,specular:0x77838a,shininess:36,side:THREE.DoubleSide});
    const steel=new THREE.MeshPhongMaterial({color:0x82929b,specular:0xdce8ed,shininess:68,side:THREE.DoubleSide});
    const flange=new THREE.MeshPhongMaterial({color:0xb5c2c6,specular:0xffffff,shininess:84,side:THREE.DoubleSide});
    const addBox=(width,height,depth,material,y,z)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),material);mesh.position.set(0,y,z);mesh.renderOrder=45;group.add(mesh);return mesh;};
    addBox(3.58,.4,.08,dark,0,0);
    addBox(3.48,.31,.08,steel,0,.045);
    addBox(3.42,.075,.045,dark,0,.09);
    addBox(3.48,.055,.045,flange,.125,.1);
    addBox(3.48,.055,.045,flange,-.125,.1);
    for(let i=0;i<8;i++)for(const side of [-1,1]){
      const bolt=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.025,8),dark);
      bolt.rotation.x=Math.PI/2;
      bolt.position.set(-1.48+i*.423,side*.126,.137);
      bolt.renderOrder=46;
      group.add(bolt);
    }
    return group;
  }
  moveGirderPreview(x,y,angle=this.g.angle){
    if(!this.isGirder())return;
    this.target.x=THREE.MathUtils.clamp(x,.7,MAP.width-.7);
    this.target.y=THREE.MathUtils.clamp(y,.8,MAP.height-1);
    this.girderPreview.position.set(this.target.x,this.target.y,.65);
    this.girderPreview.rotation.z=angle;
    this.girderPreview.visible=true;
  }
  resetTarget(){this.targetSet=false;this.marker.visible=false;this.girderPreview.visible=false;this.message='';}
  setTarget(x,y){this.target.x=THREE.MathUtils.clamp(x,.7,MAP.width-.7);this.target.y=THREE.MathUtils.clamp(y,.8,MAP.height-1);this.targetSet=true;if(this.isGirder()){this.moveGirderPreview(this.target.x,this.target.y);this.marker.visible=false;}else{this.marker.position.set(this.target.x,this.target.y,.5);this.marker.visible=true;}this.message='Цель выбрана';}
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
  needsCharge(type){return ['bazooka','homing','sheepLauncher','grenade','cluster','banana','superBanana','holy','petrol'].includes(type);}
  usesTarget(type){return TARGET_WEAPONS.has(type)||type==='teleport';}
  spawn(type,x,y,vx,vy,remaining=3){
    const p=this.pool.find(item=>!item.active);if(!p)return null;
    const radius=type==='arrow'?.08:(type==='sheep'||type==='superSheep'||type==='pigeon') ? .38 : type==='mbBomb'?.48 : type==='moleBomb'?.28 : type==='fragment' ? .12 : .23;
    const body=this.g.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x,y).setLinearDamping(type==='dynamite'?8:0).setCcdEnabled(true));
    if(type==='flameShot'||type==='dragonBall'||type==='mailstrike'||type==='mbBomb')body.setGravityScale(0,true);
    if(type==='napalm')body.setGravityScale(1.35,true);
    const bounce=(type==='grenade'||type==='cluster'||type==='banana'||type==='superBanana') ? Math.min(this.bounce, .28) : type==='holy' ? .2 : type==='fragment' ? .15 : 0;
    const colliderDescription=(type==='arrow'?RAPIER.ColliderDesc.cuboid(.48,.055):RAPIER.ColliderDesc.ball(radius)).setMass(.4).setRestitution(bounce).setFriction(type==='arrow'?.8:.05).setSensor(type==='flameShot').setActiveEvents(type==='flameShot'?0:RAPIER.ActiveEvents.COLLISION_EVENTS);
    // Мина срабатывает по радиусу, а не от физического контакта с бойцом.
    // Поэтому она должна лежать под ним спокойно и не выталкивать его сразу
    // после установки; с землёй при этом столкновение сохраняется.
    if(type==='dynamite')colliderDescription.setCollisionGroups(0x00100001);
    if(type==='mine')colliderDescription.setCollisionGroups(0x00200001);
    const collider=this.g.world.createCollider(colliderDescription,body);
    if(this.dropping){vx=this.g.active.body.linvel().x;vy=this.g.active.body.linvel().y;}
    if(type==='pigeon'){const launchAngle=Math.atan2(vy,vx);vx=Math.cos(launchAngle)*22;vy=Math.sin(launchAngle)*22;body.setGravityScale(0,true);}
    if(type==='mailstrike'){vx=this.g.wind*.6;vy=-6.4;}
    if(type==='arrow')body.setRotation(Math.atan2(vy,vx),true);
    this.velocity.x=vx;this.velocity.y=vy;body.setLinvel(this.velocity,true);
    if(['bazooka','sheepLauncher','mailstrike'].includes(type))body.addForce({x:this.g.wind*body.mass(),y:0},true);
    const homingSpeed=Math.hypot(vx,vy);
    Object.assign(p,{active:true,body,collider,type,remaining,age:0,x,y,hit:false,stuck:false,hitCollider:null,hitWorm:null,hitColliders:new Set(),hitWorms:new Set(),arrowVelocity:{x:vx,y:vy},arrowAngle:Math.atan2(vy,vx),homingComplete:false,homingStartX:x,homingStartY:y,homingArmingDistance:type==='pigeon'?4:5+THREE.MathUtils.clamp((homingSpeed-8)/24,0,1)*12,targetApproachDistance:Infinity,targetClosestDistance:Infinity,targetApproached:false,targetRecedeTime:0,restingTime:0,triggered:false,waitForMineDetonation:false,fromMoleSquadron:false,mbBombFlightSoundPending:false,mineAudio:null,launchAudios:[],airRaidGroup:null,owner:this.g.active,ownerClear:false,dir:this.g.active?.facing||1,targetX:this.target.x,targetY:this.target.y,homingSpeed,runFuseStarted:false,flightStartX:x,flightStartY:y,flightArmed:false,jumpCooldown:0,baaAudio:null,baaTimer:0,flyAudio:null,fuseLabel:p.fuseLabel||null,fuseValue:p.fuseValue||null,gas:false,stage:'walking',heading:Math.PI/2,damageOverride:null,radiusOverride:null,remoteFragment:false,tick:0,bounces:0,delay:0,flameStartX:x,flameStartY:y,flameVx:vx,flameInitialVy:vy,flameDrop:0,flameDistance:5.33,flameWobbleAmp:.45+Math.random()*.25,flameWobbleFreq:10+Math.random()*5,flameWobblePhase:Math.random()*2*Math.PI,flameWobblePhase2:Math.random()*2*Math.PI,mailSwayPhase:Math.random()*Math.PI*2,mailSwayFrequency:1.35+Math.random()*.4,mailSwayAmplitude:2.6+Math.random()*.6,napalmPhase:Math.random()*2*Math.PI});
    if(type==='sheep'||type==='superSheep'||type==='sheepLauncher'||type==='moleBomb'){
      if(type!=='moleBomb')p.baaAudio=this.g.audio?.play('sheepBaa')||null;
      if(!p.fuseLabel){
        p.fuseLabel=document.createElement('span');
        p.fuseLabel.className='jetpack-fuel-indicator sheep-fuse-indicator';
        p.fuseValue=document.createElement('strong');
        p.fuseLabel.append(p.fuseValue);
        this.g.labels.append(p.fuseLabel);
      }
      p.fuseLabel.hidden=true;
    }else if(p.fuseLabel)p.fuseLabel.hidden=true;
    this.g.weaponArt.projectile(p,type,radius);p.mesh.position.set(x,y,.2);p.mesh.visible=true;
    this.byCollider.set(collider.handle,p);this.lastSpawnedProjectile=p;return p;
  }
  attachLaunchAudio(p,audio){if(!p||!audio)return audio;if(!Array.isArray(p.launchAudios))p.launchAudios=p.launchAudios?[p.launchAudios]:[];p.launchAudios.push(audio);return audio;}
  remove(p,preserveSmoke=false){this.byCollider.delete(p.collider.handle);this.g.world.removeRigidBody(p.body);p.active=false;this.g.audio?.stopPlayback(p.baaAudio);this.g.audio?.stopPlayback(p.flyAudio);this.g.audio?.stopPlayback(p.mineAudio);for(const audio of p.launchAudios||[])this.g.audio?.stopPlayback(audio);if(p.airRaidGroup){const group=p.airRaidGroup;p.airRaidGroup=null;if(--group.remaining<=0)this.g.audio?.stopPlayback(group.audio);}p.baaAudio=null;p.flyAudio=null;p.mineAudio=null;p.launchAudios=[];if(p.fuseLabel)p.fuseLabel.hidden=true;if(p.rocketMesh){if(preserveSmoke)this.g.weaponArt.detachRocketSmoke(p);else this.g.weaponArt.hideRocket(p);}p.mesh.visible=false;}
  removeArrowsInBlast(x,y,radius){for(const p of this.pool)if(p.active&&p.type==='arrow'&&Math.hypot(p.x-x,p.y-y)<=radius)this.remove(p);}
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
  busy(){
    if(this.pendingAirLaunches.length||this.pendingBatSwing||this.drilling>0||this.retreat>0||this.movementMode||this.ropeMiss||this.burst||this.flame||this.kamikaze||this.earthquake||this.pendingFirePunch||this.hazards.some(h=>h.kind==='fire'))return true;
    for(const p of this.pool){
      if(!p.active||(p.type==='arrow'&&p.stuck))continue;
      if(p.type!=='mine')return true;
      const moving=Math.hypot(p.body.linvel().x,p.body.linvel().y)>.2;
      if(p.waitForMineDetonation?(p.triggered||p.age<1.5||moving):(!p.triggered&&(p.age<1.5||moving)))return true;
    }
    return false;
  }
  scheduleAirLaunch(launch){this.pendingAirLaunches.push({remaining:1,launch});}
  ropeSegmentBlocked(from,to,owner){
    const dx=to.x-from.x,dy=to.y-from.y,distance=Math.hypot(dx,dy);
    if(distance<.16)return false;
    const nx=dx/distance,ny=dy/distance,offset=.08;
    this.ray.origin.x=from.x+nx*offset;this.ray.origin.y=from.y+ny*offset;this.ray.dir.x=nx;this.ray.dir.y=ny;
    const maxDistance=distance-offset-.08;if(maxDistance<=0)return null;
    const hit=this.g.world.castRay(this.ray,maxDistance,true,undefined,undefined,owner.collider,owner.body,c=>!this.g.wormByCollider.has(c.handle)&&!this.byCollider.has(c.handle));
    return Boolean(hit);
  }
  findRopeWrapPath(from,to,owner){
    const terrain=this.g.terrain;if(!terrain)return null;
    const step=.3,cols=Math.ceil(MAP.width/step),rows=Math.ceil(MAP.height/step),mask=terrain.captureCollisionMask(),blocked=new Uint8Array(cols*rows),known=new Uint8Array(cols*rows);
    const cellAt=(x,y)=>({x:THREE.MathUtils.clamp(Math.floor(x/step),0,cols-1),y:THREE.MathUtils.clamp(Math.floor((MAP.height-y)/step),0,rows-1)});
    const idAt=(x,y)=>y*cols+x;
    const centerOf=id=>({x:((id%cols)+.5)*step,y:MAP.height-((Math.floor(id/cols)+.5)*step)});
    const isBlocked=(x,y)=>{
      if(x<0||x>=cols||y<0||y>=rows)return true;
      const id=idAt(x,y);if(known[id])return Boolean(blocked[id]);known[id]=1;
      const p=centerOf(id),clearance=.11;
      blocked[id]=terrain.isSolid(p.x,p.y,mask)||terrain.isSolid(p.x-clearance,p.y,mask)||terrain.isSolid(p.x+clearance,p.y,mask)||terrain.isSolid(p.x,p.y-clearance,mask)||terrain.isSolid(p.x,p.y+clearance,mask)?1:0;
      return Boolean(blocked[id]);
    };
    const nearestClear=point=>{
      const start=cellAt(point.x,point.y);if(!isBlocked(start.x,start.y))return start;
      for(let radius=1;radius<=5;radius++)for(let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++)if(Math.max(Math.abs(x),Math.abs(y))===radius&&!isBlocked(start.x+x,start.y+y))return{x:start.x+x,y:start.y+y};
      return null;
    };
    const start=nearestClear(from),goal=nearestClear(to);if(!start||!goal)return null;
    const startId=idAt(start.x,start.y),goalId=idAt(goal.x,goal.y),count=cols*rows,gScore=new Float32Array(count),cameFrom=new Int32Array(count),closed=new Uint8Array(count);gScore.fill(Infinity);cameFrom.fill(-1);gScore[startId]=0;
    const heapIds=[],heapScores=[];
    const push=(id,score)=>{let i=heapIds.length;heapIds.push(id);heapScores.push(score);while(i>0){const parent=(i-1)>>1;if(heapScores[parent]<=score)break;heapIds[i]=heapIds[parent];heapScores[i]=heapScores[parent];i=parent;}heapIds[i]=id;heapScores[i]=score;};
    const pop=()=>{const id=heapIds[0],lastId=heapIds.pop(),lastScore=heapScores.pop();if(heapIds.length){let i=0;while(true){const left=i*2+1,right=left+1;if(left>=heapIds.length)break;const child=right<heapIds.length&&heapScores[right]<heapScores[left]?right:left;if(heapScores[child]>=lastScore)break;heapIds[i]=heapIds[child];heapScores[i]=heapScores[child];i=child;}heapIds[i]=lastId;heapScores[i]=lastScore;}return id;};
    const heuristic=(x,y)=>{const dx=Math.abs(goal.x-x),dy=Math.abs(goal.y-y);return Math.max(dx,dy)+(Math.SQRT2-1)*Math.min(dx,dy);};
    const directions=[[-1,0,1],[1,0,1],[0,-1,1],[0,1,1],[-1,-1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[1,1,Math.SQRT2]];
    push(startId,heuristic(start.x,start.y));let found=false,iterations=0;
    while(heapIds.length&&iterations++<24000){const current=pop();if(closed[current])continue;if(current===goalId){found=true;break;}closed[current]=1;const cx=current%cols,cy=Math.floor(current/cols);
      for(const[dx,dy,cost]of directions){const x=cx+dx,y=cy+dy;if(isBlocked(x,y)||closed[idAt(x,y)])continue;if(dx&&dy&&(isBlocked(cx+dx,cy)||isBlocked(cx,cy+dy)))continue;const next=idAt(x,y),tentative=gScore[current]+cost;if(tentative>=gScore[next])continue;cameFrom[next]=current;gScore[next]=tentative;push(next,tentative+heuristic(x,y));}
    }
    if(!found)return null;
    const cells=[goalId];for(let id=goalId;id!==startId;){id=cameFrom[id];if(id<0)return null;cells.push(id);}cells.reverse();
    const waypoints=[];let previousDirection=null;
    for(let i=1;i<cells.length;i++){
      const a=cells[i-1],b=cells[i],ax=a%cols,ay=Math.floor(a/cols),bx=b%cols,by=Math.floor(b/cols);
      const direction=`${Math.sign(bx-ax)},${Math.sign(by-ay)}`;
      if(previousDirection!==null&&direction!==previousDirection)waypoints.push(centerOf(a));
      previousDirection=direction;
    }
    const goalCenter=centerOf(goalId);if(Math.hypot(goalCenter.x-to.x,goalCenter.y-to.y)>.18)waypoints.push(goalCenter);
    return waypoints.filter(point=>Math.hypot(point.x-from.x,point.y-from.y)>.18&&Math.hypot(point.x-to.x,point.y-to.y)>.18);
  }
  updateTether(path){
    const segmentCount=Math.max(0,path.length-1);
    while(this.ropeSegments.length<segmentCount){
      const texture=this.ropeTexture.clone();texture.needsUpdate=true;
      const material=this.ropeMaterial.clone();material.map=texture;
      const mesh=new THREE.Mesh(this.ropeSegmentGeometry,material);mesh.frustumCulled=false;this.tether.add(mesh);this.ropeSegments.push(mesh);
    }
    while(this.ropeSegments.length>segmentCount){const mesh=this.ropeSegments.pop();this.tether.remove(mesh);mesh.material.map.dispose();mesh.material.dispose();}
    while(this.ropeJoints.length<path.length){const joint=new THREE.Mesh(this.ropeJointGeometry,this.ropeMaterial);joint.frustumCulled=false;this.tether.add(joint);this.ropeJoints.push(joint);}
    while(this.ropeJoints.length>path.length){this.tether.remove(this.ropeJoints.pop());}
    let totalLength=0;
    for(let i=0;i<segmentCount;i++){
      const a=path[i],b=path[i+1],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);totalLength+=length;
      const mesh=this.ropeSegments[i];mesh.position.set((a.x+b.x)/2,(a.y+b.y)/2,.32);mesh.scale.y=length;
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(dx/Math.max(length,.001),dy/Math.max(length,.001),0));
      mesh.material.map.repeat.set(1,Math.max(1,length*2.2));
    }
    for(let i=0;i<path.length;i++)this.ropeJoints[i].position.set(path[i].x,path[i].y,.32);
    this.tether.visible=segmentCount>0;return totalLength;
  }
  resolveBatSwing(swing){
    const {owner,dx,dy}=swing,g=this.g;
    g.audio?.play('baseballBatHit');
    for(const other of g.worms)if(other.alive&&other!==owner){
      const x=other.x-owner.x,y=other.y-owner.y,distance=Math.hypot(x,y),forward=x*dx+y*dy,side=Math.abs(x*dy-y*dx);
      if(forward>=-.3&&distance<2.8&&side<.85){
        g.damage(other,20);g.releaseDamagePopups(other);
        if(other.alive&&!other.frozen)other.body.applyImpulse({x:dx*18,y:dy*18+10},true);
      }
    }
  }
  remote(){
    const owned=this.pool.filter(p=>p.active&&p.owner===this.g.active);
    const squadronMoles=owned.filter(p=>p.type==='moleBomb'&&p.fromMoleSquadron);
    if(squadronMoles.length){for(const p of squadronMoles)if(p.stage!=='squadronFlight')p.remaining=0;return true;}
    const fragments=owned.filter(p=>p.remoteFragment);
    if(fragments.length){for(const p of fragments)p.remaining=0;return true;}
    for(const p of owned){
      if(p.type==='superSheep'&&p.stage==='walking'){p.stage='flying';p.heading=Math.PI/2;p.remaining=10;p.flightStartX=p.x;p.flightStartY=p.y;p.flightArmed=false;p.hit=false;p.body.setGravityScale(0,true);this.g.audio?.stopPlayback(p.baaAudio);p.baaAudio=null;p.baaTimer=0;this.attachLaunchAudio(p,this.g.audio?.play('superSheepTakeoff'));this.g.weaponArt.projectile(p,'superSheepFlying',.38);this.g.weaponArt.enableSuperSheepSmoke(p);return true;}
      if(p.type==='moleBomb'&&p.stage==='walking'){p.stage='burrowing';p.body.setLinvel({x:0,y:-3},true);p.hit=false;return true;}
      if(p.type==='skunk'&&!p.gas){p.gas=true;return true;}
      if(['sheep','superSheep','sheepLauncher','superBanana','moleBomb','salvation','skunk'].includes(p.type)){p.remaining=0;return true;}
    }
    if(this.movementMode){this.endUtility(false);return true;}
    return false;
  }
  continueTurn(){this.g.turn.charge=0;this.g.turn.state=TURN.WAITING_INPUT;}
  beginUtility(mode,duration=45){if(mode==='jetPack')this.jetPackFuel=100;this.movementMode={mode,remaining:duration,owner:this.g.active,airborne:false};this.continueTurn();}
  createFireHazard(x,y,radius,damage,duration=6,surfaceY=null,density=1,spread=1,airburst=false){
    // Любой источник огня использует одну и ту же точку ближайшей поверхности:
    // бутылка, напалм, авиаудар, ящик и огнемёт не имеют отдельных правил.
    const hazard={kind:'fire',x,y,radius,damage,remaining:duration,duration,tick:0,tickInterval:1,age:0,smokeRemaining:0,groundDamageIndex:0,particleSlots:[],waitForLanding:airburst,ignited:!airburst,windAffected:airburst};
    const system=this.fireParticles;
    const particleCount=Math.min(72,Math.max(8,Math.round(radius*5*density)));
    for(let i=0;i<particleCount;i++){
      let p=null;for(let attempt=0;attempt<system.maxParticles;attempt++){const candidate=system.particles[system.next];system.next=(system.next+1)%system.maxParticles;if(!candidate.active){p=candidate;break;}}
      if(!p)break;
      hazard.particleSlots.push(p);p.active=true;p.grounded=false;p.supportCheck=0;p.smokeStarted=false;p.smokeAge=0;p.renderY=y;p.life=duration;p.maxLife=duration;p.flightSpeed=airburst?.55+Math.random()*1.4:1;p.windFactor=airburst?.9+Math.random()*.2:1;p.x=x+(Math.random()-.5)*radius*(airburst?2:1.4)*spread;p.y=y+(airburst?(Math.random()-.5)*radius*.3:.15+Math.random()*.25)*spread;p.vx=(Math.random()-.5)*radius*(airburst?.4:.22)*spread*p.flightSpeed;p.vy=airburst?(-2.2-Math.random()*1.6)/6*p.flightSpeed:-2.2;p.size=7+Math.random()*10+radius*1.5;p.seed=Math.random()*10;
    }
    this.hazards.push(hazard);return hazard;
  }
  createDragonField(x,y,direction=1){
    const mesh=new THREE.Group();mesh.position.set(x,y,.34);mesh.renderOrder=18;
    const materials=[];
    const add=(geometry,color,opacity,z)=>{
      const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,depthTest:false,side:THREE.DoubleSide});
      material.userData.baseOpacity=opacity;materials.push(material);
      const part=new THREE.Mesh(geometry,material);part.position.z=z;part.renderOrder=18;mesh.add(part);
    };
    add(new THREE.CircleGeometry(1.18,48),0x28aaff,.13,0);
    [1.24,1.12,1,.88,.76].forEach((radius,index)=>add(
      new THREE.RingGeometry(radius-.009,radius+.009,96),
      index%2?0x318dff:0x7cecff,
      index===0?.72:.42,
      .01+index*.003
    ));
    this.g.scene.add(mesh);
    const hazard={kind:'dragonField',x,y,radius:1.25,remaining:.9,age:0,pushDirection:direction,pushedWorms:new Set(),mesh,materials};
    this.hazards.push(hazard);return hazard;
  }
  pushFromDragonField(hazard,worm,force=false){
    if(!worm?.alive||worm.frozen||hazard.pushedWorms.has(worm))return;
    const position=worm.body.translation(),dx=position.x-hazard.x,dy=position.y-hazard.y,distance=Math.hypot(dx,dy);
    const growth=1+THREE.MathUtils.clamp(hazard.age/.55,0,1);
    if(!force&&distance>hazard.radius*growth+.55)return;
    const nx=distance>.08?dx/distance:hazard.pushDirection,ny=distance>.08?dy/distance:0;
    const velocity=worm.body.linvel();worm.knockedDown=true;worm.impactVelocityX=velocity.x;worm.impactSpinDirection=nx<0?-1:1;worm.tumbleRotation=worm.mesh.rotation.z;worm.slideTime=Math.max(worm.slideTime,.7);
    worm.grounded=false;worm.body.setLinvel({x:nx*18,y:Math.max(12,(ny*14+6)*1.5)},true);hazard.pushedWorms.add(worm);
  }
  detonateSupplyCrates(x,y,radius){
    const g=this.g;if(!g.supplyCrates?.length||g.supplyCrateChainReaction)return;
    const targets=g.supplyCrates.filter(crate=>Math.hypot(crate.x-x,crate.y-y)<=radius+1.05);if(!targets.length)return;
    g.supplyCrateChainReaction=true;
    try{for(const crate of targets){const index=g.supplyCrates.indexOf(crate);if(index<0)continue;const cx=crate.x,cy=crate.y;crate.dispose();g.supplyCrates.splice(index,1);this.createFireHazard(cx,cy,2.5,12,6);this.explode(cx,cy,1.8,30);}}finally{g.supplyCrateChainReaction=false;}
  }
  finishRopeUse(){
    if(!this.ropeUsePending)return;
    this.g.consumeWeapon('ninjaRope',this.ropeUseTeam);
    this.ropeUsePending=false;this.ropeUseOwner=null;this.ropeUseTeam=null;this.ropeUseAirborne=false;this.ropeUseStarted=false;this.ropeUseStartPosition=null;
  }
  updateRopeUse(forceGroundStop=false){
    if(!this.ropeUsePending)return;
    const owner=this.ropeUseOwner;
    if(!owner?.alive){this.finishRopeUse();return;}
    if(!owner.grounded){this.ropeUseAirborne=true;return;}
    const velocity=owner.body.linvel();
    const movedFromStart=this.ropeUseStartPosition&&Math.hypot(owner.x-this.ropeUseStartPosition.x,owner.y-this.ropeUseStartPosition.y)>.3;
    if(movedFromStart)this.ropeUseStarted=true;
    if(forceGroundStop||this.ropeUseAirborne||(this.ropeUseStarted&&Math.hypot(velocity.x,velocity.y)<.55))this.finishRopeUse();
  }
  endUtility(finish=false){
    const wasRope=this.movementMode?.mode==='rope',drilling=this.drilling>0;this.drilling=0;this.movementMode=null;this.tether.visible=false;this.message='';
    if(!this.g.turn)return;
    if(finish)this.finishRopeUse();else this.updateRopeUse(wasRope&&this.ropeUseOwner?.grounded);
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
    const g=this.g,m=this.movementMode;if(!m){this.updateRopeUse();return;}
    const w=m.owner;
    if(!w.alive||w!==g.active||g.turn.remaining<=0){this.endUtility(true);return;}
    const x=(g.keys.has('KeyD')||g.keys.has('ArrowRight')?1:0)-(g.keys.has('KeyA')||g.keys.has('ArrowLeft')?1:0);
    const y=(g.keys.has('KeyW')||g.keys.has('ArrowUp')?1:0)-(g.keys.has('KeyS')||g.keys.has('ArrowDown')?1:0);
    const v=w.body.linvel(),pos=w.body.translation();
    if(!w.grounded&&m.mode!=='bungee')m.airborne=true;
    if(m.mode==='jetPack'){
      if(x||y>0||m.retreat){m.remaining-=dt*4;this.jetPackFuel=THREE.MathUtils.clamp(m.remaining/30*100,0,100);}
      w.body.setLinvel({x:THREE.MathUtils.clamp(v.x+x*18*dt,-7,7),y:THREE.MathUtils.clamp(v.y+Math.max(0,y)*24*dt,-9,8)},true);
      if(x||y>0)g.particles.emit(pos.x-w.facing*.45,pos.y-.7,.12);
      this.message='WASD/стрелки — тяга · пробел — снять · X — сбросить оружие';
    }else if(m.mode==='parachute'){
      if(v.y<0)w.body.setLinvel({x:THREE.MathUtils.clamp(v.x+(x*5+g.wind)*dt,-5,5),y:Math.max(v.y,-(y<0?3:y>0?1:1.6))},true);
      if(m.airborne&&w.grounded){this.endUtility();return;}
      m.remaining-=dt;
    }else if(m.mode==='rope'){
      m.length=THREE.MathUtils.clamp(m.length-y*5*dt,1.5,NINJA_ROPE_MAX_LENGTH);
      const dx=pos.x-m.anchor.x,dy=pos.y-m.anchor.y,d=Math.max(.01,Math.hypot(dx,dy)),nx=dx/d,ny=dy/d;
      const outward=Math.max(0,v.x*nx+v.y*ny),stretch=Math.max(0,d-m.length),pull=stretch*100+outward*(d>=m.length?10:0);
      w.body.applyImpulse({x:(x*8-nx*pull)*dt*w.body.mass(),y:-ny*pull*dt*w.body.mass()},true);
      const swingAngle=Math.atan2(dy,dx);
      if(m.swingLastAngle!==undefined&&dt>0){let angleDelta=swingAngle-m.swingLastAngle;if(angleDelta>Math.PI)angleDelta-=Math.PI*2;else if(angleDelta< -Math.PI)angleDelta+=Math.PI*2;const angularSpeed=angleDelta/dt,direction=angularSpeed>.7?1:angularSpeed<-.7?-1:0;if(direction&&m.swingDirection&&direction!==m.swingDirection&&m.swingTurnCooldown<=0){g.audio?.play('ropeSwingTurn');m.swingTurnCooldown=.2;}if(direction)m.swingDirection=direction;}
      m.swingLastAngle=swingAngle;m.swingTurnCooldown=Math.max(0,(m.swingTurnCooldown||0)-dt);
      this.updateTether([{x:m.anchor.x,y:m.anchor.y},{x:pos.x,y:pos.y}]);
      this.message='A/D или ←/→ — раскачиваться · W/S — длина верёвки · пробел — отпустить';
      m.remaining-=dt;
    }else if(m.mode==='bungee'){
      if(w.grounded){
        if(m.jumped)m.jumped=false;
        const groundY=g.terrain?.landingHeight(pos.x,.08,0);
        if(w.grounded&&Number.isFinite(groundY))m.anchor={x:pos.x,y:groundY};
        this.tether.visible=false;
        this.message='A/D или ←/→ — идти к краю; банджи зацепится при падении с края';
        return;
      }
      if(v.y>.35)m.jumped=true;
      if(m.jumped||v.y>=-.1){this.tether.visible=false;this.message='Банджи цепляется только при падении с края';return;}
      m.airborne=true;
      m.length=THREE.MathUtils.clamp(m.length-y*5*dt,1.5,35);
      m.path=m.path||[{x:m.anchor.x,y:m.anchor.y}];
      while(m.path.length>1&&!this.ropeSegmentBlocked(m.path[m.path.length-2],pos,w))m.path.pop();
      const lastNode=m.path[m.path.length-1];
      if(this.ropeSegmentBlocked(lastNode,pos,w)&&m.path.length<64){const wrapPath=this.findRopeWrapPath(lastNode,pos,w);if(wrapPath?.length)m.path.push(...wrapPath);}
      const pullNode=m.path[m.path.length-1],dx=pos.x-pullNode.x,dy=pos.y-pullNode.y,d=Math.max(.01,Math.hypot(dx,dy)),nx=dx/d,ny=dy/d;
      const pathLength=this.updateTether([...m.path,{x:pos.x,y:pos.y}]);
      const outward=Math.max(0,v.x*nx+v.y*ny),stretch=Math.max(0,pathLength-m.length);
      const pull=stretch*(m.mode==='bungee'?35:100)+outward*(d>=m.length?10:0);
      w.body.applyImpulse({x:(x*8-nx*pull)*dt*w.body.mass(),y:-ny*pull*dt*w.body.mass()},true);
      m.remaining-=dt;
    }else m.remaining-=dt;
    if(m.remaining<=0)this.endUtility(g.turn.state!==TURN.WAITING_INPUT);
    else this.updateRopeUse();
  }
  performFirePunch(w){
    const g=this.g;
    if(!w?.alive)return;
    for(const other of g.worms)if(other.alive&&other!==w){
      const x=other.x-w.x,y=other.y-w.y;
      if(x*w.facing>=-.3&&Math.hypot(x,y)<1.6){
        g.damage(other,30);g.releaseDamagePopups(other);
        if(other.alive&&!other.frozen)other.body.applyImpulse({x:w.facing*8,y:14},true);
      }
    }
    const currentVelocity=w.body.linvel();
    w.body.setLinvel({x:currentVelocity.x,y:7.5},true);
    w.grounded=false;w.airbornePeakY=w.y;
  }
  fire(type,charge) {
    const g=this.g,w=g.active,dx=Math.cos(g.angle),dy=Math.sin(g.angle),baseSpeed=this.needsCharge(type)?0.25+charge*31.75:8+charge*24,speed=baseSpeed*(THROWN_GRENADES.has(type)?1.2:1);
    this.lastSpawnedProjectile=null;
    this.message='';
    if(!Object.hasOwn(ARSENAL,type)&&type!=='uppercut'){this.message='Неизвестное оружие';return false;}
    let freeSlots=0;for(const item of this.pool)if(!item.active)freeSlots++;
    const transientCount=type==='frenchSheep'?5:type==='madCows'?this.cowCount:type==='carpet'?8:type==='armageddon'?12:type==='airstrike'?5:type==='napalm'||type==='mailstrike'||type==='minestrike'?6:type==='moleSquadron'?4:1;
    const noProjectile=new Set(['teleport','flamethrower','skipGo','surrender','selectWorm','freeze','scales','lowGravity','fastWalk','laserSight','invisibility','firePunch','battleAxe','baseballBat','prod','kamikaze','suicideBomber','earthquake','drill','pneumaticDrill','blowTorch','girder','girderPack','ninjaRope','bungee','parachute','jetPack','uppercut','shotgun','handgun','uzi','minigun','indianTest']);
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
    if(type==='salvation'||type==='skunk'||type==='oldWoman'||type==='moleBomb'){const projectile=this.spawn(type,w.x+w.facing,w.y+.2,w.facing*2,0,type==='moleBomb'?10:5);if(type==='moleBomb')this.attachLaunchAudio(projectile,g.audio?.play('moleBombLaunch'));return true;}
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
    if(type==='dragonBall'){const ball=this.spawn('dragonBall',w.x+dx*1.15,w.y+dy*1.15,dx*12,dy*12,1.6);if(ball){ball.ignoreOwner=w;ball.dir=dx<0?-1:1;}g.turn.settle();return true;}
    if(type==='firePunch'){
      const ninjaSound=g.audio?.play('firePunchNinja');
      if(ninjaSound)this.pendingFirePunch={owner:w,audio:ninjaSound};
      else{g.audio?.play('firePunchHit');this.performFirePunch(w);g.turn.settle();}
      return true;
    }
    if(type==='baseballBat'){
      this.pendingBatSwing={owner:w,dx,dy,elapsed:0,hit:false};return true;
    }
    if(type==='battleAxe'||type==='prod'){
      for(const other of g.worms)if(other.alive&&other!==w){const x=other.x-w.x,y=other.y-w.y;if(x*w.facing>=-.3&&Math.hypot(x,y)<2.8){g.damage(other,type==='prod'?1:Math.max(1,Math.floor(other.hp/2)));if(other.alive&&!other.frozen)other.body.applyImpulse(type==='battleAxe'?{x:0,y:-2}:{x:w.facing*9.6,y:3.2},true);}}
      g.turn.settle();return true;
    }
    if(type==='kamikaze'){this.kamikaze={owner:w,dx:w.facing,dy:0,remaining:.7,drillTick:0,gravityScale:w.body.gravityScale()};w.body.setGravityScale(0,true);return true;}
    if(type==='suicideBomber'){for(const other of g.worms)if(other.alive&&!other.frozen&&other!==w&&Math.hypot(other.x-w.x,other.y-w.y)<4)other.poison=Math.max(other.poison||0,5);this.explode(w.x,w.y,2.5,80);g.damage(w,w.hp,true);g.turn.settle();return true;}
    if(type==='earthquake'){this.earthquake={remaining:4,tick:0,offsetTime:0};return true;}
    if(type==='drill'||type==='pneumaticDrill'||type==='blowTorch'){this.drilling=2.2;this.drillTick=0;this.drillAngle=type==='blowTorch'?g.angle:null;this.drillVictims=new Set();this.beginUtility(type==='blowTorch'?'blowTorch':'drill',2.2);g.turn.state=TURN.ACTION_RESOLVING;return true;}
    if(type==='girder'||type==='girderPack'){
      const length=3.5,shape=new RAPIER.Cuboid(length/2,.2),a=g.angle;
      if(Math.abs(Math.cos(a))*length/2+Math.abs(Math.sin(a))*.2>Math.min(this.target.x,MAP.width-this.target.x)||Math.abs(Math.sin(a))*length/2+.2>Math.min(this.target.y,MAP.height-this.target.y)||g.world.intersectionWithShape(this.target,a,shape)){this.message='Балка должна целиком помещаться в свободном месте';return false;}
      g.terrain.createGirder(this.target.x,this.target.y,a,length);this.resetTarget();
      if(type==='girderPack'){this.girderStock=(this.girderStock??5)-1;if(this.girderStock>0){g.turn.lockedWeapon=type;this.continueTurn();return true;}}
      g.turn.settle();return true;
    }
    if(type==='ninjaRope'){
      this.ropeMiss=null;
      g.audio?.play('ninjaRopeLaunch',.2);
      this.ray.origin={x:w.x,y:w.y};this.ray.dir={x:dx,y:dy};
      const hit=g.world.castRay(this.ray,NINJA_ROPE_MAX_LENGTH,true,undefined,undefined,w.collider,w.body,c=>!g.wormByCollider.has(c.handle)&&!this.byCollider.has(c.handle));
      if(!hit){this.ropeMiss={x:w.x,y:w.y,dx,dy,length:NINJA_ROPE_MAX_LENGTH,age:0};this.message='Канат не достал до поверхности';return false;}
      const anchor={x:w.x+dx*hit.timeOfImpact,y:w.y+dy*hit.timeOfImpact};
      if(!this.ropeUsePending){this.ropeUsePending=true;this.ropeUseOwner=w;this.ropeUseTeam=w.team;this.ropeUseAirborne=false;this.ropeUseStarted=true;this.ropeUseStartPosition={x:w.x,y:w.y};}
      this.beginUtility('rope');Object.assign(this.movementMode,{anchor,length:Math.max(1.5,hit.timeOfImpact),swingLastAngle:undefined,swingDirection:0,swingTurnCooldown:0});this.updateTether([anchor,{x:w.x,y:w.y}]);this.continueTurn();return true;
    }
    if(type==='bungee'){
      if(!w.grounded){this.message='Банджи можно активировать только на земле';return false;}
      const groundY=g.terrain?.landingHeight(w.x,.08,0);
      if(!Number.isFinite(groundY)){this.message='Для банджи нужна твёрдая поверхность';return false;}
      g.audio?.play('bungeeStart');this.beginUtility('bungee');Object.assign(this.movementMode,{anchor:{x:w.x,y:groundY},length:4,jumped:false});return true;
    }
    if(type==='parachute'){this.beginUtility('parachute');return true;}
    if(type==='jetPack'){this.beginUtility('jetPack',30);return true;}
    if(type==='uppercut'){
      for(const other of g.worms)if(other.alive&&other!==w){const x=other.x-w.x,y=other.y-w.y;if(x*w.facing>=-.3&&Math.hypot(x,y)<2.8){g.damage(other,35);if(other.alive&&!other.frozen)other.body.applyImpulse({x:w.facing*4,y:9},true);}}
      g.particles.emit(w.x+w.facing,w.y+1,1);g.turn.settle();return true;
    }
    if(type==='shotgun'){g.turn.lockedWeapon=type;this.shotgun();g.turn.shots--;g.turn.settle();return true;}
    if(type==='longbow'){
      const arrow=this.spawn('arrow',w.x+dx*.85,w.y+.2+dy*.85,dx*32,dy*32,20);
      if(!arrow){this.message='На карте недостаточно свободных слотов для стрелы';return false;}
      arrow.ignoreOwner=w;arrow.damageOverride=30;
      this.attachLaunchAudio(arrow,g.audio?.play('arrowLaunch'));
      g.turn.lockedWeapon=type;g.turn.shots--;g.turn.settle();return true;
    }
    if(GUN_WEAPONS.has(type)){if(type==='longbow'){g.turn.lockedWeapon=type;this.fireGun(type);g.turn.shots--;g.turn.settle();}else{if(type==='uzi')g.audio?.play('uziBurst');if(type==='minigun')g.audio?.play('minigunBurst');this.burst={type,left:type==='handgun'?4:type==='uzi'?10:type==='minigun'?16:20,tick:0,interval:type==='handgun'?.5:type==='minigun'?.06:.1,owner:w};}return true;}
    if(type==='mortar'){
      const mortarSpeed=20;
      const mortarVy=Math.max(dy*mortarSpeed,4.5);
      const mortar=this.spawn('mortar',w.x+dx*1.1,w.y+Math.max(.15,dy*.25),dx*mortarSpeed,mortarVy,12);
      if(mortar){mortar.ignoreOwner=w;this.attachLaunchAudio(mortar,g.audio?.play('mortarShot'));}
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
    if(type==='sheepLauncher'){
      this.ray.origin.x=w.x;this.ray.origin.y=w.y;this.ray.dir.x=dx;this.ray.dir.y=dy;
      const obstruction=g.world.castRay(this.ray,1.15,true,undefined,undefined,w.collider,w.body);
      const offset=obstruction?Math.max(.65,obstruction.timeOfImpact-.24):1.05;
      this.spawn('sheepLauncher',w.x+dx*offset,w.y+dy*offset,dx*speed,dy*speed,20);
      this.retreat=0;this.message='Enter — взорвать овечку';return true;
    }
    if(['airstrike','napalm','mailstrike','minestrike','moleSquadron'].includes(type)){
      const airRaidAudio=g.audio?.play('airRaid');
      const flightAudioGroup=type==='airstrike'&&airRaidAudio?{audio:airRaidAudio,remaining:0}:null;
      const targetX=this.target.x,facing=w.facing;
      this.scheduleAirLaunch(()=>{
        const dropType=type==='airstrike'?'bazooka':type==='minestrike'?'mine':type==='moleSquadron'?'moleBomb':type==='napalm'?'napalm':type==='mailstrike'?'mailstrike':'bomb';
        const drops=type==='moleSquadron'?4:type==='airstrike'?5:6;
        for(let i=0;i<drops;i++){
          const drop=this.spawn(dropType,THREE.MathUtils.clamp(targetX+(i-(drops-1)/2)*2.6,1,MAP.width-1),MAP.height+3+i*1.4,type==='napalm'?0:type==='moleSquadron'?0:facing*3,type==='napalm'?-1.5:type==='moleSquadron'?-12:-9,type==='napalm'?1.25:type==='minestrike'?Infinity:type==='moleSquadron'?10:12);
          if(drop&&flightAudioGroup){drop.airRaidGroup=flightAudioGroup;flightAudioGroup.remaining++;}
          if(drop&&type==='minestrike')drop.waitForMineDetonation=true;
          if(drop&&type==='moleSquadron'){drop.stage='squadronFlight';drop.fromMoleSquadron=true;}
        }
      });
      this.resetTarget();return true;
    }
    if(type==='madCows'){for(let i=0;i<this.cowCount;i++){const p=this.spawn('madCow',w.x+w.facing,w.y+.2,0,0,20);p.delay=i*.6;p.body.setEnabled(false);p.mesh.visible=false;}return true;}
    if(type==='frenchSheep'){g.audio?.play('airRaid');const targetX=this.target.x,facing=w.facing;this.scheduleAirLaunch(()=>{for(let i=0;i<5;i++)this.spawn('frenchSheep',THREE.MathUtils.clamp(targetX+(i-2)*1.8,1,MAP.width-1),MAP.height+3+i,facing*2,-9,20);});this.resetTarget();return true;}
    if(type==='carpet'||type==='armageddon'){g.audio?.play('airRaid');const targetX=this.target.x;this.scheduleAirLaunch(()=>{const count=type==='carpet'?8:12;for(let i=0;i<count;i++)this.spawn(type,THREE.MathUtils.clamp(type==='armageddon'?Math.random()*MAP.width:targetX+(i-(count-1)/2)*2.2,1,MAP.width-1),MAP.height+3+i*.7,1,-10,12);});this.resetTarget();return true;}
    if(type==='indianTest'){g.waterLevel=(g.waterLevel||0)+3;g.water.visible=true;for(const worm of g.worms)if(worm.alive&&!worm.frozen)worm.radiation=Math.max(worm.radiation||0,5);this.resetTarget();g.turn.settle();return true;}
    if(type==='donkey'||type==='mbBomb'){g.audio?.play('airRaid');const targetX=this.target.x;this.scheduleAirLaunch(()=>{const projectile=this.spawn(type,targetX,MAP.height+5,0,type==='mbBomb'?-5:-8,type==='mbBomb'?20:12);if(type==='mbBomb'&&projectile)projectile.mbBombFlightSoundPending=true;});this.resetTarget();return true;}
    if(type==='banana'||type==='superBanana'||type==='holy'||type==='petrol'){
      const launchSpeed=type==='oldWoman'?2:speed,launchY=type==='oldWoman'?0:dy*launchSpeed;
      this.spawn(type,w.x+dx,w.y+dy,dx*launchSpeed,launchY,type==='holy'?3:type==='superBanana'?20:this.fuse);this.retreat=2;this.message='Можно отойти: A/D, W';return true;
    }
    if(type==='mingVase'){this.spawn(type,w.x+w.facing*.9,w.y+.2,w.facing,0,5);this.retreat=3;return true;}
    this.ray.origin.x=w.x;this.ray.origin.y=w.y;this.ray.dir.x=dx;this.ray.dir.y=dy;
    const obstruction=g.world.castRay(this.ray,1.15,true,undefined,undefined,w.collider,w.body);
    const offset=obstruction?Math.max(.65,obstruction.timeOfImpact-.24):1.05;
    const projectile=this.spawn(type,w.x+dx*offset,w.y+dy*offset,dx*speed,dy*speed,type==='grenade'||type==='cluster'?this.fuse:12);
    if(projectile&&type==='bazooka')this.attachLaunchAudio(projectile,g.audio?.play('bazookaShot'));
    if(projectile&&type==='pigeon')this.attachLaunchAudio(projectile,g.audio?.play('pigeonLaunch'));
    else if(projectile&&['homing','magicBullet'].includes(type))this.attachLaunchAudio(projectile,g.audio?.play('homingLaunch'));
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
        p.vy+=GRAVITY*dt*(hazard.windAffected?p.flightSpeed/6:1);if(hazard.windAffected)p.vx+=this.g.wind*1.4*p.flightSpeed*p.windFactor*dt;p.vx*=friction;p.x+=p.vx*dt;p.y+=p.vy*dt;
        const waterSurface=this.g.water?.getHeightAt(p.x);
        if(Number.isFinite(waterSurface)&&p.y<waterSurface){p.active=false;continue;}
        if(terrain){
          let impactY=null;
          if(p.vy<=0){
            for(let probe=previousY;probe>=p.y;probe-=.04)if(terrain.isSolid(p.x,probe)){impactY=probe;break;}
          }
          if(impactY==null&&terrain.isSolid(p.x,p.y))impactY=p.y;
          if(impactY!=null){
            let surfaceY=impactY;
            for(let lift=0;lift<=3&&terrain.isSolid(p.x,surfaceY);lift+=.04)surfaceY+=.04;
            if(!terrain.isSolid(p.x,surfaceY)){p.y=surfaceY+.015;p.vy=0;p.vx*=.18;p.size*=2;p.grounded=true;if(hazard.waitForLanding)hazard.ignited=true;}
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
  getProjectileLightData(){return this.projectileGlintData;}
  update(dt) {
    const g=this.g;
    if(this.ropeMiss){const miss=this.ropeMiss;miss.age+=dt;const extension=THREE.MathUtils.clamp(miss.age/.22,0,1),end={x:miss.x+miss.dx*miss.length*extension,y:miss.y+miss.dy*miss.length*extension};this.updateTether([{x:miss.x,y:miss.y},end]);if(miss.age>=.28){this.ropeMiss=null;this.tether.visible=false;}}
    for(let i=this.pendingAirLaunches.length-1;i>=0;i--){const pending=this.pendingAirLaunches[i];pending.remaining-=dt;if(pending.remaining<=0){this.pendingAirLaunches.splice(i,1);pending.launch();}}
    if(this.pendingBatSwing){const swing=this.pendingBatSwing;swing.elapsed+=dt;if(!swing.hit&&swing.elapsed>=.29){swing.hit=true;this.resolveBatSwing(swing);}if(swing.elapsed>=.52)this.pendingBatSwing=null;}
    if(this.pendingFirePunch&&(this.pendingFirePunch.audio.ended||this.pendingFirePunch.audio.playFailed)){
      const {owner}=this.pendingFirePunch;this.pendingFirePunch=null;
      g.audio?.play('firePunchHit');this.performFirePunch(owner);g.turn.settle();
    }
    g.events.drainCollisionEvents(this.onCollision);g.weaponArt.updateDetachedSmoke(dt);this.retreat=Math.max(0,this.retreat-dt);this.projectile=null;
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
      if(!w.alive){w.body.setGravityScale(k.gravityScale,true);this.kamikaze=null;}
      else{
        const pos=w.body.translation();
        w.body.setLinvel({x:k.dx*18,y:0},true);
        k.drillTick-=dt;
        if(k.drillTick<=0){
          k.drillTick=.08;
          if(g.terrain&&!g.trainingIndestructible){
            const drillX=pos.x+k.dx*.85,drillY=pos.y;
            const colors=g.terrain.createExplosion(drillX,drillY,1.15);
            if(colors?.length)g.particles.emit(drillX,drillY,.3,colors);
          }
        }
        const hitPlayer=g.worms.some(other=>other.alive&&other!==w&&Math.hypot(other.x-pos.x,other.y-pos.y)<.9);
        if(hitPlayer||k.remaining<=0){
          w.body.setGravityScale(k.gravityScale,true);this.kamikaze=null;w.body.setLinvel({x:0,y:0},true);
          this.explode(pos.x,pos.y,2.2,80);
          if(w.alive)g.damage(w,w.hp,true);
        }
      }
    }
    if(this.burst){const b=this.burst;b.tick-=dt;if(!b.owner.alive)this.burst=null;else if(b.tick<=0){this.fireGun(b.type);b.left--;b.tick=b.interval??.1;if(!b.left)this.burst=null;}}
    for(let i=this.hazards.length-1;i>=0;i--){
      const hazard=this.hazards[i];
      if(hazard.kind==='dragonField'){
        hazard.remaining-=dt;hazard.age+=dt;
        const growth=1+THREE.MathUtils.clamp(hazard.age/.55,0,1),fade=THREE.MathUtils.clamp(hazard.remaining/.22,0,1);
        hazard.mesh.scale.setScalar(growth);
        for(const material of hazard.materials)material.opacity=material.userData.baseOpacity*fade;
        for(const worm of g.worms)this.pushFromDragonField(hazard,worm);
        if(hazard.remaining<=0){hazard.mesh.removeFromParent();for(const part of hazard.mesh.children){part.geometry.dispose();part.material.dispose();}this.hazards.splice(i,1);}
        continue;
      }
      if(hazard.kind!=='fire'||!hazard.waitForLanding||hazard.ignited)hazard.remaining-=dt;hazard.tick-=dt;hazard.age=(hazard.age||0)+dt;
      if(hazard.remaining>0&&hazard.tick<=0){hazard.tick=hazard.kind==='fire'?.7+Math.random()*.8:hazard.tickInterval||1;if(hazard.kind==='fire'&&!g.trainingIndestructible){const groundParticles=hazard.particleSlots.filter(p=>p.active&&!p.smokeStarted&&(g.terrain.isSolid(p.x,p.y-.04)||g.terrain.isSolid(p.x,p.y-.12)));const limit=Math.min(8,groundParticles.length);for(let i=0;i<limit;i++){const particle=groundParticles[(hazard.groundDamageIndex++)%groundParticles.length];g.terrain.createExplosion(particle.x,particle.y-.08,.45);}}for(const worm of g.worms)if(worm.alive&&!worm.frozen){const inFire=hazard.kind==='fire'?hazard.particleSlots.some(p=>p.active&&p.grounded&&!p.smokeStarted&&Math.hypot(worm.x-p.x, worm.y-p.y)<1.8):Math.hypot(worm.x-hazard.x,worm.y-hazard.y)<hazard.radius;if(!inFire)continue;if(hazard.kind==='poison')worm.poison=Math.max(worm.poison||0,hazard.damage);else{const appliedDamage=Math.max(1,hazard.damage*(hazard.kind==='fire'?.25:.5));g.damage(worm,appliedDamage,false,false);if(worm.alive){g.audio?.play('landing');const dx=worm.x-hazard.x,dy=worm.y-hazard.y,distance=Math.max(.25,Math.hypot(dx,dy)),impulse=2.25;worm.knockedDown=true;worm.impactVelocityX=dx<0?-1:1;worm.tumbleRotation=worm.mesh.rotation.z;worm.body.applyImpulse({x:dx/distance*impulse,y:(dy/distance+.72)*impulse},true);worm.slideTime=Math.max(worm.slideTime,.35);}}}}
      if(hazard.waitForLanding&&!hazard.ignited&&!hazard.particleSlots.some(p=>p.active))hazard.remaining=0;
      if(hazard.remaining<=0&&!hazard.particleSlots?.some(p=>p.active)){this.hazards.splice(i,1);}
    }
    this.updateFireParticles(dt);
    if(this.drilling>0){
      this.drilling=Math.max(0,this.drilling-dt);this.drillTick-=dt;
      if(!g.active.alive)this.drilling=0;
      else if(this.drillTick<=0){this.drillTick=.12;const w=g.active,angled=this.drillAngle!==null,dx=angled?Math.cos(this.drillAngle):0,dy=angled?Math.sin(this.drillAngle):-1,drillX=w.x+dx*.85,drillY=w.y+dy*.85;g.createExplosion(drillX,drillY,1.15);g.particles.emit(drillX,drillY,.4,[],{glintStrength:.025});for(const other of g.worms)if(other.alive&&other!==w&&!this.drillVictims.has(other)&&Math.hypot(other.x-drillX,other.y-drillY)<1.5){this.drillVictims.add(other);g.damage(other,15);}const blockedAhead=angled&&g.terrain.isSolid(w.x+dx*.5,w.y+dy*.5);w.body.setLinvel(angled&&!blockedAhead?{x:dx*2.5,y:0}:angled?{x:0,y:0}:{x:0,y:-3},true);}
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
      if(p.type==='mbBomb'&&p.mbBombFlightSoundPending&&p.age>=2){p.mbBombFlightSoundPending=false;this.attachLaunchAudio(p,g.audio?.play('mbBombFlight'));}
      if(p.type==='mailstrike'&&!p.hit)p.body.setLinvel({x:this.g.wind*.6+Math.sin(p.age*p.mailSwayFrequency+p.mailSwayPhase)*p.mailSwayAmplitude,y:-6.4},true);
      if(p.type==='mbBomb'&&!p.hit)p.body.setLinvel({x:this.g.wind*2,y:-5},true);
      const pigeonHomingArmed=p.type==='pigeon'&&Math.hypot(previousX-p.homingStartX,previousY-p.homingStartY)>=p.homingArmingDistance;
      if(pigeonHomingArmed){
        const targetDistance=Math.hypot(p.x-p.targetX,p.y-p.targetY);
        if(Number.isFinite(p.targetApproachDistance)&&targetDistance<p.targetApproachDistance-.01)p.targetApproached=true;
        p.targetApproachDistance=targetDistance;
        p.targetClosestDistance=Math.min(p.targetClosestDistance,targetDistance);
        const awayDot=(p.x-p.targetX)*p.body.linvel().x+(p.y-p.targetY)*p.body.linvel().y;
        const receding=p.targetApproached&&p.targetClosestDistance<1.45&&targetDistance>p.targetClosestDistance+.3&&awayDot>0;
        p.targetRecedeTime=receding?p.targetRecedeTime+dt:0;
        if(p.targetRecedeTime>=.35&&targetDistance>p.targetClosestDistance+1.5)p.remaining=0;
      }
      if(p.type==='arrow'&&p.hit&&!p.stuck){
        const struckWorm=p.hitWorm||g.wormByCollider.get(p.hitCollider);
        if(struckWorm){
          if(struckWorm.alive&&struckWorm!==p.owner){
            g.damage(struckWorm,p.damageOverride||30);
            g.releaseDamagePopups(struckWorm);
            const velocity=p.arrowVelocity||p.body.linvel();
            if(struckWorm.alive&&!struckWorm.frozen)struckWorm.body.applyImpulse({x:velocity.x*.08,y:velocity.y*.08},true);
          }
          p.hitWorms.add(struckWorm);
          if(p.hitCollider)p.hitColliders.add(p.hitCollider);
          const velocity=p.arrowVelocity||p.body.linvel();
          p.body.setLinvel(velocity,true);
          if(Math.hypot(velocity.x,velocity.y)>.1){p.arrowAngle=Math.atan2(velocity.y,velocity.x);p.body.setRotation(p.arrowAngle,true);}
          p.hit=false;p.hitCollider=null;p.hitWorm=null;
        }else{
          p.stuck=true;p.remaining=Infinity;p.hit=false;p.hitCollider=null;p.hitWorm=null;
          p.body.setLinvel({x:0,y:0},true);p.body.setAngvel(0,true);p.body.setRotation(p.arrowAngle??p.body.rotation(),true);p.body.setBodyType(RAPIER.RigidBodyType.Fixed,true);
        }
      }
      if(p.type==='sheep'||p.type==='sheepLauncher'||(p.type==='superSheep'&&p.stage==='walking')){
        if(p.baaAudio?.ended){p.baaAudio=null;p.baaTimer=1;}
        if(p.baaTimer>0)p.baaTimer=Math.max(0,p.baaTimer-dt);
        if(p.baaAudio?.paused&&(p.baaAudio.playFailed||!g.audio?.enabled)){
          g.audio?.stopPlayback(p.baaAudio);p.baaAudio=null;p.baaTimer=Math.max(p.baaTimer,1);
        }else if(p.baaAudio?.paused&&g.audio?.enabled&&g.running){
          void p.baaAudio.play().catch(()=>{p.baaAudio.playFailed=true;});
        }
        if(!p.baaAudio&&p.baaTimer<=0){
          p.baaAudio=g.audio?.play('sheepBaa')||null;
          if(!p.baaAudio)p.baaTimer=1;
        }
      }else if(p.baaAudio){g.audio?.stopPlayback(p.baaAudio);p.baaAudio=null;p.baaTimer=0;}
      const flightSoundWanted=p.type==='superSheep'&&p.stage==='flying';
      if(!flightSoundWanted){if(p.flyAudio){g.audio?.stopPlayback(p.flyAudio);p.flyAudio=null;}}
      else if(p.flyAudio?.paused&&(p.flyAudio.playFailed||!g.audio?.enabled)){g.audio?.stopPlayback(p.flyAudio);p.flyAudio=null;}
      else if(p.flyAudio?.paused&&g.audio?.enabled&&g.running){void p.flyAudio.play().catch(()=>{p.flyAudio.playFailed=true;});}
      if(flightSoundWanted&&!p.flyAudio)p.flyAudio=g.audio?.playLoop('animalFlight')||null;
      if(p.type==='homing'&&!p.homingComplete){
        const dx=p.x-previousX,dy=p.y-previousY,lengthSquared=dx*dx+dy*dy;
        const along=lengthSquared>1e-8?THREE.MathUtils.clamp(((p.targetX-previousX)*dx+(p.targetY-previousY)*dy)/lengthSquared,0,1):0;
        const closestX=previousX+dx*along,closestY=previousY+dy*along;
        const beforeTarget=(previousX-p.targetX)*dx+(previousY-p.targetY)*dy;
        const afterTarget=(p.x-p.targetX)*dx+(p.y-p.targetY)*dy;
        if(beforeTarget<=0&&afterTarget>0&&Math.hypot(p.targetX-closestX,p.targetY-closestY)<.55)p.homingComplete=true;
      }
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
      const homingArmed=(p.type==='homing'||p.type==='pigeon')&&Math.hypot(p.x-p.homingStartX,p.y-p.homingStartY)>=p.homingArmingDistance;
      if((homingArmed||p.type==='magicBullet'&&p.age>.35)&&!p.hit&&!(p.type==='homing'&&p.homingComplete)){
        const v=p.body.linvel(),a=Math.atan2(p.targetY-p.y,p.targetX-p.x),current=Math.atan2(v.y,v.x);
        const rate=p.type==='homing'?5.5:p.type==='pigeon'?5.2:7;
        let desired=a;
        if(p.type==='pigeon'){
          const targetWorm=g.worms.find(w=>w.alive&&Math.hypot(w.x-p.targetX,w.y-p.targetY)<1.25);
          const pigeonObstacleFilter=c=>{
            if(this.byCollider.has(c.handle))return false;
            const worm=g.wormByCollider.get(c.handle);
            return !worm||(worm!==p.owner&&worm!==targetWorm);
          };
          const offsets=[0,.25,-.25,.5,-.5,.8,-.8,1.15,-1.15,1.55,-1.55,2,-2];
          const scanDistance=8.5;
          let bestScore=-Infinity;
          for(const offset of offsets){
            const candidate=a+offset;
            const dirX=Math.cos(candidate),dirY=Math.sin(candidate),sideX=-dirY*.46,sideY=dirX*.46;
            let clearance=scanDistance;
            for(const lane of [-1,0,1]){
              this.ray.origin.x=p.x+sideX*lane;this.ray.origin.y=p.y+sideY*lane;
              this.ray.dir.x=dirX;this.ray.dir.y=dirY;
              const obstacle=g.world.castRay(this.ray,scanDistance,true,undefined,undefined,p.collider,p.body,pigeonObstacleFilter);
              if(obstacle)clearance=Math.min(clearance,Math.max(0,obstacle.timeOfImpact-.5));
            }
            // Keep obstacle avoidance subordinate to actual progress toward
            // the marked point. Pure clearance scoring can make the pigeon
            // orbit the target when the widest corridor curves around it.
            const score=clearance+(Math.cos(offset)-1)*scanDistance*.65-Math.abs(offset)*1.2;
            if(score>bestScore){bestScore=score;desired=candidate;}
          }
        }else if(p.type==='magicBullet'){
          this.ray.origin.x=p.x;this.ray.origin.y=p.y;this.ray.dir.x=Math.cos(a);this.ray.dir.y=Math.sin(a);
          const obstacle=g.world.castRay(this.ray,3,true,undefined,undefined,p.collider,p.body,c=>!g.wormByCollider.has(c.handle)&&!this.byCollider.has(c.handle));
          if(obstacle)desired=Math.PI/2;
        }
        const diff=Math.atan2(Math.sin(desired-current),Math.cos(desired-current)),angle=current+THREE.MathUtils.clamp(diff,-rate*dt,rate*dt),speed=p.type==='homing'?(p.homingSpeed||Math.hypot(v.x,v.y)):22;
        this.velocity.x=Math.cos(angle)*speed;this.velocity.y=Math.sin(angle)*speed;p.body.setLinvel(this.velocity,true);
      }
      if(p.type==='dragonBall'&&(p.hit||p.remaining<=0)){
        const field=this.createDragonField(p.x,p.y,p.dir);
        const struckWorm=p.hitWorm||g.wormByCollider.get(p.hitCollider);
        if(struckWorm)this.pushFromDragonField(field,struckWorm,true);
        this.remove(p);continue;
      }
      if(['sheep','superSheep','sheepLauncher','madCow','oldWoman','salvation','skunk','moleBomb'].includes(p.type)){
        const v=p.body.linvel();
        if(p.type==='moleBomb'&&p.hit&&p.hitWorm)p.remaining=0;
        if(p.type==='superSheep'&&p.stage==='flying'){
          const turn=(g.keys.has('ArrowLeft')||g.keys.has('KeyA')?1:0)-(g.keys.has('ArrowRight')||g.keys.has('KeyD')?1:0);
          p.heading+=turn*3*dt;p.body.setLinvel({x:Math.cos(p.heading)*12,y:Math.sin(p.heading)*12},true);
          if(!p.flightArmed&&Math.hypot(p.x-p.flightStartX,p.y-p.flightStartY)>=1.5)p.flightArmed=true;
          if(!p.flightArmed)p.hit=false;else if(p.hit)p.remaining=0;
        }else if(p.type==='moleBomb'&&p.stage==='squadronFlight'){
          const landed=p.hit||g.terrain.isSolid(p.x,p.y-.34);
          if(landed){p.stage='burrowing';p.body.setLinvel({x:0,y:-3},true);}
          else p.body.setLinvel({x:0,y:-12},true);
        }else if(p.type==='moleBomb'&&(p.stage==='burrowing'||p.y>MAP.height)){
          p.stage='burrowing';if(v.y<0||p.hit){p.tick-=dt;if(p.tick<=0){const x=p.x,y=p.y-.5,colors=g.createExplosion(x,y,.8);g.particles.emit(x,y,.5,colors||[],{glintStrength:.025});p.tick=.1;}p.body.setLinvel({x:0,y:-3},true);}
        }else if(p.type!=='sheepLauncher'||p.stage==='running'||p.hit){
          if(p.type==='sheep'&&!p.runFuseStarted){p.runFuseStarted=true;p.remaining=7;}
          if(p.type==='sheepLauncher'&&p.stage!=='running'){p.stage='running';p.remaining=7;}
          if(p.type==='madCow'&&p.hit&&Math.abs(v.x)<1)p.remaining=0;
          const walkSpeed=['oldWoman','salvation','skunk'].includes(p.type)?2:5;
          let jumpObstacle=false;
          if((p.type==='sheep'&&p.runFuseStarted)||(p.type==='sheepLauncher'&&p.stage==='running')||(p.type==='moleBomb'&&p.stage==='walking')){
            p.jumpCooldown=Math.max(0,(p.jumpCooldown||0)-dt);
            const onGround=p.hit||g.terrain.isSolid(p.x,p.y-.42)||g.terrain.isSolid(p.x+p.dir*.1,p.y-.42);
            if(p.jumpCooldown===0&&v.y<.5&&onGround){
              for(const height of [.2,.62]){
                this.ray.origin.x=p.x+p.dir*.35;this.ray.origin.y=p.y+height;
                this.ray.dir.x=p.dir;this.ray.dir.y=0;
                if(g.world.castRay(this.ray,.95,true,undefined,undefined,p.collider,p.body,c=>!g.wormByCollider.has(c.handle)&&!this.byCollider.has(c.handle))){jumpObstacle=true;break;}
              }
            }
            if(jumpObstacle)p.jumpCooldown=.75;
          }
          const verticalSpeed=jumpObstacle?6:p.hit&&Math.abs(v.x)<1.5?4:v.y;
          p.body.setLinvel({x:p.dir*walkSpeed,y:verticalSpeed},true);
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
        for(const w of g.worms)if(w.alive&&(w!==p.owner||p.ownerClear)&&Math.hypot(w.x-p.x,w.y-p.y)<2){p.triggered=true;p.remaining=3;break;}
      }
      if(p.type==='mine'&&p.triggered){if(!p.mineAudio)p.mineAudio=g.audio?.playLoop('mineTicking')||null;if(p.mineAudio)p.mineAudio.playbackRate=.7+THREE.MathUtils.clamp(1-p.remaining/3,0,1)*1.8;}
      p.mesh.position.set(p.x,p.y,.2);g.weaponArt.orient(p,dt);
      if(p.type==='mine')p.mesh.material?.color.setHex(p.triggered?(Math.floor(p.age*12)%2?0xff3333:0xffffff):0xffffff);
      if((p.type!=='homing'&&p.y<(g.waterLevel||0)-.5)||p.y < -5 || p.x < -10 || p.x > MAP.width+10){this.remove(p);continue;}
      if(p.type==='arrow'&&p.remaining<=0){this.remove(p);continue;}
      const impact=p.hit&&(GROUND_PROJECTILES.has(p.type)||p.type==='mortar'||p.type==='donkey'||p.type==='napalm'||p.type==='mailstrike'||p.type==='carpet'||p.type==='armageddon');
      if(p.type==='holy'&&p.remaining<=0&&p.age<30&&Math.hypot(p.body.linvel().x,p.body.linvel().y)>.15)continue;
      if(p.remaining<=0||impact||(p.type==='fragment'&&!p.remoteFragment&&p.hit&&p.age>.14)){this.detonate(p);continue;}
      if(p.type!=='mine'&&!(p.type==='arrow'&&p.stuck))this.projectile=p;
    }
    let rocketLightCount=0;
    for(const p of this.pool){
      if(!p.active||!ROCKET_LIGHT_PROJECTILES.has(p.type))continue;
      this.projectileGlintData.positions[rocketLightCount].set(p.x,p.y);
      this.projectileGlintData.strengths[rocketLightCount]=1.35;
      rocketLightCount++;
    }
    this.projectileGlintData.count=rocketLightCount;
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
      petrol:[2.4,35],mingVase:[3.2,70],mbBomb:[9,100],oldWoman:[4,75],donkey:[7,100],fragment:[1.1,18],
      frenchSheep:[4.5,75],flameShot:[.45,5],madCow:[4.5,75],salvation:[1.8,20],skunk:[2.2,0]
    };
    const [radius,damage]=specs[type]||[3.5,55];if(type!=='skunk'&&type!=='napalm'&&type!=='petrol')this.explode(x,y,radiusOverride??radius,damageOverride??damage,p.ignoreOwner||null,type==='mortar'?.35:1,type==='mbBomb'?'mbBombExplosion':'explosion');
    if(['cluster','banana','superBanana','mingVase','salvation'].includes(type)){
      const count=5;
      for(let i=0;i<count;i++){const a=.2+i*(Math.PI-.4)/(count-1),part=this.spawn('fragment',x+Math.cos(a)*.5,y+.5,Math.cos(a)*10,Math.sin(a)*10,type==='superBanana'?20:2);
        if(part){this.g.weaponArt.projectile(part,type==='superBanana'?'banana':type,.12);part.owner=owner;part.damageOverride=type==='cluster'?30:type==='mingVase'?25:75;part.radiusOverride=type==='cluster'||type==='mingVase'?1.3:3.2;part.remoteFragment=type==='superBanana';}}
    }
    if(type==='mortar')for(let i=0;i<5;i++){const a=Math.PI/2+(i-2)*.32,spread=.5,part=this.spawn('fragment',x+Math.cos(a)*spread,y+Math.sin(a)*spread,Math.cos(a)*(8+Math.random()*2),Math.sin(a)*(4.5+Math.random()*2),1.2);if(part){part.owner=owner;part.ignoreOwner=owner;part.damageOverride=30;}}
    if(type==='napalm'){this.g.audio?.play('explosion');this.g.particles.emit(x,y,2.2);this.createFireHazard(x,y,3.5,12,6,null,1,1,true);}
    else if(type==='petrol'||type==='frenchSheep'||type==='flameShot')this.createFireHazard(x,y,type==='flameShot'?.7:2.8,type==='flameShot'?6:15,6,null,type==='petrol'?4:1,type==='petrol'?1.5:1);
    if(type==='skunk')this.hazards.push({kind:'poison',x,y,radius:3.5,damage:5,remaining:8,tick:.2});
  }
  explode(x,y,r,damage,ignoreOwner=null,impulseScale=1,sound='explosion'){
    const g=this.g,colors=g.createExplosion(x,y,r,sound);g.particles.emit(x,y,r,colors);
    for(const w of g.worms)if(w.alive&&w!==ignoreOwner){const pos=w.body.translation(),dx=pos.x-x,dy=pos.y-y,d=Math.hypot(dx,dy),reach=r*1.8;if(d>reach)continue;const f=1-d/reach;g.damage(w,Math.ceil(damage*f));if(w.alive&&!w.frozen){const impulse=13.5*impulseScale*Math.pow(f,.75),distance=Math.max(d,.2);w.body.applyImpulse({x:dx/distance*impulse,y:(dy/distance+.72)*impulse},true);w.slideTime=Math.max(w.slideTime,1.2);}}
    for(const p of this.pool)if(p.active&&p.type==='mine'&&Math.hypot(p.x-x,p.y-y)<r*1.5){p.triggered=true;p.remaining=Math.min(p.remaining,.2);}
  }
  fireGun(type){
    const g=this.g,w=g.active,count=1,damage=type==='longbow'?15:5;
    if(type==='handgun')g.audio?.play('pistolShot');
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
    const shotAudio=g.audio?.play('shotgun');
    if(g.turn.shots>1&&shotAudio){
      let reloadCuePlayed=false;
      const playReloadCue=()=>{
        if(reloadCuePlayed)return;
        reloadCuePlayed=true;
        if(g.turn.weapon==='shotgun'&&g.turn.shots===1)g.audio?.play('turnIndicator');
      };
      shotAudio.addEventListener('ended',playReloadCue,{once:true});
      shotAudio.addEventListener('error',playReloadCue,{once:true});
    }
    for(let i=0;i<1;i++){
      const a=g.angle;this.ray.origin.x=w.x;this.ray.origin.y=w.y;this.ray.dir.x=Math.cos(a);this.ray.dir.y=Math.sin(a);
      const hit=g.world.castRay(this.ray,65,true,undefined,undefined,w.collider,w.body);const distance=hit?.timeOfImpact??65;
      const x=w.x+this.ray.dir.x*distance,y=w.y+this.ray.dir.y*distance;this.showBullet(w.x,w.y,x,y);const target=hit&&g.wormByCollider.get(hit.collider.handle);
      if(target?.alive){g.damage(target,25);g.releaseDamagePopups(target);if(target.alive&&!target.frozen)target.body.applyImpulse({x:this.ray.dir.x*1.1,y:this.ray.dir.y*1.1+.3},true);}else g.createExplosion(x,y,1.35);
      g.particles.emit(x,y,.35);
    }
  }
  dispose(){this.pendingAirLaunches.length=0;this.girderPreview.removeFromParent();this.girderPreview.traverse(child=>{child.geometry?.dispose();child.material?.dispose();});for(const hazard of this.hazards)if(hazard.kind==='dragonField'){hazard.mesh.removeFromParent();for(const part of hazard.mesh.children){part.geometry.dispose();part.material.dispose();}}this.hazards.length=0;for(const p of this.pool)p.fuseLabel?.remove();for(const bullet of this.visualBullets){bullet.mesh.removeFromParent();}this.visualBullets.length=0;this.bulletGeometry.dispose();this.bulletMaterial.dispose();this.fireParticles.mesh.removeFromParent();this.fireParticles.geometry.dispose();this.fireParticles.material.dispose();this.tether.removeFromParent();for(const mesh of this.ropeSegments){mesh.material.map.dispose();mesh.material.dispose();}this.ropeSegmentGeometry.dispose();this.ropeJointGeometry.dispose();this.ropeMaterial.dispose();this.ropeTexture.dispose();for(const p of this.pool){p.baseMesh.removeFromParent();p.baseMesh.material.dispose();if(p.megaBombMesh){p.megaBombMesh.removeFromParent();p.megaBombMesh.traverse(child=>{child.geometry?.dispose();child.material?.dispose();});}if(p.rocketMesh){const smokePuffs=p.rocketMesh.userData.rocketArt?.smokePuffs||[];p.rocketMesh.removeFromParent();p.rocketMesh.traverse(child=>{child.geometry?.dispose();if(child.material?.dispose)child.material.dispose();});for(const puff of smokePuffs){puff.removeFromParent();puff.geometry?.dispose();puff.material?.dispose();}}}this.geometry.dispose();this.marker.removeFromParent();this.marker.traverse(child=>{child.geometry?.dispose();child.material?.dispose();});}
}
