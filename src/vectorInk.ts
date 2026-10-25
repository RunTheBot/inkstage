import type { Stroke } from './types';
import { pressureOutline } from '../shared/pressure.mjs';

export function vectorGeometry(stroke: Stroke, aspect: number) {
  const height = 1600 / aspect;
  const outline = pressureOutline(stroke, aspect);
  const points = outline ?? stroke.points;
  return {
    filled: !!outline,
    path: points.map((p, i) => `${i ? 'L' : 'M'}${p.x * 1600},${p.y * height}`).join(' ') + (outline ? ' Z' : ''),
  };
}
