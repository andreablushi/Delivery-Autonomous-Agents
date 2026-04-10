export type Position = { x: number; y: number };

export type Agent = {
    id: string;
    name: string;
    teamId: string;
    score: number;
    penalty: number;
    lastPosition: Position | null;
};
