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
renderer.domElement.tabIndex = 0;

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
const player = { yaw: 0, pitch: 0, speed: 7, score: 0, combo: 0, lastLightAt: 0, time: 150, active: false, ended: false, selectedType: 'yellow', inventory: { yellow: 3, blue: 2, purple: 1 }, flashAt: -99, shake: 0 };
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

function makeMeterSprite(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 24;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.35, .25, 1);
  return { sprite, canvas, texture, color };
}

function updateMeter(meter, value) {
  const context = meter.canvas.getContext('2d');
  context.clearRect(0, 0, 128, 24);
  context.fillStyle = 'rgba(5, 10, 16, .72)'; context.fillRect(4, 6, 120, 12);
  context.fillStyle = meter.color; context.fillRect(6, 8, Math.max(0, Math.min(116, 116 * value)), 8);
  context.strokeStyle = 'rgba(255,255,255,.42)'; context.strokeRect(4.5, 6.5, 119, 11);
  meter.texture.needsUpdate = true;
}

const barkMap = proceduralTexture('#3b2a26', '#9a6843', 26);
const groundMap = proceduralTexture('#334943', '#6c7b63', 48);
const pathMap = proceduralTexture('#79604d', '#c79456', 36);
const glowMap = radialGlowTexture();
const artLoader = new THREE.TextureLoader();

function illustratedSprite(path, width, height) {
  const texture = artLoader.load(path);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(width, height, 1);
  return sprite;
}

const paintedBackdrop = illustratedSprite('/art/forest-backdrop.svg', 78, 44);
paintedBackdrop.position.set(0, 13, -57);
scene.add(paintedBackdrop);
const foregroundBushLeft = illustratedSprite('/art/foreground-bush.svg', 9.5, 5.3);
foregroundBushLeft.position.set(-8.5, 2.3, 9); scene.add(foregroundBushLeft);
const foregroundBushRight = illustratedSprite('/art/foreground-bush.svg', 10.5, 5.8);
foregroundBushRight.position.set(9, 2.5, 5); foregroundBushRight.scale.x *= -1; scene.add(foregroundBushRight);

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
const pathDetails = new THREE.Mesh(new THREE.PlaneGeometry(7.9, 83.9), new THREE.MeshBasicMaterial({ map: artLoader.load('/art/path-details.svg'), transparent: true, depthWrite: false }));
pathDetails.rotation.x = -Math.PI / 2; pathDetails.position.y = .026; scene.add(pathDetails);

function tree(x, z, scale = 1) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale);
  const paintedTrunk = illustratedSprite('/art/tree-trunk.svg', 2.55, 5.25); paintedTrunk.position.set(0, 2.55, .22); group.add(paintedTrunk);
  const paintedFoliage = illustratedSprite('/art/tree-foliage.svg', 4.9, 4.25); paintedFoliage.position.set(0, 5.2, .3); group.add(paintedFoliage);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.22, .34, 3.4, 10), new THREE.MeshStandardMaterial({ color: 0x4b342b, map: barkMap, roughness: .96, metalness: 0 }));
  trunk.position.y = 1.7; trunk.castShadow = true; group.add(trunk);
  const colors = [0x8b4e36, 0xaa6234, 0xc9853d, 0x667443];
  for (let i = 0; i < 7; i++) { const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(1.05 - (i % 3) * .1, 1), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: .92, flatShading: true })); crown.position.set((i % 2 ? .56 : -.48) + Math.sin(i * 1.7) * .25, 3.05 + i * .27, (i - 3) * .31); crown.rotation.y = i * .7; crown.castShadow = true; group.add(crown); }
  scene.add(group); outlineObjects.push(group);
}
for (let i = 0; i < 20; i++) { const side = i % 2 ? 1 : -1; tree(side * (7 + Math.random() * 7), -38 + i * 4.2 + Math.random() * 2, .8 + Math.random() * .6); }

