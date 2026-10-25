import { lazy, Suspense, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, Ref } from 'react';
import { hitStrokes, snapLine } from './ink';
import { slidePoint } from './viewport';
import { InkLayer } from './InkLayer';
import { PenSmoother, type SmoothingPreset } from './smoothing';
import { defaultStylusBinding, hasDrawingContact, pointerSignal, StylusEraser, type StylusBinding } from './stylus';
import { type Room, type Credentials, type Tool, type Point, type Operation, type Stroke, imageURL, uid } from './types';

type Props = {
  room: Room; slide: number; credentials: Credentials; interactive?: boolean;
  tool?: Tool; color?: string; width?: number; touch?: boolean; snap?: boolean;
  send?: (operation: Operation) => boolean; laser?: { slide: number; point: Point | null; at: number } | null;
  inputRef?: Ref<SlideCanvasHandle>; renderScale?: number;
  smoothing?: SmoothingPreset;
  pressure?: number;
  stylusBinding?: StylusBinding;
  preview?: boolean; renderX?: number; renderY?: number;
};
export type SlideCanvasHandle = { cancelTouchStroke: () => void; isDrawing: () => boolean; isPenActive: () => boolean };
const empty: Stroke[] = [];
const PdfSlide = lazy(() => import('./PdfSlide').then(module => ({ default: module.PdfSlide })));
export function SlideCanvas({ room, slide, credentials, interactive = false, tool = 'pen', color = '#e4594e', width = 4, touch = true, snap = true, send, laser, inputRef, renderScale = 1, smoothing = 'balanced', pressure = 60, stylusBinding = defaultStylusBinding, preview = false, renderX = 0, renderY = 0 }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const active = useRef<{ id: string; pointer: number; pointerType: string; start: Point; last: Point; slide: number; mode: Tool; modifier: boolean; moved: boolean; line: boolean; anchor: Point; smoother?: PenSmoother } | null>(null);
  const eraserButton = useRef(new StylusEraser(stylusBinding));
  const [hardwareErasing, setHardwareErasing] = useState(false);
  const deferredTouch = useRef<{ pointer: number; timer: ReturnType<typeof setTimeout>; begin: () => void; moves: (() => void)[] } | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [laserVisible, setLaserVisible] = useState(false);
  const ink = room.strokes[slide] ?? empty;
  const inkRef = useRef(ink); inkRef.current = ink;
  const aspect = room.width / room.height;
  useEffect(() => {
    setLaserVisible(!!laser?.point);
    const timer = setTimeout(() => setLaserVisible(false), 1200);
    return () => clearTimeout(timer);
  }, [laser]);
  useEffect(() => () => { clearTimeout(hold.current); if (deferredTouch.current) clearTimeout(deferredTouch.current.timer); }, []);
  useEffect(() => { active.current = null; clearTimeout(hold.current); if (deferredTouch.current) clearTimeout(deferredTouch.current.timer); deferredTouch.current = null; }, [slide, interactive]);
  useEffect(() => { eraserButton.current = new StylusEraser(stylusBinding); setHardwareErasing(false); }, [stylusBinding, tool, slide]);
  useEffect(() => { const reset = () => { eraserButton.current.reset(); setHardwareErasing(false); }; window.addEventListener('blur', reset); return () => window.removeEventListener('blur', reset); }, []);
  useImperativeHandle(inputRef, () => ({
    isDrawing: () => !!active.current || !!deferredTouch.current,
    isPenActive: () => active.current?.pointerType === 'pen',
    cancelTouchStroke: () => {
      if (deferredTouch.current) { clearTimeout(deferredTouch.current.timer); deferredTouch.current = null; }
      const a = active.current;
      if (!a || a.pointerType !== 'touch') return;
      clearTimeout(hold.current); active.current = null;
      if (a.mode === 'laser') send?.({ type: 'laser', slide: a.slide, point: null });
      else send?.({ type: 'stroke-cancel', slide: a.slide, id: a.id });
    },
  }));
  const point = (e: ReactPointerEvent): Point => {
    const r = container.current!.getBoundingClientRect();
    return { ...slidePoint(e.clientX, e.clientY, r), ...(e.pointerType === 'pen' ? { pressure: e.pressure } : {}) };
  };
  const straighten = () => {
    const a = active.current;
    if (!a || !['pen', 'smooth-pen', 'highlighter'].includes(a.mode)) return;
    a.line = true;
    send?.({ type: 'stroke-replace', slide: a.slide, id: a.id, points: [a.start, snapLine(a.start, a.last, aspect, snap)], ...(a.mode === 'pen' || a.mode === 'smooth-pen' ? { sensitivity: 0 } : {}) });
  };
  const armHold = (p: Point) => {
    clearTimeout(hold.current);
    if (!active.current || !['pen', 'smooth-pen', 'highlighter'].includes(active.current.mode) || active.current.line) return;
    active.current.anchor = p;
    hold.current = setTimeout(straighten, 550);
  };
  const erase = (p: Point, previous: Point | null) => {
    const radius = 16 / (container.current?.getBoundingClientRect().height || 900);
    const ids = hitStrokes(inkRef.current, p, previous, aspect, radius);
    if (ids.length) send?.({ type: 'erase', slide, ids, gesture: active.current?.pointerType === 'touch' ? active.current.id : undefined });
  };
  const readButton = (e: ReactPointerEvent<HTMLDivElement>) => {
    const physical = eraserButton.current.update(pointerSignal(e));
    const pressed = physical;
    setHardwareErasing(pressed); return pressed;
  };
  const startStroke = (p: Point, pointer: number, pointerType: string, time: number, modifier: boolean) => {
    const id = uid(), mode = modifier ? 'eraser' : tool;
    active.current = { id, pointer, pointerType, start: p, last: p, anchor: p, slide, mode, modifier, moved: false, line: mode === 'line', smoother: mode === 'smooth-pen' ? new PenSmoother(smoothing, aspect, p, time) : undefined };
    if (mode === 'eraser') erase(p, null);
    else if (mode === 'laser') send?.({ type: 'laser', slide, point: p });
    else {
      const sent = send?.({ type: 'stroke-start', slide, stroke: { id, tool: mode === 'smooth-pen' ? 'pen' : mode, color, width: mode === 'highlighter' ? width * 5 : width, points: [p], sensitivity: pointerType === 'pen' && ['pen', 'smooth-pen'].includes(mode) ? pressure / 100 : 0 } });
      if (!sent) { active.current = null; return; }
      armHold(p);
    }
  };
  const finishStroke = (cancel = false) => {
    const a = active.current; if (!a) return;
    clearTimeout(hold.current);
    if (a.smoother && !a.line && !cancel) {
      const tail = a.smoother.finish();
      if (tail.length) send?.({ type: 'stroke-points', slide: a.slide, id: a.id, points: tail });
    }
    if (a.mode === 'laser') send?.({ type: 'laser', slide: a.slide, point: null });
    else if (a.mode !== 'eraser') send?.({ type: cancel ? 'stroke-cancel' : 'stroke-end', slide: a.slide, id: a.id });
    active.current = null;
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    const modifier = e.pointerType === 'touch' ? false : readButton(e);
    if (!interactive || active.current || deferredTouch.current || (e.pointerType === 'touch' && !touch)) return;
    if (!hasDrawingContact(e) || (e.pointerType === 'mouse' && e.button !== 0 && !modifier)) return;
    e.preventDefault();
    if (e.nativeEvent.isTrusted) e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    const pointer = e.pointerId, pointerType = e.pointerType, time = e.timeStamp;
    const begin = () => startStroke(p, pointer, pointerType, time, modifier);
    if (pointerType === 'touch') {
      // Briefly arbitrate finger drawing versus a second finger for navigation.
      const timer = setTimeout(commitTouch, 120);
      deferredTouch.current = { pointer, timer, begin, moves: [] };
    } else begin();
  };
  const commitTouch = () => {
    const pending = deferredTouch.current; if (!pending) return;
    clearTimeout(pending.timer); deferredTouch.current = null;
    pending.begin(); pending.moves.forEach(move => move());
  };
  const updateStroke = (p: Point, points: Point[], times: number[]) => {
    const a = active.current; if (!a) return;
    const previous = a.last; a.last = p;
    if (p.x !== previous.x || p.y !== previous.y) a.moved = true;
    if (a.mode === 'eraser') erase(p, previous);
    else if (a.mode === 'laser') send?.({ type: 'laser', slide: a.slide, point: p });
    else if (a.line) send?.({ type: 'stroke-replace', slide: a.slide, id: a.id, points: [a.start, snapLine(a.start, p, aspect, snap)], ...(a.mode === 'pen' || a.mode === 'smooth-pen' ? { sensitivity: 0 } : {}) });
    else {
      const rect = container.current!.getBoundingClientRect();
      const output = a.smoother ? points.map((sample, i) => a.smoother!.push(sample, times[i])) : points;
      send?.({ type: 'stroke-points', slide: a.slide, id: a.id, points: output });
      if (Math.hypot((p.x - a.anchor.x) * rect.width, (p.y - a.anchor.y) * rect.height) > 5) armHold(p);
    }
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const modifier = e.pointerType === 'touch' ? false : readButton(e);
    if (e.pointerType === 'pen' && active.current?.pointer === e.pointerId && !hasDrawingContact(e)) { finishStroke(); return; }
    if (!active.current && !deferredTouch.current && e.pointerType === 'pen' && hasDrawingContact(e)) { down(e); return; }
    if (e.pointerId !== (active.current?.pointer ?? deferredTouch.current?.pointer)) return;
    e.preventDefault();
    const p = point(e), rect = container.current!.getBoundingClientRect();
    if (active.current && active.current.modifier !== modifier) {
      const a = active.current;
      // A side button held before touching is distinguishable only on the
      // first move. Remove that provisional dot without adding an undo step.
      const discardTip = stylusBinding.kind === 's-pen' && modifier && !a.moved && a.mode !== 'eraser' && a.mode !== 'laser';
      const first = a.start;
      finishStroke(discardTip); startStroke(p, e.pointerId, e.pointerType, e.timeStamp, modifier);
      if (discardTip) erase(p, first);
      return;
    }
    const native = e.nativeEvent;
    const events = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    const points = events.length ? events.slice(-256).map(v => ({ ...slidePoint(v.clientX, v.clientY, rect), ...(e.pointerType === 'pen' ? { pressure: v.pressure } : {}) })) : [p];
    const times = events.length ? events.slice(-256).map(v => v.timeStamp) : [e.timeStamp];
    if (deferredTouch.current) deferredTouch.current.moves.push(() => updateStroke(p, points, times));
    else updateStroke(p, points, times);
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch' && e.type !== 'lostpointercapture') readButton(e);
    if (deferredTouch.current?.pointer === e.pointerId) commitTouch();
    const a = active.current; if (!a || e.pointerId !== a.pointer) return;
    if (e.type === 'pointerup') {
      const last = point(e);
      // Lifting the pen can deliver a final position without a move event.
      // Preserve contact pressure instead of tapering to the hover value.
      if (a.pointerType === 'pen') last.pressure = a.last.pressure;
      if (last.x !== a.last.x || last.y !== a.last.y) updateStroke(last, [last], [e.timeStamp]);
    }
    finishStroke();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return <div className={`slide-canvas ${interactive ? 'can-write' : ''} tool-${hardwareErasing ? 'eraser' : tool}`} style={{ aspectRatio: aspect }} ref={container}>
    <img src={imageURL(room, slide, credentials)} alt={room.slides[slide].title} draggable={false} />
    {!preview && <Suspense fallback={null}><PdfSlide credentials={credentials} slide={slide} scale={renderScale} x={renderX} y={renderY} /></Suspense>}
    <InkLayer strokes={ink} aspect={aspect} />
    <div className="ink-input" role="img" aria-label={interactive ? 'Slide drawing surface' : 'Slide annotations'}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onContextMenu={e => e.preventDefault()} />
    {laserVisible && laser?.slide === slide && laser.point && <span className="laser-dot" style={{ left: `${laser.point.x * 100}%`, top: `${laser.point.y * 100}%` }} />}
  </div>;
}
