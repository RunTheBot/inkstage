import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomReplica, mergePointEvents } from '../src/roomSync.ts';

const stroke = (id, x = .1) => ({ id, tool: 'pen', color: '#e4594e', width: 4, points: [{ x, y: .2 }, { x: x + .01, y: .3 }] });
const room = strokes => ({ id: 'test', width: 16, height: 9, current: 0, revision: 0, strokes: { 0: strokes }, slides: [], timer: {} });

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
