import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownToLine, ArrowRight, Check, ChevronLeft, ChevronRight, CircleHelp, CircleX, Copy, Eraser, FileUp, Highlighter, Laptop, Link, LoaderCircle, Maximize2, Monitor, MonitorOff, MousePointer2, Pause, PenLine, Play, Plus, Redo2, RotateCcw, Settings2, Spline, ChevronDown, Tablet, Timer, Trash2, Undo2, Unplug, X, Minus, PanelRightClose, PanelRightOpen, MoveUpRight } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useRoom } from './useRoom';
import { SlideCanvas } from './SlideCanvas';
import { SlideViewport } from './SlideViewport';
import { smoothingPresets, type SmoothingPreset } from './smoothing';
import { StylusButtonSettings } from './StylusButtonSettings';
import { loadStylusBinding, type StylusBinding } from './stylus';
import { type Credentials, type Role, type Tool, type Room, type Operation, headers, sessionURL } from './types';
import './style.css';

const colors = ['#e4594e', '#f3b64b', '#4077d1', '#7c5bc5', '#294e3e', '#ffffff'];
const tools: { key: Tool; label: string; shortcut: string; icon: typeof PenLine }[] = [
  { key: 'pen', label: 'Pen', shortcut: 'P', icon: PenLine },
  { key: 'highlighter', label: 'Highlighter', shortcut: 'H', icon: Highlighter },
  { key: 'line', label: 'Straight line', shortcut: 'L', icon: Minus },
  { key: 'eraser', label: 'Eraser', shortcut: 'E', icon: Eraser },
  { key: 'laser', label: 'Laser pointer', shortcut: 'V', icon: MousePointer2 },
];
const parseCredentials = (): Credentials | null => {
  const params = new URLSearchParams(location.search), id = params.get('session'), role = params.get('view') as Role, token = location.hash.slice(1);
  return id && ['presenter', 'pen', 'audience'].includes(role) && token ? { id, role, token } : null;
};
function Logo({ compact = false }: { compact?: boolean }) {
  return <span className="brand"><span className="brand-symbol"><PenLine size={21} strokeWidth={2.2} /></span>{!compact && <span>inkstage<span className="brand-period">.</span></span>}</span>;
}
function IconButton({ label, children, onClick, active = false, disabled = false, className = '' }: { label: string; children: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean; className?: string }) {
  return <button type="button" className={`icon-button ${active ? 'active' : ''} ${className}`} aria-label={label} title={label} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Connection({ connected, latency }: { connected: boolean; latency: number | null }) {
  return <span className={`connection ${connected ? '' : 'offline'}`} title="Round-trip time to the laptop server"><span className="status-dot" />{connected ? 'Live sync' : 'Reconnecting'}{connected && latency !== null && <span className="latency">{latency} ms</span>}</span>;
}
async function jsonResponse(response: Response) {
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? 'Request failed.');
  return value;
}

