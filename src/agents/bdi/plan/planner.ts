import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { planAStar } from "./astar_planner.js";
import { PddlPlanner } from "./pddl_planner.js";
import { aStar } from "./navigation/a_star.js";
import { CollisionManager } from "./collision/collision_manager.js";
import { toMoveSteps } from "./utils/action_mapper.js";

import { Intentions } from "../intention/intentions.js";

import type { Beliefs } from "../belief/beliefs.js";
import type { Position } from "../../../models/position.js";
import type { Plan, PlanStep } from "../../../models/plan.js";
import type { NavigationDesire, ClearCrateDesire } from "../../../models/desires.js";
import { posKey } from "../../../utils/metrics.js";

const CRATE_DOMAIN_PATH = join(dirname(fileURLToPath(import.meta.url)), "pddl", "domain-crates.pddl");

export class Planner {
    private readonly pddlPlanner: PddlPlanner;
    private intentionManager: Intentions;
    private beliefs: Beliefs;
    private currentPlan: Plan | null = null;

    private readonly collision = new CollisionManager();

    // Called when the PDDL solver responds (success or failure) so the agent can deliberate
    // immediately without waiting for the next sensing event.
    private readonly onPddlReady: () => void;

    constructor(intentionManager: Intentions, beliefs: Beliefs, onPddlReady: () => void) {
        this.intentionManager = intentionManager;
        this.beliefs = beliefs;
        this.onPddlReady = onPddlReady;
        this.pddlPlanner = new PddlPlanner(readFileSync(CRATE_DOMAIN_PATH, "utf8"));
    }

    /** True while the PDDL solver HTTP call is in progress. */
    isWaitingForPddl(): boolean {
        return this.pddlPlanner.isWaiting();
    }

