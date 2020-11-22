import React from 'react';
import CancellationToken from 'cancellationtoken';
import '../../AstrometryView.css';
import * as BackendRequest from "../../BackendRequest";
import * as Store from "../../Store";
import * as Utils from "../../Utils";
import Panel from "../../Panel";
import Int from '../../primitives/Int';
import Float from '../../primitives/Float';

import DeviceConnectBton from '../../DeviceConnectBton';
import CameraSelector from "../../CameraSelector";
import CameraSettingsView from '../../CameraSettingsView';
import IndiSelectorEditor from '../../IndiSelectorEditor';
import AstrometryBackendAccessor from "../../AstrometryBackendAccessor";
import * as BackendAccessor from "../../utils/BackendAccessor";
import { PolarAlignSettings, PolarAlignStatus, PolarAlignPositionWarning } from '@bo/BackOfficeStatus';
import StatusLabel from '../../Sequence/StatusLabel';

type InputProps = {};
type MappedProps = {
    canTakeMoveFrame: boolean;
    canChangeFrameType: boolean;
    tooEast: number|null;
    tooHigh: number|null;
    distance: number|null;
    adjusting: PolarAlignStatus["adjusting"];
    adjustError: PolarAlignStatus["adjustError"];
    nextFrame: PolarAlignStatus["adjusting"];

    adjustPositionWarningId: null|PolarAlignPositionWarning["id"];
    adjustPositionWarningDst: null|PolarAlignPositionWarning["dst"];
    adjustPositionError: PolarAlignStatus["adjustPositionError"];
}

type Props = InputProps & MappedProps;

function deltaTitle(dlt:number) {
    if (dlt === 0) {
        return '0"';
    }

    let rslt;
    if (dlt < 0) {
        rslt = '-';
        dlt = -dlt;
    } else {
        rslt = '+';
    }

    if (dlt >= 3600) {
        rslt += Math.floor(dlt / 3600) + '°';
    }

    if (dlt >= 60 && dlt < 2*3600) {
        rslt += (Math.floor(dlt / 60) % 60) + "'";
    }

    if (dlt < 120) {
        rslt += (dlt % 60) + '"';
    }
    return rslt;
}


class Adjust extends React.PureComponent<Props> {
    accessor: BackendAccessor.BackendAccessor<PolarAlignSettings>;
    
    constructor(props:Props) {
        super(props);
        this.accessor = new AstrometryBackendAccessor("$.astrometry.settings").child("polarAlign");
    }