function foregroundTree(x, z, scale) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale);
  const paintedTrunk = illustratedSprite('/art/tree-trunk.svg', 3.5, 7.25); paintedTrunk.position.set(0, 3.55, .35); group.add(paintedTrunk);
  const paintedFoliage = illustratedSprite('/art/tree-foliage.svg', 7.1, 6.2); paintedFoliage.position.set(0, 7.2, .42); group.add(paintedFoliage);
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
  const paintedLantern = illustratedSprite('/art/lantern-illustrated.svg', 1.35, 2.8); paintedLantern.position.set(.56, 1.43, .2); group.add(paintedLantern);
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
  const meter = makeMeterSprite('#ffd16d'); meter.sprite.position.set(.56, 3.35, 0); meter.sprite.visible = false; group.add(meter.sprite);
  const item = { group, light, bulb, ring, glow, filament, meter, lit: false, index, pulse: Math.random() * 5, charge: 0, type: null, attackAt: 0 };
  lanterns.push(item); scene.add(group); outlineObjects.push(group);
}
[[0, 11], [0, -2], [0, -15], [0, -29], [-3.6, 5], [3.6, -8], [-3.6, -21], [3.6, -35]].forEach((p, i) => makeLantern(p[0], p[1], i));

const leafGeo = new THREE.PlaneGeometry(.17, .1);
for (let i = 0; i < 125; i++) { const leaf = new THREE.Mesh(leafGeo, new THREE.MeshBasicMaterial({ color: [0xa94d29, 0xd28739, 0xb67332][i % 3], side: THREE.DoubleSide })); leaf.position.set((Math.random() - .5) * 13, .06 + Math.random() * .03, -42 + Math.random() * 58); leaf.rotation.set(-Math.PI / 2, Math.random() * 3, Math.random() * 3); leaf.scale.setScalar(.65 + Math.random() * .8); scene.add(leaf); }

const keeper = new THREE.Group();
const paintedKeeper = illustratedSprite('/art/keeper-illustrated.svg', 1.85, 2.65); paintedKeeper.position.set(0, 1.34, .35); keeper.add(paintedKeeper);
const keeperCoat = new THREE.Mesh(new THREE.ConeGeometry(.36, .95, 7), new THREE.MeshToonMaterial({ color: 0x8a3e38, gradientMap: toonGradient })); keeperCoat.position.y = .52; keeper.add(keeperCoat);
const keeperHead = new THREE.Mesh(new THREE.SphereGeometry(.23, 12, 9), new THREE.MeshToonMaterial({ color: 0xf0c0a0, gradientMap: toonGradient })); keeperHead.position.y = 1.16; keeper.add(keeperHead);
const keeperCap = new THREE.Mesh(new THREE.ConeGeometry(.3, .18, 7), new THREE.MeshToonMaterial({ color: 0x3d5d78, gradientMap: toonGradient })); keeperCap.position.y = 1.38; keeperCap.rotation.z = -.15; keeper.add(keeperCap);
const keeperGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: 0xffce71, transparent: true, opacity: .42, depthWrite: false, blending: THREE.AdditiveBlending })); keeperGlow.position.set(0, .74, .28); keeperGlow.scale.set(1.4, 1.4, 1); keeper.add(keeperGlow);
keeper.position.set(0, 0, 18); scene.add(keeper); outlineObjects.push(keeper);

const travelers = [];
const monsters = [];
const pickupColors = { yellow: 0xffd85c, blue: 0x69d4ff, purple: 0xc989ff };
const lanternTypes = {
  yellow: { label: 'жёлтый', color: 0xffc55e, radius: 6.1, damage: 18 },
  blue: { label: 'синий', color: 0x6acfff, radius: 8.3, damage: 5 },
  purple: { label: 'фиолетовый', color: 0xd28cff, radius: 6.7, damage: 28 },
};
const waveState = { number: 0, remaining: 0, spawnAt: 0, nextWaveAt: 4, cleared: 0 };

