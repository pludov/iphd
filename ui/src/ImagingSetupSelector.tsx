import * as React from 'react';
import { connect } from 'react-redux';
import { createSelector } from 'reselect'
import CancellationToken from 'cancellationtoken';

import * as Store from './Store';
import * as BackendRequest from "./BackendRequest";
import PromiseSelector from './PromiseSelector';

type InputProps = {
    getValue: (store:Store.Content, props: InputProps)=>string|null
}

type item = {
    key: string;
    title: string;
}

function getTitle(e:item) {
    return e.title;
}

function getId(e:item) {
    return e.key;
}

const ImagingSetupSelector = connect(()=> {
    const listSelector = createSelector(
        (store: Store.Content, ownProps: InputProps)=>store.backend?.imagingSetup?.configuration?.byuuid,
        (byuuid)=> {
            const ret = [];
            for(const key of Object.keys(byuuid || {})) {
                ret.push({key, title: byuuid![key].name});
            }
            ret.sort((a, b)=>(a.title.localeCompare(b.title)));
            return ret;
        });

    return (store:Store.Content, ownProps:InputProps) => {
        const active = ownProps.getValue(store, ownProps);
        return ({
            active: active,
            getId,
            getTitle,
            availables: listSelector(store, ownProps)
        })
    }
})(PromiseSelector);

const setCurrentImagingSetup = async(d:string|null)=>{
    await BackendRequest.RootInvoker("imagingSetupManager")("setCurrentImagingSetup")(
        CancellationToken.CONTINUE,
        {
            imagingSetupUuid: d
        }
    );
};

const getCurrentImagingSetup = (store:Store.Content)=>{
    const ret = store.backend?.imagingSetup?.configuration.currentImagingSetup;
    return (ret === undefined) ? null : ret;
};


export default Object.assign(ImagingSetupSelector, {setCurrentImagingSetup, getCurrentImagingSetup});
