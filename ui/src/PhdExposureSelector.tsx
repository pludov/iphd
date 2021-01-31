import * as React from 'react';
import { connect } from 'react-redux';
import * as Store from './Store';
import * as Help from './Help';
import * as PromiseSelector from "./PromiseSelector";
import * as BackendRequest from "./BackendRequest";
import CancellationToken from 'cancellationtoken';

type InputProps = {
}

type SelectorProps = PromiseSelector.Props<number|null> & {
    availables: Array<number>|null;
}


function getTitle(x:number|null) {
    if (x === null) {
        return "";
    }
    if (x < 1000) {
        return (x) + "ms"
    }
    return (x / 1000) + "s";
}

function getId(x:number|null) {
    if (x === null) {
        return "";
    }
    return "" + x;
}

function availablesGenerator(i: SelectorProps):Array<number|null> {
    return i.availables || [];
}

async function setValue(d:string) {
    await BackendRequest.RootInvoker("phd")("setExposure")(CancellationToken.CONTINUE, {exposure: parseInt(d, 10)});
}

const phdExposureSelectorHelp = Help.key("Select phd frame exposure duration");

const PhdExposureSelector = connect((store: Store.Content, ownProps: InputProps):SelectorProps => {
    const phd = store.backend.phd;

    let active: number|null = phd ? phd.exposure : null;
    let availables = phd ? phd.exposureDurations : null;
    return {
        active: active === null ? null : "" + active,
        availables,
        getTitle,
        getId,
        placeholder: "Exp",
        availablesGenerator,
        setValue,
        helpKey: phdExposureSelectorHelp,
    }
})(PromiseSelector.default) as new (props:InputProps)=>(React.PureComponent<InputProps>);

export default PhdExposureSelector;