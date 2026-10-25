import test from 'node:test';
import assert from 'node:assert/strict';
import { fitSlide, fitView, constrainView, zoomAt, pinchView, slidePoint } from '../src/viewport.ts';

test('zoom preserves the slide coordinate underneath the cursor', () => {
  const before = { scale: 1.5, x: 80, y: -30 }, anchor = { x: 200, y: 100 };
  const after = zoomAt(before, 3, anchor);
  assert.equal((anchor.x - before.x) / before.scale, (anchor.x - after.x) / after.scale);
  assert.equal((anchor.y - before.y) / before.scale, (anchor.y - after.y) / after.scale);
  assert.equal(zoomAt(before, 100, anchor).scale, 6);
  assert.equal(zoomAt(before, .01, anchor).scale, .5);
});
test('pinching changes scale and moves the same page content with the finger midpoint', () => {
  const before = { ...fitView }, a = { x: -100, y: -50 }, b = { x: 100, y: 50 };
  const after = pinchView(before, a, b, { x: -170, y: -60 }, { x: 230, y: 140 });
  assert.equal(after.scale, 2); assert.equal(after.x, 30); assert.equal(after.y, 40);
  const pan = pinchView(before, a, b, { x: -80, y: -20 }, { x: 120, y: 80 });
  assert.equal(pan.scale, 1); assert.equal(pan.x, 20); assert.equal(pan.y, 30);
});
test('bounds prevent losing the page and fit resets panning for any aspect ratio', () => {
  for (const aspect of [16 / 9, 4 / 3, 9 / 16]) {
    const viewport = { width: 1000, height: 700 }, slide = fitSlide(viewport, aspect);
    assert.ok(slide.width <= viewport.width && slide.height <= viewport.height);
    const zoomed = constrainView({ scale: 3, x: 100000, y: -100000 }, viewport, slide);
    assert.ok(zoomed.x <= (slide.width * 3 - viewport.width) / 2);
    assert.ok(zoomed.y >= -(slide.height * 3 - viewport.height) / 2);
    const fitted = constrainView({ scale: 1, x: 100, y: -500 }, viewport, slide);
    assert.equal(Math.abs(fitted.x), 0); assert.equal(Math.abs(fitted.y), 0);
  }
});
test('ink coordinates stay registered to the original slide after zoom and pan', () => {
  const normal = slidePoint(350, 400, { left: 100, top: 100, width: 1000, height: 600 });
  const zoomed = slidePoint(200, 500, { left: -300, top: -100, width: 2000, height: 1200 });
  assert.deepEqual(normal, { x: .25, y: .5 }); assert.deepEqual(zoomed, normal);
});
