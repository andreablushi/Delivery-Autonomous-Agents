import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { planAStar } from "./astar_planner.js";
import { CollisionManager } from "./collision/collision_manager.js";

import { Intentions } from "../intention/intentions.js";

import type { Beliefs } from "../belief/beliefs.js";
import type { Position } from "../../../models/position.js";
import type { IntentionQueue } from "../../../models/intentions.js";
import type { Plan, PlanStep } from "../../../models/plan.js";

/** Domain file path — loaded once at construction. */
const DOMAIN_PATH = join(dirname(fileURLToPath(import.meta.url)), "pddl", "domain.pddl");

/**
 * Single owner of plan generation. Builds A* plans on the queue head synchronously,
 * fires PDDL multi-pickup tours opportunistically in the background, and exposes
 * collision-aware step iteration to the Executor.
 */
export class Planner {
    private readonly domain: string;                        // PDDL domain string, loaded once at construction
    private intentionManager: Intentions;                   // Reference to the Intentions manager, used to access the current intention queue for planning and replanning decisions.
    private currentPlan: Plan | null = null;                // Active plan currently being executed; owned by the planner so callers do not pass plans around.

    private readonly collision = new CollisionManager();    // Manages collision state for the currently executing plan, used to decide when to replan around blocked tiles.

    /**
     * @param intentionManager Reference to the Intentions manager, used to access the current intention queue for planning and replanning decisions.
     * @param debug If true, logs additional debug info about planning decisions and PDDL requests.
     */
    constructor(intentionManager: Intentions) {
        this.intentionManager = intentionManager;
        this.domain = readFileSync(DOMAIN_PATH, "utf8");
    }

    /**
     * Build the immediately-executable plan for the queue head, and (if profitable)
     * fire a background PDDL tour over the top-N entries.
     */
    plan(beliefs: Beliefs): Plan | null {
        const me = beliefs.agents.getCurrentMe();
        const head = this.intentionManager.getIntentionHead();

        // Keep the current in-flight plan unless the intention head changed or the path became invalid.
        if (this.currentPlan) {
            const planDesire = this.currentPlan.targets[0];
            const headDesire = head?.desire;
            const preempted =
                !headDesire ||
                planDesire.type !== headDesire.type ||
                ('target' in planDesire && 'target' in headDesire &&
                 (planDesire.target.x !== headDesire.target.x ||
                  planDesire.target.y !== headDesire.target.y));

            if (!preempted && (!me?.lastPosition || this.validate(me.lastPosition, beliefs))) {
                return this.currentPlan;
            }
            this.currentPlan = null;
        }

        // No desires means no plan.
        if (head === null) {
            this.currentPlan = null;
            return null;
        }

        // Get the current queue from the Intentions manager for planning and replanning decisions.
        if (!me?.lastPosition) {
            this.currentPlan = null;
            return null;
        }

        // Take the top desire
        const currentIntetion = head.desire;

        // If the currenct intention is a navigation desire use a plain A* plan
        let headPlan : Plan | null = null;
        if (currentIntetion.type === "EXPLORE" || currentIntetion.type === "DELIVER_PARCEL" || currentIntetion.type === "REACH_PARCEL") {
            headPlan = planAStar(me.lastPosition, currentIntetion, beliefs);
        }

        // If there is no way to reach the target we drop the intention, and try to plan for the next one
        if (!headPlan){
            this.intentionManager.dropIntention();
            return this.plan(beliefs);
        }

        this.currentPlan = headPlan;
        return headPlan;
    }

    /** Expose the current plan for inspection by external callers, e.g. for debugging or collision management purposes. */
    getCurrentPlan(): Plan | null {
        return this.currentPlan;
    }

    /** Decide whether to fire a PDDL request, and submit one if worthwhile. */
    private planPddl(queue: IntentionQueue, beliefs: Beliefs): void {
        //#TODO: Currently a placeholder
        return;
    }

