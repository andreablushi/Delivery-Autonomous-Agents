import type { Beliefs } from "../belief/beliefs.js";
import { generateDesires } from "../desire/desire_generator.js";
import type { GeneratedDesires } from "../../../models/desires.js";
import type { IntentionQueue } from "../../../models/intentions.js";
import { getIntentionQueue } from "../desire/desire_sorter.js";

/**
 * Manages the agent's current intentions, including the current plan of the agent
 */
export class Intentions {

    private intentionsQueue: IntentionQueue = [];   // ordered queue of desires to plan for, built each deliberation cycle

    /**
     * Called each deliberation cycle. 
     * Updates the intention queue based on the current beliefs and desires, checks if the current plan is still valid, and generates a new plan if necessary.
     * @param beliefs The current beliefs of the agent, used to update the intention queue and validate the current plan.
     * @param desires The generated desires for the current cycle, used to build the intention queue.
     */
    update(beliefs: Beliefs): void {
        // Generate desires based on the current beliefs
        const desires : GeneratedDesires = generateDesires(beliefs);
        
        // If there are no desires, clear intentions and return early.
        if (desires.size === 0) {
            this.intentionsQueue = [];
            return;
        }

        // Build the intention queue from the current desires and beliefs.
        this.intentionsQueue = getIntentionQueue(desires, beliefs);
    }

    /**
     * Called by external callers to drop the current intention (e.g. after a plan is completed or deemed unrecoverable).
     * Removes the head of the intention queue, allowing the next desire to become the new intention on the next deliberation cycle.
     */
    dropIntention(): void {
        this.intentionsQueue.shift();
    }

    /**
     * Adds a new intention to the head of the queue, preempting existing intentions. 
     * Used for urgent replanning, e.g. crates in the way that need to be moved immediately.
     * @param desire The desire to add as a new intention at the head of the queue.
     */
    addIntentionAtHead(desire: IntentionQueue[0]["desire"]): void {
        this.intentionsQueue.unshift({ desire, score: Infinity });
    }

    /**
     * Returns the current intention queue, which is ordered by priority with the head of the queue being the current intention.
     * @returns The current intention queue, or null if there are no intentions.
     */
    getIntentionHead(): IntentionQueue[0] | null {
        return this.intentionsQueue.length > 0 ? this.intentionsQueue[0] : null;
    } 

    /** Returns the entire intention queue for inspection by external callers, e.g. for debugging or planning purposes. */
    getIntentionQueue(): IntentionQueue {
        return this.intentionsQueue;
    }
}
