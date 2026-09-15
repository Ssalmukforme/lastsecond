import * as THREE from 'three';
import './style.css';
import { BLINK_COOLDOWN, BLINK_DISTANCE, PHASES, phaseAt, difficulty, formatTime, clampToArena, segmentDistanceSq, rankRecords, VIEWS, turnView, screenMovement } from './game.js';
import { createRanking } from './ranking.js';
import { RANKING_GAME, RANKING_BOARD } from './ranking-boards.js';

const ranking = createRanking(RANKING_GAME, { storagePrefix: 'last-second' });
// The dev self-test (?test=1) fakes deaths; those must never reach the shared leaderboard.
const TEST_MODE = import.meta.env.DEV && new URLSearchParams(location.search).has('test');

const $ = (id) => document.getElementById(id);
const canvas = $('world');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch {
  $('loading').innerHTML = '<p>3D 화면을 시작할 수 없습니다.<br>브라우저의 하드웨어 가속을 켜고 다시 접속해 주세요.</p>';
  throw new Error('WebGL unavailable');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#dce2cd');
scene.fog = new THREE.Fog('#dce2cd', 60, 170);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .1, 240);
scene.add(new THREE.HemisphereLight('#fffae5', '#647863', 2.8));
const sun = new THREE.DirectionalLight('#fff1d2', 3.2);
sun.position.set(-24, 42, 15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -32; sun.shadow.camera.right = 32;
sun.shadow.camera.top = 32; sun.shadow.camera.bottom = -32;
sun.shadow.normalBias = .035;
sun.shadow.bias = -.0001;
scene.add(sun);

const materials = {};
function mat(color, emissive = false) {
  if (!materials[color + emissive]) materials[color + emissive] = new THREE.MeshStandardMaterial({ color, roughness: .92, flatShading: true, ...(emissive ? { emissive: color, emissiveIntensity: .75 } : {}) });
  return materials[color + emissive];
}
function mesh(geometry, material, x = 0, y = 0, z = 0, parent = scene) {
  const m = new THREE.Mesh(geometry, typeof material === 'string' ? mat(material) : material);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}
function box(w, h, d, color, x, y, z, parent) { return mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z, parent); }
function cylinder(rt, rb, h, color, x = 0, y = 0, z = 0, n = 8, parent = scene) { return mesh(new THREE.CylinderGeometry(rt, rb, h, n), color, x, y, z, parent); }
function ring(radius, width, color, x = 0, y = .025, z = 0, parent = scene) {
  const m = mesh(new THREE.RingGeometry(radius - width, radius, 64), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: .8 }), x, y, z, parent);
  m.rotation.x = -Math.PI / 2; m.castShadow = false; return m;
}
let seed = 9321;
function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

// A single floating arena, built entirely from low-poly geometry.
const island = new THREE.Group(); scene.add(island);
cylinder(19.9, 17, 1.25, '#77826a', 0, -.64, 0, 12, island);
cylinder(17.1, 11.2, 5, '#73806b', 0, -3.7, 0, 10, island);
cylinder(11.5, 2.8, 6, '#667560', 0, -8.8, 0, 7, island);
cylinder(19.5, 19.5, .25, '#b4ba9b', 0, -.12, 0, 12, island);
cylinder(18.9, 18.9, .08, '#d1ccb0', 0, .02, 0, 12, island);
ring(18.2, .14, '#e8e6c8');
ring(11.7, .07, '#b1b597');
ring(4.0, .06, '#acb293');
const seal = cylinder(2.7, 2.7, .025, '#c3c4a6', 0, .073, 0, 6);
ring(2.85, .08, '#e0ddbb');
for (let i = 0; i < 12; i++) {
  const a = i / 12 * Math.PI * 2;
  const joint = box(.045, .013, 14.5, '#b6b79a', Math.sin(a) * 10.6, .071, Math.cos(a) * 10.6);
  joint.rotation.y = a;
  const tile = box(1.5, .028, .25, '#e9e2bf', Math.sin(a) * 17.6, .075, Math.cos(a) * 17.6);
  tile.rotation.y = a;
}
for (let i = 0; i < 48; i++) {
  const a = random() * Math.PI * 2, r = 4 + random() * 13;
  const p = box(.3 + random() * 1.2, .015, .15 + random() * .5, i % 2 ? '#c7c4a7' : '#d8d1b2', Math.sin(a) * r, .073, Math.cos(a) * r);
  p.rotation.y = a + random();
}

const turrets = [];
for (let i = 0; i < 8; i++) {
  const a = i / 8 * Math.PI * 2;
  const x = Math.sin(a) * 20.3, z = Math.cos(a) * 20.3;
  const p = new THREE.Group(); p.position.set(x, 0, z); scene.add(p);
  cylinder(1.4, 1.8, .5, '#8b9679', 0, .1, 0, 4, p);
  box(1.7, 3.4, 1.7, '#a7b094', 0, 1.9, 0, p);
  box(1.98, .38, 1.98, '#c4c8aa', 0, 3.7, 0, p);
  const head = mesh(new THREE.OctahedronGeometry(.57), mat('#ef7846', true), 0, 4.35, 0, p);
  const stripe = box(.1, 1.6, 1.73, '#717f64', 0, 2.1, 0, p);
  const mark = ring(1.6, .1, '#ef7846', x, .085, z);
  turrets.push({ x, z, head, mark, pulse: 0 });
}

// Ruined gateways and broken columns stay outside the playable boundary.
for (const [x, z, rot] of [[-8, -22, -.2], [9, -23, .23]]) {
  const arch = new THREE.Group(); arch.position.set(x, -1.5, z); arch.rotation.y = rot; scene.add(arch);
  box(2, 9, 2, '#8f9f80', -2.8, 4, 0, arch);
  box(2, 7.4, 2, '#a3ae8e', 2.8, 3.2, 0, arch);
  box(8, 1.3, 2.4, '#bac0a1', 0, 8.3, 0, arch);
  box(2.6, .6, 2.5, '#c9caac', -2.8, 8.9, 0, arch);
  box(.15, 3, 2.02, '#748767', -2.5, 5, 0, arch);
}
for (let i = 0; i < 35; i++) {
  const a = random() * Math.PI * 2, r = 19.2 + random() * 4;
  const x = Math.sin(a) * r, z = Math.cos(a) * r;
  if (z > 7 && x < 7) continue;
  const rock = mesh(new THREE.DodecahedronGeometry(.45 + random() * 1.2, 0), i % 2 ? '#89977b' : '#a1ab8a', x, -.1, z);
  rock.scale.set(1.4, .7 + random(), 1); rock.rotation.set(random(), random(), random());
  if (i % 3 === 0) {
    for (let j = 0; j < 3; j++) {
      const plant = mesh(new THREE.ConeGeometry(.24, 1.1 + random(), 3), '#6b8060', x + j * .2, .45, z);
      plant.rotation.z = (random() - .5) * .5;
    }
  }
}
// Distant islands add depth without obscuring incoming attacks.
for (let i = 0; i < 17; i++) {
  const a = random() * Math.PI * 2, r = 65 + random() * 65, s = 3 + random() * 9;
  const x = Math.sin(a) * r, z = Math.cos(a) * r, y = -17 - random() * 20;
  cylinder(s, s * .12, s * 1.5, '#a9b59a', x, y, z, 5);
  cylinder(s, s, .8, '#bac3a6', x, y + s * .75, z, 5);
  if (i % 3 === 0) box(1.6, 7, 1.6, '#a5b496', x, y + s * .75 + 3.5, z);
}
const dustGeo = new THREE.BufferGeometry();
const dustPositions = new Float32Array(150 * 3);
for (let i = 0; i < dustPositions.length; i += 3) { dustPositions[i] = (random() - .5) * 100; dustPositions[i + 1] = random() * 25 - 6; dustPositions[i + 2] = (random() - .5) * 100; }
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#f9f1c8', size: .1, transparent: true, opacity: .75 })); scene.add(dust);

