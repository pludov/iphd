import React from 'react';
import CancellationToken from 'cancellationtoken';
import '../../AstrometryView.css';
import * as BackendRequest from "../../BackendRequest";
import * as Store from "../../Store";
import * as Help from "../../Help";
import * as Utils from "../../Utils";
import Panel from "../../Panel";
import Int from '../../primitives/Int';
import Float from '../../primitives/Float';
import * as FilterWheelStore from "../../FilterWheelStore";
import DeviceConnectBton from '../../DeviceConnectBton';
import CameraSettingsView from '../../CameraSettingsView';
import IndiSelectorEditor from '../../IndiSelectorEditor';
import AstrometryBackendAccessor from "../../AstrometryBackendAccessor";
import * as BackendAccessor from "../../utils/BackendAccessor";
import { PolarAlignSettings } from '@bo/BackOfficeStatus';
import EditableImagingSetupSelector from '@src/EditableImagingSetupSelector';
import ImagingSetupSelector from '@src/ImagingSetupSelector';
import CameraViewDevicePanel from '@src/CameraViewDevicePanel';
import DeviceSettingsBton from '@src/DeviceSettingsBton';
import FilterSelector from '@src/FilterSelector';

type InputProps = {};
type MappedProps = {
    currentScope: string;
    cameraDevice: string|null;
    filterWheelDevice: string|null;
}
type Props = InputProps & MappedProps;

class InitialConfirm extends React.PureComponent<Props> {
    static sampleCountHelp = Help.key("Number of samples", "Enter the number of exposure to take. Exposure will be spaced evenly between min and max angles.");
    static angleHelp = Help.key("Max angle", "Maximum RA angle from meridian (°). The mount will move in the same side of pier from the meridian up to this angle (mount limit)");
    static minAltitudeHelp = Help.key("Minimum altitude", "Ensure exposure below are not taken at altitude below that angle (°).");
    static slewRateHelp = Help.key("Slew rate", "Choose slew rate for the mount moves. Refer to the INDI driver of the mount for actual meaning.");
    accessor: BackendAccessor.BackendAccessor<PolarAlignSettings>;
    
    constructor(props:Props) {
        super(props);
        this.accessor = new AstrometryBackendAccessor("$.astrometry.settings").child("polarAlign");
    }

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

    setSlewRate = async (s:string)=> {
        this.accessor.child("slewRate").send(s);
    }

    render() {
        return <>
            <div className="PolarAlignExplain">
            This wizard will move the scope in RA and measure misalignment of the polar axis.<br/>
            Please point the scope to the place of the sky where you’ll take image, then click next to proceed.
            </div>
            
            <Panel guid="astrom:polaralign:camera">
                <span>Camera settings</span>


                <div>
                    <EditableImagingSetupSelector setValue={ImagingSetupSelector.setCurrentImagingSetup} getValue={ImagingSetupSelector.getCurrentImagingSetupUid}/>

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
                        <FilterSelector
                                isBusy={FilterWheelStore.isFilterWheelBusy}
                                getFilter={FilterWheelStore.currentTargetFilterId}
                                setFilter={FilterWheelStore.changeFilter}
                                filterWheelDevice={this.props.filterWheelDevice}/>

                        <DeviceConnectBton deviceId={this.props.filterWheelDevice}/>
                        <DeviceSettingsBton deviceId={this.props.filterWheelDevice}/>
                    </CameraViewDevicePanel>
                    :
                    null
                }

            </Panel>

            <Panel guid="astrom:polaralign:movements">
                <span>Scope moves</span>
                <div>
                    Max angle from meridian (°):
                    <Float accessor={this.accessor.child('angle')} min={0} max={120} helpKey={InitialConfirm.angleHelp}/>
                </div>
                <div>
                    Min alt. above horizon (°):
                    <Float accessor={this.accessor.child('minAltitude')} min={0} max={90} helpKey={InitialConfirm.minAltitudeHelp}/>
                </div>
                <div>
                    Number of samples:
                    <Int accessor={this.accessor.child('sampleCount')} min={3} max={99} helpKey={InitialConfirm.sampleCountHelp}/>
                </div>
                <div>
                    Slew rate:
                    <IndiSelectorEditor
                        device={this.props.currentScope}
                        valuePath="$.backend.astrometry.settings.polarAlign.slewRate"
                        setValue={this.setSlewRate}
                        vecName="TELESCOPE_SLEW_RATE"
                        helpKey={InitialConfirm.slewRateHelp}
                        />
                </div>
            </Panel>
        </>
    }

    static mapStateToProps(store: Store.Content, props: InputProps):MappedProps {
        const imagingSetup = ImagingSetupSelector.getCurrentImagingSetup(store);

        const cameraDevice = imagingSetup !== null ? imagingSetup.cameraDevice : null;
        const filterWheelDevice = imagingSetup !== null ? imagingSetup.filterWheelDevice : null;

        return {
            currentScope: store.backend.astrometry?.selectedScope || "",
            cameraDevice,
            filterWheelDevice,
        }
    }
}

export default Store.Connect(InitialConfirm);