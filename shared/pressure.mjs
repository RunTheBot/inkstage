import { getStroke } from 'perfect-freehand';

// The same outline is used by the canvas and PPTX exporter.
export function pressureOutline(stroke, aspect) {
  if (!(stroke.sensitivity > 0) || !stroke.points.some(p => p.pressure !== undefined)) return null;
  const height = 1600 / aspect;
  const samples = stroke.points.map(p => [p.x * 1600, p.y * height, p.pressure ?? .5]);
  return getStroke(samples, {
    size: stroke.width,
    thinning: stroke.sensitivity * .8,
    smoothing: .5,
    streamline: 0,
    simulatePressure: false,
    last: true,
  }).map(([x, y]) => ({ x: x / 1600, y: y / height }));
}
