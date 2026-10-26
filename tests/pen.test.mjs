import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { XMLValidator } from 'fast-xml-parser';
import { PenSmoother } from '../src/smoothing.ts';
import { pressureJoins, pressureOutline } from '../shared/pressure.mjs';
import { actualPointerSamples, normalizePressure, PenPressure } from '../src/pressureInput.ts';
import { applyOperation } from '../server/state.mjs';
import { demoDeck } from '../server/demo.mjs';
import { inspectDeck, exportDeck } from '../server/deck.mjs';

test('smoothing presets progressively suppress jitter and retain the final endpoint', () => {
  const jitter = [];
  for (const preset of ['light', 'balanced', 'strong', 'maximum']) {
    const filter = new PenSmoother(preset, 16 / 9, { x: .1, y: .5 }, 0);
    const samples = [];
    let last;
    for (let i = 1; i <= 600; i++) {
      last = { x: .1 + i * .0002, y: .5 + (i % 2 ? .001 : -.001) };
      samples.push(filter.push(last, i * 1000 / 60));
    }
    // Measure steady-state jitter separately from the stronger filters' settling time.
    jitter.push(samples.slice(-60).reduce((n, p) => n + Math.abs(p.y - .5), 0));
    const final = filter.finish().at(-1);
    assert.ok(Math.abs(final.x - last.x) < 1e-12 && Math.abs(final.y - last.y) < 1e-12);
    assert.ok(samples.every(p => Number.isFinite(p.x) && p.x >= .1 && p.x <= last.x));
  }
  assert.ok(jitter[3] < jitter[2] && jitter[2] < jitter[1] && jitter[1] < jitter[0]);
  assert.ok(jitter[3] < jitter[0] * .35, 'Maximum should remove substantially more jitter than Light while keeping a short trailing distance');
});

test('every smoothing preset keeps handwriting within four visible pixels of the tip at different rates and zooms', () => {
  for (const rate of [60, 120, 240]) for (const scale of [.6, 1, 4.25]) for (const preset of ['light', 'balanced', 'strong', 'maximum']) {
    const filter = new PenSmoother(preset, 16 / 9, { x: .1, y: .2 }, 0, scale);
    let worst = 0;
    for (let i = 1; i <= rate; i++) {
      const point = { x: .1 + 600 * i / rate / (1600 * scale), y: .2 };
      const output = filter.push(point, i * 1000 / rate);
      worst = Math.max(worst, (point.x - output.x) * 1600 * scale);
    }
    assert.ok(worst < 4, `${preset}, ${rate} Hz, scale ${scale}: ${worst} px lag`);
  }
});

test('pressure deadzone rejects light contact and preserves a continuous full pressure range', () => {
  for (const pressure of [0, .001, .029, .03]) assert.equal(normalizePressure(pressure, 3), 0);
  assert.ok(normalizePressure(.031, 3) > 0 && normalizePressure(.031, 3) < .002);
  assert.equal(normalizePressure(1, 3), 1);
  assert.equal(normalizePressure(.5, 0), .5);
  assert.equal(normalizePressure(-1, 3), 0);
  assert.equal(normalizePressure(2, 3), 1);
});

test('Maximum smoothing stays within its trailing limit through handwriting turns at high zoom', () => {
  for (const rate of [60, 120, 240]) {
    const filter = new PenSmoother('maximum', 16 / 9, { x: .2, y: .3 }, 0, 4.25);
    for (let i = 1; i <= rate; i++) {
      const t = i / rate;
      const point = { x: .2 + .04 * Math.sin(6 * Math.PI * t), y: .3 + .08 * t };
      const output = filter.push(point, t * 1000);
      const lag = Math.hypot((point.x - output.x) * 6800, (point.y - output.y) * 3825);
      assert.ok(lag <= 3.500001, `${rate} Hz turn produced ${lag} px lag`);
    }
  }
});

test('pressure filtering suppresses sensor chatter without delaying deliberate pressure by a frame', () => {
  const filter = new PenPressure(0);
  filter.push(.5, 0);
  const values = Array.from({ length: 100 }, (_, i) => filter.push(i % 2 ? .52 : .48, (i + 1) * 4));
  assert.ok(Math.max(...values.slice(20)) - Math.min(...values.slice(20)) < .015);
  const response = filter.push(1, 416);
  assert.ok(response > .92, 'a deliberate pressure change reaches over 90% within 16 ms');
  assert.ok(values.every(p => p >= .48 && p <= .52));
});

test('coalesced sample collection retains pressure changes and the actual endpoint without duplicating it', () => {
  const a = { clientX: 1, clientY: 2, pressure: .2, timeStamp: 1 };
  const b = { clientX: 3, clientY: 4, pressure: .6, timeStamp: 2 };
  const event = { ...b, pressure: .8, getCoalescedEvents: () => [a, b] };
  assert.deepEqual(actualPointerSamples(event), [a, b, event]);
  const included = { ...b, getCoalescedEvents: () => [a, b] };
  assert.deepEqual(actualPointerSamples(included), [a, b]);
});

test('pressure joins cover a lift-off reversal and remain absent for uniform-width ink', () => {
  const stroke = { tool: 'pen', width: 2, sensitivity: 1, points: [{ x: .2, y: .2, pressure: .6 }, { x: .2, y: .3, pressure: .5 }, { x: .2, y: .29, pressure: .05 }] };
  const joins = pressureJoins(stroke, 16 / 9);
  assert.equal(joins.length, 3);
  assert.equal(joins[1].x, .2); assert.equal(joins[1].y, .3);
  assert.ok(Math.abs(joins[1].radius - 1) < 1e-6);
  assert.ok(joins.every(join => Number.isFinite(join.radius) && join.radius > 0));
  assert.deepEqual(pressureJoins({ ...stroke, sensitivity: 0 }, 16 / 9), []);
});

