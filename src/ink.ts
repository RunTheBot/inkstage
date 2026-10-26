import type { Point, Stroke } from './types';

// Coordinates are normalized to the actual slide, never to the letterbox.
export function snapLine(start: Point, end: Point, aspect: number, enabled = true): Point {
  if (!enabled) return end;
  const dx = (end.x - start.x) * aspect, dy = end.y - start.y;
  const angle = Math.atan2(dy, dx);
  const snapped = Math.round(angle / (Math.PI / 4)) * Math.PI / 4;
  if (Math.abs(angle - snapped) > 8 * Math.PI / 180) return end;
  const length = Math.hypot(dx, dy);
  return { ...end, x: Math.max(0, Math.min(1, start.x + Math.cos(snapped) * length / aspect)), y: Math.max(0, Math.min(1, start.y + Math.sin(snapped) * length)) };
}
function segmentDistance(p: Point, a: Point, b: Point, aspect: number) {
  const px = p.x * aspect, ax = a.x * aspect, bx = b.x * aspect;
  const dx = bx - ax, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, p.y - a.y - t * dy);
}
export function hitStrokes(strokes: Stroke[], point: Point, previous: Point | null, aspect: number, radius: number) {
  return strokes.filter(s => s.points.some((p, i) => {
    const a = i ? s.points[i - 1] : p;
    const tolerance = radius + s.width / 3200 * aspect;
    // Check both paths, including segments that cross between pointer events.
    if (segmentDistance(point, a, p, aspect) <= tolerance) return true;
    if (!previous) return false;
    if (segmentDistance(p, previous, point, aspect) <= tolerance || segmentDistance(a, previous, point, aspect) <= tolerance) return true;
    const cross = (x: Point, y: Point, z: Point) => (y.x - x.x) * (z.y - x.y) - (y.y - x.y) * (z.x - x.x);
    return cross(previous, point, a) * cross(previous, point, p) < 0 && cross(a, p, previous) * cross(a, p, point) < 0;
  })).map(s => s.id);
}

export function hitStrokesAlongPath(strokes: Stroke[], samples: Point[], previous: Point | null, aspect: number, radius: number) {
  const hits = new Set<string>();
  let remaining = strokes;
  for (const point of samples) {
    const ids = hitStrokes(remaining, point, previous, aspect, radius);
    if (ids.length) {
      for (const id of ids) hits.add(id);
      remaining = remaining.filter(stroke => !hits.has(stroke.id));
    }
    previous = point;
    if (!remaining.length) break;
  }
  return [...hits];
}

