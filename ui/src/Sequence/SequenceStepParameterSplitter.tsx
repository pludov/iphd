import * as React from 'react';
import CancellationToken from 'cancellationtoken';
import {SortableContainer, SortableElement, arrayMove} from 'react-sortable-hoc';

import { SequenceStep, ImagingSetup } from '@bo/BackOfficeStatus';
import * as Utils from '../Utils';
import * as Store from '../Store';
import * as BackendRequest from '../BackendRequest';
import ArrayReselect from '../utils/ArrayReselect';

import { hasKey } from '../shared/Obj';

import "./SequenceStepEdit.css";
import { ForcedParams } from './SequenceStepEdit';
import { ParamDesc } from './SequenceStepParameter';
import Modal from '../Modal';

type InputProps = {
    sequenceUid: string;
    sequenceStepUidPath: string;
    parameter: ParamDesc & {id: keyof SequenceStep};
    imagingSetup: ImagingSetup,
    imagingSetupId: string,
    onClose: ()=>(void);
    onSplit: (removeFromParent: string, p:ForcedParams)=>(void);
}

type MappedProps = {
    detailsStack: SequenceStep[];
}

type State = {
    valueCount: number;
}

const values = [2, 3, 4, 5, 6, 7, 8, 9, 10];

type Props = InputProps & MappedProps;

class SequenceStepParameterSplitter extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {
            valueCount: 2
        };
    }

    // Ask the back to add a field, and propagate to the parent widget (force the new param in its new childs)
    private perform = async()=>{
        const toRemove = this.props.parameter.id;
        const uids = await BackendRequest.RootInvoker("sequence")("newSequenceStep")(
            CancellationToken.CONTINUE,
            {
                sequenceUid: this.props.sequenceUid,
                stepUidPath: JSON.parse(this.props.sequenceStepUidPath),
                removeParameterFromParent: toRemove,
                count: this.state.valueCount
            });
        console.log('created sequence stepos:', uids);
        const ret: ForcedParams = {};
        for(const uid of uids) {
            ret[uid] = {param: this.props.parameter.id, uid: uid};
        }
        this.props.onSplit(toRemove, ret);
        this.props.onClose();
    }

    private updateValue = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const valueCount = parseInt(e.target.value);
        this.setState({valueCount});
    }

    render() {
        return <Modal forceVisible={true} onClose={this.props.onClose}>
            <div>
                <div>Creating childs for {this.props.parameter.title}</div>
                Number of values:
                    <select value={this.state.valueCount} onChange={this.updateValue}>
                        {values.map(i=> <option key={i} value={i}>{i}</option>)}
                    </select>
            </div>
            <input type="button" value="OK" onClick={this.perform}/>
        </Modal>
    }

    static mapStateToProps=()=>{
        const detailsStackFn = (store:Store.Content, ownProps:InputProps):SequenceStep[]=>{
            let detailsStack: SequenceStep[];
            try {
                let details = store.backend.sequence!.sequences.byuuid[ownProps.sequenceUid].root;
                detailsStack = [ details ];
                for(const childUid of JSON.parse(ownProps.sequenceStepUidPath)) {
                    details = details.childs!.byuuid[childUid];
                    detailsStack.push(details);
                }
                return detailsStack;
            } catch(e) {
                console.log('mapStateToProp failed', e);
                return [];
            }
        }
        const detailsStackMem = ArrayReselect.createArraySelector(detailsStackFn);
        return (store:Store.Content, ownProps:InputProps)=> ({
            detailsStack: detailsStackMem(store, ownProps)
        })
    }
}

export default Store.Connect(SequenceStepParameterSplitter);
