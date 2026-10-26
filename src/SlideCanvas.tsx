import { lazy, Suspense, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, Ref } from 'react';
import { hitStrokesAlongPath, snapLine } from './ink';
import { slidePoint } from './viewport';
import { InkLayer } from './InkLayer';
import { PenSmoother, type SmoothingPreset } from './smoothing';
import { actualPointerSamples, defaultPressureDeadzone, normalizePressure, PenPressure } from './pressureInput';
import { defaultStylusBinding, hasDrawingContact, pointerSignal, StylusEraser, type StylusBinding } from './stylus';
import { type Room, type Credentials, type Tool, type Point, type Operation, type Stroke, imageURL, uid } from './types';

type Props = {
  room: Room;
  slide: number;
  credentials: Credentials;
  interactive?: boolean;
  tool?: Tool;
  color?: string;
  width?: number;
  eraserWidth?: number;
  touch?: boolean;
  snap?: boolean;
  send?: (operation: Operation) => boolean;
  laser?: { slide: number; point: Point | null; at: number } | null;
  inputRef?: Ref<SlideCanvasHandle>;
  renderScale?: number;
  smoothing?: SmoothingPreset;
  pressure?: number;
  pressureDeadzone?: number;
  stylusBinding?: StylusBinding;
  preview?: boolean;
  renderX?: number;
  renderY?: number;
};

