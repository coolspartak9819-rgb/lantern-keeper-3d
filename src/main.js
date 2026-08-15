import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
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
renderer.toneMappingExposure = 1.08;
root.append(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.5, 0.7);
composer.addPass(bloomPass);
const outlinePass = new OutlinePass(new THREE.Vector2(innerWidth, innerHeight), scene, camera);
outlinePass.visibleEdgeColor.set(0x211821);
outlinePass.hiddenEdgeColor.set(0x0e1118);
outlinePass.edgeStrength = 3.1;
outlinePass.edgeThickness = 1.25;
composer.addPass(outlinePass);

const clock = new THREE.Clock();
const keys = {};
const fireflies = [];
const lanterns = [];
const outlineObjects = [];
const player = { yaw: 0, pitch: 0, speed: 7, fireflyCount: 0, score: 0, lit: 0, combo: 0, lastLightAt: 0, time: 90, active: false, ended: false };
const $ = (id) => document.getElementById(id);
let audioContext;
let gameCore = null;

async function loadGameCore() {
  try {
    const response = await fetch('/wasm/lantern_keeper_core.wasm');
    const bytes = await response.arrayBuffer();
    const module = await WebAssembly.instantiate(bytes);
    gameCore = module.instance.exports;
  } catch (error) {
    // The JavaScript fallback keeps the game playable while developing without a WASM build.
    console.warn('Rust WASM core is unavailable; using the browser fallback.', error);
  }
}

async function loadRuntimePalette() {
  try {
    const palette = await (await fetch('/generated/palette.json')).json();
    scene.background.set(palette.fog);
    scene.fog.color.set(palette.fog);
    moon.color.set(palette.moon);
  } catch (error) {
    console.warn('C++ palette file is unavailable; using the built-in palette.', error);
  }
}

const toonGradient = new THREE.DataTexture(new Uint8Array([42, 84, 145, 198, 255]), 5, 1, THREE.RedFormat);
toonGradient.needsUpdate = true;

function proceduralTexture(base, detail, scale = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = base;
  context.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 450; i++) {
    context.globalAlpha = .1 + Math.random() * .22;
    context.fillStyle = detail;
    const size = 1 + Math.random() * 4;
    context.fillRect(Math.random() * 128, Math.random() * 128, size, size * (.3 + Math.random()));
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(scale / 18, scale / 18);
  return texture;
}

function radialGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,244,194,1)');
  gradient.addColorStop(.17, 'rgba(255,187,88,.9)');
  gradient.addColorStop(.5, 'rgba(255,143,51,.23)');
  gradient.addColorStop(1, 'rgba(255,143,51,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

const barkMap = proceduralTexture('#3b2a26', '#9a6843', 26);
const groundMap = proceduralTexture('#334943', '#6c7b63', 48);
const pathMap = proceduralTexture('#79604d', '#c79456', 36);
const glowMap = radialGlowTexture();

function ensureAudio() { if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)(); if (audioContext.state === 'suspended') audioContext.resume(); }
function sound(frequency, duration = .12, type = 'sine', volume = .035, delay = 0) { if (!audioContext) return; const start = audioContext.currentTime + delay; const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain(); oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start); gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(volume, start + .015); gain.gain.exponentialRampToValueAtTime(0.0001, start + duration); oscillator.connect(gain).connect(audioContext.destination); oscillator.start(start); oscillator.stop(start + duration + .02); }

scene.add(new THREE.HemisphereLight(0x7898b5, 0x101822, 2.8));
const moon = new THREE.DirectionalLight(0xa8c7df, 2.25);
moon.position.set(-20, 28, 10); moon.castShadow = true; moon.shadow.mapSize.set(1024, 1024); scene.add(moon);
const warmFill = new THREE.PointLight(0x6689a5, 1.5, 30); warmFill.position.set(0, 6, 8); scene.add(warmFill);

