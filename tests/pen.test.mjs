import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { XMLValidator } from 'fast-xml-parser';
import { PenSmoother } from '../src/smoothing.ts';
import { pressureOutline } from '../shared/pressure.mjs';
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
  assert.ok(jitter[3] < jitter[0] * .1, 'Maximum should remove substantially more jitter than Light');
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