const player = new THREE.Group(); scene.add(player);
const body = new THREE.Group(); player.add(body);
const torso = cylinder(.37, .48, .68, '#b65c3c', 0, .95, 0, 5, body);
box(.65, .22, .46, '#dfd4b2', 0, 1.3, 0, body);
const head = box(.55, .53, .52, '#eae3c7', 0, 1.67, 0, body);
box(.46, .16, .035, '#293f3b', 0, 1.7, -.278, body);
box(.25, .08, .045, mat('#f5864d', true), .07, 1.68, -.302, body);
const cape = mesh(new THREE.ConeGeometry(.49, .95, 4, 1, true), '#813f32', 0, .95, .28, body); cape.rotation.x = -.2;
const legs = [box(.23, .55, .25, '#354c43', -.21, .3, 0, body), box(.23, .55, .25, '#354c43', .21, .3, 0, body)];
const arms = [box(.2, .56, .23, '#ded5b5', -.47, 1.03, 0, body), box(.2, .56, .23, '#ded5b5', .47, 1.03, 0, body)];
const playerRing = ring(.72, .09, '#f8f2d1');
const playerShadow = mesh(new THREE.CircleGeometry(.6, 24), new THREE.MeshBasicMaterial({ color: '#47583d', opacity: .23, transparent: true, depthWrite: false }), 0, .09, 0); playerShadow.rotation.x = -Math.PI / 2; playerShadow.castShadow = false;