    setNextFrame = (e:React.ChangeEvent<HTMLSelectElement>)=> {
        this.accessor.child("dyn_nextFrameIsReferenceFrame").send(e.target.value === "refframe");
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

    render() {
        
        return <>
            <div className="Wizard_subtitle">
                Adjusting the mount axe
            </div>
            <div className="PolarAlignDeltaDisplay">
                <div>
                    Δ toward east: {this.props.tooEast === null ? "N/A" : deltaTitle(Math.round(this.props.tooEast * 3600))}
                </div>
                <div>
                    Δ toward zenith: {this.props.tooHigh === null ? "N/A" : deltaTitle(Math.round(this.props.tooHigh * 3600))}
                </div>
            </div>
            {this.props.adjustPositionError !== null
                    ? <div className="PolarAlignExplainError">{this.props.adjustPositionError}</div>
                    : null
            }
            {this.props.adjustPositionWarningId !== null && this.props.adjustPositionWarningDst === 0
                ? <div className="PolarAlignExplainBigWarning">
                        The position of the scope is not suitable for adjustment:
                        <span className="PolarAlignExplainBigWarningEmphasis">
                            too close to {this.props.adjustPositionWarningId}
                        </span>.<br/>
                        Please slew somewhere else then take a new reference frame.
                    </div>
                :null
            }
            {this.props.adjustPositionWarningId !== null && this.props.adjustPositionWarningDst !== 0
                ? <div className="PolarAlignExplainWarning">
                        The precision of the adjustment may be increased by moving the scope further away from {this.props.adjustPositionWarningId}.
                    </div>
                :null
            }
            <div>
                {!!this.props.adjusting
                    ?
                        <div className={"PolarAlignStatus "
                                    + (this.props.adjustError === null ? "PolarAlignStatus_running" : "PolarAlignStatus_error")}>
                            <StatusLabel
                                className={this.props.adjustError === null ? "PolarAlignStatus_running" : "PolarAlignStatus_error"}
                                text={this.props.adjustError === null
                                        ? "Taking " + (this.props.adjusting === "frame" ? " adjustment frame" : " reference frame")
                                        : this.props.adjustError}
                            />
                        </div>
                    :
                        <div>
                            Next frame: {this.props.canTakeMoveFrame
                                    ? <select value={this.props.nextFrame!} onChange={this.setNextFrame}>
                                        <option value="frame">Adjustment</option>
                                        <option value="refframe">Reference</option>
                                    </select>

                                    :   <b>Reference (required)</b>
                                }
                        </div>
                }
                {this.props.nextFrame === "refframe"
                    ? <div className="PolarAlignExplain">
                        Click next to take a ref frame.<br/>
                        You can move (slew) the scope to a region with more stars if required.<br/>
                        If you just moved the polar axis of the mount, ensure that an adjustment frame has been completed before slewing the scope.
                    </div>
                    : null
                }
                {this.props.nextFrame === "frame"
                    ? <div className="PolarAlignExplain">
                        Move the polar axis of your mount in Alt and Az (no slew) to correct the deltas.
                    </div>
                    : null
                }
            </div>


            <span style={{visibility: !!this.props.adjusting ? "hidden" : "unset"}}>
                <Panel guid="astrom:polaralign:camera">
                    <span>Camera settings</span>
                    <div>
                        <CameraSelector setValue={this.setCamera}/>
                        <DeviceConnectBton.forActivePath
                                activePath="$.backend.camera.selectedDevice"/>
                    </div>
                    <CameraSettingsView.byPath
                        settingsPath="$.backend.camera.currentSettings.configuration.deviceSettings"
                        activePath="$.backend.camera.selectedDevice"
                        setValue={this.settingSetter}
                        />
                </Panel>
            </span>
        </>
    }

    static mapStateToProps(store: Store.Content, props: InputProps):MappedProps {
        const status = store.backend.astrometry?.runningWizard?.polarAlignment;
        if (status === undefined) {
            return {
                canTakeMoveFrame: false,
                canChangeFrameType: false,
                tooEast: null,
                tooHigh: null,
                distance: null,
                adjustError: null,
                adjusting: null,
                nextFrame: null,
                adjustPositionWarningId: null,
                adjustPositionWarningDst: null,
                adjustPositionError: null,
            };
        }
        let nextFrame : MappedProps["nextFrame"];
        if (status.adjusting) {
            nextFrame = null;
        } else {
            if (!status.hasRefFrame) {
                nextFrame = "refframe";
            } else {
                nextFrame = store.backend.astrometry?.settings.polarAlign.dyn_nextFrameIsReferenceFrame ? "refframe" : "frame";
            }
        }
        return {
            canTakeMoveFrame: !!status.hasRefFrame,
            canChangeFrameType: (!status.shootRunning) && (!status.astrometryRunning),
            tooEast: status.axis ? status.axis!.tooEast : null,
            tooHigh: status.axis ? status.axis!.tooHigh : null,
            distance: status.axis ? status.axis!.distance : null,
            adjusting: status.adjusting,
            adjustError: status.adjustError,
            nextFrame,
            adjustPositionWarningId: status.adjustPositionWarning ? status.adjustPositionWarning.id : null,
            adjustPositionWarningDst: status.adjustPositionWarning ? status.adjustPositionWarning.dst : null,
            adjustPositionError: status.adjustPositionError,
        };
    }
}

export default Store.Connect(Adjust);