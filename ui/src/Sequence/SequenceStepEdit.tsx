import * as React from 'react';
import CancellationToken from 'cancellationtoken';
import {SortableContainer, SortableElement, arrayMove} from 'react-sortable-hoc';
import uuid from 'uuid';


import { SequenceStep, SequenceDitheringSettings, SequenceStepParameters, SequenceForeach, SequenceForeachItem, ImagingSetup } from '@bo/BackOfficeStatus';
import * as Utils from '../Utils';
import * as Store from '../Store';
import * as BackendRequest from '../BackendRequest';
import TextEdit from "../TextEdit";
import CameraFrameTypeEditor from '../CameraFrameTypeEditor';
import FilterSelector from '../FilterSelector';
import ArrayReselect from '../utils/ArrayReselect';

import { hasKey } from '../shared/Obj';
import { atPath } from '../shared/JsonPath';

import "./SequenceStepEdit.css";
import { UpdateSequenceStepRequest, UpdateSequenceStepDitheringRequest, PatchSequenceStepRequest } from '@bo/BackOfficeAPI';
import CameraExpEditor from '../CameraExpEditor';
import CameraIsoEditor from '../CameraIsoEditor';
import CameraBinEditor from '../CameraBinEditor';
import SequenceStepParameterSplitter from './SequenceStepParameterSplitter';
import { parameters, ParamDesc, CameraCapacity } from "./SequenceStepParameter";
import DitheringSettingEdit from './DitheringSettingEdit';
import Modal from '@src/Modal';

export type ForcedParams = {[id: string]: {param: string, uid:string}};

type InputProps = {
    sequenceUid: string;
    sequenceStepUidPath: string;
    allowRemove: boolean;
    imagingSetupId: string;
    imagingSetup: ImagingSetup;
    cameraCapacity: CameraCapacity;

    // Force a new parameter
    forcedParam?: keyof SequenceStep;
    // This uid must change for the forceParam to take effect
    forcedParamUid?: string;
    forcedParamFocus?: boolean;

    bodyRef?: React.RefObject<HTMLDivElement>;
    focusRef?: React.RefObject<HTMLSelectElement>;
}

type MappedProps = {
    detailsStack: SequenceStep[];
    cameraCapacity: CameraCapacity;
}

type Props = InputProps & MappedProps;

type State = {
    dropButtonBusy?: boolean;
    newItems: {[id: string]: true};
    lastNewItem?: string;
    lastNewItemSerial: number;

    overridenChildList?: undefined|string[];
    sourceChildList?: undefined|string[];
    parameterSplit: undefined|(ParamDesc& {id: keyof SequenceStepParameters});

    // Force presence of a given parameter on childs (for split)
    forcedChilds?: ForcedParams;

    lastForcedParam?: string;
    lastForcedParamUid?: string;

};

const SortableItem = SortableElement<{
                        imagingSetupId: string;
                        imagingSetup: ImagingSetup;
                        cameraCapacity: CameraCapacity,
                        sequenceUid: string,
                        parentPath: string,
                        sequenceStepUid:string,
                        forcedParam?: keyof SequenceStep,
                        forcedParamUid?: string,
                        itemRef?: React.RefObject<any>,
                        itemFocusRef?: React.RefObject<any>,
        }>(({imagingSetupId, imagingSetup, cameraCapacity, sequenceUid, sequenceStepUid, parentPath, forcedParam, forcedParamUid, itemRef, itemFocusRef})=> {
    return (<li className="SequenceStepMovableBlock">
                <MappedSequenceStepEdit
                        imagingSetup={imagingSetup}
                        imagingSetupId={imagingSetupId}
                        cameraCapacity={cameraCapacity}
                        sequenceUid={sequenceUid}
                        sequenceStepUidPath={JSON.stringify(JSON.parse(parentPath).concat([sequenceStepUid]))}
                        forcedParam={forcedParam}
                        forcedParamUid={forcedParamUid}
                        allowRemove={true}
                        bodyRef={itemRef}
                        focusRef={itemFocusRef}/>
    </li>);
})

