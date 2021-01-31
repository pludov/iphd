import * as React from 'react';
import * as Help from "./Help";
import "./Modal.css";

type Props = {
    forceVisible?: boolean;
    onClose?:()=>(void);
    closeHelpKey?: Help.Key;
}

type State = {
    visible: boolean;
}

// Remark: this could also be used for selectors
class Modal extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {
            visible: false
        }
    }

    render() {
        if (!this.state.visible && !this.props.forceVisible) {
            return null;
        }

        return <div className="Modal">
                    <div className="ModalContent">
                        {this.props.children}
                        <input type='button' value='Close' onClick={this.close} {...this.props.closeHelpKey?.dom()}/>
                    </div>
        </div>;
    }

    public readonly open=()=>{
        this.setState({visible: true});
    }

    public readonly close=()=>{
        this.setState({visible: false});
        if (this.props.onClose) {
            this.props.onClose();
        }
    }
}


export default Modal;
