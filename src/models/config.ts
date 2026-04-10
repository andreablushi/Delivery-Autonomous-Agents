export type Config = {
    clock: number;
    penalty: number;
    agent_timeout: number;
    broadcast_log: boolean;
};

export type GameSettings = {
    title: string;
    description: string;
    max_player: number;
    player_setting: PlayerSettings;
    parcel_setting: ParcelSettings;
}

export type ParcelSettings = {
    parcel_spawn_interval: string;
    reward_decay_interval: string;
    max_concurrent_parcels: number;
    reward_avg: number;
    reward_variance: number;
}

export type PlayerSettings = {
    movement_duration: number;
    observation_distance: number;
    parcel_capacity: number;
}

