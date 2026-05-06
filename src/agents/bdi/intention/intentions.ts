import type { Beliefs } from "../belief/beliefs.js";
import type { GeneratedDesires } from "../../../models/desires.js";
import type { IntentionQueue } from "../../../models/intentions.js";
import { getIntentionQueue } from "../desire/desire_sorter.js";

/**
 * Manages the agent's intention queue — an ordered list of desires to pursue,
 * rebuilt each deliberation cycle. The head is the current active desire.
 */
export class Intentions {

    private intentionsQueue: IntentionQueue = [];   // ordered queue rebuilt each cycle; head is the active desire

    /**
     * Rebuild the intention queue from the provided desires.
     * Called every deliberation cycle by bdi_agent and executor (after a successful move).
     * @param beliefs Current beliefs, used by the sorter for distance-based scoring.
     * @param desires Pre-built desire map (always provided by callers; includes CLEAR_CRATE if pending).
     */
    update(beliefs: Beliefs, desires: GeneratedDesires): void {
        if (desires.size === 0) {
            this.intentionsQueue = [];
            return;
        }
        this.intentionsQueue = getIntentionQueue(desires, beliefs);
    }

    /**
     * Drop the head of the queue (e.g. after a plan completes or is unrecoverable).
     * The next desire becomes the active intention on the next planning cycle.
     */
    dropIntention(): void {
        this.intentionsQueue.shift();
    }

    /**
     * Returns the head intention, or null if the queue is empty.
     */
    getIntentionHead(): IntentionQueue[0] | null {
        return this.intentionsQueue.length > 0 ? this.intentionsQueue[0] : null;
    }
}
