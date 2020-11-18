import * as React from 'react';

import * as Utils from "./Utils";

import * as BackendRequest from "./BackendRequest";
import * as Store from "./Store";
import CancellationToken from 'cancellationtoken';

import TextEdit from './TextEdit';



type InputProps = {
    imageSetupUid: string;
}

type MappedProps = {
    visible:boolean;
    name: string;
}

type Props = InputProps & MappedProps;


type State = {}

class ImagingSetupEditor extends React.PureComponent<Props, State> {

    constructor(props: Props) {
        super(props);
    }

    updateName=async (name:string)=> {
        await BackendRequest.RootInvoker("imagingSetupManager")("setName")(
            CancellationToken.CONTINUE,
            {
                imagingSetupUuid: this.props.imageSetupUid,
                name
            }
        );
    }

    render() {
        return (
            <>
                <div className="IndiProperty">
                        Name:
                        <TextEdit
                            value={this.props.name}
                            onChange={(e)=>this.updateName(e)} />
                </div>
            </>
        );
    }

    static mapStateToProps(store:Store.Content, ownProps: InputProps):MappedProps {
        const byuuid= store.backend?.imagingSetup?.configuration?.byuuid;
        if (Utils.has(byuuid, ownProps.imageSetupUid)) {
            const details = byuuid![ownProps.imageSetupUid];

            return {
                visible: true,
                name: details.name
            }
        } else {
            return {
                visible: false,
                name: '',
            }
        }
    }
}

export default Store.Connect(ImagingSetupEditor);