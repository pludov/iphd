import * as React from 'react';
import { connect } from 'react-redux';

import * as Help from '../Help';
import * as Store from '../Store';
import PromiseSelector from '../PromiseSelector';

type InputProps = {
    getValue: (store:Store.Content, props: InputProps)=>string|null
}

const emptyArray: [] = [];

const cameraSelectorHelp = Help.key("Select camera", "Select the INDI camera device to use");

const CameraSelector = connect((store:Store.Content, ownProps:InputProps)=> {
    const active = ownProps.getValue(store, ownProps);
    return ({
        active: active,
        helpKey: cameraSelectorHelp,
        availables: store.backend.camera?.availableDevices || emptyArray
    })
})(PromiseSelector);

export default CameraSelector;
