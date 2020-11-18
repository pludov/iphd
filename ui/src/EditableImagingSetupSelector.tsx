import * as React from 'react';

import * as Store from "./Store";

import ImagingSetupSelector, {InputProps as ImagingSetupSelectorProps, Item as ImageSetupSelectorItem} from './ImagingSetupSelector';
import PromiseSelector, {Props as PromiseSelectorProps} from './PromiseSelector';
import ImagingSetupEditor from './ImagingSetupEditor';

type Props = ImagingSetupSelectorProps;
type State = {
    editingUuid: string | undefined;
};

class EditableImagingSetupSelector extends React.PureComponent<Props, State> {

    private readonly controls : ImagingSetupSelectorProps["controls"];
    private readonly imagingSetupSelectorRef = React.createRef<PromiseSelector<ImageSetupSelectorItem>>();

    constructor(props: Props) {
        super(props);
        this.controls = [{
            id:'edit',
            title:'✏️ Edit...',
            run: this.startEdit
        }];
        this.state = {
            editingUuid: undefined
        };
    }

    startEdit = async ()=> {

        const current = this.props.getValue(Store.getStore().getState(), this.props);
        if (current !== null) {
            this.setState({editingUuid: current});
        }
    }

    getCurrentEditing = ()=>{
        if (this.state.editingUuid === undefined) {
            throw new Error("not editing");
        }
        return this.state.editingUuid;
    }

    setCurrentEditing = async (uid: string)=> {
        this.setState({editingUuid: uid});
    }

    closeEdit = ()=>{
        if (this.state.editingUuid !== undefined) {
            const current = this.imagingSetupSelectorRef.current;
            console.log('current is ', current);
            this.imagingSetupSelectorRef.current?.select(this.state.editingUuid);
        }
        this.setState({editingUuid: undefined});
    }

    render() {
        const { controls, ...props} = this.props;
        const editingUuid = this.state.editingUuid;
        return (
            <>
                {editingUuid !== undefined
                    ?
                        <div className="Modal">
                            <div className="ModalContent">
                                <p>Imaging setup: <ImagingSetupSelector getValue={()=>editingUuid} setValue={this.setCurrentEditing}/></p>

                                <ImagingSetupEditor
                                    imageSetupUid={editingUuid}
                                    />

                                <input type='button' value='Close' onClick={this.closeEdit}/>
                            </div>
                        </div>
                    : null
                }
                <ImagingSetupSelector controls={this.controls} ref={this.imagingSetupSelectorRef as any} {...props}></ImagingSetupSelector>
            </>
        );
    }

}

export default EditableImagingSetupSelector;
