import * as Actions from "./Actions";
import * as Store from "./Store";
import * as Utils from "./Utils";

export type SequenceStoreContent = {
    currentSequence: string|undefined;
    editingSequence: string|undefined;
    currentImage: string|undefined;
    currentImageAutoSelectSerial?: number;
    currentIsLast?: boolean;
}

export type Content = {
    sequence: SequenceStoreContent;
}


function adjuster(store:Store.Content):Store.Content {
    if (store.backend.sequence !== undefined) {
        const currentSequence = store.sequence.currentSequence;

        // FIXME: choose the first one ?
        if (currentSequence !== undefined && !Utils.has(store.backend.sequence.sequences.byuuid, currentSequence)) {
            store = {
                ...store,
                sequence: {
                    ...store.sequence,
                    currentSequence: undefined
                }
            }
        }

        const editingSequence = store.sequence.editingSequence;

        if (editingSequence !== undefined && !Utils.has(store.backend.sequence!.sequences.byuuid, editingSequence)) {
            store = {
                ...store,
                sequence: {
                    ...store.sequence,
                    editingSequence: undefined
                }
            }
        }
    }

    if (store.sequence.currentIsLast && store.sequence.currentSequence !== undefined && store.backend.sequence !== undefined) {
        const currentSequence = store.sequence.currentSequence;

        const sequence = Utils.getOwnProp(store.backend.sequence.sequences.byuuid, currentSequence);
        if (sequence !== undefined && sequence.images.length) {
            const lastImage = sequence.images[sequence.images.length - 1];
            if (lastImage !== store.sequence.currentImage) {
                store = {
                    ...store,
                    sequence: {
                        ...store.sequence,
                        currentImage: lastImage,
                        currentImageAutoSelectSerial: (store.sequence.currentImageAutoSelectSerial||0) + 1,
                    }
                }
            }
        }
    }

    return store;
}

const setCurrentImage=(state: Store.Content, payload: {image: string})=>{
    if (state.sequence.currentImage === payload.image) {
        return state;
    }
    const currentSequence = state.sequence.currentSequence;

    let currentIsLast = false;
    const sequence = Utils.getOwnProp(state.backend.sequence?.sequences.byuuid, currentSequence);
    if (sequence) {
        if (sequence.images.length && payload.image === sequence.images[sequence.images.length - 1]) {
            currentIsLast = true;
        }
    }

    return {
        ...state,
        sequence: {
            ...state.sequence,
            currentImage: payload.image,
            currentIsLast
        }
    }
}

const setCurrentSequence=(state: Store.Content, payload: {sequence: string})=>{
    if (state.sequence.currentSequence === payload.sequence) {
        return state;
    }
    
    return {
        ...state,
        sequence: {
            ...state.sequence,
            currentSequence: payload.sequence,
            currentImage: undefined,
            currentIsLast: true,
        }
    }
}

const setEditingSequence=(state: Store.Content, payload: {sequence: string|undefined})=>{
    if (state.sequence.editingSequence === payload.sequence) {
        return state;
    }
    
    return {
        ...state,
        sequence: {
            ...state.sequence,
            editingSequence: payload.sequence,
        }
    }
}

const actions = {
    setCurrentImage,
    setCurrentSequence,
    setEditingSequence,
}

export type SequenceActions = typeof actions;

Actions.register<SequenceActions>(actions);

export const initialState:Content = {
    sequence: {
        currentImage: undefined,
        currentSequence: undefined,
        editingSequence: undefined,
        currentImageAutoSelectSerial: undefined,
        currentIsLast: true,
    }
}

export function onImport(t:Content) {
    t.sequence = t.sequence || {};
    t.sequence.currentImage = t.sequence.currentImage || undefined;
    t.sequence.currentSequence = t.sequence.currentSequence|| undefined;
    t.sequence.editingSequence = t.sequence.editingSequence || undefined;
}

// Swallow copy of the store. Do not inplace modify childs
export function onExport(t:Content) {
}

export function adjusters() {
    return [
        adjuster
    ]
};
