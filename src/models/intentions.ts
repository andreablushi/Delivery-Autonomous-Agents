import type { NavigationDesire } from "./desires.js";
import type { Position } from "./position.js";

/**
 * An intention is a navigation desire the agent has committed to, with a computed A* path to its target.
 */
export type Intention = {
    desire: NavigationDesire;
    path: Position[];   // Steps from A* (excludes start, includes goal)
};
