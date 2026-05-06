import type { Position } from "../../../models/position.js";
import type { Beliefs } from "../belief/beliefs.js";
import type { Planner } from "../plan/planner.js";
import type { Intentions } from "../intention/intentions.js";

/**
 * Drives the action loop: asks the Planner for the next step on the current Plan,
 * emits the corresponding socket action, and reports success/failure back to the Planner.
 */
export class Executor {
    private executing = false;

    /**
     * @param socket Socket connection to the Deliveroo.js server, used to emit actions.
     * @param beliefs The agent's current beliefs, used to inform action execution and report results back to the planner.
     * @param planner The agent's planner, used to get the current plan and report action execution results for replanning if necessary.
     * @param replan Called after each successful move to rebuild desires/intentions with the updated position, allowing position-sensitive preemption (e.g. on-tile pickup) without waiting for the next sensing event.
     * @param debug Set to true to enable debug logging of execution steps and results (dev mode).
     */
    constructor(
        private readonly socket: any,
        private readonly beliefs: Beliefs,
        private readonly intentions: Intentions,
        private readonly planner: Planner,
        private readonly debug: boolean,
    ) {}

    /**
     * Perform the pickup action at the given position, and report success/failure back to the planner for replanning decisions.
     * @param pos The position to perform the pickup action at, used to identify the parcel being picked up for belief updates.
     * @returns true if the pickup action succeeded and beliefs were updated, false if the action failed
    */
    private async handlePickup(pos: Position): Promise<boolean> {
        const ack = await this.socket.emitPickup() as Array<{ id?: string; parcelId?: string }> | null;
        if (ack === null) return false;
        const parcel = this.beliefs.parcels.getParcelAt(pos);
        if (parcel) this.beliefs.parcels.markPickup(parcel);
        return true;
    }

    /**
     * Perform the putdown action at the given position, and report success/failure back to the planner for replanning decisions.
     * @param meId The ID of the agent performing the putdown action.
     * @returns true if the putdown action succeeded and beliefs were updated, false if the action failed
     */
    private async handlePutdown(meId: string): Promise<boolean> {
        const ack = await this.socket.emitPutdown() as Array<{ id: string }>;
        if (ack.length === 0) return false;
        this.beliefs.parcels.cleanDeliveredParcels(this.beliefs.parcels.getCarriedByAgent(meId));
        return true;
    }

    /**
     * Perform the move action in the given direction, and report success/failure back to the planner for replanning decisions.
     * @param direction The direction to move in, used to update beliefs about the agent's position if the move succeeds.
     * @returns true if the move action succeeded and beliefs were updated, false if the action failed (e.g. due to a blocked tile)
     */
    private async handleMove(direction: string): Promise<boolean> {
        const result = await this.socket.emitMove(direction) as Position | false;
        if (result === false) return false;
        this.beliefs.agents.updateMyPosition(result);
        return true;
    }

    /**
     * Execute one step of the current plan.
     * @returns true if there is still a plan after this step.
     */
    async execute(): Promise<boolean> {
        const me = this.beliefs.agents.getCurrentMe();
        if (!me?.lastPosition) return false;
        const currentPosition = me.lastPosition;

        // If there is no current plan, or the current plan is invalid under the latest beliefs, do nothing and wait for the next execution cycle to trigger replanning with the updated beliefs.
        const plan = this.planner.getCurrentPlan();
        if (!plan) return false;

        // Get the next step from the planner, which may trigger collision management logic if the step is blocked by another agent.
        const step = this.planner.nextStep(currentPosition, this.beliefs);

        // If the planner indicates to wait (e.g. due to a temporarily blocked tile), or if there is no safe step to execute, do nothing and wait for the next execution cycle to re-attempt.
        if (step === "wait") {
            if (this.debug) console.log("[EXECUTE] Waiting for blocked tile to clear.");
            return false;
        }
        // If there is no step to execute (e.g. plan became invalid and has no alternative steps), do nothing and wait for the next execution cycle to trigger replanning.
        if (step === null) {
            if (this.debug) console.log("[EXECUTE] No safe step to execute.");
            return false;
        }
        // If we have a valid step to execute, perform it and report the result back to the planner for potential replanning decisions.
        if (this.debug) console.log("[EXECUTE] Step:", step);

        // Perform the step and get the result to report back to the planner.
        let succeeded: boolean;
        if (step.kind === "pickup") succeeded = await this.handlePickup(currentPosition);
        else if (step.kind === "putdown") succeeded = await this.handlePutdown(me.id);
        else succeeded = await this.handleMove(step.direction);

        // Report the result back to the planner, which may advance the plan or trigger replanning if the action failed.
        if (succeeded) {
            this.planner.advance();
            // Refresh the beliefs and intentions after a successful move to allow for position-sensitive replanning
            this.intentions.update(this.beliefs);
            this.planner.plan(this.beliefs);
        } else {
            this.planner.invalidate(this.beliefs);
        }

        // Return whether there is still a plan to execute after this step.
        return this.planner.getCurrentPlan() !== null;
    }

    async start(): Promise<void> {
        if (this.executing) return;
        this.executing = true;
        try {
            while (this.executing) {
                const shouldContinue = await this.execute();
                if (!shouldContinue) await new Promise(r => setTimeout(r, 200));
            }
        } catch (err) {
            if (this.debug) console.error("[EXECUTE] Execution error:", err);
        } finally {
            this.executing = false;
        }
    }
}
