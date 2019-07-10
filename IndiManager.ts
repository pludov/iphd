/**
 * Created by ludovic on 21/07/17.
 */
import fs from 'fs';
import {xml2JsonParser as Xml2JSONParser, Schema} from './Xml2JSONParser';
import {IndiConnection, Vector, Device} from './Indi';
import { ExpressApplication, AppContext } from "./ModuleBase";
import { IndiManagerStatus, IndiManagerSetPropertyRequest, BackofficeStatus } from './shared/BackOfficeStatus';
import { IndiMessage } from './shared/IndiTypes';
import JsonProxy, { TriggeredWildcard, NoWildcard } from './JsonProxy';
import CancellationToken from 'cancellationtoken';
import Timeout from './Timeout';
import Sleep from './Sleep';
import IndiServerStarter from './IndiServerStarter';
import ConfigStore from './ConfigStore';
import IndiAutoConnect from './IndiAutoConnect';
import IndiAutoGphotoSensorSize from './IndiAutoGphotoSensorSize';
import * as RequestHandler from "./RequestHandler";
import * as BackOfficeAPI from "./shared/BackOfficeAPI";

function has(obj:any, key:string) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function clear(obj:any) {
    for(var k of Object.keys(obj)) {
        delete(obj[k]);
    }
}

const DriverXmlSchema:Schema = {
    driversList: {
        devGroup: {
            $isArray:true,
            $notext: true,
            device: {
                $isArray:true
            }
        }
    }
} as any;

export default class IndiManager implements RequestHandler.APIAppProvider<BackOfficeAPI.IndiAPI>{
    appStateManager: JsonProxy<BackofficeStatus>;
    currentStatus: IndiManagerStatus;
    lastMessageSerial: undefined|number;
    lastMessageStamp: undefined|number;
    indiServerStarter: IndiServerStarter | null;
    connection: undefined|IndiConnection;

    constructor(app:ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context: AppContext) {
        var self = this;
        this.appStateManager = appStateManager;
        this.appStateManager.getTarget().indiManager = {
            // connecting, connected, error
            status: "connecting",
            deviceTree: {},
            // Messages by uids
            messages: {
                byUid: {}
            },
            // Maps indi drivers to group
            driverToGroup: {},
            configuration: {
                driverPath: "none",
                indiServer: {
                    path: null,
                    fifopath: null,
                    devices: {},
                    autorun: true,
                },
            }
        }

        this.currentStatus = this.appStateManager.getTarget().indiManager;
        this.lastMessageSerial = undefined;
        this.lastMessageStamp = undefined;
        new ConfigStore(appStateManager, 'indi', ['indiManager', 'configuration'], {
            driverPath: '/usr/share/indi/',
            indiServer: {
                autorun: false,
                path: null,
                fifopath: null,
                devices: {}
            }
        }, {
            driverPath: '/usr/share/indi/,/opt/share/indi/',
            indiServer: {
                autorun: true,
                path: '/opt/bin',
                fifopath: null,
                devices: {
                    'CCD Simulator': {
                        driver: 'indi_simulator_ccd',
                        config: 'ccd_simul',
                        prefix: null,
                        skeleton: null
                    }
                }
            }
        });

        // List configuration settings
        this.appStateManager.addSynchronizer(['indiManager', 'configuration', 'driverPath'], () => {self.readDrivers();}, true);

        this.lifecycle(CancellationToken.CONTINUE);

        if (this.currentStatus.configuration.indiServer !== null) {
            this.indiServerStarter = new IndiServerStarter(this.currentStatus.configuration.indiServer);
        } else {
            this.indiServerStarter = null;
        }

        new IndiAutoConnect(this);
        new IndiAutoGphotoSensorSize(this);
    }

    public getIndiServerAddr() : {host: string, port: number} {
        return {
            host: "127.0.0.1",
            port: 7624,
        };
    }

    public getAPI() {
        return {
            connectDevice: this.connectDevice,
            disconnectDevice: this.disconnectDevice,
            restartDriver: this.restartDriver,
            updateDriverParam: this.updateDriverParam,
            updateVector: this.updateVector,
        }
    }

