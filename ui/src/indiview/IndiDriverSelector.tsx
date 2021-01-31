/**
 * Created by ludovic on 21/07/17.
 */
import React, { Component, PureComponent} from 'react';
import * as Help from "../Help";
import { atPath } from '../shared/JsonPath';
import * as Store from "../Store";
import * as Actions from "../Actions";
import * as IndiManagerStore from "../IndiManagerStore";

import "./IndiManagerView.css";

type InputProps = {
}

type MappedProps = {
    current: string;
    options: string[];
}

type Props = InputProps & MappedProps;

class IndiDriverSelector extends React.Component<Props> {
    static help = Help.key("INDI driver selector", "Select which INDI device or driver to view details for.");

    constructor(props:Props) {
        super(props);
    }

    updateDriver = (e:React.ChangeEvent<HTMLSelectElement>)=> {
        const target = e.target.value;
        Actions.dispatch<IndiManagerStore.IndiManagerActions>()("switchToDevice", {dev: target});
    }

    render() {
        console.log('Rendering: ' , this.props.options);
        const deviceSelectorOptions = this.props.options.map((item) => <option key={item} value={item}>{item}</option>);
        return (<select value={this.props.current}
            onChange={this.updateDriver}
            {...IndiDriverSelector.help.dom()}
            placeholder="Select device...">
            {deviceSelectorOptions}
        </select>);
    }

    // Limit the refresh for the selector (would reset selection)
    shouldComponentUpdate(nextProps:Props) {
        if (this.props.current !== nextProps.current) {
            return true;
        }
        if (this.props.options.length !== nextProps.options.length) {
            return true;
        }
        for(let i = 0; i < this.props.options.length; ++i) {
            if (this.props.options[i] !== nextProps.options[i]) {
                return true;
            }
        }
        return false;
    }

    static mapStateToProps(store: Store.Content, ownProps: InputProps):MappedProps {
        var deviceSelectorOptions:string[] = [];

        const backend = store.backend.indiManager;

        let currentDeviceFound= false;

        let currentDevice = store.indiManager.selectedDevice;
        if (currentDevice == undefined) currentDevice = "";

        var found = {};
        if (backend !== undefined && Object.prototype.hasOwnProperty.call(backend, 'deviceTree')) {

            for(const o of Object.keys(backend.deviceTree).sort()) {
                if (o === currentDevice) currentDeviceFound = true;
                deviceSelectorOptions.push(o);
                found[o] = 1;
            }
        }

        var configuredDevices = atPath(backend, '$.configuration.indiServer.devices');
        if (configuredDevices) {
            for(var o of Object.keys(configuredDevices).sort())
            {
                if (Object.prototype.hasOwnProperty.call(found, o)) {
                    continue;
                }
                if (o === currentDevice) currentDeviceFound = true;
                deviceSelectorOptions.push(o);
            }
        }

        if (!currentDeviceFound) {
           deviceSelectorOptions.splice(0,0, currentDevice);
        }

        var result = {
            options: deviceSelectorOptions,
            current:currentDevice
        };
        return result;
    }
}

export default Store.Connect(IndiDriverSelector);

