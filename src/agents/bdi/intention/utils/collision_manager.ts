import type { Position } from "../../../../models/position.js";
import { CollisionTimer } from "./collision_timer.js";

/** Decision returned by CollisionManager on each collision event. */
export type CollisionDecision =
    | { kind: 'wait' }
    | { kind: 'block'; ttl: number };

/**
 * Encapsulates the collision state machine: tracks how long we've been waiting on a specific
 * blocked tile, counts repeated detections, and escalates to a hard block when timer or
 * retry thresholds are exceeded. The caller owns the actual "mark blocked + replan" step.
 */
export class CollisionManager {
    private timer = new CollisionTimer();
    private invalidationCount = 0;

    // Tuning parameters — duration/counter thresholds for the collision escalation flow
    private static readonly DETOUR_THRESHOLD_STEPS = 5;                // Maximum number of steps for a detour to be considered preferable over waiting
    private static readonly BLOCKED_AFTER_EXPIRATION_TTL_MS = 2_000;   // TTL for marking a tile as blocked after waiting for it to clear, or after a failed detour attempt
    private static readonly INVALIDATION_BLOCKED_TTL_MS = 1_000;       // TTL for marking a tile as blocked after repeated failed invalidation attempts
    private static readonly WAIT_MIN_MS = 1_000;                       // Minimum wait time before marking a tile as blocked
    private static readonly WAIT_MAX_MS = 1_500;                       // Maximum wait time before marking a tile as blocked
    private static readonly INVALIDATION_RETRY_LIMIT = 2;              // Number of times to retry invalidating a tile before marking it as blocked in beliefs to avoid getting stuck

    /** Maximum extra steps a detour may add before we prefer to wait instead. */
    get detourThresholdSteps(): number { return CollisionManager.DETOUR_THRESHOLD_STEPS; }

    /** TTL to apply when committing a block after a detour is chosen. */
    get detourCommitTtl(): number { return CollisionManager.BLOCKED_AFTER_EXPIRATION_TTL_MS; }

    /** Clear all collision state (called when the path advances or a block is committed). */
    reset(): void {
        this.timer.reset();
        this.invalidationCount = 0;
    }

    /**
     * Handle a pre-detection of another agent standing on our next tile.
     * Starts a random wait timer on first encounter, counts repeat detections, and
     * escalates to a hard block once either the retry limit or the timer expires.
     */
    onPreDetection(tile: Position): CollisionDecision {
        // If we're not already waiting for this tile, start the collision timer
        if (!this.timer.isWaitingFor(tile)) {
            this.timer.start(tile, CollisionManager.WAIT_MIN_MS, CollisionManager.WAIT_MAX_MS);
        } else {
            // Count each repeated pre-detection for the same tile so the limiter
            // works regardless of whether blocks are caught before or after a move attempt.
            this.invalidationCount++;
        }

        // If the counter exceeds the retry limit, skip the remaining timer and force-mark
        // the tile immediately — same escalation used in invalidatePath for move failures.
        if (this.invalidationCount > CollisionManager.INVALIDATION_RETRY_LIMIT) {
            return { kind: 'block', ttl: CollisionManager.INVALIDATION_BLOCKED_TTL_MS };
        }

        // If the timer hasn't expired yet, we wait before marking the tile as blocked
        if (!this.timer.hasExpired()) {
            return { kind: 'wait' };
        }

        // Once the timer has expired, we consider the tile blocked and commit it in beliefs
        return { kind: 'block', ttl: CollisionManager.BLOCKED_AFTER_EXPIRATION_TTL_MS };
    }

    /**
     * Handle a confirmed move failure for the given tile. Escalates to a hard block
     * as soon as we hit the retry limit; otherwise defers to the pre-detection flow.
     */
    onMoveFailure(tile: Position): CollisionDecision {
        this.invalidationCount++;
        // If we've already tried to invalidate this tile multiple times, we mark it as blocked in beliefs to avoid getting stuck
        if (this.invalidationCount > CollisionManager.INVALIDATION_RETRY_LIMIT) {
            // Mark the tile as blocked with a short TTL to prevent immediate re-selection, then replan
            return { kind: 'block', ttl: CollisionManager.INVALIDATION_BLOCKED_TTL_MS };
        }
        return this.onPreDetection(tile);
    }
}
