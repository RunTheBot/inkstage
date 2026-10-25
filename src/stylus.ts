export type StylusBinding = {
  kind: 'auto' | 'pointer' | 's-pen' | 'disabled';
  mask: number;
  device: 'pen' | 'mouse' | 'any';
  behavior: 'hold' | 'toggle';
};
export type StylusSignal = { type?: string; pointerType: string; buttons: number; button?: number; pressure?: number; native?: boolean };
export function pointerSignal(event: StylusSignal & { nativeEvent?: unknown }): StylusSignal {
  const source = event.nativeEvent as { inkstageNative?: boolean } | undefined;
  return { type: event.type, pointerType: event.pointerType, buttons: event.buttons, button: event.button, pressure: event.pressure, native: !!source?.inkstageNative };
}
export function tipOnlySignal(signal: StylusSignal) {
  return ['pen', 'mouse'].includes(signal.pointerType) && signal.buttons === 1 && (signal.button === 0 || signal.button === -1);
}
export function hasDrawingContact(signal: StylusSignal & { pressure: number }) {
  return signal.pointerType !== 'pen' ? signal.buttons !== 0 : signal.pressure > 0 || !!(signal.buttons & 1) || !!(signal.buttons & 32);
}
export const defaultStylusBinding: StylusBinding = { kind: 'auto', mask: 34, device: 'pen', behavior: 'hold' };
export const stylusPresets = [
  { id: 'auto', label: 'Automatic', kind: 'auto', mask: 34 },
  { id: 'side', label: 'Side / barrel button', kind: 'pointer', mask: 2 },
  { id: 'alternate', label: 'Alternate / middle button', kind: 'pointer', mask: 4 },
  { id: 'back', label: 'Back / X1 button', kind: 'pointer', mask: 8 },
  { id: 'forward', label: 'Forward / X2 button', kind: 'pointer', mask: 16 },
  { id: 'tail', label: 'Eraser tip', kind: 'pointer', mask: 32 },
  { id: 's-pen', label: 'Samsung S Pen / Android (experimental)', kind: 's-pen', mask: 0 },
  { id: 'disabled', label: 'Disabled', kind: 'disabled', mask: 0 },
] as const;
export function validBinding(value: unknown): value is StylusBinding {
  if (!value || typeof value !== 'object') return false;
  const b = value as StylusBinding;
  return ['auto', 'pointer', 's-pen', 'disabled'].includes(b.kind) && ['pen', 'mouse', 'any'].includes(b.device) && ['hold', 'toggle'].includes(b.behavior)
    && Number.isInteger(b.mask) && b.mask >= 0 && b.mask <= 254 && !(b.mask & 1) && (b.kind !== 'pointer' || b.mask > 0)
    && (b.kind !== 's-pen' || (b.mask === 0 && b.device === 'pen'));
}
export function loadStylusBinding(): StylusBinding {
  try { const saved = JSON.parse(localStorage.getItem('inkstage-stylus-button') ?? 'null'); if (validBinding(saved)) return saved; } catch { /* Use the defaults for older or unavailable storage. */ }
  return { ...defaultStylusBinding };
}
export function bindingLabel(binding: StylusBinding) {
  return stylusPresets.find(p => p.kind === binding.kind && p.mask === binding.mask)?.label ?? `Custom button (${binding.mask})`;
}
export function isEraserSignal(binding: StylusBinding, signal: StylusSignal) {
  if (binding.kind === 'disabled' || !['pen', 'mouse'].includes(signal.pointerType) || (binding.device !== 'any' && binding.device !== signal.pointerType)) return false;
  // Opt-in compatibility with devices that report 0 on barrel-held moves and
  // -1 on normal moves, while keeping buttons=1. A normal tip-down also uses
  // button=0, so only a pointermove can activate this experimental binding.
  if (binding.kind === 's-pen') return signal.native ? !!(signal.buttons & 34) : signal.pointerType === 'pen' && signal.type === 'pointermove' && signal.button === 0 && signal.buttons === 1;
  return binding.kind === 'auto' ? !!(signal.buttons & 34) : (signal.buttons & binding.mask) === binding.mask;
}
export function learnStylusBinding(signal: StylusSignal, behavior: StylusBinding['behavior']): StylusBinding | null {
  if (!['pen', 'mouse'].includes(signal.pointerType)) return null;
  // Bit 1 is normal tip contact. Never bind the tip itself to the eraser.
  const extra = signal.buttons & 254;
  if (!extra) return null;
  const mask = extra & -extra;
  return { kind: 'pointer', mask, device: signal.pointerType as 'pen' | 'mouse', behavior };
}
export class StylusEraser {
  private binding: StylusBinding;
  private previous = false;
  private latched = false;
  private active = false;
  constructor(binding: StylusBinding) { this.binding = binding; }
  get erasing() { return this.active; }
  update(signal: StylusSignal) {
    if (!['pen', 'mouse'].includes(signal.pointerType)) return this.active;
    if (this.binding.device !== 'any' && this.binding.device !== signal.pointerType) return this.active;
    const pressed = isEraserSignal(this.binding, signal);
    if (this.binding.behavior === 'toggle') {
      if (pressed && !this.previous) this.latched = !this.latched;
      this.active = this.latched;
    } else this.active = pressed;
    this.previous = pressed;
    return this.active;
  }
  reset() { this.previous = false; this.latched = false; this.active = false; }
}
