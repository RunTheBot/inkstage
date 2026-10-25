import { randomBytes } from 'node:crypto';
export const token = () => randomBytes(24).toString('base64url');
export const publicState = (room, role = 'presenter') => ({
  id: room.id, name: room.name, width: room.width, height: room.height,
  slides: room.slides.map(s => ({ title: s.title, image: s.image, notes: role === 'presenter' ? s.notes : '' })), current: room.current, blackout: room.blackout,
  strokes: room.strokes, timer: room.timer, revision: room.revision,
});
const validSlide = (room, slide) => Number.isInteger(slide) && slide >= 0 && slide < room.slides.length;
const pointsValid = points => Array.isArray(points) && points.length > 0 && points.length <= 256 && points.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 && (p.pressure === undefined || (Number.isFinite(p.pressure) && p.pressure >= 0 && p.pressure <= 1)));
const cleanPoint = p => ({ x: p.x, y: p.y, ...(p.pressure === undefined ? {} : { pressure: p.pressure }) });
const saveAction = (room, slide, action) => {
  const history = room.history[slide] ??= { undo: [], redo: [] };
  history.undo.push(action); history.redo = [];
  if (history.undo.length > 200) history.undo.shift();
};
export function applyOperation(room, message, role) {
  if (role === 'audience' || !message || typeof message.type !== 'string') throw new Error('This view cannot edit the presentation.');
  const slide = message.slide;
  if (message.type.startsWith('stroke-') || ['erase', 'undo', 'redo', 'clear'].includes(message.type)) {
    if (!validSlide(room, slide)) throw new Error('Invalid slide.');
  }
  const ink = validSlide(room, slide) ? room.strokes[slide] ??= [] : [];
  switch (message.type) {
    case 'navigate': {
      if (!validSlide(room, message.current)) throw new Error('Invalid slide.');
      room.current = message.current;
      break;
    }
    case 'blackout':
      if (role !== 'presenter' || typeof message.value !== 'boolean') throw new Error('Invalid blackout request.');
      room.blackout = message.value;
      break;
    case 'timer': {
      if (role !== 'presenter' || !['start', 'pause', 'reset'].includes(message.action)) throw new Error('Invalid timer request.');
      const timer = room.timer;
      if (message.action === 'start' && !timer.running) { timer.running = true; timer.startedAt = Date.now(); }
      if (message.action === 'pause' && timer.running) { timer.elapsed += Date.now() - timer.startedAt; timer.running = false; }
      if (message.action === 'reset') room.timer = { running: false, elapsed: 0, startedAt: null };
      break;
    }
    case 'stroke-start': {
      const s = message.stroke;
      if (!s || !/^[a-zA-Z0-9_-]{8,80}$/.test(s.id) || !/^#[0-9a-f]{6}$/i.test(s.color) || !['pen', 'highlighter', 'line'].includes(s.tool) || !Number.isFinite(s.width) || s.width < 1 || s.width > 60 || !pointsValid(s.points) || ink.length >= 5000) throw new Error('Invalid ink stroke.');
      if (ink.some(item => item.id === s.id)) throw new Error('Duplicate stroke.');
      if (s.sensitivity !== undefined && (!Number.isFinite(s.sensitivity) || s.sensitivity < 0 || s.sensitivity > 1)) throw new Error('Invalid pressure sensitivity.');
      const stroke = { id: s.id, tool: s.tool, color: s.color, width: s.width, points: s.points.map(cleanPoint), ...(s.sensitivity === undefined ? {} : { sensitivity: s.sensitivity }) };
      ink.push(stroke);
      saveAction(room, slide, { before: [], after: [stroke] });
      break;
    }
    case 'stroke-points':
    case 'stroke-replace': {
      const stroke = ink.find(s => s.id === message.id);
      if (!stroke || !pointsValid(message.points)) throw new Error('Invalid ink points.');
      const clean = message.points.map(cleanPoint);
      if (message.type === 'stroke-replace') stroke.points = clean;
      else if (stroke.points.length + clean.length <= 20000) stroke.points.push(...clean);
      else throw new Error('Stroke limit reached. Lift the pen and continue.');
      break;
    }
    case 'stroke-end':
      if (!ink.some(s => s.id === message.id)) throw new Error('Unknown stroke.');
      break;
    case 'stroke-cancel': {
      if (typeof message.id !== 'string') throw new Error('Invalid canceled stroke.');
      const history = room.history[slide];
      let next = ink.filter(s => s.id !== message.id);
      if (history) {
        const canceled = history.undo.filter(action => action.gesture === message.id);
        for (const action of [...canceled].reverse()) for (const stroke of action.before) if (!next.some(s => s.id === stroke.id)) next.push(stroke);
        const keep = action => action.gesture !== message.id && !action.after.some(s => s.id === message.id);
        history.undo = history.undo.filter(keep); history.redo = history.redo.filter(keep);
      }
      room.strokes[slide] = next;
      break;
    }
    case 'erase': {
      if (!Array.isArray(message.ids) || message.ids.length > 5000) throw new Error('Invalid erase request.');
      const removed = ink.filter(s => message.ids.includes(s.id));
      if (removed.length) {
        room.strokes[slide] = ink.filter(s => !message.ids.includes(s.id));
        saveAction(room, slide, { before: removed, after: [], gesture: typeof message.gesture === 'string' ? message.gesture : undefined });
      }
      break;
    }
    case 'clear':
      if (ink.length) { saveAction(room, slide, { before: [...ink], after: [] }); room.strokes[slide] = []; }
      break;
    case 'undo':
    case 'redo': {
      const history = room.history[slide] ??= { undo: [], redo: [] };
      const undo = message.type === 'undo';
      const action = history[undo ? 'undo' : 'redo'].pop();
      if (action) {
        const remove = undo ? action.after : action.before;
        const add = undo ? action.before : action.after;
        room.strokes[slide] = [...ink.filter(s => !remove.some(r => r.id === s.id)), ...add];
        history[undo ? 'redo' : 'undo'].push(action);
      }
      break;
    }
    default: throw new Error('Unknown operation.');
  }
  room.revision++;
  return message;
}
