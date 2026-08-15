import * as THREE from 'three';
import './style.css';

const root = document.querySelector('#game');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101b26);
scene.fog = new THREE.FogExp2(0x101b26, 0.018);
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

const clock = new THREE.Clock();
const keys = {};
const fireflies = [];
const lanterns = [];
const player = { yaw: 0, pitch: 0, speed: 7, fireflyCount: 0, score: 0, lit: 0, time: 90, active: false, ended: false };
const $ = (id) => document.getElementById(id);

scene.add(new THREE.HemisphereLight(0x97b7c0, 0x182017, 1.8));
const moon = new THREE.DirectionalLight(0xa4c5d1, 1.5);
moon.position.set(-20, 28, 10); moon.castShadow = true; moon.shadow.mapSize.set(1024, 1024); scene.add(moon);
const warmFill = new THREE.PointLight(0xc07c45, 2, 30); warmFill.position.set(0, 6, 8); scene.add(warmFill);

const groundMat = new THREE.MeshStandardMaterial({ color: 0x334438, roughness: 1 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), groundMat);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const pathMat = new THREE.MeshStandardMaterial({ color: 0x7c674f, roughness: 1 });
const path = new THREE.Mesh(new THREE.PlaneGeometry(8, 84), pathMat); path.rotation.x = -Math.PI / 2; path.position.y = .012; scene.add(path);

function tree(x, z, scale = 1) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.22, .34, 3.4, 7), new THREE.MeshStandardMaterial({ color: 0x433126, roughness: 1 }));
  trunk.position.y = 1.7; trunk.castShadow = true; group.add(trunk);
  const colors = [0x9d4f2f, 0xb86d32, 0xc88d3c, 0x6b7540];
  for (let i = 0; i < 5; i++) { const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3 - i * .12, 1), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: .94 })); crown.position.set((i % 2 ? .5 : -.45) + Math.sin(i) * .25, 3.1 + i * .32, (i - 2) * .32); crown.castShadow = true; group.add(crown); }
  scene.add(group);
}
for (let i = 0; i < 20; i++) { const side = i % 2 ? 1 : -1; tree(side * (7 + Math.random() * 7), -38 + i * 4.2 + Math.random() * 2, .8 + Math.random() * .6); }

function makeLantern(x, z, index) {
  const group = new THREE.Group(); group.position.set(x, 0, z);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x222a2d, metalness: .65, roughness: .36 });
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
function updateHUD() { $('score').textContent = String(player.score).padStart(4, '0'); $('fireflies').textContent = player.fireflyCount; $('lantern-count').textContent = `${player.lit} / 8 фонарей зажжено`; $('progress-bar').style.width = `${player.lit / 8 * 100}%`; const seconds = Math.max(0, Math.ceil(player.time)); $('time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function lightLantern(item) { item.lit = true; item.light.intensity = 5; item.bulb.material.color.set(0xffc267); item.ring.material.color.set(0xffb24f); item.ring.material.opacity = .95; player.fireflyCount -= 3; player.lit++; player.score += 100 + player.lit * 25; showToast(`Фонарь зажжён  +${100 + player.lit * 25}`); updateHUD(); if (player.lit === lanterns.length) finish(); }
function collectFireflies(dt) { for (const fly of fireflies) { if (fly.userData.collected) continue; fly.position.y = fly.userData.baseY + Math.sin(clock.elapsedTime * 1.7 + fly.userData.phase) * .18; fly.material.opacity = .75 + Math.sin(clock.elapsedTime * 4 + fly.userData.phase) * .25; if (fly.position.distanceTo(camera.position) < 1.25) { fly.userData.collected = true; fly.visible = false; player.fireflyCount++; player.score += 10; showToast('+ 1 светлячок'); updateHUD(); } } }
function nearestLantern() { let best = null; let distance = 999; for (const item of lanterns) { const d = item.group.position.distanceTo(camera.position); if (!item.lit && d < distance) { best = item; distance = d; } } return { item: best, distance }; }
function interact() { if (!player.active) return; const near = nearestLantern(); if (near.item && near.distance < 3.2) { if (player.fireflyCount >= 3) lightLantern(near.item); else showToast(`Need ${3 - player.fireflyCount} more fireflies`); } }
function start() { player.active = true; $('start-screen').classList.add('hidden'); renderer.domElement.requestPointerLock?.(); showToast('Найди первый фонарь'); }
function finish() { player.active = false; player.ended = true; document.exitPointerLock?.(); $('final-score').textContent = String(player.score).padStart(4, '0'); $('finish-screen').classList.add('visible'); }
function reset() { location.reload(); }

window.addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'KeyE') interact(); if (e.code === 'KeyR' && player.ended) reset(); });
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('mousemove', e => { if (!player.active || document.pointerLockElement !== renderer.domElement) return; player.yaw -= e.movementX * .0022; player.pitch = THREE.MathUtils.clamp(player.pitch - e.movementY * .0018, -1.25, 1.25); });
renderer.domElement.addEventListener('click', () => { if (player.active) renderer.domElement.requestPointerLock?.(); });
$('start-button').addEventListener('click', start); $('restart-button').addEventListener('click', reset);
if (location.hash === '#demo') { player.active = true; $('start-screen').classList.add('hidden'); }

function movePlayer(dt) { const direction = new THREE.Vector3(Number(keys.KeyD) - Number(keys.KeyA), 0, Number(keys.KeyW) - Number(keys.KeyS)); if (!direction.lengthSq()) return; direction.normalize(); const forward = new THREE.Vector3(Math.sin(player.yaw), 0, -Math.cos(player.yaw)); const right = new THREE.Vector3(forward.z, 0, -forward.x); const delta = forward.multiplyScalar(direction.z).add(right.multiplyScalar(direction.x)).multiplyScalar(player.speed * dt); camera.position.add(delta); camera.position.x = THREE.MathUtils.clamp(camera.position.x, -5.3, 5.3); camera.position.z = THREE.MathUtils.clamp(camera.position.z, -42, 19); }
function tick() { const dt = Math.min(clock.getDelta(), .05); if (player.active && !player.ended) { player.time -= dt; if (player.time <= 0) finish(); movePlayer(dt); collectFireflies(dt); const look = new THREE.Vector3(Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), Math.cos(player.yaw) * Math.cos(player.pitch)); camera.lookAt(camera.position.clone().add(look)); const near = nearestLantern(); $('prompt').style.opacity = near.item && near.distance < 3.2 ? '1' : '.65'; if (near.item && near.distance < 3.2) $('prompt').innerHTML = player.fireflyCount >= 3 ? '<span class="key">E</span> зажечь фонарь' : '<span class="key">E</span> нужно больше светлячков'; updateHUD(); } for (const lantern of lanterns) { if (lantern.lit) lantern.light.intensity = 4.5 + Math.sin(clock.elapsedTime * 5 + lantern.pulse) * .4; } renderer.render(scene, camera); requestAnimationFrame(tick); }
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
updateHUD(); tick();