const bulletGeometries = { straight: new THREE.IcosahedronGeometry(.25, 0), fan: new THREE.OctahedronGeometry(.28), meteor: new THREE.IcosahedronGeometry(.8, 0) };
const bulletColors = { straight: '#f77b38', fan: '#e9a639', homing: '#aa62c5', meteor: '#f45b35' };
// A short, soft light trace instead of a solid cone attached to the bullet.
const traceCanvas = document.createElement('canvas'); traceCanvas.width = 32; traceCanvas.height = 128;
const traceContext = traceCanvas.getContext('2d');
const tracePixels = traceContext.createImageData(32, 128);
for (let y = 0; y < 128; y++) {
  const along = 1 - y / 127;
  for (let x = 0; x < 32; x++) {
    const across = (x / 31 - .5) * 2;
    const alpha = Math.exp(-3 * (across / (.2 + .6 * along)) ** 2) * along ** 1.2 * Math.sin(Math.PI * along) ** .45;
    const pixel = (y * 32 + x) * 4;
    tracePixels.data[pixel] = 255; tracePixels.data[pixel + 1] = 255; tracePixels.data[pixel + 2] = 255; tracePixels.data[pixel + 3] = Math.round(alpha * 230);
  }
}
traceContext.putImageData(tracePixels, 0, 0);
const traceTexture = new THREE.CanvasTexture(traceCanvas);
const traceGeometry = new THREE.PlaneGeometry(.3, .82);
const traceMaterials = Object.fromEntries(['straight', 'fan'].map(type => [type, new THREE.MeshBasicMaterial({
  map: traceTexture, color: bulletColors[type], transparent: true, opacity: .7,
  side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
})]));
const finOutline = new THREE.Shape();
finOutline.moveTo(.14, -.04); finOutline.lineTo(.39, -.27);
finOutline.lineTo(.37, -.43); finOutline.lineTo(.14, -.32); finOutline.closePath();
const missileGeometry = {
  hull: new THREE.CylinderGeometry(.185, .16, .62, 8),
  nose: new THREE.ConeGeometry(.185, .3, 8),
  band: new THREE.CylinderGeometry(.19, .19, .085, 8),
  nozzle: new THREE.CylinderGeometry(.145, .11, .14, 8),
  fin: new THREE.ExtrudeGeometry(finOutline, { depth: .045, bevelEnabled: false }),
  flame: new THREE.ConeGeometry(.125, .65, 6),
  flameCore: new THREE.ConeGeometry(.067, .34, 5),
};
missileGeometry.fin.translate(0, 0, -.0225);
const missileGlow = new THREE.MeshBasicMaterial({ color: '#c693f2', transparent: true, opacity: .65, depthWrite: false });
const missileCoreGlow = new THREE.MeshBasicMaterial({ color: '#fff0dc' });
function buildMissile(group) {
  // Local +Y is the nose; the whole silhouette follows its flight direction.
  mesh(missileGeometry.hull, '#e0dac2', 0, 0, 0, group);
  mesh(missileGeometry.nose, '#d37446', 0, .46, 0, group);
  mesh(missileGeometry.band, mat('#a46ab8', true), 0, .2, 0, group);
  mesh(missileGeometry.nozzle, '#35483f', 0, -.375, 0, group);
  for (let i = 0; i < 4; i++) {
    const fin = mesh(missileGeometry.fin, '#526252', 0, 0, 0, group);
    fin.rotation.y = i * Math.PI / 2;
  }
  const exhaust = new THREE.Group(); exhaust.position.y = -.45; group.add(exhaust);
  const flame = mesh(missileGeometry.flame, missileGlow, 0, -.325, 0, exhaust);
  const core = mesh(missileGeometry.flameCore, missileCoreGlow, 0, -.17, 0, exhaust);
  flame.rotation.z = Math.PI; core.rotation.z = Math.PI;
  flame.castShadow = false; core.castShadow = false;
  group.userData.exhaust = exhaust;
}
const particles = [], bullets = [], hazards = [], telegraphs = [];
const particleGeometry = new THREE.TetrahedronGeometry(.13);
const upVector = new THREE.Vector3(0, 1, 0);
const scratch = new THREE.Vector3();
let mode = 'menu', survival = 0, spawnClock = 2, eventClock = 5, phase = 0;
let view = 0, blinkCooldown = 0, invincible = 0, blinks = 0, endReason = '';
let verticalVelocity = 0, grounded = true;
const VIEW_TURN_DURATION = .32;
let cameraYaw = 0, turnFrom = 0, turnTo = 0, turnElapsed = VIEW_TURN_DURATION;
const queuedTurns = [];
const cameraAnchor = new THREE.Vector3();
let lastMove = new THREE.Vector3(0, 0, -1), walking = 0, announcementTime = 0, shake = 0;
let hitPlayerPrevious = new THREE.Vector3();
let records = [];
try { records = JSON.parse(localStorage.getItem('last-second-records') || '[]').filter(r => r && typeof r.name === 'string' && Number.isFinite(r.time) && r.time >= 0).sort((a, b) => b.time - a.time).slice(0, 10); } catch { records = []; }
try { $('nickname').value = localStorage.getItem('last-second-name') || 'RUNNER'; } catch {}
const keys = new Set();
function movementInput() {
  const x = Number(keys.has('KeyD')) - Number(keys.has('KeyA')), z = Number(keys.has('KeyS')) - Number(keys.has('KeyW'));
  const move = turnElapsed >= VIEW_TURN_DURATION ? screenMovement(x, z, view) : {
    x: Math.cos(cameraYaw) * x - Math.sin(cameraYaw) * z,
    z: Math.sin(cameraYaw) * x + Math.cos(cameraYaw) * z,
  };
  return new THREE.Vector3(move.x, 0, move.z);
}
function beginViewTurn(step) {
  view = turnView(view, step);
  turnFrom = cameraYaw;
  turnTo = turnFrom + step * Math.PI / 2;
  turnElapsed = 0;
  $('view-direction').textContent = VIEWS[view].label;
}
function updateFollowCamera(dt) {
  let remaining = dt;
  while (turnElapsed < VIEW_TURN_DURATION) {
    const advance = Math.min(remaining, VIEW_TURN_DURATION - turnElapsed);
    turnElapsed = Math.min(VIEW_TURN_DURATION, turnElapsed + advance); remaining -= advance;
    const t = turnElapsed / VIEW_TURN_DURATION;
    cameraYaw = turnFrom + (turnTo - turnFrom) * (t * t * (3 - 2 * t));
    if (turnElapsed < VIEW_TURN_DURATION) break;
    cameraYaw = turnTo;
    if (!queuedTurns.length) break;
    beginViewTurn(queuedTurns.shift());
  }
  cameraAnchor.lerp(new THREE.Vector3(player.position.x * .72, 0, player.position.z * .72), 1 - Math.exp(-dt * 4));
  const forward = turnElapsed >= VIEW_TURN_DURATION ? VIEWS[view] : { x: Math.sin(cameraYaw), z: -Math.cos(cameraYaw) };
  camera.position.set(cameraAnchor.x - forward.x * 21, 16.5, cameraAnchor.z - forward.z * 21);
  camera.lookAt(cameraAnchor.x + forward.x * 3.5, .2, cameraAnchor.z + forward.z * 3.5);
}
function rotateView(step) {
  if (mode !== 'playing') return;
  if (turnElapsed < VIEW_TURN_DURATION) queuedTurns.push(step);
  else beginViewTurn(step);
}
const edgeWarnings = Array.from({ length: 8 }, () => {
  const marker = document.createElement('span'); marker.className = 'edge-warning'; marker.textContent = '➤'; marker.hidden = true; $('edge-warnings').append(marker); return marker;
});
function updateEdgeWarnings() {
  edgeWarnings.forEach(marker => { marker.hidden = true; });
  if (mode !== 'playing') return;
  let count = 0;
  for (const b of bullets) {
    if (count >= edgeWarnings.length) break;
    const dx = b.mesh.position.x - player.position.x, dz = b.mesh.position.z - player.position.z;
    if (Math.hypot(dx, dz) > 19 || dx * b.velocity.x + dz * b.velocity.z > 0) continue;
    scratch.copy(b.mesh.position).project(camera);
    if (scratch.z < 1 && Math.abs(scratch.x) < .92 && Math.abs(scratch.y) < .8) continue;
    let x = scratch.x, y = -scratch.y;
    if (scratch.z > 1) { x = -x; y = -y; }
    const angle = Math.atan2(y * innerHeight, x * innerWidth);
    const scale = Math.min((innerWidth / 2 - 35) / Math.max(1, Math.abs(x * innerWidth / 2)), (innerHeight / 2 - 110) / Math.max(1, Math.abs(y * innerHeight / 2)));
    const marker = edgeWarnings[count++]; marker.hidden = false;
    marker.style.left = `${innerWidth / 2 + x * innerWidth / 2 * scale}px`;
    marker.style.top = `${innerHeight / 2 + y * innerHeight / 2 * scale}px`;
    marker.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
    marker.style.color = bulletColors[b.type];
  }
}
let soundEnabled = true, audioContext;
function tone(freq, duration = .1, type = 'sine', volume = .035) {
  if (!soundEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const o = audioContext.createOscillator(), g = audioContext.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, audioContext.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(25, freq * .55), audioContext.currentTime + duration);
    g.gain.setValueAtTime(volume, audioContext.currentTime); g.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    o.connect(g); g.connect(audioContext.destination); o.start(); o.stop(audioContext.currentTime + duration);
  } catch {}
}
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toast.timeout); toast.timeout = setTimeout(() => $('toast').classList.remove('visible'), 2600); }
function announce(message, seconds = 2.8) { $('announcement').textContent = message; $('announcement').classList.add('show'); announcementTime = seconds; }
function refreshBest() { const best = records.length ? formatTime(records[0].time) : '--:--.---'; $('menu-best').textContent = best; $('best-hud').textContent = `BEST ${best}`; }
refreshBest();

