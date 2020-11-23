import CancellationToken from 'cancellationtoken';
import Wizard from "./Wizard";

import sleep from "./Sleep";
import { PolarAlignSettings, PolarAlignAxisResult, PolarAlignPositionWarning } from './shared/BackOfficeStatus';
import Sleep from './Sleep';
import { createTask } from './Task';
import { default as SkyProjection, Map360, Map180, Quaternion } from './SkyAlgorithms/SkyProjection';
import * as PlaneFinder from './SkyAlgorithms/PlaneFinder';
import { SucceededAstrometryResult } from './shared/ProcessorTypes';
import ScopeTrackCounter from './ScopeTrackCounter';
import Astrometry from './Astrometry';
import { SynchronizerTriggerCallback } from './JsonProxy';
const Quaternion = require("quaternion");

export type MountShift = {
            tooHigh: number;
            tooEast: number;
};


class ImpreciseDirectionChecker {
    astrometry: Astrometry;
    wizard: PolarAlignmentWizard;
    listener: SynchronizerTriggerCallback|undefined;
    constructor(wizard: PolarAlignmentWizard) {
        this.astrometry = wizard.astrometry;
        this.wizard = wizard;
    }

    getWarn = ()=> {
        const raDec = this.wizard.readScopePos();
        // FIXME: in degrees please
        raDec.ra *= 15;

        const geoCoords = this.wizard.readGeoCoords();

        const zenithRa = SkyProjection.getLocalSideralTime(new Date().getTime(), geoCoords.long);
        const scopeAltAz = SkyProjection.lstRelRaDecToAltAz({relRaDeg: raDec.ra - zenithRa, dec: raDec.dec}, geoCoords);
        return this.wizard.getAltAzWarningForAdjust(scopeAltAz);
    }

    check = ()=> {
        try {
            this.wizard.wizardStatus.polarAlignment!.adjustPositionWarning = this.getWarn();
            this.wizard.wizardStatus.polarAlignment!.adjustPositionError = null;
        } catch(e) {
            this.wizard.wizardStatus.polarAlignment!.adjustPositionWarning = null;
            this.wizard.wizardStatus.polarAlignment!.adjustPositionError = e.message || "" + e;
        }
    }

    start() {
        this.check();
        this.listener = this.astrometry.appStateManager.addSynchronizer(
                [
                    [
                        [
                        'astrometry', 'selectedScope'
                        ],
                        [
                            'indiManager', 'deviceTree', null,
                                [
                                    [ 'EQUATORIAL_EOD_COORD', 'childs', null, '$_' ],
                                    [ 'GEOGRAPHIC_COORD', 'childs', null, '$_' ]
                                ]
                        ],
                    ]
                ],
                this.check,
                false
        );
    }

    stop() {
        this.astrometry.appStateManager.removeSynchronizer(this.listener!);
        this.wizard.wizardStatus.polarAlignment!.adjustPositionWarning = null;
        this.wizard.wizardStatus.polarAlignment!.adjustPositionError = null;
    }
}

export default class PolarAlignmentWizard extends Wizard {
    sessionStartTimeStamp : string = "";

    getScope() {
        const scope = this.astrometry.currentStatus.selectedScope;
        if (!scope) {
            throw new Error("no scope selected");
        }
        return scope;
    }

    readRa():number {
        // Inserts a sleep to ensure data is up to date ?
        const vec = this.astrometry.indiManager.getValidConnection().getDevice(this.getScope()).getVector("EQUATORIAL_EOD_COORD");
        const ra = parseFloat(vec.getPropertyValue("RA"));
        console.log('current ra', ra);
        return ra;
    }

    // Read jnow scope position
    readScopePos = () => {
        // Inserts a sleep to ensure data is up to date ?
        const vec = this.astrometry.indiManager.getValidConnection().getDevice(this.getScope()).getVector("EQUATORIAL_EOD_COORD");
        const ra = parseFloat(vec.getPropertyValue("RA"));
        const dec = parseFloat(vec.getPropertyValue("DEC"));
        
        console.log('current scope pos', ra, dec);
        return {ra, dec};
    }

