import * as React from 'react';
import CancellationToken from 'cancellationtoken';

import * as Help from './Help';
import { atPath } from "./shared/JsonPath";
import * as Store from "./Store";
import * as Utils from './Utils';
import * as IndiUtils from './IndiUtils';
import * as BackendRequest from "./BackendRequest";
import { ShootResult } from '@bo/BackOfficeAPI';

type InputProps = {
    cameraDevice: string|null;
    onSuccess: (t:ShootResult)=>void;
}

type MappedProps = {
    available: false;
    streamBton: false;
} |
{
    available: true;
    running: false;
    streamBton: boolean;
} |
{
    available: true;
    running: true;
    streamBton: boolean;
    managed: boolean;
    elapsed: number;
    exposure: number;
}

type Props = InputProps & MappedProps;

class ShootBton extends React.PureComponent<Props> {
    static shootBtonHelp = Help.key("Shoot", "Start frame exposure on the selected INDI camera device.");
    static spyBtonHelp = Help.key("Spy", "Listen for image taken guiding capture software (for the selected INDI camera device).");
    static abortBtonHelp = Help.key("Abort", "Abort the current frame capture on the selected INDI camera device.");

    constructor(props:Props) {
        super(props);
    }

    render() {
        var progress = 60;
        progress = this.props.available && this.props.running ? 100.0 * this.props.elapsed / this.props.exposure : 0;
        var title = !this.props.available || !this.props.running ? '' :this.props.exposure + "s";

        return <div className={'ShootBar' + (this.props.available && this.props.running ? ' ActiveShootBar' : ' InactiveShootBar')}>
            <input disabled={(!this.props.available) || this.props.running} type="button" onClick={this.shoot} className="ShootBton" value="Shoot" {...ShootBton.shootBtonHelp.dom()}/>
            {this.props.streamBton
                ? <input disabled={(!this.props.available) || (this.props.running && this.props.managed)} type="button" onClick={this.stream} className="ShootBton" value="Spy" {...ShootBton.spyBtonHelp.dom()}/>
                : null
            }
            <div className='ShootProgress' style={{position: 'relative'}}>
                <div style={{position: 'absolute', left: '0px', top: '0px', bottom:'0px', width: progress + '%'}}
                    className='ShootProgressAdvance'>
                </div>

                <div style={{position: 'absolute', left: '0px', right: '0px', top: '0px', bottom:'0px'}} className='ShootProgressTitle'>
                    {title}
                </div>
            </div>
            <input disabled={(!this.props.available) || !this.props.running} type="button" onClick={this.abort} className="ShootAbortBton" value="Abort" {...ShootBton.abortBtonHelp.dom()}/>
        </div>;
    }

    shoot = async()=>{
        // FIXME: the button should be disabled until ack from server
        // ack from server should arrive only when state has been updated, ...
        // This looks like a progress channel is required
        const rslt = await BackendRequest.RootInvoker("camera")("shoot")(CancellationToken.CONTINUE, {});
        console.log('got rslt:' + JSON.stringify(rslt));
        this.props.onSuccess(rslt);
    }

    stream = async()=>{
        const rslt = await BackendRequest.RootInvoker("camera")("stream")(CancellationToken.CONTINUE, {});
        console.log('got rslt:' + JSON.stringify(rslt));
    }

    abort = async ()=>{
        await BackendRequest.RootInvoker("camera")("abort")(CancellationToken.CONTINUE, {});
    }

    static mapStateToProps(store:Store.Content, ownProps:InputProps):MappedProps {
        const active = ownProps.cameraDevice;
        let available = false;
        let streamBton = false;
        if (active === undefined || active === null) {
            return {available, streamBton};
        }

        // Check if exposure is present
        const ccdExposureVec = IndiUtils.getVectorDesc(store, active, 'CCD_EXPOSURE');
        if (ccdExposureVec === undefined) {
            return {available, streamBton}
        }
        available = true;

        const currentStream = Utils.getOwnProp(store.backend?.camera?.currentStreams, active);
        if (currentStream !== undefined) {
            return {
                available,
                running: true,
                managed: true,
                elapsed:0,
                exposure: 0,
                streamBton: true,
            }
        }

        streamBton = !!(Utils.getOwnProp(store.backend.camera?.dynStateByDevices,active)?.spyRecommanded);

        const currentShoot = Utils.getOwnProp(store.backend.camera?.currentShoots, active);

        if (currentShoot === undefined) {
            return {available, running: false, streamBton}
        }

        let elapsed, exposure;

        if ('expLeft' in currentShoot) {
            elapsed = currentShoot.exposure - currentShoot.expLeft;
        } else {
            elapsed = 0;
        }
        exposure = currentShoot.exposure;

        return {
            available,
            running: true,
            managed: currentShoot.managed,
            elapsed,
            exposure,
            streamBton,
        };
    }
}

export default Store.Connect(ShootBton);