    public createPreferredDeviceSelector<T>(params: {
                        availablePreferedCurrentPath: any,
                        read:()=>{available: string[], current: string|null, prefered: string|null},
                        set:(p:{current?: string|null, prefered?: string|null})=>(void)})
    {
        return this.createMultiPreferredDeviceSelector(
                {
                    availablePreferedCurrentPath: params.availablePreferedCurrentPath,
                    list: ()=>[""],
                    read: ()=>params.read(),
                    set: (id:string, p)=>params.set(p)
                });
    }

    // availablePreferedCurrentPath: a json synchronizer path that match available, prefered and current properties.
    //                               it can contain one wildcard for available and current
    public createMultiPreferredDeviceSelector<T>(params: {
                        availablePreferedCurrentPath: any,
                        list:()=>string[],
                        read:(id:string)=>{available: string[], current: string|null, prefered: string|null}|null,
                        set:(id:string, p:{current?: string|null, prefered?: string|null})=>(void)})
    {
        const update = (id:string)=>{
            const status = params.read(id);
            if (status === null) {
                return;
            }
            let newCurrent: string|null|undefined;
            let newPrefered: string|null|undefined;
            if (status.current !== null) {
                if (status.available.indexOf(status.current) === -1) {
                    newCurrent = null;
                    status.current = null;
                } else {
                    if (status.prefered !== status.current) {
                        newPrefered = status.current;
                    }
                }
            }
            if (status.current === null) {
                if (status.prefered !== null && status.available.indexOf(status.prefered) !== -1) {
                    newCurrent = status.prefered;
                    status.current = newCurrent;
                }
            }
            if (newCurrent !== undefined || newPrefered !== undefined) {
                params.set(id, {current: newCurrent, prefered: newPrefered});
            }
        };

        const wildcardUpdate = (wildcards: TriggeredWildcard)=> {
            if (wildcards[NoWildcard]) {
                for(const id of params.list()) {
                    update(id);
                }
            } else {
                for(const id of Object.keys(wildcards)) {
                    update(id);
                }
            }
        }
        this.appStateManager.addSynchronizer(
            params.availablePreferedCurrentPath,
            wildcardUpdate,
            true,
            true
        );
    }

    public createDeviceListSynchronizer(cb: (devices: string[])=>(void), driverClass?: string, interfaceMask?:number)
    {
        const updateAvailableDevices = () => {
            // Re-List all devices
            var availableDevices = [];
            for(var deviceId of Object.keys(this.currentStatus.deviceTree).sort()) {
                var device = this.currentStatus.deviceTree[deviceId];
                if (driverClass !== undefined) {
                    try {
                        const driver = device.DRIVER_INFO.childs.DRIVER_EXEC.$_;
                        if (this.currentStatus.driverToGroup[driver] !== driverClass) {
                            continue;
                        }
                    } catch(e) {
                        continue;
                    }
                }

                if (interfaceMask !== undefined) {
                    try {
                        const interfaceValue = parseInt(device.DRIVER_INFO.childs.DRIVER_INTERFACE.$_, 10);
                        if ((interfaceValue & interfaceMask) !== interfaceMask) {
                            continue;
                        }
                    } catch(e) {
                        continue;
                    }
                }

                console.log('got a device: ' + deviceId)
                availableDevices.push(deviceId);
            }
            cb(availableDevices);
        }

        // Update available devices on driver desc and deviceTree change 
        this.appStateManager.addSynchronizer(
            [
                'indiManager',
                    [
                        // Bind to driver_exec of each device
                        ['deviceTree', null, 'DRIVER_INFO', 'childs', 
                            [
                                ['DRIVER_EXEC', '$_'],
                                ['DRIVER_INTERFACE', '$_']
                            ]
                        ],
                        // Bind to driverToGroup mapping (any change)
                        ['driverToGroup',null]
                    ]
            ], updateAvailableDevices, true);
    }

    nextMessageUid() {
        var now = new Date().getTime();
        let serial:number = 0;
        if (this.lastMessageStamp !== undefined) {
            if (this.lastMessageStamp > now) {
                // Don't go backward
                now = this.lastMessageStamp!;
            }
            if (this.lastMessageStamp === now) {
                serial = this.lastMessageSerial! + 1;
            } else {
                serial = 0;
            }
        } else {
            serial = 0;
        }
        this.lastMessageStamp = now;
        this.lastMessageSerial = serial;

        let serialStr = serial.toString(16);
        // Ensure lexicographical order of serial
        var prefix = '';
        for(var i = 1; i < serialStr.length; ++i) {
            prefix += 'Z';
        }
        return new Date(now).toISOString() + ":" + prefix + serialStr;
    }

