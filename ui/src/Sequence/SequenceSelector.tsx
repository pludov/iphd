import * as React from 'react';
import { connect } from 'react-redux';
import { createSelector } from 'reselect'

import * as BackOfficeStatus from '@bo/BackOfficeStatus';

import * as Utils from '../Utils';
import * as Actions from '../Actions';
import * as Store from '../Store';
import * as Help from '../Help';
import * as BackendRequest from '../BackendRequest';

import * as SequenceStore from '../SequenceStore';
import PromiseSelector from '../PromiseSelector';
import { atPath } from '../shared/JsonPath';
import CancellationToken from 'cancellationtoken';


type OwnProps = {
    currentPath: string;
    onCreated: (uid:string)=>void;
};

function setCurrentSequence(uid:string) {
    Actions.dispatch<SequenceStore.SequenceActions>()("setCurrentSequence", {sequence: uid});
}

async function newSequence(onCreated: (uid:string)=>void) {
    const sequence = await BackendRequest.RootInvoker("sequence")("newSequence")(
        CancellationToken.CONTINUE,
        {});
    Actions.dispatch<SequenceStore.SequenceActions>()("setCurrentSequence", {sequence});
    onCreated(sequence);
}

const sequenceSelectorHelp = Help.key("Sequence selector", "Select the sequence to display. Choose \"New\" to create a new sequence (last position)");

const SequenceSelector = connect(()=>{
    const sequenceSelectorBaseProps = {
        placeholder: 'Sequence...',
        nullAlwaysPossible: false,
        getTitle: (id:string, props:any)=>(id && props.definitions[id] ? props.definitions[id].title : null),
        setValue: setCurrentSequence,
        helpKey: sequenceSelectorHelp,
    };

    const controls = createSelector(
            (store: Store.Content, ownProps: OwnProps)=>ownProps.onCreated,
            (onCreated)=> [{
                id:'new',
                title:'✏️ New',
                run: ()=>newSequence(onCreated)
            }]);

    return (store:Store.Content, ownProps:OwnProps)=> ({
        ... sequenceSelectorBaseProps,
        controls: controls(store, ownProps),
        active: atPath(store, ownProps.currentPath),
        availables: store.backend.sequence?.sequences.list,
        definitions: store.backend.sequence?.sequences.byuuid
    })
})(PromiseSelector);

export default SequenceSelector;