    getAltAzWarningForAdjust(scopeAltAz: {alt:number, az:number}) : null|PolarAlignPositionWarning
    {
        function acceptAbove(v: number, min: number, max: number):number|undefined
        {
            if (v <= min) {
                return 0;
            }
            if (v >= max) {
                return undefined;
            }
            return (v - min) / (max - min);
        }

        let distances = [
            {
                id: "zenith",
                dst: acceptAbove(90 - scopeAltAz.alt, 10, 20),
            },
            {
                id: "west",
                dst: acceptAbove(SkyProjection.getDegreeDistanceAltAz(scopeAltAz, {alt:0, az:-90}), 15, 25)
            },
            {
                id: "east",
                dst: acceptAbove(SkyProjection.getDegreeDistanceAltAz(scopeAltAz, {alt:0, az:90}), 15, 25)
            },
            {
                id: "horizon",
                dst : acceptAbove(scopeAltAz.alt, 10, 20)
            },
        ];

        let worstC = null;
        for(const c of distances) {
            if (c.dst === 0) {
                return {id: c.id, dst:c.dst};
            }
            if (c.dst !== undefined && (worstC === null || c.dst < worstC.dst!)) {
                worstC = c;
            }
        }
        return worstC as null|PolarAlignPositionWarning;
    }

    readGeoCoords = () => {
        // Inserts a sleep to ensure data is up to date ?
        const vec = this.astrometry.indiManager.getValidConnection().getDevice(this.getScope()).getVector("GEOGRAPHIC_COORD");
        const lat = parseFloat(vec.getPropertyValue("LAT"));
        const long = parseFloat(vec.getPropertyValue("LONG"));
        console.log('current geo coords', lat, long);
        return {lat, long};
    }

    async prepareScope(ct: CancellationToken, settings:PolarAlignSettings) {
        console.log('Setting TELESCOPE_TRACK_MODE.TRACK_SIDEREAL');
        await this.astrometry.indiManager.setParam(ct, this.getScope(), 'TELESCOPE_TRACK_MODE', {'TRACK_SIDEREAL': 'On'});
        
        // Start tracking. This one stays busy ... No way to distinguish from a failed pending order !
        console.log('Setting TELESCOPE_TRACK_STATE');
        await this.astrometry.indiManager.activate(ct, this.getScope(), 'TELESCOPE_TRACK_STATE', 'TRACK_ON');

        // Set speed for slew
        console.log('Setting TELESCOPE_SLEW_RATE');
        await this.astrometry.indiManager.setParam(ct, this.getScope(), 'TELESCOPE_SLEW_RATE', {
            [settings.slewRate]: 'On'
        });
    }

    static raDistance(a:number, b:number) {
        let result = (b - a) % 24;
        if (result > 12) {
            result -= 24;
        }
        if (result < -12) {
            result += 24;
        }
        console.log('ra distance is ', result);
        return result;
    }

    // Stop at 1°
    private epsilon: number = 1/15;

    async slew(ct: CancellationToken, settings:PolarAlignSettings, targetRa:number) {
        // Read RA
        const startRa = this.readRa();
        const initialDistance = PolarAlignmentWizard.raDistance(startRa, targetRa);
        if (Math.abs(initialDistance) < this.epsilon) {
            return;
        }
        let bestDistance = initialDistance;

        const direction = bestDistance > 0 ? 'MOTION_EAST' : 'MOTION_WEST';
        console.log('Starting motion to targetRa to ' + targetRa);
        const motion = createTask<void>(ct, async (task)=> {
            await this.astrometry.indiManager.pulseParam(task.cancellation, this.getScope(), 'TELESCOPE_MOTION_WE', direction);
        });
        const pilot = createTask<void>(ct, async (task)=> {
            console.log('Pilot task started');
            while(true) {
                await Sleep(task.cancellation, 100);
                const newRa = this.readRa();
                const newDistance = PolarAlignmentWizard.raDistance(newRa, targetRa);
                console.log('Pilot task: ', newDistance);
                if (Math.abs(newDistance) < this.epsilon) {
                    break;
                }
                if (Math.abs(newDistance) > Math.abs(bestDistance)) {
                    // FIXME: throw error if distance is big
                    break;
                }
                if (Math.sign(newDistance) != Math.sign(bestDistance)) {
                    // FIXME: throw error if distance is big
                    break;
                }
                bestDistance = newDistance;
            }
            console.log('Pilot task finished');
        });
        // FIXME: if parent token was interrupted...
        let error = undefined;
        try {
            motion.catch((e)=>pilot.cancel());
            pilot.catch((e)=>motion.cancel());
            await pilot;
            console.log('Done with pilot task');
        } catch(e) {
            console.log('Catched pilot task catched', e);
            if (!(e instanceof CancellationToken.CancellationError)) {
                console.warn("Pulse pilot failed", e);
                error = e;
            }
        } finally {
            try {
                console.log('Stoping motion task');
                motion.cancel();
                await motion
                console.log('Motion task done (?)');
            } catch(e) {
                console.log('Motion task catched', e);
                if (!(e instanceof CancellationToken.CancellationError)) {
                    console.warn("Motion failed", e);
                    error = e;
                }
            }
        };
        if (error) {
            throw error;
        }
        ct.throwIfCancelled();
    }

