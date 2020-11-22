import * as React from 'react';
import * as Store from './Store';
import { atPath } from './shared/JsonPath';
import StatePropCond from './StatePropCond';
import CameraBinEditor from './CameraBinEditor';
import CameraIsoEditor from './CameraIsoEditor';
import CameraExpEditor from './CameraExpEditor';
import './CameraView.css'

type InputProps = {
    // path to currentSettings - TODO : drop
    activePath: string;
    // path to the property that hold the camera id
    settingsPath: string;
    setValue: (propName:string)=>((value: any)=>Promise<void>);
}
type MappedProps = {
    current: string;
}
type Props = InputProps & MappedProps;


class CameraSettingsView extends React.PureComponent<Props> {
    constructor(props:Props) {
        super(props);
    }

    render() {
        if (this.props.current === null) {
            return null;
        }
        const deviceId = "[" + JSON.stringify(this.props.current)+"]"
        return <>
            <StatePropCond device={this.props.current} property="CCD_BINNING">
                    <span className='cameraSetting'>
                        <CameraBinEditor
                            device={this.props.current}
                            valuePath={this.props.settingsPath + deviceId + '.bin'}
                            setValue={this.props.setValue('bin')}/>
                    </span>
            </StatePropCond>

            <StatePropCond device={this.props.current} property="CCD_ISO">
                    <span className='cameraSetting'>
                        <CameraIsoEditor
                            device={this.props.current}
                            valuePath={this.props.settingsPath + deviceId + '.iso'}
                            setValue={this.props.setValue('iso')} />
                    </span>
            </StatePropCond>

            <StatePropCond device={this.props.current} property="CCD_EXPOSURE">
                    <span className='cameraSetting'>Exp:
                        <CameraExpEditor
                            device={this.props.current}
                            valuePath={this.props.settingsPath + deviceId + '.exposure'}
                            setValue={this.props.setValue('exposure')}/>
                    </span>
            </StatePropCond>
        </>;
    }

    // TODO : drop
    static mapStateToProps = function(store: Store.Content, ownProps: InputProps) {
        return ({
            current: atPath(store, ownProps.activePath)
        });
    }
}

export default Object.assign(CameraSettingsView, {byPath: Store.Connect(CameraSettingsView)});