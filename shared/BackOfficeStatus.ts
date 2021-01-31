import { AstrometryResult } from "./ProcessorTypes";
import { IndiMessage } from "./IndiTypes";

export type ImagingSetup = {
    name: string;
    cameraDevice: null|string;
    focuserDevice: null|string;
    filterWheelDevice: null|string;

    availableFilters: string[];
}

export type CameraDeviceSettings = {
    prefix?:string;
    type?:string;
    bin?: number;
    exposure: number;
    iso?: null|string;
    path?: string;
    preferedFocuserDevice?: null|string;
}

export type CameraDeviceDynState = {
    focuserDevice?: null|string;
    spyRecommanded?: boolean;
};

export type DitheringSettings = {
    amount: number;
    raOnly: boolean;
    pixels: number;
    time: number;
    timeout: number;
};

export type SequenceDitheringSettings = DitheringSettings & {
    // If set, apply the dithering only on step entrance (whatever repeat, foreach are)
    once: boolean;
}

export type SequenceStepParameters = {
    exposure?:number;
    iso?: string;
    type?: string;
    bin?: number;
    filter?: string|null;

    dithering?: null|SequenceDitheringSettings;
}

export type SequenceStep = SequenceStepParameters & {
    repeat?: number;

    // If both repeat and foreach are set, the foreach cycle "repeat" times
    foreach?: SequenceForeach<keyof SequenceStepParameters>;
    childs?: {
        list: string[];
        byuuid: {[uuid:string]:SequenceStep}
    };
}

export type SequenceForeachItem<K extends keyof SequenceStepParameters> = {
    [KEY in K]?: SequenceStepParameters[KEY]
};

export type SequenceForeach<K extends keyof SequenceStepParameters> = {
    param: K;
    list: string[];
    byuuid: {[uuid: string] : SequenceForeachItem<K>};
}

export type SequenceStepStatus = {
    /** Updated on each loop start */
    execUuid: string;
    parentExecUuid: string|null;
    /** Erased on each arrival */
    finishedLoopCount: number;
    /** Erased on each arrival / foreach increment */
    currentForeach: string|null;
    finishedForeach: {[id:string]: boolean} | null;
    activeChild?: string;
    lastDitheredExecUuid?: string;
}

export type ImageStats = {
    fwhm?: number;
    starCount?: number;
    guideStats?: PhdGuideStats;
    backgroundLevel?: number;
}

export type Sequence = {
    status: "idle"|"running"|"paused"|"done"|"error";
    progress: string | null;
    title: string;
    imagingSetup: string | null;
    errorMessage: string|null;
    count?:number;
    done?:boolean;

    root: SequenceStep;
    stepStatus: {[id: string]: SequenceStepStatus};

    // uuids of images
    images: string [];
    storedImages?: Array<ImageStatus&ImageStats>;
    imageStats: {[uid:string]: ImageStats};
}

export type IndiMessageWithUid = IndiMessage & {
    uid: string;
};

export type FilterWheelDeltas = {[filterId:string]: number};

export type IndiDeviceConfiguration = {
    driver: string;
    config?: string;
    skeleton?: string;
    prefix?: string;
    options: {
        autoGphotoSensorSize?: boolean;
        disableAskCoverScope?: boolean;
        autoConnect?: boolean;
        confirmFilterChange?: boolean;

        // For focuser device
        filterDeltaByFocuser?: {[focuserId: string]: FilterWheelDeltas}
    };
};

export type IndiServerConfiguration = {
    path: null;
    fifopath: null;
    devices: {[id: string]: IndiDeviceConfiguration};
    autorun: boolean;
}

export type IndiServerState = IndiServerConfiguration & {
    restartList: string[];
};

export type IndiProperty = {
    $_: string;
    $name: string;
    $label: string;
    $format: string;
    $min?:string;
    $max?:string;
}

export type IndiVector = {
    $label: string;
    $type: "Number"|"Text"|"Switch"|"BLOB"|"Light",
    $perm: string;
    $rule: string;
    $group: string;
    $state: "Busy"|"Error"|"Ok"|"Idle"|"";
    $timestamp: string;
    $message: string;
    $rev: number;
    childNames: string[];
    childs: {
        [propId: string]: IndiProperty
    };
}

export type IndiDevice = {
    [vecId: string]: IndiVector
}

export type IndiManagerStatus = {
    status: "error"|"connecting"|"connected";
    configuration: {
        indiServer: IndiServerConfiguration;
        driverPath: string;
    };
    driverToGroup: {[driver: string]: string};
    deviceTree: {[deviceId:string]:IndiDevice}
    messages: {
        byUid: {[uuid:string]:IndiMessageWithUid}
    };
}

