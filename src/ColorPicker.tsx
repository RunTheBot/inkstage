import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { X } from 'lucide-react';
import { suppressDismissGesture } from './dismissGesture';
import './colorPicker.css';

type HSV = { h: number; s: number; v: number };

function rgb(hex: string): number[] {
  return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
}

function toHSV(hex: string): HSV {
  const [r, g, b] = rgb(hex).map(channel => channel / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const h = !d ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: max ? d / max : 0, v: max };
}

function toHex({ h, s, v }: HSV) {
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  const channels = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + channels.map(n => Math.round((n + m) * 255).toString(16).padStart(2, '0')).join('');
}

const grid = Array.from({ length: 8 }, (_, row) => Array.from({ length: 12 }, (_, col) => col === 0 ? toHex({ h: 0, s: 0, v: row / 7 }) : toHex({ h: (col - 1) * 360 / 11, s: row < 4 ? 1 : 1 - (row - 3) / 5, v: row < 4 ? .25 + row * .25 : 1 }))).flat();

type Props = {
  color: string;
  onChange: (color: string) => void;
  close: () => void;
};

export function ColorPicker({ color, onChange, close }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [hsv, setHSV] = useState(() => toHSV(color));
  const [hex, setHex] = useState(color);
  const [tab, setTab] = useState<'spectrum' | 'grid'>('spectrum');
  const selected = toHex(hsv), channels = rgb(selected);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const choose = (next: HSV) => {
    setHSV(next);
    setHex(toHex(next));
  };

  const chooseHex = (value: string) => {
    setHex(value);
    if (/^#?[0-9a-f]{6}$/i.test(value)) {
      setHSV(toHSV(value.startsWith('#') ? value : `#${value}`));
    }
  };

  const point = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const saturation = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const value = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    choose({ ...hsv, s: saturation, v: value });
  };

  return <dialog ref={dialog} className="ink-color-dialog" aria-labelledby="ink-color-title" onCancel={close} onPointerDown={e => {
    if (e.target !== e.currentTarget) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { suppressDismissGesture(e); close(); }
  }}>
    <header>
      <h2 id="ink-color-title">Color</h2>
      <button type="button" className="icon-button" aria-label="Close color picker" onClick={close}><X size={20} /></button>
    </header>
    <div className="color-picker-tabs" role="tablist" aria-label="Color selection">
      <button type="button" role="tab" aria-selected={tab === 'spectrum'} onClick={() => setTab('spectrum')}>Spectrum</button>
      <button type="button" role="tab" aria-selected={tab === 'grid'} onClick={() => setTab('grid')}>Grid</button>
    </div>
    {tab === 'spectrum'
      ? <div className="color-spectrum" aria-label="Saturation and brightness" style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); point(e); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) point(e); }} onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}><span style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: selected }} /></div>
      : <div className="color-grid" aria-label="Color grid">{grid.map((value, index) => <button type="button" key={index} aria-label={value} aria-pressed={value === selected} style={{ background: value }} onClick={() => chooseHex(value)} />)}</div>}
    <label className="color-hue-label">Hue<input className="color-hue" type="range" aria-label="Hue" min="0" max="359" value={hsv.h} onChange={e => choose({ ...hsv, h: Number(e.target.value) })} /></label>
    <div className="color-values">
      <span className="color-preview" style={{ background: selected }} aria-label={`Selected color ${selected}`} />
      <label className="color-hex">Hex<input aria-label="Hex color" value={hex} maxLength={7} spellCheck={false} onChange={e => chooseHex(e.target.value)} onBlur={() => setHex(selected)} /></label>
      {channels.map((value, index) => <label key={index}>{['R', 'G', 'B'][index]}<input aria-label={['Red', 'Green', 'Blue'][index]} type="number" min="0" max="255" value={value} onChange={e => {
        const next = [...channels];
        next[index] = Math.max(0, Math.min(255, Number(e.target.value)));
        chooseHex(`#${next.map(channel => channel.toString(16).padStart(2, '0')).join('')}`);
      }} /></label>)}
    </div>
    <footer>
      <button type="button" className="secondary-button" onClick={close}>Cancel</button>
      <button type="button" className="primary-button" onClick={() => { onChange(selected); close(); }}>Use color</button>
    </footer>
  </dialog>;
}
