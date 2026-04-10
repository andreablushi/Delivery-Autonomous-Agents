/**
 * Beliefs class represents the agent's beliefs about itself, the environment, and other agents.
 * It is updated based on the sensing events received from the BDI agent's perceive method.
 */
export class Beliefs {
    settings = null;
    map = null;
    me = null;
    friends = new Map();
    enemies = new Map();
    /**
     * Set the game configuration in the beliefs.
    */
    setConfig(config) {
        this.settings = {
            title: config.GAME.title,
            description: config.GAME.description,
            max_player: config.GAME.maxPlayers,
            player_setting: {
                movement_duration: config.GAME.player.movement_duration,
                observation_distance: config.GAME.player.observation_distance,
                parcel_capacity: config.GAME.player.capacity,
            },
            parcel_setting: {
                parcel_spawn_interval: config.GAME.parcels.generation_event,
                reward_decay_interval: config.GAME.parcels.decaying_event,
                max_concurrent_parcels: config.GAME.parcels.max,
                reward_avg: config.GAME.parcels.reward_avg,
                reward_variance: config.GAME.parcels.reward_variance,
            }
        };
    }
    /**
     * Set the game map information in the beliefs.
    */
    setMap(width, height, tiles) {
        this.map = { width, height, tiles };
    }
    /*
        * Initialize the agent's own information in the beliefs based on the provided data.
    */
    initiateMe(me_info) {
        this.me = {
            id: me_info.id,
            name: me_info.name,
            teamId: me_info.teamId,
            score: 0,
            penalty: 0,
            lastPosition: me_info.x != null && me_info.y != null ? { x: me_info.x, y: me_info.y } : null,
        };
    }
    /**
     * Update the agent's own status based on the provided information.
     */
    updateMeStatus(me_info) {
        if (!this.me)
            return;
        this.me.score = me_info.score;
        this.me.penalty = me_info.penalty;
        if (me_info.x != null && me_info.y != null)
            this.me.lastPosition = { x: me_info.x, y: me_info.y };
    }
    /**
     * Update beliefs about other agents based on the sensing event data.
     */
    updateOtherAgents(agents) {
        agents.forEach(agent => {
            const agentData = {
                id: agent.id,
                name: agent.name,
                teamId: agent.teamId,
                score: agent.score,
                penalty: agent.penalty,
                lastPosition: agent.x != null && agent.y != null ? { x: agent.x, y: agent.y } : null,
            };
            if (agent.teamId === this.me?.teamId) {
                this.friends.set(agent.id, agentData);
            }
            else {
                this.enemies.set(agent.id, agentData);
            }
        });
    }
}