export type IndiManagerSetPropertyRequest = {
    data: {
        dev: string;
        vec: string;
        children: {name:string, value:string}[]
    }
}

export type ImageStatus = {
    path: string;
    device: string;
}

export type CameraConfiguration = {
    defaultImagePath?: string;
    defaultImagePrefix?: string;
    fakeImages?: string[];
    fakeImagePath?: string;
    preferedDevice: string | null;
    deviceSettings : {[id: string] : CameraDeviceSettings};
};

export type StreamSize = {
    width: number;
    height: number;
};

// When content is actually a subframe
// Gives actual margin in 0-1 range
export type Window = {
    top: number;
    left: number;
    bottom: number;
    right: number;
};

export type CameraStream = {
    streamId: string|null;
    streamSize: StreamSize|null;
    serial: number|null;            // Really usefull ?
    autoexp: number|null;           // Trigger events or just wait
    frameSize: StreamSize|null;
    subframe: Window|null;
};

export type CameraShoot = {
    exposure: number;
    expLeft: number;
    managed: boolean;
    status: 'External'|'init'|'Downloading'|'Exposing';
} & Partial<CameraDeviceSettings>;

export type CameraStatus = {
    status: string;
    // TODO : remove
    selectedDevice: string | null;
    availableDevices: string [];
    currentStreams: {[deviceId: string]: CameraStream};
    currentShoots: {[deviceId:string]:CameraShoot};
    lastByDevices: {[deviceId:string]:string};
    dynStateByDevices: {[deviceId: string] : CameraDeviceDynState};
    images: {
        list: string[];
        byuuid: {[uuid:string]:ImageStatus}
    };

    // FIXME: config
    configuration: CameraConfiguration;
}

export type SequenceStatus = {
    sequences: {
        list: string[],
        byuuid: {[uuid: string]:Sequence}
    };
}

export type NotificationItem = {
    title: string;
    time: number;

    // oneshot must be closed by ui as soon as displayed
    // dialog expect a result
    type: "oneshot"|"dialog";
    buttons: null | Array<
        {
            title: string;
            value: any;
        }
    >
}

export type NotificationStatus = {
    byuuid: {[uuid: string]: NotificationItem}
    list: string[];
}

export type FocuserSettings = {
    range: number;
    steps: number;
    backlash: number;
    lowestFirst : boolean;
    targetCurrentPos: boolean;
    targetPos: number;
}

export type AutoFocusConfiguration = {
    preferedCamera: string|null;

    // By focuser settings
    settings: {[id: string]:FocuserSettings};
};

export type AutoFocusStatus = {
    status: "idle"|"running"|"done"|"error"|"interrupted";
    camera: null|string;
    focuser: null|string;
    error: null|string;
    firstStep: null|number;
    lastStep: null|number;
    points: {[id:string]:{fwhm: number|null}};
    predicted: {[id:string]:{fwhm: number}};
    targetStep: null|number;
}

export type FocuserUpdateCurrentSettingsRequest = {
    diff: any
}

export type FocuserStatus = {
    selectedCamera: string|null;
    availableFocusers: string[];
    config: AutoFocusConfiguration;
    current: AutoFocusStatus;
}

export type FilterWheelDynState = {
    targetFilterPos: number|null;
    currentFilterPos: number|null;
    filterIds: string[];
}

export type FilterSetting = {
    color: string|null;
}

export type FilterWheelStatus = {
    availableDevices: string[];
    dynStateByDevices: {[deviceId: string] : FilterWheelDynState};
}

export type AstrometrySettings = {
    initialFieldMin: number;
    initialFieldMax: number;

    // Use scope position when available
    useMountPosition: boolean;
    // When useScopePosition is true (else, 180°)
    initialSearchRadius: number|null;

    // Used after a successfull sync
    narrowedSearchRadius: number|null;
    // Used after a successfull search
    narrowedFieldPercent: number;

    polarAlign: PolarAlignSettings;
    preferedScope: string|null;
}

export type PolarAlignSettings = {
    slewRate: string;
    sampleCount: number;
    angle: number;
    minAltitude: number;
    dyn_nextFrameIsReferenceFrame?: boolean;
}

export type PolarAlignAxisResult = {
    alt: number;
    az: number;
    tooHigh: number;
    tooEast: number;
    distance: number;
}

export type PolarAlignPositionWarning = {
    id: string;
    // From 0 : do not accept to 1 ok
    dst: number;
}

export type PolarAlignStatus = {
    status: "initialConfirm"|"running"|"paused"|"adjusting"|"done";
    data: {
        [id: string]:{relRaDeg: number, dec: number}
    };

    // Valid for status running, pause, done
    fatalError: null|string;

    stepId: number;
    maxStepId: number;
    astrometrySuccess: number;
    astrometryFailed: number;
    shootDone: number;
    shootRunning: boolean;
    scopeMoving: boolean;
    astrometryRunning: boolean;

    axis?: null | PolarAlignAxisResult;
    hasRefFrame: boolean;

    adjustError: null|string;
    adjusting: null|"frame"|"refframe";

    adjustPositionWarning: null|PolarAlignPositionWarning;
    // When warning is not computed
    adjustPositionError: null|string;
}

