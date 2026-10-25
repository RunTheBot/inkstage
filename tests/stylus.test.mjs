import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultStylusBinding, hasDrawingContact, isEraserSignal, learnStylusBinding, StylusEraser, tipOnlySignal, validBinding } from '../src/stylus.ts';

test('automatic erasing responds to side-button presses and releases during an existing stroke', () => {
  const eraser = new StylusEraser(defaultStylusBinding);
  assert.equal(eraser.update({ pointerType: 'pen', button: 0, buttons: 1 }), false);
  assert.equal(eraser.update({ pointerType: 'pen', button: 2, buttons: 3 }), true);
  assert.equal(eraser.update({ pointerType: 'pen', button: -1, buttons: 3 }), true);
  assert.equal(eraser.update({ pointerType: 'pen', button: 2, buttons: 1 }), false);
  assert.equal(eraser.update({ pointerType: 'pen', button: 5, buttons: 32 }), true);
});
test('alternate middle and back buttons can be bound, including mouse-emulated pens', () => {
  const middle = { kind: 'pointer', mask: 4, device: 'pen', behavior: 'hold' };
  assert.equal(isEraserSignal(middle, { pointerType: 'pen', buttons: 5 }), true);
  assert.equal(isEraserSignal(middle, { pointerType: 'pen', buttons: 1 }), false);
  assert.equal(isEraserSignal(middle, { pointerType: 'mouse', buttons: 4 }), false);
  assert.equal(isEraserSignal({ ...middle, device: 'mouse' }, { pointerType: 'mouse', buttons: 4 }), true);
  assert.equal(isEraserSignal({ ...middle, device: 'any', mask: 8 }, { pointerType: 'pen', buttons: 9 }), true);
});
test('learning ignores normal tip contact and captures the actual extra button bit', () => {
  assert.equal(learnStylusBinding({ pointerType: 'pen', buttons: 1 }, 'hold'), null);
  assert.equal(learnStylusBinding({ pointerType: 'touch', buttons: 1 }, 'hold'), null);
  assert.deepEqual(learnStylusBinding({ pointerType: 'pen', buttons: 5 }, 'hold'), { kind: 'pointer', mask: 4, device: 'pen', behavior: 'hold' });
  assert.deepEqual(learnStylusBinding({ pointerType: 'mouse', buttons: 8 }, 'toggle'), { kind: 'pointer', mask: 8, device: 'mouse', behavior: 'toggle' });
});
test('toggle mode changes once per press, including a hover press followed by contact', () => {
  const eraser = new StylusEraser({ ...defaultStylusBinding, behavior: 'toggle' });
  assert.equal(eraser.update({ pointerType: 'pen', buttons: 2 }), true);
  assert.equal(eraser.update({ pointerType: 'pen', buttons: 3 }), true);
  assert.equal(eraser.update({ pointerType: 'pen', buttons: 1 }), true);
  assert.equal(eraser.update({ pointerType: 'pen', buttons: 3 }), false);
  eraser.update({ pointerType: 'pen', buttons: 1 }); eraser.update({ pointerType: 'pen', buttons: 3 });
  eraser.reset();
  assert.equal(eraser.update({ pointerType: 'pen', buttons: 1 }), false);
});
test('a hovering side button does not count as pen contact', () => {
  assert.equal(hasDrawingContact({ pointerType: 'pen', buttons: 2, pressure: 0 }), false);
  assert.equal(hasDrawingContact({ pointerType: 'pen', buttons: 2, pressure: .3 }), true);
  assert.equal(hasDrawingContact({ pointerType: 'pen', buttons: 1, pressure: 0 }), true);
  assert.equal(hasDrawingContact({ pointerType: 'pen', buttons: 32, pressure: .4 }), true);
});
test('disabled and malformed bindings do not map ordinary writing to erasing', () => {
  assert.equal(isEraserSignal({ ...defaultStylusBinding, kind: 'disabled' }, { pointerType: 'pen', buttons: 32 }), false);
  assert.equal(validBinding({ ...defaultStylusBinding, kind: 'pointer', mask: 1 }), false);
  assert.equal(validBinding({ ...defaultStylusBinding, device: 'touch' }), false);
  assert.equal(validBinding({ ...defaultStylusBinding, kind: 'pointer', mask: 4 }), true);
});
test('tip-only streams remain ordinary writing and cannot be learned as a side button', () => {
  const eraser = new StylusEraser(defaultStylusBinding);
  const stream = [
    { pointerType: 'pen', button: 0, buttons: 1, pressure: .5 },
    { pointerType: 'pen', button: -1, buttons: 1, pressure: .7 },
    { pointerType: 'pen', button: 0, buttons: 0, pressure: 0 },
  ];
  for (const signal of stream) { assert.equal(learnStylusBinding(signal, 'hold'), null); assert.equal(eraser.update(signal), false); }
  assert.equal(tipOnlySignal(stream[0]), true);
  assert.equal(tipOnlySignal({ pointerType: 'mouse', button: 0, buttons: 1 }), true);
  assert.equal(tipOnlySignal({ pointerType: 'pen', button: 2, buttons: 3 }), false);
});
