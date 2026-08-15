import * as THREE from 'three';
import './style.css';

const root = document.querySelector('#game');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1f3344);
scene.fog = new THREE.FogExp2(0x2b4654, 0.024);
const camera = new THREE.PerspectiveCamera(67, innerWidth / innerHeight, 0.1, 180);
camera.position.set(0, 1.7, 18);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.32;
root.append(renderer.domElement);

const clock = new THREE.Clock();
const keys = {};
const fireflies = [];
const lanterns = [];
const player = { yaw: 0, pitch: 0, speed: 7, fireflyCount: 0, score: 0, lit: 0, combo: 0, lastLightAt: 0, time: 90, active: false, ended: false };
const $ = (id) => document.getElementById(id);
let audioContext;

const toonGradient = new THREE.DataTexture(new Uint8Array([42, 84, 145, 198, 255]), 5, 1, THREE.RedFormat);
toonGradient.needsUpdate = true;

function ensureAudio() { if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)(); if (audioContext.state === 'suspended') audioContext.resume(); }
function sound(frequency, duration = .12, type = 'sine', volume = .035, delay = 0) { if (!audioContext) return; const start = audioContext.currentTime + delay; const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain(); oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start); gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(volume, start + .015); gain.gain.exponentialRampToValueAtTime(0.0001, start + duration); oscillator.connect(gain).connect(audioContext.destination); oscillator.start(start); oscillator.stop(start + duration + .02); }

scene.add(new THREE.HemisphereLight(0x7d9db4, 0x101b20, 2.25));
const moon = new THREE.DirectionalLight(0x9dbbd1, 1.8);
moon.position.set(-20, 28, 10); moon.castShadow = true; moon.shadow.mapSize.set(1024, 1024); scene.add(moon);
const warmFill = new THREE.PointLight(0x6e8a9c, 2, 30); warmFill.position.set(0, 6, 8); scene.add(warmFill);

const moonDisc = new THREE.Mesh(new THREE.SphereGeometry(2.8, 24, 16), new THREE.MeshBasicMaterial({ color: 0xd9e4d8 }));
moonDisc.position.set(-23, 18, -42); scene.add(moonDisc);
for (let i = 0; i < 34; i++) { const star = new THREE.Mesh(new THREE.SphereGeometry(.025 + Math.random() * .035, 5, 4), new THREE.MeshBasicMaterial({ color: i % 3 ? 0xd7e3df : 0xf1c67f, transparent: true, opacity: .45 + Math.random() * .45 })); star.position.set((Math.random() - .5) * 70, 9 + Math.random() * 22, -44 + Math.random() * 34); scene.add(star); }

const groundMat = new THREE.MeshToonMaterial({ color: 0x36534d, gradientMap: toonGradient });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), groundMat);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const pathMat = new THREE.MeshToonMaterial({ color: 0x9a7960, gradientMap: toonGradient });
const path = new THREE.Mesh(new THREE.PlaneGeometry(8, 84), pathMat); path.rotation.x = -Math.PI / 2; path.position.y = .012; scene.add(path);

function tree(x, z, scale = 1) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.22, .34, 3.4, 7), new THREE.MeshToonMaterial({ color: 0x3a2d2b, gradientMap: toonGradient }));
  trunk.position.y = 1.7; trunk.castShadow = true; group.add(trunk);
  const colors = [0x9d4f2f, 0xb86d32, 0xc88d3c, 0x6b7540];
  for (let i = 0; i < 5; i++) { const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3 - i * .12, 1), new THREE.MeshToonMaterial({ color: colors[i % colors.length], gradientMap: toonGradient, flatShading: true })); crown.position.set((i % 2 ? .5 : -.45) + Math.sin(i) * .25, 3.1 + i * .32, (i - 2) * .32); crown.rotation.y = i * .7; crown.castShadow = true; group.add(crown); }
  scene.add(group);
}
for (let i = 0; i < 20; i++) { const side = i % 2 ? 1 : -1; tree(side * (7 + Math.random() * 7), -38 + i * 4.2 + Math.random() * 2, .8 + Math.random() * .6); }

function foregroundTree(x, z, scale) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale);
  const dark = new THREE.MeshToonMaterial({ color: 0x17272d, gradientMap: toonGradient });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.38, .58, 8, 7), dark); trunk.position.y = 4; trunk.castShadow = true; group.add(trunk);
  for (const [rx, ry, rz] of [[.7, 5.8, .1], [-.65, 5.2, .25], [1.05, 4.7, -.1], [-1.2, 4.1, .15]]) { const branch = new THREE.Mesh(new THREE.CylinderGeometry(.1, .25, 3.1, 6), dark); branch.position.set(rx, ry, rz); branch.rotation.z = rx > 0 ? -.65 : .65; branch.castShadow = true; group.add(branch); }
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.5, 1), new THREE.MeshToonMaterial({ color: 0x1a3035, gradientMap: toonGradient, flatShading: true })); crown.position.y = 7; crown.castShadow = true; group.add(crown); scene.add(group);
}
foregroundTree(-8.2, 9, 1.4); foregroundTree(8.5, 3, 1.25); foregroundTree(-9.5, -24, 1.3); foregroundTree(9.5, -31, 1.45);

