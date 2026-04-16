import type { ExploreDesire, ReachParcelDesire, PickupParcelDesire, PutdownParcelDesire, DeliverParcelDesire, DesireType } from "../../../models/desires.js";
import type { Beliefs } from "../belief/beliefs.js";

/**
 * Desire generator functions create potential desires based on the agent's current beliefs about the environment.
 * @param beliefs - The current beliefs of the agent
 * @returns An array of DesireType representing the potential desires generated from the beliefs.
 */
export function generateDesires(beliefs: Beliefs): DesireType[] {
    //TODO: currenltly, only the desire for one type are being generated
    // but probably, we should generate all the possible desires and then filter them in the desire filter

    // Pickup: highest priority — agent is standing on a parcel
    const pickup = generatePickupDesire(beliefs);
    if (pickup) return [pickup];

    // Putdown: agent is at a delivery tile and carrying parcels
    const putdown = generatePutdownDesire(beliefs);
    if (putdown) return [putdown];

    // Reach: a parcel is visible
    const reachParcel = generateReachParcelDesire(beliefs);
    if (reachParcel) return [reachParcel];

    // Deliver: agent is carrying parcels but not yet at a delivery tile
    const deliver = generateDeliverDesire(beliefs);
    if (deliver) return [deliver];

    // Explore: fallback
    return generateExploreDesires(beliefs);
}

/**
 * Generate a PickupParcelDesire if the agent is standing on an available parcel.
 */
function generatePickupDesire(beliefs: Beliefs): PickupParcelDesire | null {
    // Get current agent position from beliefs
    const me = beliefs.agents.getCurrentMe();
    if (!me?.lastPosition) return null;
    const ax = me.lastPosition.x;
    const ay = me.lastPosition.y;

    // Check if any available parcel is at the agent's current position
    const onParcel = beliefs.parcels.getAvailableParcels().some(
        parcel => parcel.lastPosition &&
            Math.round(parcel.lastPosition.x) === ax && 
            Math.round(parcel.lastPosition.y) === ay
    );
    return onParcel ? { type: "PICKUP_PARCEL" } : null;
}

/**
 * Generate a PutdownParcelDesire if the agent is standing on a delivery tile while carrying parcels.
 */
function generatePutdownDesire(beliefs: Beliefs): PutdownParcelDesire | null {
    // Get current agent position from beliefs
    const me = beliefs.agents.getCurrentMe();
    if (!me?.lastPosition) return null;
    const ax = me.lastPosition.x;
    const ay = me.lastPosition.y;

    // Check if the agent is carrying any parcels
    const carried = beliefs.parcels.getCarriedByAgent(me.id);
    if (carried.length === 0) return null;

    // Check if the agent is currently on a delivery tile
    const atDelivery = beliefs.map.getDeliveryTiles().some(
        tile => tile.x === ax && tile.y === ay);
    return atDelivery ? { type: "PUTDOWN_PARCEL" } : null;
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
 * Generate a DeliverParcelDesire targeting the nearest delivery tile, if the agent is carrying parcels.
 * @param beliefs - The current beliefs of the agent
 * @returns A DeliverParcelDesire, or null if the agent is not carrying any parcels
 */
function generateDeliverDesire(beliefs: Beliefs): DeliverParcelDesire | null {
    const me = beliefs.agents.getCurrentMe();
    if (!me) return null;
    const carried = beliefs.parcels.getCarriedByAgent(me.id);
    if (carried.length === 0) return null;
    const tile = beliefs.map.getNearestDeliveryTile(me);
    if (!tile) return null;
    return { type: "DELIVER_PARCEL", target: { x: tile.x, y: tile.y } };
}

/**
 * Generate one ExploreDesire per spawn tile.
 * @param beliefs - The current beliefs of the agent
 * @returns An array of ExploreDesire, one for each known spawn tile
 */
function generateExploreDesires(beliefs: Beliefs): ExploreDesire[] {
    return beliefs.map.getSpawnTiles().map(tile => ({
        type: "EXPLORE" as const,
        target: { x: tile.x, y: tile.y },
    }));
}

