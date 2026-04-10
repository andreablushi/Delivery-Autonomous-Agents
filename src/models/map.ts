export type Tile = {
    x: number;
    y: number;
    type: '0' | '1' | '2' | '3' | '4' | '5' | '5!' | '←' | '↑' | '→' | '↓';
};

export type GameMap = {
    width: number;
    height: number;
    tiles: Tile[];
};