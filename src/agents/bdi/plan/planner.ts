import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { planAStar } from "./astar_planner.js";
import { PddlPlanner } from "./pddl_planner.js";
import { aStar } from "./navigation/a_star.js";
import { CollisionManager } from "./collision/collision_manager.js";

import { Intentions } from "../intention/intentions.js";

import type { Beliefs } from "../belief/beliefs.js";
import type { Position } from "../../../models/position.js";
import type { Plan, PlanStep } from "../../../models/plan.js";
import type { NavigationDesire, ClearCrateDesire } from "../../../models/desires.js";
import { generateDesires } from "../desire/desire_generator.js";

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

        // CLEAR_CRATE: consume a ready PDDL plan or fire the solver once (no-op if in-flight).
        if (desire.type === "CLEAR_CRATE") {
            const ready = this.pddlPlanner.consume();
            console.log(`[PDDL] CLEAR_CRATE at head — waiting=${this.pddlPlanner.isWaiting()} ready=${!!ready}`);
            if (ready) { 
                this.currentPlan = ready; return ready; }
            // If already at target, drop intention and replan instead of sending to PDDL
            if (me.lastPosition.x === desire.target.x && me.lastPosition.y === desire.target.y) {
                this.intentionManager.dropIntention();
                return this.plan(beliefs);
            }
            this.pddlPlanner.request(desire, beliefs, plan => {
                if (!plan) {
                    // Solver failed — give up on crate clearing and try something else.
                    this.beliefs.setPendingCrateDesire(null);
                    this.intentionManager.dropIntention();
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
                console.log(`[PDDL] Crate block detected — setting pendingCrateDesire for ${crateBlock.crateIds.join(",")}`);
                this.beliefs.setPendingCrateDesire(crateBlock);
                console.log(`[PDDL] Replanning after setting pendingCrateDesire...`);
                this.intentionManager.update(beliefs, generateDesires(beliefs));
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

        const blockingIds = crates
            .filter(c => pathIgnoringCrates.some(p => p.x === c.lastPosition!.x && p.y === c.lastPosition!.y))
            .map(c => c.id);

        if (blockingIds.length === 0) return null;

        return { type: "CLEAR_CRATE", target: desire.target, crateIds: blockingIds };
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
            // Clear PDDL state and the crate desire so desire_generator stops injecting CLEAR_CRATE.
            this.beliefs.setPendingCrateDesire(null);
            this.pddlPlanner.reset();
            this.intentionManager.dropIntention();
        }
        this.collision.reset();
    }

    invalidate(beliefs: Beliefs): boolean {
        const plan = this.currentPlan;
        if (!plan) return true;

        // PDDL plans run to completion — a transient move failure retries on the next tick.
        if (plan.source === "pddl") return false;

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