const moonDisc = new THREE.Mesh(new THREE.SphereGeometry(2.8, 24, 16), new THREE.MeshBasicMaterial({ color: 0xd9e4d8 }));
moonDisc.position.set(-23, 18, -42); scene.add(moonDisc);
for (let i = 0; i < 34; i++) { const star = new THREE.Mesh(new THREE.SphereGeometry(.025 + Math.random() * .035, 5, 4), new THREE.MeshBasicMaterial({ color: i % 3 ? 0xd7e3df : 0xf1c67f, transparent: true, opacity: .45 + Math.random() * .45 })); star.position.set((Math.random() - .5) * 70, 9 + Math.random() * 22, -44 + Math.random() * 34); scene.add(star); }

const mountainMat = new THREE.MeshStandardMaterial({ color: 0x253d4c, roughness: 1, flatShading: true });
for (let i = 0; i < 11; i++) {
  const mountain = new THREE.Mesh(new THREE.ConeGeometry(3.5 + (i % 3) * 1.1, 8 + (i % 4) * 2.5, 5), mountainMat);
  mountain.position.set(-27 + i * 5.5, 4.4, -57 - (i % 2) * 2);
  mountain.rotation.y = i * .41;
  scene.add(mountain);
}

const groundMat = new THREE.MeshStandardMaterial({ color: 0x49625a, map: groundMap, roughness: .93, metalness: 0 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), groundMat);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const pathMat = new THREE.MeshStandardMaterial({ color: 0x9b7355, map: pathMap, roughness: .88, metalness: 0 });
const path = new THREE.Mesh(new THREE.PlaneGeometry(8, 84), pathMat); path.rotation.x = -Math.PI / 2; path.position.y = .012; scene.add(path);

function tree(x, z, scale = 1) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.22, .34, 3.4, 10), new THREE.MeshStandardMaterial({ color: 0x4b342b, map: barkMap, roughness: .96, metalness: 0 }));
  trunk.position.y = 1.7; trunk.castShadow = true; group.add(trunk);
  const colors = [0x8b4e36, 0xaa6234, 0xc9853d, 0x667443];
  for (let i = 0; i < 7; i++) { const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(1.05 - (i % 3) * .1, 1), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: .92, flatShading: true })); crown.position.set((i % 2 ? .56 : -.48) + Math.sin(i * 1.7) * .25, 3.05 + i * .27, (i - 3) * .31); crown.rotation.y = i * .7; crown.castShadow = true; group.add(crown); }
  scene.add(group); outlineObjects.push(group);
}
for (let i = 0; i < 20; i++) { const side = i % 2 ? 1 : -1; tree(side * (7 + Math.random() * 7), -38 + i * 4.2 + Math.random() * 2, .8 + Math.random() * .6); }

function foregroundTree(x, z, scale) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale);
  const dark = new THREE.MeshToonMaterial({ color: 0x17272d, gradientMap: toonGradient });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.38, .58, 8, 7), dark); trunk.position.y = 4; trunk.castShadow = true; group.add(trunk);
  for (const [rx, ry, rz] of [[.7, 5.8, .1], [-.65, 5.2, .25], [1.05, 4.7, -.1], [-1.2, 4.1, .15]]) { const branch = new THREE.Mesh(new THREE.CylinderGeometry(.1, .25, 3.1, 6), dark); branch.position.set(rx, ry, rz); branch.rotation.z = rx > 0 ? -.65 : .65; branch.castShadow = true; group.add(branch); }
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.5, 1), new THREE.MeshToonMaterial({ color: 0x1a3035, gradientMap: toonGradient, flatShading: true })); crown.position.y = 7; crown.castShadow = true; group.add(crown); scene.add(group); outlineObjects.push(group);
}
foregroundTree(-8.2, 9, 1.4); foregroundTree(8.5, 3, 1.25); foregroundTree(-9.5, -24, 1.3); foregroundTree(9.5, -31, 1.45);

// A second, distant forest layer gives the path the illustrated tunnel-like depth of a storybook scene.
const distantForestMat = new THREE.MeshToonMaterial({ color: 0x29444a, gradientMap: toonGradient, flatShading: true });
for (let i = 0; i < 18; i++) {
  const side = i % 2 ? 1 : -1;
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.1 + (i % 3) * .45, 7 + (i % 4), 7), distantForestMat);
  canopy.position.set(side * (10 + (i % 4) * 1.7), 3.8, -45 + i * 3.6);
  canopy.rotation.y = i * .37;
  scene.add(canopy); outlineObjects.push(canopy);
}

