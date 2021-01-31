import * as React from 'react';
import ReactResizeDetector from 'react-resize-detector';

import * as Store from '../Store';

import { atPath } from '../shared/JsonPath';
import './Table.css';
import TableEntry from './TableEntry';
import ObjectReselect from '../utils/ObjectReselect';

export type HeaderItem = {
    id:string;
}

export type FieldDefinition = {
    render?:(item: any)=>React.ReactNode
    title: string;
    defaultWidth: string;
}

type InputProps<DatabaseObject> = {
    statePath: string;
    currentPath: string;
    currentAutoSelectSerialPath: string;
    fields: {[id: string]: FieldDefinition},
    defaultHeader: Array<HeaderItem>,

    getDatabases: (store: Store.Content)=>DatabaseObject;
    // store => [items]
    getItemList: (database: DatabaseObject)=>Array<string>,
    // store, uid => item
    getItem: (databases:DatabaseObject, uid:string)=>any,
    onItemClick: (uid:string, e:React.MouseEvent<HTMLTableRowElement>)=>any,
}

type MappedProps<DatabaseObject> = {
    header: Array<HeaderItem>;
    databases: DatabaseObject;
    current: string;
    currentAutoSelectSerial: number;
}

type Props<DatabaseObject> = InputProps<DatabaseObject> & MappedProps<DatabaseObject>;

function firstDefined<T>(a: T, b: T): T
{
    if (a !== undefined) return a;
    return b;
}

/**
 * state for table is :
 *  (none)
 */
class Table<DatabaseObject> extends React.PureComponent<Props<DatabaseObject>> {
    private selected = React.createRef<TableEntry<DatabaseObject>>();

    private header = React.createRef<HTMLTableElement>();
    private lastScrollSerial?:number = undefined;

    scrollIfRequired() {
        if (this.lastScrollSerial === undefined || this.lastScrollSerial < this.props.currentAutoSelectSerial) {
            const selected = this.selected.current;
            if (selected) {
                selected.scrollIn();
                this.lastScrollSerial = (this.props.currentAutoSelectSerial||0);
            }
        }
    }

    componentDidMount() {
        this.scrollIfRequired();
    }

    componentDidUpdate() {
        this.scrollIfRequired();
    }

    onParentResize=(width:number, height:number)=> {
        this.header.current!.style.width = width + "px";
    }

    render() {
        const content = [];

        for(const o of this.props.getItemList(this.props.databases))
        {
            content.push(<TableEntry
                key={o}
                fields={this.props.fields}
                header={this.props.header}
                databases={this.props.databases}
                getItem={this.props.getItem}
                // statePath={this.props.statePath + '.items[' + JSON.stringify(o) + ']'}
                uid={o}
                onItemClick={this.props.onItemClick}
                selected={o===this.props.current}
                ref={o===this.props.current ? this.selected : null}
            />);
        }

        const cols = [];
        const header = [];
        for(const o of this.props.header) {
            const field = this.props.fields[o.id];
            const style = field.defaultWidth.endsWith('%') ? { width: field.defaultWidth } : { minWidth: field.defaultWidth };
            header.push(<th key={o.id}>
                {field.title}
            </th>);
            cols.push(<col key={o.id} style={style}/>);
        }
        return <div className="DataTable">
            <table className="DataTableHeader" ref={this.header}>
                <colgroup>
                    {cols}
                </colgroup>
                <thead>
                    <tr>{header}</tr>
                </thead>
            </table>
            <div className="DataTableScrollable">
                <div>
                    <ReactResizeDetector handleWidth onResize={this.onParentResize} />

                    <table className="DataTableData">
                        <colgroup>
                            {cols}
                        </colgroup>
                        <tbody>
                            {content}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>;
    }

    static mapStateToProps<DatabaseObject>():(store: Store.Content, ownProps: InputProps<DatabaseObject> )=> MappedProps<DatabaseObject>
    {
        const databaseSelector = ObjectReselect.createObjectSelector((store: Store.Content, ownProps:InputProps<DatabaseObject>)=>ownProps.getDatabases(store));
        // FIXME: dispatch the cleanup of state of entries
        return (store: Store.Content, ownProps: InputProps<DatabaseObject>)=>({
            databases: databaseSelector(store, ownProps),
            header: firstDefined(atPath(store, ownProps.statePath + ".header"), ownProps.defaultHeader),
            current: atPath(store, ownProps.currentPath),
            currentAutoSelectSerial : ownProps.currentAutoSelectSerialPath ? atPath(store, ownProps.currentAutoSelectSerialPath) : 0,
        });
    }
}

export default Store.Connect(Table);