const SortableList = SortableContainer<{
                        items: string[],
                        imagingSetupId: string;
                        imagingSetup: ImagingSetup;
                        cameraCapacity: CameraCapacity,
                        sequenceUid:string,
                        parentPath: string,
                        forcedParams: ForcedParams,
                        lastNewItem?: string,
                        lastNewItemRef?: React.RefObject<any>,
                        lastNewItemFocusRef?: React.RefObject<any>,
        }>(({items, imagingSetupId, imagingSetup, cameraCapacity, sequenceUid, parentPath, forcedParams, lastNewItem, lastNewItemRef, lastNewItemFocusRef}) => {
    return (
      <ul className="SequenceStepContainer">
        {items.map((sequenceStepUid: string, index:number) => {
            let forced;
            if (Object.prototype.hasOwnProperty.call(forcedParams, sequenceStepUid)) {
                forced = forcedParams[sequenceStepUid];
            }

            return <SortableItem
                    key={`item-${sequenceStepUid}`}
                    index={index}
                    imagingSetup={imagingSetup}
                    imagingSetupId={imagingSetupId}
                    cameraCapacity={cameraCapacity}
                    sequenceUid={sequenceUid}
                    parentPath={parentPath}
                    sequenceStepUid={sequenceStepUid}
                    forcedParam={forced === undefined ? undefined : forced.param as keyof SequenceStep}
                    forcedParamUid={forced === undefined ? undefined : forced.uid}
                    itemRef={sequenceStepUid === lastNewItem ? lastNewItemRef : undefined}
                    itemFocusRef={sequenceStepUid === lastNewItem ? lastNewItemFocusRef : undefined}
                    />
        })}
      </ul>
    );
  });


class SequenceStepEdit extends React.PureComponent<Props, State> {
    // Keep the ref of the last new editor (to focus it)
    private lastNewItemRef = React.createRef<HTMLDivElement>();
    private lastNewItemFocusRef = React.createRef<HTMLBaseElement>();
    // lastNewEditorId is incremented on every componentDidUpdate to ensure focus is done once
    private lastNewItemId: number = 0;

    constructor(props:Props) {
        super(props);
        this.state = {
            parameterSplit: undefined,
            newItems: {},
            lastNewItemSerial: 0
        };
    }

    private getCurrentDetails() {
        return this.props.detailsStack[this.props.detailsStack.length - 1];
    }

    private patchSequenceStepParam = async(patch: jsonpatch.OpPatch[]) => {
        const payload:PatchSequenceStepRequest = {
            sequenceUid: this.props.sequenceUid,
            stepUidPath: JSON.parse(this.props.sequenceStepUidPath),
            patch
        };
        await BackendRequest.RootInvoker("sequence")("patchSequenceStep")(
            CancellationToken.CONTINUE,
            payload,
        );
    }

    private updateSequenceStepParam = async(param: UpdateSequenceStepRequest["param"], value: UpdateSequenceStepRequest["value"]) => {
        const patch: jsonpatch.OpPatch[] = []
        if (value !== undefined) {
            patch.push({
                op: 'add',
                path: '/' + param,
                value: value
            });
        } else {
            patch.push({
                op: 'add',
                path: '/' + param,
                value: null
            });
            patch.push({
                op: 'remove',
                path: '/' + param
            });
        }
        await this.patchSequenceStepParam(patch);
    }

    private updateIterableSequenceStepParam = async(param: UpdateSequenceStepRequest["param"], value: UpdateSequenceStepRequest["value"], foreachStepUuid: string|null) => {
        if (foreachStepUuid === null) {
            return await this.updateSequenceStepParam(param, value);
        } else {
            const stepDesc = this.props.detailsStack[this.props.detailsStack.length-1];

            return await this.updateSequenceStepParam("foreach", this.updateForeachValue(stepDesc.foreach!, foreachStepUuid, value as any));
        }
    }

    private updateSequenceStepDithering = async(wanted: boolean | "once") => {
        const payload:UpdateSequenceStepDitheringRequest = {
            sequenceUid: this.props.sequenceUid,
            stepUidPath: JSON.parse(this.props.sequenceStepUidPath),
            dithering: !!wanted,
        };
        if (!!wanted) {
            payload.settings = {once : wanted === "once"};
        }

        await BackendRequest.RootInvoker("sequence")("updateSequenceStepDithering")(
            CancellationToken.CONTINUE,
            payload,
            );
    }

