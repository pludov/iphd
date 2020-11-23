import CancellationToken from 'cancellationtoken';
import {BackofficeStatus, ImagingSetup, ImagingSetupStatus} from './shared/BackOfficeStatus';
import { ExpressApplication, AppContext } from "./ModuleBase";
import {IdGenerator} from "./IdGenerator";
import ConfigStore from './ConfigStore';
import JsonProxy from './JsonProxy';
import * as Obj from "./Obj";
import * as RequestHandler from "./RequestHandler";
import * as BackOfficeAPI from "./shared/BackOfficeAPI";



export default class ImagingSetupManager
        implements RequestHandler.APIAppProvider<BackOfficeAPI.ImagingSetupManagerAPI> {

    appStateManager: JsonProxy<BackofficeStatus>;

    currentStatus: ImagingSetupStatus;
    context: AppContext;
    get indiManager() { return this.context.indiManager };
    get imageProcessor() { return this.context.imageProcessor };

    idGenerator = new IdGenerator("0000000000000000");

    constructor(app:ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context:AppContext) {
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().imagingSetup = {
            availableImagingSetups: [],
            configuration: {
                currentImagingSetup: null,
                byuuid: {}
            }
        };

        // Device => promise
        this.currentStatus = this.appStateManager.getTarget().imagingSetup;
        this.context = context;

        new ConfigStore(appStateManager, 'imagingSetup', ['imagingSetup', 'configuration'], {
            byuuid: {}

        }, {
            byuuid: {}
        });

        // Update configuration/dyn states
        this.appStateManager.addSynchronizer(
            [ 'camera', 'availableDevices' ],
            this.initDefaultImageSetups,
            true);
        
        this.appStateManager.addSynchronizer(
            ['imagingSetup', 'configuration', 'byuuid'],
            this.updateAvailableImagingSetups,
            true);
        
        // FIXME: move that away. Multiple app could have their own imaging setup i guess
        this.appStateManager.addSynchronizer(
            ['imagingSetup', 'availableImagingSetups'],
            this.updateCurrentImagingSetup,
            true);
         
        // TODO: Add synchronizer for available filters per filterwheel (so report filterwheel when set)
    }

    private readonly updateAvailableImagingSetups=()=>
    {
        this.currentStatus.availableImagingSetups = Object.keys(this.currentStatus.configuration.byuuid).sort();
    }

    private readonly updateCurrentImagingSetup=()=>{
        if (this.currentStatus.configuration.currentImagingSetup === null) {
            return;
        }
        if (!Obj.hasKey(this.currentStatus.configuration.byuuid, this.currentStatus.configuration.currentImagingSetup)) {
            this.currentStatus.configuration.currentImagingSetup = null;
        }
    }

    updateFilters(imagingSetupUuid: string, reset?:boolean)
    {
        const setup = this.getByUuid(imagingSetupUuid);
        let newFilters = reset ? [] : [...setup.availableFilters];

        const filterWheelId = setup.filterWheelDevice;
        if (filterWheelId !== null) {
            const fwStateByDevices = this.appStateManager.getTarget().filterWheel.dynStateByDevices;
            if (Obj.hasKey(fwStateByDevices, filterWheelId)) {
                const fwState = fwStateByDevices[filterWheelId];
                if (fwState.filterIds.length) {
                    newFilters = [...fwState.filterIds];
                }
            }
        }

        // Dedup newFilters
        const result = [];
        const resultDedup = new Set();
        for(const id of newFilters) {
            if (!resultDedup.has(id)) {
                resultDedup.add(id);
                result.push(id);
            }
        }

        setup.availableFilters = result;
    }

    getByUuid = (uuid:string): ImagingSetup => {
        const byuuid = this.currentStatus.configuration.byuuid;
        if (!Obj.hasKey(byuuid, uuid)) {
            throw new Error("Invalid imaging setup uuid");
        }
        return byuuid[uuid];
    }

    setCurrentImagingSetup = async(ct: CancellationToken, payload: {imagingSetupUuid: string|null}) => {
        if (payload.imagingSetupUuid !== null) {
            this.getByUuid(payload.imagingSetupUuid);
        }
        this.currentStatus.configuration.currentImagingSetup = payload.imagingSetupUuid;
    }

    setDevice = async (ct:CancellationToken, payload: {imagingSetupUuid: string, device: "cameraDevice"|"focuserDevice"|"filterWheelDevice", value: string|null})=> {
        const imagingSetup = this.getByUuid(payload.imagingSetupUuid);
        if (imagingSetup[payload.device] === payload.value) {
            return;
        }

        imagingSetup[payload.device] = payload.value;
        if (payload.device === "focuserDevice") {
            this.updateFilters(payload.imagingSetupUuid, true);
        }
    }

    setName = async (ct:CancellationToken, payload: {imagingSetupUuid: string, name: string})=> {
        const imagingSetup = this.getByUuid(payload.imagingSetupUuid);
        if (imagingSetup.name === payload.name) {
            return;
        }

        if (this.getUsedNames().has(payload.name)) {
            throw new Error("Name already in use");
        }

        imagingSetup.name = payload.name;
    }

    getImageSetups() {
        const ret = [];
        const byuuid = this.currentStatus.configuration.byuuid;
        for(const uuid of Object.keys(byuuid)) {
            ret.push(byuuid[uuid]);
        }
        return ret;
    }

    getUsedNames() {
        let knownNames: Set<string> = new Set();
        for(const imageSetup of this.getImageSetups()) {
            knownNames.add(imageSetup.name);
        }
        return knownNames;
    }

    dedupName(name: string): string {
        const knownNames = this.getUsedNames();
        let id = 0;
        let suffix='';
        while (knownNames.has(name+suffix)) {
            id++;
            suffix = `(${id})`
        }
        return name + suffix;
    }

    buildDefaultImageSetup(cameraDevice: string):ImagingSetup {
        return {
            name: this.dedupName(cameraDevice),
            cameraDevice: cameraDevice,
            availableFilters: [],
            filterWheelDevice: null,
            focuserDevice: null,
        }
    }

    initDefaultImageSetups=()=> {
        let knownCameras:{[id:string]:boolean} = {};
        for(const imageSetup of this.getImageSetups()) {
            if (imageSetup.cameraDevice !== null) {
                knownCameras[imageSetup.cameraDevice] = true;
            }
        }

        const devices = this.appStateManager.getTarget().camera.availableDevices;
        for(const camera of devices) {
            if (!Obj.hasKey(knownCameras, camera)) {
                const imageSetup = this.buildDefaultImageSetup(camera);
                this.currentStatus.configuration.byuuid[this.idGenerator.next()] = imageSetup;
            }
        }
    }

    getCurrent() {
        const currentId = this.currentStatus.configuration.currentImagingSetup;
        if (currentId === null) {
            return undefined;
        }
        return this.getByUuid(currentId);
    }

    getAPI=()=>{
        return {
            setCurrentImagingSetup: this.setCurrentImagingSetup,
            setDevice: this.setDevice,
            setName: this.setName,
        }
    }

}