    /**
     * geoCoords: position of the observer
     * raDecNow: supposed position of the scope
     * epoch: number
     * 
     * return {start, end}: rel to zenith RA range
     */
    static computeRaRange = (
                geoCoords: {lat:number, long:number},
                raDecNow: {ra: number, dec:number},
                epoch: number,
                settings : {
                    angle: number,          // Maximum RA angle from zenith (mount limit)
                    minAltitude: number,    // Don't descend under this alt
                }
    ) => {
        const zenithRa = SkyProjection.getLocalSideralTime(epoch * 1000, geoCoords.long);
        console.log('zenith ra is ', zenithRa);

        // Minimum RA step in °
        const step = 1;
        let rangeDeg = 0;
        while(  (rangeDeg + step <= settings.angle)
                && (rangeDeg+step <= 110)
                && (SkyProjection.lstRelRaDecToAltAz({relRaDeg:rangeDeg + step, dec : raDecNow.dec}, geoCoords).alt >= Math.max(settings.minAltitude,5))
                )
        {
            rangeDeg += step;
        }

        if (rangeDeg === 0) {
            throw new Error("Current pos is too low above the horizon. Move scope or raise min altitude");
        }
        console.log('rangeDeg is ', rangeDeg);
        const raRange = rangeDeg / 15;

        const startRelRa = SkyProjection.raDiff(
                                raDecNow.ra,
                                zenithRa / 15
                                );

        if (Math.abs(startRelRa) > 6) {
            throw new Error("Star too low. Peek a star closer to its culmination");
        }

        let start: number, end:number;
        if (startRelRa < 0) {
            // -90° to 0
            start = -raRange;
            end = 0;
        } else {
            // 0 to 90°
            start = raRange;
            end = 0;
        }
        return {start, end};
    }

    // Return coords of the axis in deg rel to zenith coords.
    static findMountAxis(path:Array<{relRaDeg: number, dec:number}>):{relRaDeg: number, dec:number}
    {
        const points = path.map(e=>SkyProjection.convertRaDecToEQ3D([e.relRaDeg, e.dec]));
        const equation = PlaneFinder.bestFit(points);
        if (equation === null) {
            throw new Error("Not enough points");
        }
        // We take the first vector, which is the normal of the plane, supposed to be the axis of the mount
        const axisRelRaDeg = SkyProjection.convertEQ3DToRaDec(equation);
        return {relRaDeg: axisRelRaDeg[0], dec: axisRelRaDeg[1]};
    }

    static computeAxis(altAzMountAxis: {alt: number, az:number}, geoCoords: {lat:number, long:number}): PolarAlignAxisResult {

        return {
            ...altAzMountAxis,
            tooEast: SkyProjection.raDegDiff(altAzMountAxis.az, 0),
            tooHigh: SkyProjection.raDegDiff(altAzMountAxis.alt, geoCoords.lat),
            distance: SkyProjection.getDegreeDistance([0, geoCoords.lat], [altAzMountAxis.az, altAzMountAxis.alt])
        }
    }

