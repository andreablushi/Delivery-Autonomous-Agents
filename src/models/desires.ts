/**
 * Desire types for BDI agent. 
 * Defines the structure of different desires that the agent can have based on its beliefs about the environment.
 * Each desire type corresponds to a specific goal or action the agent may want to pursue.
 */

import type { Position } from "./position.js";

export type ExploreDesire = {
    type: "EXPLORE";        // The agent wants to explore the map
    target: Position;       // A spawn tile to walk toward as a fallback goal
};

export type ReachParcelDesire = {
    type: "REACH_PARCEL";   // The agent wants to navigate to and collect a parcel
    target: Position;       // Last known position of the target parcel
};

/*
export type PickupParcelDesire = {
    type: "PICKUP_PARCEL";  // The agent wants to pick up a parcel it is currently on
};

export type DeliverParcelDesire = {
    type: "DELIVER_PARCEL"; // The agent wants to deliver a parcel it is currently carrying
    target: Position;      // Delivery target position 
};
*/
// Union type for all possible desires that the agent can have based on its beliefs
export type DesireType = ExploreDesire | ReachParcelDesire /**| PickupParcelDesire | DeliverParcelDesire*/;