'use strict';

import SAX from 'sax';
import xmlbuilder from 'xmlbuilder';
import net from 'net';

import * as Promises from './Promises';
import {xml2JsonParser as Xml2JSONParser, Schema} from './Xml2JSONParser';
import { StringDecoder } from 'string_decoder';
import { Buffer } from 'buffer';
import { IndiMessage } from "./shared/IndiTypes";

export type IndiListener = ()=>(void);
export type IndiMessageListener = (m:IndiMessage)=>(void);

export type IndiPredicate<INPUT, OUTPUT>=(e:INPUT)=>OUTPUT;


const socketEncoding = "utf-8";

const schema: Schema = {
      
      
      defTextVector: {
          $notext: true,
          defText: {
            $isArray: true
          }  
      },
      
      defNumberVector: {
          $notext: true,
          defNumber: {
            $isArray: true
          }
      },
      
      defSwitchVector: {
          $notext: true,
          defSwitch: {
            $isArray: true
          }
      },
      
      defLightVector: {
          $notext: true,
          defLight: {
            $isArray: true
          }
      },
      
      setTextVector: {
          $notext: true,
          oneText: {
            $isArray: true
          }
      },
      
      setNumberVector: {
          $notext: true,
          oneNumber: {
            $isArray: true
          }
      },
      
      setSwitchVector: {
          $notext: true,
          oneSwitch: {
            $isArray: true
          }
      },
      
      setLightVector: {
          $notext: true,
          oneLight: {
            $isArray: true
          }
      },
      
      delProperty: {
          $notext: true
      },
      
      message: {
      }
} as any;


// Each change/notification will increment this by one
var globalRevisionId = 0;

function has(obj:any, key:string) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

export class Vector {
    public readonly connection: IndiConnection;
    public readonly device: string;
    public readonly vectorId: string;

    constructor(connection:IndiConnection, device:string, vectorId:string) {
        this.connection = connection;
        this.device = device;
        this.vectorId = vectorId;
    }

    getVectorInTree()
    {
        if (!has(this.connection.deviceTree, this.device))
        {
            return null;
        }
        var dev = this.connection.deviceTree[this.device];
        if (!has(dev, this.vectorId)) {
            return null;
        }
        return dev[this.vectorId];
    }

    getExistingVectorInTree()
    {
        var rslt = this.getVectorInTree();
        if (rslt === null) throw new Error("Property not found: " + this.device + "/" + this.vectorId);
        return rslt;
    }

    exists() {
        return this.getVectorInTree() !== null;
    }

    // Throw device disconnected
    getState() {
        return this.getExistingVectorInTree().$state;
    }

    // Id that change for each new message concerning this vector
    getRev() {
        return this.getExistingVectorInTree().$rev;
    }

    isReadyForOrder()
    {
        var state = this.getState();
        return (state != "Busy");
    }

    // affectation is an array of {name:key, value:value}
    // Vector is switched to busy immediately
    setValues(affectations:{name:string, value:string}[]) {
        console.log('Received affectations: ' + JSON.stringify(affectations));
        var vecDef = this.getExistingVectorInTree();
        var msg = {
            $$: 'new' + vecDef.$type + 'Vector',
            $device: this.device,
            $name: this.vectorId,
            ['one' + vecDef.$type]: affectations.map(item => {
                return {
                    $name: item.name,
                    $_: item.value
                }
            })
        };
        vecDef.$state = "Busy";

        var xml = IndiConnection.toXml(msg)
        this.connection.queueMessage(xml);
    }

    // Return the value of a property.
    // throw if the vector or the property does not exists
    getPropertyValue(name:string):string {
        var vecDef = this.getExistingVectorInTree();
        if (!has(vecDef.childs, name)) {
            throw new Error("Property not found: " + this.device + "/" + this.vectorId + "/" + name);
        }
        var prop = vecDef.childs[name];
        return prop.$_;
    }

