import * as React from 'react';
import * as Help from '../Help';
import * as Store from '../Store';

type InputProps = {
    accessor: Store.Accessor<boolean>;
    helpKey?: Help.Key;
}

type MappedProps = {
    value: boolean;
}

type Props = InputProps & MappedProps;

class Bool extends React.PureComponent<Props> {
    render() {
        return <span className='cameraSetting' {...this.props.helpKey?.dom()}>
            {this.props.children}
            <input
                type='checkbox'
                checked={this.props.value}
                onChange={this.update}/>
        </span>;
    }

    update=(e:React.ChangeEvent<HTMLInputElement>)=>{
        this.props.accessor.send(e.target.checked);
    }

    static mapStateToProps(store:Store.Content, ownProps:InputProps) {
        return ({
            value: ownProps.accessor.fromStore(store)
        });
    }
}

export default Store.Connect(Bool);