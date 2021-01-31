import {v4 as uuidv4} from 'node-uuid';
const TraceError = require('trace-error');

import CancellationToken from 'cancellationtoken';
import * as jsonpatch from 'json-patch';
import { ExpressApplication, AppContext } from "./ModuleBase";
import { CameraDeviceSettings, BackofficeStatus, SequenceStatus, Sequence, SequenceStep, SequenceStepStatus, SequenceStepParameters, PhdGuideStep, PhdGuideStats, ImageStats, ImageStatus} from './shared/BackOfficeStatus';
import JsonProxy from './JsonProxy';
import { hasKey, deepCopy } from './Obj';
import {Task, createTask} from "./Task.js";
import {IdGenerator} from "./IdGenerator";
import * as Obj from "./Obj";
import * as Metrics from "./Metrics";
import * as RequestHandler from "./RequestHandler";
import * as BackOfficeAPI from "./shared/BackOfficeAPI";
import ConfigStore from './ConfigStore';
import { SequenceLogic, Progress } from './SequenceLogic';




// export type SequenceStepDefinition = {
//     uuid: string;
//     repeat?: number;
//     dither?: boolean;
//     filter?: string|null;
//     bin?: number;
//     exposure?: number;
//     iso?: null|string;
//     frameType?: string;

//     childs?: SequenceStepDefinition[];
// }


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

