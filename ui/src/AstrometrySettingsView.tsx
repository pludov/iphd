import { connect } from 'react-redux';
import CancellationToken from 'cancellationtoken';
import React, { Component, PureComponent} from 'react';

import * as Help from "./Help";
import Bool from './primitives/Bool';
import Int from './primitives/Int';
import Float from './primitives/Float';
import Conditional from './primitives/Conditional';
import PromiseSelector from './PromiseSelector';
import BackendAccessor from './utils/BackendAccessor';
import DeviceConnectBton from './DeviceConnectBton';
import DeviceGeolocBton from './DeviceGeolocBton';
import * as BackendRequest from "./BackendRequest";
import AstrometryBackendAccessor from "./AstrometryBackendAccessor";
import { AstrometrySettings } from '@bo/BackOfficeStatus';

const ScopeSelector = connect((store:any)=> ({
    active: (store.backend && store.backend.astrometry) ? store.backend.astrometry.selectedScope : undefined,
    availables: (store.backend && store.backend.astrometry) ? store.backend.astrometry.availableScopes : []
}))(PromiseSelector);


type Props = {
    close: ()=>(void);
}

export default class AstrometrySettingsView extends PureComponent<Props> {
    static scopeSelectorHelp = Help.key("INDI mount device", "The coordinates of this INDI mount device will be used/adjusted during astrometry process.");
    static initialSearchRadiusHelp = Help.key("Initial Search Radius", "Max distance (°) from the current mount coordinates to search on \"wide\" astrometry. This is used on \"wide\" astrometry search (first one, and after important moves).");
    static narrowedSearchRadiusHelp = Help.key("Synced search radius", "Max distance (°) from the current mount coordinates to search on \"narrow\" astrometry (after successfull one, if no important moves occured in between");
    static initialFieldHelp = Help.key("Initial field range", "Min an max value (°) for the initial estimation of field size of the images. This is used on \"wide\" astrometry search (first one, and after important moves)");
    static narrowedFieldPercentHelp = Help.key("Max field variation", "Tolerance in % from the previous field estimation. This is used on \"narrow\" astrometry search (after successfull one, if no important moves occured in between");
    static useMountPositionHelp = Help.key("Use mount position", "Use the mount coordinates to fasten astrometry search. The first astrometry will use \"wide\" settings, then use narrower settings, unless the mount is moved substantially");

    accessor: BackendAccessor<AstrometrySettings>;
    
    constructor(props:Props) {
        super(props);
        this.accessor = new AstrometryBackendAccessor("$.astrometry.settings");
    }

    private setScope = async(deviceId:string)=> {
        return await BackendRequest.RootInvoker("astrometry")("setScope")(
            CancellationToken.CONTINUE,
            {
                deviceId
            }
        );
    }

    public render() {
        return (
        <div className="AstrometryWizardRootView">
            <div className="AstrometryWizardContent">

                <div className="AstrometryWizardSelectTitle">Astrometry Settings</div>

                <ScopeSelector setValue={this.setScope} helpKey={AstrometrySettingsView.scopeSelectorHelp}/>
                <DeviceConnectBton.forActivePath
                        activePath="$.backend.astrometry.selectedScope"
                        />
                <DeviceGeolocBton
                        activePath="$.backend.astrometry.selectedScope"
                        />
                <div>
                    <div>
                        Initial field range (°):
                        <Float accessor={this.accessor.child('initialFieldMin')} min={0} max={90} helpKey={AstrometrySettingsView.initialFieldHelp}/>
                        to
                        <Float accessor={this.accessor.child('initialFieldMax')} min={0} max={90} helpKey={AstrometrySettingsView.initialFieldHelp}/>
                    </div>

                    <div>
                        Max field variation (%):
                        <Int accessor={this.accessor.child('narrowedFieldPercent')} min={0} max={100} helpKey={AstrometrySettingsView.narrowedFieldPercentHelp}/>
                    </div>
                    <div>
                        <div>
                            Use mount position: <Bool accessor={this.accessor.child('useMountPosition')} helpKey={AstrometrySettingsView.useMountPositionHelp}/>
                        </div>
                        <Conditional accessor={this.accessor.child("useMountPosition")} condition={(e:boolean)=>(!e)}>
                        <div>
                            Initial search radius (°):
                            <Float accessor={this.accessor.child('initialSearchRadius')} min={0} max={180} helpKey={AstrometrySettingsView.initialSearchRadiusHelp}/>
                        </div>
                        <div>
                            Synced search radius (°):
                            <Float accessor={this.accessor.child('narrowedSearchRadius')} min={0} max={180}helpKey={AstrometrySettingsView.narrowedSearchRadiusHelp}/>
                        </div>
                        </Conditional>
                    </div>
                </div>
            </div>
            <div className="AstrometryWizardControls">
                <input type="button" value="Done" onClick={this.props.close}
                       className="WizardRightButton"
                    />
            </div>
        </div>);
    }
}