function makeTraveler(index) {
  const group = new THREE.Group();
  const coat = new THREE.Mesh(new THREE.ConeGeometry(.24, .72, 6), new THREE.MeshToonMaterial({ color: [0xf0a36a, 0x90c6d8, 0xd9b4eb][index % 3], gradientMap: toonGradient }));
  coat.position.y = .42; group.add(coat);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 8), new THREE.MeshToonMaterial({ color: 0xf1c2a3, gradientMap: toonGradient }));
  head.position.y = .86; group.add(head);
  const meter = makeMeterSprite('#ff8b75'); meter.sprite.position.y = 1.3; group.add(meter.sprite);
  group.position.set((index - 2.5) * .28, 0, 15.5 + index * .35);
  scene.add(group); outlineObjects.push(group);
  travelers.push({ group, meter, hp: 100, speed: 1.05 + Math.random() * .15, saved: false, attackedAt: 0, offset: (index - 2.5) * .32 });
}

function spawnMonster(kind) {
  const group = new THREE.Group();
  const styles = {
    wolf: { color: 0x171329, hp: 42, speed: 2.25, scale: .72, score: 35 },
    brute: { color: 0x251526, hp: 135, speed: .75, scale: 1.2, score: 90 },
    moth: { color: 0x302044, hp: 30, speed: 2.65, scale: .58, score: 55 },
  };
  const style = styles[kind];
  const body = new THREE.Mesh(kind === 'moth' ? new THREE.OctahedronGeometry(.4, 1) : new THREE.DodecahedronGeometry(.43, 1), new THREE.MeshToonMaterial({ color: style.color, gradientMap: toonGradient, flatShading: true }));
  body.position.y = kind === 'moth' ? 1.45 : .48; group.add(body);
  const eyes = new THREE.Mesh(new THREE.SphereGeometry(.07, 7, 6), new THREE.MeshBasicMaterial({ color: 0xff5f75 }));
  eyes.position.set(0, kind === 'moth' ? 1.48 : .52, .37); group.add(eyes);
  if (kind === 'moth') { const wingMat = new THREE.MeshBasicMaterial({ color: 0x59417e, transparent: true, opacity: .65, side: THREE.DoubleSide }); for (const side of [-1, 1]) { const wing = new THREE.Mesh(new THREE.CircleGeometry(.34, 8), wingMat); wing.position.set(side * .34, 1.45, 0); group.add(wing); } }
  const side = Math.random() < .5 ? -1 : 1;
  group.position.set(side * (7.5 + Math.random() * 3), kind === 'moth' ? 0 : 0, -3 - Math.random() * 31);
  group.scale.setScalar(style.scale); scene.add(group); outlineObjects.push(group);
  monsters.push({ group, kind, hp: style.hp, maxHp: style.hp, speed: style.speed, score: style.score, slow: 0, hitAt: 0, age: 0 });
}

function beginWave() {
  waveState.number++;
  waveState.remaining = 5 + waveState.number * 3;
  waveState.spawnAt = clock.elapsedTime;
  showToast(`Волна ${waveState.number}: тени выходят из леса`);
  sound(156, .35, 'sawtooth', .035);
}

function addPickup(type, x, z) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(.095, 9, 8), new THREE.MeshBasicMaterial({ color: pickupColors[type] }));
  mesh.position.set(x, .8 + Math.random() * 1.6, z);
  mesh.userData = { type, baseY: mesh.position.y, phase: Math.random() * 6, collected: false };
  fireflies.push(mesh); scene.add(mesh);
}

for (let i = 0; i < 6; i++) makeTraveler(i);
for (let i = 0; i < 30; i++) addPickup(i % 8 === 0 ? 'purple' : i % 3 === 0 ? 'blue' : 'yellow', (Math.random() - .5) * 13, -38 + Math.random() * 55);

