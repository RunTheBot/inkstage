import type { Point, Stroke } from './types';
import { pressureOutline } from '../shared/pressure.mjs';

// Coordinates are normalized to the actual slide, never to the letterbox.
export function snapLine(start: Point, end: Point, aspect: number, enabled = true): Point {
  if (!enabled) return end;
  const dx = (end.x - start.x) * aspect, dy = end.y - start.y;
  const angle = Math.atan2(dy, dx);
  const snapped = Math.round(angle / (Math.PI / 4)) * Math.PI / 4;
  if (Math.abs(angle - snapped) > 8 * Math.PI / 180) return end;
  const length = Math.hypot(dx, dy);
  return { ...end, x: Math.max(0, Math.min(1, start.x + Math.cos(snapped) * length / aspect)), y: Math.max(0, Math.min(1, start.y + Math.sin(snapped) * length)) };
}
function segmentDistance(p: Point, a: Point, b: Point, aspect: number) {
  const px = p.x * aspect, ax = a.x * aspect, bx = b.x * aspect;
  const dx = bx - ax, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, p.y - a.y - t * dy);
}
export function hitStrokes(strokes: Stroke[], point: Point, previous: Point | null, aspect: number, radius: number) {
  return strokes.filter(s => s.points.some((p, i) => {
    const a = i ? s.points[i - 1] : p;
    const tolerance = radius + s.width / 3200 * aspect;
    // Check both paths, including segments that cross between pointer events.
    if (segmentDistance(point, a, p, aspect) <= tolerance) return true;
    if (!previous) return false;
    if (segmentDistance(p, previous, point, aspect) <= tolerance || segmentDistance(a, previous, point, aspect) <= tolerance) return true;
    const cross = (x: Point, y: Point, z: Point) => (y.x - x.x) * (z.y - x.y) - (y.y - x.y) * (z.x - x.x);
    return cross(previous, point, a) * cross(previous, point, p) < 0 && cross(a, p, previous) * cross(a, p, point) < 0;
  })).map(s => s.id);
}

export function drawInk(canvas: HTMLCanvasElement, strokes: Stroke[]) {
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  paintStrokes(ctx, strokes, canvas.width, canvas.height);
}

function paintStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], width: number, height: number) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    if (!stroke.points.length) continue;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.globalAlpha = stroke.tool === 'highlighter' ? .3 : 1;
    const outline = pressureOutline(stroke, width / height);
    if (outline?.length) {
      ctx.beginPath();
      outline.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x * width, p.y * height); else ctx.lineTo(p.x * width, p.y * height); });
      ctx.closePath(); ctx.fill(); continue;
    }
    ctx.lineWidth = stroke.width / 1600 * width;
    ctx.beginPath();
    const first = stroke.points[0];
    ctx.moveTo(first.x * width, first.y * height);
    for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x * width, stroke.points[i].y * height);
    if (stroke.points.length === 1) { ctx.arc(first.x * width, first.y * height, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
    else ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Keep finished ink in a bitmap. During writing only the newest stroke needs
// its geometry rebuilt; older pressure outlines must not run on every move.
export class InkRenderer {
  private base: HTMLCanvasElement;
  private cached: Stroke[] = [];
  private width = 0;
  private height = 0;
  constructor(base: HTMLCanvasElement) { this.base = base; }
  render(canvas: HTMLCanvasElement, strokes: Stroke[]) {
    const stable = strokes.slice(0, -1);
    const resized = this.width !== canvas.width || this.height !== canvas.height;
    const reusable = !resized && this.cached.length <= stable.length && this.cached.every((stroke, i) => stroke === stable[i]);
    if (!reusable) {
      this.base.width = canvas.width; this.base.height = canvas.height;
      this.cached = [];
    }
    const added = stable.slice(this.cached.length);
    // drawInk clears the target, so append through a context without clearing.
    if (added.length) {
      const ctx = this.base.getContext('2d');
      if (ctx) paintStrokes(ctx, added, canvas.width, canvas.height);
    }
    this.cached = stable; this.width = canvas.width; this.height = canvas.height;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (stable.length) ctx.drawImage(this.base, 0, 0);
    if (strokes.length) paintStrokes(ctx, [strokes[strokes.length - 1]], canvas.width, canvas.height);
  }
}

export function inkBitmapSize(width: number, height: number, scale: number) {
  const density = Math.min(scale, 4, 4096 / width, 4096 / height, Math.sqrt(3_000_000 / (width * height)));
  return { width: Math.max(1, Math.round(width * density)), height: Math.max(1, Math.round(height * density)) };
}
