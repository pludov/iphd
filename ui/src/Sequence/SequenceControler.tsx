import * as React from 'react';

import * as BackOfficeStatus from '@bo/BackOfficeStatus';

import * as Utils from '../Utils';
import * as Store from '../Store';
import * as Help from '../Help';
import * as BackendRequest from '../BackendRequest';
import { atPath } from '../shared/JsonPath';

import * as BackOfficeAPI from '@bo/BackOfficeAPI';
import StatusLabel from './StatusLabel';
import CancellationToken from 'cancellationtoken';

type InputProps = {
    currentPath: string;
    editSequence:(uid:string)=>(void);
}
type MappedProps = {
    uuid?: string;
    current?: BackOfficeStatus.Sequence;
}

type Props = InputProps & MappedProps;

type State = {
    runningPromise?: boolean;
}

export class SequenceControler extends React.PureComponent<Props, State> {
    private static startBtonHelp = Help.key("Start", "Start the current sequence. The sequence will restart after the last successfull frame if possible.");
    private static stopBtonHelp = Help.key("Stop", "Stop the current sequence. The current exposure is aborted immediately. It is possible to restart it later (Start)");
    private static editBtonHelp = Help.key("edit", "Edit the definition of the sequence. Most parameter can be adjusted while sequence is running. They'll be applied after the end of the current exposure.");
    private static resetBtonHelp = Help.key("reset", "Reset the current sequence. It will restart from the begining, whatever process has already been made.");
    private static dropBtonHelp = Help.key("drop", "Remove the sequence from the list. The image files are not dropped.");

    constructor(props:Props) {
        super(props);
        this.state = {
        };
    }

    private startSequence = async()=>{
        await BackendRequest.RootInvoker("sequence")("startSequence")(
            CancellationToken.CONTINUE,
            {
                sequenceUid: this.props.uuid!,
            });
    }

    private stopSequence = async()=>{
        await BackendRequest.RootInvoker("sequence")("stopSequence")(
            CancellationToken.CONTINUE,
            {
                sequenceUid: this.props.uuid!,
            });
    }
    
    private resetSequence = async()=>{
        await BackendRequest.RootInvoker("sequence")("resetSequence")(
            CancellationToken.CONTINUE,
            {
                sequenceUid: this.props.uuid!,
            });
    }

    private dropSequence = async()=>{
        await BackendRequest.RootInvoker("sequence")("dropSequence")(
            CancellationToken.CONTINUE,
            {
                sequenceUid: this.props.uuid!,
            });
    }

    private openEditDialog = ()=>{
        this.props.editSequence(this.props.uuid!);
    }

    render() {
        var clickable = {
            start: false,
            stop: false,
            edit: false,
            drop: false,
            reset: false
        }
        if (this.props.current) {
            clickable.edit = true;
            clickable.drop = true;
            clickable.reset = true;
        }
        if (this.props.current && !this.state.runningPromise) {
            switch(this.props.current.status) {
                case 'running':
                    clickable.stop = true;
                    clickable.drop = false;
                    clickable.reset = false;
                    break;
                case 'done':
                    break;
                default:
                    clickable.start = true;
                    break;
            }
        }

        const statusStr:string = !this.props.current
                ? ("")
                : (
                    this.props.current.status == 'error'
                    ? '' + this.props.current.errorMessage
                    :  this.props.current.status);
        return(<div>
            <div className='messageContainer'>
                    <div className='messageTitle' key="title">Status:</div>
                    <div className='messageContent' key="status">
                        <StatusLabel
                                text={statusStr}
                                className={"SequenceStatus" + (this.props.current ? this.props.current.status.toUpperCase() : "NONE")} />
                        {this.props.current && this.props.current.progress ? <i>{this.props.current.progress}</i> : null}
                    </div>
            </div>
            <input
                {...SequenceControler.startBtonHelp.dom()}
                type='button'
                value='Start'
                id='Start'
                disabled={!clickable.start}
                onClick={(e)=>Utils.promiseToState(this.startSequence, this)}
            />
            <input
                {...SequenceControler.stopBtonHelp.dom()}
                type='button'
                value='Stop'
                id='Stop'
                disabled={!clickable.stop}
                onClick={(e)=>Utils.promiseToState(this.stopSequence, this)}
            />
            <input {...SequenceControler.editBtonHelp.dom()} type='button' disabled={!clickable.edit} value='edit' onClick={this.openEditDialog}/>
            <input {...SequenceControler.resetBtonHelp.dom()} type='button' disabled={!clickable.reset} value='reset' onClick={(e)=>Utils.promiseToState(this.resetSequence, this)}/>
            <input {...SequenceControler.dropBtonHelp.dom()} type='button' disabled={!clickable.drop} value='drop' onClick={(e)=>Utils.promiseToState(this.dropSequence, this)}/>
        </div>);
    }

    static mapStateToProps(store:Store.Content, ownProps: InputProps):MappedProps {
        var selected = atPath(store, ownProps.currentPath);
        if (!selected) {
            return {}
        }
        var currentSequence = store.backend.sequence?.sequences.byuuid[selected];
        return {
            uuid: selected,
            current: currentSequence
        };
    }
}

export default Store.Connect(SequenceControler);
