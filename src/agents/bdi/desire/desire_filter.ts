import type { Beliefs } from "../belief/beliefs.js";
import type { DesireType, ExploreDesire } from "../../../models/desires.js";
import { manhattanDistance } from "../../../utils/metrics.js";

/**
 * Desire filter functions take the generated desires and filter them to ensure uniqueness and relevance.
 * @param desires - An array of DesireType
 * @param beliefs - The current beliefs of the agent, used to contextualise filtering
 * @returns A filtered array of DesireType with duplicates removed based on the desire type.
 */
export function getBestDesire(desires: DesireType[], beliefs: Beliefs): DesireType {
    let  bestDesire : DesireType 
    const seen = new Set<string>();

    // Filter ExploreDesires
    //#TODO: Structure differently the desires parameter to avoid mapping for each desire type
    const explores = desires.filter((d): d is ExploreDesire => d.type === "EXPLORE");
    const bestExplore = filterExplore(
        explores,
        beliefs.agents.getCurrentMe()?.lastPosition ?? null,
        beliefs.agents.getObservationDistance(),
    );
    if (bestExplore) return bestExplore;

    // Deduplicate all other desire types, keeping the first occurrence
    for (const desire of desires) {
        if (desire.type === "EXPLORE") continue;
        if (seen.has(desire.type)) continue;
        seen.add(desire.type);
        bestDesire = desire;
    }

    return bestDesire!;
}

/**
 * Select the best ExploreDesire: the nearest spawn tile outside the agent's observation range.
 * Falls back to the nearest overall if all spawn tiles are within range.
 * @param explores - All generated ExploreDesires
 * @param agentPos - The agent's current position, or null if unknown
 * @param observationDistance - The agent's observation radius in tiles, or null if unknown
 * @returns The selected ExploreDesire, or null if there are no candidates
 */
export function filterExplore(explores: ExploreDesire[], agentPos: { x: number; y: number } | null, observationDistance: number | null,): ExploreDesire | null {
    if (explores.length === 0) return null;
    if (!agentPos || observationDistance === null) return explores[0];
    // Manage ExploreDesires by prioritising the nearest spawn tile that is outside the agent's current observation range
    const outOfRange = explores.filter(
        d => manhattanDistance(d.target, agentPos) > observationDistance,
    );
    const candidates = outOfRange.length > 0 ? outOfRange : explores;
    // Select the nearest candidate
    return candidates.reduce((nearest, d) =>
        manhattanDistance(d.target, agentPos) < manhattanDistance(nearest.target, agentPos) ? d : nearest,
    );
}
