import type { Point, Stroke } from '../src/types';
export function pressureOutline(stroke: Stroke, aspect: number): Point[] | null;
export function pressureJoins(stroke: Stroke, aspect: number): { x: number; y: number; radius: number }[];
