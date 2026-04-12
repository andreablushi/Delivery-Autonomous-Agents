import type { Parcel } from "../../../models/parcel.js";
import type { IOParcel } from "../../../models/djs.js";
import { Memory } from "./utils/memory.js";

/**
 * Beliefs about parcels in the environment.
 */
export class ParcelBeliefs {

    parcels = new Memory<Parcel>(10_000);      // Memory of parcels, keyed by ID, with TTL-based eviction to handle dynamic changes

    /**
     * Update parcel beliefs with the latest observed parcels.
     * @param parcels Array of parcels from the server, converted to internal Parcels type and stored in memory.
     */
    updateParcels(parcels: IOParcel[]): void {
        parcels.forEach(parcel => {
            this.parcels.update(parcel.id, {
                id: parcel.id,
                lastPosition: { x: parcel.x, y: parcel.y },
                carriedBy: parcel.carriedBy || null,
                reward: parcel.reward,
            });
        });
    }

    /** 
     * All parcels currently available for pickup (not carried by any agent).
     * @return An array of available parcels, filtered to exclude those currently carried by agents.
     */
    getAvailableParcels(): Parcel[] {
        return this.parcels.currentAll().filter(p => p.carriedBy === null);
    }

    /** 
     * The available parcel with the highest reward, or null if no parcels are available.
     * @return The available parcel with the highest reward, or null if no parcels are available.
     */
    getBestRewardParcel(): Parcel | null {
        const free = this.getAvailableParcels();
        if (!free.length) return null;
        return free.reduce((best, p) => p.reward > best.reward ? p : best);
    }
}