import { useEffect, useRef, useState } from 'react';
import type { ComponentProps, PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Hand, Maximize, Minus, Plus } from 'lucide-react';
import { SlideCanvas, type SlideCanvasHandle } from './SlideCanvas';
import { defaultStylusBinding, isEraserSignal } from './stylus';
import { constrainView, fitSlide, fitView, pinchView, zoomAt, type Position, type View } from './viewport';

type Props = ComponentProps<typeof SlideCanvas> & { controlsTarget: HTMLElement | null };
type Gesture = { view: View; points: Position[] };
export function SlideViewport({ controlsTarget, ...props }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const input = useRef<SlideCanvasHandle | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [view, setView] = useState(fitView);
  const current = useRef(view);
  const [hand, setHand] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [options, setOptions] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Position>());
  const gesture = useRef<Gesture | null>(null);
  const drag = useRef<{ id: number; start: Position; view: View } | null>(null);
  const touchNavigation = useRef(false);
  const slide = fitSlide(size, props.room.width / props.room.height);
  const bounds = useRef({ size, slide }); bounds.current = { size, slide };
  const apply = (next: View) => {
    const bounded = constrainView(next, bounds.current.size, bounds.current.slide);
    current.current = bounded; setView(bounded);
  };
  useEffect(() => {
    const element = host.current; if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const outside = (e: globalThis.PointerEvent) => { if (!menu.current?.contains(e.target as Node)) setOptions(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOptions(false); };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);
  useEffect(() => { apply(current.current); }, [size.width, size.height]);
  useEffect(() => {
    apply(fitView); pointers.current.clear(); gesture.current = null; drag.current = null;
    touchNavigation.current = false; setDragging(false);
  }, [props.slide, props.room.id]);
  useEffect(() => {
    const element = host.current; if (!element) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && current.current.scale <= 1) return;
      e.preventDefault();
      if (input.current?.isDrawing()) return;
      const rect = element.getBoundingClientRect();
      const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1;
      const dx = e.deltaX * factor, dy = e.deltaY * factor;
      if (e.ctrlKey || e.metaKey) {
        apply(zoomAt(current.current, current.current.scale * Math.exp(-dy * .01), { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 }));
      } else apply({ ...current.current, x: current.current.x - dx, y: current.current.y - dy });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'm' || e.ctrlKey || e.metaKey || e.altKey || e.repeat || (e.target as HTMLElement).closest('input,textarea,select,dialog,[role=dialog]')) return;
      e.preventDefault(); setHand(value => !value);
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  const position = (e: PointerEvent): Position => {
    const rect = host.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 };
  };
  const beginGesture = () => {
    const points = [...pointers.current.values()];
    gesture.current = { view: { ...current.current }, points: points.slice(0, 2) };
    touchNavigation.current = true; setDragging(true);
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.viewport-controls')) return;
    if (e.pointerType === 'pen') {
      input.current?.cancelTouchStroke(); pointers.current.clear(); gesture.current = null;
      touchNavigation.current = false; drag.current = null; setDragging(false);
      return;
    }
    if (e.pointerType === 'touch') {
      // Ignore palms while the stylus is on the page.
      if (input.current?.isPenActive()) { e.preventDefault(); e.stopPropagation(); return; }
      pointers.current.set(e.pointerId, position(e));
      if (pointers.current.size >= 2 || !props.touch || hand) {
        input.current?.cancelTouchStroke();
        beginGesture();
        for (const id of pointers.current.keys()) e.currentTarget.setPointerCapture(id);
        e.preventDefault(); e.stopPropagation();
      }
    } else if (e.pointerType === 'mouse' && (hand || e.button === 1) && !isEraserSignal(props.stylusBinding ?? defaultStylusBinding, e)) {
      drag.current = { id: e.pointerId, start: position(e), view: { ...current.current } };
      e.currentTarget.setPointerCapture(e.pointerId); setDragging(true);
      e.preventDefault(); e.stopPropagation();
    }
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' && pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, position(e));
      const start = gesture.current;
      if (!touchNavigation.current || !start) return;
      e.preventDefault(); e.stopPropagation();
      const points = [...pointers.current.values()];
      if (points.length >= 2 && start.points.length >= 2) apply(pinchView(start.view, start.points[0], start.points[1], points[0], points[1]));
      else if (points.length === 1) apply({ ...start.view, x: start.view.x + points[0].x - start.points[0].x, y: start.view.y + points[0].y - start.points[0].y });
    } else if (drag.current?.id === e.pointerId) {
      e.preventDefault(); e.stopPropagation(); const p = position(e), start = drag.current;
      apply({ ...start.view, x: start.view.x + p.x - start.start.x, y: start.view.y + p.y - start.start.y });
    }
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') {
      pointers.current.delete(e.pointerId);
      if (touchNavigation.current) {
        e.preventDefault(); e.stopPropagation();
        if (pointers.current.size) beginGesture();
        else { touchNavigation.current = false; gesture.current = null; setDragging(false); }
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } else if (drag.current?.id === e.pointerId) {
      drag.current = null; setDragging(false); e.preventDefault(); e.stopPropagation();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };
  return <div ref={host} className={`slide-viewport ${hand ? 'hand-mode' : ''} ${dragging ? 'is-panning' : ''}`}
    onPointerDownCapture={down} onPointerMoveCapture={move} onPointerUpCapture={up} onPointerCancelCapture={up}
    onLostPointerCapture={e => { if (e.target === e.currentTarget) up(e); }}>
    <div className="slide-fit" style={{ width: slide.width, height: slide.height, transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
      <SlideCanvas {...props} inputRef={input} renderScale={view.scale} interactive={props.interactive && !hand} />
    </div>
    {controlsTarget && createPortal(<div className="viewport-controls" aria-label="Slide zoom and pan" ref={menu}>
      <button aria-label="Pan mode (M)" title="Pan mode (M): drag to move the slide" aria-pressed={hand} className={hand ? 'selected' : ''} onClick={() => setHand(!hand)}><Hand size={17} /></button>
      <button className="zoom-menu-button" aria-label="View options" aria-expanded={options} title="Zoom and fit options" onClick={() => setOptions(!options)}>{Math.round(view.scale * 100)}%<ChevronDown size={13} /></button>
      {options && <div className="view-submenu" role="dialog" aria-label="View options"><strong>View</strong><div className="zoom-adjust"><button aria-label="Zoom out" disabled={view.scale <= .5} onClick={() => apply(zoomAt(current.current, view.scale / 1.25, { x: 0, y: 0 }))}><Minus size={17} /></button><span>{Math.round(view.scale * 100)}%</span><button aria-label="Zoom in" disabled={view.scale >= 6} onClick={() => apply(zoomAt(current.current, view.scale * 1.25, { x: 0, y: 0 }))}><Plus size={17} /></button></div><button className="fit-slide-button" aria-label="Reset slide view" onClick={() => { apply(fitView); setOptions(false); }}><Maximize size={16} />Fit slide</button></div>}
    </div>, controlsTarget)}
  </div>;
}
