import type { Agent } from "../../../models/agent.js";
import type { GameMap, Tile } from "../../../models/map.js";
import type { GameSettings } from "../../../models/config.js";
import type { IOAgent, IOConfig, IOTile, IOParcel, IOCrate } from "../../../models/djs.js";
import type { Crates } from "../../../models/crates.js";
import type { Parcels } from "../../../models/parcels.js";

/**
 * Beliefs class represents the agent's beliefs about itself, the environment, and other agents.
 * It is updated based on the sensing events received from the BDI agent's perceive method.
 */
export class Beliefs {
    // Static beliefs about the game configuration and map
    settings: GameSettings | null = null;
    map: GameMap | null = null;
    // Dynamic beliefs about the current state of the world
    me: Agent | null = null;
    friends: Map<string, Agent> = new Map();
    enemies: Map<string, Agent> = new Map();
    parcels: Map<string, Parcels> = new Map();
    crates: Map<string, Crates> = new Map();

    /**
     * Set the game configuration in the beliefs.
    */
    setGameSettings(config: IOConfig) {
        this.settings = {
            title: config.GAME.title,
            description: config.GAME.description,
            max_player: config.GAME.maxPlayers,
            player_setting: {
                movement_duration: config.GAME.player.movement_duration,
                observation_distance: config.GAME.player.observation_distance,
                parcel_capacity: config.GAME.player.capacity,
            },
            parcel_setting: {
                parcel_spawn_interval: config.GAME.parcels.generation_event,
                reward_decay_interval: config.GAME.parcels.decaying_event,
                max_concurrent_parcels: config.GAME.parcels.max,
                reward_avg: config.GAME.parcels.reward_avg,
                reward_variance: config.GAME.parcels.reward_variance,
            }
        };
    }

    /**
     * Set the game map information in the beliefs.
    */
    setMap(width: number, height: number, tiles: IOTile[]) {
        this.map = { width, height, tiles: tiles as Tile[] };
    }

    /*
    * Initialize the agent's own information in the beliefs based on the provided data.
    */
    setMe(me_info: IOAgent) {
        this.me = {
            id: me_info.id,
            name: me_info.name,
            teamId: me_info.teamId,
            score: me_info.score,
            penalty: me_info.penalty,
            lastPosition: { x: me_info.x, y: me_info.y },
        };
    }

    /**
     * Update the agent's own status based on the provided information.
     */
    updateMeStatus(me_info: IOAgent) {
        this.me = {
            ...this.me!,
            score : me_info.score,
            penalty : me_info.penalty,
            lastPosition : { x: me_info.x, y: me_info.y },
        }
    }

    /**
     * Update beliefs about other agents based on the sensing event data.
     */
    updateOtherAgents(agents: IOAgent[]) {
        agents.forEach(agent => {
            const agentData: Agent = {
                id: agent.id,
                name: agent.name,
                teamId: agent.teamId,
                score: agent.score,
                penalty: agent.penalty,
                lastPosition: { x: agent.x, y: agent.y },
            };
            if (agent.teamId === this.me?.teamId) {
                this.friends.set(agent.id, agentData);
            } else {
                this.enemies.set(agent.id, agentData);
            }
        });
    }

    /**
     * Update beliefs about parcels based on the sensing event data.
     */
    updateParcels(parcels: IOParcel[]) {
        parcels.forEach(parcel => {
            const parcelData: Parcels = {
                id: parcel.id,
                lastPosition: { x: parcel.x, y: parcel.y },
                carriedBy: parcel.carriedBy || null,
                reward: parcel.reward,
            };
            this.parcels.set(parcel.id, parcelData);
        });
    }
    
    /**
     * Update beliefs about crates based on the sensing event data.
     */
    updateCrates(crates: IOCrate[]) {
        crates.forEach(crate => {
            const crateData: Crates = {
                id: crate.id,
                lastPosition: { x: crate.x, y: crate.y },
            };
            this.crates.set(crate.id, crateData);
        });
    }
}
