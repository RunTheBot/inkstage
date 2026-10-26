import { memo, useId, useMemo } from 'react';
import { vectorGeometry } from './vectorInk';
import type { Point, Stroke } from './types';

// Room updates replace only the stroke being edited. Keep finished SVG path
// geometry so a live stroke doesn't force every slide annotation to be rebuilt
// at pointer-event frequency.
const geometryCache = new WeakMap<Stroke, Map<number, ReturnType<typeof vectorGeometry>>>();
function cachedGeometry(stroke: Stroke, aspect: number) {
  let byAspect = geometryCache.get(stroke);
  if (!byAspect) { byAspect = new Map(); geometryCache.set(stroke, byAspect); }
  let geometry = byAspect.get(aspect);
  if (!geometry) { geometry = vectorGeometry(stroke, aspect); byAspect.set(aspect, geometry); }
  return geometry;
}

// During a live gesture, discard samples that cannot change the visible line
// by even a fraction of a screen pixel. The original samples stay untouched in
// the room and are used for the finished, high-resolution vector.
function liveDisplayStroke(stroke: Stroke, aspect: number, screenWidth: number): Stroke {
  const points = stroke.points;
  if (points.length < 3 || screenWidth <= 0) return stroke;
  const toleranceSquared = 0.55 ** 2;
  const kept: Point[] = [points[0]];
  let anchorIndex = 0;
  // Bound each search to eight samples. Check distance from the whole segment,
  // not just the last retained point, so sharp turns and reversals survive.
  while (anchorIndex < points.length - 1) {
    const anchor = points[anchorIndex];
    const limit = Math.min(points.length - 1, anchorIndex + 8);
    let bestIndex = anchorIndex + 1;
    for (let candidateIndex = anchorIndex + 2; candidateIndex <= limit; candidateIndex++) {
      const end = points[candidateIndex];
      const dx = (end.x - anchor.x) * screenWidth;
      const dy = (end.y - anchor.y) * screenWidth / aspect;
      const lengthSquared = dx * dx + dy * dy;
      let canSkip = true;
      for (let i = anchorIndex + 1; i < candidateIndex; i++) {
        const point = points[i];
        const px = (point.x - anchor.x) * screenWidth;
        const py = (point.y - anchor.y) * screenWidth / aspect;
        const t = lengthSquared ? Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared)) : 0;
        const errorX = px - t * dx, errorY = py - t * dy;
        const pressureChange = point.pressure !== undefined && anchor.pressure !== undefined && Math.abs(point.pressure - anchor.pressure) >= 0.025;
        if (pressureChange || errorX * errorX + errorY * errorY > toleranceSquared) {
          canSkip = false;
          break;
        }
      }
      if (!canSkip) break;
      bestIndex = candidateIndex;
    }
    anchorIndex = bestIndex;
    kept.push(points[anchorIndex]);
  }
  return kept.length === points.length ? stroke : { ...stroke, points: kept };
}

function StrokeShape({ stroke, aspect, geometry, color = stroke.color }: { stroke: Stroke; aspect: number; geometry: ReturnType<typeof vectorGeometry>; color?: string }) {
  if (!geometry.filled && stroke.points.length === 1) return <circle cx={stroke.points[0].x * 1600} cy={stroke.points[0].y * 1600 / aspect} r={stroke.width / 2} fill={color} />;
  return <g><path d={geometry.path} fill={geometry.filled ? color : 'none'} stroke={geometry.filled ? 'none' : color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />{geometry.joins && <path d={geometry.joins} fill={color} />}</g>;
}

export const InkLayer = memo(function InkLayer({ strokes, aspect, liveId, screenWidth = 1600 }: { strokes: Stroke[]; aspect: number; liveId?: string; screenWidth?: number }) {
  const instance = useId().replaceAll(':', '');
  const geometry = useMemo(() => strokes.map(stroke => stroke.id === liveId
    ? vectorGeometry(liveDisplayStroke(stroke, aspect, screenWidth), aspect)
    : cachedGeometry(stroke, aspect)), [strokes, aspect, liveId, screenWidth]);
  const highlights = strokes.map((stroke, index) => ({ stroke, index })).filter(({ stroke }) => stroke.tool === 'highlighter');
  const colors = [...new Set(highlights.map(({ stroke }) => stroke.color))];
  const height = 1600 / aspect;
  return <svg className="ink-vectors" viewBox={`0 0 1600 ${1600 / aspect}`} aria-hidden="true">
    <defs>{colors.map((color, colorIndex) => <mask key={color} id={`${instance}-highlight-${colorIndex}`} x="0" y="0" width="1600" height={height} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" style={{ maskType: 'alpha' }}>
      {highlights.filter(({ stroke }) => stroke.color === color).map(({ stroke, index }) => <StrokeShape key={stroke.id} stroke={stroke} aspect={aspect} geometry={geometry[index]} color="white" />)}
    </mask>)}</defs>
    {colors.map((color, index) => <rect key={color} x="0" y="0" width="1600" height={height} fill={color} opacity=".3" mask={`url(#${instance}-highlight-${index})`} style={{ mixBlendMode: 'multiply' }} />)}
    {strokes.map((stroke, index) => stroke.tool === 'highlighter' ? null : <StrokeShape key={stroke.id} stroke={stroke} aspect={aspect} geometry={geometry[index]} />)}
  </svg>;
});
