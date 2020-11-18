import * as React from 'react';
import PropTypes from 'prop-types';

type Control = {
    id: string;
    title: string;
    run: ()=>Promise<any>;
}

export type Props<TYPE> = {
    active: string|null;
    nullAlwaysPossible?: boolean;
    placeholder: string;
    availablesGenerator: (props: Props<TYPE>)=>Array<TYPE>;
    getId: (o: TYPE, props: Props<TYPE>)=>string;
    getTitle: (o: TYPE, props: Props<TYPE>)=>string;
    controls?: Array<Control>;
    setValue:(d:string)=>Promise<any>;
    focusRef?: React.RefObject<HTMLSelectElement>;
};
type State<TYPE> = {
    forcedValue: string|null;
    runningPromise: Promise<any>|undefined;
};

/**
 * A selector that start a promise on update
 * 
 * Supported values: numbers, strings, booleans, null
 */
export default class PromiseSelector<TYPE> extends React.PureComponent<Props<TYPE>, State<TYPE>> {
    static defaultProps = {
        getTitle: (e:any)=>'' + e,
        getId: (e:any)=>e,
        placeholder: 'Choose...',
        availablesGenerator: (props:any)=>props.availables
    }

    constructor(props:Props<TYPE>) {
        super(props);
        this.state = {
            forcedValue: null,
            runningPromise: undefined,

        };
    }
    render() {
        var active = this.props.active;
        if (active == undefined) active = null;

        var availables = this.props.availablesGenerator(this.props);
        if (!availables) availables = [];
        var options = [];
        let disabled: boolean = true;
        if (this.state.forcedValue !== null) {
            active = this.state.forcedValue;
            console.log('Using forced value ' + active);
        }

        if (active == null || this.props.nullAlwaysPossible) {
            options.push(<option disabled={!this.props.nullAlwaysPossible} hidden={!this.props.nullAlwaysPossible} value='null' key='null'>{this.props.placeholder}</option>)
            if (this.props.nullAlwaysPossible) {
                disabled = false;
            }
        }

        if (active != null) {
            var present = false;
            for(var o of availables) {
                if (this.props.getId(o, this.props) === active) {
                    present = true;
                }
            }
            if (!present) {
                options.push(<option value={JSON.stringify(active)} key={JSON.stringify(active)}>{active}</option>);
                disabled = false;
            }
        }

        for(const v of availables) {
            const id = JSON.stringify(this.props.getId(v, this.props));
            options.push(<option value={id} key={id}>{this.props.getTitle(v, this.props)}</option>);
            disabled = false;
        }

        if (this.props.controls) {
            for(const v of this.props.controls) {
                var id = "ctrl:" + JSON.stringify(v.id);
                options.push(<option value={id} key={id}>{v.title}</option>);
                disabled = false;
            }
        }

        return <select ref={this.props.focusRef}
                    disabled={(this.state.runningPromise !== undefined) || disabled}
                    value={JSON.stringify(active)}
                    onChange={(e)=>this.clicked(e.target.value)}>{options}
            </select>;
    }

    // Force the selection of an item (by id)
    public select = (value: string) => {
        this.clicked(JSON.stringify(value));
    }

    clicked(value:string)
    {
        if (value !== null && value !== undefined && value.startsWith("ctrl:")) {
            var id = JSON.parse(value.substring(5));
            if (this.props.controls) {
                for(const v of this.props.controls) {
                    if (v.id == id) {
                        console.log('select entry', id);
                        this.selectEntry(null, v.run);
                    }
                }
            }
        } else {
            this.selectEntry(JSON.parse(value), this.props.setValue);
        }
    }

    asyncUpdatePromise(from:Promise<any>|undefined, to:Promise<any>|undefined, forcedValue: string|null)
    {
        this.setState((prevState)=>{
            console.log('WTF Doing transition from ' + from + ' to ' + to);
            if (prevState.runningPromise === from) {
                console.log('WTF Really Doing transition from ' + from + ' to ' + to);
                return {
                    ...prevState,
                    runningPromise: to,
                    forcedValue: forcedValue
                };
            }
            return prevState;
        });
    }

    // FIXME: ici on veut des task
    // Est-ce qu'on peut garder un promise + un CT ?
    async selectEntry(d:string|null, generator:(d:string|null)=>Promise<any>) {
        if (generator === undefined) return;

        if (this.state.runningPromise) {
            // FIXME: this.state.runningPromise.cancel();
            // this.setState(this.updatePromise(this.state.runningPromise, undefined, undefined));

            this.asyncUpdatePromise(this.state.runningPromise, undefined, null);
        }


        let newpromise;
        try {
            newpromise = generator(d);
            this.asyncUpdatePromise(undefined, newpromise, d);
            
            await newpromise;

        } finally {
            this.asyncUpdatePromise(newpromise, undefined, null);
        }
    }
}

