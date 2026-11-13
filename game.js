import * as THREE from "three";

const $ = id => document.getElementById(id);
let selectedMode = "MULTIPLAYER", username = "Rookie", socket = null, scene, camera, renderer, clock;
let yaw = 0, pitch = 0, keys = {}, velocityY = 0, grounded = true, health = 100, kills = 0;
let local = null, remotes = new Map(), bullets = [], targets = [], enemies = [], canShoot = true, paused = false;
const arenaSize = 50;

function notice(t){ $("notice").textContent=t; setTimeout(()=>{if($("notice").textContent===t)$("notice").textContent=""},2500)}
document.querySelectorAll(".mode").forEach(b=>b.addEventListener("click",()=>{
 document.querySelectorAll(".mode").forEach(x=>x.classList.remove("active"));b.classList.add("active");selectedMode=b.dataset.mode;
}));
async function auth(path){
 const usernameVal=$("username").value.trim(), password=$("password").value;
 const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:usernameVal,password})});
 const d=await r.json(); if(!r.ok) throw Error(d.error||"Authentication failed"); username=d.username; return username;
}
$("guest").onclick=()=>{username=$("username").value.trim()||"Rookie";startGame()};
$("login").onclick=async()=>{try{await auth("/api/login");startGame()}catch(e){$("authmsg").textContent=e.message}};
$("register").onclick=async()=>{try{await auth("/api/register");$("authmsg").style.color="#53e7ad";$("authmsg").textContent="Account dibuat. Silakan login."}catch(e){$("authmsg").style.color="#ff8b9c";$("authmsg").textContent=e.message}};
$("play").onclick=()=>{username=$("username").value.trim()||"Rookie";startGame()};
async function startGame(){
 $("menu").classList.add("hidden");$("game").classList.remove("hidden");$("modeLabel").textContent=selectedMode;
 initWorld();
 socket=io();
 socket.on("connect",()=>socket.emit("join_game",{username,mode:selectedMode}));
 socket.on("joined",d=>{if(d.self){local=d.self;camera.position.set(d.self.x,1.7,d.self.z);d.players.forEach(p=>{if(p.id!==socket.id)addRemote(p)});notice("DEPLOYED // "+d.room)}});
 socket.on("join_error",d=>notice(d.message));
 socket.on("player_joined",addRemote);
 socket.on("player_moved",updateRemote);
 socket.on("player_left",d=>removeRemote(d.id));
 socket.on("scoreboard",renderScores);
 socket.on("player_health",d=>{const m=remotes.get(d.id);if(m)m.userData.health=d.health});
 socket.on("hit_confirm",()=>{ $("hitmarker").style.opacity=1;setTimeout(()=>$("hitmarker").style.opacity=0,120)});
 socket.on("elimination",d=>{notice(d.killer_name+" ELIMINATED "+d.victim_name);if(d.killer===socket.id){kills++;$("kills").textContent=String(kills).padStart(2,"0")}});
 socket.on("shot_fx",d=>{if(d.from!==socket.id)remoteShot(d)});
 socket.on("disconnect",()=>notice("CONNECTION LOST"));
}
function initWorld(){
 scene=new THREE.Scene();scene.background=new THREE.Color(0x080f1d);scene.fog=new THREE.Fog(0x080f1d,35,95);
 camera=new THREE.PerspectiveCamera(76,innerWidth/innerHeight,.1,150);
 renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;$("world").appendChild(renderer.domElement);
 clock=new THREE.Clock();
 scene.add(new THREE.HemisphereLight(0x8abaff,0x18202b,2));
 const key=new THREE.DirectionalLight(0x9deaff,2.4);key.position.set(10,25,8);key.castShadow=true;scene.add(key);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:0x172536,roughness:.88}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
 const grid=new THREE.GridHelper(100,50,0x1d7181,0x24394b);grid.position.y=.012;scene.add(grid);
 // low-poly cover blocks and neon architecture
 for(let i=0;i<26;i++){let x=(Math.random()-.5)*76,z=(Math.random()-.5)*76;if(Math.abs(x)<5&&Math.abs(z)<5)continue;
  const w=2+Math.random()*4,h=1.3+Math.random()*4,d=2+Math.random()*4;
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:i%3===0?0x24455a:0x263246,metalness:.45,roughness:.55}));
  m.position.set(x,h/2,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);
  if(i%3===0){const strip=new THREE.Mesh(new THREE.BoxGeometry(w+.03,.07,.08),new THREE.MeshBasicMaterial({color:0x21dcec}));strip.position.set(x,h*.65,z+d/2+.05);scene.add(strip)}
 }
 for(let i=0;i<4;i++){const pillar=new THREE.Mesh(new THREE.BoxGeometry(1,10,1),new THREE.MeshStandardMaterial({color:0x26364d,emissive:0x102e42}));pillar.position.set(i%2?24:-24,5,i<2?24:-24);scene.add(pillar)}
 const body=new THREE.Mesh(new THREE.CapsuleGeometry(.42,.8,4,8),new THREE.MeshStandardMaterial({color:0x28b9c9,roughness:.5}));
 body.position.set(0,1,0);body.castShadow=true;scene.add(body);local=body;
 camera.position.set(0,1.7,0);camera.rotation.order="YXZ";
 // Practice dummies are exclusive to training; enemy bots appear in every mode.
 if(selectedMode==="TRAINING"){for(let i=0;i<7;i++){const t=new THREE.Mesh(new THREE.CylinderGeometry(.45,.45,1.8,8),new THREE.MeshStandardMaterial({color:0xff7b42,emissive:0x401406}));t.position.set((i-3)*5,1, -12-(i%2)*7);scene.add(t);targets.push(t)}}
 spawnEnemies();
 renderer.domElement.addEventListener("click",()=>{if(!paused)renderer.domElement.requestPointerLock()});
 document.addEventListener("pointerlockchange",()=>{if(document.pointerLockElement!==renderer.domElement&& !$("scoreboard").classList.contains("hidden"))return});
 document.addEventListener("mousemove",onMouse);document.addEventListener("keydown",onKeyDown);document.addEventListener("keyup",e=>keys[e.code]=false);
 renderer.domElement.addEventListener("mousedown",e=>{if(e.button===0&&!paused&&document.pointerLockElement===renderer.domElement)shoot()});
 $("resume").onclick=()=>{paused=false;$("scoreboard").classList.add("hidden");renderer.domElement.requestPointerLock()};
 $("exit").onclick=exitGame;
 addEventListener("resize",resize);animate();
}
function onMouse(e){if(document.pointerLockElement!==renderer?.domElement||paused)return;yaw-=e.movementX*.0022;pitch-=e.movementY*.0022;pitch=Math.max(-1.35,Math.min(1.35,pitch));camera.rotation.set(pitch,yaw,0,"YXZ")}
function onKeyDown(e){keys[e.code]=true;if(e.code==="Escape"){paused=!paused;$("scoreboard").classList.toggle("hidden",!paused);if(paused){document.exitPointerLock();renderScores([...remotes.values()].map(m=>m.userData.player).filter(Boolean))}}if(e.code==="Space"&&grounded){velocityY=7;grounded=false}}
function spawnEnemies(){
 enemies=[];
 const spots=[[-10,-15],[0,-22],[10,-16],[-18,2],[17,-4],[-7,15],[8,18]];
 spots.forEach(([x,z],i)=>{
  const bot=new THREE.Group();
  const armor=new THREE.MeshStandardMaterial({color:0xd94152,roughness:.55,metalness:.25,emissive:0x31070d});
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.48,.85,4,8),armor);body.position.y=1.05;body.castShadow=true;
  const head=new THREE.Mesh(new THREE.SphereGeometry(.29,12,10),new THREE.MeshStandardMaterial({color:0xffb5a8}));head.position.y=1.9;head.castShadow=true;
  const visor=new THREE.Mesh(new THREE.BoxGeometry(.42,.09,.08),new THREE.MeshBasicMaterial({color:0xffd35a}));visor.position.set(0,1.94,-.25);
  bot.add(body,head,visor);bot.position.set(x,0,z);bot.userData={hp:100,alive:true,phase:i*1.7};
  body.userData.enemyBot=bot;head.userData.enemyBot=bot;visor.userData.enemyBot=bot;
  scene.add(bot);enemies.push(bot);
 });
 notice("HOSTILE CONTACT // "+enemies.length+" BOTS DEPLOYED");
}
function shoot(){
 if(!canShoot)return;canShoot=false;setTimeout(()=>canShoot=true,160);
 const dir=new THREE.Vector3();camera.getWorldDirection(dir);
 const ray=new THREE.Raycaster(camera.position,dir,0,55);
 const hittables=[...targets,...enemies.filter(e=>e.userData.alive).flatMap(e=>e.children),...[...remotes.values()]];
 const hit=ray.intersectObjects(hittables,false)[0];
 const end=hit?hit.point:camera.position.clone().addScaledVector(dir,35);
 const tracer=new THREE.Line(new THREE.BufferGeometry().setFromPoints([camera.position.clone(),end]),new THREE.LineBasicMaterial({color:0x8fffff,transparent:true,opacity:.9}));scene.add(tracer);setTimeout(()=>{scene.remove(tracer);tracer.geometry.dispose();tracer.material.dispose()},75);
 if(hit){
  const bot=hit.object.userData.enemyBot;
  if(bot&&bot.userData.alive){bot.userData.hp-=35;bot.children[0].material.emissive.setHex(0x8b101b);setTimeout(()=>{if(bot.userData.alive)bot.children[0].material.emissive.setHex(0x31070d)},100);
   if(bot.userData.hp<=0){bot.userData.alive=false;scene.remove(bot);kills++;$("kills").textContent=String(kills).padStart(2,"0");notice("BOT ELIMINATED");setTimeout(()=>{if(scene){bot.userData.hp=100;bot.userData.alive=true;bot.position.set((Math.random()-.5)*32,0,-12-(Math.random()*18));scene.add(bot)}},2200)}
   $("hitmarker").style.opacity=1;setTimeout(()=>$ ("hitmarker").style.opacity=0,120);
  } else if(targets.includes(hit.object)){hit.object.material.color.set(0x52ffb0);setTimeout(()=>hit.object.material.color.set(0xff7b42),180);}
 }
 if(socket?.connected)socket.emit("shoot",{});
}
function remoteShot(d){const m=new THREE.Mesh(new THREE.SphereGeometry(.12,6,6),new THREE.MeshBasicMaterial({color:0xffc56a}));m.position.set(d.x,1.55,d.z);scene.add(m);setTimeout(()=>scene.remove(m),100)}
function makeRemote(p){const mesh=new THREE.Mesh(new THREE.CapsuleGeometry(.42,.8,4,8),new THREE.MeshStandardMaterial({color:0x986cff}));mesh.position.set(p.x,1,p.z);mesh.userData.player=p;scene.add(mesh);remotes.set(p.id,mesh)}
function addRemote(p){if(!p||p.id===socket.id||remotes.has(p.id))return;makeRemote(p);$("playersCount").textContent=String(remotes.size+1).padStart(2,"0")}
function updateRemote(p){let m=remotes.get(p.id);if(!m){addRemote(p);m=remotes.get(p.id)}if(m){m.position.set(p.x,1,p.z);m.rotation.y=p.yaw;m.userData.player=p}}
function removeRemote(id){const m=remotes.get(id);if(m){scene.remove(m);remotes.delete(id)}$("playersCount").textContent=String(remotes.size+1).padStart(2,"0")}
function renderScores(arr){const list=(arr||[]).slice().sort((a,b)=>(b.score||0)-(a.score||0));$("scoreRows").innerHTML=list.map(p=>`<div class="score-row"><b>${escapeHtml(p.username||"Operator")}</b><span>${p.kills||0} K / ${p.deaths||0} D</span><strong>${p.score||0}</strong></div>`).join("")||"<small>Belum ada data skor.</small>"}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function animate(){
 if(!renderer)return;requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.04);
 if(!paused){
  enemies.forEach((bot,i)=>{if(!bot.userData.alive)return;bot.userData.phase+=dt;const dx=camera.position.x-bot.position.x,dz=camera.position.z-bot.position.z;const dist=Math.hypot(dx,dz)||1;if(dist>7){bot.position.x+=(dx/dist)*dt*.75;bot.position.z+=(dz/dist)*dt*.75;}bot.position.x+=Math.sin(bot.userData.phase*1.4)*dt*.35;bot.rotation.y=Math.atan2(-dx,-dz);});
  const forward=(keys.KeyW?1:0)-(keys.KeyS?1:0),side=(keys.KeyD?1:0)-(keys.KeyA?1:0);
  const speed=keys.ShiftLeft?10:6;
  const dx=(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*speed*dt;
  const dz=(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*speed*dt;
  camera.position.x=THREE.MathUtils.clamp(camera.position.x+dx,-48,48);
  camera.position.z=THREE.MathUtils.clamp(camera.position.z+dz,-48,48);
  velocityY-=18*dt;camera.position.y+=velocityY*dt;if(camera.position.y<1.7){camera.position.y=1.7;velocityY=0;grounded=true}
  if(socket?.connected)socket.emit("move",{x:camera.position.x,z:camera.position.z,yaw,pitch});
 }
 renderer.render(scene,camera);
}
function resize(){if(!camera||!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)}
function exitGame(){if(socket){socket.disconnect();socket=null}if(renderer){renderer.dispose();renderer.domElement.remove()}renderer=null;scene=null;remotes.clear();targets=[];enemies=[];$("game").classList.add("hidden");$("menu").classList.remove("hidden");document.exitPointerLock?.()}
window.addEventListener("load",()=>{setTimeout(()=>{$("loading").style.opacity=0;setTimeout(()=>$("loading").remove(),550)},700)});
fetch("/api/health").then(r=>r.json()).then(d=>$("online").textContent=d.online+" ONLINE").catch(()=>{});
