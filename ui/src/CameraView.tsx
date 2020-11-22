import * as React from 'react';
import { connect } from 'react-redux';

import * as BackendRequest from "./BackendRequest";
import * as Store from "./Store";
import CameraSettingsView from './CameraSettingsView';
import DeviceConnectBton from './DeviceConnectBton';
import FitsViewerWithAstrometry from './FitsViewerWithAstrometry';
import ShootButton from "./ShootButton";
import CancellationToken from 'cancellationtoken';
import { noErr } from './Utils';
import { ShootResult } from '@bo/BackOfficeAPI';
import CameraSelector from "./CameraSelector";
import DeviceSettingsBton from './DeviceSettingsBton';

import './CameraView.css'
import LiveFilterSelector from './LiveFilterSelector';
import { StreamSize } from '@bo/BackOfficeStatus';
import EditableImagingSetupSelector from './EditableImagingSetupSelector';
import ImagingSetupSelector from './ImagingSetupSelector';
import CameraViewDevicePanel from './CameraViewDevicePanel';

type InputProps = {
}

type MappedProps = {
    path: string|null;
    streamId: string|null;
    streamSerial: string|null;
    streamSize: StreamSize|null;
    cameraDevice: string|null;
    filterWheelDevice: string|null;
    focuserDevice: string|null;
}

type Props = InputProps & MappedProps;

class CameraView extends React.PureComponent<Props> {

    constructor(props: Props) {
        super(props);
    }

    startAstrometry = async () => {
        if (this.props.path === null) {
            throw new Error("Astrometry require a fits file");
        }
        console.log('Start astrometry ?' + this.props.path);
        await BackendRequest.RootInvoker("astrometry")("compute")(
            CancellationToken.CONTINUE,
            {
                image: this.props.path,
            }
        );
        console.log('done astrometry ?');
    };

    setCamera = async(id: string)=>{
        await BackendRequest.RootInvoker("camera")("setCamera")(CancellationToken.CONTINUE, {device: id});
    }

    settingSetter = (propName:string):((v:any)=>Promise<void>)=>{
        return async (v:any)=> {
            await BackendRequest.RootInvoker("camera")("setShootParam")(
                CancellationToken.CONTINUE,
                {
                    key: propName as any,
                    value: v
                }
            );
        }
    }

    render() {
        return(<div className="CameraView">
            <div className="CameraViewSettings">
                <div>
                    <EditableImagingSetupSelector setValue={ImagingSetupSelector.setCurrentImagingSetup} getValue={ImagingSetupSelector.getCurrentImagingSetupUid}/>
                    {this.props.cameraDevice !== null
                        ? <DeviceConnectBton.forImagingSetup deviceType="cameraDevice"/>
                        : null
                    }
                </div>
                {this.props.cameraDevice !== null ?
                    <CameraViewDevicePanel title="Camera" deviceId={this.props.cameraDevice}>
                        <CameraSettingsView
                            current={this.props.cameraDevice}
                            activePath={"unused - remove me"}
                            settingsPath={"$.backend.camera.configuration.deviceSettings"}
                            setValue={this.settingSetter}
                        />

                        <DeviceConnectBton deviceId={this.props.cameraDevice}/>
                        <DeviceSettingsBton deviceId={this.props.cameraDevice}/>
                    </CameraViewDevicePanel>
                    :
                    null
                }
                {this.props.filterWheelDevice !== null ?
                    <CameraViewDevicePanel title="Filter Wheel" deviceId={this.props.filterWheelDevice}>
                        <LiveFilterSelector.forActivePath activePath="$.backend.camera.selectedDevice"/>

                        <DeviceConnectBton deviceId={this.props.filterWheelDevice}/>
                        <DeviceSettingsBton deviceId={this.props.filterWheelDevice}/>
                    </CameraViewDevicePanel>
                    :
                    null
                }
            </div>
            <div className="CameraViewDisplay">
                <FitsViewerWithAstrometry
                    contextKey="default"
                    path={this.props.path}
                    streamId={this.props.streamId}
                    streamSerial={this.props.streamSerial}
                    streamSize={this.props.streamSize}
                    subframe={null}/>
            </div>
            <ShootButton
                    activePath="$.backend.camera.selectedDevice"
                    onSuccess={this.setPhoto}
                    />
        </div>);
    }

    setPhoto = (rslt:ShootResult)=>{
    }

    static mapStateToProps(store:Store.Content, ownProps: InputProps):MappedProps {
        const imagingSetup = ImagingSetupSelector.getCurrentImagingSetup(store);

        const cameraDevice = imagingSetup !== null ? imagingSetup.cameraDevice : null;
        const filterWheelDevice = imagingSetup !== null ? imagingSetup.filterWheelDevice : null;
        const focuserDevice = imagingSetup !== null ? imagingSetup.focuserDevice : null;

        if (cameraDevice !== null && Object.prototype.hasOwnProperty.call(store.backend.camera!.currentStreams, cameraDevice)) {
            const stream= store.backend.camera!.currentStreams[cameraDevice];
            if (stream.streamId) {
                return {
                    path: null,
                    streamId: stream.streamId,
                    streamSerial: stream.serial === null ? null : "" + stream.serial,
                    streamSize: stream.streamSize,
                    cameraDevice,
                    filterWheelDevice,
                    focuserDevice,
                };
            }
        }

        if (cameraDevice !== null && Object.prototype.hasOwnProperty.call(store.backend.camera!.lastByDevices, cameraDevice)) {
            return {
                path: store.backend.camera!.lastByDevices[cameraDevice],
                streamId: null,
                streamSerial: null,
                streamSize: null,
                cameraDevice,
                filterWheelDevice,
                focuserDevice,
            };
        }
        return {
            path: null,
            streamId: null,
            streamSerial: null,
            streamSize: null,
            cameraDevice,
            filterWheelDevice,
            focuserDevice,
        };
    }
}

export default Store.Connect(CameraView);
