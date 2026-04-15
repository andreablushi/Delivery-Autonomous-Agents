import type { Position } from "../models/position.js";

/** Manhattan distance between two grid positions. */
export function manhattanDistance(a: Position, b: Position): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