function showToast(text) { const toast = $('toast'); toast.textContent = text; toast.style.opacity = '1'; clearTimeout(showToast.timer); showToast.timer = setTimeout(() => { toast.style.opacity = '0'; }, 1500); }
function legacyUpdateHUD() { $('score').textContent = String(player.score).padStart(4, '0'); }
function lightLantern(item) { item.lit = true; item.light.intensity = 5; item.bulb.material.color.set(0xffd17b); item.filament.material.color.set(0xfff0b4); item.glow.material.opacity = .92; item.ring.material.color.set(0xffb24f); item.ring.material.opacity = .95; player.fireflyCount -= 3; player.lit++; const now = clock.elapsedTime; const elapsedMs = Math.round((now - player.lastLightAt) * 1000); player.combo = gameCore ? gameCore.next_combo(player.combo, elapsedMs) : now - player.lastLightAt < 18 ? player.combo + 1 : 1; player.lastLightAt = now; const multiplier = 1 + (player.combo - 1) * .25; const points = gameCore ? gameCore.score_for_lantern(player.lit, player.combo) : Math.round((100 + player.lit * 25) * multiplier); player.score += points; sound(392, .25, 'sine', .04); sound(523, .4, 'sine', .04, .1); sound(659, .5, 'sine', .03, .2); showToast(player.combo > 1 ? `Комбо x${player.combo}  +${points}` : `Фонарь зажжён  +${points}`); updateHUD(); if (player.lit === lanterns.length) finish(); }
function legacyCollectFireflies() {}
function nearestLantern() { let best = null; let distance = 999; for (const item of lanterns) { const d = item.group.position.distanceTo(camera.position); if (!item.lit && d < distance) { best = item; distance = d; } } return { item: best, distance }; }
function legacyInteract() {}
function legacyStart() {}
function legacyFinish() {}
function reset() { location.reload(); }

window.addEventListener('keydown', e => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); keys[e.code] = true; if (e.code === 'KeyE') interact(); if (e.code === 'Space') useFlash(); if (e.code === 'Digit1') player.selectedType = 'yellow'; if (e.code === 'Digit2') player.selectedType = 'blue'; if (e.code === 'Digit3') player.selectedType = 'purple'; if (e.code === 'KeyR' && player.ended) reset(); });
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('mousemove', e => { if (!player.active || document.pointerLockElement !== renderer.domElement) return; player.yaw += e.movementX * .0022; player.pitch = THREE.MathUtils.clamp(player.pitch - e.movementY * .0018, -1.25, 1.25); });
renderer.domElement.addEventListener('click', () => { if (player.active) renderer.domElement.requestPointerLock?.(); });
$('start-button').addEventListener('click', start); $('restart-button').addEventListener('click', reset);
if (location.hash === '#demo') {
  player.active = true;
  const startScreen = $('start-screen');
  startScreen.classList.add('hidden');
  startScreen.style.display = 'none';
}

function movePlayer(dt) { const direction = new THREE.Vector3(Number(keys.KeyD || keys.ArrowRight) - Number(keys.KeyA || keys.ArrowLeft), 0, Number(keys.KeyW || keys.ArrowUp) - Number(keys.KeyS || keys.ArrowDown)); if (!direction.lengthSq()) return; direction.normalize(); const forward = new THREE.Vector3(Math.sin(player.yaw), 0, -Math.cos(player.yaw)); const right = new THREE.Vector3(-forward.z, 0, forward.x); const sprinting = keys.ShiftLeft || keys.ShiftRight; const delta = forward.multiplyScalar(direction.z).add(right.multiplyScalar(direction.x)).multiplyScalar((sprinting ? 10 : player.speed) * dt); keeper.position.add(delta); keeper.position.x = THREE.MathUtils.clamp(keeper.position.x, -5.3, 5.3); keeper.position.z = THREE.MathUtils.clamp(keeper.position.z, -42, 19); keeper.rotation.y = player.yaw; }
function legacyTick() {}
outlinePass.selectedObjects = outlineObjects;
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); outlinePass.setSize(innerWidth, innerHeight); });
function updateHUD() {
  $('score').textContent = String(player.score).padStart(4, '0');
  $('wave').textContent = String(Math.max(1, waveState.number)).padStart(2, '0');
  $('time').textContent = `${String(Math.floor(Math.max(0, player.time) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, player.time) % 60)).padStart(2, '0')}`;
  for (const type of Object.keys(player.inventory)) $(`fly-${type}`).textContent = player.inventory[type];
  document.querySelectorAll('.fly-slot').forEach((slot) => slot.classList.toggle('selected', slot.dataset.type === player.selectedType));
  const alive = travelers.filter((traveler) => !traveler.saved && traveler.hp > 0).length;
  $('caravan-count').textContent = `Путники ${alive} / ${travelers.length}`;
  $('caravan-bar').style.width = `${Math.max(0, alive / travelers.length * 100)}%`;
  const activeLanterns = lanterns.filter((lantern) => lantern.lit).length;
  $('lantern-count').textContent = `${activeLanterns} / ${lanterns.length} фонарей активно`;
  $('progress-bar').style.width = `${activeLanterns / lanterns.length * 100}%`;
  const flashReady = clock.elapsedTime - player.flashAt >= 10;
  $('flash-ready').textContent = flashReady ? 'ГОТОВА' : `${Math.ceil(10 - (clock.elapsedTime - player.flashAt))} СЕК`;
}

