

// Generate id that are alphabetically sorted
export class IdGenerator {
    private value: string;

    constructor(from = "00000000")
    {
        this.value = from;
    }


    current() {
        return this.value;
    }

    next() {

        function inc(str:string, at:number)
        {
            var c = str.charCodeAt(at);
            if (c >= 48 && c < 48 + 9) {
                c++;
            } else if (c == 48 + 9) {
                // 'A'
                c = 65;
            } else if (c >= 65 && c < 90) {
                c++;
            } else {
                // Z => back to 0, with inc
                if (at == 0) {
                    throw new Error("Id overflow !");
                }
                str = inc(str, at - 1);
                c = 48;
            }
            str = str.substr(0,at) + String.fromCharCode(c) + str.substr(at + 1);
            return str;
        }

        this.value = inc(this.value, this.value.length - 1);
        return this.value;
    }

    // Regenerate ids of the given list (order preserved)
    renumber<T>(list: Array<string>, byuuid: {[id:string]:T})
    {
        const newIds : Array<string|undefined> = [];
        const newIdsSet : Set<string> = new Set();
        let nextIds : Array<string> = [];
        for(let i = 0; i < list.length; ++i) {
            newIds[i] = undefined;
            const id = this.next();
            nextIds.push(id);
            newIdsSet.add(id);
        }

        // Recycle any known entries
        for(let i = 0; i < list.length; ++i) {
            if (newIdsSet.has(list[i])) {
                newIds[i] = list[i];
                newIdsSet.delete(list[i]);
            }
        }

        // Now associate other entries
        nextIds = nextIds.filter(e=>newIdsSet.has(e!));
        let nextIdsI = 0;
        for(let i = 0; i < list.length; ++i) {
            if (newIds[i] === undefined) {
                newIds[i] = nextIds[nextIdsI++];
            }
        }

        // No list=>newIds either change to new, or reuse
        for(let i = 0; i < list.length; ++i) {
            const prevId = list[i];
            const newId = newIds[i]!;
            if (newId === prevId) {
                continue;
            }
            const o = byuuid[prevId];
            delete byuuid[prevId];
            byuuid[newId] = o;
            list[i] = newId;
        }
    }
}
