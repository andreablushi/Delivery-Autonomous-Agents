/**
 * @typedef {{x: number, y: number}} Position
*/
/**
 * @typedef {Object} Agent
 * @property {string} id
 * @property {string} name
 * @property {string} teamId
 * @property {number} score
 * @property {number} penalty
 * @property {Position | null} lastPosition
*/
export class Agent {
    constructor(id, name, teamId, score = 0, penalty = 0, lastPosition = null) {
        this.id = id;
        this.name = name;
        this.teamId = teamId;
        this.score = score;
        this.penalty = penalty;
        this.lastPosition = lastPosition;
    }
    /**
     * @param {number} score
     * @param {number} penalty
     * @param {Position} position
     */
    updateStatus(score, penalty, position) {
        this.lastPosition = { x: position.x, y: position.y };
        this.score = score;
        this.penalty = penalty;
    }
}
