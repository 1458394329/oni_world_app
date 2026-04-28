declare module "*.png" {
    const value: string;
    export default value;
}

declare module 'react-bootstrap-icons/dist/icons/translate' {
    const value: Icon;
    export default value;
}

declare module 'react-bootstrap-icons/dist/icons/sun' {
    const value: Icon;
    export default value;
}

declare module 'react-bootstrap-icons/dist/icons/moon-stars' {
    const value: Icon;
    export default value;
}

declare module 'react-bootstrap-icons/dist/icons/github' {
    const value: Icon;
    export default value;
}

interface Point {
    x: number;
    y: number;
}

interface Site {
    zone: number;
    poly: Array<Point>;
}

interface Description {
    type: number;
    key: string;
    name: string;
}

interface GeyserFilterRule {
    index: number;
    min: number;
    max: number;
}

interface SearchFilters {
    traitMask: number;
    geysers: Array<GeyserFilterRule>;
}

interface SearchStatus {
    exact: boolean;
    attempts: number;
}

interface Geyser {
    index: number;
    pos: Point;
    desc: Description;
}

interface Cluster {
    type: number;
    index: number;
    max: number;
    prefix: string;
    name: string;
    traits: string;
}

interface World {
    type: number;
    seed: number;
    coord: string;
    size: Point;
    starting: Point;
    traits: Array<number>;
    sites: Array<Site>;
    geysers: Array<Geyser>;
}

declare const Module: {
    wasm: Uint8Array | null;
    data: Uint8Array | null;
    worlds: Array<World>;
    sprite: Array<ImageBitmap>;
    searchStatus: SearchStatus;
    HEAP32: Int32Array;
    HEAPU8: Uint8Array;
    updateWorld(type: number, count: number, data: number): void;
    locateFile(path: string, prefix: string): string;
    onRuntimeInitialized(): void;
    app_init(seed: number): void;
    app_generate(
        cluster: number,
        seed: number,
        mixing: number,
        traitMask: number,
        geyserCount: number,
        geyserDataPtr: number
    ): boolean;
    malloc(size: number): number;
    free(ptr: number): void;
};
