import * as React from 'react';
import Bool from './primitives/Bool';
import Int from './primitives/Int';
import Text from './primitives/Text';
import Conditional from './primitives/Conditional';
import './CameraView.css'
import * as Help from './Help';
import BackendAccessor from './utils/BackendAccessor';
import { FocuserSettings } from '@bo/BackOfficeStatus';

type Props = {
    accessor: BackendAccessor<FocuserSettings>;
}

export default class FocuserSettingsView extends React.PureComponent<Props> {
    static stepsHelp = Help.key("Steps#", "Number of focuser position to test.");
    static rangeHelp = Help.key("Range", "Number of focuser step to test around the starting position. Focuser will move for that ammount in both directions");
    static backlashHelp = Help.key("Backlash", "Number to use for backlash. The backlash is applied on first shoot, and also on final move");
    static lowestFirstHelp = Help.key("Lowest first", "Start the sequence from the lowest step values and grow. This logic also applies to backlash");
    static targetCurrentPosHelp = Help.key("Start from current pos", "Start the sequence from the current focuser position. Usefull to perform a focus check when already close to focus. If not set, a starting position is asked.");
    static targetPosHelp = Help.key("Target pos", "Target focuser position (center of the sequence).");

    constructor(props:Props) {
        super(props);
    }

    render() {
        // Range size
        return <div>
            <Int accessor={this.props.accessor.child('steps')} min={3} helpKey={FocuserSettingsView.stepsHelp}>
                Steps#
            </Int>
            <Int accessor={this.props.accessor.child("range")} min={10} helpKey={FocuserSettingsView.rangeHelp}>
                Range
            </Int>
            <Int accessor={this.props.accessor.child("backlash")} min={0} helpKey={FocuserSettingsView.backlashHelp}>
                Backlash
            </Int>

            <Bool accessor={this.props.accessor.child("lowestFirst")} helpKey={FocuserSettingsView.lowestFirstHelp}>
                Lowest first
            </Bool>
            <Bool accessor={this.props.accessor.child("targetCurrentPos")} helpKey={FocuserSettingsView.targetCurrentPosHelp}>
                Start from current pos
            </Bool>
            <Conditional accessor={this.props.accessor.child("targetCurrentPos")}>
                <Int accessor={this.props.accessor.child("targetPos")} min={0} helpKey={FocuserSettingsView.targetPosHelp}>
                    Target Pos
                </Int>
            </Conditional>
        </div>;
    }
}
