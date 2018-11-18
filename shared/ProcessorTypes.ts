
export type FailedAstrometryResult = {
    found: false;
}

export type SucceededAstrometryResult = {
    found: true;
    raCenter: number;
    decCenter: number;
    refPixX: number;
    refPixY: number;
    cd1_1: number;
    cd1_2: number;
    cd2_1: number;
    cd2_2: number;
}

export type AstrometryResult = FailedAstrometryResult|SucceededAstrometryResult;

export type AstrometryStatus = {
    status: "empty"|"computing"|"syncing"|"moving"|"ready";
    image: string | null;
    result: AstrometryResult|null;
}

export type ProcessorContentRequest = {
    path: string;
}

export type ProcessorStarFieldRequest = {
    source: ProcessorContentRequest;
}

export type ProcessorAstrometryRequest = {
    exePath: string;
    libraryPath: string;
    fieldMin: number;
    fieldMax: number;
    raCenterEstimate: number;
    decCenterEstimate: number;
    searchRadius: number;
    numberOfBinInUniformize: 10;
    source: ProcessorStarFieldRequest;
}
export type ProcessorRequest = {
    astrometry?: ProcessorAstrometryRequest
}