/**
 * Created by ludovic on 18/07/17.
 */
import * as React from 'react';

import * as Store from "./Store";
import * as Help from "./Help";
import * as BackendRequest from "./BackendRequest";
import './PhdView.css';
import { PhdStatus, CameraStream } from '@bo/BackOfficeStatus';
import FitsViewerInContext from './FitsViewerInContext';
import { hasKey } from './shared/Obj';
import FitsMarker from './FitsViewer/FitsMarker';
import CancellationToken from 'cancellationtoken';


type InputProps = {}
type MappedProps = {
    streamingCamera?: PhdStatus["streamingCamera"];
    lockPosition?: PhdStatus["lockPosition"];
} & Partial<CameraStream>

type Props = InputProps & MappedProps;

type State = {}


class PhdStream extends React.PureComponent<Props, State> {
    private static selGuideStarHelp = Help.key("Sel. guide star", "Select the guide star for PHD.");
    constructor(props:Props) {
        super(props);
        this.state = {}
    }

    private setLockPos = async (pos: any)=>{
        if (pos.imageX === undefined || pos.imageY === undefined) {
            throw new Error("Position not set");
        }
        await BackendRequest.RootInvoker("phd")("setLockPosition")(CancellationToken.CONTINUE, {x: pos.imageX, y: pos.imageY, exact: false});
    }

    private readonly contextMenu = [
        {
            title: 'Sel. guide star',
            helpKey: PhdStream.selGuideStarHelp,
            key: 'lock',
            cb: this.setLockPos,
            positional: true,
        }
    ];

    render() {
        return (
            <div className={"FitsViewer FitsViewContainer"}>
                <FitsViewerInContext
                        contextKey="phdview"
                        contextMenu={this.contextMenu}
                        path={null}
                        streamId={this.props.streamId || null}
                        streamSerial={this.props.serial === null || this.props.serial === undefined ? null : "" + this.props.serial}
                        subframe={this.props.subframe}
                        streamSize={this.props.frameSize || this.props.streamSize || null}>
                        {this.props.lockPosition
                            ?
                                <FitsMarker x={this.props.lockPosition.x} y={this.props.lockPosition.y}>
                                    <div className="PhdStarLock">

                                    </div>
                                </FitsMarker>
                            :
                                null
                        }
                            
                </FitsViewerInContext>
        </div>);
    }

    static mapStateToProps = (store:Store.Content, ownProps: InputProps):MappedProps=>{
        const phd = store.backend.phd;
        const cam = store.backend.camera;
        if (phd === undefined || cam === undefined) {
            return {};
        }
        const streamingCamera = phd.streamingCamera;
        if (streamingCamera === null) {
            return {};
        }
        if (!hasKey(cam.currentStreams, streamingCamera)) {
            return {};
        }
        const stream = cam.currentStreams[streamingCamera];
        return {
            streamingCamera,
            lockPosition: phd.lockPosition,
            ...stream
        };
    }
}


export default Store.Connect(PhdStream);