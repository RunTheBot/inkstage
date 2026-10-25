export type Role = 'presenter' | 'pen' | 'audience';
export type Tool = 'pen' | 'smooth-pen' | 'highlighter' | 'line' | 'eraser' | 'laser';
export type Point = { x: number; y: number; pressure?: number };
export type Stroke = { id: string; tool: 'pen' | 'highlighter' | 'line'; color: string; width: number; points: Point[]; sensitivity?: number };
export type Slide = { title: string; notes: string; image: string };
export type Room = {
  id: string; name: string; width: number; height: number; slides: Slide[];
  current: number; blackout: boolean; strokes: Record<number, Stroke[]>; revision: number;
  timer: { running: boolean; elapsed: number; startedAt: number | null };
};
export type Credentials = { id: string; token: string; role: Role };
export type Operation = { type: string; [key: string]: unknown };
export const uid = () => globalThis.crypto?.randomUUID?.() ?? `ink_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
export function sessionURL(credentials: Credentials, base = location.origin) {
  const url = new URL(base); url.searchParams.set('session', credentials.id); url.searchParams.set('view', credentials.role); url.hash = credentials.token;
  return url.toString();
}
export function imageURL(room: Room, slide: number, credentials: Credentials) {
  return `/api/sessions/${room.id}/slides/${room.slides[slide].image}?role=${credentials.role}&token=${encodeURIComponent(credentials.token)}`;
}
export const headers = (c: Credentials) => ({ Authorization: `Bearer ${c.token}`, 'X-Inkstage-Role': c.role });
