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

test('remote bursts match sequential delivery across acknowledgements, replacements and authoritative ink', () => {
  const batched = new RoomReplica(), sequential = new RoomReplica();
  const existing = stroke('existing');
  const local = Array.from({ length: 20 }, (_, i) => ({ type: 'stroke-points', id: 'existing', slide: 0, op: `local-${i}`, points: [{ x: .2 + i / 100, y: .2, pressure: .5 }] }));
  for (const replica of [batched, sequential]) {
    replica.reset(room([structuredClone(existing)]));
    replica.localBatch(local);
  }
  const burst = Array.from({ length: 240 }, (_, i) => ({ type: 'stroke-points', id: 'existing', slide: 0, op: `remote-${i}`, revision: i + 1, points: [{ x: i / 300, y: .4, pressure: i / 240 }] }));
  const events = [
    ...burst.slice(0, 120), ...local,
    { type: 'stroke-replace', id: 'existing', slide: 0, op: 'replace', revision: 241, points: [{ x: .1, y: .1 }, { x: .9, y: .9 }] },
    ...burst.slice(120).map(event => ({ ...event, revision: event.revision + 121 })),
    { type: 'ink-state', slide: 0, op: 'state', revision: 400, strokes: [stroke('reset')] },
  ];
  for (const event of events) sequential.remote(event);
  batched.remoteBatch(events);
  assert.deepEqual(batched.room, sequential.room);
  // All twenty local IDs must have been acknowledged, including IDs merged
  // into the same frame; none should be resurrected by authoritative ink.
  assert.deepEqual(batched.room.strokes[0], [stroke('reset')]);
});

test('remote point batching retains the latest revision, all samples and unchanged stroke identities', () => {
  const replica = new RoomReplica(), original = stroke('a'), untouched = stroke('b');
  replica.reset(room([original, untouched]));
  const events = Array.from({ length: 240 }, (_, i) => ({ type: 'stroke-points', id: 'a', slide: 0, op: `p-${i}`, revision: i + 1, points: [{ x: i / 300, y: .4, pressure: i / 240 }] }));
  replica.remoteBatch(events);
  assert.equal(replica.room.revision, 240);
  assert.deepEqual(replica.room.strokes[0][0].points, [...original.points, ...events.flatMap(event => event.points)]);
  assert.equal(replica.room.strokes[0][1], untouched);
  assert.equal(original.points.length, 2);
  assert.ok(events.every(event => event.points.length === 1));
});