export type AstrometryWizard = {
    id: string;
    title: string;

    paused: boolean;
    // Valid when !paused
    interruptible: boolean;
    // Valid when paused
    hasNext: null|string;

    polarAlignment?: PolarAlignStatus;
}

export type AstrometryStatus = {
    status: "empty"|"error"|"computing"|"ready";
    scopeStatus: "idle"|"moving"|"syncing";
    scopeReady: boolean;
    scopeMovedSinceImage: boolean;
    scopeDetails: string | null;
    lastOperationError: string|null;
    image: string | null;
    result: AstrometryResult|null;
    availableScopes: string [];
    selectedScope: string | null;
    settings: AstrometrySettings;
    // set during GOTOs
    target: {ra: number, dec:number}|null;

    // Set on first success (FIXME: should reset on camera change)
    narrowedField: number|null;
    // Set after one sync is ok (FIXME: should reset on mount/camera change)
    useNarrowedSearchRadius: boolean;

    runningWizard: null|AstrometryWizard;
}

export type ProcessConfiguration = {
    autorun: boolean;
    path: string| null;
    env: {[id:string]:string};
}

export type PhdConfiguration = ProcessConfiguration & {
    preferredDithering: DitheringSettings;
}

export type PhdGuideStep = {
    Timestamp: number;
    RADistanceRaw?: number,
    DECDistanceRaw?: number,
    settling?: boolean;
}


export type PhdSettling = {
    running: boolean;
    status?: boolean;
    error?: any;
}

export type PhdStar = {
    SNR: number;
    StarMass: number;
}

export type PhdAppState ="NotConnected" | "Guiding" | "Paused" | "Calibrating" | "Looping" | "Stopped" | "LostLock"; 

export type PhdEquipmentStatus = {
    name: string;
    connected: boolean;
}

export type PhdServerChildConfiguration = {
    val?: string;
    props?: PhdServerConfiguration;
}

export type PhdServerConfiguration = {
    [id: string]: PhdServerChildConfiguration;
};

export type PhdGuideStats = {
    RADistanceRMS:number|null;
    DECDistanceRMS:number|null;
    RADECDistanceRMS:number|null;
    RADistancePeak: number|null;
    DECDistancePeak: number|null;
    RADECDistancePeak: number|null;
}

export type PhdStatus = PhdGuideStats & {
    phd_started: boolean;
    connected: boolean;
    AppState: PhdAppState;
    settling: PhdSettling|null;
    /** Polled configuration from PHD */
    serverConfiguration: PhdServerConfiguration|null;
    guideSteps: {[id:string]: PhdGuideStep};
    configuration: PhdConfiguration;
    firstStepOfRun: string;
    star: PhdStar|null;
    currentEquipment: {
        camera?: PhdEquipmentStatus;
        mount?:PhdEquipmentStatus;
    };
    calibration: null|any;
    exposureDurations: Array<number>;
    exposure: null|number;
    lockPosition: null|{x: number, y:number};
    streamingCamera: string|null;
};

export type ImagingSetupStatus = {
    availableImagingSetups: string[];
    configuration: {
        currentImagingSetup: string|null;
        byuuid: {[uuid:string]:ImagingSetup}
    }
};

export type ToolConfig = {
    desc?: string;
    hidden?: boolean;
    trigger?: "atstart";
    confirm?: string;
    cmd: string[];
};

export type ToolExecuterStatus = {
    tools: {[id:string]:ToolConfig};
};

export type TriggerConfig = {
    desc: string;
    device: string;
    vector: string;
    property: string[]|string;
    value: string[]|string;
}

export type TriggerExecuterStatus = {
    triggers: {[id:string]:TriggerConfig};
}

export type UIConfig = {
    // port available for direct image/video DL (bypass ssl)
    directPort: number;
}

export type BackofficeStatus = {
    apps: {[appId:string]: {enabled:boolean,position:number}};
    indiManager: IndiManagerStatus;
    camera: CameraStatus;
    imagingSetup: ImagingSetupStatus;
    sequence: SequenceStatus;
    filterWheel: FilterWheelStatus;
    astrometry: AstrometryStatus;
    focuser: FocuserStatus;
    phd: PhdStatus;
    toolExecuter: ToolExecuterStatus;
    triggerExecuter: TriggerExecuterStatus;
    notification: NotificationStatus;
    uiConfig: UIConfig;
};