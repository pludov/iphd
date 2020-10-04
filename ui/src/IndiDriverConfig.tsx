import * as React from 'react';
import * as Store from './Store';
import * as Utils from './Utils';

import * as BackendRequest from "./BackendRequest";
import PromiseSelector from './PromiseSelector';
import DeviceConnectBton from './DeviceConnectBton';
import CancellationToken from 'cancellationtoken';
import { noErr } from './Utils';
import { ShootResult } from '@bo/BackOfficeAPI';
import * as BackofficeStatus from '@bo/BackOfficeStatus';
import IndiFilterWheelFocusAdjusterConfig from './IndiFilterWheelFocusAdjusterConfig';


type InputProps = {
    driverId: string;
}

type MappedProps = {
    driver: BackofficeStatus.IndiDeviceConfiguration["driver"];
    details?: BackofficeStatus.IndiDeviceConfiguration["options"];
    cameraList: string[] | undefined;
    filterWheelList: string[] | undefined;
    connectableFocuserList: string[];
}

type Props = InputProps & MappedProps;

type State = {
    runningPromise: number;
}

class IndiDriverConfig extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {runningPromise: 0};

        this.autoConnect = this.switchBoolean('autoConnect');
        this.autoGphotoSensorSize = this.switchBoolean('autoGphotoSensorSize');
        this.askCoverScope = this.switchBoolean('disableAskCoverScope', true);
        this.confirmFilterChange = this.switchBoolean('confirmFilterChange');
    }

    static supportAutoGphotoSensorSize(driver: string) {
        return driver === 'indi_gphoto_ccd' || driver === 'indi_canon_ccd' || driver === 'indi_nikon_ccd';
    }

    private switchBoolean(key:string, invert?: boolean):(e:React.ChangeEvent<HTMLInputElement>)=>(void) {
        return (e)=>{
            const targetValue = (!!e.target.checked) !== (!!invert);

            Utils.promiseToState(
                (async ()=> {
                    await BackendRequest.RootInvoker("indi")("updateDriverParam")(
                        CancellationToken.CONTINUE,
                        {
                            driver: this.props.driverId,
                            key: key,
                            value: targetValue
                        });
                }),
                this
            );
        }
    }

    private readonly autoConnect:(e:React.ChangeEvent<HTMLInputElement>)=>(void);
    private readonly autoGphotoSensorSize:(e:React.ChangeEvent<HTMLInputElement>)=>(void);
    private readonly askCoverScope:(e:React.ChangeEvent<HTMLInputElement>)=>(void);
    private readonly confirmFilterChange:(e:React.ChangeEvent<HTMLInputElement>)=>(void);

    renderFilterWheel() {
        return <>
            <div>
                Confirm filter changes:
                    <input
                            type="checkbox"
                            checked={!!this.props.details?.confirmFilterChange}
                            onChange={this.confirmFilterChange}
                    />
            </div>
            {this.props.connectableFocuserList.map(
                (focuserId)=>
                    <div key={focuserId}>
                        <div>Focus adjust for focuser <i>{focuserId}</i></div>
                        <IndiFilterWheelFocusAdjusterConfig filterWheelId={this.props.driverId} focuserId={focuserId}/>
                    </div>
            )}
        </>
    }

    renderCamera() {
        return <>
            <div>
                Ask to cover scope:
                    <input
                            type="checkbox"
                            checked={this.props.details?.disableAskCoverScope ? false : true}
                            onChange={this.askCoverScope}
                    />
            </div>
            {IndiDriverConfig.supportAutoGphotoSensorSize(this.props.driver) ?
                <div>
                    Auto sensor size (gphoto):
                    <input
                            type="checkbox"
                            checked={this.props.details?.autoGphotoSensorSize ? true : false}
                            onChange={this.autoGphotoSensorSize}
                    />
                </div>
            : null }
        </>;
    }

    render() {
        const isCamera = this.props.cameraList && this.props.cameraList.indexOf(this.props.driverId) !== -1;
        const isFilterWheel = this.props.filterWheelList && this.props.filterWheelList.indexOf(this.props.driverId) !== -1;
        return <div>
            <div>{this.props.driverId}</div>

            <div className="IndiProperty">
                Auto connect:
                <input
                        type="checkbox"
                        checked={!!(this.props.details?.autoConnect)}
                        onChange={this.autoConnect}
                />
            </div>
            {isCamera ? this.renderCamera() : null}
            {isFilterWheel ? this.renderFilterWheel() : null}
        </div>
    }
    static mapStateToProps (store:Store.Content, ownProps: InputProps):MappedProps {

        // FIXME: extends connectableFocuserList with already set configuration
        const result = {
            driver: Utils.getOwnProp(store.backend.indiManager?.configuration.indiServer.devices, ownProps.driverId)?.driver || "",
            cameraList: store.backend.camera?.availableDevices,
            filterWheelList: store.backend.filterWheel?.availableDevices,
            connectableFocuserList: [...(store.backend?.focuser?.availableFocusers || [])],
            details: Utils.getOwnProp(store.backend.indiManager?.configuration.indiServer.devices, ownProps.driverId)?.options,
        };
        return result;
    }
}


export default Store.Connect(IndiDriverConfig);