    getPropertyValueIfExists(name:string):string|null {
        var vecDef = this.getVectorInTree();
        if (vecDef === null) return null;
        if (!has(vecDef.childs, name)) {
            return null;
        }
        var prop = vecDef.childs[name];
        return prop.$_;
    }
    
    getPropertyLabelIfExists(name:string):string|null {
        var vecDef = this.getVectorInTree();
        if (vecDef === null) return null;
        if (!has(vecDef.childs, name)) {
            return null;
        }
        var prop = vecDef.childs[name];
        return prop.$label;
    }
}


export class Device {
    readonly connection:IndiConnection;
    readonly device: string;

    constructor(connection:IndiConnection, device:string) {
        this.connection = connection;
        this.device = device;
    }

    getDeviceInTree()
    {
        if (!has(this.connection.deviceTree, this.device))
        {
            throw "Device not found: " + this.device;
        }

        return this.connection.deviceTree[this.device];
    }

    getVector(vectorId:string)
    {
        return new Vector(this.connection, this.device, vectorId);
    }
}

export class IndiConnection {
    deviceTree: any;
    connected: boolean;
    private waiterId = 0;
    private dead: boolean;
    private socket?: net.Socket;
    private readonly listeners:IndiListener[];
    private readonly messageListeners:IndiMessageListener[];
    private checkingListeners?:IndiListener[];
    private parser?: SAX.SAXParser;
    private queue: string[];

    constructor() {
        this.parser = undefined;
        this.socket = undefined;
        this.connected = false;
        this.queue = [];
        this.deviceTree = {};
        this.listeners = [];
        this.messageListeners = [];
        this.dead = false;
    }

    connect(host:string, port?:number) {
        var self = this;
        
        if (port === undefined) {
            port = 7624;
        }
        console.log('Opening indi connection to ' + host + ':' + port);
        var socket = new net.Socket();
        var parser = this.newParser((msg:any)=>self.onMessage(msg));
        const decoder = new StringDecoder(socketEncoding);
        this.socket = socket;
        this.parser = parser;
        
        socket.on('connect', function() {
            console.log('socket connected');
            self.connected = true;
            socket.write('<getProperties version="1.7"/>');
            self.flushQueue();
            ++globalRevisionId;
        });
        socket.on('data', function(data) {
            const decoded = decoder.write(data);
            if (decoded.length) {
                parser.write(decoded);
                parser.flush();
            }
        });
        socket.on('error', function(err) {
            console.log('socket error: ' + err);
        });
        socket.on('close', function() {
            ++globalRevisionId;
            console.log('socket closed');
            try {
                self.socket!.destroy();
            } catch(e) {
                console.log('closing error', e);
            }
            self.connected = false;
            self.queue = [];
            self.socket = undefined;
            self.parser = undefined;
            self.dead = true;
            self.checkListeners();
        })
        this.connected = false;
        socket.connect(port, host);
    }

    public isDead():boolean {
        return this.dead;
    }

    flushQueue() {
        if (!this.connected) return;
        
        while(this.queue.length > 0) {
            var toSend = this.queue[0];
            this.queue.splice(0, 1);
            console.log('Sending: ' + toSend);
            this.socket!.write(Buffer.from(toSend, socketEncoding));
        }
    }

    // Ensure that all current listeners get called once, except if it gets removed in between
    checkListeners() {
        var self = this;

        self.checkingListeners = self.listeners.slice();

        if (self.listeners.length == 0) return;

        process.nextTick(function() {
            while((self.checkingListeners != undefined) && (self.checkingListeners.length))
            {
                var todo = self.checkingListeners[self.checkingListeners.length - 1];
                self.checkingListeners.splice(self.checkingListeners.length - 1, 1);
                todo();
            }
        });
    }