function setLanternType(item, type) {
  item.type = type;
  item.lit = true;
  item.charge = Math.min(100, item.charge + 42);
  const config = lanternTypes[type];
  item.light.color.set(config.color);
  item.meter.color = `#${config.color.toString(16).padStart(6, '0')}`;
  item.meter.sprite.visible = true;
  item.bulb.material.color.set(config.color);
  item.filament.material.color.set(0xfff1b2);
  item.glow.material.color.set(config.color);
  item.glow.material.opacity = .9;
  item.ring.material.color.set(config.color);
  item.ring.material.opacity = 1;
  player.inventory[type]--;
  player.score += 25;
  player.shake = .08;
  sound(type === 'blue' ? 330 : type === 'purple' ? 640 : 480, .22, 'sine', .045);
  showToast(`${config.label[0].toUpperCase() + config.label.slice(1)}й свет заряжен`);
}

function nearestLanternToPlayer() {
  return lanterns.reduce((nearest, item) => {
    const distance = item.group.position.distanceTo(keeper.position);
    return !nearest || distance < nearest.distance ? { item, distance } : nearest;
  }, null);
}

function collectFireflies() {
  for (const fly of fireflies) {
    if (fly.userData.collected) continue;
    fly.position.y = fly.userData.baseY + Math.sin(clock.elapsedTime * 1.7 + fly.userData.phase) * .18;
    fly.rotation.y += .02;
    if (fly.position.distanceTo(keeper.position) < 1.45) {
      fly.userData.collected = true;
      fly.visible = false;
      player.inventory[fly.userData.type]++;
      player.score += fly.userData.type === 'purple' ? 30 : 10;
      showToast(`Светлячок: ${lanternTypes[fly.userData.type].label}`);
      sound(fly.userData.type === 'blue' ? 560 : fly.userData.type === 'purple' ? 820 : 740, .15, 'sine', .035);
    }
  }
}

function damageMonster(monster, damage) {
  monster.hp -= damage;
  monster.group.scale.y = monster.kind === 'moth' ? .9 : 1.1;
  if (monster.hp <= 0) {
    player.score += monster.score;
    player.shake = Math.max(player.shake, .1);
    showToast(`Тень рассеяна  +${monster.score}`);
    scene.remove(monster.group);
    monsters.splice(monsters.indexOf(monster), 1);
    sound(120, .18, 'sawtooth', .035);
  }
}

