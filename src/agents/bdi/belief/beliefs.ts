import type { IOConfig } from "../../../models/djs.js";
import type { GameSettings } from "../../../models/config.js";
import { AgentBeliefs } from "./agent_beliefs.js";
import { MapBeliefs } from "./map_beliefs.js";
import { ParcelBeliefs } from "./parcel_beliefs.js";

/**
 * Parser for human-friendly time intervals in the config, supporting formats like "5s", "2m", "1h", or special values like "infinite".
 * @param interval The time interval string to parse.
 * @returns The time interval in milliseconds, or Infinity for special values.
 * @throws Error if the format is invalid or contains unsupported units.
 */
function parseTimeInterval(interval: string): number {
    const normalized = interval.trim().toLowerCase();
    if (normalized === "infinite" || normalized === "infinity" || normalized === "never") {
        return Number.POSITIVE_INFINITY;
    }
    const match = normalized.match(/^(\d+)(ms|s|m|h)?$/);
    if (!match) {
        throw new Error(`Invalid time interval format: ${interval}`);
    }
    const value = Number(match[1]);
    const unit = match[2] ?? "ms";
    switch (unit) {
        case "ms": return value;
        case "s": return value * 1_000;
        case "m": return value * 60_000;
        case "h": return value * 3_600_000;
        default: throw new Error(`Unsupported time unit in interval: ${interval}`);
    }
}

/**
 * The Beliefs class serves as the central repository for all beliefs held by the BDI agent
 */
export class Beliefs {
    // Belief sub-systems
    readonly agents  = new AgentBeliefs();   // Tracks me, friends, and enemies
    readonly map     = new MapBeliefs();     // Tracks map layout and crates
    readonly parcels = new ParcelBeliefs();  // Tracks parcels and their statuses

    // Centralized game settings distributed to sub-systems on arrival
    settings: GameSettings | null = null;

    /**
     * Set game configuration and distribute relevant slices to each sub-system.
     * @param config Raw config from the server
     * @returns void
     */
    setSettings(config: IOConfig): void {
        this.settings = {
            title: config.GAME.title,
            description: config.GAME.description,
            max_player: config.GAME.maxPlayers,
        };
        // Distribute relevant config slices to sub-systems
        this.agents.playerSettings ={
                movement_duration: config.GAME.player.movement_duration,
                observation_distance: config.GAME.player.observation_distance,
                parcel_capacity: config.GAME.player.capacity,
        }
        this.parcels.parcelSettings = {
                parcel_spawn_interval: parseTimeInterval(config.GAME.parcels.generation_event),
                reward_decay_interval: parseTimeInterval(config.GAME.parcels.decaying_event),
                max_concurrent_parcels: config.GAME.parcels.max,
                reward_avg: config.GAME.parcels.reward_avg,
                reward_variance: config.GAME.parcels.reward_variance,
        }
    }
}
