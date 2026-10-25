(() => {
  if (window.InkstageNativePen) return;
  let active = null, lastPenTime = -Infinity;
  const previous = new Map();
  const surface = node => node?.closest?.('.ink-input, .button-learn-pad');
  // Keep native Android samples as the sole pen input on drawing/test surfaces.
  // Real pointer events elsewhere still operate every toolbar and dialog.
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
    document.addEventListener(type, event => {
      if (event.inkstageNative || event.pointerType === 'touch') return;
      if (event.pointerType !== 'pen' && !(event.pointerType === 'mouse' && performance.now() - lastPenTime < 250)) return;
      if (!surface(event.target) && !active) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }, { capture: true, passive: false });
  }
  const changedButton = (before, after) => {
    const changed = before ^ after;
    return changed & 32 ? 5 : changed & 2 ? 2 : changed & 4 ? 1 : changed & 1 ? 0 : -1;
  };
  function emit(target, type, packet, points, buttons) {
    const last = points[points.length - 1];
    const id = 2000 + packet.id;
    const button = changedButton(previous.get(id) ?? 0, buttons);
    const create = point => {
      const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: 'pen', isPrimary: true, clientX: point.x, clientY: point.y, pressure: point.pressure, button, buttons });
      Object.defineProperties(event, { inkstageNative: { value: true }, inkstageRawButtons: { value: packet.raw }, timeStamp: { value: point.time } });
      return event;
    };
    const event = create(last);
    const samples = points.map(create);
    Object.defineProperty(event, 'getCoalescedEvents', { value: () => samples });
    previous.set(id, buttons);
    target.dispatchEvent(event);
  }
  function accept(packets) {
    for (const packet of packets) {
      lastPenTime = performance.now();
      if (!packet.width || !packet.height || !packet.points?.length) continue;
      const points = packet.points.map(p => ({ x: p.x * innerWidth / packet.width, y: p.y * innerHeight / packet.height, pressure: p.pressure, time: p.time }));
      const last = points[points.length - 1];
      let target = active?.target ?? surface(document.elementFromPoint(last.x, last.y));
      if (!target) continue;
      if (!target.isConnected) { active = null; continue; }
      if (packet.action === 'down' || (packet.contact && !active && packet.action === 'move')) {
        active = { target, packet, point: points[0] };
        emit(target, 'pointerdown', packet, [points[0]], packet.buttons);
      }
      if (packet.action === 'move' || packet.action === 'hover') emit(target, 'pointermove', packet, points, packet.buttons);
      if (packet.action === 'up' || packet.action === 'cancel') {
        if (active) emit(target, packet.action === 'cancel' ? 'pointercancel' : 'pointerup', packet, [last], 0);
        active = null; previous.delete(2000 + packet.id);
      } else if (active) { active.packet = packet; active.point = last; }
    }
  }
  const cancel = () => {
    if (!active) return;
    emit(active.target, 'pointercancel', active.packet, [active.point], 0);
    active = null; previous.clear();
  };
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  window.InkstageNativePen = Object.freeze({ accept, cancel });
})();
