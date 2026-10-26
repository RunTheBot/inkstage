import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { flattenInkOutline } from '../server/inkGeometry.mjs';
import { pressureOutline } from '../shared/pressure.mjs';
import { demoDeck } from '../server/demo.mjs';
import { inspectDeck, exportDeck } from '../server/deck.mjs';

const area = ring => Math.abs(ring.reduce((sum, p, i) => {
  const next = ring[(i + 1) % ring.length];
  return sum + p[0] * next[1] - next[0] * p[1];
}, 0)) / 2;
const contains = (ring, x, y) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};

test('overlapping pressure outline loops become solid coverage instead of an even-odd gap', () => {
  const points = [[.1, .1], [.4, .1], [.4, .4], [.1, .4], [.1, .1], [.25, .1], [.55, .1], [.55, .4], [.25, .4], [.25, .1], [.1, .1]].map(([x, y]) => ({ x, y }));
  const faces = flattenInkOutline(points);
  assert.equal(faces.length, 1);
  assert.equal(faces[0].length, 1);
  assert.ok(Math.abs(area(faces[0][0]) - .135) < 1e-12, 'the overlapping area is painted once, rather than subtracted');
});

const roundStroke = () => ({
  id: 'round_pressure_01', tool: 'pen', width: 6, sensitivity: 1, color: '#ff0000',
  points: Array.from({ length: 241 }, (_, i) => ({ x: .5 + .1 * Math.cos(i * Math.PI / 120), y: .5 + .1 * 16 / 9 * Math.sin(i * Math.PI / 120), pressure: .5 })),
});

test('flattening preserves the intentional hole inside circular handwriting', () => {
  const faces = flattenInkOutline(pressureOutline(roundStroke(), 16 / 9));
  assert.equal(faces.length, 1);
  assert.ok(contains(faces[0][0], .5, .5));
  assert.ok(faces[0].slice(1).some(ring => contains(ring, .5, .5)), 'the center remains inside a hole');
  assert.ok(faces[0].every((ring, i) => !i || area(faces[0][0]) > area(ring)));
});

test('PowerPoint exports an outer contour and its hole in the same editable filled path', async () => {
  const original = await demoDeck(), metadata = await inspectDeck(original);
  const zip = await JSZip.loadAsync(await exportDeck(original, metadata, { 0: [roundStroke()] }));
  const xml = await zip.file(metadata.slides[0].part).async('string');
  const filled = [...xml.matchAll(/<a:path\b[^>]*fill="norm"[^>]*>([\s\S]*?)<\/a:path>/g)].map(match => match[1]);
  assert.ok(filled.some(path => {
    const starts = (path.match(/<a:moveTo>/g) ?? []).length;
    return starts >= 2 && (path.match(/<a:close\/>/g) ?? []).length === starts;
  }));
  assert.equal((xml.match(/name="Inkstage pen"/g) ?? []).length, 1, 'the stroke remains one editable PowerPoint shape');
});
