import type { Agent } from "../../../models/agent.js";
import type { PlayerSettings } from "../../../models/config.js";
import type { IOAgent } from "../../../models/djs.js";
import { Memory } from "./utils/memory.js";
import { manhattan } from "./utils/utils.js";


/**
 * Beliefs about the agent itself and other observed agents.
 */
export class AgentBeliefs {

    me: Agent | null = null;                        // Current self-belief, updated directly from observations, without memory
    friends = new Memory<Agent>(5_000);             // Memory of friendly agents, keyed by ID, with TTL-based eviction
    enemies = new Memory<Agent>(5_000);             // Memory of enemy agents, keyed by ID, with TTL-based eviction
    playerSettings: PlayerSettings | null = null;   // Player settings from config

    /**
     * Initialize self-belief from the given IOagent info.
     * @param info Initial info about the agent from the server, used to set up the self-belief.
     */
    setMe(info: IOAgent): void {
        this.me = {
            id: info.id,
            name: info.name,
            teamId: info.teamId,
            score: info.score,
            penalty: info.penalty,
            lastPosition: { x: info.x, y: info.y },
        };
    }

    /**
     * Update self-belief with the latest info.
     * @param info Latest info about the agent from the server.
     */
    updateMeStatus(info: IOAgent): void {
        this.me = {
            ...this.me!,                            // Keep existing immutable info (id, name, teamId)
            score: info.score,
            penalty: info.penalty,
            lastPosition: { x: info.x, y: info.y },
        };
    }

    /**
     * Update beliefs about other agents based on the latest observations.
     * @param agents List of all observed agents from the latest observation, used to update beliefs about friends and enemies.
     */
    updateOtherAgents(agents: IOAgent[]): void {
        agents.forEach(agent => {                           // Create a new Agent belief from the observed IOAgent data
            const data: Agent = {
                id: agent.id,
                name: agent.name,
                teamId: agent.teamId,
                score: agent.score,
                penalty: agent.penalty,
                lastPosition: { x: agent.x, y: agent.y },
            };
            if (agent.teamId === this.me?.teamId) {         // Update friend beliefs
                this.friends.update(agent.id, data);
            } else {                                        // Update enemy beliefs   
                this.enemies.update(agent.id, data);
            }
        });
    }

    /**
     * Get the list of all currently believed friend agents
     * @returns An array of friend agents
     */
    getCurrentFriends(): Agent[] {
        return this.friends.currentAll();
    }
    
    /**
     * Get the list of all currently believed enemy agents
     * @returns An array of enemy agents
     */
    getCurrentEnemies(): Agent[] {
        return this.enemies.currentAll();
    }
}
