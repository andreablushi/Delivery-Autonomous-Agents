import type { Agent } from "../../../models/agent.js";
import type { PlayerSettings } from "../../../models/config.js";
import type { IOAgent } from "../../../models/djs.js";
import { Position, PositionPrediction } from "../../../models/position.js";
import { Memory } from "./utils/memory.js";
import { Tracker } from "./utils/tracker.js";

/**
 * Beliefs about the agent itself and other observed agents.
 */
export class AgentBeliefs {

    private me: Agent | null = null;                        // Current self-belief, updated directly from observations, without memory
    private friends = new Tracker<Agent>();                 // Tracker of friend agents, keyed by ID, without memory
    private enemies = new Tracker<Agent>(true);             // Tracker of enemy agents, keyed by ID, keeping only the latest observation for each enemy, without memory, keeping half positions
    private enemiesMemory = new Memory<Agent>(1_000, 20);   // Memory of enemy agents, keyed by ID, with TTL-based eviction
    private playerSettings: PlayerSettings | null = null;   // Player settings from config

    // Memory management - EvictInterval prevents the agent from evicting stale beliefs too frequently,
    private lastEvict = 0;                          // Timestamp of the last eviction of stale beliefs
    private readonly EVICT_INTERVAL = 1_000;        // Number of milliseconds between evictions of stale beliefs

    /**
     * Update player settings belief with the latest config info.
     * @param settings 
     * @returns void
     */
    setSettings(settings: PlayerSettings): void {
        this.playerSettings = settings;
    }

    /**
     * Update self-belief with the latest info.
     * @param sensedMe Latest info about the agent from the server.
     */
    updateMe(sensedMe: IOAgent): void {
        this.me = {
            id: sensedMe.id,
            name: sensedMe.name,
            teamId: sensedMe.teamId,
            score: sensedMe.score,
            penalty: sensedMe.penalty,
            lastPosition: { x: sensedMe.x, y: sensedMe.y },
        };
    }

    /**
     * Update beliefs about other agents based on the latest observations.
     * @param sensedAgents List of all observed agents from the latest observation, used to update beliefs about friends and enemies.
     */
    updateOtherAgents(sensedAgents: IOAgent[], sensedPositions: Position[]): void {
        sensedAgents.forEach(agent => {                           // Create a new Agent belief from the observed IOAgent data
            const data: Agent = {
                id: agent.id,
                name: agent.name,
                teamId: agent.teamId,
                score: agent.score,
                penalty: agent.penalty,
                lastPosition: { x: agent.x, y: agent.y },
            };
            // Update friend beliefs
            if (agent.teamId === this.me?.teamId) {
                this.friends.update(agent.id, data);
            } 
            // Update enemy beliefs
            else {                                        
                this.enemies.update(agent.id, data);
                this.enemiesMemory.update(agent.id, data);     // Also update the memory of enemies for long-term tracking
            }
        });

        // Invalidate lastPosition for enemies not currently visible but whose last known position is in view
        this.enemies.invalidateAtSensedPositions(sensedAgents, sensedPositions);

        // Evict stale beliefs that haven't been updated recently to prevent memory bloat. This is done after processing the current observations to ensure we don't evict beliefs that were just updated.
        this.evict();
    }

    /**
     * Get the current believed state of the agent itself.
     * @returns The current self-belief, or null if not yet observed.
     */
    getCurrentMe(): Agent | null {
        return this.me;
    }

    /**
     * Get the observation distance from the player settings.
     * @returns The observation distance in tiles, or null if settings are not yet received.
     */
    getObservationDistance(): number | null {
        return this.playerSettings?.observation_distance ?? null;
    }

    /**
     * Get the list of all currently believed friend agents
     * @returns An array of friend agents
     */
    getCurrentFriends(): Agent[] {
        return this.friends.getCurrentAll();
    }
    
    /**
     * Get the list of all currently believed enemy agents
     * @returns An array of enemy agents
     */
    getCurrentEnemies(): Agent[] {
        return this.enemies.getCurrentAll();
    }

    /**
     * Get the confidence level of the belief about a specific enemy agent
     * @param id Enemy agent ID
     * @returns Confidence score between 0 and 1
     */
    getEnemyConfidence(id: string): number | undefined {
        return this.enemies.getConfidence(id, 2000);
    }

