import { useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { Check, ChevronDown, Eraser, Highlighter, Minus, MousePointer2, Palette, PenLine, Redo2, Settings2, Spline, Trash2, Undo2, X } from 'lucide-react';
import { BrushSizeControl } from './BrushSizeControl';
import { ColorPicker } from './ColorPicker';
import { StylusButtonSettings } from './StylusButtonSettings';
import { smoothingPresets, type SmoothingPreset } from './smoothing';
import type { StylusBinding } from './stylus';
import type { Operation, Tool } from './types';
import { useToolbarPopup } from './useToolbarPopup';

export const drawingTools: { key: Tool; label: string; shortcut: string; icon: typeof PenLine }[] = [
  { key: 'pen', label: 'Pen', shortcut: 'P', icon: PenLine },
  { key: 'smooth-pen', label: 'Smoothed pen', shortcut: 'S', icon: Spline },
  { key: 'highlighter', label: 'Highlighter', shortcut: 'H', icon: Highlighter },
  { key: 'line', label: 'Straight line', shortcut: 'L', icon: Minus },
  { key: 'eraser', label: 'Eraser', shortcut: 'E', icon: Eraser },
  { key: 'laser', label: 'Laser pointer', shortcut: 'V', icon: MousePointer2 },
];
const defaultColors = ['#e4594e', '#f3b64b', '#4077d1', '#7c5bc5', '#294e3e', '#ffffff'];
export function loadPalette(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('inkstage-palette') ?? 'null');
    if (Array.isArray(saved) && saved.length === defaultColors.length && saved.every(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))) return saved;
  } catch { /* Use the initial palette if storage is unavailable. */ }
  return [...defaultColors];
}

type Popup = 'brush' | 'settings' | 'colors' | null;
type Props = {
  tool: Tool; setTool: (tool: Tool) => void; panning: boolean;
  color: string; setColor: (color: string) => void;
  width: number; setWidth: (width: number) => void; eraserWidth: number; setEraserWidth: (width: number) => void;
  snap: boolean; setSnap: (value: boolean) => void; touch: boolean; setTouch: (value: boolean) => void;
  smoothing: SmoothingPreset; setSmoothing: (value: SmoothingPreset) => void;
  pressure: number; setPressure: (value: number) => void; pressureDeadzone: number; setPressureDeadzone: (value: number) => void;
  stylusBinding: StylusBinding; setStylusBinding: (value: StylusBinding) => void;
  send: (operation: Operation) => boolean; slide: number; disabled: boolean;
};

