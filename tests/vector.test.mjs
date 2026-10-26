import test from 'node:test';
import assert from 'node:assert/strict';
import { vectorGeometry } from '../src/vectorInk.ts';
import { pdfTilePlacement, pdfTiles } from '../src/pdfTiles.ts';

function quadraticSamples(path) {
  const tokens = path.match(/[A-Za-z]|-?(?:\d*\.)?\d+/g);
  const result = [];
  let i = 0, command = '', point = { x: 0, y: 0 }, previousControl = point;
  const number = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) command = tokens[i++];
    if (command === 'Z') break;
    if (command === 'M') { point = { x: number(), y: number() }; previousControl = point; continue; }
    assert.ok(command === 'Q' || command === 'T');
    const control = command === 'Q' ? { x: number(), y: number() } : { x: 2 * point.x - previousControl.x, y: 2 * point.y - previousControl.y };
    const end = { x: number(), y: number() };
    for (const t of [.25, .5, .75]) result.push({
      x: (1 - t) ** 2 * point.x + 2 * t * (1 - t) * control.x + t * t * end.x,
      y: (1 - t) ** 2 * point.y + 2 * t * (1 - t) * control.y + t * t * end.y,
    });
    point = end; previousControl = control;
  }
  return result;
}

test('a long straight pressure stroke cannot develop ripples from SVG control rounding', () => {
  const dx = .0717, dy = .03653, step = Math.hypot(dx, dy);
  const points = Array.from({ length: 5000 }, (_, i) => ({ x: (100 + i * dx) / 1600, y: (100 + i * dy) / 900, pressure: .5 }));
  const geometry = vectorGeometry({ tool: 'pen', width: 1, sensitivity: 1, points }, 16 / 9);
  const samples = quadraticSamples(geometry.path).filter(p => {
    const along = ((p.x - 100) * dx + (p.y - 100) * dy) / step;
    return along > 10 && along < step * 4999 - 10;
  });
  assert.ok(samples.length > 1000);
  for (const point of samples) {
    const distance = Math.abs(((point.x - 100) * dy - (point.y - 100) * dx) / step);
    assert.ok(Math.abs(distance - .5) < .015, `a constant half-pixel radius became ${distance}`);
  }
});

test('normal ink retains exact slide coordinates in a resolution-independent SVG path', () => {
  const stroke = { tool: 'pen', width: 4, points: [{ x: .1, y: .2 }, { x: .5, y: .8 }] };
  assert.deepEqual(vectorGeometry(stroke, 16 / 9), { filled: false, path: 'M160,180 L800,720' });
  assert.equal(vectorGeometry(stroke, 4 / 3).path, 'M160,240 L800,960');
});

test('pressure-sensitive ink is a closed vector outline, using the same geometry as PPTX export', () => {
  const stroke = { tool: 'pen', width: 5, sensitivity: .8, points: [{ x: .1, y: .1, pressure: .1 }, { x: .4, y: .4, pressure: .9 }] };
  const path = vectorGeometry(stroke, 16 / 9);
  assert.equal(path.filled, true); assert.ok(path.path.startsWith('M')); assert.ok(path.path.endsWith(' Z'));
  assert.ok(!path.path.includes('NaN'));
});

test('4K PDF rendering preserves native pixels rather than downsampling the whole slide', () => {
  const slide = { left: 0, top: 0, width: 3840, height: 2160 };
  const tiles = pdfTiles(slide, slide, 3840, 1);
  assert.equal(tiles.reduce((pixels, tile) => pixels + tile.width * tile.height, 0), 3840 * 2160);
  assert.ok(tiles.every(t => t.width <= 2048 && t.height <= 2048));
});

test('600% zoom renders only the visible PDF section at native device density', () => {
  const slide = { left: -3200, top: -1800, width: 7680, height: 4320 };
  const clip = { left: 0, top: 0, width: 1280, height: 720 };
  const tiles = pdfTiles(slide, clip, 1280, 2);
  const pixels = tiles.reduce((sum, tile) => sum + tile.width * tile.height, 0);
  assert.equal(pixels, (1280 + 192) * 2 * (720 + 192) * 2);
  for (const tile of tiles) {
    assert.equal(tile.cssWidth * 6 * 2, tile.width);
    assert.ok(tile.x > 0 && tile.y > 0);
  }
  assert.deepEqual(pdfTiles({ ...slide, left: 10000 }, clip, 1280, 2), []);
});

test('retained PDF tiles track SVG slide coordinates during zoom before a fresh render finishes', () => {
  const viewport = { width: 2400, height: 1350 };
  const tile = { x: 400, y: 200, width: 1500, height: 1000 };
  const style = pdfTilePlacement(tile, viewport);
  assert.ok(Object.values(style).every(value => value.endsWith('%')));
  // A point in the old PDF tile must agree with the same normalized SVG point
  // at every new zoom, including the reported 149%, without rerendering it.
  const point = { x: .5, y: .6 };
  for (const scale of [.5, 1, 1.49, 2.44, 6]) {
    const slide = { left: -180, top: -230, width: 1200 * scale, height: 675 * scale };
    const tileLeft = slide.left + parseFloat(style.left) / 100 * slide.width;
    const tileTop = slide.top + parseFloat(style.top) / 100 * slide.height;
    const tileWidth = parseFloat(style.width) / 100 * slide.width;
    const tileHeight = parseFloat(style.height) / 100 * slide.height;
    const pdfX = tileLeft + (point.x * viewport.width - tile.x) / tile.width * tileWidth;
    const pdfY = tileTop + (point.y * viewport.height - tile.y) / tile.height * tileHeight;
    assert.ok(Math.abs(pdfX - (slide.left + point.x * slide.width)) < 1e-9);
    assert.ok(Math.abs(pdfY - (slide.top + point.y * slide.height)) < 1e-9);
  }
});

test('adjacent PDF tiles meet exactly after a resize or zoom', () => {
  const slide = { left: 0, top: 0, width: 3840, height: 2160 };
  const tiles = pdfTiles(slide, slide, 3840, 1);
  const first = pdfTilePlacement(tiles[0], slide), second = pdfTilePlacement(tiles[1], slide);
  assert.ok(Math.abs(parseFloat(first.left) + parseFloat(first.width) - parseFloat(second.left)) < 1e-9);
  assert.equal(parseFloat(first.top), parseFloat(second.top));
});