function burst(position, color, count = 16) {
  for (let i = 0; i < count; i++) {
    const m = mesh(particleGeometry, mat(color, true), position.x, position.y + .7, position.z);
    m.castShadow = false;
    particles.push({ mesh: m, velocity: new THREE.Vector3((Math.random() - .5) * 8, Math.random() * 6, (Math.random() - .5) * 8), life: .4 + Math.random() * .4 });
  }
}
function removeMesh(m, disposeMaterial = false) { scene.remove(m); if (disposeMaterial) { m.geometry.dispose(); m.material.dispose(); } }
function clearCombat() {
  for (const b of bullets) scene.remove(b.mesh);
  for (const h of hazards) { removeMesh(h.mesh, true); if (h.marker) removeMesh(h.marker, true); if (h.rock) scene.remove(h.rock); }
  for (const t of telegraphs) if (t.marker) removeMesh(t.marker, true);
  for (const p of particles) scene.remove(p.mesh);
  bullets.length = 0; hazards.length = 0; telegraphs.length = 0; particles.length = 0;
}
function panels(which) {
  $('overlay').hidden = !which;
  for (const name of ['pause', 'result', 'records']) $(`${name}-panel`).hidden = which !== name;
}
function startGame() {
  clearCombat(); keys.clear(); mode = 'playing'; survival = 0; spawnClock = 2.2; eventClock = 5; phase = 0;
  view = 0; blinkCooldown = 0; invincible = 1.5; blinks = 0; shake = 0;
  verticalVelocity = 0; grounded = true;
  cameraYaw = 0; turnFrom = 0; turnTo = 0; turnElapsed = VIEW_TURN_DURATION; queuedTurns.length = 0;
  player.position.set(0, 0, 5); hitPlayerPrevious.copy(player.position); body.rotation.set(0, 0, 0); body.visible = true;
  lastMove.set(0, 0, -1); walking = 0;
  $('menu').hidden = true; $('menu-footer').hidden = true; $('hud').hidden = false;
  document.body.classList.add('playing'); panels(null);
  try { localStorage.setItem('last-second-name', $('nickname').value.trim() || 'RUNNER'); } catch {}
  cameraAnchor.set(0, 0, player.position.z * .72); updateFollowCamera(0);
  $('view-direction').textContent = VIEWS[view].label;
  announce('SPACE 점프 · ← → 시점 전환 · F 점멸', 3);
  tone(660, .18); updateHud();
}
function home() {
  clearCombat(); mode = 'menu'; keys.clear(); panels(null);
  $('menu').hidden = false; $('menu-footer').hidden = false; $('hud').hidden = true;
  document.body.classList.remove('playing'); player.position.set(3, 0, 5); body.visible = true; body.rotation.set(0, -.5, 0); refreshBest(); refreshWorldBest();
}
function pause() { if (mode !== 'playing') return; mode = 'paused'; keys.clear(); panels('pause'); }
function resume() { if (mode !== 'paused') return; mode = 'playing'; keys.clear(); panels(null); }
function die(reason) {
  if (mode !== 'playing') return;
  mode = 'over'; keys.clear(); endReason = reason;
  burst(player.position, '#ee6439', 40); body.visible = false; shake = .5; tone(100, .7, 'sawtooth', .08);
  const oldBest = records[0]?.time || 0;
  const entry = { name: ($('nickname').value.trim() || 'RUNNER').slice(0, 12), time: survival, date: new Date().toISOString() };
  const rank = records.filter(r => r.time >= survival).length + 1;
  records = rankRecords(records, entry);
  try { localStorage.setItem('last-second-records', JSON.stringify(records)); } catch { toast('저장 공간을 사용할 수 없어 이번 기록은 임시 보관됩니다.'); }
  $('result-time').textContent = formatTime(survival);
  $('result-eyebrow').textContent = survival > oldBest ? 'NEW PERSONAL BEST ↗' : 'EVERY SECOND COUNTS';
  $('result-description').textContent = `${reason}에 피격되었습니다. 다음에는 1초 더.`;
  $('result-phase').textContent = String(phase + 1).padStart(2, '0'); $('result-blinks').textContent = blinks;
  refreshBest();
  submitGlobal(entry.name, survival, rank <= 10 ? `로컬 #${rank}` : '로컬 10위 밖');
  setTimeout(() => { if (mode === 'over') panels('result'); }, 650);
}
let submitToken = 0;
async function submitGlobal(name, time, localRank) {
  const token = ++submitToken, status = $('result-global');
  $('result-rank').textContent = '…'; status.className = 'result-global'; status.textContent = '전체 랭킹에 등록하는 중…';
  if (TEST_MODE) { $('result-rank').textContent = localRank; status.textContent = '개발 검증 모드에서는 전체 랭킹에 등록하지 않습니다.'; return; }
  try {
    const { improved, standing } = await ranking.submit(RANKING_BOARD, { name, value: time * 1000, meta: { phase: phase + 1, blinks } });
    if (token !== submitToken) return;
    $('result-rank').textContent = `#${standing.rank}`;
    status.classList.add('ok'); status.textContent = `전체 ${standing.rank}위 / ${standing.total}명${improved ? ' · 내 최고 기록 갱신' : ''}`;
    refreshWorldBest(true);
  } catch (error) {
    if (token !== submitToken) return;
    $('result-rank').textContent = localRank;
    status.classList.add('error'); status.textContent = `${ranking.describeError(error)} 기록은 이 브라우저에 저장했어요.`;
  }
}
let worldToken = 0;
async function refreshWorldBest(fresh = false) {
  const token = ++worldToken;
  try {
    const { entries } = await ranking.board(RANKING_BOARD, { fresh, limit: 1 });
    if (token === worldToken) $('menu-world').textContent = entries[0] ? `${formatTime(entries[0].value / 1000)} · ${entries[0].name}` : '아직 기록 없음';
  } catch { if (token === worldToken) $('menu-world').textContent = '전체 랭킹 연결 안 됨'; }
}
refreshWorldBest();
function recordRow(position, name, time, you = false) {
  const li = document.createElement('li'), label = document.createElement('span'), rank = document.createElement('b'), strong = document.createElement('strong');
  rank.textContent = String(position).padStart(2, '0'); label.append(rank, document.createTextNode(name));
  if (you) { li.className = 'you'; label.append(Object.assign(document.createElement('em'), { textContent: 'YOU' })); }
  strong.textContent = formatTime(time); li.append(label, strong); return li;
}
function emptyRecords(list, text) { const p = document.createElement('p'); p.className = 'empty-records'; p.textContent = text; list.append(p); }
let recordsTab = 'global', recordsToken = 0;
async function showRecords(tab = recordsTab) {
  recordsTab = tab; panels('records');
  const list = $('records-list'), token = ++recordsToken; list.replaceChildren(); $('records-standing').textContent = '';
  document.querySelectorAll('[data-records-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.recordsTab === tab)));
  $('records-caption').textContent = tab === 'global' ? '모든 플레이어의 최고 생존 기록' : '이 브라우저에 저장된 상위 10개의 기록';
  if (tab === 'local') {
    if (!records.length) emptyRecords(list, '아직 기록이 없습니다. 첫 번째 생존자가 되어보세요.');
    records.forEach((r, i) => list.append(recordRow(i + 1, r.name, r.time)));
    return;
  }
  emptyRecords(list, '전체 랭킹을 불러오는 중…');
  try {
    const data = await ranking.board(RANKING_BOARD);
    if (token !== recordsToken) return;
    list.replaceChildren();
    if (!data.entries.length) emptyRecords(list, '아직 전체 랭킹에 기록이 없습니다. 첫 번째 생존자가 되어보세요.');
    data.entries.forEach(e => list.append(recordRow(e.rank, e.name, e.value / 1000, e.you)));
    $('records-standing').textContent = data.you ? `내 순위 ${data.you.rank}위 · ${formatTime(data.you.value / 1000)} · 참가 ${data.total}명` : data.total ? `참가 ${data.total}명` : '';
  } catch (error) {
    if (token !== recordsToken) return;
    list.replaceChildren(); emptyRecords(list, `${ranking.describeError(error)} 내 기록 탭에서 이 브라우저의 기록을 볼 수 있어요.`);
  }
}
function blink() {
  if (mode !== 'playing') return;
  if (blinkCooldown > 0) { tone(140, .08, 'triangle', .025); return; }
  burst(player.position, '#d5f4ca', 20);
  const move = movementInput();
  if (move.lengthSq() === 0) move.copy(lastMove); else move.normalize();
  const next = clampToArena(player.position.x + move.x * BLINK_DISTANCE, player.position.z + move.z * BLINK_DISTANCE);
  player.position.x = next.x; player.position.z = next.z; hitPlayerPrevious.copy(player.position);
  blinkCooldown = BLINK_COOLDOWN; invincible = .35; blinks++; shake = .08;
  burst(player.position, '#e8ffdd', 24); tone(940, .3, 'sine', .05);
}

function jump() {
  if (mode !== 'playing' || !grounded) return;
  verticalVelocity = 9.5; grounded = false;
  tone(300, .12, 'sine', .025);
}
function queueShot(type, turretIndex, target, delay = .7) {
  const turret = turrets[turretIndex]; turret.pulse = Math.max(turret.pulse, delay);
  telegraphs.push({ type, x: turret.x * .9, z: turret.z * .9, target: target.clone(), delay, turretIndex });
}
function makeBullet(type, x, z, direction, speed) {
  const group = new THREE.Group(); group.position.set(x, .8, z); scene.add(group);
  if (type === 'homing') {
    buildMissile(group);
    group.quaternion.setFromUnitVectors(upVector, direction);
  } else {
    mesh(bulletGeometries[type], mat(bulletColors[type], true), 0, 0, 0, group);
    const trace = new THREE.Group();
    trace.position.copy(direction).multiplyScalar(-.49);
    trace.quaternion.setFromUnitVectors(upVector, direction); group.add(trace);
    for (let i = 0; i < 2; i++) {
      const glow = mesh(traceGeometry, traceMaterials[type], 0, 0, 0, trace);
      glow.rotation.y = i * Math.PI / 2; glow.castShadow = false; glow.receiveShadow = false;
    }
  }
  const b = { mesh: group, type, velocity: direction.clone().multiplyScalar(speed), life: type === 'homing' ? 6 : 8, radius: type === 'homing' ? .4 : .25, age: 0 };
  bullets.push(b); return b;
}
function fire(t) {
  const dir = new THREE.Vector3(t.target.x - t.x, 0, t.target.z - t.z).normalize();
  const speed = difficulty(survival).speed;
  if (t.type === 'fan') {
    for (let j = -2; j <= 2; j++) makeBullet('fan', t.x, t.z, dir.clone().applyAxisAngle(upVector, j * .16), speed * .92);
  } else makeBullet(t.type, t.x, t.z, dir, t.type === 'homing' ? speed * .7 : speed);
  if (mode === 'playing') tone(t.type === 'homing' ? 260 : 440, .07, 'triangle', .012);
}
function shockwave() {
  const index = Math.floor(Math.random() * 8), turret = turrets[index];
  const x = turret.x * .7, z = turret.z * .7;
  const m = ring(.5, .22, '#f58a3c', x, .16, z);
  const positions = m.geometry.attributes.position;
  m.userData.ringDirections = Array.from({ length: positions.count }, (_, i) => {
    const px = positions.getX(i), py = positions.getY(i), length = Math.hypot(px, py);
    return { x: px / length, y: py / length, inner: length < .4 };
  });
  hazards.push({ type: 'wave', mesh: m, x, z, radius: .5, age: -1.5, speed: 7.3 + Math.min(5, survival / 70) });
  announce('충격파 접근 — SPACE로 뛰어넘으세요', 2.5);
}
function meteor() {
  const target = clampToArena(player.position.x + (Math.random() - .5) * 6, player.position.z + (Math.random() - .5) * 6);
  const mark = ring(2.3, .12, '#e95e37', target.x, .13, target.z);
  const fill = mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshBasicMaterial({ color: '#f77c3b', transparent: true, opacity: .14, depthWrite: false }), target.x, .12, target.z); fill.rotation.x = -Math.PI / 2; fill.castShadow = false;
  hazards.push({ type: 'meteor', mesh: mark, marker: fill, x: target.x, z: target.z, age: 0, impact: false });
}
function updatePlayer(dt) {
  hitPlayerPrevious.copy(player.position);
  const move = movementInput();
  const moving = move.lengthSq() > 0;
  if (moving) {
    move.normalize(); lastMove.copy(move);
    player.position.addScaledVector(move, 7.8 * dt);
    const pos = clampToArena(player.position.x, player.position.z); player.position.x = pos.x; player.position.z = pos.z;
    const angle = Math.atan2(-move.x, -move.z);
    let delta = angle - body.rotation.y; delta = Math.atan2(Math.sin(delta), Math.cos(delta)); body.rotation.y += delta * Math.min(1, dt * 16);
    walking += dt * 13;
  }
  if (!grounded) {
    verticalVelocity -= 23 * dt; player.position.y += verticalVelocity * dt;
    if (player.position.y <= 0) { player.position.y = 0; verticalVelocity = 0; grounded = true; burst(player.position, '#cdd1ad', 5); }
  }
  const swing = moving && grounded ? Math.sin(walking) * .65 : 0;
  legs[0].rotation.x = swing; legs[1].rotation.x = -swing; arms[0].rotation.x = -swing * .6; arms[1].rotation.x = swing * .6;
  cape.rotation.x = -.2 - (moving ? .25 : 0) + Math.sin(walking * .5) * .06;
  body.position.y = moving && grounded ? Math.abs(Math.sin(walking)) * .045 : 0;
  invincible = Math.max(0, invincible - dt);
  body.visible = invincible <= 0 || Math.floor(invincible * 22) % 2 === 0;
  const oldCooldown = blinkCooldown; blinkCooldown = Math.max(0, blinkCooldown - dt);
  if (oldCooldown > 0 && blinkCooldown === 0) { tone(780, .2); announce('점멸 충전 완료 · F', 1.7); }
}
function updateCombat(dt) {
  const d = difficulty(survival);
  spawnClock -= dt;
  if (spawnClock <= 0) {
    spawnClock += d.interval;
    for (let i = 0; i < d.burst; i++) {
      const r = Math.random();
      const type = phase >= 2 && r < .2 ? 'homing' : phase >= 1 && r < .5 ? 'fan' : 'straight';
      queueShot(type, Math.floor(Math.random() * 8), player.position);
    }
  }
  eventClock -= dt;
  if (eventClock <= 0) {
    eventClock = Math.max(2.8, 7.5 - survival / 50);
    if (phase >= 3) shockwave();
    if (phase >= 4) { meteor(); if (survival > 120) meteor(); }
  }
  for (let i = telegraphs.length - 1; i >= 0; i--) { const t = telegraphs[i]; t.delay -= dt; if (t.delay <= 0) { fire(t); telegraphs.splice(i, 1); } }
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; b.life -= dt; b.age += dt;
    const prev = b.mesh.position.clone();
    if (b.type === 'homing' && b.age < 2.5) {
      const desired = new THREE.Vector3(player.position.x - prev.x, 0, player.position.z - prev.z).normalize().multiplyScalar(b.velocity.length());
      b.velocity.lerp(desired, dt * .65);
    }
    b.mesh.position.addScaledVector(b.velocity, dt);
    if (b.type === 'homing') {
      b.mesh.quaternion.setFromUnitVectors(upVector, scratch.copy(b.velocity).normalize());
      b.mesh.userData.exhaust.scale.y = .9 + Math.sin(b.age * 48) * .12;
    } else b.mesh.children[0].rotation.y += dt * 5;
    const p = player.position, q = b.mesh.position;
    // Sweep relative motion: fast bullets cannot tunnel through a moving player.
    const hit = segmentDistanceSq(0, 0, 0, prev.x - hitPlayerPrevious.x, prev.y - hitPlayerPrevious.y - .85, prev.z - hitPlayerPrevious.z, q.x - p.x, q.y - p.y - .85, q.z - p.z) < (.42 + b.radius) ** 2;
    if (mode === 'playing' && invincible <= 0 && hit) { die(b.type === 'homing' ? '유도탄' : b.type === 'fan' ? '부채꼴 탄막' : '직선탄'); return; }
    if (b.life <= 0 || q.length() > 47) { scene.remove(b.mesh); bullets.splice(i, 1); }
  }
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i]; h.age += dt;
    if (h.type === 'wave') {
      const previousRadius = h.radius;
      if (h.age >= 0) {
        h.radius += h.speed * dt;
        const positions = h.mesh.geometry.attributes.position;
        h.mesh.userData.ringDirections.forEach((direction, j) => {
          const r = h.radius - (direction.inner ? .22 : 0);
          positions.setXY(j, direction.x * r, direction.y * r);
        });
        positions.needsUpdate = true;
        h.mesh.geometry.computeBoundingSphere();
      }
      h.mesh.material.opacity = h.age < 0 ? .35 + Math.sin(h.age * 14) * .2 : .78;
      const dist = Math.hypot(player.position.x - h.x, player.position.z - h.z);
      if (mode === 'playing' && h.age >= 0 && invincible <= 0 && player.position.y < .85 && dist > previousRadius - .52 && dist < h.radius + .52) { die('충격파'); return; }
      if (h.radius > 42) { removeMesh(h.mesh, true); hazards.splice(i, 1); }
    } else {
      h.mesh.material.opacity = .45 + Math.sin(h.age * 18) * .3;
      h.marker.material.opacity = .12 + Math.min(h.age / 2, 1) * .22;
      if (h.age > 1.4 && !h.rock) {
        h.rock = mesh(bulletGeometries.meteor, mat('#f45b35', true), h.x, 16, h.z); h.rock.castShadow = true;
      }
      if (h.rock) { h.rock.position.y = Math.max(.1, 16 - (h.age - 1.4) * 27); h.rock.rotation.x += dt * 3; }
      if (h.age >= 2 && !h.impact) {
        h.impact = true; shake = .15; burst(new THREE.Vector3(h.x, 0, h.z), '#f97a3d', 28); tone(80, .3, 'triangle', .06);
        if (mode === 'playing' && invincible <= 0 && Math.hypot(player.position.x - h.x, player.position.z - h.z) < 2.65 && player.position.y < 3.8) { die('낙하 운석'); return; }
      }
      if (h.age > 2.45) { removeMesh(h.mesh, true); removeMesh(h.marker, true); if (h.rock) scene.remove(h.rock); hazards.splice(i, 1); }
    }
  }
}
function updateHud() {
  $('timer').textContent = formatTime(survival);
  $('phase-label').textContent = `PHASE ${String(phase + 1).padStart(2, '0')}`; $('phase-name').textContent = PHASES[phase].name;
  $('phase-progress').style.width = `${phase >= 5 ? 100 : (survival % 20) * 5}%`;
  $('next-phase').textContent = phase >= 5 ? '시간이 지날수록 더 빠르게' : `${PHASES[phase + 1].attack} · ${Math.ceil(20 - survival % 20)}초 후`;
  $('blink-label').textContent = blinkCooldown > 0 ? `${blinkCooldown.toFixed(1)}초` : '준비 완료';
  $('blink-progress').style.width = `${100 * (1 - blinkCooldown / BLINK_COOLDOWN)}%`;
  $('danger-flash').style.opacity = invincible > 0 && blinkCooldown > 29 ? .12 : 0;
}
function updateEffects(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt; p.velocity.y -= dt * 10; p.mesh.position.addScaledVector(p.velocity, dt); p.mesh.scale.setScalar(Math.max(.01, p.life * 1.5)); p.mesh.rotation.x += dt * 4;
    if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); }
  }
}
const menuTarget = new THREE.Vector3();
let visualTime = 0, lastFrame = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastFrame) / 1000, .05); lastFrame = now;
  if (mode !== 'paused') visualTime += dt;
  if (mode === 'menu') {
    const ratio = innerWidth / innerHeight;
    camera.position.set(36 + Math.sin(visualTime * .075) * 2, 31, 43);
    menuTarget.set(ratio > 1.2 ? -11 : -5, -1.6, 0); camera.lookAt(menuTarget);
    player.position.set(3, 0, 5); body.rotation.y = -.6; body.position.y = Math.sin(visualTime * 2) * .025;
    // Decorative shots on the live title-screen arena.
    spawnClock -= dt;
    if (spawnClock <= 0) { spawnClock = 1.5; const t = turrets[Math.floor(Math.random() * 8)]; makeBullet('straight', t.x, t.z, new THREE.Vector3(-t.x + 6, 0, -t.z).normalize(), 7); }
    for (let i = bullets.length - 1; i >= 0; i--) { const b = bullets[i]; b.mesh.position.addScaledVector(b.velocity, dt); b.life -= dt; if (b.life < 0) { scene.remove(b.mesh); bullets.splice(i, 1); } }
  } else if (mode === 'playing') {
    survival += dt;
    const nextPhase = phaseAt(survival);
    if (nextPhase !== phase) { phase = nextPhase; announce(`PHASE ${String(phase + 1).padStart(2, '0')} · ${PHASES[phase].attack} 등장`, 3); tone(520, .35, 'triangle', .05); if (phase >= 3) eventClock = 2.5; }
    updatePlayer(dt); updateCombat(dt);
    announcementTime -= dt; if (announcementTime <= 0) $('announcement').classList.remove('show');
    updateHud();
  }
  if (mode === 'playing' || mode === 'over') {
    // Orbit smoothly through each 90-degree step, landing exactly on a cardinal view.
    updateFollowCamera(dt);
    if (shake > 0) { camera.position.x += (Math.random() - .5) * shake; camera.position.y += (Math.random() - .5) * shake; shake = Math.max(0, shake - dt); }
  }
  if (mode !== 'paused') {
    updateEffects(dt);
    for (const t of turrets) { t.pulse = Math.max(0, t.pulse - dt); t.head.rotation.y = visualTime * .6; t.head.position.y = 4.35 + Math.sin(visualTime * 2 + t.x) * .12; t.head.scale.setScalar(t.pulse > 0 ? 1.2 + Math.sin(visualTime * 30) * .25 : 1); t.mark.material.opacity = t.pulse > 0 ? 1 : .3; }
    dust.rotation.y = visualTime * .007;
  }
  playerRing.position.set(player.position.x, .1, player.position.z); playerRing.material.opacity = blinkCooldown <= 0 ? .85 : .25;
  playerShadow.position.set(player.position.x, .092, player.position.z); playerShadow.scale.setScalar(1 - player.position.y * .12);
  updateEdgeWarnings();
  renderer.render(scene, camera);
}