const grassMat = new THREE.MeshToonMaterial({ color: 0x314c45, gradientMap: toonGradient, side: THREE.DoubleSide });
for (let i = 0; i < 70; i++) { const tuft = new THREE.Mesh(new THREE.ConeGeometry(.18 + Math.random() * .16, .55 + Math.random() * .4, 4), grassMat); tuft.position.set((Math.random() < .5 ? -1 : 1) * (4.6 + Math.random() * 8), .26, -41 + Math.random() * 59); tuft.rotation.y = Math.random() * Math.PI; scene.add(tuft); }

const mistLayers = [];
for (let i = 0; i < 7; i++) {
  const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: 0x95b8c4, transparent: true, opacity: .07, depthWrite: false }));
  mist.position.set((i % 2 ? -1 : 1) * (2.5 + (i % 3) * 2.1), 1.2 + (i % 2) * .4, -4 - i * 6.4);
  mist.scale.set(10 + (i % 3) * 2, 3.4, 1);
  mistLayers.push(mist);
  scene.add(mist);
}

function makeLantern(x, z, index) {
  const group = new THREE.Group(); group.position.set(x, 0, z);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x172027, metalness: .88, roughness: .28 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(.075, .125, 2.72, 12), postMat); post.position.y = 1.36; post.castShadow = true; group.add(post);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.22, .3, .18, 12), postMat); base.position.y = .09; base.castShadow = true; group.add(base);
  const arm = new THREE.Mesh(new THREE.TorusGeometry(.42, .045, 8, 18, Math.PI), postMat); arm.position.set(.29, 2.66, 0); arm.rotation.z = Math.PI / 2; arm.castShadow = true; group.add(arm);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(.38, .25, 8), postMat); cap.position.set(.56, 2.79, 0); cap.castShadow = true; group.add(cap);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(.23, .23, .4, 10, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xffd38a, transparent: true, opacity: .22, transmission: .25, roughness: .1, metalness: 0 })); glass.position.set(.56, 2.5, 0); group.add(glass);
  for (let side = -1; side <= 1; side += 2) { const rail = new THREE.Mesh(new THREE.BoxGeometry(.028, .46, .028), postMat); rail.position.set(.56 + side * .19, 2.5, 0); group.add(rail); }
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.11, 12, 8), new THREE.MeshBasicMaterial({ color: 0x4c5148 })); bulb.position.set(.56, 2.5, 0); group.add(bulb);
  const filament = new THREE.Mesh(new THREE.TorusGeometry(.05, .012, 6, 12), new THREE.MeshBasicMaterial({ color: 0x7e5f35 })); filament.position.set(.56, 2.5, 0); filament.rotation.x = Math.PI / 2; group.add(filament);
  const light = new THREE.PointLight(0xffbc62, 0, 10, 1.8); light.position.y = 2.5; light.castShadow = true; group.add(light);
  light.position.x = .56;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: 0xffb54e, transparent: true, opacity: .06, depthWrite: false, blending: THREE.AdditiveBlending })); glow.position.set(.56, 2.5, 0); glow.scale.set(3.4, 3.4, 1); group.add(glow);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.48, .025, 6, 20), new THREE.MeshBasicMaterial({ color: 0xb36d36, transparent: true, opacity: .35 })); ring.rotation.x = Math.PI / 2; ring.position.y = .05; group.add(ring);
  const item = { group, light, bulb, ring, glow, filament, lit: false, index, pulse: Math.random() * 5 };
  lanterns.push(item); scene.add(group); outlineObjects.push(group);
}
[[0, 11], [0, -2], [0, -15], [0, -29], [-3.6, 5], [3.6, -8], [-3.6, -21], [3.6, -35]].forEach((p, i) => makeLantern(p[0], p[1], i));

const fireflyGeo = new THREE.SphereGeometry(.07, 8, 8);
const fireflyMat = new THREE.MeshBasicMaterial({ color: 0xffe19a });
for (let i = 0; i < 38; i++) { const mesh = new THREE.Mesh(fireflyGeo, fireflyMat); mesh.position.set((Math.random() - .5) * 12, .65 + Math.random() * 2.3, -38 + Math.random() * 53); mesh.userData = { baseY: mesh.position.y, phase: Math.random() * 6, collected: false }; fireflies.push(mesh); scene.add(mesh); }

