import { aStar } from "./navigation/a_star.js";
import type { Beliefs } from "../belief/beliefs.js";
import type { Position } from "../../../models/position.js";
import type { NavigationDesire } from "../../../models/desires.js";
import type { Plan, PlanStep } from "../../../models/plan.js";
import { toMoveSteps } from "./utils/action_mapper.js";

/**
 * Build an A* plan for a single navigation desire. Returns null if the target is unreachable or already reached.
 * @param from Current position of the agent, used as the starting point for A* search.
 * @param intention The navigation desire to build a plan for, used to extract the target position and determine the terminal action.
 * @param beliefs Current beliefs of the agent, used to determine walkability of tiles for A* search.
 * @returns A Plan object containing the sequence of steps to achieve the desire, or null if no plan can be constructed.
 */ 
export function planAStar(from: Position, intention: NavigationDesire, beliefs: Beliefs, blockedTile: Position | null = null): Plan | null {
    // Retrieve the target position from the desire
    const to = intention.target;

    const temporaryIsWalkable = (from: Position, to: Position): boolean => {
        // If a blocked tile is provided, treat it as non-walkable for the purpose of this A* search to compute a detour, without modifying the global beliefs to avoid interfering with other plans until we decide to commit to the block
        if (blockedTile && to.x === blockedTile.x && to.y === blockedTile.y) {
            return false;
        }
        return beliefs.map.isWalkable(from, to);
    }
    
    // Compute the A* path from `from` to `to` under current beliefs
    const path = aStar(from, to, temporaryIsWalkable);

    // If no path is found, return null to indicate failure to plan
    if (!path) return null;

    // Convert the path of positions into a sequence of PlanSteps (move actions)        
    const steps: PlanStep[] = toMoveSteps(from, path);
    
    // Append the appropriate terminal step based on the desire type
    if (intention.type === "REACH_PARCEL") steps.push({ kind: "pickup" });
    else if (intention.type === "DELIVER_PARCEL") steps.push({ kind: "putdown" });

    // If the path is empty (already at target), return null to indicate no steps to execute
    if (steps.length === 0) return null;

    // Return the constructed plan with source "astar", the computed steps, and the original desire as the target
    return {
        source: "astar",
        steps,
        cursor: 0,
        targets: [intention],
    }
}
