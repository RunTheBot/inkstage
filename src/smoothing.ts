import type { Point } from './types';

export const smoothingPresets = {
  light: { label: 'Light', cutoff: 3.5, beta: .018, passes: 1 },
  balanced: { label: 'Balanced', cutoff: 1.5, beta: .006, passes: 2 },
  strong: { label: 'Strong', cutoff: .8, beta: .002, passes: 2 },
  maximum: { label: 'Maximum', cutoff: .5, beta: .001, passes: 3 },
} as const;
export type SmoothingPreset = keyof typeof smoothingPresets;
const alpha = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

// Adaptive low-pass filtering: suppress slow hand jitter and increase the
// response during fast movement. Work in slide pixels so zoom and device
// resolution do not change a preset's behavior.
export class PenSmoother {
  private raw: Point;
  private filtered: Point;
  private velocity = { x: 0, y: 0 };
  private time: number;
  private preset: SmoothingPreset;
  private aspect: number;
  private stages: Point[];
  constructor(preset: SmoothingPreset, aspect: number, first: Point, time: number) {
    this.preset = preset; this.aspect = aspect;
    this.raw = { ...first }; this.filtered = { ...first }; this.time = time;
    this.stages = Array.from({ length: smoothingPresets[preset].passes }, () => ({ ...first }));
  }
  push(point: Point, time: number): Point {
    const dt = Math.max(1 / 240, Math.min(1 / 15, (time - this.time) / 1000));
    const derivativeAlpha = alpha(1, dt);
    const dx = (point.x - this.raw.x) * 1600 / dt;
    const dy = (point.y - this.raw.y) * 1600 / this.aspect / dt;
    this.velocity.x += derivativeAlpha * (dx - this.velocity.x);
    this.velocity.y += derivativeAlpha * (dy - this.velocity.y);
    const settings = smoothingPresets[this.preset];
    const smoothingAlpha = alpha(settings.cutoff + settings.beta * Math.hypot(this.velocity.x, this.velocity.y), dt);
    let sample = point;
    for (const stage of this.stages) {
      stage.x += smoothingAlpha * (sample.x - stage.x);
      stage.y += smoothingAlpha * (sample.y - stage.y);
      if (sample.pressure !== undefined) stage.pressure = (stage.pressure ?? sample.pressure) + smoothingAlpha * (sample.pressure - (stage.pressure ?? sample.pressure));
      sample = stage;
    }
    this.filtered = { ...sample };
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
