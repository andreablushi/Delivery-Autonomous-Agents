import type { ExploreDesire, ReachParcelDesire, DesireType } from "../../../models/desires.js";
import type { Beliefs } from "../belief/beliefs.js";

/**
 * Desire generator functions create potential desires based on the agent's current beliefs about the environment.
 * @param beliefs - The current beliefs of the agent
 * @returns An array of DesireType representing the potential desires generated from the beliefs.
 */
export function generateDesires(beliefs: Beliefs): DesireType[] {
    const desires: DesireType[] = [];
    
    // Try generating a ReachParcelDesire first
    const reachParcel = generateReachParcelDesire(beliefs);
    if (reachParcel) {
        desires.push(reachParcel);
    }
    // If no ReachParcelDesire was generated, fall back to generating an ExploreDesire
    else {
        const explore = generateExploreDesire(beliefs);
        if (explore) desires.push(explore);
    }

    return desires;
}

/**
 * Generate a ReachParcelDesire targeting the highest-reward available parcel.
 * @param beliefs - The current beliefs of the agent
 * @returns A ReachParcelDesire, or null if no parcels with known positions are available
 */
function generateReachParcelDesire(beliefs: Beliefs): ReachParcelDesire | null {
    //#TODO: reason about if we should generate a desire for all non picked up 
    // parcels, maybe considering the distance and the reward
    const best = beliefs.parcels.getBestRewardParcel();
    if (!best?.lastPosition) return null;
    return { type: "REACH_PARCEL", target: { x: best.lastPosition.x, y: best.lastPosition.y } };
}

/**
 * Generate an ExploreDesire targeting the nearest spawn tile.
 * @param beliefs - The current beliefs of the agent
 * @returns An ExploreDesire with a target spawn tile
 */
function generateExploreDesire(beliefs: Beliefs): ExploreDesire | null {
    //#TODO: instead of reaching the nearest spawn tile, we could consider reaching the spawn tile with the most
    // observable area around it
    const nearestSpawnTile = beliefs.map.getNearestSpawnTile(beliefs.agents.getCurrentMe()!);
    if (!nearestSpawnTile) return null;
    return { type: "EXPLORE", target: { x: nearestSpawnTile.x, y: nearestSpawnTile.y } };
}

