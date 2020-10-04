import * as React from 'react';
import * as Store from './Store';
import * as Utils from './Utils';

import * as BackendRequest from "./BackendRequest";
import PromiseSelector from './PromiseSelector';
import DeviceConnectBton from './DeviceConnectBton';
import CancellationToken from 'cancellationtoken';
import { noErr } from './Utils';
import { ShootResult } from '@bo/BackOfficeAPI';
import * as BackofficeStatus from '@bo/BackOfficeStatus';
import TextEdit from './TextEdit';
import { has } from './shared/JsonProxy';
import { Json } from '@bo/Json';


type InputProps = {
    focuserId:string;
    filterWheelId: string;
}


type MappedProps = {
    filterIds: string[];
    currentDeltas?: BackofficeStatus.FilterWheelDeltas;
}

type Props = InputProps & MappedProps;

type State = {
}

const emptyArray:[] = [];

class IndiFilterWheelFocusAdjusterConfig extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {};
    }

    render() {
        return <div>
            {this.props.filterIds.length === 0
                ? <div key="nofilter">No filter found</div>
                : <ul key="filters">
                    {this.props.filterIds.map((id)=>
                        {
                            const currentValue = has(this.props.currentDeltas, id) ? "" + (this.props.currentDeltas![id]) : "";
                            return <li key={id}>{id}:
                                <TextEdit
                                    value={currentValue}
                                    onChange={(e:string)=> this.setFilterValue(id, e)}/>
                            </li>;
                        }
                    )}
                  </ul>
            }
        </div>
    }


    private setFilterValue(filterId: string, valueStr:string) {
        return Utils.promiseToState(
            (async ()=> {
                let value: number|null = parseInt(valueStr, 10);
                if (isNaN(value)) {
                    value = null;
                }
        
                const store = Store.getStore().getState();
                const indiDeviceConfiguration = IndiFilterWheelFocusAdjusterConfig.getConfiguration(store, this.props.filterWheelId);

                const filterDeltaByFocuser : Json = {
                    ...indiDeviceConfiguration?.options?.filterDeltaByFocuser,
                    [this.props.focuserId]: {
                        ...indiDeviceConfiguration?.options?.filterDeltaByFocuser?.[this.props.focuserId],
                        [filterId]: value
                    }
                };
                if (value === null) {
                    delete filterDeltaByFocuser![this.props.focuserId]![filterId];
                }
                await BackendRequest.RootInvoker("indi")("updateDriverParam")(
                    CancellationToken.CONTINUE,
                    {
                        driver: this.props.filterWheelId,
                        key: 'filterDeltaByFocuser',
                        value: filterDeltaByFocuser
                    });
            }),
            this
        );
    }

    private static getConfiguration(store: Store.Content, filterWheelId: string): BackofficeStatus.IndiDeviceConfiguration|undefined {
        const indiDevices = store.backend.indiManager?.configuration.indiServer.devices;
        return has(indiDevices, filterWheelId) ? indiDevices![filterWheelId] : undefined;
    }


    static mapStateToProps (store:Store.Content, ownProps: InputProps):MappedProps {
        
        const indiDeviceConfiguration = IndiFilterWheelFocusAdjusterConfig.getConfiguration(store, ownProps.filterWheelId);

        const configForFocusers = indiDeviceConfiguration?.options?.filterDeltaByFocuser;
        const currentDeltas:BackofficeStatus.FilterWheelDeltas|undefined = has(configForFocusers, ownProps.focuserId) ? configForFocusers![ownProps.focuserId] : undefined;

        // List the filter of the filtewheel
        const dynStateByDevices = store.backend.filterWheel?.dynStateByDevices || {};
        const filterIds = has(dynStateByDevices, ownProps.filterWheelId) ?
                     dynStateByDevices[ownProps.filterWheelId].filterIds : emptyArray;
        const result = {
            filterIds,
            currentDeltas
        };
        return result;
    }
}


export default Store.Connect(IndiFilterWheelFocusAdjusterConfig);
