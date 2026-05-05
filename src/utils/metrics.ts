import type { Position } from "../models/position.js";

/** Manhattan distance between two grid positions. */
export function manhattanDistance(a: Position, b: Position): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Given the current position and a target position, computes the direction of next step. */
export function posToDirection(from: Position, to: Position): string {
    if (to.x > from.x) return "right";
    if (to.x < from.x) return "left";
    if (to.y > from.y) return "up";
    return "down";
}

/** Stable string key for a grid position, suitable for Map/Set lookups. */
export function posKey(pos: Position): string {
    return `${pos.x},${pos.y}`;
}

/** True if either coordinate is non-integer (i.e. the agent is mid-move between tiles). */
export function isHalfPosition(pos: Position): boolean {
    return !Number.isInteger(pos.x) || !Number.isInteger(pos.y);
}