    readDrivers()
    {
        var pathList = this.currentStatus.configuration.driverPath.split(',');

        var driverToGroup : {[id:string]:string}= {};

        pathList.forEach((path)=>{
            var content:string[] = [];
            try {
                content = fs.readdirSync(path);
            } catch(e) {
            }

            content.filter(file => (file.match(/\.xml$/) && !file.match(/_sk\.xml$/))).forEach((file)=> {
                file = path + '/' + file;
                console.log('Found driver: ' + file);

                try {
                    function onMessage(e:any) {
                        if (e.$$ != 'driversList') {
                            console.warn('Ignored xml driver content: ' + JSON.stringify(e, null, 2));
                            return;
                        }
                        try {
                            for(var group of e.devGroup)
                            {
                                for(var device of group.device) {
                                    var driver = device.driver.$_;
                                    driverToGroup[driver] = group.$group;
                                }
                            }
                        } catch(e) {
                            console.error('Failed to parse xml drivers', e.stack || e);
                        }
                    }
                    var content = fs.readFileSync(file);
                    var parser = Xml2JSONParser(DriverXmlSchema, 1, onMessage);
                    parser.write(content.toString('utf-8'))
                    parser.close();
                } catch(e) {
                    console.log('Unable to parse ' + file, e.stack || e);
                }
            });
        });

        this.currentStatus.driverToGroup = driverToGroup;
    }

    private readonly connectionListener = new Set<(cnx:undefined|IndiConnection)=>(void)>();

    addConnectionListener(cb: (cnx:undefined|IndiConnection)=>(void))
    {
        this.connectionListener.add(cb);
    }

    removeConnectionListener(cb: (cnx:undefined|IndiConnection)=>(void))
    {
        this.connectionListener.delete(cb);
    }

    refreshStatus()
    {
        if (this.connection == undefined) {
            this.currentStatus.status = "error";
            clear(this.currentStatus.deviceTree);

        } else if (!this.connection.connected) {
            this.currentStatus.status = "connecting";
            clear(this.currentStatus.deviceTree);
        } else {
            this.currentStatus.status = "connected";
        }
        for(const o of Array.from(this.connectionListener)) {
            if (this.connectionListener.has(o)) {
                try {
                    o(this.connection);
                } catch(e) {
                    console.error("Error during indi cb", e);
                }
            }
        }
    }

    async lifecycle(ct: CancellationToken) {
        while(true) {
            let indiConnection = new IndiConnection();
            this.connection = indiConnection;
            this.connection.deviceTree = this.currentStatus.deviceTree;

            // start
            var listener = ()=>{
                this.refreshStatus();
            };

            const addr = this.getIndiServerAddr();
            indiConnection.connect(addr.host, addr.port);
            indiConnection.addListener(listener);
            indiConnection.addMessageListener((msg)=>{
                console.log('Received message : ', JSON.stringify(msg));
                this.addMessage(msg);
                this.cleanupMessages();
            });

            await indiConnection.wait(ct,
                () => indiConnection.isDead(),
                true);

                
            console.log('Indi connection disconnected');
            indiConnection.removeListener(listener);
            if (this.connection === indiConnection) {
                this.connection = undefined;
                this.refreshStatus();
            }

            await Sleep(ct, 2000);
        }
    }

    addMessage(m:IndiMessage)
    {
        const uid = this.nextMessageUid();
        this.currentStatus.messages.byUid[uid] = {...m, uid};
        this.cleanupMessages();
    }

    cleanupMessages()
    {
        var maxMessages = 100;
        var keys = Object.keys(this.currentStatus.messages.byUid);
        if (keys.length > maxMessages) {
            keys.sort();
            for(var i = 0; i < keys.length - maxMessages; ++i) {
                delete this.currentStatus.messages.byUid[keys[i]];
            }
        }
    }