export default class SequenceManager
        implements RequestHandler.APIAppProvider<BackOfficeAPI.SequenceAPI>
{
    readonly appStateManager: JsonProxy<BackofficeStatus>;
    readonly context: AppContext;
    readonly currentStatus: SequenceStatus;
    currentSequenceUuid:string|null = null;
    currentSequencePromise:Task<void>|null = null;
    currentSequenceProgress:Progress|null = null;

    sequenceIdGenerator: IdGenerator;
    lastFwhm: number|undefined;
    lastStarCount: number|undefined;
    lastImageTime: number = 0;
    lastGuideStats: PhdGuideStats|undefined;
    lastBackgroundLevel: number|undefined;
    get indiManager() { return this.context.indiManager };
    get imagingSetupManager() { return this.context.imagingSetupManager };
    get imageProcessor() { return this.context.imageProcessor };
    get phd() { return this.context.phd };
    constructor(app:ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context:AppContext) {
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().sequence = {
            sequences: {
                list: [],
                byuuid: {
                    // Objects with:
                    //   status: 'idle',
                    //   title: 'New sequence',
                    //   camera: null,
                    //   steps: {
                    //     list: [firstSeq],
                    //     byuuid: {
                    //         [firstSeq]: {
                    //             count:  1,
                    //             type:   'FRAME_LIGHT'
                    //         }
                    //     }
                    //
                }
            }
        }
        this.currentStatus = this.appStateManager.getTarget().sequence;
        this.context = context;
        this.sequenceIdGenerator = new IdGenerator();

        new ConfigStore(appStateManager, 'sequences', ['sequence', 'sequences'],
            {
                list: [],
                byuuid: {}
            },{
                list: [],
                byuuid: {}
            },
            // read callback
            (content:SequenceStatus["sequences"])=> {
                // Renumber sequences
                this.sequenceIdGenerator.renumber(content.list, content.byuuid);

                for(const sid of Object.keys(content.byuuid)) {
                    const seq = content.byuuid[sid];
                    seq.images = [];
                    if (!seq.imageStats) {
                        seq.imageStats = {};
                    }
                    if (seq.storedImages) {
                        for(const image of seq.storedImages!) {
                            const {device, path, ...stats} = {...image};
                            const status: ImageStatus = {device, path};

                            // Pour l'instant c'est brutal
                            const uuid = this.context.camera.imageIdGenerator.next();
                            this.context.camera.currentStatus.images.list.push(uuid);
                            this.context.camera.currentStatus.images.byuuid[uuid] = status;
                            seq.images.push(uuid);

                            seq.imageStats[uuid] = stats;
                        }
                    }
                    delete(seq.storedImages);
                }
                return content;
            },
            // write callback (add new images)
            (content:SequenceStatus["sequences"])=>{
                content = deepCopy(content);
                for(const sid of Object.keys(content.byuuid)) {
                    const seq = content.byuuid[sid];
                    seq.storedImages = [];
                    for(const uuid of seq.images) {
                        if (hasKey(this.context.camera.currentStatus.images.byuuid, uuid)) {
                            const toWrite = {...this.context.camera.currentStatus.images.byuuid[uuid],
                                            ... Obj.getOwnProp(seq.imageStats, uuid)};
                            seq.storedImages.push(toWrite);
                        }
                    }
                    delete seq.images;
                    delete seq.imageStats;
                }
                return content;
            }
        );
        // Ensure no sequence is running on start


        this.pauseRunningSequences();

    }

    newSequence=async (ct: CancellationToken, message: {}):Promise<string>=>{
        const key = uuidv4();
        const firstSeq = uuidv4();
        // FIXME: takes parameters from the last created sequence
        this.currentStatus.sequences.byuuid[key] = {
            status: 'idle',
            title: 'New sequence',
            progress: null,
            imagingSetup: null,
            errorMessage: null,

            root: {
            },
            stepStatus: {
            },

            images: [],
            imageStats: {},
        };
        this.currentStatus.sequences.list.push(key);
        return key;
    }

    findSequenceFromRequest=(sequenceUid:string): Sequence=>
    {
        if (!hasKey(this.currentStatus.sequences.byuuid, sequenceUid)) {
            throw new Error("Sequence not found");
        }
        return this.currentStatus.sequences.byuuid[sequenceUid];
    }

    findStepFromRequest=(message: {sequenceUid:string, stepUidPath: string[]}): SequenceStep=>
    {
        const seq = this.findSequenceFromRequest(message.sequenceUid);

        let ret = seq.root;
        for(const childUuid of message.stepUidPath) {
            if ((!ret.childs) || !hasKey(ret.childs.byuuid, childUuid)) {
                throw new Error("Sequence step not found");
            }
            ret = ret.childs.byuuid[childUuid];
        }

        return ret;
    }

    newSequenceStep=async (ct: CancellationToken, message:BackOfficeAPI.NewSequenceStepRequest)=>{
        console.log('Request to add step(s): ', JSON.stringify(message));

        const parentStep = this.findStepFromRequest(message);

        if (!parentStep.childs) {
            parentStep.childs = {
                byuuid:{},
                list: [],
            };
        }

        if (message.removeParameterFromParent) {
            delete parentStep[message.removeParameterFromParent];
        }
        const ret: string[] = [];
        for(let i = 0; i < Math.max(1, message.count||0); ++i)
        {
            const sequenceStepUid = uuidv4();
            const newStep: SequenceStep = {
            };

            parentStep.childs.list.push(sequenceStepUid);
            parentStep.childs.byuuid[sequenceStepUid] = newStep;
            ret.push(sequenceStepUid);
        }
        return ret;
    }

    moveSequenceSteps=async (ct: CancellationToken, message:BackOfficeAPI.MoveSequenceStepsRequest)=>{
        console.log('Request to move steps: ', JSON.stringify(message));

        const parentStep = this.findStepFromRequest(message);
        if (!parentStep.childs) {
            throw new Error("Sequence has no childs");
        }

        for(const o of message.childs) {
            if (!hasKey(parentStep.childs.byuuid, o)) {
                throw new Error("Unknown child");
            }
        }
        const newSet = new Set(message.childs);
        if (newSet.size !== message.childs.length) {
            throw new Error("Duplicated child");
        }
        for(const o of parentStep.childs.list) {
            if (!newSet.has(o)) {
                throw new Error("missing child");
            }
        }

        parentStep.childs.list = message.childs;
    }

    pauseRunningSequences()
    {
        for(var k of Object.keys(this.currentStatus.sequences.byuuid))
        {
            var seq = this.currentStatus.sequences.byuuid[k];
            if (seq.status == "running") {
                console.log('Sequence ' + k + ' was interrupted by process shutdown');
                seq.status ="paused";
            }
        }
    }

    public deleteSequenceStep = async(ct: CancellationToken, message:BackOfficeAPI.DeleteSequenceStepRequest)=>{
        console.log('Request to drop step: ', JSON.stringify(message));
        const parentStep = this.findStepFromRequest(message);

        // FIXME: not for running step ?

        if ((!parentStep.childs) || !hasKey(parentStep.childs.byuuid, message.stepUid)) {
            throw new Error("Step not found");
        }

        delete parentStep.childs.byuuid[message.stepUid];
        let p;
        while ((p=parentStep.childs.list.indexOf(message.stepUid)) != -1) {
            parentStep.childs.list.splice(p, 1);
        }

        if (parentStep.childs.list.length === 0) {
            delete parentStep.childs;
        }
    }

    public updateSequence = async (ct: CancellationToken, message:BackOfficeAPI.UpdateSequenceRequest)=>{
        console.log('Request to set setting: ', JSON.stringify(message));
        const seq = this.findSequenceFromRequest(message.sequenceUid);

        const param = message.param;
        const value = message.value;

        (seq as any)[param] = value;
    }

    public patchSequenceStep = async (ct: CancellationToken, message:BackOfficeAPI.PatchSequenceStepRequest)=>{
        const parentStep = this.findStepFromRequest(message);

        jsonpatch.apply(parentStep, message.patch);
    }

    public updateSequenceStep = async (ct: CancellationToken, message:BackOfficeAPI.UpdateSequenceStepRequest)=>{
        console.log('Request to set setting: ', JSON.stringify(message));

        const parentStep = this.findStepFromRequest(message);

        const param = message.param;
        const value = message.value;

        if (value === undefined) {
            delete (parentStep as any)[param];
        } else {
            (parentStep as any)[param] = value;
        }
    }

    public updateSequenceStepDithering = async (ct: CancellationToken, message:BackOfficeAPI.UpdateSequenceStepDitheringRequest)=>{
        console.log('Request to set dithering settings: ', JSON.stringify(message));

        const parentStep = this.findStepFromRequest(message);
        const wanted = message.dithering;

        if (!wanted) {
            parentStep.dithering = null;
        } else {
            if (!parentStep.dithering) {
                parentStep.dithering = {...this.context.phd.currentStatus.configuration.preferredDithering, once: false}
            }
            if (message.settings) {
                const s = message.settings;
                if (s.amount !== undefined && (s.amount <= 0 || s.amount > 100)) {
                    throw new Error("invalid value for amount");
                }
                if (s.pixels !== undefined && (s.pixels <= 0 || s.pixels > 100)) {
                    throw new Error("invalid value for pixels");
                }
                if (s.time !== undefined && (s.time <= 0 || s.time > 1000)) {
                    throw new Error("invalid value for time");
                }
                if (s.timeout !== undefined && (s.timeout <= 0 || s.timeout > 1000)) {
                    throw new Error("invalid value for time");
                }

                Object.assign(parentStep.dithering, message.settings);

                // Retains as the new default values
                this.context.phd.currentStatus.configuration.preferredDithering = {...parentStep.dithering};
            }
        }
    }

    private needCoverScopeMessage(cameraId:string) {
        const devConf = this.indiManager.currentStatus.configuration.indiServer.devices;
        if (!hasKey(devConf, cameraId)) {
            return false;
        }

        return !devConf[cameraId].options.disableAskCoverScope;
    }

    private disableCoverScopeMessage(cameraId: string) {
        const devConf = this.indiManager.currentStatus.configuration.indiServer.devices;
        try {
            this.indiManager.doUpdateDriverParam({driver: cameraId, key: "disableAskCoverScope", value: true});
            this.context.notification.info("Cover scope message can be enabled in INDI tab");
        } catch(e) {
            this.context.notification.error("Unable to control cover scope message preference", e);
        }
    }

    private doStartSequence = async (ct: CancellationToken, uuid:string)=>{
        const getSequence=()=>{
            var rslt = this.currentStatus.sequences.byuuid[uuid];
            if (!rslt) {
                throw new Error("Sequence removed: " + uuid);
            }
            return rslt;
        }

        const computeStats = async (ct: CancellationToken, indiFrameType: string|undefined, shootResult: BackOfficeAPI.ShootResult, target: ImageStats, guideSteps: Array<PhdGuideStep>)=> {
            ct.throwIfCancelled();

            target.guideStats = this.phd.computeGuideStats(guideSteps);

            const histogram = await this.imageProcessor.compute(ct,
                {
                    histogram: { source: {
                        path: shootResult.path,
                        streamId: "",
                    },
                    options: {
                        maxBits: 10
                    }
                },
            });

            const channelBlacks = histogram.map(ch=>this.imageProcessor.getHistgramAduLevel(ch, 0.2));

            target.backgroundLevel = channelBlacks.length ? channelBlacks.reduce((a, c)=>a+c, 0) / (1024 * channelBlacks.length) : undefined;

            if (indiFrameType === 'FRAME_LIGHT') {
                ct.throwIfCancelled();

                // FIXME: mutualise that somewhere
                console.log('Asking FWHM for ', JSON.stringify(shootResult, null, 2));
                const starFieldResponse = await this.imageProcessor.compute(ct, {
                    starField: { source: {
                        path: shootResult.path,
                        streamId: "",
                    }}
                });
                const starField = starFieldResponse.stars;
                console.log('StarField', JSON.stringify(starField, null, 2));
                let fwhm, starCount;
                starCount = starField.length;
                if (starField.length) {
                    fwhm = 0;
                    for(let star of starField) {
                        fwhm += star.fwhm;
                    }
                    fwhm /= starField.length;
                }

                target.fwhm = fwhm;
                target.starCount = starCount;
            }
        }

        const computeStatsWithMetrics = async (ct: CancellationToken, indiFrameType: string|undefined, shootResult: BackOfficeAPI.ShootResult, target: ImageStats, guideSteps: Array<PhdGuideStep>)=>{
            await computeStats(ct, indiFrameType, shootResult, target, guideSteps);

            this.lastImageTime = Date.now();
            this.lastGuideStats = Obj.deepCopy(target.guideStats);
            this.lastBackgroundLevel = target.backgroundLevel;
            this.lastFwhm = target.fwhm;
            this.lastStarCount = target.starCount;

            console.log('Statistic updated :', target);
        }

        const sequenceLogic = async (ct: CancellationToken) => {
            let scopeState: ScopeState = "light";

            while(true) {
                ct.throwIfCancelled();

                const sequence = getSequence();
                const sequenceLogic = new SequenceLogic(sequence, uuidv4);

                sequence.progress = null;
                const nextStep = sequenceLogic.getNextStep();

                if (nextStep === undefined) {
                    console.log('Sequence terminated: ' + uuid);
                    return;
                }

                // const {stepId, step} = nextStep;

                if (sequence.imagingSetup === null) {
                    throw new Error("No imaging setup specified");
                }

                const imagingSetupInstance = ()=> {
                    const isi = this.imagingSetupManager.getImagingSetupInstance(sequence.imagingSetup);

                    if (!isi.exists()) {
                        throw new Error("Unknown imaging setup");
                    }

                    return isi;
                }

                const cameraDevice = () => {
                    const isi = imagingSetupInstance();
                    const ret = isi.config().cameraDevice;
                    if (ret === null) {
                        throw new Error("Imaging setup has no camera");
                    }
                    return ret;
                }

                const filterWheelDevice = () => {
                    const isi = imagingSetupInstance();
                    const ret = isi.config().filterWheelDevice;
                    if (ret === null) {
                        throw new Error("Imaging setup has no filter wheel");
                    }
                    return ret;
                }

                // Check that camera is connected
                const device = this.indiManager.checkDeviceConnected(cameraDevice());

                const param : SequenceStep = sequenceLogic.getParameters(nextStep);

                // Get the name of frame type
                const stepTypeLabel =
                        (param.type ? device.getVector('CCD_FRAME_TYPE').getPropertyLabelIfExists(param.type) : undefined)
                        || 'image';

                const progress = sequenceLogic.getProgress(nextStep);
                this.currentSequenceProgress = progress;

                const shootTitle = (progress.imagePosition + 1) + "/" + progress.totalCount
                            + (progress.totalTime > 0
                                ? (" " + Math.round(100 * progress.timeSpent / progress.totalTime) + "%")
                                : ""
                            );

                if (!param.exposure) {
                    throw new Error("Exposure not specified for " + shootTitle);
                }

                const settings:CameraDeviceSettings = {...param, exposure: param.exposure};

                settings.prefix = sanitizePath(sequence.title) + '_' + sanitizePath(stepTypeLabel);

                if (param.filter) {
                    settings.prefix += '_' + sanitizePath(param.filter);
                }

                if (param.exposure < 1 || (param.exposure % 1)) {
                    settings.prefix += '_' + Math.floor(param.exposure * 1000) + 'ms';
                } else {
                    settings.prefix += '_' + Math.floor(param.exposure) + 's';
                }

                settings.prefix += '_XXX';

                const currentExecutionStatus = nextStep[nextStep.length - 1];
                // Copy because it could change concurrently in case of removal/reorder
                const currentExecutionUuid = currentExecutionStatus.status.execUuid;

                if (param.dithering
                    && nextStep[nextStep.length - 1].status.lastDitheredExecUuid != nextStep[nextStep.length - 1].status.execUuid) {

                    // FIXME: no dithering for first shoot of sequence
                    console.log('Dithering required : ', Object.keys(this.context), JSON.stringify(param.dithering));
                    sequence.progress = "Dither " + shootTitle;
                    await this.context.phd.dither(ct, param.dithering);
                    // Mark the dithering as done
                    currentExecutionStatus.status.lastDitheredExecUuid = currentExecutionUuid;
                    ct.throwIfCancelled();
                    continue;
                }

                // Send a cover scope dialog if required
                const newScopeState:ScopeState = (param.type && hasKey(stateByFrameType, param.type)) ? stateByFrameType[param.type] : 'light';
                if (newScopeState !== scopeState) {
                    if (this.needCoverScopeMessage(cameraDevice()))
                    {
                        // Check that camera is connected first
                        this.indiManager.checkDeviceConnected(cameraDevice());

                        // Ask confirmation
                        const acked = await this.context.notification.dialog<boolean|"neverask">(ct, coverMessageByFrameType[newScopeState],
                                                        [{title:"Ok", value: true}, {title:"Pause Seq", value: false}, {title:"Never ask", value: "neverask"}]);
                        if (!acked) {
                            throw new CancellationToken.CancellationError("User canceled");
                        }
                        if (acked === "neverask") {
                            this.disableCoverScopeMessage(cameraDevice());
                        }
                    }
                    scopeState = newScopeState;
                }

                if (param.filter) {
                    console.log('Setting filter to ' + param.filter);
                    sequence.progress = "Filter " + shootTitle;

                    const filterWheelDeviceId = filterWheelDevice();

                    if (filterWheelDeviceId === null) {
                        throw new Error("Imaging setup has no filter wheel");
                    }

                    this.indiManager.checkDeviceConnected(filterWheelDeviceId);

                    await this.context.filterWheel.changeFilter(ct, {
                        filterWheelDeviceId,
                        filterId: param.filter,
                    });

                    ct.throwIfCancelled();
                }

                sequence.progress = (stepTypeLabel) + " " + shootTitle;
                ct.throwIfCancelled();

                const guideSteps:Array<PhdGuideStep> = [];
                const unregisterPhd = (param.type === 'FRAME_LIGHT') ? this.phd.listenForSteps((step)=>guideSteps.push(step)) : ()=>{};

                let shootResult;
                try {
                    shootResult = await this.context.camera.doShoot(ct, cameraDevice(), ()=>(settings));
                } finally {
                    unregisterPhd();
                }
                
                progress.imagePosition++;
                progress.timeSpent += param.exposure;

                sequence.images.push(shootResult.uuid);
                sequenceLogic.finish(currentExecutionStatus);

                sequence.imageStats[shootResult.uuid] = {};
                computeStatsWithMetrics(CancellationToken.CONTINUE, param.type, shootResult, sequence.imageStats[shootResult.uuid], guideSteps);
            }
        }

        const finishWithStatus = (s:'done'|'error'|'paused', e?:any)=>{
            console.log('finishing with final status: ' + s);
            if (e) {
                console.log('Error ' , e);
            }
            var seq = this.currentStatus.sequences.byuuid[uuid];
            seq.status = s;
            if (e) {
                if (e instanceof TraceError) {
                    seq.errorMessage = "" + e.messages();
                } else if (e instanceof Error) {
                    seq.errorMessage = e.message;
                } else {
                    seq.errorMessage = "" + e;
                }
            } else {
                seq.errorMessage = null;
            }
            this.currentSequenceUuid = null;
            this.currentSequencePromise = null;

            if (s !== "paused") {
                this.context.notification.notify("Sequence " + seq.title + " " + s + (e ? ": " + e : ""));
            }
        }


        // Check no sequence is running ?
        if (this.currentSequencePromise !== null) {
            throw new Error("A sequence is already running");
        }

        if (!Obj.hasKey(this.currentStatus.sequences.byuuid, uuid)) {
            throw new Error("No sequence");
        }

        
        await (createTask(ct, async (task:Task<void>)=> {
            this.currentSequencePromise = task;
            this.currentSequenceProgress = null;
            this.currentSequenceUuid = uuid;
            this.currentStatus.sequences.byuuid[uuid].status = 'running';
            this.currentStatus.sequences.byuuid[uuid].errorMessage = null;
    
            try {
                task.cancellation.throwIfCancelled();
                await sequenceLogic(task.cancellation);
            } catch(e) {
                if (e instanceof CancellationToken.CancellationError) {
                    finishWithStatus('paused');
                } else {
                    finishWithStatus('error', e)
                }
                throw e;
            }
            finishWithStatus('done');
        }));
    }

    startSequence = async (ct: CancellationToken, message:{sequenceUid: string})=>{
        this.doStartSequence(ct, message.sequenceUid);
    }

    stopSequence = async (ct: CancellationToken, message:{sequenceUid: string})=>{
        if (this.currentSequenceUuid !== message.sequenceUid) {
            throw new Error("Sequence " + message.sequenceUid + " is not running");
        }

        this.currentSequencePromise!.cancel();
    }

    resetSequence = async (ct: CancellationToken, message:{sequenceUid: string})=>{
        console.log('Request to reset sequence', JSON.stringify(message));
        const key = message.sequenceUid;
        if (this.currentSequenceUuid === key) {
            throw new Error("Sequence " + key + " is running");
        }

        if (!Object.prototype.hasOwnProperty.call(this.currentStatus.sequences.byuuid, key)) {
            throw new Error("Sequence " + key + " not found");
        }

        const sequence = this.currentStatus.sequences.byuuid[key];

        sequence.stepStatus = {};
        sequence.status = 'idle';
        sequence.progress = null;
        sequence.errorMessage = null;
        // for(const stepUuid of sequence.steps.list)
        // {
        //     const step = sequence.steps.byuuid[stepUuid];
        //     delete step.done;
        // }
    }

    dropSequence = async (ct: CancellationToken, message:{sequenceUid: string})=>{
        console.log('Request to drop sequence', JSON.stringify(message));
        const key = message.sequenceUid;
        if (this.currentSequenceUuid === key) {
            throw new Error("Sequence " + key + " is running");
        }
        let i;
        while((i = this.currentStatus.sequences.list.indexOf(key)) != -1) {
            this.currentStatus.sequences.list.splice(i, 1);
        }
        delete(this.currentStatus.sequences.byuuid[key]);
    }

    public async metrics():Promise<Array<Metrics.Definition>> {
        let ret : Array<Metrics.Definition> = [];
        const alive = Date.now() - this.lastImageTime < 60000;

        ret.push({
            name: 'sequence_fwhm',
            help: 'last fwhm of LIGHT image from sequence',
            type: 'gauge',
            value: alive ? this.lastFwhm : undefined,
        });

        ret.push({
            name: 'sequence_background_level',
            help: 'adu level (0-1) of black (20% histogram) - of last LIGHT image from sequence',
            type: 'gauge',
            value: alive ? this.lastBackgroundLevel: undefined,
        });

        ret.push({
            name: 'sequence_guiding_rms',
            help: 'rms error for the last LIGHT image from sequence',
            type: 'gauge',
            value: alive ? nullToUndefined(this.lastGuideStats?.RADECDistanceRMS) : undefined,
        });

        ret.push({
            name: 'sequence_guiding_rms_ra',
            help: 'rms error (ra) for the last LIGHT image from sequence',
            type: 'gauge',
            value: alive ? nullToUndefined(this.lastGuideStats?.RADistanceRMS) : undefined,
        });

        ret.push({
            name: 'sequence_guiding_rms_dec',
            help: 'rms error (dec) for the last LIGHT image from sequence',
            type: 'gauge',
            value: alive ? nullToUndefined(this.lastGuideStats?.DECDistanceRMS) : undefined,
        });

        ret.push({
            name: 'sequence_guiding_peak',
            help: 'peak error for the last LIGHT image from sequence',
            type: 'gauge',
            value: alive ? nullToUndefined(this.lastGuideStats?.RADECDistancePeak) : undefined,
        });

        ret.push({
            name: 'sequence_guiding_peak_ra',
            help: 'peak error (ra) for the last LIGHT image from sequence',
            type: 'gauge',
            value: alive ? nullToUndefined(this.lastGuideStats?.RADistancePeak) : undefined,
        });

        ret.push({
            name: 'sequence_guiding_peak_dec',
            help: 'rms error (peak) for the last LIGHT image from sequence',
            type: 'gauge',
            value: alive ? nullToUndefined(this.lastGuideStats?.DECDistancePeak) : undefined,
        });


        ret.push({
            name: 'sequence_star_count',
            help: 'number of stars detected in LIGHT image from sequence',
            type: 'gauge',
            value: alive ? this.lastStarCount : undefined,
        });

        ret.push({
            name: 'sequence_image_total',
            help: 'target number of image in current sequence',
            type: 'gauge',
            value: this.currentSequenceProgress?.totalCount
        });

        ret.push({
            name: 'sequence_image_done',
            help: 'number of image done in current sequence',
            type: 'gauge',
            value: this.currentSequenceProgress?.imagePosition
        });

        ret.push({
            name: 'sequence_duration_total',
            help: 'target number of exposure seconds for current sequence',
            type: 'gauge',
            value: this.currentSequenceProgress?.totalTime
        });

        ret.push({
            name: 'sequence_duration_done',
            help: 'number of exposed seconds in current sequence',
            type: 'gauge',
            value: this.currentSequenceProgress?.timeSpent
        });

        return ret;
    }

    getAPI() {
        return {
            deleteSequenceStep: this.deleteSequenceStep,
            updateSequence: this.updateSequence,
            patchSequenceStep: this.patchSequenceStep,
            updateSequenceStep: this.updateSequenceStep,
            updateSequenceStepDithering: this.updateSequenceStepDithering,
            moveSequenceSteps: this.moveSequenceSteps,
            newSequence: this.newSequence,
            newSequenceStep: this.newSequenceStep,
            startSequence: this.startSequence,
            stopSequence: this.stopSequence,
            resetSequence: this.resetSequence,
            dropSequence: this.dropSequence,
        }
    }
}


function nullToUndefined(e:number|null|undefined):number|undefined {
    if (e === null) {
        return undefined;
    } else {
        return e;
    }
}

function sanitizePath(p : string) {
    // Be cool with windows
    return p.replace(/[\/\.\*\?\:\\ ]+/g, '-');
}
