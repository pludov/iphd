import * as React from 'react';
import { connect } from 'react-redux';

import * as Help from './Help';
import * as Store from "./Store";
import PromiseSelector from './PromiseSelector';
import './CameraView.css'

const cameraSelectorHelp = Help.key("Select camera", "Select the INDI camera device to use");

export default connect((store:Store.Content)=> ({
    helpKey: cameraSelectorHelp,
    active: store.backend && store.backend.camera ? store.backend.camera.selectedDevice : undefined,
    availables: store.backend && store.backend.camera ? store.backend.camera.availableDevices : []
}))(PromiseSelector);
