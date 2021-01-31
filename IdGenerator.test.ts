import { expect } from 'chai';
import 'mocha';

import {IdGenerator} from './IdGenerator';

describe("Direct result propagation", ()=> {
    it('should return ascending id sequence', ()=> {
        const gen = new IdGenerator();
        let previous = undefined;
        for(let i = 0; i < 512; ++i)
        {
            let value = gen.current();
            if (i > 0) {
                expect(value > previous!).to.eq(true, 'id must increase!');
            }
            previous = value;
            gen.next();
        }
    });

    it('increments first digit after 36 values', ()=>{
        const gen = new IdGenerator();
        for(let i = 0; i < 36; ++i)
        {
            let value = gen.current();
            gen.next();
            expect(value.substr(0, value.length - 1).replace(/^0+/, '')).to.eq('', 'Only zero before 36');
        }
        let value = gen.current();
        expect(value.replace(/0+/g, '0')).to.eq('010', 'Only zero before 36');

    });

    it('renumber', ()=>{
        const gen = new IdGenerator();

        const keys = [ '00000009', '00000003', '00000001', '00000007', '00000008' ];
        const byuuid:{[id:string]:string} = {};
        for(const k of keys) {
            byuuid[k] = k;
        }
        gen.renumber(keys, byuuid);
        expect(byuuid).to.deep.equal({
            "00000002": "00000009",
            "00000003": "00000003",
            "00000001": "00000001",
            "00000004": "00000007",
            "00000005": "00000008",
        });

        expect(keys).to.deep.equal(['00000002', '00000003', '00000001', '00000004', '00000005' ]);
    });
});
