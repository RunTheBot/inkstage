import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { XMLValidator } from 'fast-xml-parser';
import { demoDeck } from '../server/demo.mjs';
import { inspectDeck, exportDeck } from '../server/deck.mjs';
import { applyOperation, publicState } from '../server/state.mjs';

const stroke = () => ({ id: 'test_stroke_01', tool: 'pen', color: '#e4594e', width: 4, points: [{ x: .1, y: .2 }] });
const room = () => ({ id: 'room', name: 'test', slides: [{ title: 'test', notes: 'private notes', image: 'slide-1.png' }, { title: 'next', notes: '', image: 'slide-2.png' }], width: 1600, height: 900, current: 0, blackout: false, strokes: {}, history: {}, revision: 0, timer: { running: false, elapsed: 0, startedAt: null } });
test('streamed ink can be straightened, erased, undone and redone without losing points', () => {
  const r = room(), apply = m => applyOperation(r, { slide: 0, ...m }, 'pen');
  apply({ type: 'stroke-start', stroke: stroke() });
  apply({ type: 'stroke-points', id: stroke().id, points: [{ x: .2, y: .3 }, { x: .4, y: .4 }] });
  apply({ type: 'stroke-replace', id: stroke().id, points: [{ x: .1, y: .2 }, { x: .5, y: .2 }] });
  assert.equal(r.strokes[0][0].points.length, 2);
  apply({ type: 'erase', ids: [stroke().id] }); assert.equal(r.strokes[0].length, 0);
  apply({ type: 'undo' }); assert.equal(r.strokes[0][0].points[1].x, .5);
  apply({ type: 'redo' }); assert.equal(r.strokes[0].length, 0);
  apply({ type: 'undo' }); apply({ type: 'undo' }); assert.equal(r.strokes[0].length, 0);
  apply({ type: 'redo' }); assert.equal(r.strokes[0].length, 1);
  apply({ type: 'clear' }); apply({ type: 'undo' }); assert.equal(r.strokes[0].length, 1);
});
test('audience cannot write and audience/tablet snapshots exclude private notes', () => {
  const r = room();
  assert.throws(() => applyOperation(r, { type: 'navigate', current: 1 }, 'audience'));
  assert.throws(() => applyOperation(r, { type: 'blackout', value: true }, 'pen'));
  assert.equal(publicState(r, 'audience').slides[0].notes, '');
  assert.equal(publicState(r, 'pen').slides[0].notes, '');
  assert.equal(publicState(r, 'presenter').slides[0].notes, 'private notes');
});
test('switching a finger stroke or eraser gesture to a pinch leaves no ink or undo residue', () => {
  const r = room(), apply = m => applyOperation(r, { slide: 0, ...m }, 'pen');
  apply({ type: 'stroke-start', stroke: stroke() });
  apply({ type: 'stroke-start', stroke: { ...stroke(), id: 'finger_stroke_02' } });
  apply({ type: 'stroke-cancel', id: 'finger_stroke_02' });
  assert.deepEqual(r.strokes[0].map(s => s.id), [stroke().id]);
  assert.equal(r.history[0].undo.length, 1);
  apply({ type: 'erase', ids: [stroke().id], gesture: 'finger_eraser_01' });
  assert.equal(r.strokes[0].length, 0);
  apply({ type: 'stroke-cancel', id: 'finger_eraser_01' });
  assert.equal(r.strokes[0][0].id, stroke().id);
  assert.equal(r.history[0].undo.length, 1);
  apply({ type: 'undo' }); assert.equal(r.strokes[0].length, 0);
});
test('rejects invalid coordinates, slide indices, colors and widths', () => {
  for (const patch of [{ color: 'red' }, { width: Infinity }, { width: -1 }, { points: [{ x: 3, y: 0 }] }, { points: [{ x: NaN, y: 0 }] }]) {
    assert.throws(() => applyOperation(room(), { type: 'stroke-start', slide: 0, stroke: { ...stroke(), ...patch } }, 'pen'));
  }
  assert.throws(() => applyOperation(room(), { type: 'navigate', current: 99 }, 'presenter'));
  const r = room(); applyOperation(r, { type: 'navigate', current: 1 }, 'pen');
  assert.equal(r.current, 1); assert.equal(r.strokes.undefined, undefined);
});
test('PPTX round trip preserves original entries and adds valid editable vector ink', async () => {
  const buffer = await demoDeck(), metadata = await inspectDeck(buffer);
  assert.equal(metadata.slides.length, 4);
  assert.ok(metadata.slides[0].notes.includes('Pause'));
  const original = await JSZip.loadAsync(buffer);
  const out = await exportDeck(buffer, metadata, { 0: [{ ...stroke(), points: [{ x: .2, y: .3 }, { x: .7, y: .3 }] }], 2: [{ ...stroke(), id: 'highlighter', tool: 'highlighter' }] });
  const exported = await JSZip.loadAsync(out);
  for (const [name, part] of Object.entries(original.files)) {
    if (part.dir || [metadata.slides[0].part, metadata.slides[2].part].includes(name)) continue;
    assert.deepEqual(await exported.file(name).async('nodebuffer'), await part.async('nodebuffer'), name);
  }
  const source = await exported.file(metadata.slides[0].part).async('string');
  assert.equal(XMLValidator.validate(source), true);
  assert.match(source, /Inkstage pen/); assert.match(source, /<a:custGeom>/); assert.match(source, /E4594E/);
  assert.match(await exported.file(metadata.slides[2].part).async('string'), /alpha val="30000"/);
  assert.equal((await inspectDeck(out)).slides.length, 4);
});
test('PPTX order comes from relationship IDs, including when numeric id follows r:id', async () => {
  const zip = await JSZip.loadAsync(await demoDeck());
  let source = await zip.file('ppt/presentation.xml').async('string');
  source = source.replace(/<p:sldId id="([^"]+)" r:id="([^"]+)"\s*\/>/g, '<p:sldId r:id="$2" id="$1"/>');
  zip.file('ppt/presentation.xml', source);
  const metadata = await inspectDeck(await zip.generateAsync({ type: 'nodebuffer' }));
  assert.equal(metadata.slides.length, 4); assert.match(metadata.slides[0].title, /Good ideas/);
});