function updateLanterns(dt) {
  for (const lantern of lanterns) {
    if (!lantern.lit) continue;
    lantern.charge -= dt * (lantern.type === 'blue' ? .62 : .82);
    if (lantern.charge <= 0) {
      lantern.charge = 0; lantern.lit = false; lantern.type = null; lantern.meter.sprite.visible = false; lantern.light.color.set(0xffbc62); lantern.light.intensity = 0; lantern.glow.material.opacity = .05; showToast('Фонарь погас');
      continue;
    }
    const config = lanternTypes[lantern.type];
    lantern.light.intensity = (lantern.charge / 100) * (lantern.type === 'blue' ? 4 : 5) + Math.sin(clock.elapsedTime * 5 + lantern.pulse) * .18;
    lantern.glow.material.opacity = .48 + lantern.charge / 180;
    lantern.meter.sprite.visible = true; updateMeter(lantern.meter, lantern.charge / 100);
    for (const monster of [...monsters]) {
      const distance = monster.group.position.distanceTo(lantern.group.position);
      if (distance > config.radius) continue;
      monster.slow = lantern.type === 'blue' ? .5 : 0;
      if (lantern.type === 'purple') {
        if (clock.elapsedTime - lantern.attackAt > 3) { lantern.attackAt = clock.elapsedTime; damageMonster(monster, 38); player.shake = Math.max(player.shake, .14); }
      } else damageMonster(monster, config.damage * dt);
    }
  }
}

function updateTravelers(dt) {
  for (const traveler of travelers) {
    if (traveler.saved || traveler.hp <= 0) continue;
    let safe = false;
    for (const lantern of lanterns) if (lantern.lit && traveler.group.position.distanceTo(lantern.group.position) < lanternTypes[lantern.type].radius) safe = true;
    traveler.hp = Math.min(100, traveler.hp + (safe ? 7 : -1.2) * dt);
    updateMeter(traveler.meter, traveler.hp / 100);
    traveler.group.position.z -= traveler.speed * (safe ? 1.18 : .84) * dt;
    traveler.group.position.x = traveler.offset + Math.sin(clock.elapsedTime * 2 + traveler.offset) * .06;
    if (traveler.group.position.z < -39) { traveler.saved = true; player.score += 150; showToast('Путник добрался до дома  +150'); }
  }
  if (travelers.every((traveler) => traveler.saved)) finish(true);
  if (travelers.every((traveler) => traveler.hp <= 0)) finish(false);
}

function updateMonsters(dt) {
  for (const monster of [...monsters]) {
    monster.age += dt;
    let target = null;
    if (monster.kind === 'brute') target = lanterns.filter((lantern) => lantern.lit).sort((a, b) => a.group.position.distanceTo(monster.group.position) - b.group.position.distanceTo(monster.group.position))[0];
    if (!target) target = travelers.filter((traveler) => !traveler.saved && traveler.hp > 0).sort((a, b) => a.group.position.distanceTo(monster.group.position) - b.group.position.distanceTo(monster.group.position))[0];
    if (!target) continue;
    const targetPosition = target.group.position;
    const distance = monster.group.position.distanceTo(targetPosition);
    const speed = monster.speed * (monster.slow || 1);
    if (distance > 1.2) monster.group.position.lerp(targetPosition, Math.min(1, speed * dt / Math.max(distance, 1)));
    if (monster.kind === 'moth') monster.group.position.y = 1.45 + Math.sin(clock.elapsedTime * 4 + monster.age) * .3;
    if (distance < 1.5 && clock.elapsedTime - monster.hitAt > (monster.kind === 'brute' ? 1.8 : .8)) {
      monster.hitAt = clock.elapsedTime;
      if (target.charge !== undefined) { target.charge = Math.max(0, target.charge - 13); if (target.charge === 0) target.lit = false; }
      else target.hp -= monster.kind === 'brute' ? 17 : monster.kind === 'moth' ? 7 : 11;
      player.shake = Math.max(player.shake, .07);
      sound(90, .1, 'square', .025);
    }
  }
}

function updateWave() {
  if (waveState.number === 0) { if (clock.elapsedTime > 2) beginWave(); return; }
  if (waveState.remaining > 0 && clock.elapsedTime >= waveState.spawnAt) {
    const kind = waveState.number > 1 && waveState.remaining % 5 === 0 ? 'brute' : waveState.remaining % 3 === 0 ? 'moth' : 'wolf';
    spawnMonster(kind); waveState.remaining--; waveState.spawnAt = clock.elapsedTime + Math.max(.75, 2.4 - waveState.number * .2);
  } else if (waveState.remaining === 0 && monsters.length === 0 && clock.elapsedTime > waveState.nextWaveAt && waveState.number < 3) {
    waveState.nextWaveAt = clock.elapsedTime + 15; beginWave();
  }
}

