import { useEffect, useRef, type RefObject } from 'react';
import { suppressDismissGesture } from './dismissGesture';

export function useToolbarPopup(open: boolean, close: () => void, panel: RefObject<HTMLElement | null>, trigger: RefObject<HTMLElement | null>, group?: string | null) {
  const state = useRef({ open, close, group });
  state.current = { open, close, group };
  useEffect(() => {
    const observe = (event: PointerEvent) => {
      if (event.type !== 'pointerdown' || !state.current.open) return;
      const target = event.target as HTMLElement;
      if (panel.current?.contains(target) || trigger.current?.contains(target) || target.closest('.stylus-binding-dialog')) return;
      if (state.current.group && target.closest('[data-toolbar-popup]')?.getAttribute('data-toolbar-popup') === state.current.group) return;
      state.current.close();
      // A tap that dismisses a popup must not also start writing or panning.
      // Keep swallowing that pointer until lift-off, including native pen moves.
      if (target.closest('.slide-viewport')) {
        suppressDismissGesture(event);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('dialog[open],.stylus-binding-dialog')) return;
      if (event.key === 'Escape' && state.current.open) {
        event.preventDefault(); state.current.close(); trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', observe, { capture: true, passive: false });
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', observe, true);
      document.removeEventListener('keydown', escape);
    };
  }, [panel, trigger]);
}