    static mockRaDecDegNow(raDecDegNow: number[], msTime: number, geoCoords: {lat:number, long:number}, mountMock?:MountShift): number[]
    {
        if (mountMock === undefined) {
            return raDecDegNow;
        }
        const quat = SkyProjection.getALTAZ3DMountCorrectionQuaternion([geoCoords.lat, 0], [geoCoords.lat + mountMock.tooHigh, mountMock.tooEast]);
        let zenithRa = SkyProjection.getLocalSideralTime(msTime, geoCoords.long);
        let relRaDec = {dec: raDecDegNow[1], relRaDeg: Map180(raDecDegNow[0] - zenithRa)};
        let altAz = SkyProjection.lstRelRaDecToAltAz(relRaDec, geoCoords);
        let ptALTAZEQ3D = SkyProjection.convertAltAzToALTAZ3D(altAz);
        ptALTAZEQ3D = quat.rotateVector(ptALTAZEQ3D);
        altAz = SkyProjection.convertALTAZ3DToAltAz(ptALTAZEQ3D);
        relRaDec = SkyProjection.altAzToLstRelRaDec(altAz, geoCoords);
        return [Map360(relRaDec.relRaDeg + zenithRa), relRaDec.dec];
    }

    static mockALTAZ3D(msTime: number, geoCoords: {lat:number, long:number}, mountMock?:MountShift): Quaternion
    {
        if (mountMock === undefined) {
            return Quaternion.ONE;
        }
        const quat = SkyProjection.getALTAZ3DMountCorrectionQuaternion([geoCoords.lat, 0], [geoCoords.lat + mountMock.tooHigh, mountMock.tooEast]);
        return quat;
    }

    static centerFromAstrometry(astrometry: SucceededAstrometryResult, photoTime: number, geoCoords: {lat:number, long:number}) : {raDecDegNow: number[], quatALTAZ3D: Quaternion}{
        const skyProjection = SkyProjection.fromAstrometry(astrometry);
        const [ra2000, dec2000] = skyProjection.pixToRaDec([astrometry.width / 2, astrometry.height / 2]);
        // compute JNOW center for last image.
        let raDecDegNow = SkyProjection.raDecEpochFromJ2000([ra2000, dec2000], photoTime);
        raDecDegNow = PolarAlignmentWizard.mockRaDecDegNow(raDecDegNow, photoTime, geoCoords, PolarAlignmentWizard.mountMock);

        let quatALTAZ3D = skyProjection.getIMG3DToEQ3DQuaternion([astrometry.width / 2, astrometry.height / 2])

        quatALTAZ3D = SkyProjection.getEQ3DToALTAZ3DQuaternion(photoTime, geoCoords).mul(quatALTAZ3D);

        quatALTAZ3D = PolarAlignmentWizard.mockALTAZ3D(photoTime, geoCoords, PolarAlignmentWizard.mountMock).mul(quatALTAZ3D);

        return {raDecDegNow, quatALTAZ3D };
    }

    public static mountMock?:MountShift = undefined;
    
    shoot = async (token: CancellationToken, frameid: number, frametype:string)=> {
        let photoTime = Date.now();
        this.wizardStatus.polarAlignment!.shootRunning = true;
        try {
            const cameraId = this.astrometry.cameraId();
            if (cameraId === null) {
                throw new Error("No camera in current setup");
            }
            const photo = await this.astrometry.camera.doShoot(
                            token,
                            cameraId,
                            (s)=> ({
                                ...s,
                                type: 'LIGHT',
                                prefix: `polar-align-${this.sessionStartTimeStamp}-${frameid}-${frametype}-ISO8601`
                            })
            );
            photoTime = (photoTime + Date.now()) / 2;
            console.log('done photo', photo);
            return { photo, photoTime };
        } finally {
            this.wizardStatus.polarAlignment!.shootRunning = false;
        }
    }