test('subpixel tablet backtracking does not turn a thin straight stroke into overlapping round joins', () => {
  const points = Array.from({ length: 80 }, (_, i) => ({ x: .2, y: .2 + (i * .04 + (i % 2 ? .03 : -.03)) / 900, pressure: .5 }));
  const joins = pressureJoins({ tool: 'pen', width: 1, sensitivity: 1, points }, 16 / 9);
  assert.equal(joins.length, 2, 'only the start and end need a round cap');
});

test('thin pressure outlines suppress width chatter without moving the centerline or changing saved samples', () => {
  const points = Array.from({ length: 401 }, (_, i) => ({ x: .2 + i * .02 / 1600, y: .5, pressure: i % 2 ? .65 : .35 }));
  const original = structuredClone(points);
  const outline = pressureOutline({ tool: 'pen', width: 1, sensitivity: 1, points }, 16 / 9);
  const upper = outline.filter(p => p.x > .2 + 2 / 1600 && p.x < .2 + 6 / 1600 && p.y < .5).map(p => (.5 - p.y) * 900);
  assert.ok(upper.length > 2);
  assert.ok(Math.max(...upper) - Math.min(...upper) < .05, 'width should not scallop with alternating sensor samples');
  assert.deepEqual(points, original);
});

test('a four-pixel handwritten corner retains brush coverage through its bend', () => {
  const points = Array.from({ length: 81 }, (_, i) => {
    const distance = i / 20;
    return { x: .2 + Math.max(0, distance - 2) / 1600, y: .2 + Math.min(2, distance) / 900, pressure: .5 };
  });
  const outline = pressureOutline({ tool: 'pen', width: 1, sensitivity: 1, points }, 16 / 9);
  const bend = { x: .2, y: .2 + 2 / 900 };
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i], b = outline[j];
    if ((a.y > bend.y) !== (b.y > bend.y) && bend.x < (b.x - a.x) * (bend.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  assert.ok(inside, 'endpoint cleanup must not cut across the actual handwritten corner');
});
test('smoothed pressure remains bounded and finishes at the last sensed pressure', () => {
  const filter = new PenSmoother('strong', 4 / 3, { x: .1, y: .1, pressure: .1 }, 0);
  const result = filter.push({ x: .2, y: .2, pressure: .9 }, 16);
  assert.ok(result.pressure > .1 && result.pressure < .9);
  assert.equal(filter.finish().at(-1).pressure, .9);
});
test('pressure changes stroke thickness, while zero sensitivity and mouse strokes stay uniform', () => {
  const points = Array.from({ length: 50 }, (_, i) => ({ x: .1 + .6 * i / 49, y: .5, pressure: .1 + .8 * i / 49 }));
  const stroke = { id: 'pressure_test', tool: 'pen', width: 12, color: '#e4594e', sensitivity: 1, points };
  const outline = pressureOutline(stroke, 16 / 9);
  assert.ok(outline.length > 4 && outline.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  const early = outline.filter(p => p.x > .15 && p.x < .25), late = outline.filter(p => p.x > .55 && p.x < .65);
  const thickness = samples => Math.max(...samples.map(p => p.y)) - Math.min(...samples.map(p => p.y));
  assert.ok(thickness(late) > thickness(early) * 1.5);
  assert.equal(pressureOutline({ ...stroke, sensitivity: 0 }, 16 / 9), null);
  assert.equal(pressureOutline({ ...stroke, points: points.map(({ x, y }) => ({ x, y })) }, 16 / 9), null);
});
test('the server preserves validated pressure samples and sensitivity', () => {
  const room = { slides: [{}], strokes: {}, history: {}, revision: 0 };
  const stroke = { id: 'pressure_sample', tool: 'pen', width: 4, color: '#e4594e', sensitivity: .6, points: [{ x: .1, y: .2, pressure: .3 }] };
  applyOperation(room, { type: 'stroke-start', slide: 0, stroke }, 'pen');
  applyOperation(room, { type: 'stroke-points', slide: 0, id: stroke.id, points: [{ x: .2, y: .3, pressure: .8 }] }, 'pen');
  assert.equal(room.strokes[0][0].sensitivity, .6); assert.equal(room.strokes[0][0].points[1].pressure, .8);
  assert.throws(() => applyOperation(room, { type: 'stroke-points', slide: 0, id: stroke.id, points: [{ x: .2, y: .3, pressure: 2 }] }, 'pen'));
});
test('pressure-sensitive ink exports as an editable filled freeform shape', async () => {
  const buffer = await demoDeck(), metadata = await inspectDeck(buffer);
  const stroke = { id: 'pressure_export', tool: 'pen', width: 9, color: '#e4594e', sensitivity: .8, points: [{ x: .1, y: .5, pressure: .1 }, { x: .4, y: .5, pressure: .9 }, { x: .7, y: .5, pressure: .3 }] };
  const exported = await JSZip.loadAsync(await exportDeck(buffer, metadata, { 0: [stroke] }));
  const xml = await exported.file(metadata.slides[0].part).async('string');
  assert.equal(XMLValidator.validate(xml), true);
  assert.match(xml, /fill="norm" stroke="0"/); assert.match(xml, /<a:close\/>/); assert.match(xml, /Inkstage pen/);
});