export type SlideCanvasHandle = { cancelTouchStroke: () => void; isDrawing: () => boolean; isPenActive: () => boolean };
const empty: Stroke[] = [];
const straightenableTools: Tool[] = ['pen', 'smooth-pen', 'highlighter'];
const PdfSlide = lazy(() => import('./PdfSlide').then(module => ({ default: module.PdfSlide })));
export function SlideCanvas({ room, slide, credentials, interactive = false, tool = 'pen', color = '#e4594e', width = 4, eraserWidth = 32, touch = true, snap = true, send, laser, inputRef, renderScale = 1, smoothing = 'balanced', pressure = 60, pressureDeadzone = defaultPressureDeadzone, stylusBinding = defaultStylusBinding, preview = false, renderX = 0, renderY = 0 }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const active = useRef<{ id: string; pointer: number; pointerType: string; start: Point; last: Point; slide: number; mode: Tool; modifier: boolean; line: boolean; anchor: Point; smoother?: PenSmoother; pressureInput?: PenPressure } | null>(null);
  const pendingPen = useRef<{ pointer: number; modifier: boolean } | null>(null);
  const eraserButton = useRef(new StylusEraser(stylusBinding));
  const [hardwareErasing, setHardwareErasing] = useState(false);
  const [liveStrokeId, setLiveStrokeId] = useState<string | null>(null);
  const deferredTouch = useRef<{ pointer: number; timer: ReturnType<typeof setTimeout>; begin: () => void; moves: (() => void)[] } | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [laserVisible, setLaserVisible] = useState(false);
  const eraserCursor = useRef<HTMLSpanElement>(null);
  const eraserHoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const predictedInk = useRef<SVGPathElement>(null);
  const ink = room.strokes[slide] ?? empty;
  const inkRef = useRef(ink); inkRef.current = ink;
  const aspect = room.width / room.height;
  useEffect(() => {
    setLaserVisible(!!laser?.point);
    const timer = setTimeout(() => setLaserVisible(false), 1200);
    return () => clearTimeout(timer);
  }, [laser]);
  useEffect(() => () => {
    if (deferredTouch.current) clearTimeout(deferredTouch.current.timer);
    deferredTouch.current = null;
    pendingPen.current = null;
    finishStroke();
    clearPrediction();
    hideEraserCursor();
  }, [slide, interactive]);
  useEffect(() => { eraserButton.current = new StylusEraser(stylusBinding); setHardwareErasing(false); }, [stylusBinding, tool, slide]);
  useEffect(() => {
    const reset = () => {
      if (deferredTouch.current) clearTimeout(deferredTouch.current.timer);
      deferredTouch.current = null;
      pendingPen.current = null;
      finishStroke();
      clearPrediction();
      hideEraserCursor();
      eraserButton.current.reset();
      setHardwareErasing(false);
    };
    const visibility = () => { if (document.hidden) reset(); };
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [send]);
  useImperativeHandle(inputRef, () => ({
    isDrawing: () => !!active.current || !!deferredTouch.current || !!pendingPen.current,
    isPenActive: () => active.current?.pointerType === 'pen' || !!pendingPen.current,
    cancelTouchStroke: () => {
      if (deferredTouch.current) { clearTimeout(deferredTouch.current.timer); deferredTouch.current = null; }
      const a = active.current;
      if (!a || a.pointerType !== 'touch') return;
      clearTimeout(hold.current); active.current = null;
      setLiveStrokeId(null);
      clearPrediction();
      if (a.mode === 'laser') send?.({ type: 'laser', slide: a.slide, point: null });
      else send?.({ type: 'stroke-cancel', slide: a.slide, id: a.id });
    },
  }));
  const point = (e: ReactPointerEvent): Point => {
    const r = container.current!.getBoundingClientRect();
    return { ...slidePoint(e.clientX, e.clientY, r), ...(e.pointerType === 'pen' ? { pressure: e.pressure } : {}) };
  };
  const pointsFromEvents = (events: PointerEvent[], rect: DOMRect, pointerType: string): Point[] =>
    events.map(event => ({ ...slidePoint(event.clientX, event.clientY, rect), ...(pointerType === 'pen' ? { pressure: event.pressure } : {}) }));
  const replaceStroke = (stroke: NonNullable<typeof active.current>, end: Point) => {
    send?.({
      type: 'stroke-replace',
      slide: stroke.slide,
      id: stroke.id,
      points: [stroke.start, snapLine(stroke.start, end, aspect, snap)],
      ...(stroke.mode === 'pen' || stroke.mode === 'smooth-pen' ? { sensitivity: 0 } : {}),
    });
  };
  const straighten = () => {
    const a = active.current;
    if (!a || !straightenableTools.includes(a.mode)) return;
    a.line = true;
    replaceStroke(a, a.last);
  };
  const armHold = (p: Point) => {
    clearTimeout(hold.current);
    if (!active.current || !straightenableTools.includes(active.current.mode) || active.current.line) return;
    active.current.anchor = p;
    hold.current = setTimeout(straighten, 550);
  };
  const erase = (samples: Point[], previous: Point | null) => {
    const radius = eraserWidth / 2 / (container.current?.getBoundingClientRect().height || 900);
    const ids = hitStrokesAlongPath(inkRef.current, samples, previous, aspect, radius);
    if (ids.length) send?.({ type: 'erase', slide, ids, gesture: active.current?.pointerType === 'touch' ? active.current.id : undefined });
  };
  const readButton = (e: ReactPointerEvent<HTMLDivElement>) => {
    const pressed = eraserButton.current.update(pointerSignal(e));
    setHardwareErasing(pressed);
    return pressed;
  };

  const moveEraserCursor = (e: ReactPointerEvent<HTMLDivElement>, visible: boolean) => {
    clearTimeout(eraserHoverTimer.current);
    const cursor = eraserCursor.current;
    if (!cursor) return;
    if (!visible) {
      cursor.style.display = 'none';
      return;
    }
    const rect = container.current?.getBoundingClientRect();
    if (!rect) return;
    cursor.style.display = 'block';
    cursor.style.left = `${e.clientX - rect.left}px`;
    cursor.style.top = `${e.clientY - rect.top}px`;
    eraserHoverTimer.current = setTimeout(() => {
      if (active.current?.mode !== 'eraser') hideEraserCursor();
    }, 120);
  };
  const hideEraserCursor = () => {
    clearTimeout(eraserHoverTimer.current);
    if (eraserCursor.current) eraserCursor.current.style.display = 'none';
  };
  const clearPrediction = () => { if (predictedInk.current) predictedInk.current.setAttribute('d', ''); };
  const startStroke = (p: Point, pointer: number, pointerType: string, time: number, modifier: boolean) => {
    const id = uid(), mode = modifier ? 'eraser' : tool;
    const pressureInput = pointerType === 'pen' && pressure > 0 && ['pen', 'smooth-pen'].includes(mode) ? new PenPressure(pressureDeadzone) : undefined;
    const start = pressureInput ? { ...p, pressure: pressureInput.push(p.pressure ?? .5, time) } : p;
    active.current = { id, pointer, pointerType, start, last: p, anchor: p, slide, mode, modifier, line: mode === 'line', pressureInput, smoother: mode === 'smooth-pen' ? new PenSmoother(smoothing, aspect, start, time, (container.current?.getBoundingClientRect().width ?? 1600) / 1600) : undefined };
    setLiveStrokeId(mode === 'eraser' || mode === 'laser' ? null : id);
    if (mode === 'eraser') erase([p], null);
    else if (mode === 'laser') send?.({ type: 'laser', slide, point: p });
    else {
      const sent = send?.({ type: 'stroke-start', slide, stroke: { id, tool: mode === 'smooth-pen' ? 'pen' : mode, color, width: mode === 'highlighter' ? width * 5 : width, points: [start], sensitivity: pointerType === 'pen' && ['pen', 'smooth-pen'].includes(mode) ? pressure / 100 : 0 } });
      if (!sent) { active.current = null; setLiveStrokeId(null); return; }
      armHold(p);
    }
  };
  const finishStroke = (cancel = false) => {
    clearPrediction();
    const a = active.current; if (!a) return;
    clearTimeout(hold.current);
    if (a.smoother && !a.line && !cancel) {
      const tail = a.smoother.finish();
      if (tail.length) send?.({ type: 'stroke-points', slide: a.slide, id: a.id, points: tail });
    }
    if (a.mode === 'laser') send?.({ type: 'laser', slide: a.slide, point: null });
    else if (a.mode !== 'eraser') send?.({ type: cancel ? 'stroke-cancel' : 'stroke-end', slide: a.slide, id: a.id });
    active.current = null;
    setLiveStrokeId(null);
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    clearPrediction();
    // Decide the tool once, at contact. Later button changes belong to the
    // next stroke and must not split this one into pen and eraser segments.
    const hoverButton = e.pointerType !== 'touch' && eraserButton.current.erasing;
    const waiting = pendingPen.current?.pointer === e.pointerId ? pendingPen.current : null;
    const modifier = waiting ? waiting.modifier : e.pointerType === 'touch' ? false : readButton(e) || (stylusBinding.kind === 's-pen' && hoverButton);
    moveEraserCursor(e, tool === 'eraser' || modifier);
    if (!interactive || active.current || deferredTouch.current || (e.pointerType === 'touch' && !touch)) return;
    if (!hasDrawingContact(e) || (e.pointerType === 'mouse' && e.button !== 0 && !modifier)) return;
    e.preventDefault();
    if (e.nativeEvent.isTrusted) e.currentTarget.setPointerCapture(e.pointerId);
    if (e.pointerType === 'pen' && !modifier && pressure > 0 && ['pen', 'smooth-pen'].includes(tool)) {
      const samples = actualPointerSamples(e.nativeEvent);
      const first = samples.findIndex(sample => normalizePressure(sample.pressure, pressureDeadzone) > 0);
      if (first < 0) { pendingPen.current = { pointer: e.pointerId, modifier }; return; }
      pendingPen.current = null;
      const rect = container.current!.getBoundingClientRect();
      const points = pointsFromEvents(samples.slice(first), rect, e.pointerType);
      startStroke(points[0], e.pointerId, e.pointerType, samples[first].timeStamp, modifier);
      if (points.length > 1) updateStroke(points[points.length - 1], points.slice(1), samples.slice(first + 1).map(sample => sample.timeStamp));
      return;
    }
    pendingPen.current = null;
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
    if (a.mode === 'eraser') erase(points, previous);
    else if (a.mode === 'laser') send?.({ type: 'laser', slide: a.slide, point: p });
    else if (a.line) replaceStroke(a, p);
    else {
      const rect = container.current!.getBoundingClientRect();
      const pressurePoints = a.pressureInput ? points.map((sample, i) => ({ ...sample, pressure: a.pressureInput!.push(sample.pressure ?? .5, times[i]) })) : points;
      const output = a.smoother ? pressurePoints.map((sample, i) => a.smoother!.push(sample, times[i])) : pressurePoints;
      send?.({ type: 'stroke-points', slide: a.slide, id: a.id, points: output });
      if (Math.hypot((p.x - a.anchor.x) * rect.width, (p.y - a.anchor.y) * rect.height) > 5) armHold(p);
    }
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const stroke = active.current?.pointer === e.pointerId ? active.current : null;
    const buttonErasing = !stroke && e.pointerType !== 'touch' ? readButton(e) : hardwareErasing;
    moveEraserCursor(e, tool === 'eraser' || buttonErasing || stroke?.mode === 'eraser');
    if (e.pointerType === 'pen' && active.current?.pointer === e.pointerId && !hasDrawingContact(e)) { finishStroke(); return; }
    if (!active.current && pendingPen.current?.pointer === e.pointerId && e.pointerType === 'pen' && hasDrawingContact(e)) { down(e); return; }
    if (e.pointerId !== (active.current?.pointer ?? deferredTouch.current?.pointer)) return;
    e.preventDefault();
    const p = point(e), rect = container.current!.getBoundingClientRect();
    const native = e.nativeEvent;
    const samples = actualPointerSamples(native);
    const points = samples.length ? pointsFromEvents(samples, rect, e.pointerType) : [p];
    const times = samples.length ? samples.map(v => v.timeStamp) : [e.timeStamp];
    const currentStroke = active.current;
    const predicted = e.pointerType === 'pen' && currentStroke?.mode === 'pen' && !currentStroke.line && typeof native.getPredictedEvents === 'function' ? native.getPredictedEvents().slice(0, 8) : [];
    const predictionPath = predictedInk.current;
    if (predictionPath) {
      if (predicted.length && currentStroke?.mode !== 'highlighter') {
        const future = pointsFromEvents(predicted, rect, e.pointerType);
        const all = [p, ...future];
        predictionPath.setAttribute('d', all.map((sample, i) => `${i ? 'L' : 'M'}${sample.x * 1600},${sample.y * 1600 / aspect}`).join(' '));
        predictionPath.setAttribute('stroke', color);
        predictionPath.setAttribute('stroke-width', String(width));
        predictionPath.style.display = 'block';
      } else clearPrediction();
    }
    if (deferredTouch.current) deferredTouch.current.moves.push(() => updateStroke(p, points, times));
    else updateStroke(p, points, times);
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    clearPrediction();
    if (pendingPen.current?.pointer === e.pointerId) pendingPen.current = null;
    if (e.type === 'pointercancel') {
      if (deferredTouch.current?.pointer === e.pointerId) {
        clearTimeout(deferredTouch.current.timer);
        deferredTouch.current = null;
      }
      const interrupted = active.current;
      if (interrupted?.pointer === e.pointerId) finishStroke(true);
      hideEraserCursor();
      return;
    }
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
    hideEraserCursor();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return <div className={`slide-canvas ${interactive ? 'can-write' : ''} tool-${hardwareErasing ? 'eraser' : tool}`} style={{ aspectRatio: aspect }} ref={container}>
    <img src={imageURL(room, slide, credentials)} alt={room.slides[slide].title} draggable={false} />
    {!preview && <Suspense fallback={null}><PdfSlide credentials={credentials} slide={slide} scale={renderScale} x={renderX} y={renderY} /></Suspense>}
    <InkLayer strokes={ink} aspect={aspect} liveId={liveStrokeId ?? undefined} screenWidth={container.current?.getBoundingClientRect().width ?? 1600} />
    <svg className="ink-prediction" viewBox={`0 0 1600 ${1600 / aspect}`} aria-hidden="true"><path ref={predictedInk} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".72" /></svg>
    <div className="ink-input" role="img" aria-label={interactive ? 'Slide drawing surface' : 'Slide annotations'}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={hideEraserCursor} onLostPointerCapture={up} onContextMenu={e => e.preventDefault()} />
    <span ref={eraserCursor} className="eraser-cursor" style={{ width: eraserWidth, height: eraserWidth, display: 'none' }} />
    {laserVisible && laser?.slide === slide && laser.point && <span className="laser-dot" style={{ left: `${laser.point.x * 100}%`, top: `${laser.point.y * 100}%` }} />}
  </div>;
}