    private updateSequenceStepDitheringParam = async(settings: Partial<SequenceDitheringSettings>) => {
        const payload:UpdateSequenceStepDitheringRequest = {
            sequenceUid: this.props.sequenceUid,
            stepUidPath: JSON.parse(this.props.sequenceStepUidPath),
            dithering: true,
            settings,
        };

        await BackendRequest.RootInvoker("sequence")("updateSequenceStepDithering")(
            CancellationToken.CONTINUE,
            payload,
            );
    }

    private deleteStep = async() => {
        const path:string[] = JSON.parse(this.props.sequenceStepUidPath);
        await BackendRequest.RootInvoker("sequence")("deleteSequenceStep")(
            CancellationToken.CONTINUE,
            {
                sequenceUid: this.props.sequenceUid,
                stepUidPath: path.slice(0, path.length - 1),
                stepUid: path[path.length - 1]
            });
    }

    private action = async (e:React.ChangeEvent<HTMLSelectElement>)=> {
        const value = e.target.value;

        if (value === "addChild") {
            const uids = await BackendRequest.RootInvoker("sequence")("newSequenceStep")(
                CancellationToken.CONTINUE,
                {
                    sequenceUid: this.props.sequenceUid,
                    stepUidPath: JSON.parse(this.props.sequenceStepUidPath),
                });
            // set focus to new step
            this.setState({
                lastNewItem: uids[0],
                lastNewItemSerial: this.lastNewItemId,
            });
        } else if (value === "remove") {
            await this.deleteStep();
        } else {
            if (hasKey(this.state.newItems, value)) {
                return;
            }
            this.setState({
                newItems: {...this.state.newItems, [value]: true},
                lastNewItem: value,
                lastNewItemSerial: this.lastNewItemId,
            });
        }
    }

    dropParam=async (p:ParamDesc)=>{
        const id : keyof SequenceStep = p.id as any;
        if (hasKey(this.props.detailsStack[this.props.detailsStack.length-1], p.id)) {
            await this.updateSequenceStepParam(id, undefined);
        }
        if (hasKey(this.state.newItems, id)) {
            // Simply remove from newItems
            const newNewItems = {...this.state.newItems};
            delete newNewItems[id];
            this.setState({newItems: newNewItems});
        }
    }

    createForeachValue<K extends keyof SequenceStepParameters>(foreach: SequenceForeach<K>, v:SequenceStepParameters[K]):SequenceForeach<K> {
        const pid = foreach.param;
        const newUuid = uuid.v4();
        const newValue : SequenceForeachItem<K> = {
            [pid as K]: v
        } as any;
        return {
            ...foreach,
            byuuid: {
                ...foreach.byuuid,
                [newUuid]: newValue
            },
            list: [...foreach.list, newUuid]
        };
    }

    updateForeachValue<K extends keyof SequenceStepParameters>(foreach: SequenceForeach<K>, uuid: string, v:SequenceStepParameters[K]):SequenceForeach<K> {
        if (!hasKey(foreach.byuuid, uuid)) {
            throw new Error("uuid not found");
        }
        return {
            ...foreach,
            byuuid: {
                ...foreach.byuuid,
                [uuid]: {
                    ...foreach.byuuid[uuid],
                    [foreach.param]: v
                }
            }
        };
    }

    addForeachValue=async(param: ParamDesc& {id: keyof SequenceStepParameters})=> {
        const stepDesc = this.props.detailsStack[this.props.detailsStack.length-1];
        const patch:jsonpatch.OpPatch[] = [];

        let foreach;
        if (!stepDesc.foreach) {
            foreach = {
                param: param.id,
                list: [],
                byuuid: {}
            };
            foreach = this.createForeachValue(foreach, stepDesc[param.id] !== undefined ? stepDesc[param.id] : null);
            patch.push({op: 'add', path: '/' + param.id, value: null});
            patch.push({op: 'remove', path: '/' + param.id});
        } else {
            foreach = stepDesc.foreach;
        }
        foreach = this.createForeachValue(foreach, null);
        patch.push({op: 'add', path: '/foreach', value: foreach});
        
        await this.patchSequenceStepParam(patch);
    }

