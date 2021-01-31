import CancellationToken from 'cancellationtoken';
import MemoryStreams from 'memory-streams';
import { ExpressApplication, AppContext } from "./ModuleBase";
import {CameraStatus, CameraDeviceSettings, BackofficeStatus, Sequence, ImageStatus} from './shared/BackOfficeStatus';
import JsonProxy from './JsonProxy';
import { DriverInterface, Vector } from './Indi';
import {Task, createTask} from "./Task.js";
import {timestampToEpoch} from "./Indi";
import {IdGenerator} from "./IdGenerator";
import * as Obj from "./Obj";
import * as RequestHandler from "./RequestHandler";
import * as BackOfficeAPI from "./shared/BackOfficeAPI";
import ConfigStore from './ConfigStore';
import { Pipe } from './SystemPromise';


type ScopeState = "light"|"dark"|"flat";
const stateByFrameType :{[id:string]:ScopeState}= {
    FRAME_BIAS:"dark",
    FRAME_DARK:"dark",
    FRAME_FLAT:"flat",
}
const coverMessageByFrameType = {
    "light":"Uncover scope",
    "dark": "Cover scope",
    "flat": "Switch scope to flat field",
}

export default class Camera
        implements RequestHandler.APIAppProvider<BackOfficeAPI.CameraAPI>
{
    appStateManager: JsonProxy<BackofficeStatus>;
    shootPromises: {[camId: string]:Task<BackOfficeAPI.ShootResult>};
    streamPromises: {[camId: string]:Task<void>};
    currentStatus: CameraStatus;
    context: AppContext;
    get indiManager() { return this.context.indiManager };
    get imageProcessor() { return this.context.imageProcessor };

    imageIdGenerator = new IdGenerator();
    previousImages: any;
    
    fakeImageId: number = 0;
    constructor(app:ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context:AppContext) {
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().camera = {
            status: "idle",
            selectedDevice: null,
            availableDevices: [],

            currentStreams: {},

            // Device => duration
            currentShoots: {

            },

            // List of finished images
            images: {
                list: [],

                // detail of each image
                byuuid: {
                    // 0: {
                    //      path: "/path/to/file.fits",
                    //      device: "device"
                    // }

                }
            },
            lastByDevices: {},

            dynStateByDevices: {},
            configuration: {
                preferedDevice: null,
                deviceSettings: {},
            }
        };

        // Device => promise
        this.shootPromises = {};
        this.streamPromises = {};
        this.currentStatus = this.appStateManager.getTarget().camera;
        this.context = context;

        this.imageIdGenerator = new IdGenerator();
        this.previousImages = {};
        

        new ConfigStore(appStateManager, 'camera', ['camera', 'configuration'], {
            fakeImagePath: null,
            fakeImages: null,
            defaultImagePath: process.env.HOME,
            defaultImagePrefix: 'IMAGE_XXX'
        }, {
            fakeImagePath: "/home/ludovic/Astronomie/home/photos/2015/2015-08-09/photos/2015-08-09/",
            fakeImages: [
                    "Single_Bin1x1_1s_2015-08-09_23-40-17.fit",  "Single_Bin1x1_1s_2015-08-09_23-44-44.fit",  "Single_Bin1x1_30s_2015-08-09_23-47-04.fit",  "Single_Bin2x2_2s_2015-08-09_23-28-37.fit",      "Single_M27_Bin1x1_2s_2015-08-10_03-40-12.fit",
                    "Single_Bin1x1_1s_2015-08-09_23-41-16.fit",  "Single_Bin1x1_30s_2015-08-09_23-42-37.fit",  "Single_Bin1x1_5s_2015-08-09_23-41-47.fit",   "Single_Bin2x2_2s_2015-08-09_23-29-41.fit",      "Single_M27_G_Bin1x1_2s_2015-08-10_03-46-49.fit",
                    "Single_Bin1x1_1s_2015-08-09_23-44-21.fit",  "Single_Bin1x1_30s_2015-08-09_23-45-37.fit",  "Single_Bin2x2_2s_2015-08-09_23-27-56.fit",   "Single_M27_Bin1x1_1s_2015-08-10_03-39-51.fit"
            ],
            defaultImagePath: process.env.HOME,
            defaultImagePrefix: 'IMAGE_XXX'
        });

        // Update available camera
        context.indiManager.createDeviceListSynchronizer((devs:string[])=> {
            this.currentStatus.availableDevices = devs;
        }, undefined, DriverInterface.CCD);

        context.indiManager.createPreferredDeviceSelector<CameraStatus>({
                availablePreferedCurrentPath: [
                    [
                        [ 'camera' , 'availableDevices'],
                        [ 'camera' , 'configuration', 'preferedDevice'],
                        [ 'camera' , 'selectedDevice'],
                    ]
                ],
                read: ()=> ({
                    available: this.currentStatus.availableDevices,
                    prefered: this.currentStatus.configuration.preferedDevice,
                    current: this.currentStatus.selectedDevice,
                }),
                set: (s:{prefered?: string|null|undefined, current?: string|null|undefined})=>{
                    if (s.prefered !== undefined) {
                        this.currentStatus.configuration.preferedDevice = s.prefered;
                    }
                    if (s.current !== undefined) {
                        this.currentStatus.selectedDevice = s.current;
                    }
                }
        });
        // Update configuration/dyn states
        this.appStateManager.addSynchronizer(
            [ 'camera', 'availableDevices' ],
            ()=> {
                const settingRoot = this.currentStatus.configuration.deviceSettings;
                for(const o of this.currentStatus.availableDevices) {
                    if (!Obj.hasKey(settingRoot, o)) {
                        settingRoot[o] = {
                            exposure: 1.0,
                        }
                    }
                }

                const dynStateRoot = this.currentStatus.dynStateByDevices;
                for(const o of this.currentStatus.availableDevices) {
                    if (!Obj.hasKey(dynStateRoot, o)) {
                        dynStateRoot[o] = {}
                    }
                }
            },
            true);

        // Update shoots
        this.appStateManager.addSynchronizer(
            [
                [
                    [
                        'indiManager', 'deviceTree', null, 'CCD_EXPOSURE',
                        [
                            ['childs', 'CCD_EXPOSURE_VALUE', '$_'],
                            ['$state']
                        ]
                    ],
                    [
                        'camera', 'availableDevices'
                    ]
                ]
            ], this.updateRunningShoots.bind(this), true);

        this.appStateManager.addSynchronizer(
            [
                [
                    [   'indiManager', 'deviceTree', null, 'CCD_FILE_PATH', '$rev' ],
                    [   'camera', 'availableDevices']
                ]
            ], this.updateDoneImages.bind(this), true
        );
        this.updateDoneImages();
    }

    getImageByUuid(uuid:string): ImageStatus|undefined {
        if (Obj.hasKey(this.currentStatus.images.byuuid, uuid)) {
            return this.currentStatus.images.byuuid[uuid];
        }
        return undefined;
    }

    updateDoneImages()
    {
        var indiManager = this.appStateManager.getTarget().indiManager;
        // Ensure that the CCD_FILE_PATH property is set for all devices
        var found:{[deviceId:string]:string} = {};
        for(var device of this.currentStatus.availableDevices)
        {
            
            var rev, value;
            try {
                var dtree =  indiManager.deviceTree[device];
                if ("CCD_FILE_PATH" in dtree) {
                    rev = dtree.CCD_FILE_PATH.$rev;
                    var timestamp = dtree.CCD_FILE_PATH.$timestamp;
                    value = dtree.CCD_FILE_PATH.childs.FILE_PATH.$_;

                    if (value === undefined) {
                        continue;
                    }

                    // Ignore CCD_FILE_PATH that are from before connection
                    // Some buggy drivers send spurious CCD_FILE_PATH message, not distinguishable from new shoot
                    if (!Object.prototype.hasOwnProperty.call(dtree, "CONNECTION")) {
                        continue;
                    }
                    var age = timestampToEpoch(timestamp) - timestampToEpoch(dtree.CONNECTION.$timestamp);
                    if (age <= 2) {
                        console.log('Ignored CCD_FILE_PATH from before last connection event : ' + age);
                        continue;
                    }

                } else {
                    continue;
                }
            } catch(e) {
                console.log('Error with device ' + device, e);
                continue;
            }
            var stamp = rev + ":" + value;
            
            found[device] = stamp;
            if (!Object.prototype.hasOwnProperty.call(this.previousImages, device))
            {
                this.previousImages[device] = stamp;
            } else {
                if (this.previousImages[device] != stamp) {
                    console.log('changed value from ' + this.previousImages[device]);
                    this.previousImages[device] = stamp;
                    if (value != '') {

                        let currentShoot;
                        if (Object.prototype.hasOwnProperty.call(this.currentStatus.currentShoots, device)) {
                            currentShoot = this.currentStatus.currentShoots[device];
                        } else {
                            currentShoot = undefined;
                        }
                        if (currentShoot != undefined && currentShoot.managed) {
                            console.log('Image will be result of our action.', value)
                        } else {
                            console.log('New external image :', value);

                            var newUuid = this.imageIdGenerator.next();

                            this.currentStatus.images.list.push(newUuid);
                            this.currentStatus.images.byuuid[newUuid] = {
                                path: value,
                                device: device
                            };
                        }
                    }
                }
            }
        }
        // console.log('Known devices are : ' + JSON.stringify(Object.keys(this.previousImages)));
        // console.log('Devices with stamp : ' + JSON.stringify(found));
        for(var o of Object.keys(this.previousImages))
        {
            if (!found[o]) {
                console.log('No more looking for shoot of ' + o);
                delete(this.previousImages[o]);
            }
        }
    }

    updateRunningShoots()
    {
        var indiManager = this.appStateManager.getTarget().indiManager;
        var connectedDevices = [];
        for(var deviceId of Object.keys(indiManager.deviceTree).sort()) {
            var device = indiManager.deviceTree[deviceId];
            var status, exposure;
            try {
                status = device.CCD_EXPOSURE.$state;
                exposure = device.CCD_EXPOSURE.childs.CCD_EXPOSURE_VALUE.$_;
                exposure = parseFloat(exposure);
            } catch(e) {
                continue;
            }
            connectedDevices.push(deviceId);
            let currentShoot;
            if (Object.prototype.hasOwnProperty.call(this.currentStatus.currentShoots, deviceId)) {
                currentShoot = this.currentStatus.currentShoots[deviceId];
            } else {
                currentShoot = undefined;
            }

            if (status == 'Busy' && exposure > 0) {
                // Create a shoot
                if (currentShoot === undefined) {
                    currentShoot= {
                        exposure: exposure,
                        expLeft: exposure,
                        status: 'External' as 'External',
                        managed: false,
                    };
                    this.currentStatus.currentShoots[deviceId] = currentShoot;
                    if (Obj.hasKey(this.currentStatus.dynStateByDevices, deviceId)) {
                        this.currentStatus.dynStateByDevices[deviceId].spyRecommanded = true;
                    }
                } else {
                    if (exposure > 0 || currentShoot.expLeft) {
                        currentShoot.expLeft = exposure;
                    }
                    if (exposure > currentShoot.exposure) {
                        currentShoot.exposure = exposure;
                    }
                }
            } else {
                // Destroy the shoot, if not managed
                if (currentShoot !== undefined) {
                    if (currentShoot.managed) {
                        if (status !== 'Busy') exposure = 0;
                        if (exposure > 0 || currentShoot.expLeft) {
                            currentShoot.expLeft = exposure;
                        }
                    } else {
                        delete this.currentStatus.currentShoots[deviceId];
                    }
                }
            }
        }
        // destroy shoots of disconnected devices
        for(var k of Object.keys(this.currentStatus.currentShoots))
        {
            if (connectedDevices.indexOf(k) == -1) {
                delete this.currentStatus.currentShoots[k];
            }
        }
    }

    setCamera=async (ct: CancellationToken, payload:{device:string})=>{
        console.log('Request to set device: ', JSON.stringify(payload.device));
        if (this.currentStatus.availableDevices.indexOf(payload.device) == -1) {
            throw "device not available";
        }
        this.currentStatus.selectedDevice = payload.device;
    }

    setShootParam=async<K extends keyof CameraDeviceSettings> (ct: CancellationToken, payload:{camera?: string, key:K, value: CameraDeviceSettings[K]})=>{
        // FIXME: send the corresponding info ?
        console.log('Request to set setting: ', JSON.stringify(payload));
        var key = payload.key;

        const deviceId = payload.camera !== undefined ? payload.camera : this.currentStatus.selectedDevice;
        if (deviceId === null || this.currentStatus.availableDevices.indexOf(deviceId) === -1) {
            throw new Error("no device selected");
        }
        const allSettings = this.currentStatus.configuration.deviceSettings;
        if (!Obj.hasKey(allSettings, deviceId)) {
            console.log("Internal error - device has no settings");
            throw new Error("Device has no settings");
        }
        const deviceSettings = allSettings[deviceId];
        deviceSettings[key] = payload.value;
    }

    getCropAdjustment(device:any)
    {
        const frameVec = device.getVector('CCD_FRAME');
        if (!frameVec.exists()) {
            return {};
        }

        const ccdVec = device.getVector('CCD_INFO');
        if (!ccdVec.exists()) {
            return {};
        }
        const crop = {
            x: parseFloat(frameVec.getPropertyValue('X')),
            y: parseFloat(frameVec.getPropertyValue('Y')),
            w: parseFloat(frameVec.getPropertyValue('WIDTH')),
            h: parseFloat(frameVec.getPropertyValue('HEIGHT'))
        }
        const max = {
            w: parseFloat(ccdVec.getPropertyValue('CCD_MAX_X')),
            h: parseFloat(ccdVec.getPropertyValue('CCD_MAX_Y')),
        }

        const binningVec = device.getVector('CCD_BINNING');
        const bin = binningVec.exists() ?
            {
                x:parseFloat(binningVec.getPropertyValue('HOR_BIN')),
                y:parseFloat(binningVec.getPropertyValue('VER_BIN'))
            }
            : {x: 1, y: 1};
        console.log('Crop status is '+ JSON.stringify(crop, null, 2));
        console.log('Frame status is '+ JSON.stringify(max, null, 2));
        console.log('Bin status is '+ JSON.stringify(bin, null, 2));
        if (crop.x || crop.y || crop.w != max.w || crop.h  != max.h) {
            return {
                X: "0",
                Y: "0",
                WIDTH: "" + Math.floor(max.w),
                HEIGHT: "" + Math.floor(max.h)
            };
        }

        return {};
    }

    // Return a promise to shoot at the given camera (where)
    async doShoot(cancellation: CancellationToken, device:string, settingsProvider?:(s:CameraDeviceSettings)=>CameraDeviceSettings):Promise<BackOfficeAPI.ShootResult>
    {
        // On veut un objet de controle qui comporte à la fois la promesse et la possibilité de faire cancel
        var ccdFilePathInitRevId:any;
        let shootResult:BackOfficeAPI.ShootResult;

        if (Object.prototype.hasOwnProperty.call(this.currentStatus.currentShoots, device)) {
            throw new Error("Shoot already started for " + device);
        }

        if (Object.prototype.hasOwnProperty.call(this.currentStatus.currentStreams, device)) {
            throw new Error("Stream is already started for " + device);
        }

        if (!Obj.hasKey(this.currentStatus.configuration.deviceSettings, device)) {
            throw new Error("Device has no settings");
        }

        var settings = Object.assign({}, this.currentStatus.configuration.deviceSettings[device]);
        if (settingsProvider !== undefined) {
            settings = settingsProvider(settings);
        }
        console.log('Shoot settings:' + JSON.stringify(settings, null, 2));
        this.currentStatus.currentShoots[device] = Object.assign({
                    status: 'init' as "init",
                    managed: true,
                    path: this.currentStatus.configuration.defaultImagePath || process.env.HOME,
                    prefix: this.currentStatus.configuration.defaultImagePrefix || 'IMAGE_XXX',
                    expLeft: settings.exposure,
                }, settings);

        return await createTask<BackOfficeAPI.ShootResult>(cancellation, async (task)=>{
            this.shootPromises[device] = task;
        
            try {
                const currentShootSettings = this.currentStatus.currentShoots[device];
                console.log('Starting shoot: ' + JSON.stringify(currentShootSettings));
                var exposure = currentShootSettings.exposure;
                if (exposure === null || exposure === undefined) {
                    exposure = 0.1;
                }
                currentShootSettings.exposure = exposure;
                    
                    // Set the binning - if prop is present only
                if (currentShootSettings.bin !== null
                    && currentShootSettings.bin !== undefined
                    && this.indiManager.getValidConnection().getDevice(device).getVector('CCD_BINNING').exists())
                {
                    task.cancellation.throwIfCancelled();
                    await this.indiManager.setParam(task.cancellation, device, 'CCD_BINNING', {
                                HOR_BIN: '' + currentShootSettings.bin!,
                                VER_BIN: '' + currentShootSettings.bin!
                            });
                }
                // Reset the frame size - if prop is present only
                if (Object.keys(this.getCropAdjustment(this.indiManager.getValidConnection().getDevice(device))).length != 0) {
                    await this.indiManager.setParam(task.cancellation, device, 'CCD_FRAME', this.getCropAdjustment(this.indiManager.getValidConnection().getDevice(device)), true);
                }

                // Set the iso
                if (currentShootSettings.iso !== null
                        && currentShootSettings.iso !== undefined
                        && this.indiManager.getValidConnection().getDevice(device).getVector('CCD_ISO').exists()) {
                    task.cancellation.throwIfCancelled();
                    await this.indiManager.setParam(task.cancellation, device, 'CCD_ISO',
                        // FIXME : support cb for setParam
                        (vector:Vector) => {
                            const vec = vector.getExistingVectorInTree();
                            const v = currentShootSettings.iso;
                            var childToSet = undefined;
                            for(var id of vec.childNames)
                            {
                                var child = vec.childs[id];
                                if (child.$label == v) {
                                    childToSet = id;
                                    break;
                                }
                            }
                            if (childToSet === undefined) throw new Error("Unsupported iso value: " + v);

                            return ({[childToSet]: 'On'});
                        }
                    );
                }

                task.cancellation.throwIfCancelled();
                await this.indiManager.setParam(task.cancellation, device, 'UPLOAD_SETTINGS',
                        (vec:Vector)=> {
                            const ret = {};

                            if (vec.getPropertyValueIfExists('UPLOAD_DIR') !== currentShootSettings.path
                                || vec.getPropertyValueIfExists('UPLOAD_PREFIX') !== currentShootSettings.prefix)
                            {
                                return {
                                    UPLOAD_DIR: currentShootSettings.path,
                                    UPLOAD_PREFIX: currentShootSettings.prefix
                                }
                            } else {
                                return {}
                            }
                        });
                
                // Set the upload mode to at least upload_client
                task.cancellation.throwIfCancelled();
                await this.indiManager.setParam(task.cancellation, device, 'UPLOAD_MODE',
                        (vec:Vector) => {
                            if (vec.getPropertyValueIfExists('UPLOAD_CLIENT') == 'On') {
                                console.log('want upload_client\n');
                                return {
                                    UPLOAD_BOTH: 'On'
                                }
                            } else {
                                return ({});
                            }
                        });

                await this.indiManager.waitForVectors(task.cancellation, device, ['CCD_FILE_PATH']);

                const connection = this.indiManager.connection;
                if (connection == undefined) {
                    throw "Indi server not connected";
                }

                ccdFilePathInitRevId = connection.getDevice(device).getVector("CCD_FILE_PATH").getRev();

                var expVector = connection.getDevice(device).getVector("CCD_EXPOSURE");

                task.cancellation.throwIfCancelled();
                expVector.setValues([{name: 'CCD_EXPOSURE_VALUE', value: '' + currentShootSettings.exposure! }]);

                
                const doneWithExposure = task.cancellation.onCancelled(() => {
                        // FIXME: we must wait, otherwise a new shoot can begin while these are still occuring.
                        var expVector = connection.getDevice(device).getVector("CCD_ABORT_EXPOSURE");
                        expVector.setValues([{name: 'ABORT', value: 'On'}]);
                        var uploadModeVector = connection.getDevice(device).getVector("UPLOAD_MODE");
                        uploadModeVector.setValues([{name: 'UPLOAD_CLIENT', value: 'On'}]);
                });
                try {
                    // Make this uninterruptible
                    await connection.wait(CancellationToken.CONTINUE, () => {
                        console.log('Waiting for exposure end');

                        var value = expVector.getPropertyValue("CCD_EXPOSURE_VALUE");
                        var state = expVector.getState();
                        if (value != "0") {
                            currentShootSettings.status = 'Exposing';
                        } else if (state == "Busy" && currentShootSettings.status == 'Exposing') {
                            currentShootSettings.status = 'Downloading';
                        }

                        if (state === "Busy") {
                            return false;
                        }
                        if (state !== "Ok" && state !== "Idle") {
                            throw new Error("Exposure failed");
                        }

                        return true;
                    });
                } finally {
                    doneWithExposure();
                }
                task.cancellation.throwIfCancelled();
                if (ccdFilePathInitRevId === connection.getDevice(device).getVector("CCD_FILE_PATH").getRev())
                {
                    throw new Error("CCD_FILE_PATH was not updated");
                }

                var value = connection.getDevice(device).getVector("CCD_FILE_PATH").getPropertyValue("FILE_PATH");

                console.log('Finished  image acquisistion :', value);

                if (this.currentStatus.configuration.fakeImages != null) {
                    var examples = this.currentStatus.configuration.fakeImages;
                    value = examples[(this.fakeImageId++)%examples.length];
                    if (this.currentStatus.configuration.fakeImagePath != null) {
                        value = this.currentStatus.configuration.fakeImagePath + value;
                    }
                    console.log('Using fake image : ' + value);
                }
                this.currentStatus.lastByDevices[device] = value;

                var newUuid = this.imageIdGenerator.next();

                this.currentStatus.images.list.push(newUuid);
                this.currentStatus.images.byuuid[newUuid] = {
                    path: value,
                    device: device
                };
                shootResult = ({path: value, device, uuid: newUuid});

                // Remove UPLOAD_MODE
                // FIXME: this should be in a finally !
                await this.indiManager.setParam(task.cancellation, device, 'UPLOAD_MODE',
                        (vec:Vector) => {
                            if (vec.getPropertyValueIfExists('UPLOAD_CLIENT') != 'On') {
                                console.log('set back upload_client\n');
                                return {
                                    UPLOAD_CLIENT: 'On'
                                }
                            } else {
                                return ({});
                            }
                        });
                return shootResult;
            } finally {
                console.log('Doing cleanup');
                delete this.shootPromises[device];
                delete this.currentStatus.currentShoots[device];
            }
        });
    }

    // Return a promise to stream the given camera
    async doStream(cancellation: CancellationToken, device:string):Promise<void>
    {
        // On veut un objet de controle qui comporte à la fois la promesse et la possibilité de faire cancel
        var connection:any;
        var ccdFilePathInitRevId:any;
        let shootResult:BackOfficeAPI.ShootResult;

        if (Object.prototype.hasOwnProperty.call(this.currentStatus.currentShoots, device)
                && this.currentStatus.currentShoots[device].managed) {
            throw new Error("Shoot already started for " + device);
        }

        if (Object.prototype.hasOwnProperty.call(this.currentStatus.currentStreams, device)) {
            throw new Error("Stream is already started for " + device);
        }

        if (!Obj.hasKey(this.currentStatus.configuration.deviceSettings, device)) {
            throw new Error("Device has no settings");
        }

        return await createTask<void>(cancellation, async (task)=>{
            this.streamPromises[device] = task;
            delete this.currentStatus.currentShoots[device];
            try {
                this.currentStatus.currentStreams[device] = {
                    streamId: null,
                    streamSize: null,
                    serial: null,
                    autoexp: null,
                    subframe: null,
                    frameSize: null,
                };


                task.cancellation.throwIfCancelled();

                // Set the upload mode to at least upload_client
                await this.indiManager.setParam(task.cancellation, device, 'UPLOAD_MODE',
                        (vec:Vector) => {
                            if (vec.getPropertyValueIfExists('UPLOAD_CLIENT') === 'Off') {
                                console.log('want upload_client\n');
                                return {
                                    UPLOAD_CLIENT: 'On'
                                }
                            } else {
                                return ({});
                            }
                        });

                task.cancellation.throwIfCancelled();

                const unregister = task.cancellation.onCancelled(()=>{
            
                });
                try {
                    const onJson = (e:string)=> {
                        if (e) {
                            let val;
                            try {
                                val = JSON.parse(e);
                            } catch(e) {
                                console.warn('json parse error in streamer', e);
                                return;
                            }
                            console.log('decoded from streamer', val);
                            const target = this.currentStatus.currentStreams[device];
                            if (val.serial) {
                                target.serial = val.serial;
                            }
                            if (val.streamId) {
                                target.streamId = val.streamId;
                            }
                            if (val.streamSize) {
                                target.streamSize = val.streamSize;
                            }
                            if (val.frameSize) {
                                target.frameSize = val.frameSize;
                            } else {
                                target.frameSize = null;
                            }
                            if (val.subframe) {
                                target.subframe = val.subframe;
                            } else {
                                target.subframe = null;
                            }
                        }
                    }
                    const addr = this.indiManager.getIndiServerAddr();
                    await Pipe(task.cancellation,
                        {
                            command: ["./fitsviewer/streamer", addr.host, "" + addr.port, device, "CCD1"]
                        },
                        new MemoryStreams.ReadableStream(""),
                        onJson
                    );

                } finally {
                    unregister();
                }

            } finally {
                console.log('Doing cleanup');
                delete this.streamPromises[device];
                delete this.currentStatus.currentStreams[device];
            }
        });
    }

    stream = async (ct: CancellationToken, message: {})=>{
        if (this.currentStatus.selectedDevice === null) {
            throw new Error("No camera selected");
        }
        return await this.doStream(ct, this.currentStatus.selectedDevice);
    }

    shoot = async (ct: CancellationToken, message:{})=>{
        if (this.currentStatus.selectedDevice === null) {
            throw new Error("No camera selected");
        }
        return await this.doShoot(ct, this.currentStatus.selectedDevice);
    }

    abort = async (ct: CancellationToken, message:{})=>{
        let currentDevice = this.currentStatus.selectedDevice;
        if (currentDevice === null) throw new Error("No camera selected");

        let sthCanceled = false;
        if (Object.prototype.hasOwnProperty.call(this.streamPromises, currentDevice)) {
            this.streamPromises[currentDevice].cancel();
            sthCanceled = true;
        }

        if (Object.prototype.hasOwnProperty.call(this.shootPromises, currentDevice)) {
            this.shootPromises[currentDevice].cancel();
            sthCanceled = true;
        }

        if (!sthCanceled) {
            throw new Error("Shoot not initiated on our side. Not aborting");
        }
    }

    getAPI() {
        return {
            shoot: this.shoot,
            stream: this.stream,
            abort: this.abort,
            setCamera: this.setCamera,
            setShootParam: this.setShootParam,
        }
    }
}
