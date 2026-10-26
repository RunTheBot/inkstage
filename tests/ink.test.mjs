import test from 'node:test';
import assert from 'node:assert/strict';
import { snapLine, hitStrokes, hitStrokesAlongPath } from '../src/ink.ts';
test('angle snap respects aspect ratio for horizontal, vertical and diagonal lines', () => {
  const start = { x: .2, y: .2 }, aspect = 16 / 9;
  assert.ok(Math.abs(snapLine(start, { x: .8, y: .21 }, aspect).y - .2) < 1e-10);
  assert.ok(Math.abs(snapLine(start, { x: .205, y: .8 }, aspect).x - .2) < 1e-10);
  const diagonal = snapLine(start, { x: .5, y: .72 }, aspect);
  assert.ok(Math.abs((diagonal.x - start.x) * aspect - (diagonal.y - start.y)) < 1e-10);
  const offAngle = { x: .7, y: .6 };
  assert.deepEqual(snapLine(start, offAngle, aspect), offAngle);
  assert.deepEqual(snapLine(start, { x: .8, y: .21 }, aspect, false), { x: .8, y: .21 });
});
test('eraser hits long segments, crossing paths and dots, but leaves other strokes alone', () => {
  const strokes = [
    { id: 'line', width: 4, points: [{ x: .1, y: .5 }, { x: .9, y: .5 }] },
    { id: 'dot', width: 4, points: [{ x: .2, y: .2 }] },
    { id: 'other', width: 4, points: [{ x: .1, y: .9 }, { x: .9, y: .9 }] },
  ];
  assert.deepEqual(hitStrokes(strokes, { x: .5, y: .5 }, null, 16 / 9, .01), ['line']);
  assert.deepEqual(hitStrokes(strokes, { x: .5, y: .6 }, { x: .5, y: .4 }, 16 / 9, .01), ['line']);
  assert.deepEqual(hitStrokes(strokes, { x: .2, y: .2 }, null, 16 / 9, .01), ['dot']);
  assert.deepEqual(hitStrokes(strokes, { x: .5, y: .1 }, null, 16 / 9, .01), []);
});

test('a coalesced eraser follows the sampled curve without erasing across its shortcut', () => {
  const dot = (id, x, y) => ({ id, width: 4, points: [{ x, y }] });
  const strokes = [dot('left', .2, .5), dot('top', .5, .8), dot('right', .8, .5), dot('shortcut', .5, .2)];
  const samples = [{ x: .2, y: .8 }, { x: .8, y: .8 }, { x: .8, y: .2 }, { x: .8, y: .8 }];
  assert.deepEqual(hitStrokesAlongPath(strokes, samples, { x: .2, y: .2 }, 16 / 9, .01), ['left', 'top', 'right']);
  assert.equal(strokes.length, 4, 'hit testing does not mutate visible ink');
});
