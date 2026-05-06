import type { PlanStep, MoveDirection } from "../../../../models/plan.js";

export type PddlPlanStep = { parallel: boolean; action: string; args: string[] };

function parseTileId(id: string): { x: number; y: number } {
    // Solver returns uppercase IDs like T_8_6; split on _ after lowercasing
    const parts = id.toLowerCase().split("_");
    return { x: Number(parts[1]), y: Number(parts[2]) };
}

/** Convert a raw plan string "(MOVE-UP T_8_6 T_8_7)\n..." into PddlPlanStep[]. */
export function parsePlanString(planStr: string): PddlPlanStep[] {
    return planStr
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean)
        .map(line => {
            const parts = line.replace(/[()]/g, "").trim().split(/\s+/);
            return { parallel: false, action: parts[0], args: parts.slice(1) };
        });
}

export function parsePddlPlan(rawPlan: PddlPlanStep[]): PlanStep[] {
    const steps: PlanStep[] = [];
    let lastPushIdx = -1;

    for (const { action, args } of rawPlan) {
        const a = action.toLowerCase();
        switch (a) {
            case "move-up":
            case "move-down":
            case "move-left":
            case "move-right": {
                const dir = a.split("-")[1] as MoveDirection;
                steps.push({ kind: "move", to: parseTileId(args[1]), direction: dir });
                break;
            }
            // push-X: agent physically moves into crateFrom (args[1])
            case "push-up":
            case "push-down":
            case "push-left":
            case "push-right": {
                const dir = a.split("-")[1] as MoveDirection;
                steps.push({ kind: "move", to: parseTileId(args[1]), direction: dir });
                lastPushIdx = steps.length - 1;
                break;
            }
            case "pickup":
                steps.push({ kind: "pickup" });
                break;
            case "putdown":
                steps.push({ kind: "putdown" });
                break;
            default:
                console.warn(`[PDDL] Unknown action: ${action}`);
        }
    }

    // Stop after the last push — agent re-enters normal BDI loop once crates are cleared.
    return lastPushIdx >= 0 ? steps.slice(0, lastPushIdx + 1) : steps;
}
