import update from 'immutability-helper';

function hasKey(obj:object, key:string) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function isObject(item:any) {
    return (item !== null && item !== undefined && typeof item === 'object' && !Array.isArray(item));
}

function mergeDeep(target : any, source: any) {
    let output = target;
    let forked = false;
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            const sourceValue = source[key];
            if (isObject(sourceValue)) {
                if (!hasKey(target, key)) {
                    if (!forked) {
                        forked = true;
                        output = Object.assign({}, output);
                    }
                    output[key] = deepCopy(sourceValue);

                } else {
                    const oldValue = target[key];
                    const newValue = mergeDeep(oldValue, sourceValue);
                    if (oldValue !== newValue) {
                        if (!forked) {
                            forked = true;
                            output = Object.assign({}, output);
                        }
                        output[key] = newValue;
                    }
                }
            } else {
                const oldValue = target[key];
                const newValue = deepCopy(sourceValue);
                if (oldValue !== newValue) {
                    if (!forked) {
                        forked = true;
                        output = Object.assign({}, output);
                    }
                    output[key] = newValue;
                }
            }
        });
    } else {
        // Don't merge array
        output = deepCopy(source);
    }
    return output;
}

function deepCopy<T>(object:T):T
{
    if (isObject(object)) {
        const result : any = {};
        for(const k of Object.keys(object)) {
            result[k] = deepCopy((object as any)[k]);
        }
        return result;
    } else if (Array.isArray(object)) {
        const result:any = [];
        for(let i = 0; i < object.length; ++i) {
            result[i] = deepCopy(object[i]);
        }
        return result;
    } else {
        return object;
    }
}

function deepEqual(o1:any, o2:any)
{
    if (o1 === o2) {
        return true;
    }
    const o1obj = isObject(o1);
    if (o1obj !== isObject(o2)) {
        return false;
    }
    if (o1obj) {
        // Two objects
        for(const k of Object.keys(o1))
        {
            if (!Object.prototype.hasOwnProperty.call(o2, k)) {
                return false;
            }
            if (!deepEqual(o1[k], o2[k])) {
                return false;
            }
        }
        for(const k of Object.keys(o2)) {
            if (!Object.prototype.hasOwnProperty.call(o1, k)) {
                return false;
            }
        }
        return true;
    } else if (Array.isArray(o1) && Array.isArray(o2)) {
        if (o1.length !== o2.length) {
            return false;
        }
        for(let i = 0; i < o1.length; ++i) {
            if (!deepEqual(o1[i], o2[i])) {
                return false;
            }
        }
        return true;
    } else {
        // o1 !== o2 (first line)
        return false;
    }
}

update.extend('$mergedeep', (value, object) => {
    return mergeDeep(object, value);
});

export function getOwnProp<T>(o: {[id: string]: T}, s: string):T|undefined;
export function getOwnProp<T>(o: {[id: string]: T}|undefined|null, s: string):T|undefined;
export function getOwnProp<T>(o: {[id: string]: T}, s: undefined|null):undefined;
export function getOwnProp<T>(o: {[id: string]: T}|undefined|null, s: string|undefined|null):T|undefined;
export function getOwnProp<T>(o: undefined|null, s: any):undefined;

export function getOwnProp(o: any, s: any) {
    if (s === null || s === undefined) {
        return undefined;
    }
    if (hasKey(o, s)) {
        return o![s];
    }
    return undefined;
}

export { hasKey, mergeDeep, update, deepCopy, deepEqual, isObject };