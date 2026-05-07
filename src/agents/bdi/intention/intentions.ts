import type { Beliefs } from "../belief/beliefs.js";
import type { GeneratedDesires, ClearCrateDesire } from "../../../models/desires.js";
import type { IntentionQueue } from "../../../models/intentions.js";
import type { Position } from "../../../models/position.js";
import { getIntentionQueue } from "../desire/desire_sorter.js";
import { posKey } from "../../../utils/metrics.js";

/**
 * Manages the agent's intention queue — an ordered list of desires to pursue,
 * rebuilt each deliberation cycle. The head is the current active desire.
 *
 * CLEAR_CRATE desires are tracked separately in crateDesires and survive queue
 * rebuilds. They are added by the planner on PDDL solver success and removed
 * by dropIntention() (plan complete) or dropCrateDesire() (solver failure).
 */
export class Intentions {

    private intentionsQueue: IntentionQueue = [];   // ordered queue rebuilt each cycle; head is the active desire

    // Persists across queue rebuilds; keyed by posKey(desire.target).
    // Populated by addCrateDesire() on solver success; cleared by dropIntention() or dropCrateDesire().
    private crateDesires: Map<string, ClearCrateDesire> = new Map();

    /**
     * Rebuild the intention queue from the provided desires, merging in any tracked crate desires.
     * Called every deliberation cycle by bdi_agent and executor (after a successful move).
     * @param beliefs Current beliefs, used by the sorter for distance-based scoring.
     * @param desires Pre-built desire map (REACH_PARCEL, DELIVER_PARCEL, EXPLORE — no CLEAR_CRATE here).
     */
    update(beliefs: Beliefs, desires: GeneratedDesires): void {
        if (desires.size === 0 && this.crateDesires.size === 0) {
            this.intentionsQueue = [];
            return;
        }
        // Inject tracked crate desires so the sorter places them at priority tier 1
        // (between REACH/DELIVER=2 and EXPLORE=0).
        if (this.crateDesires.size > 0) {
            desires.set("CLEAR_CRATE", [...this.crateDesires.values()]);
        }
        this.intentionsQueue = getIntentionQueue(desires, beliefs);
    }

    /**
     * Drop the head of the queue (e.g. after a plan completes or is unrecoverable).
     * If the dropped desire is a CLEAR_CRATE, also removes it from the crateDesires map.
     */
    dropIntention(): void {
        const head = this.intentionsQueue[0];
        if (head?.desire.type === "CLEAR_CRATE") {
            this.crateDesires.delete(posKey(head.desire.target));
        }
        this.intentionsQueue.shift();
    }

    /**
     * Register a CLEAR_CRATE desire for the given target.
     * Called by the planner when the PDDL solver returns a valid plan.
     * Idempotent: a second call for the same posKey is a no-op.
     */
    addCrateDesire(desire: ClearCrateDesire): void {
        const key = posKey(desire.target);
        if (!this.crateDesires.has(key)) {
            this.crateDesires.set(key, desire);
        }
    }

    /**
     * Returns true if a CLEAR_CRATE desire for the given target is already tracked.
     */
    hasCrateDesireFor(target: Position): boolean {
        return this.crateDesires.has(posKey(target));
    }

    /**
     * Remove a tracked CLEAR_CRATE desire by its target key.
     * Called when the PDDL solver fails on a drift-recovery re-request.
     */
    dropCrateDesire(key: string): void {
        this.crateDesires.delete(key);
    }

    /**
     * Returns the head intention, or null if the queue is empty.
     */
    getIntentionHead(): IntentionQueue[0] | null {
        return this.intentionsQueue.length > 0 ? this.intentionsQueue[0] : null;
    }
}
