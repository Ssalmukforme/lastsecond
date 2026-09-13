import test from 'node:test';
import assert from 'node:assert/strict';
import { phaseAt, difficulty, formatTime, clampToArena, segmentDistanceSq, rankRecords, BLINK_COOLDOWN, BLINK_DISTANCE, turnView, screenMovement } from '../src/game.js';
test('four cardinal views wrap in both directions', () => {
  assert.deepEqual([0, 1, 2, 3].map(v => turnView(v, 1)), [1, 2, 3, 0]);
  assert.deepEqual([0, 1, 2, 3].map(v => turnView(v, -1)), [3, 0, 1, 2]);
});
test('WASD and moving blink use screen directions in all four views', () => {
  const forward = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let view = 0; view < 4; view++) {
    const w = screenMovement(0, -1, view), d = screenMovement(1, 0, view), s = screenMovement(0, 1, view), a = screenMovement(-1, 0, view);
    assert.ok(w.x === forward[view][0] && w.z === forward[view][1]);
    assert.ok(d.x === -w.z && d.z === w.x);
    assert.ok(s.x === -w.x && s.z === -w.z);
    assert.ok(a.x === -d.x && a.z === -d.z);
    assert.ok(Math.abs(Math.hypot(...Object.values(screenMovement(1, -1, view))) - Math.SQRT2) < 1e-9);
  }
});
test('time formatting preserves minutes and milliseconds', () => {
  assert.equal(formatTime(0), '00:00.000');
  assert.equal(formatTime(125.678), '02:05.678');
});
test('new threats unlock every twenty seconds and difficulty keeps increasing', () => {
  assert.deepEqual([0, 19.99, 20, 40, 60, 80, 100, 500].map(phaseAt), [0, 0, 1, 2, 3, 4, 5, 5]);
  const levels = [0, 30, 60, 120, 240].map(difficulty);
  for (let i = 1; i < levels.length; i++) { assert.ok(levels[i].speed > levels[i - 1].speed); assert.ok(levels[i].interval < levels[i - 1].interval); }
  assert.ok(difficulty(1e6).interval >= .28);
});
test('movement and blink stay inside the arena in every direction', () => {
  assert.equal(BLINK_COOLDOWN, 30); assert.ok(BLINK_DISTANCE > 6);
  for (let i = 0; i < 360; i++) {
    const a = i * Math.PI / 180, p = clampToArena(Math.cos(a) * 50, Math.sin(a) * 50);
    assert.ok(Math.hypot(p.x, p.z) <= 18.2500001);
  }
  assert.deepEqual(clampToArena(2, 3), { x: 2, z: 3 });
});
test('swept collision catches a bullet crossing the player between frames', () => {
  assert.equal(segmentDistanceSq(0, 1, 0, -10, 1, 0, 10, 1, 0), 0);
  assert.equal(segmentDistanceSq(0, 3, 0, -10, 1, 0, 10, 1, 0), 4);
  assert.equal(segmentDistanceSq(0, 0, 0, 1, 0, 0, 1, 0, 0), 1);
});
test('leaderboard retains the longest ten runs', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ name: `P${i}`, time: i + 1 }));
  const sorted = rankRecords(rows, { name: '<test>', time: 50 });
  assert.equal(sorted.length, 10); assert.equal(sorted[0].time, 50); assert.equal(sorted[9].time, 2);
  assert.equal(rows[0].time, 1);
});
