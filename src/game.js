export const ARENA_RADIUS = 19;
export const BLINK_COOLDOWN = 30;
export const BLINK_DISTANCE = 6.8;
export const VIEWS = [
  { label: '북 N', x: 0, z: -1 },
  { label: '동 E', x: 1, z: 0 },
  { label: '남 S', x: 0, z: 1 },
  { label: '서 W', x: -1, z: 0 },
];
export function turnView(view, step) { return ((view + step) % 4 + 4) % 4; }
export function screenMovement(x, z, view) {
  const forward = VIEWS[view];
  return { x: -forward.z * x - forward.x * z, z: forward.x * x - forward.z * z };
}
export const PHASES = [
  { name: '첫 번째 시험', attack: '직선탄', at: 0 },
  { name: '갈라지는 궤적', attack: '부채꼴 탄막', at: 20 },
  { name: '끈질긴 추격', attack: '유도탄', at: 40 },
  { name: '땅을 넘어서', attack: '충격파', at: 60 },
  { name: '하늘의 경고', attack: '낙하 운석', at: 80 },
  { name: '한계 돌파', attack: '모든 공격 강화', at: 100 },
];
export function phaseAt(time) { return Math.min(PHASES.length - 1, Math.floor(Math.max(0, time) / 20)); }
export function difficulty(time) {
  return { phase: phaseAt(time), interval: Math.max(.28, 1.65 / (1 + time / 50)), speed: Math.min(24, 8.3 + time * .055), burst: Math.min(4, 1 + Math.floor(time / 75)) };
}
export function formatTime(seconds) {
  const ms = Math.max(0, Math.floor(seconds * 1000));
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}
export function clampToArena(x, z, radius = ARENA_RADIUS - .75) {
  const d = Math.hypot(x, z);
  return d > radius ? { x: x / d * radius, z: z / d * radius } : { x, z };
}
export function segmentDistanceSq(px, py, pz, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const length = dx * dx + dy * dy + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / length)) : 0;
  return (px - ax - dx * t) ** 2 + (py - ay - dy * t) ** 2 + (pz - az - dz * t) ** 2;
}
export function rankRecords(records, entry) {
  return [...records, entry].sort((a, b) => b.time - a.time).slice(0, 10);
}