$('start').onclick = startGame; $('retry').onclick = startGame;
$('pause-button').onclick = pause; $('resume').onclick = resume;
$('pause-home').onclick = home; $('result-home').onclick = home;
$('records-button').onclick = () => showRecords('global'); $('close-records').onclick = () => panels(null);
document.querySelectorAll('[data-records-tab]').forEach(b => { b.onclick = () => showRecords(b.dataset.recordsTab); });
$('view-left').onclick = () => rotateView(-1); $('view-right').onclick = () => rotateView(1);
document.querySelector('.brand').onclick = (e) => { e.preventDefault(); home(); };
$('sound').onclick = () => { soundEnabled = !soundEnabled; $('sound').textContent = soundEnabled ? '♫' : '♪̸'; $('sound').setAttribute('aria-label', soundEnabled ? '사운드 끄기' : '사운드 켜기'); if (soundEnabled) tone(600); toast(soundEnabled ? '사운드 켜짐' : '사운드 꺼짐'); };
$('fullscreen').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { toast('이 환경에서는 전체 화면을 사용할 수 없습니다.'); } };
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) { if (e.code === 'Enter') { e.target.blur(); startGame(); } return; }
  if (['Space', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'Escape'].includes(e.code)) e.preventDefault();
  if (e.code === 'Escape' && !e.repeat) { if (mode === 'playing') pause(); else if (mode === 'paused') resume(); else if (mode === 'menu') panels(null); return; }
  if (mode !== 'playing') return;
  keys.add(e.code);
  if (!e.repeat && e.code === 'ArrowLeft') rotateView(-1);
  if (!e.repeat && e.code === 'ArrowRight') rotateView(1);
  if (!e.repeat && e.code === 'Space') jump();
  if (!e.repeat && e.code === 'KeyF') blink();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); });