function Welcome({ onOpen }: { onOpen: (c: Credentials) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [dragging, setDragging] = useState(false), [help, setHelp] = useState(false);
  const [step, setStep] = useState(0);
  const [recent, setRecent] = useState<{ name: string; credentials: Credentials } | null>(() => {
    try { return JSON.parse(localStorage.getItem('inkstage-recent') ?? 'null'); } catch { return null; }
  });
  useEffect(() => { if (!busy) return; const timer = setInterval(() => setStep(s => Math.min(s + 1, 2)), 6500); return () => clearInterval(timer); }, [busy]);
  async function importFile(file?: File) {
    if (!file) return;
    if (!/\.pptx$/i.test(file.name)) { setError('Choose a .pptx file. Older .ppt files need to be saved as .pptx first.'); return; }
    if (file.size > 80 * 1024 * 1024) { setError('Choose a file smaller than 80 MB.'); return; }
    const body = new FormData(); body.append('deck', file);
    await load('/api/sessions', body);
  }
  async function load(url: string, body?: FormData) {
    setBusy(true); setError(''); setStep(0);
    try { onOpen(await jsonResponse(await fetch(url, { method: 'POST', body }))); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="welcome">
    <header className="welcome-header"><Logo /><span className="local-pill"><span className="status-dot" />YOUR OWN STAGE</span><button className="text-button" onClick={() => setHelp(true)}><CircleHelp size={17} /> How it works</button></header>
    <main className="welcome-main">
      <div className="welcome-copy"><p className="eyebrow"><span /> FOR THE IDEAS BETWEEN THE SLIDES</p><h1>Your slides.<br />Your handwriting.<br /><em>One shared stage.</em></h1><p className="lede">Present with your notes in front of you and a pen in your hand. Your audience only sees what matters.</p>
        <div className={`import-zone ${dragging ? 'dragging' : ''} ${busy ? 'busy' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (!busy) void importFile(e.dataTransfer.files[0]); }}>
          {busy ? <><LoaderCircle className="spin" size={30} /><div><strong>{['Opening your PowerPoint…', 'Rendering your slides…', 'Preparing your stage…'][step]}</strong><span>Large decks can take a minute. Keep PowerPoint dialogs closed.</span></div></> : <><div className="file-icon"><FileUp size={25} /></div><div><strong>Bring your PowerPoint</strong><span>Drop a .pptx here, or choose a file</span></div><button className="primary-button" onClick={() => input.current?.click()}>Choose file <Plus size={17} /></button></>}
          <input ref={input} type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }} hidden />
        </div>
        {error && <div className="error-message" role="alert"><CircleX size={18} /><span>{error}</span></div>}
        <div className="welcome-actions"><button className="text-button sample-button" disabled={busy} onClick={() => void load('/api/sessions/demo')}>Try a practice deck <ArrowRight size={17} /></button><span>Windows + desktop PowerPoint for import</span></div>
        {recent && <button className="recent" onClick={async () => {
          try { await jsonResponse(await fetch(`/api/sessions/${recent.credentials.id}`, { headers: headers(recent.credentials) })); onOpen(recent.credentials); }
          catch { setRecent(null); localStorage.removeItem('inkstage-recent'); setError('That session is no longer available. Import the deck again.'); }
        }}><RotateCcw size={17} /><span>Resume <strong>{recent.name}</strong></span><ArrowRight size={17} /></button>}
      </div>
      <div className="welcome-art" aria-label="Preview of a slide with handwritten annotations">
        <div className="art-topline"><span>LESS MENU. MORE MOMENT.</span><span>01 / 04</span></div>
        <div className="art-slide"><span className="art-label">ROOM TO THINK</span><h2>Good ideas<br />need a little<br /><em>space.</em></h2><svg className="art-ink" viewBox="0 0 530 400" fill="none" aria-hidden="true"><path d="M50 306C128 285 230 285 292 296M60 316C133 304 225 302 267 310" stroke="#d5f291" strokeWidth="4" strokeLinecap="round" /><path d="M347 276C383 247 432 212 439 153M439 153L421 174M439 153L452 177" stroke="#d5f291" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg><span className="art-handwriting">like this.</span><span className="art-footer">A PRACTICE PRESENTATION</span></div>
        <div className="art-toolbar"><span className="art-tool-selected"><PenLine size={20} /></span><Highlighter size={20} /><Eraser size={20} /><i /><span className="art-color" /><span className="art-color blue" /><span className="art-color gold" /><span className="art-hold">Hold. Straighten. Keep going.</span></div>
        <div className="art-note"><span className="status-dot" /> Ink shared as you write</div>
      </div>
    </main>
    <footer className="welcome-footer"><div><Laptop /><span><strong>Your laptop</strong>Notes & slide controls</span></div><span className="device-line" /><div><Monitor /><span><strong>Your projector</strong>Just the slide & your ink</span></div><span className="device-line" /><div><Tablet /><span><strong>Your tablet</strong>A whole slide to write on</span></div><span className="footer-caption">THREE VIEWS.<br />ONE PRESENTATION.</span></footer>
    {help && <HelpModal close={() => setHelp(false)} />}
  </div>;
}

function HelpModal({ close }: { close: () => void }) {
  return <Modal title="A little setup. A lot more room." subtitle="Keep the server running on your laptop while you present." close={close}>
    <ol className="setup-steps"><li><strong>Open your PowerPoint</strong><p>Import a .pptx. The app uses desktop PowerPoint on Windows to render each slide and read its speaker notes.</p></li><li><strong>Give each screen its own view</strong><p>Open the audience window on your projector. Connect the tablet with the link or QR code in “Connect devices”. The laptop keeps the presenter view.</p></li><li><strong>Write naturally</strong><p>Pause for 0.55 seconds at the end of a pen stroke to straighten it. Lines snap near horizontal, vertical, and 45°. The eraser removes a whole stroke. Your stylus side or eraser button can erase too.</p></li><li><strong>Keep your annotations</strong><p>Export an annotated .pptx. The original content stays editable and ink becomes editable freeform shapes. The presentation uses static slides, so animations and videos do not play here.</p></li></ol>
    <div className="shortcut-box"><span><kbd>←</kbd><kbd>→</kbd> Slides</span><span><kbd>P</kbd> Pen</span><span><kbd>E</kbd> Erase</span><span><kbd>L</kbd> Line</span><span><kbd>B</kbd> Blackout</span><span><kbd>F</kbd> Fullscreen</span><span><kbd>Ctrl</kbd><kbd>Z</kbd> Undo</span></div>
  </Modal>;
}
function Modal({ title, subtitle, children, close }: { title: string; subtitle?: string; children: React.ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="modal" onCancel={close} onClick={e => { if (e.target === e.currentTarget) close(); }}><div className="modal-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><IconButton label="Close dialog" onClick={close}><X size={20} /></IconButton></div>{children}</dialog>;
}

function Devices({ credentials, counts, close }: { credentials: Credentials; counts: { pen: number; audience: number }; close: () => void }) {
  const [tokens, setTokens] = useState<Record<Role, string> | null>(null), [addresses, setAddresses] = useState<string[]>([]), [base, setBase] = useState(location.origin), [error, setError] = useState(''), [copied, setCopied] = useState('');
  const [role, setRole] = useState<'pen' | 'audience'>('pen');
  useEffect(() => {
    void Promise.all([fetch(`/api/sessions/${credentials.id}/links`, { headers: headers(credentials) }).then(jsonResponse), fetch('/api/network').then(jsonResponse)])
      .then(([links, network]) => { setTokens(links.tokens); const choices = Array.from(new Set<string>(location.protocol === 'https:' ? [location.origin, ...network.addresses] : [...network.addresses, location.origin])); setAddresses(choices); setBase(choices[0] ?? location.origin); }).catch(e => setError(e.message));
  }, [credentials]);
  const link = tokens ? sessionURL({ ...credentials, role, token: tokens[role] }, base) : '';
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(role); setTimeout(() => setCopied(''), 2000); }
    catch { setError('Clipboard access is unavailable. Select and copy the link below.'); }
  }
  return <Modal title="Give every screen its place." subtitle="Open the matching view on each device. Keep all devices on the same network." close={close}>
    <div className="device-tabs"><button className={role === 'pen' ? 'selected' : ''} onClick={() => setRole('pen')}><Tablet size={19} /> Tablet pen view <span>{counts.pen ? 'Connected' : 'Not connected'}</span></button><button className={role === 'audience' ? 'selected' : ''} onClick={() => setRole('audience')}><Monitor size={19} /> Audience view <span>{counts.audience ? 'Connected' : 'Not connected'}</span></button></div>
    {tokens ? <><div className="qr-area"><div className="qr-code"><QRCodeSVG value={link} size={170} bgColor="#ffffff" fgColor="#173e33" level="M" /></div><div><span className="eyebrow">{role === 'pen' ? 'SCAN ON YOUR TABLET' : 'OPEN ON THE AUDIENCE SCREEN'}</span><h3>{role === 'pen' ? 'Your slide. Full size.' : 'Just the presentation.'}</h3><p>{role === 'pen' ? 'Open the camera on your Android tablet and scan this code. Pen controls stay on the tablet.' : 'Open this view in a new window, move it to the projector, and press F for fullscreen.'}</p><button className="secondary-button" onClick={() => window.open(sessionURL({ ...credentials, role, token: tokens[role] }), '_blank', 'noopener,noreferrer')}>Open {role === 'pen' ? 'pen' : 'audience'} view <MoveUpRight size={16} /></button></div></div>
      <label className="field-label" htmlFor="network-address">Laptop network address</label><select id="network-address" value={base} onChange={e => setBase(e.target.value)}>{addresses.map(a => <option key={a}>{a}</option>)}</select>
      <div className="copy-field"><input aria-label={`${role} session link`} readOnly value={link} onFocus={e => e.target.select()} /><IconButton label="Copy link" onClick={() => void copy()}>{copied === role ? <Check size={19} /> : <Copy size={19} />}</IconButton></div>
      <p className="fine-print">If the tablet cannot connect, try another address above and allow Node.js through Windows Firewall on your private network. Session links grant access to this deck; share them only with your devices.</p>
    </> : <div className="modal-loading"><LoaderCircle className="spin" /> Preparing your links…</div>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </Modal>;
}

function InkToolbar({ tool, setTool, color, setColor, width, setWidth, snap, setSnap, touch, setTouch, smoothing, setSmoothing, pressure, setPressure, stylusBinding, setStylusBinding, send, slide, disabled, compact }: {
  tool: Tool; setTool: (tool: Tool) => void; color: string; setColor: (c: string) => void; width: number; setWidth: (n: number) => void;
  snap: boolean; setSnap: (v: boolean) => void; touch: boolean; setTouch: (v: boolean) => void;
  smoothing: SmoothingPreset; setSmoothing: (v: SmoothingPreset) => void; pressure: number; setPressure: (v: number) => void;
  stylusBinding: StylusBinding; setStylusBinding: (v: StylusBinding) => void;
  send: (op: Operation) => boolean; slide: number; disabled: boolean; compact?: boolean;
}) {
  const [settings, setSettings] = useState(false);
  const [penOptions, setPenOptions] = useState(false);
  const penMenu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (e: globalThis.PointerEvent) => { if (!penMenu.current?.contains(e.target as Node)) setPenOptions(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPenOptions(false); setSettings(false); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);
  return <div className={`ink-toolbar ${compact ? 'compact' : ''}`}>
    <div className="toolbar-group">{tools.map(({ key, label, shortcut, icon: Icon }) => key === 'pen' ? <div className="pen-control" ref={penMenu} key={key}>
      <IconButton label="Pen (P)" onClick={() => setTool('pen')} active={tool === 'pen'} disabled={disabled}><PenLine size={21} /></IconButton>
      <IconButton label="Smoothed pen (S)" onClick={() => setTool('smooth-pen')} active={tool === 'smooth-pen'} disabled={disabled}><Spline size={21} /></IconButton>
      <button className={`pen-menu-arrow ${penOptions ? 'selected' : ''}`} aria-label="Pen options" aria-expanded={penOptions} onClick={() => { setPenOptions(!penOptions); setSettings(false); }}><ChevronDown size={13} /></button>
      {penOptions && <div className="pen-submenu" role="dialog" aria-label="Pen options">
        <strong>Pen settings</strong>
        <span className="submenu-label">Smoothing</span><div className="smoothing-presets">{(Object.keys(smoothingPresets) as SmoothingPreset[]).map(preset => <button key={preset} aria-pressed={smoothing === preset} onClick={() => { setSmoothing(preset); setTool('smooth-pen'); }}>{smoothingPresets[preset].label}</button>)}</div>
        <label className="pressure-label">Pressure sensitivity<span>{pressure === 0 ? 'Off' : `${pressure}%`}</span><input className="tool-range" style={{ '--range-progress': `${pressure}%` } as React.CSSProperties} aria-label="Pressure sensitivity" type="range" min="0" max="100" step="5" value={pressure} onChange={e => setPressure(Number(e.target.value))} /></label>
        <small>Higher values vary the width more with stylus pressure. Set to 0 for an even stroke.</small>
      </div>}
    </div> : <IconButton key={key} label={`${label} (${shortcut})`} onClick={() => setTool(key)} active={tool === key} disabled={disabled}><Icon size={21} /></IconButton>)}</div><span className="toolbar-divider" />
    <div className="toolbar-group colors">{colors.map(c => <button className={`color-choice ${c === color ? 'selected' : ''}`} key={c} aria-label={`Ink ${c}`} aria-pressed={c === color} style={{ '--swatch': c } as React.CSSProperties} onClick={() => setColor(c)}><span />{c === color && <Check size={12} color={c === '#ffffff' ? '#173e33' : 'white'} />}</button>)}</div><span className="toolbar-divider" />
    <div className="toolbar-group history"><IconButton label="Undo ink (Ctrl+Z)" onClick={() => send({ type: 'undo', slide })} disabled={disabled}><Undo2 size={19} /></IconButton><IconButton label="Redo ink (Ctrl+Shift+Z)" onClick={() => send({ type: 'redo', slide })} disabled={disabled}><Redo2 size={19} /></IconButton></div>
    <div className="settings-wrap"><IconButton label="Tool settings" onClick={() => { setSettings(!settings); setPenOptions(false); }} active={settings}><Settings2 size={19} /></IconButton>{settings && <div className="pen-settings"><strong>Tool settings</strong><label>Stroke width <span>{width} px</span><input className="tool-range" style={{ '--range-progress': `${(width - 2) / 8 * 100}%` } as React.CSSProperties} type="range" min="2" max="10" step="1" value={width} onChange={e => setWidth(Number(e.target.value))} /></label><label className="switch-label"><span>Snap line angles<small>Near 0°, 45°, and 90°</small></span><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} /></label><label className="switch-label"><span>Draw with a finger<small>Turn off for palm rejection</small></span><input type="checkbox" checked={touch} onChange={e => setTouch(e.target.checked)} /></label><StylusButtonSettings binding={stylusBinding} onChange={setStylusBinding} /><p>Hold still for 0.55 s to straighten a pen stroke. Stylus side and eraser buttons erase strokes.</p><button className="danger-button" disabled={disabled} onClick={() => { send({ type: 'clear', slide }); setSettings(false); }}><Trash2 size={15} /> Clear ink on this slide</button><small>You can undo this.</small></div>}</div>
  </div>;
}

function Clock({ room, send }: { room: Room; send: (op: Operation) => boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer); }, []);
  const elapsed = room.timer.elapsed + (room.timer.running ? Math.max(0, now - (room.timer.startedAt ?? now)) : 0);
  const seconds = Math.floor(elapsed / 1000);
  return <div className="clock"><Timer size={17} /><span>{Math.floor(seconds / 60).toString().padStart(2, '0')}<i>:</i>{(seconds % 60).toString().padStart(2, '0')}</span><IconButton label={room.timer.running ? 'Pause timer' : 'Start timer'} onClick={() => send({ type: 'timer', action: room.timer.running ? 'pause' : 'start' })}>{room.timer.running ? <Pause size={15} /> : <Play size={15} />}</IconButton><IconButton label="Reset timer" onClick={() => send({ type: 'timer', action: 'reset' })}><RotateCcw size={14} /></IconButton></div>;
}

function Session({ credentials, home }: { credentials: Credentials; home: () => void }) {
  const { room, connected, counts, latency, error, setError, send, flush, laser } = useRoom(credentials);
  const [tool, setTool] = useState<Tool>('pen'), [color, setColor] = useState(colors[0]), [width, setWidth] = useState(4);
  const [smoothing, setSmoothing] = useState<SmoothingPreset>(() => { const stored = localStorage.getItem('inkstage-smoothing'); return stored && stored in smoothingPresets ? stored as SmoothingPreset : 'balanced'; });
  const [pressure, setPressure] = useState(() => { const stored = localStorage.getItem('inkstage-pressure'); return stored === null ? 60 : Math.max(0, Math.min(100, Number(stored) || 0)); });
  const [stylusBinding, setStylusBinding] = useState<StylusBinding>(loadStylusBinding);
  useEffect(() => { localStorage.setItem('inkstage-stylus-button', JSON.stringify(stylusBinding)); }, [stylusBinding]);
  const [viewportControls, setViewportControls] = useState<HTMLDivElement | null>(null);
  useEffect(() => { localStorage.setItem('inkstage-smoothing', smoothing); localStorage.setItem('inkstage-pressure', String(pressure)); }, [smoothing, pressure]);
  const [snap, setSnap] = useState(true), [touch, setTouch] = useState(credentials.role !== 'pen');
  const [devices, setDevices] = useState(false), [help, setHelp] = useState(false), [notes, setNotes] = useState(true), [exporting, setExporting] = useState(false), [exported, setExported] = useState(false);
  const audience = credentials.role === 'audience', tablet = credentials.role === 'pen';
  const navigate = (current: number) => { if (room && connected && !audience && current >= 0 && current < room.slides.length) send({ type: 'navigate', current }); };
  const fullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { setError('Fullscreen is unavailable in this browser. Use the browser fullscreen control.'); }
  };
  useEffect(() => {
    if (room && credentials.role === 'presenter') localStorage.setItem('inkstage-recent', JSON.stringify({ name: room.name, credentials }));
  }, [room?.name, credentials]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest('input,textarea,select,dialog,[role=dialog]')) return;
      if (e.key.toLowerCase() === 'f') { e.preventDefault(); void fullscreen(); return; }
      if (!room || audience || !connected) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); send({ type: e.shiftKey ? 'redo' : 'undo', slide: room.current }); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); send({ type: 'redo', slide: room.current }); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); navigate(room.current + 1); }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); navigate(room.current - 1); }
      if (e.key === 'Home') navigate(0);
      if (e.key === 'End') navigate(room.slides.length - 1);
      if (e.key.toLowerCase() === 'b' && !tablet) send({ type: 'blackout', value: !room.blackout });
      const selected = tools.find(t => t.shortcut.toLowerCase() === e.key.toLowerCase());
      if (selected) setTool(selected.key);
      if (e.key.toLowerCase() === 's') setTool('smooth-pen');
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  useEffect(() => {
    if (!tablet || !connected || !('wakeLock' in navigator)) return;
    let lock: { release: () => Promise<void> } | undefined, cancelled = false;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      (navigator as Navigator & { wakeLock: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock.request('screen').then(value => { if (cancelled) void value.release(); else lock = value; }).catch(() => {});
    };
    request(); document.addEventListener('visibilitychange', request);
    return () => { cancelled = true; void lock?.release(); document.removeEventListener('visibilitychange', request); };
  }, [tablet, connected]);
  async function exportFile() {
    if (!room) return;
    setExporting(true);
    try {
      await flush();
      const response = await fetch(`/api/sessions/${room.id}/export`, { headers: headers(credentials) });
      if (!response.ok) { await jsonResponse(response); return; }
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a'); a.href = url; a.download = `${room.name}-annotated.pptx`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      setExported(true); setTimeout(() => setExported(false), 3000);
    } catch (e) { setError((e as Error).message); }
    finally { setExporting(false); }
  }
  if (!room) return <div className="loading-screen"><span className="view-label">{tablet ? 'Pen view' : audience ? 'Audience view' : 'Presenter view'}</span><LoaderCircle className="spin" size={30} /><p>{error || 'Connecting…'}</p><button className="secondary-button" onClick={home}>Back to start</button></div>;
  const canvasProps = { room, slide: room.current, credentials, interactive: connected && !audience, tool, color, width, touch, snap, smoothing, pressure, stylusBinding, send, laser };
  if (audience) return <main className="audience-view" style={{ '--aspect': room.width / room.height } as React.CSSProperties} onDoubleClick={() => void fullscreen()} title="Press F or double-click for fullscreen">
    {!room.blackout && <SlideCanvas {...canvasProps} />}
    {!connected && <div className="audience-disconnected"><Unplug size={15} /> Connection lost. Waiting for the presenter.</div>}
  </main>;
  return <div className={`session ${tablet ? 'tablet-session' : ''} ${notes ? '' : 'notes-hidden'}`} style={{ '--aspect': room.width / room.height } as React.CSSProperties}>
    <header className="app-header"><span className="view-label">{tablet ? 'Pen view' : 'Presenter view'}</span><div className="header-actions"><Connection connected={connected} latency={latency} />{!tablet && <><button className="secondary-button connect-button" onClick={() => setDevices(true)}><Link size={16} /> Connect devices<span className="count-badge">{counts.pen + counts.audience}</span></button><button className="primary-button export-button" onClick={() => void exportFile()} disabled={exporting || !connected}>{exporting ? <LoaderCircle className="spin" size={17} /> : exported ? <Check size={17} /> : <ArrowDownToLine size={17} />}{exporting ? 'Exporting…' : exported ? 'Downloaded' : 'Export .pptx'}</button></>}<IconButton label="Fullscreen (F)" onClick={() => void fullscreen()}><Maximize2 size={18} /></IconButton></div></header>
    {error && <div className="session-error" role="alert"><Unplug size={17} /><span>{error}</span><IconButton label="Dismiss message" onClick={() => setError('')}><X size={16} /></IconButton></div>}
    {!connected && <div className="reconnect-banner"><LoaderCircle className="spin" size={15} /> Reconnecting to the laptop. Ink is paused until all views can sync.</div>}
    <div className="workspace">
      {!tablet && <aside className="slide-rail"><div className="rail-heading"><span>SLIDES</span><span>{room.slides.length.toString().padStart(2, '0')}</span></div><nav aria-label="Slides">{room.slides.map((slide, i) => <button key={i} className={`slide-thumbnail ${room.current === i ? 'current' : ''}`} onClick={() => navigate(i)} disabled={!connected} aria-label={`Slide ${i + 1}: ${slide.title}`} aria-current={room.current === i ? 'step' : undefined}><div><SlideCanvas room={room} slide={i} credentials={credentials} /></div><span className="thumbnail-caption"><span>{(i + 1).toString().padStart(2, '0')}</span><span>{slide.title}</span>{(room.strokes[i]?.length ?? 0) > 0 && <PenLine size={12} />}</span></button>)}</nav><button className="rail-help" onClick={() => setHelp(true)}><CircleHelp size={17} /> Tips & shortcuts</button></aside>}
      <main className="stage">
        {room.blackout && <span className="canvas-blackout-indicator">Audience blacked out</span>}
        <div className="stage-slide"><SlideViewport {...canvasProps} controlsTarget={viewportControls} /></div>
        <div className="toolbar-area"><div className="unified-toolbar" aria-label="Presentation tools">
          <div className="slide-navigation"><IconButton label="Previous slide" disabled={!connected || room.current === 0} onClick={() => navigate(room.current - 1)}><ChevronLeft size={25} /></IconButton><span>{String(room.current + 1).padStart(2, '0')}<i>/</i>{String(room.slides.length).padStart(2, '0')}</span><IconButton label="Next slide" disabled={!connected || room.current === room.slides.length - 1} onClick={() => navigate(room.current + 1)}><ChevronRight size={25} /></IconButton></div>
          <InkToolbar {...{ tool, setTool, color, setColor, width, setWidth, snap, setSnap, touch, setTouch, smoothing, setSmoothing, pressure, setPressure, stylusBinding, setStylusBinding, send }} slide={room.current} disabled={!connected} compact={tablet} />
          <div className="view-tools"><div ref={setViewportControls} className="viewport-tools-slot" />{!tablet && <div className="presenter-tools"><IconButton label="Black out audience screen (B)" active={room.blackout} disabled={!connected} onClick={() => send({ type: 'blackout', value: !room.blackout })}><MonitorOff size={18} /></IconButton><IconButton label={notes ? 'Hide speaker notes' : 'Show speaker notes'} onClick={() => setNotes(!notes)}>{notes ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}</IconButton></div>}</div>
        </div></div>
      </main>
      {!tablet && notes && <aside className="presenter-panel"><div className="panel-clock"><span className="eyebrow">YOUR TIME</span><Clock room={room} send={send} /></div><div className="notes-block"><div className="panel-section-heading"><h2>Speaker notes</h2><span>ONLY YOU</span></div><div className="notes-content">{room.slides[room.current].notes || <p className="empty-notes">No speaker notes on this slide. Add them in PowerPoint before importing.</p>}</div></div><div className="next-slide-block"><div className="panel-section-heading"><h2>Up next</h2><span>{room.current < room.slides.length - 1 ? `${room.current + 2} / ${room.slides.length}` : 'END'}</span></div>{room.current < room.slides.length - 1 ? <button className="next-slide-preview" onClick={() => navigate(room.current + 1)} disabled={!connected}><SlideCanvas room={room} slide={room.current + 1} credentials={credentials} /><span>{room.slides[room.current + 1].title}<ArrowRight size={15} /></span></button> : <div className="end-slide"><Check size={25} /><p>That’s your last slide.</p><span>Export the deck to keep your ink.</span></div>}</div><div className="device-summary"><div><Tablet size={17} /><span>Tablet pen</span><span className={counts.pen ? 'device-connected' : ''}>{counts.pen ? 'Connected' : 'Waiting'}</span></div><div><Monitor size={17} /><span>Audience</span><span className={counts.audience ? 'device-connected' : ''}>{counts.audience ? 'Connected' : 'Waiting'}</span></div><button className="text-button" onClick={() => setDevices(true)}>Manage connections <ArrowRight size={14} /></button></div></aside>}
    </div>
    {devices && <Devices credentials={credentials} counts={counts} close={() => setDevices(false)} />}{help && <HelpModal close={() => setHelp(false)} />}
  </div>;
}

function App() {
  const [credentials, setCredentials] = useState<Credentials | null>(parseCredentials);
  useEffect(() => { const pop = () => setCredentials(parseCredentials()); window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, []);
  function open(c: Credentials) { history.pushState(null, '', sessionURL(c)); setCredentials(c); }
  function home() { history.pushState(null, '', '/'); setCredentials(null); }
  return credentials ? <Session key={`${credentials.id}-${credentials.role}`} credentials={credentials} home={home} /> : <Welcome onOpen={open} />;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
