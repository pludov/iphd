import ObjectReselect from './ObjectReselect';


describe("ObjectReselect", ()=> {
    it('is ok', () => {
        const objectSelector = ObjectReselect.createObjectSelector<any,void,any>(
            (arr:Array<any>)=>{
                const ret:any = {a: arr[0], b:arr[1]};
                if (arr.length === 3) {
                    ret.c = arr[2];
                }
                return ret;
            }
        );

        const objA = {a: 1};
        const objB = {b: 1};
        const objC = {c: 1};

        const r1 = objectSelector([objA, objB], undefined);
        expect(r1.a).toBe(objA);
        expect(r1.b).toBe(objB);

        const r2 = objectSelector([objA, objB], undefined);
        expect(r1).toBe(r2);

        const r3 = objectSelector([objA, objB, objC], undefined);
        expect(r3).not.toBe(r1);
        expect(r3.a).toBe(objA);
        expect(r3.b).toBe(objB);
        expect(r3.c).toBe(objC);
    });
});