    getValidConnection():IndiConnection
    {
        var connection = this.connection;
        if (connection === undefined) {
            throw new Error("Indi server not connected");
        }
        return connection;
    }

    // Return a promise that waits until the vector exists
    async waitForVectors(ct: CancellationToken, devId: string, vectorIds: string[])
    {
        const connection = this.getValidConnection();
        const dev = connection.getDevice(devId);

        console.log('Sync with vectors:' + JSON.stringify(vectorIds));

        await Timeout(ct, async (ct: CancellationToken) => {
                await connection.wait(ct, ()=> {
                    let done = true;
                    for(const vectorId of vectorIds) {
                        const vecInstance = dev.getVector(vectorId);
                        if (!vecInstance.exists()) {
                            done = false;
                            break;
                        }
                    }
                    return done;
                })
            },
            5000,
            ()=>new Error("Missing vector (timeout) for " + devId + " : " + JSON.stringify(vectorIds))
        );
    }

    // Return a promise that will set the value of the
    // device and value can be function
    // valFn returns a map to set at the vector, may be a function receiving the current state
    async setParam(ct: CancellationToken,
                    devId: string,
                    vectorId: string,
                    valueProvider: {[id:string]:string|null|undefined} | ((vec:Vector)=>{[id:string]:string|null|undefined}),
                    force?: boolean,
                    nowait?:boolean,
                    cancelator?: (connection:IndiConnection, devId:string, vectorId:string)=>(void))
            :Promise<Array<{name:string, value:string}>>
    {
        const connection = this.getValidConnection();


        function getVec() {
            const dev = connection.getDevice(devId);

            if (dev === undefined || ((vectorId != 'CONNECTION') && dev.getVector('CONNECTION').getPropertyValueIfExists('CONNECT') !== 'On')) {
                throw new Error("Device is not connected : " + devId);
            }

            const vecInstance = dev.getVector(vectorId);
            if (vecInstance === null) throw new Error("Property vanished: " + vectorId);
            return vecInstance;
        }

        getVec();

        await this.waitForVectors(ct, devId, [vectorId]);
        if (!nowait) {
            await connection.wait(ct, () => (getVec().getState() != "Busy"));
        }

        const vec = getVec();
        if (vec.getState() === "Busy") {
            throw new Error("Device is busy");
        }
        
        const value = (typeof valueProvider === "function" ? valueProvider(vec) : valueProvider);
        var todo = [];
        for(const key of Object.keys(value).sort()) {
            var v = value[key];
            if (v === null || v === undefined) {
                continue;
            }
            console.log('Setting value: ' + v);
            if (force || (vec.getPropertyValueIfExists(key) !== v)) {
                todo.push({name: key, value: v});
            }
        }

        if (!todo.length) {
            console.log('Skipping value already set for ' + vectorId + " : " + JSON.stringify(value));
        } else {
            vec.setValues(todo);
            let cancelatorCancel = ()=>{};
            if (cancelator) {
                ct.throwIfCancelled();
                cancelatorCancel = ct.onCancelled(()=>{
                    cancelator(connection, devId, vectorId);
                });
            }
            try {
                await connection.wait(ct, () => (getVec().getState() !== "Busy"));
                if (cancelator) {
                    ct.throwIfCancelled();
                }
            } finally {
                cancelatorCancel();
            }
        }

        return todo;
    }

    // Set to on a property that keeps its vector busy.
    // FIXME: cannot really detect errors here (busy can be set due to lost request)
    async activate(ct: CancellationToken,
                    devId: string,
                    vectorId: string,
                    propId: string)
                :Promise<void>
    {
        const connection = this.getValidConnection();

        function getVec() {
            const dev = connection.getDevice(devId);

            if (dev === undefined || ((vectorId != 'CONNECTION') && dev.getVector('CONNECTION').getPropertyValueIfExists('CONNECT') !== 'On')) {
                throw new Error("Device is not connected : " + devId);
            }

            const vecInstance = dev.getVector(vectorId);
            return vecInstance;
        }

        getVec();

        await this.waitForVectors(ct, devId, [vectorId]);

        const vec = getVec();
        if (vec.getState() === "Busy") {
            if (vec.getPropertyValue(propId) === 'On') {
                return;
            }
            // Busy with the wrong value. Must still proceed
        }
        vec.setValues([{name: propId, value:'On'}]);
        // Wait for the busy status to disappear
        await connection.wait(ct, () => (getVec().getPropertyValue(propId) === "On"));
    }

