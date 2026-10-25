import test from 'node:test';
import assert from 'node:assert/strict';
import { InkRenderer, inkBitmapSize } from '../src/ink.ts';
import { RoomReplica, mergePointEvents } from '../src/roomSync.ts';

const stroke = (id, x = .1) => ({ id, tool: 'pen', color: '#e4594e', width: 4, points: [{ x, y: .2 }, { x: x + .01, y: .3 }] });
const room = strokes => ({ id: 'test', width: 16, height: 9, current: 0, revision: 0, strokes: { 0: strokes }, slides: [], timer: {} });

function fakeCanvas() {
  const calls = { paths: 0, segments: 0, clears: 0, blits: 0 };
  const ctx = {
    beginPath() { calls.paths++; }, moveTo() {}, lineTo() { calls.segments++; },
    closePath() {}, fill() {}, stroke() {}, arc() {},
    clearRect() { calls.clears++; }, drawImage() { calls.blits++; },
  };
  return { width: 1600, height: 900, getContext: () => ctx, calls };
}

test('hundreds of finished strokes are rasterized once while a new stroke streams', () => {
  const base = fakeCanvas(), canvas = fakeCanvas(), renderer = new InkRenderer(base);
  const finished = Array.from({ length: 500 }, (_, i) => stroke(String(i)));
  for (let frame = 0; frame < 120; frame++) renderer.render(canvas, [...finished, stroke('live', frame / 200)]);
  assert.equal(base.calls.paths, 500, 'finished geometry must not be recalculated 60,000 times');
  assert.equal(canvas.calls.paths, 120);
  assert.equal(canvas.calls.blits, 120);
  renderer.render(canvas, [...finished, stroke('live'), stroke('next')]);
  assert.equal(base.calls.paths, 501, 'only the newly finished stroke is appended');
});

test('erase, undo, clear and resize invalidate the finished-ink bitmap', () => {
  const base = fakeCanvas(), canvas = fakeCanvas(), renderer = new InkRenderer(base);
  const strokes = [stroke('a'), stroke('b'), stroke('c')];
  renderer.render(canvas, strokes);
  renderer.render(canvas, [strokes[1], strokes[2]]);
  assert.equal(base.calls.paths, 3);
  renderer.render(canvas, strokes);
  assert.equal(base.calls.paths, 5);
  canvas.width = 2400;
  renderer.render(canvas, strokes);
  assert.equal(base.calls.paths, 7);
  renderer.render(canvas, []);
  assert.equal(canvas.calls.clears, 5);
});

test('zoom has a bounded raster budget, including tablet pixel density', () => {
  for (const scale of [1, 2, 4, 8, 12]) {
    const bitmap = inkBitmapSize(1536, 864, scale);
    assert.ok(bitmap.width * bitmap.height <= 3_005_000);
    assert.ok(bitmap.width <= 4096 && bitmap.height <= 4096);
    assert.ok(Math.abs(bitmap.width / bitmap.height - 16 / 9) < .003);
  }
});

test('display-frame batching retains every sample and the order of replacements and pen-up', () => {
  const points = Array.from({ length: 240 }, (_, i) => ({ x: i / 300, y: .4, pressure: i / 240 }));
  const events = points.map((p, i) => ({ type: 'stroke-points', id: 'a', slide: 0, op: String(i), points: [p] }));
  const replace = { type: 'stroke-replace', id: 'a', slide: 0, points: [{ x: .1, y: .1 }] };
  const end = { type: 'stroke-end', id: 'a', slide: 0 };
  const merged = mergePointEvents([...events, replace, end]);
  assert.equal(merged.length, 3);
  assert.deepEqual(merged[0].points, points);
  assert.equal(merged[1].type, 'stroke-replace');
  assert.equal(merged[2].type, 'stroke-end');
  assert.equal(events[0].points.length, 1, 'batching must not mutate original events used for reconciliation');
});

test('a delayed erase response cannot roll back newer local ink or duplicate it at acknowledgement', () => {
  const replica = new RoomReplica();
  const old = stroke('old'), fresh = stroke('fresh');
  replica.reset(room([old]));
  replica.local({ type: 'erase', slide: 0, ids: ['old'], op: 'erase' });
  const start = { type: 'stroke-start', slide: 0, stroke: fresh, op: 'start' };
  const points = { type: 'stroke-points', slide: 0, id: 'fresh', points: [{ x: .8, y: .8 }], op: 'points' };
  replica.localBatch([start, points]);
  const before = structuredClone(replica.room.strokes[0]);
  replica.remote({ type: 'ink-state', slide: 0, strokes: [], op: 'erase' });
  assert.deepEqual(replica.room.strokes[0], before);
  replica.remote(start); replica.remote(points);
  assert.deepEqual(replica.room.strokes[0], before);
});

test('remote authoritative ink preserves unacknowledged samples and a reconnect clears pending edits', () => {
  const replica = new RoomReplica(), existing = stroke('existing');
  replica.reset(room([existing]));
  replica.localBatch([
    { type: 'stroke-points', slide: 0, id: existing.id, points: [{ x: .4, y: .4 }], op: 'a' },
    { type: 'stroke-points', slide: 0, id: existing.id, points: [{ x: .5, y: .5 }], op: 'b' },
  ]);
  replica.remote({ type: 'ink-state', slide: 0, strokes: [existing], op: 'remote-erase' });
  assert.equal(replica.room.strokes[0][0].points.length, 4);
  replica.reset(room([]));
  replica.remote({ type: 'ink-state', slide: 0, strokes: [], op: 'reset' });
  assert.deepEqual(replica.room.strokes[0], []);
});
