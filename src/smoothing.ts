import type { Point } from './types';

export const smoothingPresets = {
  light: { label: 'Light', cutoff: 6, beta: .3, maxLag: 1.2 },
  balanced: { label: 'Balanced', cutoff: 2.5, beta: .24, maxLag: 2 },
  strong: { label: 'Strong', cutoff: .9, beta: .2, maxLag: 2.8 },
  maximum: { label: 'Maximum', cutoff: .4, beta: .18, maxLag: 3.5 },
} as const;
export type SmoothingPreset = keyof typeof smoothingPresets;
const alpha = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

// Adaptive low-pass filtering: suppress slow hand jitter and increase the
// response during fast movement. Measure speed in visible pixels so zooming
// does not magnify the gap between the tip and the filtered line.
export class PenSmoother {
  private raw: Point;
  private filtered: Point;
  private velocity = { x: 0, y: 0 };
  private time: number;
  private preset: SmoothingPreset;
  private aspect: number;
  private screenScale: number;
  constructor(preset: SmoothingPreset, aspect: number, first: Point, time: number, screenScale = 1) {
    this.preset = preset; this.aspect = aspect;
    this.screenScale = Math.max(.01, screenScale);
    this.raw = { ...first }; this.filtered = { ...first }; this.time = time;
  }
  push(point: Point, time: number): Point {
    const dt = Math.max(1 / 1000, Math.min(1 / 15, (time - this.time) / 1000));
    const derivativeAlpha = alpha(6, dt);
    const dx = (point.x - this.raw.x) * 1600 * this.screenScale / dt;
    const dy = (point.y - this.raw.y) * 1600 * this.screenScale / this.aspect / dt;
    this.velocity.x += derivativeAlpha * (dx - this.velocity.x);
    this.velocity.y += derivativeAlpha * (dy - this.velocity.y);
    const settings = smoothingPresets[this.preset];
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    // A single stage avoids the long trailing tail of stacked filters. Bound
    // steady-motion lag in visible pixels, and open up faster during handwriting.
    const cutoff = Math.max(settings.cutoff + settings.beta * Math.max(0, speed - 40), speed / (2 * Math.PI * settings.maxLag));
    const smoothingAlpha = alpha(cutoff, dt);
    this.filtered.x += smoothingAlpha * (point.x - this.filtered.x);
    this.filtered.y += smoothingAlpha * (point.y - this.filtered.y);
    const lag = Math.hypot((point.x - this.filtered.x) * 1600 * this.screenScale, (point.y - this.filtered.y) * 1600 * this.screenScale / this.aspect);
    if (lag > settings.maxLag) {
      const ratio = settings.maxLag / lag;
      this.filtered.x = point.x + (this.filtered.x - point.x) * ratio;
      this.filtered.y = point.y + (this.filtered.y - point.y) * ratio;
    }
    if (point.pressure !== undefined) this.filtered.pressure = (this.filtered.pressure ?? point.pressure) + smoothingAlpha * (point.pressure - (this.filtered.pressure ?? point.pressure));
    this.raw = { ...point }; this.time = time;
    return { ...this.filtered };
  }
  finish(): Point[] {
    if (Math.hypot(this.raw.x - this.filtered.x, (this.raw.y - this.filtered.y) / this.aspect) < .00001 && Math.abs((this.raw.pressure ?? .5) - (this.filtered.pressure ?? .5)) < .001) return [];
    const from = this.filtered;
    return [.25, .5, .75, 1].map(t => {
      if (t === 1) return { ...this.raw };
      const eased = t * t * (3 - 2 * t);
      return { x: from.x + (this.raw.x - from.x) * eased, y: from.y + (this.raw.y - from.y) * eased, ...(this.raw.pressure === undefined ? {} : { pressure: (from.pressure ?? this.raw.pressure) + (this.raw.pressure - (from.pressure ?? this.raw.pressure)) * eased }) };
    });
  }
}