    plan(beliefs: Beliefs): Plan | null {
        const me = beliefs.agents.getCurrentMe();
        const head = this.intentionManager.getIntentionHead();

        if (this.currentPlan) {
            // PDDL plans run to completion — the solver already modelled crate positions
            // so validation against current beliefs would falsely invalidate push steps.
            if (this.currentPlan.source === "pddl") return this.currentPlan;

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

        if (head === null || !me?.lastPosition) return null;

        const desire = head.desire;

        // CLEAR_CRATE: the desire is only present in the queue after the solver responded.
        // Consume the ready PDDL plan, prepend an A* bridge if the agent has moved since the request,
        // or re-fire the solver if the plan was reset by position-drift handling.
        if (desire.type === "CLEAR_CRATE") {
            // If this desire was removed from the tracking map (drift recovery cleanup),
            // drop the stale queue entry and replan.
            if (!this.intentionManager.hasCrateDesireFor(desire.target)) {
                this.intentionManager.dropIntention();
                return this.plan(beliefs);
            }

            const ready = this.pddlPlanner.consume();
            console.log(`[PDDL] CLEAR_CRATE at head — waiting=${this.pddlPlanner.isWaiting()} ready=${!!ready}`);

            if (ready) {
                // If the agent has moved since the plan was built, prepend A* steps to bridge the gap.
                let plan: Plan = ready;
                if (plan.startPosition &&
                    (me.lastPosition.x !== plan.startPosition.x || me.lastPosition.y !== plan.startPosition.y)) {
                    const bridgePath = aStar(me.lastPosition, plan.startPosition, (f, t) => beliefs.map.isWalkable(f, t));
                    if (bridgePath && bridgePath.length > 0) {
                        const bridgeSteps = toMoveSteps(me.lastPosition, bridgePath);
                        plan = { ...plan, steps: [...bridgeSteps, ...plan.steps], cursor: 0 };
                    }
                    // If bridgePath is null, start is unreachable — proceed with the PDDL plan as-is
                    // and let position drift handling in nextStep() deal with it.
                }
                this.currentPlan = plan;
                return plan;
            }

            // No ready plan — re-request from the current position (drift recovery: pddlPlanner was
            // reset by nextStep() on position drift).
            this.pddlPlanner.request(desire, beliefs, plan => {
                if (!plan) {
                    // Solver failed — remove desire from tracking map; stale queue entry is cleaned
                    // on the next plan() call via the hasCrateDesireFor() guard above.
                    this.intentionManager.dropCrateDesire(posKey(desire.target));
                }
                // Wake the agent regardless of outcome — do not wait for next sensing event.
                this.onPddlReady();
            });
            return null;
        }

        // A* for all navigation desires
        const headPlan = planAStar(me.lastPosition, desire, beliefs);

        if (!headPlan) {
            const crateBlock = this.detectCrateBlock(desire as NavigationDesire, me.lastPosition, beliefs);
            if (crateBlock) {
                // EXPLORE has many alternative targets — drop this one and try the rest before
                // paying the PDDL solver cost. Only escalate when all alternatives are exhausted.
                if (desire.type !== "REACH_PARCEL" && desire.type !== "DELIVER_PARCEL") {
                    this.intentionManager.dropIntention();
                    const fallback = this.plan(beliefs);
                    if (fallback !== null) return fallback;
                    // All alternatives exhausted — fall through to PDDL.
                }
                // Fire the solver if not already in-flight and no desire is already tracked for this target.
                // The CLEAR_CRATE desire is added to intentions only when the solver returns a valid plan.
                if (!this.pddlPlanner.isWaiting() && !this.intentionManager.hasCrateDesireFor(crateBlock.target)) {
                    console.log(`[PDDL] Crate block detected — requesting PDDL plan for ${crateBlock.crateIds.join(",")}`);
                    this.pddlPlanner.request(crateBlock, beliefs, plan => {
                        if (plan) {
                            // Add the CLEAR_CRATE desire only when the solver returns a valid plan.
                            this.intentionManager.addCrateDesire(crateBlock);
                        }
                        // Wake the agent regardless of outcome — do not wait for next sensing event.
                        this.onPddlReady();
                    });
                }
                // Drop the blocked desire and continue with other desires while the solver runs.
                this.intentionManager.dropIntention();
                return this.plan(beliefs);
            }
            this.intentionManager.dropIntention();
            return this.plan(beliefs);
        }

        this.currentPlan = headPlan;
        return headPlan;
    }

    private detectCrateBlock(desire: NavigationDesire, from: Position, beliefs: Beliefs): ClearCrateDesire | null {
        const crates = beliefs.map.getCurrentCrates().filter(c => c.lastPosition !== null);
        if (crates.length === 0) return null;

        const crateKeys = new Set(crates.map(c => `${c.lastPosition!.x},${c.lastPosition!.y}`));

        // A* treating crate tiles as passable — checks if destination is reachable in principle
        const pathIgnoringCrates = aStar(from, desire.target, (f, t) => {
            if (crateKeys.has(`${t.x},${t.y}`)) return true;
            return beliefs.map.isWalkable(f, t);
        });

        if (!pathIgnoringCrates) return null; // truly unreachable even without crates

        const blockingCrates = crates.filter(c =>
            pathIgnoringCrates.some(p => p.x === c.lastPosition!.x && p.y === c.lastPosition!.y)
        );

        if (blockingCrates.length === 0) return null;

        return {
            type: "CLEAR_CRATE",
            target: desire.target, // original destination — PDDL goal; plan_parser slices at last push
            crateIds: blockingCrates.map(c => c.id),
        };
    }

    getCurrentPlan(): Plan | null {
        return this.currentPlan;
    }

    nextStep(currentPosition: Position, beliefs: Beliefs): PlanStep | "wait" | null {
        const plan = this.currentPlan;
        if (!plan) return null;
        const step = plan.steps[plan.cursor];
        if (!step) return null;
        if (step.kind !== "move") return step;

        // Detect position drift: agent must be adjacent to the step's destination.
        // Drift happens e.g. when a conveyor moves the agent after a step was acked.
        const manhattanDist = Math.abs(step.to.x - currentPosition.x) + Math.abs(step.to.y - currentPosition.y);
        if (manhattanDist !== 1) {
            console.warn(`[PLAN] Position drift: at [${currentPosition.x},${currentPosition.y}] step expects [${step.to.x},${step.to.y}]`);
            this.currentPlan = null;
            if (plan.source === "pddl") this.pddlPlanner.reset(); // re-request from corrected position
            return null;
        }

        // PDDL plans execute their exact sequence.
        // Skip isWalkable — push destinations are crate-occupied tiles (isWalkable returns false for them by design).
        // Only check for blocking agents.
        if (plan.source === "pddl") {
            const walkable = (a: Position, b: Position) => beliefs.map.isWalkable(a, b);
            return beliefs.agents.isNextBlockedByAgents(step.to, walkable) ? "wait" : step;
        }

        const walkable = (a: Position, b: Position) => beliefs.map.isWalkable(a, b);
        if (!beliefs.agents.isNextBlockedByAgents(step.to, walkable)) {
            return step;
        }

        const blockedTile = step.to;
        if (this.collision.tryDetour(plan, currentPosition, blockedTile, beliefs)) {
            return plan.steps[plan.cursor];
        }

        const decision = this.collision.onPreDetection(blockedTile);
        if (decision.kind === "block") {
            this.collision.commitBlocked(plan, currentPosition, blockedTile, decision.ttl, beliefs);
            const nextStep = plan.steps[plan.cursor] ?? null;
            if (!nextStep) this.currentPlan = null;
            return nextStep;
        }

        return "wait";
    }

    advance(): void {
        if (!this.currentPlan) return;
        const plan = this.currentPlan;
        plan.cursor++;
        if (plan.cursor >= plan.steps.length) {
            this.currentPlan = null;
            // Reset PDDL state; dropIntention() removes the CLEAR_CRATE entry from crateDesires if applicable.
            this.pddlPlanner.reset();
            this.intentionManager.dropIntention();
        }
        this.collision.reset();
    }

    invalidate(beliefs: Beliefs): boolean {
        const plan = this.currentPlan;
        if (!plan) return true;

        const step = plan.steps[plan.cursor];
        if (!step || step.kind !== "move") return true;

        const decision = this.collision.onMoveFailure(step.to);
        if (decision.kind === "block") {
            beliefs.map.markBlocked(step.to, decision.ttl);
            this.collision.reset();
        }

        this.currentPlan = null;
        return true;
    }

    validate(currentPosition: Position, beliefs: Beliefs): boolean {
        const plan = this.currentPlan;
        if (!plan) return false;

        let cur = currentPosition;
        for (let i = plan.cursor; i < plan.steps.length; i++) {
            const s = plan.steps[i];
            if (s.kind !== "move") continue;
            if (!beliefs.map.isWalkable(cur, s.to)) return false;
            cur = s.to;
        }
        return true;
    }
}
