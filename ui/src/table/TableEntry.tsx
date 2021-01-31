import * as React from 'react';
// import { createSelector } from 'reselect';
import ArrayReselect from '../utils/ArrayReselect';
import * as Store from '../Store';
import * as Table from "./Table";
import ScrollableText from '../ScrollableText';

export type Props<DatabaseObject> = {
    header: Array<Table.HeaderItem>;
    fields: {
        [id: string]: Table.FieldDefinition
    };
    selected: boolean;
    uid: string;

    databases: DatabaseObject;
    onItemClick: (uid:string, e:React.MouseEvent<HTMLTableRowElement>)=>void;
    getItem: (databases: DatabaseObject, uid:string)=>any,
};

class TableEntry<DatabaseObject> extends React.PureComponent<Props<DatabaseObject>> {
    private tr = React.createRef<HTMLTableRowElement>();

    constructor(props:Props<DatabaseObject>) {
        super(props);
        this.onClick = this.onClick.bind(this);
    }

    render() {
        var content = [];
        const item = this.props.getItem(this.props.databases, this.props.uid);
        for(var o of this.props.header)
        {
            var field = this.props.fields[o.id];
            var details;
            if ('render' in field) {
                details = field.render!(item);
            } else {
                details = item === undefined ? "N/A" : "" + item[o.id];
            }
            content.push(<td key={o.id}><ScrollableText>{details}</ScrollableText>
            </td>)
        }
        return <tr onClick={this.onClick} className={this.props.selected?"selected" : ""} ref={this.tr}>{content}</tr>
    }

    onClick=(e:React.MouseEvent<HTMLTableRowElement>)=>{
        this.props.onItemClick(this.props.uid, e);
    }

    scrollIn=()=>{
        const tr = this.tr.current;
        if (tr) {
            tr.scrollIntoView();
        }
    }
}


export default TableEntry;
