import { useEffect, useId, useState, type CSSProperties } from 'react';

export function BrushSizeControl({ value, onChange, color = '#173e33', eraser = false, highlighter = false, label: customLabel }: {
  value: number; onChange: (value: number) => void; color?: string; eraser?: boolean; highlighter?: boolean; label?: string;
}) {
  const id = useId();
  const min = eraser ? 12 : highlighter ? 5 : 1, max = eraser || highlighter ? 60 : 12;
  const step = eraser ? 2 : highlighter ? 2.5 : .5;
  const label = customLabel ?? (eraser ? 'Eraser size' : highlighter ? 'Highlighter width' : 'Pen width');
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const number = draft.trim() ? Number(draft) : NaN;
    const next = Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number / step) * step)) : value;
    setDraft(String(next)); onChange(next);
  };
  return <div className="brush-size-control">
    <div className="brush-size-heading"><label htmlFor={id}>{label}</label><div className="brush-size-value"><input type="number" inputMode="decimal" aria-label={`${label} value`} min={min} max={max} step={step} value={draft} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><span>px</span></div></div>
    <div className="brush-size-preview" aria-hidden="true">
      <svg viewBox="0 0 224 44">{eraser
        ? <circle cx="112" cy="22" r={Math.min(19, value / 2)} fill="none" stroke="#657b57" strokeWidth="1.5" />
        : <path d="M16 28 C52 28 64 12 104 17 S158 31 208 16" fill="none" stroke={color} opacity={highlighter ? .45 : 1} strokeWidth={highlighter ? value / 3 : value} strokeLinecap={highlighter ? 'butt' : 'round'} />}</svg>
    </div>
    <input id={id} className="tool-range" aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} style={{ '--range-progress': `${(value - min) / (max - min) * 100}%` } as CSSProperties} />
    <div className="brush-size-scale" aria-hidden="true"><span>{eraser ? 'Small' : 'Thin'}</span><span>{eraser ? 'Large' : 'Thick'}</span></div>
  </div>;
}
