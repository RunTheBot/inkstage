import { memo, useId, useMemo } from 'react';
import { vectorGeometry } from './vectorInk';
import type { Stroke } from './types';

function StrokeShape({ stroke, aspect, geometry, color = stroke.color }: { stroke: Stroke; aspect: number; geometry: ReturnType<typeof vectorGeometry>; color?: string }) {
  if (!geometry.filled && stroke.points.length === 1) return <circle cx={stroke.points[0].x * 1600} cy={stroke.points[0].y * 1600 / aspect} r={stroke.width / 2} fill={color} />;
  return <path d={geometry.path} fill={geometry.filled ? color : 'none'} stroke={geometry.filled ? 'none' : color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />;
}

export const InkLayer = memo(function InkLayer({ strokes, aspect }: { strokes: Stroke[]; aspect: number }) {
  const instance = useId().replaceAll(':', '');
  const geometry = useMemo(() => strokes.map(stroke => vectorGeometry(stroke, aspect)), [strokes, aspect]);
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