// A second, distant forest layer gives the path the illustrated tunnel-like depth of a storybook scene.
const distantForestMat = new THREE.MeshToonMaterial({ color: 0x29444a, gradientMap: toonGradient, flatShading: true });
for (let i = 0; i < 18; i++) {
  const side = i % 2 ? 1 : -1;
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.1 + (i % 3) * .45, 7 + (i % 4), 7), distantForestMat);
  canopy.position.set(side * (10 + (i % 4) * 1.7), 3.8, -45 + i * 3.6);
  canopy.rotation.y = i * .37;
  scene.add(canopy);
}

const grassMat = new THREE.MeshToonMaterial({ color: 0x314c45, gradientMap: toonGradient, side: THREE.DoubleSide });
for (let i = 0; i < 70; i++) { const tuft = new THREE.Mesh(new THREE.ConeGeometry(.18 + Math.random() * .16, .55 + Math.random() * .4, 4), grassMat); tuft.position.set((Math.random() < .5 ? -1 : 1) * (4.6 + Math.random() * 8), .26, -41 + Math.random() * 59); tuft.rotation.y = Math.random() * Math.PI; scene.add(tuft); }

function makeLantern(x, z, index) {
  const group = new THREE.Group(); group.position.set(x, 0, z);
  const postMat = new THREE.MeshToonMaterial({ color: 0x1d252b, gradientMap: toonGradient });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(.07, .11, 2.7, 8), postMat); post.position.y = 1.35; post.castShadow = true; group.add(post);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(.32, .2, 6), postMat); cap.position.y = 2.76; cap.castShadow = true; group.add(cap);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.18, 12, 8), new THREE.MeshBasicMaterial({ color: 0x3e4b4a })); bulb.position.y = 2.55; group.add(bulb);
  const light = new THREE.PointLight(0xffbc62, 0, 10, 1.8); light.position.y = 2.5; light.castShadow = true; group.add(light);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.39, .025, 6, 20), new THREE.MeshBasicMaterial({ color: 0xb36d36, transparent: true, opacity: .55 })); ring.rotation.x = Math.PI / 2; ring.position.y = .05; group.add(ring);
  const item = { group, light, bulb, ring, lit: false, index, pulse: Math.random() * 5 };
  lanterns.push(item); scene.add(group);
}
[[0, 11], [0, -2], [0, -15], [0, -29], [-3.6, 5], [3.6, -8], [-3.6, -21], [3.6, -35]].forEach((p, i) => makeLantern(p[0], p[1], i));

const fireflyGeo = new THREE.SphereGeometry(.07, 8, 8);
const fireflyMat = new THREE.MeshBasicMaterial({ color: 0xffe19a });
for (let i = 0; i < 38; i++) { const mesh = new THREE.Mesh(fireflyGeo, fireflyMat); mesh.position.set((Math.random() - .5) * 12, .65 + Math.random() * 2.3, -38 + Math.random() * 53); mesh.userData = { baseY: mesh.position.y, phase: Math.random() * 6, collected: false }; fireflies.push(mesh); scene.add(mesh); }

const leafGeo = new THREE.PlaneGeometry(.17, .1);
for (let i = 0; i < 125; i++) { const leaf = new THREE.Mesh(leafGeo, new THREE.MeshBasicMaterial({ color: [0xa94d29, 0xd28739, 0xb67332][i % 3], side: THREE.DoubleSide })); leaf.position.set((Math.random() - .5) * 13, .06 + Math.random() * .03, -42 + Math.random() * 58); leaf.rotation.set(-Math.PI / 2, Math.random() * 3, Math.random() * 3); leaf.scale.setScalar(.65 + Math.random() * .8); scene.add(leaf); }

