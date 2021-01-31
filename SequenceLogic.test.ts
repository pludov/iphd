import "source-map-support/register";
import { expect, assert } from 'chai';

import { Sequence } from "./shared/BackOfficeStatus";
import { SequenceLogic } from "./SequenceLogic";

function uuidMock() {
    let v = 0;
    
    return ()=>{
        return (v++).toString(16).padStart(8, '0');
    }
}

describe("SequenceLogic", () => {
    it("Single step with repeat", () => {
        const sequence: Sequence = {
            status: "idle",
            progress: null,
            
            title: "Test sequence",
            imagingSetup: "imaging_setup_id",
            errorMessage: null,
            
            stepStatus: {},
            root: {
                exposure: 10,
                bin: 1,
                repeat: 2,
            },
            
            // uuids of images
            images: [],
            imageStats: {},
        }
        
        const logic:SequenceLogic = new SequenceLogic(sequence, uuidMock());
        let nextStep = logic.getNextStep();
        let nextStepParams;

        // Check parameters are exactly one
        assert.deepStrictEqual(nextStep, [
            {
                "status": {
                    "currentForeach": null,
                    "finishedForeach": null,
                    "execUuid": "00000000",
                    "finishedLoopCount": 0,
                    "parentExecUuid": null,
                },
                "step": {
                    "bin": 1,
                    "exposure": 10,
                    "repeat": 2,
                }
            }
        ],
        "First status");

        nextStepParams = logic.getParameters(nextStep!);
        assert.deepStrictEqual(nextStepParams, {
            bin: 1,
            exposure: 10,
        });

        logic.finish(nextStep![nextStep!.length - 1]);

        nextStep = logic.getNextStep();
        assert.deepStrictEqual(nextStep, [
            {
                "status": {
                    "currentForeach": null,
                    "finishedForeach": null,
                    "execUuid": "00000001",
                    "finishedLoopCount": 1,
                    "parentExecUuid": null,
                },
                "step": {
                    "bin": 1,
                    "exposure": 10,
                    "repeat": 2,
                }
            }
        ]
        , "Second status");

        nextStepParams = logic.getParameters(nextStep!);
        assert.deepStrictEqual(nextStepParams, {
            bin: 1,
            exposure: 10,
        });

        logic.finish(nextStep![nextStep!.length - 1]);

        nextStep = logic.getNextStep();
        assert.deepStrictEqual(nextStep, undefined);
    });
    
    it("repeat with two childs", () => {
        const sequence: Sequence = {
            status: "idle",
            progress: null,
            
            title: "Test sequence",
            imagingSetup: "imaging_setup_id",
            errorMessage: null,
            
            stepStatus: {},
            root: {
                exposure: 10,
                repeat: 2,
                childs: {
                    list: [ "aaaa", "bbbb" ],
                    byuuid: {
                        "aaaa": {
                            bin: 2
                        },
                        "bbbb": {
                            bin: 4
                        }
                    }
                }
            },
            
            // uuids of images
            images: [],
            imageStats: {},
        }
        
        
        const logic:SequenceLogic = new SequenceLogic(sequence, uuidMock());
        let nextStep = logic.getNextStep();
        let nextStepParams;
        
        // Check parameters are exactly one
        assert.notStrictEqual(nextStep, undefined);
        assert.equal(nextStep!.length, 2);
        assert.deepStrictEqual(nextStep!.map(e=>e.status),
        [
            {
                "currentForeach": null,
                "finishedForeach": null,
                "execUuid": "00000000",
                "finishedLoopCount": 0,
                "parentExecUuid": null,
                "activeChild": "aaaa",
            },
            {
                "currentForeach": null,
                "finishedForeach": null,
                "execUuid": "00000001",
                "finishedLoopCount": 0,
                "parentExecUuid": "00000000",
            }
        ]);
        assert.strictEqual(nextStep![1].step, sequence.root.childs!.byuuid.aaaa);
        
        nextStepParams = logic.getParameters(nextStep!);

        assert.deepStrictEqual(nextStepParams, {
            exposure: 10,
            bin: 2,
        });

        logic.finish(nextStep![nextStep!.length - 1]);
        
        nextStep = logic.getNextStep();
        assert.notStrictEqual(nextStep, undefined);
        assert.equal(nextStep!.length, 2);
        assert.deepStrictEqual(nextStep!.map(e=>e.status),
        [
            {
                "currentForeach": null,
                "finishedForeach": null,
                "execUuid": "00000000",
                "finishedLoopCount": 0,
                "parentExecUuid": null,
                "activeChild": "bbbb",
            },
            {
                "currentForeach": null,
                "finishedForeach": null,
                "execUuid": "00000003",
                "finishedLoopCount": 0,
                "parentExecUuid": "00000000",
            }
        ]);
        assert.strictEqual(nextStep![1].step, sequence.root.childs!.byuuid.bbbb);
        
        nextStepParams = logic.getParameters(nextStep!);

        assert.deepStrictEqual(nextStepParams, {
            bin: 4,
            exposure: 10,
        });

        logic.finish(nextStep![nextStep!.length - 1]);
        
        nextStep = logic.getNextStep();
        assert.notStrictEqual(nextStep, undefined);
        assert.equal(nextStep!.length, 2);
        assert.deepStrictEqual(nextStep!.map(e=>e.status),
        [
            {
                "currentForeach": null,
                "finishedForeach": null,
                "execUuid": "00000005",
                "finishedLoopCount": 1,
                "parentExecUuid": null,
                "activeChild": "aaaa",
            },
            {
                "currentForeach": null,
                "finishedForeach": null,
                "execUuid": "00000006",
                "finishedLoopCount": 0,
                "parentExecUuid": "00000005",
            }
        ]);
        assert.strictEqual(nextStep![1].step, sequence.root.childs!.byuuid.aaaa);
        
        nextStepParams = logic.getParameters(nextStep!);

        assert.deepStrictEqual(nextStepParams, {
            bin: 2,
            exposure: 10,
        });


        logic.finish(nextStep![nextStep!.length - 1]);
        
        nextStep = logic.getNextStep();
        assert.notStrictEqual(nextStep, undefined);
        assert.equal(nextStep!.length, 2);
        assert.deepStrictEqual(nextStep!.map(e=>e.status),
        [
            {
                "currentForeach": null,
                "finishedForeach": null,
                "execUuid": "00000005",
                "finishedLoopCount": 1,
                "parentExecUuid": null,
                "activeChild": "bbbb",
            },
            {
                "currentForeach": null,
                "finishedForeach": null,
                "execUuid": "00000008",
                "finishedLoopCount": 0,
                "parentExecUuid": "00000005",
            }
        ]);
        assert.strictEqual(nextStep![1].step, sequence.root.childs!.byuuid.bbbb);

        nextStepParams = logic.getParameters(nextStep!);

        assert.deepStrictEqual(nextStepParams, {
            bin: 4,
            exposure: 10,
        });

        logic.finish(nextStep![nextStep!.length - 1]);
        
        nextStep = logic.getNextStep();
        assert.strictEqual(nextStep, undefined);
    });

    it("simple foreach ", () => {
        // Really RGB, RGB, RGB
        const sequence: Sequence = {
            status: "idle",
            progress: null,
            
            title: "Test sequence",
            imagingSetup: "imaging_setup_id",
            errorMessage: null,
            
            stepStatus: {},
            root: {
                exposure: 10,
                repeat: 3,
                childs: {
                    list: [ "aaaa" ],
                    byuuid: {
                        "aaaa": {
                            foreach: {
                                param: "filter",
                                list: [
                                    "aaa",
                                    "bbb",
                                    "ccc"
                                ],
                                byuuid: {
                                    "aaa": { filter: "red" },
                                    "bbb": { filter: "green"},
                                    "ccc": { filter: "blue"},
                                }
                            }
                        }
                    }
                }
            },
            
            // uuids of images
            images: [],
            imageStats: {},
        }
        
        
        const logic:SequenceLogic = new SequenceLogic(sequence, uuidMock());
        const uuidNext = uuidMock();

        let nextStep : ReturnType<typeof logic.getNextStep>;
        let nextStepParams;
        
        const filters = [ "red", "green", "blue"];
        const filterUuids = [ "aaa", "bbb", "ccc"];
        let execCount = 0;
        for(let repeat of [0, 1, 2]) {
            const uuidParent = uuidNext();
            for(let filterPos = 0; filterPos < filters.length; ++filterPos) {

                const filter = filters[filterPos];
                const filterUuid = filterUuids[filterPos];
                
                nextStep = logic.getNextStep();
                
                // Check parameters are exactly one
                assert.notStrictEqual(nextStep, undefined);
                assert.equal(nextStep!.length, 2);
                assert.deepStrictEqual(nextStep!.map(e=>e.status),
                [
                    {
                        "currentForeach": null,
                        "finishedForeach": null,
                        "execUuid": uuidParent,
                        "finishedLoopCount": repeat,
                        "parentExecUuid": null,
                        "activeChild": "aaaa",
                    },
                    {
                        "currentForeach": filterUuid,
                        "finishedForeach": filterUuids.slice(0, filterPos).reduce((acc:any, value:string)=>{ acc[value] = true;return acc}, {}),
                        "execUuid": uuidNext(),
                        "finishedLoopCount": 0,
                        "parentExecUuid": uuidParent,
                    }
                ], `step ${repeat} with ${filter}`);
                assert.strictEqual(nextStep![1].step, sequence.root.childs!.byuuid.aaaa);
                
                nextStepParams = logic.getParameters(nextStep!);

                assert.deepStrictEqual(nextStepParams, {
                    filter: filter,
                    exposure: 10,
                }, `step ${repeat} with ${filter}`);

                logic.finish(nextStep![nextStep!.length - 1]);
            }
            uuidNext();
        }

        nextStep = logic.getNextStep();
        assert.strictEqual(nextStep, undefined);
    });

    it("foreach & repeat with two childs", () => {
        const sequence: Sequence = {
            status: "idle",
            progress: null,
            
            title: "Test sequence",
            imagingSetup: "imaging_setup_id",
            errorMessage: null,
            
            stepStatus: {},
            root: {
                exposure: 10,
                repeat: 2,
                foreach: {
                    param: "filter",
                    list: [
                        "aaa",
                        "bbb",
                        "ccc"
                    ],
                    byuuid: {
                        "aaa": { filter: "red" },
                        "bbb": { filter: "green"},
                        "ccc": { filter: "blue"},
                    }
                },
                childs: {
                    list: [ "aaaa", "bbbb" ],
                    byuuid: {
                        "aaaa": {
                            bin: 2
                        },
                        "bbbb": {
                            bin: 4
                        }
                    }
                }
            },
            
            // uuids of images
            images: [],
            imageStats: {},
        }
        
        
        const logic:SequenceLogic = new SequenceLogic(sequence, uuidMock());
        const uuidNext = uuidMock();

        let nextStep : ReturnType<typeof logic.getNextStep>;
        let nextStepParams;
        
        const filters = [ "red", "green", "blue"];
        const filterUuids = [ "aaa", "bbb", "ccc"];
        let execCount = 0;
        for(let repeat of [0, 1]) {

            for(let filterPos = 0; filterPos < filters.length; ++filterPos) {
                const uuidParent = uuidNext();

                const filter = filters[filterPos];
                const filterUuid = filterUuids[filterPos];
                
                nextStep = logic.getNextStep();
                
                // Check parameters are exactly one
                assert.notStrictEqual(nextStep, undefined);
                assert.equal(nextStep!.length, 2);
                assert.deepStrictEqual(nextStep!.map(e=>e.status),
                [
                    {
                        "currentForeach": filterUuid,
                        "finishedForeach": filterUuids.slice(0, filterPos).reduce((acc:any, value:string)=>{ acc[value] = true;return acc}, {}),
                        "execUuid": uuidParent,
                        "finishedLoopCount": repeat,
                        "parentExecUuid": null,
                        "activeChild": "aaaa",
                    },
                    {
                        "currentForeach": null,
                        "finishedForeach": null,
                        "execUuid": uuidNext(),
                        "finishedLoopCount": 0,
                        "parentExecUuid": uuidParent,
                    }
                ], `First step ${repeat} with ${filter}`);
                assert.strictEqual(nextStep![1].step, sequence.root.childs!.byuuid.aaaa);
                
                nextStepParams = logic.getParameters(nextStep!);

                assert.deepStrictEqual(nextStepParams, {
                    filter: filter,
                    exposure: 10,
                    bin: 2,
                }, `First step ${repeat} with ${filter}`);

                logic.finish(nextStep![nextStep!.length - 1]);
                uuidNext();
                
                nextStep = logic.getNextStep();
                assert.notStrictEqual(nextStep, undefined);
                assert.equal(nextStep!.length, 2);
                assert.deepStrictEqual(nextStep!.map(e=>e.status),
                [
                    {
                        "currentForeach": filterUuid,
                        "finishedForeach": filterUuids.slice(0, filterPos).reduce((acc:any, value:string)=>{ acc[value] = true;return acc}, {}),
                        "execUuid": uuidParent,
                        "finishedLoopCount": repeat,
                        "parentExecUuid": null,
                        "activeChild": "bbbb",
                    },
                    {
                        "currentForeach": null,
                        "finishedForeach": null,
                        "execUuid": uuidNext(),
                        "finishedLoopCount": 0,
                        "parentExecUuid": uuidParent,
                    }
                ], `Second step ${repeat} with ${filter}`);
                assert.strictEqual(nextStep![1].step, sequence.root.childs!.byuuid.bbbb);
                
                nextStepParams = logic.getParameters(nextStep!);

                assert.deepStrictEqual(nextStepParams, {
                    filter: filter,
                    bin: 4,
                    exposure: 10,
                }, `Second step ${repeat} with ${filter}`);

                logic.finish(nextStep![nextStep!.length - 1]);
                uuidNext();
            
            }
            uuidNext();
        }

        nextStep = logic.getNextStep();
        assert.strictEqual(nextStep, undefined);
    });
});