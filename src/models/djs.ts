// SDK payload types
export type IOAgent = {
    id: string;
    name: string;
    teamId: string;
    teamName: string;
    x?: number;
    y?: number;
    score: number;
    penalty: number;
}

export type IOParcel = {
    id: string;
    x: number;
    y: number;
    carriedBy?: string;
    reward: number;
}

export type IOCrate = {
    id: string;
    x: number;
    y: number;
}

export type IOTile = {
    x: number;
    y: number;
    type: '0' | '1' | '2' | '3' | '4' | '5' | '5!' | '←' | '↑' | '→' | '↓';
}

export type IOMap = {
    width: number;
    height: number;
    tiles: IOTile[];
}

export type IOConfig = {
    CLOCK: number,
    PENALTY: number,
    AGENT_TIMEOUT: number,
    BROADCAST_LOGS: boolean,
    GAME: {
        title: string,
        description: string,
        maxPlayers: number,
        map: { width: number, height: number, tiles: IOTile[] },
        npcs: [IOAgent[]],
        parcels: {
            generation_event: string,
            decaying_event: string,
            max: number,
            reward_avg: number,
            reward_variance: number
        },
        player: { 
            movement_duration: number,
            observation_distance: number,
            capacity: number 
        }
    }
}

export type IOSensing = {
    positions: { x: number; y: number }[];
    agents: IOAgent[];
    parcels: IOParcel[];
    crates: IOCrate[];
}

export type IOInfo = {
    ms: number;
    frame: number;
    fps: number;
    heapUsed: number;
    heapTotal: number;
}

export type IOLogMeta = {
    src: 'server' | 'client';
    ms: number;
    frame: number;
    socket: string;
    id: string;
    name: string;
}