    /**
     * Return the next concrete step, applying collision detection on `move` steps.
     * If the next step is blocked by another agent, this method fires the collision management logic   
     */
    nextStep(currentPosition: Position, beliefs: Beliefs): PlanStep | "wait" | null {
        const plan = this.currentPlan;
        if (!plan) return null;
        // If there is no next step, return null to indicate the plan is complete or invalid.
        const step = plan.steps[plan.cursor];
        if (!step) return null;
        if (step.kind !== "move") return step;

        // For move steps, check if the next tile is currently blocked by another agent according to beliefs.
        const walkable = (a: Position, b: Position) => beliefs.map.isWalkable(a, b);
        if (!beliefs.agents.isNextBlockedByAgents(step.to, walkable)) {
            return step;
        }

        // Blocked by another agent on the next tile, tries to detour around it.
        const blockedTile = step.to;
        if (this.collision.tryDetour(plan, currentPosition, blockedTile, beliefs)) {
            return plan.steps[plan.cursor];
        }

        // If detour fails, decide whether to wait or to commit to the block and replan around it on the next tick.
        const decision = this.collision.onPreDetection(blockedTile);
        if (decision.kind === "block") {
            this.collision.commitBlocked(plan, currentPosition, blockedTile, decision.ttl, beliefs);
            const nextStep = plan.steps[plan.cursor] ?? null;
            if (!nextStep) this.currentPlan = null;
            return nextStep;
        }

        // Wait and hope the tile will be unblocked on the next tick.
        return "wait";
    }

    /** Advance the plan past a successfully executed step and reset collision state. */
    advance(): void {
        // If there is no current plan, do nothing.
        if (!this.currentPlan) return;

        // Advance the plan cursor to the next step. 
        const plan = this.currentPlan;
        plan.cursor++;
        // If we've reached the end of the plan, clear the current plan and drop the current intention 
        if (plan.cursor >= plan.steps.length) {
            this.currentPlan = null;
            this.intentionManager.dropIntention();
        }

        // Refresh the collision manager state
        this.collision.reset();
    }

    /**
     * Mark the failing step's tile as blocked (with collision-manager TTL) so the
     * next plan() call routes around it. Returns true if the plan should be dropped.
     * @param beliefs The current beliefs, used to mark the blocked tile and trigger replanning on the next tick.
     */
    invalidate(beliefs: Beliefs): boolean {
        const plan = this.currentPlan;

        // If there is no current plan, or the failing step is not a move, we don't have specific information to mark a tile
        if (!plan) return true;
        const step = plan.steps[plan.cursor];
        if (!step || step.kind !== "move") return true;

        // Mark the tile as blocked in beliefs with the collision manager's TTL to prevent it from being selected in future plans
        const decision = this.collision.onMoveFailure(step.to);
        if (decision.kind === "block") {
            beliefs.map.markBlocked(step.to, decision.ttl);
            this.collision.reset();
        }

        // In either case (wait or block), we drop the current plan to trigger replanning on the next tick
        this.currentPlan = null;
        return true; // intentions will replan on next deliberate tick
    }

    /** Check if the remaining move steps in the current plan are still valid under the latest beliefs
     * @param currentPosition The current position of the agent, used as the starting point for validating the remaining move steps in the plan.
     * @param beliefs The current beliefs of the agent, used to check the walkability of the remaining move steps in the plan.
     * @return true if the plan is still valid and can be continued, false if any of the remaining move steps are blocked under current beliefs and the plan should be dropped to trigger replanning.
    */
    validate(currentPosition: Position, beliefs: Beliefs): boolean {
        // If there is no current plan, we consider it valid (no invalid steps).
        const plan = this.currentPlan;
        if (!plan) return false;

        // Check the walkability of the remaining move steps in the plan under current beliefs. If any step is blocked, return false to indicate the plan is no longer valid and should be dropped to trigger replanning.
        let cur = currentPosition;
        for (let i = plan.cursor; i < plan.steps.length; i++) {
            const s = plan.steps[i];
            if (s.kind !== "move") continue;
            if (!beliefs.map.isWalkable(cur, s.to)) return false;
            cur = s.to;
        }

        // If all remaining move steps are walkable under current beliefs, we consider the plan still valid.
        return true;
    }
}