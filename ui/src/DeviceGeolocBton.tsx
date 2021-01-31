import * as React from 'react';
import * as Store from "./Store";
import * as Help from "./Help";
import * as BackendRequest from "./BackendRequest";
import { atPath } from './shared/JsonPath';
import CancellationToken from 'cancellationtoken';
import * as GeolocStore from "./GeolocStore";
import * as Utils from './Utils';
import BackendAccessor from './utils/BackendAccessor';


type InputProps = {
    // name of the device (indi id)
    activePath: string;
}

type MappedProps = {
    currentDevice: null|string;
    state: "NotFound"|"Busy"|"Available";

    // coords in INDI
    LAT?: number;
    LONG?: number;
    ELEV?: number;

} & GeolocStore.GeolocStoreContent

type State = {
    runningPromise: number;
}

type Props = InputProps & MappedProps;

function goodDelta(gpsVal:number|null, indiVal: number|undefined, tol: number, cycle: number = 0):boolean
{
    if (gpsVal === null) return true;
    if (indiVal === undefined) return true;
    if (Math.abs(gpsVal - indiVal) < tol) return true;
    if (Math.abs(Math.abs(gpsVal - indiVal) - cycle) < tol) return true;
    return false
}

// Display a connect/disconnect button for a device
class UnmappedDeviceConnectBton extends React.PureComponent<Props, State> {
    static readonly help = Help.key("GPS sync", "Use GPS from the mobile phone to update location of the INDI device. The button appears green if current value is accurate (under 1km, and below 10 meters for elevation)");
    constructor(props:Props) {
        super(props);
        this.state = {runningPromise: 0};
    }

    render() {
        var title, enabled = false;
        if (this.props.state === "NotFound") {
            return null;
        }
        let good: boolean = false;
        switch(this.props.state) {
            case 'Busy':
                title='Switching...';
                enabled = false;
            default:
                title = 'Connect';
                good = this.props.acquired
                            && (this.props.latitude || this.props.longitude || this.props.altitude) !== null
                            && goodDelta(this.props.latitude, this.props.LAT, 0.01)         // ~1 km
                            && goodDelta(this.props.longitude, this.props.LONG, 0.01, 360)  // ~1 km at equator
                            && goodDelta(this.props.altitude, this.props.ELEV, 10)          // 10 meters
                enabled = false;
        }
        title = "\u{1F4CD}"
        return <input type="button"
                        style={good ? {backgroundColor: "green"} : {}}
                        onClick={(e)=>Utils.promiseToState(this.startGeoloc, this)}
                        disabled={this.state.runningPromise !== 0 || this.props.state === "Busy"}
                        {...UnmappedDeviceConnectBton.help.dom()}
                        value={title}/>
    }

    private readonly startGeoloc = async ()=>{
        const device = this.props.currentDevice;
        if (!device) {
            return;
        }
        let position;
        
        try {
            position = await GeolocStore.getGeoloc();
        } catch(e) {
            console.warn("Failed to get position", e);
            return;
        }
        
        console.log('got position ', position);
        // Push value to scope
        await BackendRequest.RootInvoker("indi")("updateVector")(CancellationToken.CONTINUE, {
            dev: device,
            vec: 'GEOGRAPHIC_COORD',
            children: [
                {
                    name: 'LAT',
                    value: '' + position.coords.latitude,
                },
                {
                    name: 'LONG',
                    value: '' + position.coords.longitude,
                },
                {
                    name: 'ELEV',
                    value: '' + (position.coords.altitude || '0')
                }
            ]
        });
    }


    static mapStateToProps(store: Store.Content, ownProps: InputProps):MappedProps {
        const geoloc = GeolocStore.currentGeoloc(store);
        var currentDevice = atPath(store, ownProps.activePath);
        if (currentDevice === null || currentDevice === undefined) {
            return {
                ...geoloc,
                currentDevice: null,
                state: "NotFound"
            }
        }


        var prop;
        try {
            const vec = store.backend.indiManager!.deviceTree[currentDevice].GEOGRAPHIC_COORD;
            if (vec === undefined) {
                return {
                    ...geoloc,
                    currentDevice: null,
                    state: "NotFound"
                }
            }
            if (vec.$state == "Busy") {
                return {
                    ...geoloc,
                    currentDevice,
                    state: "Busy"
                }
            }

            let pos : {LAT?:number, LONG?:number, ELEV?:number };
            try {
                pos = {
                    LAT: parseFloat(vec.childs.LAT.$_),
                    LONG: parseFloat(vec.childs.LONG.$_),
                    ELEV: parseFloat(vec.childs.ELEV.$_),
                };
                if (isNaN(pos.LAT!) || isNaN(pos.LONG!) || isNaN(pos.ELEV!)) {
                    throw new Error("invalid coords");
                }
            } catch(e) {
                pos = {};
            }
            return {
                ...geoloc,
                currentDevice,
                state : "Available",
                ...pos
            }
        } catch(e) {
            return {
                ...geoloc,
                currentDevice,
                state: "NotFound",
            }
        }
    }
}

export default Store.Connect(UnmappedDeviceConnectBton);