    dropForeachValue=async(index:number)=> {
        const stepDesc = this.props.detailsStack[this.props.detailsStack.length-1];
        if (!stepDesc.foreach) {
            return;
        }
        if (index && stepDesc.foreach.list.length <= index) {
            return;
        }

        const newForeach = {
            ...stepDesc.foreach,
            byuuid: {...stepDesc.foreach.byuuid},
            list: [...stepDesc.foreach.list]
        };

        const removedUuid = newForeach.list.splice(index, 1)[0];
        delete newForeach.byuuid[removedUuid];

        const patch:jsonpatch.OpPatch[] = [];
        if (newForeach.list.length > 1) {
            patch.push({op: 'add', path: '/foreach', value: newForeach});
        } else {
            // Convert back to single
            patch.push({op: 'remove', path: '/foreach'});
            if (newForeach.list.length) {
                patch.push({op: 'add', path: '/' + newForeach.param, value: newForeach.byuuid[newForeach.list[0]][newForeach.param]});
            }
        }

        await this.patchSequenceStepParam(patch);
    }

    private getChildList = (propsOnly?:boolean)=>{
        if ((!propsOnly) && this.state.overridenChildList) {
            return this.state.overridenChildList;
        }
        if (!this.props.detailsStack.length) {
            return undefined;
        }
        const details = this.getCurrentDetails();
        if (!details.childs) {
            return undefined;
        }
        return details.childs.list;
    }

    private moveSteps=async (param: {oldIndex:number, newIndex:number})=>{
        const {oldIndex, newIndex} = param;
        if (oldIndex == newIndex) return;

        const originalList = this.getChildList(true);
        const childList = this.getChildList(false);

        if (childList === undefined) {
            return;
        }
        console.log('currentORder is ', childList, oldIndex, newIndex);
        const newOrder = arrayMove([...childList], oldIndex, newIndex);
        console.log('newOrder is ', newOrder);
        // Update the state, then start a backoffice request
        this.setState({
                overridenChildList: newOrder,
                sourceChildList: originalList,
        });

        try {
            await BackendRequest.RootInvoker("sequence")("moveSequenceSteps")(
                CancellationToken.CONTINUE,
                {
                    sequenceUid: this.props.sequenceUid,
                    stepUidPath: JSON.parse(this.props.sequenceStepUidPath),
                    childs: newOrder,
                });

        } finally {
            this.setState({
                overridenChildList: undefined,
                sourceChildList: undefined,
            });
        }
    }

    private splittable=(param: ParamDesc)=> {
        if (!param.splittable) {
            return false;
        }
        if (this.getCurrentDetails().foreach !== undefined && this.getCurrentDetails().foreach?.param !== param.id) {
            return false;
        }
        return true;
    }

    private finishSplit=(toRemove: keyof SequenceStep, p:ForcedParams) => {
        let newItems = this.state.newItems;
        if (Object.prototype.hasOwnProperty.call(newItems, toRemove)) {
            newItems = {...newItems};
            delete newItems[toRemove];
        }
        this.setState({
            newItems: newItems,
            forcedChilds: {...this.state.forcedChilds||{}, ...p}
        });
    }

    private closeParameterSplitter=()=>{
        this.setState({parameterSplit: undefined});
    }

    

    renderType=(p:ParamDesc, settingsPath: string, foreachUuid: string|null, focusRef?: React.RefObject<any>)=> {
        return <CameraFrameTypeEditor
                        device={this.props.imagingSetup.cameraDevice || undefined}
                        focusRef={focusRef}
                        valuePath={settingsPath + '.type'}
                        setValue={(e:string)=>Utils.promiseToState(()=>this.updateIterableSequenceStepParam('type', e, foreachUuid), this)}
                        />
    }