    static updateAxis = (previousAxe: {alt:number, az:number}, refALTAZ3D: Quaternion, quatALTAZ3D: Quaternion, trackedMs:number):{alt:number, az:number}=> {
        const previousAxeALTAZ3D = SkyProjection.convertAltAzToALTAZ3D(previousAxe);

        const tracking = Quaternion.fromAxisAngle(previousAxeALTAZ3D, -trackedMs * 2 * Math.PI / SkyProjection.SIDERAL_DAY_MS);
        // Rotate previous Axe
        const trackedRefALTAZ3D = tracking.mul(refALTAZ3D);

        // We could divied quat/corrected.
        // This is more stable but less precise since field rotation is very imprecise compared to astrometry resolution
        // Compute alt-az of center of correctedRefAltAz3D (just rotateVector origin)
        const trackedRefALTAZ3Dvec = trackedRefALTAZ3D.rotateVector([0,0,1]);
        const correctedALTAZ3Dvec =quatALTAZ3D.rotateVector([0,0,1]);
        console.log('Alt-az move is ' + SkyProjection.getDegreeDistance3D(trackedRefALTAZ3Dvec, correctedALTAZ3Dvec) + "°");

        // Check that axis are not too close to the pole
        const trackedRefAltAz = SkyProjection.convertALTAZ3DToAltAz(trackedRefALTAZ3Dvec);
        const correctedAltAz = SkyProjection.convertALTAZ3DToAltAz(correctedALTAZ3Dvec);
        
        const move1 = {az: Map180(correctedAltAz.az - trackedRefAltAz.az), alt: Map180(correctedAltAz.alt - trackedRefAltAz.alt)};
        const invertedCorrectedAltAz = {
            az: Map360(correctedAltAz.az + 180),
            alt: correctedAltAz.alt >=0 ? 180 - correctedAltAz.alt : (-180) - correctedAltAz.alt
        };
        const move2 = {az: Map180(invertedCorrectedAltAz.az - trackedRefAltAz.az), alt: Map180(invertedCorrectedAltAz.alt - trackedRefAltAz.alt)};

        const move = Math.abs(move1.az)+Math.abs(move1.alt) <= Math.abs(move2.az)+Math.abs(move2.alt) ? move1 : move2;
        
        // FIXME: alt can go above 90...
        return {alt: previousAxe.alt + move.alt, az: previousAxe.az + move.az};

        // const polarMove = Quaternion.fromBetweenVectors(refALTAZ3Dvec, correctedALTAZ3Dvec);
        
        // // const newAxeALTAZ3D = polarMove.rotateVector(previousAxeALTAZ3D);

        // console.log({previousAxeALTAZ3D, refALTAZ3D, correctedRefALTAZ3D, quatALTAZ3D, polarMove, newAxeALTAZ3D, trackedMs});
        // return SkyProjection.convertALTAZ3DToAltAz(newAxeALTAZ3D);
    }


