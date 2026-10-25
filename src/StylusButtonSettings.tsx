import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { ChevronRight, RotateCcw, X } from 'lucide-react';
import { bindingLabel, defaultStylusBinding, learnStylusBinding, stylusPresets, tipOnlySignal, type StylusBinding } from './stylus';

export function StylusButtonSettings({ binding, onChange }: { binding: StylusBinding; onChange: (binding: StylusBinding) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false), [listening, setListening] = useState(false), [message, setMessage] = useState(''), [reading, setReading] = useState('No button signal yet');
  const [lastPress, setLastPress] = useState('');
  const tipOnly = useRef(false);
  const pad = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  useEffect(() => {
    if (!listening) return;
    pad.current?.focus();
    const timer = setTimeout(() => { setListening(false); setMessage(tipOnly.current ? 'Only normal tip contact was received. No separate side-button signal reached this page, so no new binding was saved.' : 'No side-button signal detected. Try pressing it while hovering and while touching the test area. No new binding was saved.'); }, 15000);
    return () => clearTimeout(timer);
  }, [listening]);
  const close = () => { setListening(false); setOpen(false); };
  const observe = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.type === 'pointerdown') e.currentTarget.setPointerCapture(e.pointerId);
    const details = `${e.pointerType || 'unknown'} · button ${e.button} · buttons ${e.buttons} · pressure ${e.pressure.toFixed(3)}`;
    setReading(`${e.type}: ${details}`);
    if (e.type === 'pointerdown') setLastPress(`Last press: ${details}`);
    if (!listening) return;
    const learned = learnStylusBinding(e, binding.behavior);
    if (learned) { onChange(learned); setListening(false); setMessage(`Bound ${learned.device} button ${learned.mask} to erasing. The setting is saved on this browser.`); }
    else if (tipOnlySignal(e) && !tipOnly.current) { tipOnly.current = true; setMessage('Only normal tip contact received so far. A separate side-button signal has not appeared. Normal writing will not be bound to erasing.'); }
  };
  const preset = stylusPresets.find(p => p.kind === binding.kind && p.mask === binding.mask)?.id ?? 'custom';
  return <>
    <button className="stylus-binding-trigger" onClick={() => { setMessage(''); setOpen(true); }}><span>Stylus button<small>{bindingLabel(binding)}</small></span><ChevronRight size={16} /></button>
    <dialog ref={dialog} className="modal stylus-binding-dialog" onCancel={close} onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal-heading"><div><h2>Stylus button</h2><p>Choose which physical button activates the eraser.</p></div><button className="icon-button" aria-label="Close stylus settings" onClick={close}><X size={19} /></button></div>
      <label className="binding-field">Eraser button preset<select aria-label="Eraser button preset" value={preset} onChange={e => { const p = stylusPresets.find(item => item.id === e.target.value); if (p) { onChange({ ...binding, kind: p.kind, mask: p.mask }); setMessage('Binding saved.'); } }}>{stylusPresets.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}{preset === 'custom' && <option value="custom">Custom button</option>}</select></label>
      <div className="binding-fields"><label className="binding-field">Reported device<select aria-label="Stylus reported device" value={binding.device} onChange={e => onChange({ ...binding, device: e.target.value as StylusBinding['device'] })}><option value="pen">Pen</option><option value="mouse">Mouse</option><option value="any">Pen or mouse</option></select></label><label className="binding-field">Behavior<select aria-label="Stylus button behavior" value={binding.behavior} onChange={e => onChange({ ...binding, behavior: e.target.value as StylusBinding['behavior'] })}><option value="hold">Hold to erase</option><option value="toggle">Press to toggle eraser</option></select></label></div>
      <p className="binding-help">Learning needs a separate button signal. If Chrome reports the side button exactly like tip contact, rebinding cannot tell them apart. The test below shows button values and pressure.</p>
      <div className={`button-learn-pad ${listening ? 'listening' : ''}`} ref={pad} tabIndex={0} aria-label="Stylus button test area" onPointerDown={observe} onPointerMove={observe} onPointerUp={observe} onContextMenu={e => e.preventDefault()}>
        <strong>{listening ? 'Hold the side button and touch here' : 'Button test area'}</strong><span>No ink is added to your slides.</span>{lastPress && <output>{lastPress}</output>}<output>{reading}</output>
      </div>
      <div className="binding-learn-actions"><button className="primary-button" onClick={() => { setMessage(''); tipOnly.current = false; setListening(!listening); }}>{listening ? 'Cancel learning' : 'Learn button'}</button><button className="text-button" onClick={() => { onChange({ ...defaultStylusBinding }); setMessage('Default binding restored.'); setListening(false); }}><RotateCcw size={14} />Reset</button></div>
      {message && <p className="binding-result" role="status">{message}</p>}
      <details className="binding-advanced"><summary>Manual binding</summary><label className="binding-field">Button mask<input aria-label="Custom stylus button mask" type="number" min="2" max="254" step="2" value={binding.mask} onChange={e => { const mask = Number(e.target.value); if (Number.isInteger(mask) && mask >= 2 && mask <= 254 && !(mask & 1)) onChange({ ...binding, kind: 'pointer', mask }); }} /></label><small>Use the “buttons” reading without the tip-contact bit: side = 2, middle = 4, back = 8, forward = 16, eraser tip = 32.</small></details>
    </dialog>
  </>;
}