    // Return a Promises.Cancelable that wait until the predicate is true
    // will be checked after every indi event
    // allowDisconnectionState: if true, predicate will be checked event after disconnection
    // The predicate will receive the promise input.
    wait<INPUT, OUTPUT>(predicate:IndiPredicate<INPUT, OUTPUT>, allowDisconnectionState?:boolean):Promises.Cancelable<INPUT, OUTPUT> {
        const self = this;
        const waiterId = this.waiterId++;
        return new Promises.Cancelable<INPUT, OUTPUT>(
            function(next, input) {
                var listener:IndiListener|undefined = undefined;

                function dettach()
                {
                    if (listener != undefined) {
                        self.removeListener(listener);
                        listener = undefined;
                    }
                }

                next.setCancelFunc(() => {
                    dettach();
                    next.cancel();
                });

                if (self.dead && !allowDisconnectionState) {
                    next.error('Indi server disconnected');
                    return;
                }
                var result = predicate(input);
                if (!result) {
                    console.log('predicate false');
                    listener = function() {
                        if (!next.isActive()) return;
                        var result;
                        try {
                            result = predicate(input);
                            if (!result) {
                                console.log('predicate ' + waiterId + ' still false');
                                return;
                            }
                        } catch(e) {
                            dettach();
                            next.error(e);
                            return;
                        }
                        dettach();
                        next.done(result);
                    };
                    // Add a listener...
                    self.addListener(listener);
                } else {
                    console.log('predicate ' + waiterId + ' true');
                    next.done(result);
                }
            }
        );
    }

    dispatchMessage(m: IndiMessage)
    {
        for(var i = 0; i < this.messageListeners.length; ++i)
        {
            try {
                this.messageListeners[i](m);
            } catch(e) {
                console.error("Messagelistener", e);
            }
        }
    }

    addMessageListener(m:IndiMessageListener)
    {
        this.messageListeners.push(m);
    }

    removeMessageListener(m:IndiMessageListener)
    {
        for(var i = 0; i < this.messageListeners.length; ++i)
        {
            if (this.messageListeners[i] === m) {
                this.messageListeners.splice(i, 1);
                break;
            }
        }
    }

    addListener(f:IndiListener)
    {
        this.listeners.push(f);
    }
    
    removeListener(f:IndiListener)
    {
        for(var i = 0; i < this.listeners.length; ++i)
        {
            if (this.listeners[i] === f) {
                this.listeners.splice(i, 1);
                break;
            }
        }
        if (this.checkingListeners != undefined) {
            for(var i = 0; i < this.checkingListeners.length; ++i)
            if (this.checkingListeners[i] === f) {
                this.checkingListeners.splice(i, 1);
                break;
            }
        }
    }
    
    onProtocolError(pe:Error) {
            
    }

    //msg: string
    queueMessage(msg:string) {
        this.queue.push(msg);
        this.flushQueue();
    }

    public static toXml(obj:any) {

        var xml = xmlbuilder.create(obj.$$, undefined, undefined, {headless: true});

        function render(obj:any, node:any) {
            if (typeof obj == "string" || typeof obj == "number") {
                node.txt("" + obj);
                return;
            }
            if (obj == null) {
                return;
            }

            for(var key in obj) {
                if (!Object.prototype.hasOwnProperty.call(obj, key)) {
                    continue;
                }
                if (key == '$$') {
                    continue;
                } else if (key == "$_") {
                    node.txt(obj[key]);
                } else if (key.substr(0,1) == '$') {
                    node.att(key.substr(1), obj[key]);
                } else {
                    var childObj =  obj[key];

                    if (!Array.isArray(childObj)) {
                        childObj = [childObj];
                    }
                    for (var child of childObj) {
                        var childNode = node.e(key);
                        render(child, childNode);
                    }
                }
            }
        }
        render(obj, xml);

        return xml.end({pretty: true});
    }

    newParser(onMessage:any) {
        var parser = Xml2JSONParser(schema, 2, onMessage);

        var self = this;

        parser.onerror = function(e) {
            console.log('xml error: ' + e);
            self.onProtocolError(e);
        };
        
        parser.write('<dummystartup>');

        return parser;
    }