    renderExposure=(p:ParamDesc, settingsPath: string, foreachUuid: string|null, focusRef?: React.RefObject<any>)=> {
        return <CameraExpEditor
                        device={this.props.imagingSetup.cameraDevice || undefined}
                        focusRef={focusRef}
                        valuePath={settingsPath + '.exposure'}
                        setValue={(e:number)=>Utils.promiseToState(()=>this.updateIterableSequenceStepParam('exposure', e, foreachUuid), this)}
                        />
    }

    renderIso=(p:ParamDesc, settingsPath: string, foreachUuid: string|null, focusRef?: React.RefObject<any>)=> {
        return <CameraIsoEditor
                        device={this.props.imagingSetup.cameraDevice || undefined}
                        focusRef={focusRef}
                        valuePath={settingsPath + '.iso'}
                        setValue={(e:string)=>Utils.promiseToState(()=>this.updateIterableSequenceStepParam('iso', e, foreachUuid), this)}
                        />
    }

    renderBin=(p:ParamDesc, settingsPath: string, foreachUuid: string|null, focusRef?: React.RefObject<any>)=> {
        return <CameraBinEditor
                        device={this.props.imagingSetup.cameraDevice || undefined}
                        focusRef={focusRef}
                        valuePath={settingsPath + '.bin'}
                        setValue={(e:number)=>Utils.promiseToState(()=>this.updateIterableSequenceStepParam('bin', e, foreachUuid), this)}
                        />
    }

    renderFilter=(p:ParamDesc, settingsPath: string, foreachUuid: string|null, focusRef?: React.RefObject<any>)=> {
        return <FilterSelector
                        filterWheelDevice={this.props.imagingSetup.filterWheelDevice || undefined}
                        focusRef={focusRef}
                        setFilter={async(filterWheelDeviceId:string|null, filterId: string|null)=>{
                            if (filterId === null && filterWheelDeviceId !== null) {
                                return;
                            }
                            await this.updateIterableSequenceStepParam('filter', filterId, foreachUuid);
                        }}
                        getFilter={(store)=>atPath(store, settingsPath + ".filter") || null}
                    />
    }

    private ditheringDetailsModal = React.createRef<Modal>();

    renderDithering=(p:ParamDesc, settingsPath: string, foreachUuid: string|null, focusRef?: React.RefObject<any>)=> {
        const val = this.props.detailsStack[this.props.detailsStack.length-1].dithering;

        return <>
            <select
                        value={val === undefined ? "" : val === null ? "false" : (val.once ? "once" : "true" ) }
                        ref={focusRef}
                        onChange={
                            (e: React.ChangeEvent<HTMLSelectElement>)=> Utils.promiseToState(
                                        ()=>this.updateSequenceStepDithering(e.target.value === "once" ? "once" : e.target.value === 'true'), this)
                        }>
                    <option value="" disabled hidden>Choose...</option>
                    <option value="true">On</option>
                    <option value="once">Once</option>
                    <option value="false">Off</option>
            </select>
            <input type="button" value="..." disabled={!val} onClick={()=>{
                const c = this.ditheringDetailsModal.current;
                if (c) c.open();
            }}/>
        </>;
    }

    renderDitheringDetails=(p:ParamDesc, settingsPath: string, focusRef?: React.RefObject<any>)=> {
        const val = this.props.detailsStack[this.props.detailsStack.length-1].dithering;
        return !!val
                ?<Modal ref={this.ditheringDetailsModal}>
                    <DitheringSettingEdit settings={val} update={
                            ({field, value})=> Utils.promiseToState(
                                ()=>this.updateSequenceStepDitheringParam({[field]: value}), this)
                        }/>
                </Modal>
                : null
    }

