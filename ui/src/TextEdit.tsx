import * as React from 'react';
import * as Help from "./Help"
import "./TextEdit.css"

type FullScreenEditProps = {
    value: string;
    onDone: (s:string|null)=>(void);
}

class FullScreenEdit extends React.PureComponent<FullScreenEditProps> {
    // props: value, onDone
    readonly textArea = React.createRef<HTMLTextAreaElement>();

    constructor(props:FullScreenEditProps) {
        super(props);
    }

    stopEvent=(e:React.MouseEvent<HTMLDivElement>)=>{
        e.stopPropagation();
    }

    componentDidMount() {
        this.textArea.current!.focus();
    }

    render() {
        return <div className="Dialog WithVirtualKeyboard" onClick={this.stopEvent}>
            <textarea ref={this.textArea} defaultValue={this.props.value}/>
            <br/>
            <input type="button" value="Ok" onClick={this.done}/>
            <input type="button" value="Cancel" onClick={this.close}/>
        </div>
    }

    done=()=>{
        this.props.onDone(this.textArea.current!.value);
    }

    close=()=>{
        this.props.onDone(null);
    }

}

type Props = {
    value: string;
    onChange: (s:string)=>(void);
    focusRef?: React.RefObject<HTMLDivElement>;
    helpKey?: Help.Key;
}

type State = {
    editor: number;
}
// Render text with edit possibility
// props: value
// props: onChange
export default class TextEdit extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {editor: 0};
    }


    render() {
        var editor = null;
        if (this.state.editor != 0) {
            editor = <FullScreenEdit value={this.props.value} onDone={this.updateValue}/>;
        }
        let v = this.props.value;
        if (v === undefined || v === "") {
            v = " ";
        }
        return <span className="TextEdit" ref={this.props.focusRef} tabIndex={0} onClick={this.openEditor} {...this.props.helpKey?.dom()}>{v}{editor}</span>
    }

    openEditor=()=>{
        this.setState({editor: 1});
    }

    updateValue=(e:string|null)=>{
        this.setState({editor: 0});
        if (e != null && this.props.onChange) {
            this.props.onChange(e);
        }
    }
}
