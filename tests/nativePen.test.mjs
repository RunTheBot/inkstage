import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { pointerSignal, StylusEraser } from '../src/stylus.ts';

const script = await readFile(new URL('../android/app/src/main/assets/native-input.js', import.meta.url), 'utf8');
function harness() {
  const events = [], listeners = new Map(), windowListeners = new Map();
  const target = { isConnected: true, closest: () => target, dispatchEvent: event => events.push(event) };
  let hit = target;
  const window = { addEventListener: (name, fn) => windowListeners.set(name, fn) };
  const document = { hidden: false, addEventListener: (name, fn) => listeners.set(name, fn), elementFromPoint: () => hit };
  class PointerEvent { constructor(type, data) { this.type = type; Object.assign(this, data); } }
  vm.runInNewContext(script, { window, document, PointerEvent, performance: { now: () => 100 }, innerWidth: 1280, innerHeight: 720 });
  return { events, listeners, windowListeners, target, accept: window.InkstageNativePen.accept, miss: () => { hit = null; } };
}
const packet = (action, buttons, contact, points = [{ x: 800, y: 600, pressure: .6, time: 1000 }]) => ({ action, buttons, raw: buttons & 2 ? 32 : 0, contact, width: 2560, height: 1440, id: 0, points });

test('native contact with the S Pen button held erases immediately, even with the old Samsung preset selected', () => {
  const h = harness(), controller = new StylusEraser({ kind: 's-pen', mask: 0, device: 'pen', behavior: 'hold' });
  h.accept([packet('down', 3, true)]);
  const down = h.events[0];
  assert.equal(down.type, 'pointerdown'); assert.equal(down.buttons, 3); assert.equal(down.inkstageRawButtons, 32);
  assert.equal(controller.update(pointerSignal({ ...down, nativeEvent: down })), true);
  h.accept([packet('move', 1, true)]);
  const move = h.events.at(-1);
  assert.equal(controller.update(pointerSignal({ ...move, nativeEvent: move })), false);
});

test('native move batches retain hardware samples, pressure, timestamps and viewport coordinates', () => {
  const h = harness(); h.accept([packet('down', 1, true)]);
  h.accept([packet('move', 1, true, [
    { x: 800, y: 600, pressure: .2, time: 1010 },
    { x: 900, y: 700, pressure: .5, time: 1014 },
    { x: 1000, y: 800, pressure: .8, time: 1018 },
  ])]);
  const move = h.events.at(-1), samples = move.getCoalescedEvents();
  assert.equal(samples.length, 3); assert.equal(move.clientX, 500); assert.equal(move.clientY, 400);
  assert.equal(samples[0].pressure, .2); assert.equal(move.pressure, .8); assert.equal(move.timeStamp, 1018);
});

test('native strokes finish outside the surface and cancel when the app loses focus', () => {
  const h = harness(); h.accept([packet('down', 1, true)]); h.miss();
  h.accept([packet('up', 0, false)]); assert.equal(h.events.at(-1).type, 'pointerup');
  const second = harness(); second.accept([packet('down', 1, true)]); second.windowListeners.get('blur')();
  assert.equal(second.events.at(-1).type, 'pointercancel'); assert.equal(second.events.at(-1).buttons, 0);
});

test('native pen delivery suppresses duplicate WebView ink but preserves touch and toolbar input', () => {
  const h = harness(); const listener = h.listeners.get('pointerdown');
  const event = pointerType => ({ pointerType, target: h.target, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } });
  const duplicate = event('pen'); listener(duplicate); assert.equal(duplicate.stopped, true);
  const touch = event('touch'); listener(touch); assert.equal(touch.stopped, undefined);
  const native = { ...event('pen'), inkstageNative: true }; listener(native); assert.equal(native.stopped, undefined);
  const toolbar = { ...event('pen'), target: { closest: () => null } }; listener(toolbar); assert.equal(toolbar.stopped, undefined);
});