    renderRepeat=(p:ParamDesc, settingsPath: string, foreachUuid: string|null, focusRef?: React.RefObject<any>)=> {
        const valnum = this.props.detailsStack[this.props.detailsStack.length-1].repeat;
        
        if (valnum === undefined || (valnum >= 2 && valnum <= 10)) {
            return (
                <select value={valnum || ""}
                        ref={focusRef}
                        onChange={
                            (e: React.ChangeEvent<HTMLSelectElement>)=> Utils.promiseToState(
                                        ()=>this.updateSequenceStepParam('repeat', parseInt(e.target.value)), this)
                        }>
                    <option value="" disabled hidden>Choose...</option>
                    <option value="2">2x</option>
                    <option value="3">3x</option>
                    <option value="4">4x</option>
                    <option value="5">5x</option>
                    <option value="6">6x</option>
                    <option value="7">7x</option>
                    <option value="8">8x</option>
                    <option value="9">9x</option>
                    <option value="10">10x</option>
                    <option value="11">More...</option>
                </select>
            );
        } else {
            let valstr = (valnum === undefined ? "" : "" + valnum);

            return <TextEdit
                        value={valstr}
                        focusRef={focusRef}
                        onChange={(e:string)=> Utils.promiseToState(()=>this.updateSequenceStepParam('repeat', parseInt(e)), this)}/>
        }
    }

    componentDidUpdate() {
        const e = this.lastNewItemRef.current;
        if (e) {
            e.scrollIntoView({behavior: "smooth",
                    // Soon to be released option
                    scrollMode: 'if-needed',
                    block: 'nearest',
                    inline: 'nearest',
            } as any);

            const focus = this.lastNewItemFocusRef.current;
            if (focus) {
                focus.focus();
            }

            // Make sure that the next render will not set lastNewItemRef
            this.lastNewItemId++;
        }
    }

    private isItemAvailable(item:ParamDesc) {
        if (item.available) {
            return item.available(this.props.cameraCapacity, this.props.detailsStack)
        }
        return true;
    }