    /**
     * Predict the direction an enemy is moving based on its position history.
     * @param id Enemy agent ID
     * @returns Direction prediction with confidence score, or null if insufficient history
     */
    //#TODO Majority vote and not timestamp aware
    predictEnemyNextPosition(id: string): PositionPrediction | null {
        // If I have a tracking for this enemy, use its history to predict
        if(!this.enemies.getCurrent(id)?.lastPosition) return null;

        // If the enemy is in an half position (not fully in a tile), we can predict that it's moving in the direction of the half position
        const lastPos = this.enemies.getCurrent(id)!.lastPosition!;
        if (!Number.isInteger(lastPos.x) || !Number.isInteger(lastPos.y)) {
            let nextPos: PositionPrediction;
            // Round the half position to the nearest tile in the direction of movement
            if (!Number.isInteger(lastPos.x)) nextPos = { position: { x: Math.round(lastPos.x), y: lastPos.y }, confidence: 1.0 };
            else nextPos = { position: { x: lastPos.x, y: Math.round(lastPos.y) }, confidence: 1.0 };
            // Return with max confidence
            return nextPos;
        }

        // Get the history of observed positions for the specified enemy agent
        const history = this.enemiesMemory.getHistory(id);
        if (history.length < 5) return null;

        // Retrieve positions from the history of observations
        const positions = history.map(observation => observation.value.lastPosition);
        const votes = new Map<string, { position: Position; count: number }>();
        // Variable to track the last valid position (not diagonal)
        let lastValidNextPosition: Position = { x: lastPos.x, y: lastPos.y };
        let totalValidPairs = 0;

        // Iterate through consecutive position pairs to determine movement direction
        for (let i = 0; i < positions.length - 1; i++) {
            // Retrieve consecutive positions from the history
            const a = positions[i];
            const b = positions[i + 1];
            if (a === null || b === null) continue;

            // Calculate the difference in x and y coordinates to determine movement direction
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            if (dx !== 0 && dy !== 0) continue; // diagonal ambiguous, skip

            // Only consider valid movements in cardinal directions or stationary, and ignore any pairs that suggest diagonal movement which cannot be clearly categorized
            totalValidPairs++;

            // The next position is determined by applying the movement direction (dx, dy) 
            const nextPosition: Position = { x: b.x + dx, y: b.y + dy };

            // Vote for the determined direction based on this position pair
            const key = `${nextPosition.x},${nextPosition.y}`;
            const existing = votes.get(key);
            if (existing) existing.count += 1;
            else votes.set(key, { position: nextPosition, count: 1 });
            lastValidNextPosition = nextPosition;
        }

        // If no valid position pairs were found, we cannot make a prediction or are less than 5 observations
        if (totalValidPairs < 5) return null;

        let winner: Position = { x: lastPos.x, y: lastPos.y };
        let maxVotes = 0;
        // Determine the next position with the most votes, and calculate confidence as the proportion of votes for that direction out of total valid pairs
        for (const { position, count } of votes.values()) {
            if (count > maxVotes) { winner = position; maxVotes = count; }
        }

        // If there's a tie in votes, use the last valid direction as a tiebreaker, since it reflects the most recent observed movement trend
        const tied = [...votes.values()].filter(({ count }) => count === maxVotes);
        if (tied.length > 1) winner = lastValidNextPosition;

        // Return the predicted direction along with a confidence score, which is the ratio of votes for the winning direction to the total number of valid position pairs analyzed
        return { position: winner, confidence: maxVotes / totalValidPairs };
    }

    /**
     * Get the carry capacity from the player settings.
     * @returns The carry capacity, or null if settings are not yet received.
     */
    getCarryCapacity(): number | null {
        return this.playerSettings?.carry_capacity ?? null;
    }

    /**
     * Evict stale beliefs that haven't been updated recently to prevent memory bloat.
     */
    private evict(): void {
        const now = Date.now();
        if (now - this.lastEvict < this.EVICT_INTERVAL) return;
        this.lastEvict = now;
        this.enemiesMemory.evict();
    }
}