    // Return a promise that activate a property (set to on) and wait while it is busy.
    // The promise never ends unless it gets cancelled
    async pulseParam(ct: CancellationToken,
                    devId: string,
                    vectorId: string,
                    propId: string)
                :Promise<void>
    {
        const connection = this.getValidConnection();

        function getVec() {
            const dev = connection.getDevice(devId);

            if (dev === undefined || ((vectorId != 'CONNECTION') && dev.getVector('CONNECTION').getPropertyValueIfExists('CONNECT') !== 'On')) {
                throw new Error("Device is not connected : " + devId);
            }

            const vecInstance = dev.getVector(vectorId);
            return vecInstance;
        }

        getVec();

        await this.waitForVectors(ct, devId, [vectorId]);
        await connection.wait(ct, () => (getVec().getState() != "Busy"));

        const vec = getVec();
        if (vec.getState() === "Busy") {
            throw new Error("Device is busy");
        }

        console.log('activating: ' + devId + "." + vectorId + "." + propId);
        let selfStopped: boolean = false;
        vec.setValues([{name: propId, value:'On'}]);
        try {
            // Wait for the busy status to disappear
            await connection.wait(ct, () => (getVec().getState() !== "Busy"));
            selfStopped = true;
            throw new Error("Property stopped " + devId + "." + vectorId + "." + propId);
        } finally {
            if (!selfStopped) {
                vec.setValues([{name: propId, value:'Off'}]);
                await connection.wait(CancellationToken.CONTINUE, () => (getVec().getState() !== "Busy"));
            }
        }
    }

    public checkDeviceConnected=(deviceId:string):Device=>{
        const device = this.getValidConnection().getDevice(deviceId);
        if (device.getVector('CONNECTION').getPropertyValueIfExists('CONNECT') !== 'On') {
            throw new Error("Device " + deviceId + " is not connected");
        }
        return device;
    }

    public connectDevice=async (ct:CancellationToken, payload: {device: string})=>
    {
        const device = payload.device;
        const vector = this.getValidConnection().getDevice(device).getVector('CONNECTION');
        if (!vector.isReadyForOrder()) {
            throw "Connection already pending";
        }
        if (vector.getPropertyValue('CONNECT') === 'On') {
            return;
        }

        await this.setParam(ct, device, 'CONNECTION', {CONNECT: "On"});
        await this.setParam(ct, device, 'CONFIG_PROCESS', {CONFIG_LOAD: "On"});
    }

    public disconnectDevice=async (ct:CancellationToken, payload: {device: string})=>
    {
        const device = payload.device;
        const vector = this.getValidConnection().getDevice(device).getVector('CONNECTION');
        if (!vector.isReadyForOrder()) {
            throw "Connection already pending";
        }
        if (vector.getPropertyValue('CONNECT') === 'Off') {
            return;
        }

        await this.setParam(ct, device, 'CONNECTION', {DISCONNECT: "On"});
    }

    public updateVector = async (ct: CancellationToken, message:BackOfficeAPI.UpdateIndiVectorRequest)=>
    {
        const dev = this.getValidConnection().getDevice(message.dev);
        dev.getVector(message.vec).setValues( message.children);
    }

    public restartDriver = async (ct: CancellationToken, message: {driver: string})=>
    {
        if (this.indiServerStarter === null) {
            throw new Error("no indiserver configured");
        }
        await this.indiServerStarter.restartDevice(ct, message.driver);
    }

    public doUpdateDriverParam = (message: BackOfficeAPI.UpdateIndiDriverParamRequest) => {
        if (!has(this.currentStatus.configuration.indiServer.devices, message.driver)) {
            throw new Error("Device not found");
        }
        const dev = this.currentStatus.configuration.indiServer.devices[message.driver];
        if (!dev.options) {
            dev.options = {};
        }
        (dev.options as any)[message.key] = message.value;
    }

    public updateDriverParam = async (ct: CancellationToken, message: BackOfficeAPI.UpdateIndiDriverParamRequest)=>
    {
        this.doUpdateDriverParam(message);
    }
}
