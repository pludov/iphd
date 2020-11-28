import React, { Component, PureComponent} from 'react';
import { connect } from 'react-redux';
import { atPath } from './shared/JsonPath';
import * as PromiseSelector from './PromiseSelector';
import * as Utils from './Utils';
import * as Store from './Store';
import * as IndiUtils from './IndiUtils';
import { IndiDevice, IndiVector } from '@bo/BackOfficeStatus';
import { has } from './shared/JsonProxy';

export type InputProps = {
    // name of the device (indi id)
    device: string|undefined;
    // Location of the value in the store
    valuePath: string;
    // Function that build a promises
    setValue: (e:string)=>Promise<void>;
    vecName: string;
    focusRef?: React.RefObject<HTMLSelectElement>
}

type MappedProps = PromiseSelector.Props<string> & {
    indiDeviceDesc: IndiVector|undefined;
}

type Props = InputProps & MappedProps;

function IndiTitle(x: string, props: Props) {
    let ret = Utils.getOwnProp(props.indiDeviceDesc?.childs, x)?.$label;
    if (ret === undefined) {
        return x;
    }
    return ret;
}

const emptyArray: [] = [];
const IndiSelectorEditor = connect((store: Store.Content, ownProps: InputProps) => {
    const indiDeviceDesc = ownProps.device === undefined ? undefined : IndiUtils.getVectorDesc(store, ownProps.device, ownProps.vecName);
    return ({
        indiDeviceDesc: indiDeviceDesc,
        active: atPath(store, ownProps.valuePath),
        availables: indiDeviceDesc?.childNames || emptyArray,
        getTitle: IndiTitle
    });
})(PromiseSelector.default)

export default IndiSelectorEditor;