    start = async ()=> {
        this.wizardStatus.title = "Polar alignment";

        this.wizardStatus.polarAlignment = {
            status: "initialConfirm",
            data: {},
            astrometrySuccess: 0,
            astrometryFailed: 0,
            shootDone: 0,
            shootRunning: false,
            scopeMoving: false,
            astrometryRunning: false,
            maxStepId: 0,
            stepId: 0,
            adjustError: null,
            adjusting: null,
            fatalError: null,
            hasRefFrame: false,
            adjustPositionError: null,
            adjustPositionWarning: null,
        }

        const wizardReport = this.wizardStatus.polarAlignment!;

        // RA relative to zenith
        let status: undefined | {start : number, end: number, stepSize: number, stepId: number, maxStepId: number};
        let shootId = 0;
        let scopeTrackCounter: ScopeTrackCounter|undefined;
        try {
            while(true) {
                await this.waitNext(wizardReport!.status === "initialConfirm" ? "Start >>" : "Resume");
                wizardReport!.status = "running";
                if (!this.sessionStartTimeStamp) {
                    this.sessionStartTimeStamp = new Date().toISOString().replace(/\.\d+|[-:]/g,'');
                }
                const {token, cancel} = CancellationToken.create();
                this.setInterruptor(cancel);
                try {
                    // Set scope track to off
                    // take a shoot and resolve
                    // compute the actual arc
                    // for(i = min to max)
                    //      slew to i
                    //      shoot
                    //      start astrometry
                    // then do a regression to compute error
                    // TODO: put the real code for polar alignment...
                    // TODO: deep copy parameters on the first pass
                    try {
                        while(true) {
                            const geoCoords = this.readGeoCoords();
                            const cameraId = this.astrometry.cameraId();
                            if (!cameraId) {
                                throw new Error("No camera selected");
                            }
                            
                            if (status === undefined) {
                                const settings = this.astrometry.currentStatus.settings.polarAlign;
                                if (settings.sampleCount < 3) {
                                    throw new Error("Need at least 3 samples");
                                }

                                const raRange = PolarAlignmentWizard.computeRaRange(
                                                        geoCoords,
                                                        this.readScopePos(),
                                                        new Date().getTime() / 1000,
                                                        settings);
                                status = {
                                    ...raRange,
                                    maxStepId: settings.sampleCount - 1,
                                    stepSize: (raRange.end - raRange.start) / (settings.sampleCount - 1),
                                    stepId: 0,
                                }
                            }
                            wizardReport.stepId = status.stepId;
                            wizardReport.maxStepId = status.maxStepId;

                            await this.prepareScope(token, this.astrometry.currentStatus.settings.polarAlign);
                            
                            const relRa = status.start + status.stepSize * status.stepId;
                            const targetRa = SkyProjection.getLocalSideralTime(new Date().getTime(), geoCoords.long) / 15 + relRa;

                            try {
                                wizardReport.scopeMoving = true;
                                await this.slew(token, this.astrometry.currentStatus.settings.polarAlign, targetRa);
                                // Settle before shoot
                                await sleep(token, 500);
                            } finally {
                                wizardReport.scopeMoving = false;
                            }
                            console.log('Done slew to ' + targetRa + ' got ' + this.readScopePos().ra);

                            const { photo, photoTime } = await this.shoot(token, ++shootId, "sampling");
                            wizardReport.shootDone++;

                            // FIXME: put in a resumable task queue
                            try {
                                wizardReport.astrometryRunning = true;
                                const astrometry = await this.astrometry.compute(token, {image: photo.path, forceWide: false});
                                // FIXME: convert to JNOW & put in queue
                                console.log('done astrom', astrometry);
                                if (astrometry.found) {
                                    wizardReport.astrometrySuccess++;
                                    const { raDecDegNow } = PolarAlignmentWizard.centerFromAstrometry(astrometry, photoTime!, geoCoords);

                                    const stortableStepId = ("000000000000000" + status.stepId.toString(16)).substr(-16);

                                    const zenithRa = SkyProjection.getLocalSideralTime(photoTime!, geoCoords.long);

                                    wizardReport.data[stortableStepId] = {
                                        relRaDeg: Map180(raDecDegNow[0] - zenithRa),
                                        dec: raDecDegNow[1],
                                    };
                                } else {
                                    wizardReport.astrometryFailed++;
                                }
                            } catch(e) {
                                if (e instanceof CancellationToken.CancellationError) {
                                    throw e;
                                }
                                console.log('Ignoring astrometry problem', e);
                                wizardReport.astrometryFailed++;
                            } finally {
                                wizardReport.astrometryRunning = false;
                            }
                            if (status.stepId >= status.maxStepId) {
                                break;
                            }
                            status.stepId++;
                        }

                        // We are done. Compute the regression
                        console.log('Compute the regression for', JSON.stringify(wizardReport.data));
                        
                        const path = Object.keys(wizardReport.data).map(k=>wizardReport.data[k]);
                        const mountAxis = PolarAlignmentWizard.findMountAxis(path);
                        const geoCoords = this.readGeoCoords();
                        const altAzMountAxis = SkyProjection.lstRelRaDecToAltAz(mountAxis, geoCoords);
                        wizardReport.axis = PolarAlignmentWizard.computeAxis(altAzMountAxis, geoCoords);

                        console.log('result is ', JSON.stringify(wizardReport.axis));
                        break;
                    } finally {
                        this.setInterruptor(null);
                        this.setPaused(true);
                    }

                } catch(e) {
                    if (e instanceof CancellationToken.CancellationError) {
                        this.wizardStatus.polarAlignment!.status = "paused";
                    } else {
                        this.wizardStatus.polarAlignment!.fatalError = e.message || "" + e;
                        throw e;
                    }
                }
            }

            // Let the user review.
            this.wizardStatus.polarAlignment!.status = "done";
            await this.waitNext("Next >>");

            // We arrived here when user wants to adjust mount.
            // We have a ref point and a correction to perform
            // The tracking is on.
            // For each new photo, we compute the alt-az distance between
            //    (ra,dec) of the reference photo
            //    (ra,dec) of the photo
            this.wizardStatus.polarAlignment!.status = "adjusting";
            wizardReport.adjustError = null;

            let badAxisAtRefAltAz = {alt: wizardReport.axis!.alt, az: wizardReport.axis!.az};
            let badAxisLastAltAz = badAxisAtRefAltAz;
            let refALTAZ3D : Quaternion | null = null;
            while(true) {
                wizardReport.adjusting = null;
                // Always go back to normal frame
                this.astrometry.currentStatus.settings.polarAlign.dyn_nextFrameIsReferenceFrame = false;
                const posChecker = new ImpreciseDirectionChecker(this);
                posChecker.start();
                try {
                    await this.waitNext("Shoot");
                } finally {
                    posChecker.stop();
                }
                this.setPaused(false);
                const takeRefFrame = this.astrometry.currentStatus.settings.polarAlign.dyn_nextFrameIsReferenceFrame || (refALTAZ3D === null);
                wizardReport.adjusting = takeRefFrame ? "refframe" : "frame";
                wizardReport.adjustError = null;

                const {token, cancel} = CancellationToken.create();
                this.setInterruptor(cancel);
                let tempScopeTrackCounter;
                try {
                    if (takeRefFrame) {
                        wizardReport.hasRefFrame = false;
                        refALTAZ3D = null;
                        badAxisAtRefAltAz = badAxisLastAltAz;
                    }

                    // FIXME: better progress report
                    const {photo, photoTime } = await this.shoot(token, ++shootId, takeRefFrame ? "adjustment" : "reference");
                    let photoTrackSinceRef:number;
                    if (takeRefFrame) {
                        tempScopeTrackCounter = new ScopeTrackCounter(this.astrometry.indiManager, this.getScope());
                        tempScopeTrackCounter.start();
                        photoTrackSinceRef = 0;
                    } else {
                        photoTrackSinceRef = scopeTrackCounter!.getElapsed();
                    }

                    const astrometry = await this.astrometry.compute(token, {image: photo.path, forceWide: false});
                    console.log('done astrom', astrometry);
                    if (astrometry.found) {
                        const geoCoords = this.readGeoCoords();
                        const { raDecDegNow, quatALTAZ3D } = PolarAlignmentWizard.centerFromAstrometry(astrometry, photoTime!, geoCoords);

                        if (takeRefFrame) {
                            refALTAZ3D = quatALTAZ3D;
                            wizardReport.hasRefFrame = true;

                            // Replace the tracker with this one.
                            if (scopeTrackCounter !== undefined) {
                                scopeTrackCounter.stop();
                            }
                            scopeTrackCounter = tempScopeTrackCounter;
                            tempScopeTrackCounter = undefined;

                        } else {
                            badAxisLastAltAz = PolarAlignmentWizard.updateAxis(badAxisAtRefAltAz, refALTAZ3D!, quatALTAZ3D, photoTrackSinceRef);
                            wizardReport.axis = PolarAlignmentWizard.computeAxis(badAxisLastAltAz, geoCoords);
                        }
                    } else {
                        throw new Error("Astrometry failed");
                    }
                } catch(e) {
                    if (!(e instanceof CancellationToken.CancellationError)) {
                        console.warn("failure", e);
                        wizardReport.adjustError = e.message || ''+e;
                        await this.waitNext("Resume");
                    } else {
                        wizardReport.adjustError = "Interrupted";
                    }
                } finally {
                    if (tempScopeTrackCounter !== undefined) {
                        tempScopeTrackCounter.stop();
                        tempScopeTrackCounter = undefined;
                    }
                }
            }
        } finally {
            if (scopeTrackCounter !== undefined) {
                scopeTrackCounter.stop();
                scopeTrackCounter = undefined;
            }
        }
    }
}