export function InkToolbar({ tool, setTool, panning, color, setColor, width, setWidth, eraserWidth, setEraserWidth, snap, setSnap, touch, setTouch, smoothing, setSmoothing, pressure, setPressure, pressureDeadzone, setPressureDeadzone, stylusBinding, setStylusBinding, send, slide, disabled }: Props) {
  const [popup, setPopup] = useState<Popup>(null);
  const panel = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [colorPicker, setColorPicker] = useState(false);
  const [swatches, setSwatches] = useState(loadPalette);
  const [selectedSlot, setSelectedSlot] = useState(() => Math.max(0, loadPalette().indexOf(color)));
  const close = () => setPopup(null);
  useToolbarPopup(popup !== null, close, panel, trigger, popup);
  const open = (name: Popup, event: MouseEvent<HTMLButtonElement>) => {
    trigger.current = event.currentTarget;
    setPopup(previous => previous === name ? null : name);
  };
  const editColor = () => { close(); setColorPicker(true); };
  const chooseColor = (index: number) => {
    if (index === selectedSlot) editColor();
    else { setSelectedSlot(index); setColor(swatches[index]); close(); }
  };
  const saveColor = (next: string) => {
    const updated = swatches.map((value, index) => index === selectedSlot ? next : value);
    setSwatches(updated); setColor(next);
    try { localStorage.setItem('inkstage-palette', JSON.stringify(updated)); } catch { /* Keep the palette for this session. */ }
  };
  const swatch = (value: string, index: number) => <button type="button" className={`color-choice ${index === selectedSlot ? 'selected' : ''}`} key={index} title={index === selectedSlot ? 'Edit selected color' : `Use ${value}`} aria-label={index === selectedSlot ? `Edit color preset ${index + 1}, current ${value}` : `Ink ${value}`} aria-pressed={index === selectedSlot} style={{ '--swatch': value } as CSSProperties} onClick={() => chooseColor(index)}><span />{index === selectedSlot && <Check size={12} color={value.toLowerCase() === '#ffffff' ? '#173e33' : 'white'} />}</button>;
  const erasing = tool === 'eraser', highlighting = tool === 'highlighter';
  const brushLabel = drawingTools.find(item => item.key === tool)?.label ?? 'Pen';
  const activeWidth = erasing ? eraserWidth : highlighting ? width * 5 : width;
  const quickWidths = erasing ? [16, 32, 52] : [1, 2, 4];
  const popupTitle = popup === 'settings' ? 'Tool settings' : popup === 'colors' ? 'Colors' : brushLabel;

  return <div className="ink-toolbar">
    <div className="toolbar-group drawing-tools" role="group" aria-label="Drawing tools">{drawingTools.map(({ key, label, shortcut, icon: Icon }) => {
      const selected = !panning && tool === key, options = key !== 'laser';
      return <button type="button" key={key} className={`icon-button drawing-tool ${selected ? 'active' : ''}`} data-toolbar-popup={options ? 'brush' : undefined} aria-label={`${label} (${shortcut})${options ? ', tap again for options' : ''}`} title={`${label} (${shortcut})${options ? ' · tap again for options' : ''}`} aria-pressed={selected} aria-haspopup={options ? 'dialog' : undefined} aria-expanded={options ? selected && popup === 'brush' : undefined} disabled={disabled} onClick={event => {
        if (selected && options) open('brush', event);
        else { close(); setTool(key); }
      }}><Icon size={22} />{options && <ChevronDown className="tool-options-mark" size={10} />}</button>;
    })}</div>
    <span className="toolbar-divider" />
    <div className="toolbar-group history" role="group" aria-label="Ink history">
      <button type="button" className="icon-button" aria-label="Undo ink (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled={disabled} onClick={() => { close(); send({ type: 'undo', slide }); }}><Undo2 size={21} /></button>
      <button type="button" className="icon-button" aria-label="Redo ink (Ctrl+Shift+Z)" title="Redo (Ctrl+Shift+Z)" disabled={disabled} onClick={() => { close(); send({ type: 'redo', slide }); }}><Redo2 size={21} /></button>
    </div>
    <button type="button" className="icon-button menu-trigger" data-toolbar-popup="settings" aria-label="Tool settings" title="Tool settings" aria-haspopup="dialog" aria-expanded={popup === 'settings'} onClick={event => open('settings', event)}><Settings2 size={21} /></button>

    {!panning && tool !== 'laser' && <div className="ink-context-strip" aria-label={`${brushLabel} quick controls`}>
      <div className="context-widths" role="group" aria-label={erasing ? 'Quick eraser sizes' : 'Quick stroke widths'}>{quickWidths.map((value, index) => <button type="button" key={value} title={`${erasing ? value : highlighting ? value * 5 : value} px`} aria-label={`${erasing ? value : highlighting ? value * 5 : value} pixel ${erasing ? 'eraser' : highlighting ? 'highlighter width' : 'pen width'}`} aria-pressed={(erasing ? eraserWidth : width) === value} onClick={() => erasing ? setEraserWidth(value) : setWidth(value)}>{erasing ? <span className="eraser-size-dot" style={{ width: 8 + index * 7, height: 8 + index * 7 }} /> : <span className="quick-width-line" style={{ height: highlighting ? 4 + index * 4 : value }} />}</button>)}</div>
      <button type="button" className="context-width-value" data-toolbar-popup="brush" aria-label={`${brushLabel} options, width ${activeWidth} pixels`} title={`${brushLabel} options`} aria-haspopup="dialog" aria-expanded={popup === 'brush'} onClick={event => open('brush', event)}>{activeWidth}<span>px</span><ChevronDown size={12} /></button>
      {!erasing && <><span className="toolbar-divider" /><div className="context-colors" role="group" aria-label="Ink colors">{swatches.map(swatch)}</div><button type="button" className="context-palette-button" aria-label="All colors" title="All colors" aria-haspopup="dialog" aria-expanded={popup === 'colors'} onClick={event => open('colors', event)}><Palette size={19} /></button></>}
    </div>}

    {popup && <div className={`toolbar-popup ${popup === 'settings' ? 'settings-popup' : ''}`} ref={panel} role="dialog" aria-label={popupTitle}>
      <div className="toolbar-popup-heading"><strong>{popupTitle}</strong><button type="button" className="popup-close" aria-label={`Close ${popupTitle.toLowerCase()}`} onClick={() => { close(); trigger.current?.focus(); }}><X size={17} /></button></div>
      {popup === 'brush' && <>
        <BrushSizeControl label={tool === 'line' ? 'Line width' : undefined} value={activeWidth} onChange={erasing ? setEraserWidth : highlighting ? value => setWidth(value / 5) : setWidth} color={color} eraser={erasing} highlighter={highlighting} />
        {tool === 'smooth-pen' && <div className="smoothing-control"><span className="submenu-label">Smoothing</span><div className="smoothing-presets">{(Object.keys(smoothingPresets) as SmoothingPreset[]).map(value => <button type="button" key={value} aria-pressed={smoothing === value} onClick={() => setSmoothing(value)}>{smoothingPresets[value].label}</button>)}</div></div>}
        {(tool === 'pen' || tool === 'smooth-pen') && <details className="pressure-options"><summary><span>Pressure</span><span>{pressure === 0 ? 'Off' : `${pressure}%`}</span><ChevronDown size={13} /></summary><div>
          <label className="pressure-label">Sensitivity<span>{pressure === 0 ? 'Off' : `${pressure}%`}</span><input className="tool-range" style={{ '--range-progress': `${pressure}%` } as CSSProperties} aria-label="Pressure sensitivity" type="range" min="0" max="100" step="5" value={pressure} onChange={event => setPressure(Number(event.target.value))} /></label>
          <label className="pressure-label">Deadzone<span>{pressureDeadzone === 0 ? 'Off' : `${pressureDeadzone}%`}</span><input className="tool-range" style={{ '--range-progress': `${pressureDeadzone / 15 * 100}%` } as CSSProperties} aria-label="Pressure deadzone" type="range" min="0" max="15" step="1" value={pressureDeadzone} onChange={event => setPressureDeadzone(Number(event.target.value))} /></label>
          <small>Ignore light contact before starting a stroke.</small>
        </div></details>}
        {tool === 'line' && <label className="toolbar-switch"><span>Snap angles</span><input type="checkbox" checked={snap} onChange={event => setSnap(event.target.checked)} /></label>}
      </>}
      {popup === 'colors' && <><div className="popup-colors">{swatches.map(swatch)}</div><button type="button" className="custom-color-button" onClick={editColor}><Palette size={17} />Edit selected color</button></>}
      {popup === 'settings' && <>
        <label className="toolbar-switch"><span>Snap line angles<small>0°, 45°, 90°</small></span><input type="checkbox" checked={snap} onChange={event => setSnap(event.target.checked)} /></label>
        <label className="toolbar-switch"><span>Finger drawing<small>Turn off for palm rejection</small></span><input type="checkbox" checked={touch} onChange={event => setTouch(event.target.checked)} /></label>
        <StylusButtonSettings binding={stylusBinding} onChange={setStylusBinding} />
        <button type="button" className="clear-slide-button" disabled={disabled} onClick={() => { send({ type: 'clear', slide }); close(); }}><Trash2 size={16} />Clear slide ink<span>Undoable</span></button>
      </>}
    </div>}
    {colorPicker && <ColorPicker color={color} onChange={saveColor} close={() => setColorPicker(false)} />}
  </div>;
}
