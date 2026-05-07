import type { Beliefs } from "../../belief/beliefs.js";
import type { ClearCrateDesire } from "../../../../models/desires.js";
import type { Position } from "../../../../models/position.js";
import { TILE_TYPE, type TileType } from "../../../../models/tile_type.js";

function isConveyor(type: TileType): boolean {
    return type === TILE_TYPE.CONVEYOR_LEFT
        || type === TILE_TYPE.CONVEYOR_RIGHT
        || type === TILE_TYPE.CONVEYOR_UP
        || type === TILE_TYPE.CONVEYOR_DOWN;
}

function sanitize(id: string): string {
    return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function tileId(x: number, y: number): string {
    return `t_${x}_${y}`;
}

const DIRS = [
    { dx: 0, dy: 1, pred: "adj-up" },
    { dx: 0, dy: -1, pred: "adj-down" },
    { dx: -1, dy: 0, pred: "adj-left" },
    { dx: 1, dy: 0, pred: "adj-right" },
] as const;

export function buildProblem(from: Position, intention: ClearCrateDesire, beliefs: Beliefs): string {
    const mapBeliefs = beliefs.map;

    const allTiles: Position[] = [];
    const size = mapBeliefs.getMapSize();
    if (!size) return "";   // map not yet loaded
    const { width: mapWidth, height: mapHeight } = size;
    for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
            const tile = mapBeliefs.getTileAt({ x, y });
            if (tile && tile.type !== TILE_TYPE.WALL && !isConveyor(tile.type)) allTiles.push({ x, y });
        }
    }

    const crates = mapBeliefs.getCurrentCrates().filter(c => c.lastPosition !== null);
    const cratePositionSet = new Set(crates.map(c => tileId(c.lastPosition!.x, c.lastPosition!.y)));
    const crateSpaceSet = new Set(mapBeliefs.getCrateSpaceTiles().map(t => tileId(t.x, t.y)));

    const init: string[] = [];

    init.push(`(at ${tileId(from.x, from.y)})`);

    for (const { x, y } of allTiles) {
        for (const { dx, dy, pred } of DIRS) {
            const neighbor = mapBeliefs.getTileAt({ x: x + dx, y: y + dy });
            if (neighbor && neighbor.type !== TILE_TYPE.WALL && !isConveyor(neighbor.type)) {
                init.push(`(${pred} ${tileId(x, y)} ${tileId(x + dx, y + dy)})`);
            }
        }
    }

    for (const c of crates) {
        init.push(`(crate-at crate_${sanitize(c.id)} ${tileId(c.lastPosition!.x, c.lastPosition!.y)})`);
    }

    for (const t of allTiles) {
        if (!cratePositionSet.has(tileId(t.x, t.y))) {
            init.push(`(crate-free ${tileId(t.x, t.y)})`);
        }
    }

    for (const id of crateSpaceSet) {
        init.push(`(crate-space ${id})`);
    }

    const tileObjs = allTiles.map(t => tileId(t.x, t.y)).join(" ");
    const crateObjs = crates.map(c => `crate_${sanitize(c.id)}`).join(" ");
    const objects = [
        tileObjs ? `${tileObjs} - tile` : "",
        crateObjs ? `${crateObjs} - crate` : "",
    ].filter(Boolean).join(" ");

    console.log("Target position:", intention.target);
    return `(define (problem crate-clear)
    (:domain deliveroo-crates)
    (:objects ${objects})
    (:init ${init.join(" ")})
    (:goal (and (at ${tileId(intention.target.x, intention.target.y)})))
)`;
}