// Development-only controls for deterministic gameplay verification.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('test')) {
  window.__game = {
    start: startGame, pause, resume, home, blink, jump, rotateView,
    get state() { return { mode, survival, phase, blinkCooldown, blinks, view, cameraYaw, turnElapsed, queuedTurns: queuedTurns.length, y: player.position.y, x: player.position.x, z: player.position.z, bullets: bullets.length, hazards: hazards.length, records: records.length, endReason }; },
    advance(seconds) { for (let i = 0; i < seconds * 60 && mode === 'playing'; i++) { survival += 1 / 60; phase = phaseAt(survival); updatePlayer(1 / 60); } updateHud(); },
    clear: clearCombat,
    hit() { invincible = 0; const b = makeBullet('straight', player.position.x, player.position.z, new THREE.Vector3(0, 0, 1), 0); b.mesh.position.y = player.position.y + .85; hitPlayerPrevious.copy(player.position); updateCombat(1 / 60); },
    wave: shockwave, meteor,
  };
  const verify = document.createElement('button');
  verify.textContent = '개발 검증 실행'; verify.id = 'verify-game';
  verify.style.cssText = 'position:fixed;right:12px;bottom:4px;z-index:150;font-size:10px';
  document.body.append(verify);
  const previewMissile = document.createElement('button');
  previewMissile.textContent = '미사일 미리보기';
  previewMissile.style.cssText = 'position:fixed;right:125px;bottom:4px;z-index:150;font-size:10px';
  document.body.append(previewMissile);
  previewMissile.onclick = () => {
    home(); mode = 'preview';
    document.getElementById('verification-report')?.remove();
    $('menu').hidden = true; $('menu-footer').hidden = true;
    document.body.classList.add('playing'); body.visible = false;
    const preview = makeBullet('homing', 0, 0, new THREE.Vector3(1, 0, 0), 0);
    preview.mesh.position.y = 2.2; preview.mesh.scale.setScalar(3);
    camera.position.set(5, 5.5, 7); camera.lookAt(0, 2.2, 0);
  };
  const previewBasic = document.createElement('button');
  previewBasic.textContent = '기본탄 미리보기';
  previewBasic.style.cssText = 'position:fixed;right:235px;bottom:4px;z-index:150;font-size:10px';
  document.body.append(previewBasic);
  previewBasic.onclick = () => {
    previewMissile.onclick(); clearCombat();
    const preview = makeBullet('straight', 0, 0, new THREE.Vector3(1, 0, 0), 0);
    preview.mesh.position.y = 2.2; preview.mesh.scale.setScalar(3);
  };
  verify.onclick = () => {
    const checks = [];
    const check = (name, condition) => { checks.push(`${condition ? 'PASS' : 'FAIL'} ${name}`); if (!condition) throw new Error(name); };
    const backup = [...records];
    try {
      startGame(); clearCombat();
      keys.add('KeyW'); updatePlayer(.1); keys.clear(); check('W 이동', player.position.z < 4.3);
      keys.add('KeyD'); updatePlayer(.1); keys.clear(); check('D 이동', player.position.x > .7);
      keys.add('KeyS'); updatePlayer(.1); keys.clear(); check('S 이동', Math.abs(player.position.z - 5) < .01);
      keys.add('KeyA'); updatePlayer(.1); keys.clear(); check('A 이동', Math.abs(player.position.x) < .01);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); updatePlayer(.1); keys.clear();
      check('Space 점프', player.position.y > .6 && !grounded);
      const airborneVelocity = verticalVelocity; jump(); check('공중 추가 점프 차단', verticalVelocity === airborneVelocity);
      for (let i = 0; i < 70; i++) updatePlayer(1 / 60);
      check('착지', grounded && player.position.y === 0);
      for (let i = 1; i <= 4; i++) {
        const beforeTurn = cameraYaw;
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
        check(`회전 시작 순간이동 없음 ${i}`, cameraYaw === beforeTurn);
        updateFollowCamera(VIEW_TURN_DURATION / 2);
        check(`90도 회전 중간 경유 ${i}`, Math.abs(cameraYaw - beforeTurn - Math.PI / 4) < 1e-9);
        updateFollowCamera(VIEW_TURN_DURATION / 2);
        check(`오른쪽 90도 전환 ${i}`, view === i % 4 && camera.position.x === cameraAnchor.x - VIEWS[view].x * 21 && camera.position.z === cameraAnchor.z - VIEWS[view].z * 21);
      }
      rotateView(1); rotateView(1); check('빠른 연속 입력 대기', queuedTurns.length === 1);
      updateFollowCamera(VIEW_TURN_DURATION * 2); check('연속 입력 90도씩 완료', view === 2 && queuedTurns.length === 0 && turnElapsed === VIEW_TURN_DURATION);
      rotateView(-1); rotateView(-1); updateFollowCamera(VIEW_TURN_DURATION * 2); check('왼쪽 회전으로 복귀', view === 0);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' })); check('왼쪽 순환', view === 3);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', repeat: true })); check('키 반복 회전 차단', view === 3);
      updateFollowCamera(VIEW_TURN_DURATION);
      keys.clear(); keys.add('KeyW'); const westBefore = player.position.clone(); updatePlayer(.1); keys.clear();
      check('서쪽 시점 W 이동', player.position.x < westBefore.x && player.position.z === westBefore.z);
      rotateView(1);
      updateFollowCamera(VIEW_TURN_DURATION);
      $('view-right').click(); check('화면 오른쪽 화살표', view === 1);
      updateFollowCamera(VIEW_TURN_DURATION);
      keys.add('KeyW'); const eastBefore = player.position.clone(); blink(); keys.clear();
      check('회전 후 이동 방향 점멸', Math.abs(player.position.x - eastBefore.x - BLINK_DISTANCE) < .01 && player.position.z === eastBefore.z);
      $('view-left').click(); check('화면 왼쪽 화살표', view === 0);
      updateFollowCamera(VIEW_TURN_DURATION);
      player.position.set(0, 0, 5); lastMove.set(0, 0, -1); blinkCooldown = 0; blinks = 0;
      const before = player.position.clone(); blink(); check('점멸 거리', Math.abs(player.position.distanceTo(before) - BLINK_DISTANCE) < .01);
      blink(); check('재사용 차단', blinks === 1 && blinkCooldown === 30);
      window.__game.advance(30); check('30초 충전', blinkCooldown < .001); blinkCooldown = 0; blink(); check('점멸 재사용', blinks === 2);
      pause(); check('일시정지', mode === 'paused'); rotateView(1); check('일시정지 중 시점 고정', view === 0); resume(); check('재개', mode === 'playing');
      for (const seconds of [20, 40, 60, 80, 100]) { survival = seconds; phase = phaseAt(survival); check(`${seconds}초 단계`, phase === Math.min(5, seconds / 20)); }
      clearCombat(); fire({ type: 'fan', x: 18, z: 0, target: player.position.clone() }); check('5방향 탄막', bullets.length === 5);
      fire({ type: 'homing', x: -18, z: 0, target: player.position.clone() }); check('유도탄', bullets.at(-1).type === 'homing');
      invincible = 100; updateCombat(1 / 60);
      clearCombat(); shockwave(); const wave = hazards[0]; invincible = 100; spawnClock = 100; eventClock = 100;
      for (let i = 0; i < 120; i++) updateCombat(1 / 60);
      const pos = wave.mesh.geometry.attributes.position;
      const inner = Math.hypot(pos.getX(0), pos.getY(0)), outer = Math.hypot(pos.getX(65), pos.getY(65));
      check('충격파 폭 일정', wave.radius > 4 && Math.abs(outer - inner - .22) < .001);
      check('틈 없는 원형 충격파', wave.mesh.geometry.parameters.thetaLength === Math.PI * 2);
      jump(); updatePlayer(.15); invincible = 0;
      player.position.x = wave.x + wave.radius; player.position.z = wave.z;
      updateCombat(1 / 60); check('점프로 충격파 회피', mode === 'playing' && player.position.y > .85);
      player.position.set(wave.x + wave.radius, 0, wave.z); grounded = true; verticalVelocity = 0;
      updateCombat(1 / 60); check('지상 충격파 피격', mode === 'over' && endReason === '충격파');
      startGame(); clearCombat(); invincible = 100; spawnClock = 100; eventClock = 100;
      clearCombat(); meteor(); for (let i = 0; i < 91; i++) updateCombat(1 / 60);
      check('운석 경고 후 낙하', !!hazards[0].rock); const rock = hazards[0].rock; clearCombat(); check('재시작 운석 정리', rock.parent === null);
      survival = 12.345; phase = 0; window.__game.hit(); check('피격 종료', mode === 'over'); check('기록 저장', records.some(r => r.time === 12.345));
      startGame(); check('재시작 초기화', survival === 0 && blinkCooldown === 0 && hazards.length === 0 && bullets.length === 0 && grounded && verticalVelocity === 0 && player.position.y === 0);
    } catch (error) { checks.push(`ERROR ${error.message}`); }
    finally {
      records = backup; try { localStorage.setItem('last-second-records', JSON.stringify(backup)); } catch {}
      home();
      let report = document.getElementById('verification-report');
      if (!report) { report = document.createElement('pre'); report.id = 'verification-report'; report.style.cssText = 'position:fixed;right:8px;top:8px;max-height:85vh;overflow:auto;z-index:160;background:#f0f0e4;padding:14px;font-size:11px'; document.body.append(report); }
      report.textContent = checks.join('\n');
    }
  };
}
$('loading').hidden = true;
home(); requestAnimationFrame(frame);
