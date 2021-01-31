import React, { Component, PureComponent} from 'react';

import * as BackOfficeStatus from '@bo/BackOfficeStatus';

import * as Actions from '../Actions';
import * as Store from '../Store';
import * as Help from '../Help';

import * as SequenceStore from '../SequenceStore';
import * as Utils from '../Utils';
import Table, { HeaderItem, FieldDefinition } from '../table/Table';
import { atPath } from '../shared/JsonPath';
import SequenceEditDialog from './SequenceEditDialog';

import './SequenceView.css';
import { has } from '../shared/JsonProxy';
import * as BackOfficeAPI from '@bo/BackOfficeAPI';
import SequenceControler from './SequenceControler';
import SequenceSelector from './SequenceSelector';
import ImageDetail from "./ImageDetail";


type SequenceViewDatabaseObject = {
    images?: BackOfficeStatus.CameraStatus["images"]["byuuid"],
    imageList?: BackOfficeStatus.Sequence["images"],
    imageStats?: BackOfficeStatus.Sequence["imageStats"],
}

type SequenceViewProps = {
}

const fieldList:Array<FieldDefinition & {id:string}> = [
    {
        id: 'path',
        title:  'File',
        defaultWidth: '100%',
        render: (o:BackOfficeStatus.ImageStatus)=>(o === undefined ? "N/A" : o.path.indexOf('/') != -1 ? o.path.substring(o.path.lastIndexOf('/')+1) : o.path)
    },
    {
        id: 'backgroundLevel',
        title: 'BG',
        defaultWidth: '4em',
        render: (o:BackOfficeStatus.ImageStats)=>(o.backgroundLevel === undefined ? null: <span className='stat-bg'>{o.backgroundLevel.toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits: 3})}</span>),
    },
    {
        id: 'fwhm',
        title: 'FWHM',
        defaultWidth:'4em',
        render: (o:BackOfficeStatus.ImageStats)=>(o.fwhm === undefined ? null: <span className='stat-fwhm'>{o.fwhm.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits: 2})}</span>),
    },
    {
        id: 'guideStats',
        title: 'PHD',
        defaultWidth: '4em',
        render: (o:BackOfficeStatus.ImageStats)=>{
            const rms = o.guideStats?.RADECDistanceRMS;
            if (rms === null || rms === undefined) {
                return null;
            }
            return <span className='stat-guide-rms'>
                {rms.toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits: 3})}
            </span>;
        }
    }
]

const fields = fieldList.reduce((c, a)=>{c[a.id]=a; return c}, {});
const defaultHeader:HeaderItem[] = fieldList.map(e=>({id: e.id}));

class SequenceView extends PureComponent<SequenceViewProps> {
    constructor(props:SequenceViewProps) {
        super(props);
        this.state = {
        }
    }

    getItemList = (store:Store.Content)=>{
        const currentSequence = store.sequence.currentSequence;
        let seq = undefined;
        if (currentSequence && store.backend.sequence !== undefined && has(store.backend.sequence.sequences.byuuid, currentSequence)) {
            seq = store.backend.sequence.sequences.byuuid[currentSequence];
        }

        if (seq !== undefined) {
            return seq.images;
        } else {
            return [];
        }
    }

    setCurrentImage = (image:string)=> {
        Actions.dispatch<SequenceStore.SequenceActions>()("setCurrentImage", {image});
    }

    editSequence=(uid:string)=>{
        Actions.dispatch<SequenceStore.SequenceActions>()("setEditingSequence", {sequence: uid});
    }

    closeEditDialog = ()=> {
        Actions.dispatch<SequenceStore.SequenceActions>()("setEditingSequence", {sequence: undefined});
    }

    render() {
        //var self = this;
        return(<div className="SequenceView">
            <SequenceEditDialog
                currentPath='$.sequence.editingSequence'
                onClose={this.closeEditDialog}/>

            <div className="SequenceControl">
                <SequenceSelector
                    currentPath='$.sequence.currentSequence'
                    onCreated={this.editSequence}
                />
                <SequenceControler
                    currentPath='$.sequence.currentSequence'
                    editSequence={this.editSequence}
                />
            </div>
            <div className="SequenceViewDisplay">
                <ImageDetail
                    currentPath='$.sequence.currentImage'
                    detailPath='$.backend.camera.images.byuuid'
                />
            </div>
            <div className="SequenceViewTable">
                <Table statePath="$.sequenceView.list"
                    fields={fields}
                    defaultHeader={defaultHeader}
                    getDatabases={(store:Store.Content):SequenceViewDatabaseObject=>
                        {
                            const currentSequenceId = store.sequence.currentSequence;
                            const currentSequence = Utils.getOwnProp(store.backend.sequence?.sequences?.byuuid, currentSequenceId);
                            return {
                                images: store.backend.camera?.images.byuuid,
                                imageList: currentSequence?.images,
                                imageStats: currentSequence?.imageStats,
                            };
                        }
                    }
                    getItemList={(db:SequenceViewDatabaseObject)=>(db.imageList||[])}
                    getItem={(db:SequenceViewDatabaseObject,uid:string)=>
                        ({
                            ...Utils.getOwnProp(db.images, uid),
                            ...Utils.getOwnProp(db.imageStats, uid)
                        })}
                    currentPath='$.sequence.currentImage'
                    currentAutoSelectSerialPath='$.sequence.currentImageAutoSelectSerial'
                    onItemClick={this.setCurrentImage}
                />
            </div>
        </div>);
    }
}


export default SequenceView;