function showToast(text) { const toast = $('toast'); toast.textContent = text; toast.style.opacity = '1'; clearTimeout(showToast.timer); showToast.timer = setTimeout(() => { toast.style.opacity = '0'; }, 1500); }
function updateHUD() { $('score').textContent = String(player.score).padStart(4, '0'); $('combo').textContent = `x${Math.max(1, player.combo)}`; $('fireflies').textContent = player.fireflyCount; $('lantern-count').textContent = `${player.lit} / 8 фонарей зажжено`; $('progress-bar').style.width = `${player.lit / 8 * 100}%`; const seconds = Math.max(0, Math.ceil(player.time)); $('time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function lightLantern(item) { item.lit = true; item.light.intensity = 5; item.bulb.material.color.set(0xffc267); item.ring.material.color.set(0xffb24f); item.ring.material.opacity = .95; player.fireflyCount -= 3; player.lit++; const now = clock.elapsedTime; player.combo = now - player.lastLightAt < 18 ? player.combo + 1 : 1; player.lastLightAt = now; const multiplier = 1 + (player.combo - 1) * .25; const points = Math.round((100 + player.lit * 25) * multiplier); player.score += points; sound(392, .25, 'sine', .04); sound(523, .4, 'sine', .04, .1); sound(659, .5, 'sine', .03, .2); showToast(player.combo > 1 ? `Комбо x${player.combo}  +${points}` : `Фонарь зажжён  +${points}`); updateHUD(); if (player.lit === lanterns.length) finish(); }
function collectFireflies(dt) { for (const fly of fireflies) { if (fly.userData.collected) continue; fly.position.y = fly.userData.baseY + Math.sin(clock.elapsedTime * 1.7 + fly.userData.phase) * .18; fly.material.opacity = .75 + Math.sin(clock.elapsedTime * 4 + fly.userData.phase) * .25; if (fly.position.distanceTo(camera.position) < 1.25) { fly.userData.collected = true; fly.visible = false; player.fireflyCount++; player.score += 10; sound(740 + player.fireflyCount * 55, .16, 'sine', .035); showToast('+ 1 светлячок'); updateHUD(); } } }
function nearestLantern() { let best = null; let distance = 999; for (const item of lanterns) { const d = item.group.position.distanceTo(camera.position); if (!item.lit && d < distance) { best = item; distance = d; } } return { item: best, distance }; }
function interact() { if (!player.active) return; const near = nearestLantern(); if (near.item && near.distance < 3.2) { if (player.fireflyCount >= 3) lightLantern(near.item); else showToast(`Нужно ещё ${3 - player.fireflyCount} светлячка`); } }
function start() { ensureAudio(); player.active = true; $('start-screen').classList.add('hidden'); renderer.domElement.requestPointerLock?.(); sound(262, .2, 'sine', .025); showToast('Найди первый фонарь'); }
function finish() { player.active = false; player.ended = true; document.exitPointerLock?.(); const previousBest = Number(localStorage.getItem('lantern-keeper-best') || 0); const best = Math.max(previousBest, player.score); localStorage.setItem('lantern-keeper-best', String(best)); $('final-score').textContent = String(player.score).padStart(4, '0'); $('best-score').textContent = player.score >= previousBest ? 'Новый рекорд' : `Рекорд: ${String(best).padStart(4, '0')}`; $('finish-screen').classList.add('visible'); }
function reset() { location.reload(); }

window.addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'KeyE') interact(); if (e.code === 'KeyR' && player.ended) reset(); });
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('mousemove', e => { if (!player.active || document.pointerLockElement !== renderer.domElement) return; player.yaw -= e.movementX * .0022; player.pitch = THREE.MathUtils.clamp(player.pitch - e.movementY * .0018, -1.25, 1.25); });
renderer.domElement.addEventListener('click', () => { if (player.active) renderer.domElement.requestPointerLock?.(); });
$('start-button').addEventListener('click', start); $('restart-button').addEventListener('click', reset);
if (location.hash === '#demo') {
  player.active = true;
  const startScreen = $('start-screen');
  startScreen.classList.add('hidden');
  startScreen.style.display = 'none';
}

function movePlayer(dt) { const direction = new THREE.Vector3(Number(keys.KeyD) - Number(keys.KeyA), 0, Number(keys.KeyW) - Number(keys.KeyS)); if (!direction.lengthSq()) return; direction.normalize(); const forward = new THREE.Vector3(Math.sin(player.yaw), 0, -Math.cos(player.yaw)); const right = new THREE.Vector3(forward.z, 0, -forward.x); const sprinting = keys.ShiftLeft || keys.ShiftRight; const delta = forward.multiplyScalar(direction.z).add(right.multiplyScalar(direction.x)).multiplyScalar((sprinting ? 10 : player.speed) * dt); camera.position.add(delta); camera.position.x = THREE.MathUtils.clamp(camera.position.x, -5.3, 5.3); camera.position.z = THREE.MathUtils.clamp(camera.position.z, -42, 19); }
function tick() { const dt = Math.min(clock.getDelta(), .05); if (player.active && !player.ended) { player.time -= dt; if (player.time <= 0) finish(); movePlayer(dt); collectFireflies(dt); const look = new THREE.Vector3(Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), Math.cos(player.yaw) * Math.cos(player.pitch)); camera.lookAt(camera.position.clone().add(look)); const near = nearestLantern(); $('prompt').style.opacity = near.item && near.distance < 3.2 ? '1' : '.65'; if (near.item && near.distance < 3.2) $('prompt').innerHTML = player.fireflyCount >= 3 ? '<span class="key">E</span> зажечь фонарь' : '<span class="key">E</span> нужно больше светлячков'; updateHUD(); } for (const lantern of lanterns) { if (lantern.lit) lantern.light.intensity = 4.5 + Math.sin(clock.elapsedTime * 5 + lantern.pulse) * .4; } renderer.render(scene, camera); requestAnimationFrame(tick); }
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
updateHUD(); tick();
