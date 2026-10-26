import type { Stroke } from './types';
import { pressureJoins, pressureOutline } from '../shared/pressure.mjs';

const pointString = (x: number, y: number) => `${Number(x.toFixed(2))},${Number(y.toFixed(2))}`;

// Match perfect-freehand's recommended SVG renderer: quadratic curves through
// the outline's midpoints avoid the faceted edge made by joining every sample
// with a straight segment, especially when a slide is projected or zoomed in.
function outlinePath(points: { x: number; y: number }[], height: number) {
  if (points.length < 4) return points.map((point, i) => `${i ? 'L' : 'M'}${pointString(point.x * 1600, point.y * height)}`).join(' ') + ' Z';
  const first = points[0], second = points[1], third = points[2];
  let path = `M${pointString(first.x * 1600, first.y * height)} Q${pointString(second.x * 1600, second.y * height)} ${pointString((second.x + third.x) * 800, (second.y + third.y) * height / 2)} `;
  for (let i = 2; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    // Explicit controls prevent rounding error from accumulating through SVG's
    // reflected T controls and turning an otherwise smooth outline scalloped.
    path += `Q${pointString(a.x * 1600, a.y * height)} ${pointString((a.x + b.x) * 800, (a.y + b.y) * height / 2)} `;
  }
  return `${path}Z`;
}

function centerlinePath(points: { x: number; y: number }[], height: number) {
  if (points.length < 3) return points.map((point, i) => `${i ? 'L' : 'M'}${pointString(point.x * 1600, point.y * height)}`).join(' ');
  let path = `M${pointString(points[0].x * 1600, points[0].y * height)} `;
  for (let i = 1; i < points.length - 1; i++) {
    const control = points[i];
    const end = i === points.length - 2
      ? points[i + 1]
      : { x: (control.x + points[i + 1].x) / 2, y: (control.y + points[i + 1].y) / 2 };
    path += `Q${pointString(control.x * 1600, control.y * height)} ${pointString(end.x * 1600, end.y * height)} `;
  }
  return path;
}

export function vectorGeometry(stroke: Stroke, aspect: number) {
  const height = 1600 / aspect;
  const outline = pressureOutline(stroke, aspect);
  return {
    filled: !!outline,
    path: outline ? outlinePath(outline, height) : stroke.tool === 'line' ? stroke.points.map((p, i) => `${i ? 'L' : 'M'}${pointString(p.x * 1600, p.y * height)}`).join(' ') : centerlinePath(stroke.points, height),
    ...(outline ? { joins: pressureJoins(stroke, aspect).map(({ x, y, radius }) => `M${pointString(x * 1600 - radius, y * height)} a${radius},${radius} 0 1,0 ${radius * 2},0 a${radius},${radius} 0 1,0 ${-radius * 2},0 Z`).join(' ') } : {}),
  };
}
