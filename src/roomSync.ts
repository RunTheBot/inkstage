import type { Operation, Point, Room, Stroke } from './types';

export function updateRoom(room: Room, event: Operation): Room {
  const slide = event.slide as number;
  const ink = room.strokes[slide] ?? [];
  let strokes = room.strokes;
  switch (event.type) {
    case 'stroke-start':
      if (ink.some(s => s.id === (event.stroke as Stroke).id)) return room;
      strokes = { ...strokes, [slide]: [...ink, event.stroke as Stroke] }; break;
    case 'stroke-cancel': strokes = { ...strokes, [slide]: ink.filter(s => s.id !== event.id) }; break;
    case 'stroke-points':
    case 'stroke-replace': strokes = { ...strokes, [slide]: ink.map(s => s.id === event.id ? { ...s, ...(event.type === 'stroke-replace' && typeof event.sensitivity === 'number' ? { sensitivity: event.sensitivity } : {}), points: event.type === 'stroke-replace' ? event.points as Point[] : [...s.points, ...event.points as Point[]] } : s) }; break;
    case 'ink-state': strokes = { ...strokes, [slide]: event.strokes as Stroke[] }; break;
    case 'erase': strokes = { ...strokes, [slide]: ink.filter(s => !(event.ids as string[]).includes(s.id)) }; break;
    case 'controls': return { ...room, current: event.current as number, blackout: event.blackout as boolean, timer: event.timer as Room['timer'], revision: event.revision as number };
    case 'navigate': return { ...room, current: event.current as number };
    default: return room;
  }
  return { ...room, strokes, revision: (event.revision as number) ?? room.revision };
}

// Network acknowledgements may arrive after more local writing. Rebase the
// unacknowledged edits over authoritative ink, rather than rolling them back.
export class RoomReplica {
  room: Room | null = null;
  private pending = new Map<string, Operation>();
  reset(room: Room | null) { this.room = room; this.pending.clear(); }
  local(event: Operation) {
    this.localBatch([event]);
  }
  localBatch(events: Operation[]) {
    if (!this.room) return;
    for (const event of events) this.pending.set(event.op as string, event);
    for (const event of mergePointEvents(events)) this.room = updateRoom(this.room, event);
  }
  remoteBatch(events: Operation[]) {
    let points: Operation[] = [];
    const flush = () => {
      if (this.room) for (const event of mergePointEvents(points)) this.room = updateRoom(this.room, event);
      points = [];
    };
    for (const event of events) {
      if (event.type === 'stroke-points') {
        // Consume every acknowledgement before merging. A merged message has
        // only one op ID, so reconciliation must see the original messages.
        if (!this.pending.delete(event.op as string)) points.push(event);
      } else {
        flush();
        this.remote(event);
      }
    }
    flush();
  }
  remote(event: Operation) {
    if (!this.room) return;
    const own = this.pending.delete(event.op as string);
    if (own && event.type.startsWith('stroke-')) return;
    this.room = updateRoom(this.room, event);
    if (event.type === 'ink-state') {
      const edits = [...this.pending.values()].filter(edit => edit.slide === event.slide);
      for (const edit of mergePointEvents(edits)) this.room = updateRoom(this.room, edit);
    }
  }
}

// Rendering follows the display clock, not pointer frequency or network RTT.
// Merge contiguous samples before copying a growing stroke's point array.
export function mergePointEvents(events: Operation[]): Operation[] {
  const result: Operation[] = [];
  for (const event of events) {
    const last = result[result.length - 1];
    if (event.type === 'stroke-points' && last?.type === event.type && last.id === event.id && last.slide === event.slide) {
      (last.points as Point[]).push(...event.points as Point[]);
      if (typeof event.revision === 'number') last.revision = event.revision;
    } else result.push(event.type === 'stroke-points' ? { ...event, points: [...event.points as Point[]] } : { ...event });
  }
  return result;
}
