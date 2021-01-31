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


describe("SequenceLogicDithering", () => {
    it("Dither for all images", () => {
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
                dithering: {
                    amount: 1,
                    pixels: 2,
                    raOnly: false,
                    time: 3,
                    timeout: 60,
                    once: false,
                },
                childs: {
                    list: [ "aaaa", "bbbb" ],
                    byuuid: {
                        "aaaa": {
                            filter: "red"
                        },
                        "bbbb": {
                            filter: "green"
                        }
                    }
                }
            },
            
            // uuids of images
            images: [],
            imageStats: {},
        }
        
        const logic:SequenceLogic = new SequenceLogic(sequence, uuidMock());
        let nextStepParams;
        
        for(let i = 0; i < 6; ++i) {
            let nextStep = logic.getNextStep();
            // Check parameters are exactly one
            assert.notStrictEqual(nextStep, undefined);
            assert.equal(nextStep!.length, 2);
            
            let nextStepParams = logic.getParameters(nextStep!);
            assert.deepStrictEqual(nextStepParams, {
                dithering: {
                    amount: 1,
                    pixels: 2,
                    raOnly: false,
                    time: 3,
                    timeout: 60,
                    once: false,
                },
                exposure: 10,
                filter: (i & 1) ? "green" : "red",
            },
            "Dithering all on step " + i);
            
            logic.finish(nextStep![nextStep!.length - 1]);
        }
        
        let nextStep = logic.getNextStep();
        assert.strictEqual(nextStep, undefined);
    });
    
    it("Dither once - direct", () => {
        const sequence: Sequence = {
            status: "idle",
            progress: null,
            
            title: "Test sequence",
            imagingSetup: "imaging_setup_id",
            errorMessage: null,
            
            stepStatus: {},
            root: {
                repeat: 2,
                childs: {
                    list: ['c1'],
                    byuuid: {
                        'c1': {
                            exposure: 10,
                            repeat: 3,
                            dithering: {
                                amount: 1,
                                pixels: 2,
                                raOnly: false,
                                time: 3,
                                timeout: 60,
                                once: true,
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
        
        for(let l = 0; l < 2; ++l) {
            for(let i = 0; i < 3; ++i) {
                let nextStep = logic.getNextStep();
                // Check parameters are exactly one
                assert.notStrictEqual(nextStep, undefined);
                assert.equal(nextStep!.length, 2);
                
                let nextStepParams = logic.getParameters(nextStep!);
                
                assert.deepStrictEqual(nextStepParams, {
                    ...(i !== 0 ? {} : {
                        dithering: {
                            amount: 1,
                            pixels: 2,
                            raOnly: false,
                            time: 3,
                            timeout: 60,
                            once: true,
                        }
                    }),
                    exposure: 10,
                },
                `Dithering once on step ${i}, loop ${l}`
                );
                
                logic.finish(nextStep![nextStep!.length - 1]);
            }
        }
        
        let nextStep = logic.getNextStep();
        assert.strictEqual(nextStep, undefined);
    });
    
    
    it("Dither once - with childs", () => {
        const sequence: Sequence = {
            status: "idle",
            progress: null,
            
            title: "Test sequence",
            imagingSetup: "imaging_setup_id",
            errorMessage: null,
            
            stepStatus: {},
            root: {
                repeat: 2,
                childs: {
                    list: ['c1'],
                    byuuid: {
                        'c1': {
                            exposure: 10,
                            repeat: 3,
                            dithering: {
                                amount: 1,
                                pixels: 2,
                                raOnly: false,
                                time: 3,
                                timeout: 60,
                                once: true,
                            },
                            childs: {
                                list: [ "aaaa", "bbbb" ],
                                byuuid: {
                                    "aaaa": {
                                        filter: "red"
                                    },
                                    "bbbb": {
                                        filter: "green"
                                    }
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
        
        for(let l = 0; l < 2; ++l) {
            for(let i = 0; i < 6; ++i) {
                let nextStep = logic.getNextStep();
                // Check parameters are exactly one
                assert.notStrictEqual(nextStep, undefined);
                assert.equal(nextStep!.length, 3);
                
                let nextStepParams = logic.getParameters(nextStep!);
                
                assert.deepStrictEqual(nextStepParams, {
                    ...(i !== 0 ? {} : {
                        dithering: {
                            amount: 1,
                            pixels: 2,
                            raOnly: false,
                            time: 3,
                            timeout: 60,
                            once: true,
                        }
                    }),
                    exposure: 10,
                    filter: (i & 1) ? "green" : "red",
                },
                `Dithering once on step ${i}, loop ${l}`
                );
                
                logic.finish(nextStep![nextStep!.length - 1]);
            }
        }
        let nextStep = logic.getNextStep();
        assert.strictEqual(nextStep, undefined);
    });
    
    it("Dither once with repeat & foreach at same level", () => {
        const sequence: Sequence = {
            status: "idle",
            progress: null,
            
            title: "Test sequence",
            imagingSetup: "imaging_setup_id",
            errorMessage: null,
            
            stepStatus: {},
            root: {
                dithering: {
                    amount: 1,
                    pixels: 2,
                    raOnly: false,
                    time: 3,
                    timeout: 60,
                    once: true,
                },
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
                }
            },
            
            // uuids of images
            images: [],
            imageStats: {},
        }
        
        const logic:SequenceLogic = new SequenceLogic(sequence, uuidMock());
        
        let cpt_under_repeat = 0;
        for(let i = 0; i < 2; ++i) {
            for(const filter of [ "red", "green", "blue" ]) {
                cpt_under_repeat++;
                let nextStep = logic.getNextStep();
                // Check parameters are exactly one
                assert.notStrictEqual(nextStep, undefined, `on filter ${filter}, loop ${i}`);
                assert.equal(nextStep!.length, 1, `on filter ${filter}, loop ${i}`);
                
                let nextStepParams = logic.getParameters(nextStep!);
                
                assert.deepStrictEqual(nextStepParams, {
                    ...(cpt_under_repeat !== 1 ? {} : {
                        dithering: {
                            amount: 1,
                            pixels: 2,
                            raOnly: false,
                            time: 3,
                            timeout: 60,
                            once: true,
                        }
                    }),
                    exposure: 10,
                    filter,
                },
                `on filter ${filter}, loop ${i}`
                );
                
                logic.finish(nextStep![nextStep!.length - 1]);
            }
        }
        let nextStep = logic.getNextStep();
        assert.strictEqual(nextStep, undefined);
    });
    
    it("Dither once with foreach at same level & childs", () => {
        const sequence: Sequence = {
            status: "idle",
            progress: null,
            
            title: "Test sequence",
            imagingSetup: "imaging_setup_id",
            errorMessage: null,
            
            stepStatus: {},
            root: {
                dithering: {
                    amount: 1,
                    pixels: 2,
                    raOnly: false,
                    time: 3,
                    timeout: 60,
                    once: true,
                },
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
                    list: ['c1'],
                    byuuid: {
                        'c1': {
                            exposure: 10,
                            repeat: 3,
                            childs: {
                                list: [ "aaaa", "bbbb" ],
                                byuuid: {
                                    "aaaa": {
                                        bin: 1,
                                    },
                                    "bbbb": {
                                        bin: 2,
                                    }
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
        
        let cpt_under_filter = 0;
        for(const filter of [ "red", "green", "blue" ]) {
            for(let i = 0; i < 6; ++i) {
                cpt_under_filter++;
                let nextStep = logic.getNextStep();
                // Check parameters are exactly one
                assert.notStrictEqual(nextStep, undefined);
                assert.equal(nextStep!.length, 3);
                
                let nextStepParams = logic.getParameters(nextStep!);
                
                assert.deepStrictEqual(nextStepParams, {
                    ...(cpt_under_filter !== 1 ? {} : {
                        dithering: {
                            amount: 1,
                            pixels: 2,
                            raOnly: false,
                            time: 3,
                            timeout: 60,
                            once: true,
                        }
                    }),
                    exposure: 10,
                    filter,
                    bin: (i & 1) ? 2 : 1,
                },
                `on filter ${filter}, loop ${i}`
                );
                
                logic.finish(nextStep![nextStep!.length - 1]);
            }
        }
        let nextStep = logic.getNextStep();
        assert.strictEqual(nextStep, undefined);
    });
    
    // Dither once with parent repeat
    it("Dither once with parent repeat", () => {
        const sequence: Sequence = {
            status: "idle",
            progress: null,
            
            title: "Test sequence",
            imagingSetup: "imaging_setup_id",
            errorMessage: null,
            
            stepStatus: {},
            root: {
                repeat: 2,
                childs: {
                    list: ['c1'],
                    byuuid: {
                        'c1': {
                            dithering: {
                                amount: 1,
                                pixels: 2,
                                raOnly: false,
                                time: 3,
                                timeout: 60,
                                once: true,
                            },
                            exposure: 10,
                            repeat: 2,
                        }
                    }
                }
            },
            
            // uuids of images
            images: [],
            imageStats: {},
        }
        
        const logic:SequenceLogic = new SequenceLogic(sequence, uuidMock());
        
        for(let out = 0; out < 2; ++out) {
            for(let inner = 0; inner < 2; ++inner) {
                let nextStep = logic.getNextStep();
                // Check parameters are exactly one
                assert.notStrictEqual(nextStep, undefined, `out ${out}, inner ${inner}`);
                assert.equal(nextStep!.length, 2, `out ${out}, inner ${inner}`);
                
                let nextStepParams = logic.getParameters(nextStep!);
                
                assert.deepStrictEqual(nextStepParams, {
                    ...(inner > 0 ? {} : {
                        dithering: {
                            amount: 1,
                            pixels: 2,
                            raOnly: false,
                            time: 3,
                            timeout: 60,
                            once: true,
                        }
                    }),
                    exposure: 10,
                },
                `out ${out}, inner ${inner}`
                );
                
                logic.finish(nextStep![nextStep!.length - 1]);
            }
        }
        let nextStep = logic.getNextStep();
        assert.strictEqual(nextStep, undefined);
    });
    
    it("Dither once with parent foreach", () => {
        const sequence: Sequence = {
            status: "idle",
            progress: null,
            
            title: "Test sequence",
            imagingSetup: "imaging_setup_id",
            errorMessage: null,
            
            stepStatus: {},
            root: {
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
                    list: ['c1'],
                    byuuid: {
                        'c1': {
                            dithering: {
                                amount: 1,
                                pixels: 2,
                                raOnly: false,
                                time: 3,
                                timeout: 60,
                                once: true,
                            },
                            exposure: 10,
                            repeat: 2,
                        }
                    }
                }
            },
            
            // uuids of images
            images: [],
            imageStats: {},
        }
        
        const logic:SequenceLogic = new SequenceLogic(sequence, uuidMock());
        
        for(const filter of [ "red", "green", "blue" ]) {
            for(let inner = 0; inner < 2; ++inner) {
                let nextStep = logic.getNextStep();
                // Check parameters are exactly one
                assert.notStrictEqual(nextStep, undefined, `filter ${filter}, inner ${inner}`);
                assert.equal(nextStep!.length, 2, `filter ${filter}, inner ${inner}`);
                
                let nextStepParams = logic.getParameters(nextStep!);
                
                assert.deepStrictEqual(nextStepParams, {
                    ...(inner > 0 ? {} : {
                        dithering: {
                            amount: 1,
                            pixels: 2,
                            raOnly: false,
                            time: 3,
                            timeout: 60,
                            once: true,
                        }
                    }),
                    filter,
                    exposure: 10,
                },
                `filter ${filter}, inner ${inner}`
                );
                
                logic.finish(nextStep![nextStep!.length - 1]);
            }
        }
        let nextStep = logic.getNextStep();
        assert.strictEqual(nextStep, undefined);
    });
});