    getDeviceInTree(dev:string) {
        if (!has(this.deviceTree, dev)) {
            this.deviceTree[dev] = {};
        }

        return this.deviceTree[dev];
    }

    getDevice(dev:string) {
        return new Device(this, dev);
    }

    getAvailableDeviceIds():string[] {
        return Object.keys(this.deviceTree);
    }

    getAvailableDeviceIdsWith(requiredProps:string[]):string[]
    {
        const rslt = [];
        ext: for(let devId of Object.keys(this.deviceTree))
        {
            const dev = this.getDevice(devId);
            for(let prop of requiredProps) {
                if (!dev.getVector(prop).exists()) {
                    continue ext;
                }
            }
            rslt.push(devId);
        }
        return rslt;
    }

    onMessage(message:any) {
        globalRevisionId++;
        if (message.$$.match(/^message$/)) {
            this.dispatchMessage(message);
            return;
        }
        if (message.$$.match(/^def.*Vector$/)) {
            var childsProps = message.$$.replace(/Vector$/, '');

            message.$type = childsProps.replace(/^def/, '');

            message.childs = {};
            message.childNames = [];
            var childs = message[childsProps];
            
            for(var i = 0; i < childs.length; ++i)
            {
                var child = childs[i];
                message.childs[child.$name] = child;
                message.childNames[i] = child.$name;
            }
            delete message[childsProps];
            message.$rev = globalRevisionId;
            this.getDeviceInTree(message.$device)[message.$name] = message;
        }

        if (message.$$=="delProperty") {
            if (!has(this.deviceTree, message.$device)) {
                console.log('Message about unknown device: ' + JSON.stringify(message));
                return;
            }
            var dev = this.deviceTree[message.$device];
            if (has(message, '$name')) {
                if (!has(dev, message.$name)) {
                    console.log('Message about unknown vector: ' + JSON.stringify(message));
                    return;
                }
                delete dev[message.$name];
            } else {
                // Device delete
                delete this.deviceTree[message.$device];
            }
        }
        
        if (message.$$.match(/^set.*Vector$/)) {
            var kind = message.$$.replace(/Vector$/, '').replace(/^set/, '');
            var childsProp = 'def' + kind;

            if (!has(this.deviceTree, message.$device)) {
                console.warn('Received set for unknown device: ' + JSON.stringify(message, null, 2));
                return;
            }
            var dev = this.deviceTree[message.$device];
            if (!has(dev, message.$name)) {
                console.warn('Received set for unknown property: ' + JSON.stringify(message, null, 2));
                return;
            }

            var prop = dev[message.$name];
            prop.$state = message.$state;
            prop.$timeout = has(message, '$timeout') ? message.$timeout : 0;
            prop.$timestamp = message.$timestamp;
            prop.$rev = globalRevisionId;
            if (message.$message != undefined) {
                prop.$message = message.$message;
            }

            var updates = message['one' + kind];
            if (updates == undefined) {
                console.warn('Wrong one' + kind + ' in: ' + JSON.stringify(message, null, 2));
                return;
            }
            
            for(var i = 0; i < updates.length; ++i) {
                var update = updates[i];
                if (!has(prop.childs, update.$name)) {
                    console.warn('Unknown one' + kind + ' in: ' + JSON.stringify(message, null, 2));
                    continue;
                }
                var current = prop.childs[update.$name];
                var value = update.$_;
                if (value == undefined) value = "";
                current.$_ = value;
            }
        }
        this.checkListeners();
    }

}


