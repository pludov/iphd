import { createSelectorCreator, defaultMemoize } from 'reselect'

function swallowEqual(obj1 : any, obj2: any) {
    if (obj1 === obj2) {
       return true;
    }
    if (Array.isArray(obj1) || Array.isArray(obj2)) {
        return false;
    }

    for(const k1 of Object.keys(obj1)) {
        if (!Object.prototype.hasOwnProperty.call(obj2, k1)) {
            return false;
        }
        if (obj1[k1] !== obj2[k1])
            return false;
    }

    for(const k2 of Object.keys(obj2)) {
        if (!Object.prototype.hasOwnProperty.call(obj1, k2)) {
            return false;
        }
    }

    return true;
}


const objectSelectorCreator = createSelectorCreator(
    defaultMemoize,
    swallowEqual
);

// Perform swallow equality on result
function createObjectSelector<State,Optional,Result>(selector: (state:State, arg?:Optional)=>Result):(state:State,arg?:Optional)=>Result
{
    return objectSelectorCreator(
        [selector],
        (a:any)=>a);
}

export default {createObjectSelector};