    render() {
        if (this.props.detailsStack.length === 0) {
            return null;
        }
        const details = this.getCurrentDetails();

        let settingsPath = 'backend.sequence.sequences.byuuid[' + JSON.stringify(this.props.sequenceUid) + '].root';
        for(const uid of JSON.parse(this.props.sequenceStepUidPath)) {
            settingsPath += ".childs.byuuid[" + JSON.stringify(uid) + "]";
        }

        const renderSingle = (param:ParamDesc)=>{
            if (param.hidden || !param.render
                    || (!hasKey(details || {}, param.id)
                                && (details.foreach?.param !== param.id)
                                && !hasKey(this.state.newItems, param.id))) {
                return null;
            }
            const isTheLastNew = (param.id === this.state.lastNewItem) && (this.state.lastNewItemSerial == this.lastNewItemId);
            const moreThanOne = details.foreach?.param === param.id && details.foreach.list?.length > 1;

            const renderer = param.render(this);

            return (<React.Fragment key={param.id}>
                <div className="SequenceStepProperty" key={param.id}>
                    <span className="SequenceStepPropertyTitle">{moreThanOne ? "Iterate" : ""} {param.title}:</span>
                        {details.foreach?.param !== param.id
                            ?
                                <span>
                                        {renderer(param, settingsPath, null, isTheLastNew ? this.lastNewItemFocusRef : undefined)}

                                        <input type="button"
                                            className="SequenceStepParameterDropBton"
                                            value={"X"}
                                            onClick={()=>Utils.promiseToState(()=>this.dropParam(param), this)}/>

                                </span>
                            :
                                (details.foreach.list || []).map((uuid, index)=>
                                    <span key={uuid}>
                                        {renderer(param, settingsPath+".foreach.byuuid[" +  JSON.stringify(uuid) + "]", uuid, undefined)}
                                        <input type="button"
                                            className="SequenceStepParameterDropBton"
                                            value={"X"}
                                            onClick={()=>Utils.promiseToState(()=>this.dropForeachValue(index), this)}/>

                                    </span>
                                )
                        }
                        {
                            this.splittable(param) && param.id !== "childs" && param.id !== "foreach" && param.id !== "repeat"
                                ?
                                    <input type="button"
                                        className="SequenceStepParameterAddBton"
                                        value={"+"}
                                        onClick={()=>Utils.promiseToState(()=>this.addForeachValue(param as ParamDesc & {id: keyof SequenceStepParameters}), this)}/>
                                : null
                        }
                </div>
                {param.renderMore ? param.renderMore(this)(param, settingsPath): null}
            </React.Fragment>);
        }

        const displayParameters = parameters.map((group)=>group.childs).flat();
        // Display the foreach last (in case a repeat is here)
        if (hasKey(details, 'repeat') && hasKey(details, 'foreach')) {
            // Move repeat just above foreach parameter
            const paramId = displayParameters.map(param=>param.id).indexOf(details.foreach!.param);
            if (paramId !== -1) {
                const foreach = displayParameters.splice(paramId, 1)[0];
                displayParameters.push(foreach);
            }
        }

        return <div ref={this.props.bodyRef}>
            {this.state.parameterSplit !== undefined
                ? <SequenceStepParameterSplitter
                        imagingSetup={this.props.imagingSetup}
                        imagingSetupId={this.props.imagingSetupId}
                        sequenceUid={this.props.sequenceUid}
                        sequenceStepUidPath={this.props.sequenceStepUidPath}
                        parameter={this.state.parameterSplit}
                        onSplit={this.finishSplit}
                        onClose={this.closeParameterSplitter}/>
                : null
            }

            {displayParameters.map((param)=>renderSingle(param))}

            <select ref={this.props.focusRef} value="" onChange={(e)=>Utils.promiseToState(()=>this.action(e), this)} placeholder="More...">
                <option value="" disabled hidden>More...</option>
                {
                    parameters.map(
                        group=> {
                            const items = group.childs.map(
                                item=>(
                                    (!hasKey(details || {}, item.id)) && (!hasKey(this.state.newItems, item.id) && this.isItemAvailable(item))
                                        ? <option key={item.id} value={item.id}>{item.title}</option>
                                        : null
                                )
                            )

                            return items.some((e)=>e!==null)
                                ? <optgroup key={group.id} label={group.title}>{items}</optgroup>
                                : null
                        }
                    )
                }
            </select>
            {details.childs !== undefined
                ?
                <SortableList
                    sequenceUid={this.props.sequenceUid}
                    forcedParams={this.state.forcedChilds||{}}
                    items={this.state.overridenChildList||details.childs.list}
                    imagingSetup={this.props.imagingSetup}
                    imagingSetupId={this.props.imagingSetupId}
                    cameraCapacity={this.props.cameraCapacity}
                    parentPath={this.props.sequenceStepUidPath}
                    onSortEnd={this.moveSteps}
                    pressDelay={200}
                    helperClass="sortableHelper"
                    lastNewItem={(this.state.lastNewItemSerial == this.lastNewItemId) ? this.state.lastNewItem: undefined}
                    lastNewItemRef={(this.state.lastNewItemSerial == this.lastNewItemId) ? this.lastNewItemRef: undefined}
                    lastNewItemFocusRef={(this.state.lastNewItemSerial == this.lastNewItemId) ? this.lastNewItemFocusRef: undefined}
                    />
                : null
            }
        </div>
    }

    static getDerivedStateFromProps(newProps:Props, state:State) {
        const ret: Partial<State> = {};

        if (newProps.forcedParamUid && newProps.forcedParamUid !== state.lastForcedParamUid) {
            // Force one childs (first render)
            ret.lastForcedParam = newProps.forcedParam;
            ret.lastForcedParamUid = newProps.forcedParamUid;
            ret.newItems = {...state.newItems, [newProps.forcedParam!]: true };
        }

        if (state.overridenChildList) {
            let p;
            if (newProps.detailsStack && newProps.detailsStack.length) {
                p = newProps.detailsStack[newProps.detailsStack.length - 1];
            }
            if ((p === undefined) || (!p.childs) || (!Utils.isArrayEqual(p.childs.list, state.sourceChildList))) {
                ret.overridenChildList = undefined;
                ret.sourceChildList = undefined;
            }
        }

        return ret;
    }


    static mapStateToProps=()=>{
        const empty:[] = [];
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
                return empty;
            }
        }
        const detailsStackMem = ArrayReselect.createArraySelector(detailsStackFn);
        return (store:Store.Content, ownProps:InputProps)=> ({
            detailsStack: detailsStackFn(store, ownProps)
        })
    }
}

export {SequenceStepEdit};

const MappedSequenceStepEdit = Store.Connect(SequenceStepEdit);
export default MappedSequenceStepEdit;