function demo() {

    var connection = new IndiConnection();
    connection.connect('127.0.0.1');

    var indiDevice = connection.getDevice("CCD Simulator");

    console.log('Waiting connection');
    // connection.queueMessage('<newSwitchVector device="CCD Simulator" name="CONNECTION"><oneSwitch name="CONNECT" >On</oneSwitch></newSwitchVector>');

    var shoot = new Promises.Chain(
        connection.wait(function() {
            var status = connection.getDevice("CCD Simulator").getVector('CONNECTION').getPropertyValueIfExists('CONNECT');
            console.log('Status is : ' + status);
            if (status != 'On') return false;

            return connection.getDevice("CCD Simulator").getVector("CCD_EXPOSURE").getPropertyValueIfExists("CCD_EXPOSURE_VALUE") !== null;
        }),

        new Promises.Immediate(() => {
            console.log('Connection established');
            connection.getDevice("CCD Simulator").getVector("CCD_EXPOSURE").setValues([{name: "CCD_EXPOSURE_VALUE", value: "10"}]);
        }),

        connection.wait(function() {
            console.log('Waiting for exposure end');
            var vector = connection.getDevice("CCD Simulator").getVector("CCD_EXPOSURE");
            if (vector.getState() == "Busy") {
                return false;
            }

            var value = vector.getPropertyValue("CCD_EXPOSURE_VALUE");

            return (parseFloat(value) === 0);
        })
    );

    shoot.then(function() { console.log('SHOOT: done'); });
    shoot.onError(function(e) { console.log('SHOOT: error ' + e)});
    shoot.onCancel(function() { console.log('SHOOT: canceled')});
    shoot.start({});

    /*    var status = getConnectionValue("CCD Simulator", 'CONNECTION');

        if (status == 'Off') {
        }

        connection.wait(function() {
            return connection.properties['CONNECTION'].$$ == 'On';
        }).then(function() {
            console.log('connected !\n');
        });*/


    var infinite = connection.wait(function() {console.log('checking dummy cond'); return false});
    infinite.onCancel(function() { console.log('canceled !') });

    infinite = new Promises.Timeout(5000.0, infinite);
    infinite.onError(console.warn);
    infinite.start({});





    /*  console.log('testing');
      parser.write('<dummystartup>');

      console.log('test ok');

      var xml = "<start><a>plop</a><b>glop</b>\n";


      parser.write(xml);
      parser.write("<c>\n");
      parser.write("coucou</c>");
    */
}

export function timestampToEpoch(v:string):number
{
    var values = v.match(/^([0-9]+)-([0-9]+)-([0-9]+)T([0-9]+):([0-9]+):([0-9]+)$/);
    if (!values) {
        throw new Error("Invalid timestamp: " + v);
    }

    var d = Date.UTC(parseInt(values[1]),
                parseInt(values[2]) - 1,
                parseInt(values[3]),
                parseInt(values[4]),
                parseInt(values[5]),
                parseInt(values[6]));
    return d / 1000.0;
}

export const DriverInterface = {
    TELESCOPE: (1 << 0),  /**< Telescope interface, must subclass INDI::Telescope */
    CCD:       (1 << 1),  /**< CCD interface, must subclass INDI::CCD */
    GUIDER:    (1 << 2),  /**< Guider interface, must subclass INDI::GuiderInterface */
    FOCUSER:   (1 << 3),  /**< Focuser interface, must subclass INDI::FocuserInterface */
    FILTER:    (1 << 4),  /**< Filter interface, must subclass INDI::FilterInterface */
    DOME:      (1 << 5),  /**< Dome interface, must subclass INDI::Dome */
    GPS:       (1 << 6),  /**< GPS interface, must subclass INDI::GPS */
    WEATHER:   (1 << 7),  /**< Weather interface, must subclass INDI::Weather */
    AO:        (1 << 8),  /**< Adaptive Optics Interface */
    DUSTCAP:   (1 << 9),  /**< Dust Cap Interface */
    LIGHTBOX:  (1 << 10), /**< Light Box Interface */
    DETECTOR:  (1 << 11), /**< Detector interface, must subclass INDI::Detector */
    AUX:       (1 << 15), /**< Auxiliary interface */
}

function timestampDiff(a:string, b:string):number
{
    return timestampToEpoch(a) - timestampToEpoch(b);
}