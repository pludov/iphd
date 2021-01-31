import * as React from 'react';
import * as Help from '../Help';
import * as Store from '../Store';
import * as BaseText from './BaseText';

type Props = {
    accessor: Store.Accessor<number|null>;
    min?: number;
    max?: number;
    helpKey?: Help.Key;
}

const MappedNumber = Store.Connect<BaseText.default<number|null>, BaseText.InputProps<number|null>, {}, {}>(BaseText.default);

class Int extends React.PureComponent<Props> {
    render() {
        return <MappedNumber
                    accessor={this.props.accessor}
                    toString={this.numberToString}
                    fromString={this.numberFromString}
                    children={this.props.children}
                    helpKey={this.props.helpKey}
                    />
    }

    numberToString=(n?:number|null)=>{
        return "" + (n !== null && n !== undefined ? n :"");
    }

    numberFromString=(s:string)=>{
        const n = parseInt(s);
        if (isNaN(n)) {
            throw new Error("int required");
        }
        if (this.props.min !== undefined && n < this.props.min) {
            throw new Error("Must be >= " + this.props.min);
        }
        if (this.props.max !== undefined && n > this.props.max) {
            throw new Error("Must be <= " + this.props.max);
        }
        return n;
    }
}

export default Int;