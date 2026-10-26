// Filter pressure independently of positional smoothing so the ordinary pen
// also suppresses sensor chatter. Eight milliseconds keeps deliberate changes
// responsive; elapsed time makes the result independent of input batch size.
export const defaultPressureDeadzone = 3;

export function normalizePressure(pressure: number, deadzonePercent: number) {
  const threshold = Math.max(0, Math.min(15, deadzonePercent)) / 100;
  return Math.max(0, Math.min(1, (pressure - threshold) / (1 - threshold)));
}

export class PenPressure {
  private value: number | undefined;
  private time = 0;
  private deadzonePercent: number;
  constructor(deadzonePercent: number) { this.deadzonePercent = deadzonePercent; }
  push(pressure: number, time: number) {
    const target = normalizePressure(pressure, this.deadzonePercent);
    if (this.value === undefined) this.value = target;
    else {
      const dt = Math.max(0, time - this.time);
      const alpha = 1 - Math.exp(-dt / 8);
      this.value += alpha * (target - this.value);
    }
    this.time = Math.max(this.time, time);
    return this.value;
  }
}

export function actualPointerSamples(event: PointerEvent) {
  const samples = (typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : []).slice(-256);
  const last = samples[samples.length - 1];
  if (!last || last.clientX !== event.clientX || last.clientY !== event.clientY || last.pressure !== event.pressure) samples.push(event);
  return samples;
}
