export type View = { scale: number; x: number; y: number };
export type Size = { width: number; height: number };
export type Position = { x: number; y: number };
export const fitView: View = { scale: 1, x: 0, y: 0 };

export function fitSlide(size: Size, aspect: number): Size {
  const width = Math.min(size.width, size.height * aspect);
  return { width, height: width / aspect };
}

export function constrainView(view: View, viewport: Size, slide: Size): View {
  const scale = Math.max(.5, Math.min(6, view.scale));
  const marginX = scale > 1 ? Math.min(viewport.width, slide.width * scale) / 2 : 0;
  const marginY = scale > 1 ? Math.min(viewport.height, slide.height * scale) / 2 : 0;
  const maxX = Math.max(0, (slide.width * scale - viewport.width) / 2) + marginX;
  const maxY = Math.max(0, (slide.height * scale - viewport.height) / 2) + marginY;
  return { scale, x: Math.max(-maxX, Math.min(maxX, view.x)), y: Math.max(-maxY, Math.min(maxY, view.y)) };
}

function spring(distance: number, dimension: number): number {
  const limit = Math.max(1, dimension * .18);
  return Math.sign(distance) * limit * (1 - Math.exp(-Math.abs(distance) / (limit * 2)));
}

export function elasticView(view: View, viewport: Size, slide: Size): { view: View; overflow: Position } {
  const bounded = constrainView(view, viewport, slide);
  const overflow = { x: view.x - bounded.x, y: view.y - bounded.y };
  return {
    view: {
      ...bounded,
      x: bounded.x + spring(overflow.x, viewport.width),
      y: bounded.y + spring(overflow.y, viewport.height),
    },
    overflow,
  };
}

export function edgeSlideStep(overflow: Position, viewport: Size): -1 | 0 | 1 {
  const x = overflow.x / Math.max(1, viewport.width), y = overflow.y / Math.max(1, viewport.height);
  const pull = Math.abs(x) >= Math.abs(y) ? x : y;
  return Math.abs(pull) >= .22 ? pull < 0 ? 1 : -1 : 0;
}
// Anchor is measured in viewport pixels from its center. Preserve the slide
// coordinate beneath it while the scale changes, before applying edge bounds.
export function zoomAt(view: View, scale: number, anchor: Position): View {
  const nextScale = Math.max(.5, Math.min(6, scale));
  const ratio = nextScale / view.scale;
  return { scale: nextScale, x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio };
}
export function pinchView(view: View, fromA: Position, fromB: Position, toA: Position, toB: Position): View {
  const midpoint = (a: Position, b: Position) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const before = midpoint(fromA, fromB), after = midpoint(toA, toB);
  const distance = Math.hypot(fromB.x - fromA.x, fromB.y - fromA.y);
  const nextDistance = Math.hypot(toB.x - toA.x, toB.y - toA.y);
  const zoomed = zoomAt(view, view.scale * nextDistance / Math.max(distance, 1), before);
  return { ...zoomed, x: zoomed.x + after.x - before.x, y: zoomed.y + after.y - before.y };
}
export function slidePoint(x: number, y: number, rect: { left: number; top: number; width: number; height: number }): Position {
  return { x: Math.max(0, Math.min(1, (x - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (y - rect.top) / rect.height)) };
}
