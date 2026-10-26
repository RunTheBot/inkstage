type DismissPointer = Pick<PointerEvent, 'pointerId' | 'pointerType' | 'preventDefault' | 'stopPropagation'>;
const blockedPointers = new Set<number>();

export function suppressDismissGesture(event: DismissPointer) {
  event.preventDefault(); event.stopPropagation();
  const native = (window as Window & { InkstageNativePen?: { suppressUntilLift?: () => void } }).InkstageNativePen;
  if (event.pointerType === 'pen' && native?.suppressUntilLift) native.suppressUntilLift();
  else blockedPointers.add(event.pointerId);
}

// This guard outlives a popup that closes or unmounts during pointer-down.
if (typeof document !== 'undefined') {
  const swallow = (event: PointerEvent) => {
    if (!blockedPointers.has(event.pointerId)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.type === 'pointerup' || event.type === 'pointercancel') blockedPointers.delete(event.pointerId);
  };
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const) document.addEventListener(type, swallow, { capture: true, passive: false });
  window.addEventListener('blur', () => blockedPointers.clear());
}
