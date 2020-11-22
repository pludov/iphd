import * as React from 'react';
import { connect } from 'react-redux';
import { createSelector } from 'reselect'
import CancellationToken from 'cancellationtoken';

import * as Store from './Store';
import * as BackendRequest from "./BackendRequest";
import PromiseSelector, { Props as PromiseSelectorProps } from './PromiseSelector';

type CustomProps = {
    getValue: (store:Store.Content, props: CustomProps)=>string|null
}

export type Item = {
    key: string;
    title: string;
}

function getTitle(e:Item) {
    return e.title;
}

function getId(e:Item) {
    return e.key;
}

export type InputProps = CustomProps & Omit<PromiseSelectorProps<Item>, "getId"|"getTitle"|"active"|"placeholder"|"availablesGenerator">;

const ImagingSetupSelector = connect(()=> {
    const listSelector = createSelector(
        (store: Store.Content, ownProps: CustomProps)=>store.backend?.imagingSetup?.configuration?.byuuid,
        (byuuid)=> {
            const ret = [];
            for(const key of Object.keys(byuuid || {})) {
                ret.push({key, title: byuuid![key].name});
            }
            ret.sort((a, b)=>(a.title.localeCompare(b.title)));
            return ret;
        });

    return (store:Store.Content, ownProps:CustomProps) => {
        const active = ownProps.getValue(store, ownProps);
        return ({
            active: active,
            getId,
            getTitle,
            availables: listSelector(store, ownProps)
        })
    }
}, null, null, {forwardRef: true} as any)(PromiseSelector);

const setCurrentImagingSetup = async(d:string|null)=>{
    await BackendRequest.RootInvoker("imagingSetupManager")("setCurrentImagingSetup")(
        CancellationToken.CONTINUE,
        {
            imagingSetupUuid: d
        }
    );
};

const getCurrentImagingSetupUid = (store:Store.Content)=>{
    const ret = store.backend?.imagingSetup?.configuration.currentImagingSetup;
    return (ret === undefined) ? null : ret;
};


const getCurrentImagingSetup = (store:Store.Content)=>{
    const ret = getCurrentImagingSetupUid(store);
    if (ret === null) {
        return null;
    }
    const byuuid = store.backend?.imagingSetup?.configuration.byuuid;
    if (byuuid === undefined) {
        return null;
    }

    if (!Object.prototype.hasOwnProperty.call(byuuid, ret)) {
        return null;
    }

    return byuuid[ret];

}

export default Object.assign(ImagingSetupSelector, {setCurrentImagingSetup, getCurrentImagingSetup, getCurrentImagingSetupUid});