function useFlash() {
  if (!player.active || clock.elapsedTime - player.flashAt < 10 || player.inventory.yellow + player.inventory.blue + player.inventory.purple < 2) return;
  player.inventory.yellow = Math.max(0, player.inventory.yellow - 1);
  player.inventory.blue = Math.max(0, player.inventory.blue - 1);
  player.flashAt = clock.elapsedTime; player.shake = .45;
  for (const monster of [...monsters]) { if (monster.group.position.distanceTo(keeper.position) < 8) { monster.group.position.z += 4; damageMonster(monster, 70); } }
  showToast('ВСПЫШКА! Тени отступают'); sound(880, .28, 'sine', .06); updateHUD();
}

function interact() {
  if (!player.active) return;
  const nearest = nearestLanternToPlayer();
  if (nearest && nearest.distance < 3.4 && player.inventory[player.selectedType] > 0) setLanternType(nearest.item, player.selectedType);
  updateHUD();
}

function start() { ensureAudio(); player.active = true; $('start-screen').classList.add('hidden'); renderer.domElement.focus(); renderer.domElement.requestPointerLock?.(); showToast('Защити первую группу путников'); sound(262, .2, 'sine', .025); }
function finish(success) { if (player.ended) return; player.active = false; player.ended = true; document.exitPointerLock?.(); const previousBest = Number(localStorage.getItem('lantern-keeper-best') || 0); const best = Math.max(previousBest, player.score); localStorage.setItem('lantern-keeper-best', String(best)); $('finish-eyebrow').textContent = success ? 'ТРОПА СПАСЕНА' : 'ТЕНИ ПРОРВАЛИСЬ'; $('finish-title').innerHTML = success ? 'Доброй ночи,<br /><em>хранитель.</em>' : 'Лес поглотил<br /><em>тропу.</em>'; $('finish-copy').textContent = success ? 'Все путники добрались до дома.' : 'Путники испугались и не смогли продолжить путь.'; $('final-score').textContent = String(player.score).padStart(4, '0'); $('best-score').textContent = player.score >= previousBest ? 'Новый рекорд' : `Рекорд: ${String(best).padStart(4, '0')}`; $('finish-screen').classList.add('visible'); }

function tick() {
  const dt = Math.min(clock.getDelta(), .05);
  if (player.active && !player.ended) { player.time -= dt; if (player.time <= 0) finish(false); movePlayer(dt); collectFireflies(); updateWave(); updateLanterns(dt); updateTravelers(dt); updateMonsters(dt); updateHUD(); }
  const forward = new THREE.Vector3(Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const cameraTarget = keeper.position.clone().add(forward.clone().multiplyScalar(4.5)).add(new THREE.Vector3(0, 1.05 + player.pitch * .8, 0));
  const cameraPosition = keeper.position.clone().sub(forward.clone().multiplyScalar(7.2)).add(new THREE.Vector3(0, 4.1, 0));
  camera.position.lerp(cameraPosition, .13);
  camera.lookAt(cameraTarget);
  player.shake = Math.max(0, player.shake - dt * 1.8);
  root.style.transform = player.shake > 0 ? `translate(${(Math.random() - .5) * player.shake * 18}px, ${(Math.random() - .5) * player.shake * 18}px)` : '';
  for (const lantern of lanterns) if (lantern.lit) lantern.ring.rotation.z += dt * 1.5;
  composer.render(); requestAnimationFrame(tick);
}

document.querySelectorAll('.fly-slot').forEach((slot) => slot.addEventListener('click', () => { player.selectedType = slot.dataset.type; updateHUD(); }));
updateHUD(); tick();
loadGameCore();
loadRuntimePalette();
