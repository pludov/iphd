import {Application as ExpressApplicationFromExpress} from "express-serve-static-core";

import Phd from './Phd';
import Camera from './Camera';
import Astrometry from './Astrometry';
import IndiManager from "./IndiManager";
import ImageProcessor from "./ImageProcessor";
import TriggerExecuter from "./TriggerExecuter";
import ToolExecuter from "./ToolExecuter";
import Focuser from "./Focuser";
import FilterWheel from "./FilterWheel";
import SequenceManager from "./SequenceManager";
import Notification from "./Notification";
import ImagingSetupManager from "./ImagingSetupManager";

export type ExpressApplication = ExpressApplicationFromExpress;

export type AppContext = {
    imageProcessor: ImageProcessor;
    phd: Phd;
    indiManager: IndiManager;
    camera: Camera;
    sequenceManager: SequenceManager;
    filterWheel: FilterWheel;
    triggerExecuter: TriggerExecuter;
    toolExecuter: ToolExecuter;
    focuser: Focuser;
    astrometry: Astrometry;
    notification: Notification;
    imagingSetupManager: ImagingSetupManager;
};

