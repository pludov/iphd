import {SequenceStepEdit} from "./SequenceStepEdit";
import * as Store from '../Store';
import * as IndiManagerStore from "../IndiManagerStore";
import * as FilterWheelStore from "../FilterWheelStore";
import { deepEqual } from '../shared/Obj';
import { SequenceStep } from '@bo/BackOfficeStatus';

export type CameraCapacity = {
    iso?: boolean;
    bin?: boolean;
    filter?: boolean;
};

export type ParamDesc = {
    id: string;
    title: string;
    splittable?: boolean;
    hidden?: boolean;
    render?:(s:SequenceStepEdit)=>((p: ParamDesc, settingsPath: string, foreachUuid: string|null, focusRef?: React.RefObject<HTMLBaseElement>)=>JSX.Element|null);
    renderMore?:(s:SequenceStepEdit)=>((p: ParamDesc, settingsPath: string)=>JSX.Element|null);
    // TODO : move CameraCapacity within imagingSetup
    available?: (cap:CameraCapacity, detailsStack: SequenceStep[])=>boolean;
    capacity?: (camera: string, s:Store.Content)=>Partial<CameraCapacity>;
}

export type GroupDesc = {
    id: string;
    title: string;
    childs: ParamDesc[];
};

function cameraIndiVectorCapacity(vec: string, k: keyof CameraCapacity) {
    return (camera:string, s:Store.Content):Partial<CameraCapacity> => {
        const vector = IndiManagerStore.getVector(s, camera, vec);
        return {
            [k]: vector !== null
        }
    }
}

export const parameters:GroupDesc[] = [
    {
        id: "camera",
        title: "Camera",
        childs: [
            {
                id: "type",
                title: "Frame type",
                splittable: true,
                render: (s)=>s.renderType,
            },
            {
                id: "exposure",
                title: "Exp",
                splittable: true,
                render: (s)=>s.renderExposure,
            },
            {
                id: "iso",
                title: "ISO",
                splittable: true,
                render: (s)=>s.renderIso,
                capacity: cameraIndiVectorCapacity('CCD_ISO', 'iso'),
                available: (cap)=>!!cap.iso,

            },
            {
                id:"bin",
                title: "BIN",
                splittable: true,
                render: (s)=>s.renderBin,
                capacity: cameraIndiVectorCapacity('CCD_BINNING', 'bin'),
                available: (cap)=>!!cap.bin,
            },
            {
                id: "filter",
                title: "Filter",
                splittable: true,
                render: (s)=>s.renderFilter,
                capacity: (cam, store)=>({filter: FilterWheelStore.hasFilterWheel(store)}),
                available: (cap)=>!!cap.filter,
            },
        ]
    },
    {
        id: "guider",
        title: "Guider",
        childs: [
            {
                id: "dithering",
                title: "Dithering",
                splittable: false,
                render: (s)=>s.renderDithering,
                renderMore: (s)=>s.renderDitheringDetails,
            },
        ]
    },
    {
        id: "control",
        title: "Flow Control",

        childs: [
            {
                id: "repeat",
                title: "Repeat",
                splittable: false,
                render: (s)=>s.renderRepeat,
            },
            {
                id: "addChild",
                title: "Add child",
                splittable: false,
                hidden: true,
                available: (cap, stack)=> stack.length < 5
            },
            {
                id: "remove",
                title: "Remove",
                splittable: false,
                hidden: true,
                available: (cap, stack)=>
                        // Don't remove root
                        (stack.length > 1)
                        // Don't remove parent
                        && !(stack[stack.length - 1].childs && stack[stack.length - 1].childs!.list.length)
                        // Don't remove non empty
                        && (Object.keys(stack[stack.length - 1]).filter(e=>e!="childs").length == 0)
            }
        ]
    }
];

export function cameraCapacityReselect() {
    let previous: CameraCapacity = {};
    return (s:Store.Content, camera:string)=> {
        const ret: CameraCapacity = {};
        for(const g of parameters) {
            for(const p of g.childs) {
                if (p.capacity) {
                    Object.assign(ret, p.capacity(camera, s));
                }
            }
        }
        if (deepEqual(previous, ret)) {
            return previous;
        }
        previous = ret;
        return ret;
    }
}