const leafGeo = new THREE.PlaneGeometry(.17, .1);
for (let i = 0; i < 125; i++) { const leaf = new THREE.Mesh(leafGeo, new THREE.MeshBasicMaterial({ color: [0xa94d29, 0xd28739, 0xb67332][i % 3], side: THREE.DoubleSide })); leaf.position.set((Math.random() - .5) * 13, .06 + Math.random() * .03, -42 + Math.random() * 58); leaf.rotation.set(-Math.PI / 2, Math.random() * 3, Math.random() * 3); leaf.scale.setScalar(.65 + Math.random() * .8); scene.add(leaf); }

function showToast(text) { const toast = $('toast'); toast.textContent = text; toast.style.opacity = '1'; clearTimeout(showToast.timer); showToast.timer = setTimeout(() => { toast.style.opacity = '0'; }, 1500); }
function updateHUD() { $('score').textContent = String(player.score).padStart(4, '0'); $('combo').textContent = `x${Math.max(1, player.combo)}`; $('fireflies').textContent = player.fireflyCount; $('lantern-count').textContent = `${player.lit} / 8 фонарей зажжено`; $('progress-bar').style.width = `${player.lit / 8 * 100}%`; const seconds = Math.max(0, Math.ceil(player.time)); $('time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function lightLantern(item) { item.lit = true; item.light.intensity = 5; item.bulb.material.color.set(0xffd17b); item.filament.material.color.set(0xfff0b4); item.glow.material.opacity = .92; item.ring.material.color.set(0xffb24f); item.ring.material.opacity = .95; player.fireflyCount -= 3; player.lit++; const now = clock.elapsedTime; const elapsedMs = Math.round((now - player.lastLightAt) * 1000); player.combo = gameCore ? gameCore.next_combo(player.combo, elapsedMs) : now - player.lastLightAt < 18 ? player.combo + 1 : 1; player.lastLightAt = now; const multiplier = 1 + (player.combo - 1) * .25; const points = gameCore ? gameCore.score_for_lantern(player.lit, player.combo) : Math.round((100 + player.lit * 25) * multiplier); player.score += points; sound(392, .25, 'sine', .04); sound(523, .4, 'sine', .04, .1); sound(659, .5, 'sine', .03, .2); showToast(player.combo > 1 ? `Комбо x${player.combo}  +${points}` : `Фонарь зажжён  +${points}`); updateHUD(); if (player.lit === lanterns.length) finish(); }
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
function tick() { const dt = Math.min(clock.getDelta(), .05); if (player.active && !player.ended) { player.time -= dt; if (player.time <= 0) finish(); movePlayer(dt); collectFireflies(dt); const look = new THREE.Vector3(Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), Math.cos(player.yaw) * Math.cos(player.pitch)); camera.lookAt(camera.position.clone().add(look)); const near = nearestLantern(); $('prompt').style.opacity = near.item && near.distance < 3.2 ? '1' : '.65'; if (near.item && near.distance < 3.2) $('prompt').innerHTML = player.fireflyCount >= 3 ? '<span class="key">E</span> зажечь фонарь' : '<span class="key">E</span> нужно больше светлячков'; updateHUD(); } for (const lantern of lanterns) { if (lantern.lit) { lantern.light.intensity = 4.5 + Math.sin(clock.elapsedTime * 5 + lantern.pulse) * .4; lantern.glow.material.opacity = .75 + Math.sin(clock.elapsedTime * 4 + lantern.pulse) * .12; } } mistLayers.forEach((mist, index) => { mist.material.opacity = .045 + Math.sin(clock.elapsedTime * .32 + index) * .018; mist.position.x += Math.sin(clock.elapsedTime * .18 + index) * .0015; }); composer.render(); requestAnimationFrame(tick); }
outlinePass.selectedObjects = outlineObjects;
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); outlinePass.setSize(innerWidth, innerHeight); });
updateHUD(); tick();
loadGameCore();
loadRuntimePalette();
