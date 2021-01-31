import * as React from 'react';
import CancellationToken from 'cancellationtoken';

import { DitheringSettings } from '@bo/BackOfficeStatus';
import TextEdit from '../TextEdit';
import * as Help from '../Help';
import "./DitheringSettingEdit.css";

type Updater<T extends keyof DitheringSettings> = {field: T, value: DitheringSettings[T]}

type Props = {
    settings: DitheringSettings;
    update: (e:Updater<any>)=>(void);
}

export default class DitheringSettingEdit extends React.PureComponent<Props, {}> {
    static amountHelp = Help.key("Amount", "A random shift of the lock position by +/- PIXELS on each of the RA and Dec axes. The value is actually multiplied by the Dither Scale value in PHD2 (Brain button).");
    static raOnlyHelp = Help.key("RA-only", "If the RA-ONLY parameter is checked, or if the Dither RA Only option is set in PHD2 (brain button), the dither will only be on the RA axis.");
    static pixelsHelp = Help.key("Pixels", "Maximum guide distance for guiding to be considered stable or \"in-range\".");
    static timeHelp = Help.key("Time", "Minimum time to be in-range before considering guiding to be stable.");
    static timeoutHelp = Help.key("Timeout", "Time limit before settling is considered to have failed");

    constructor(props:Props) {
        super(props);
    }

    render() {
        return <div>
            <h1>Dithering settings</h1>
            <div className="DitheringSettingBlock">
                <h2>Move</h2>
                <div className="DitheringSettingExplain">
                    Adjust the distance and the direction of the dithering
                </div>
                <div className="DitheringSettingParam">
                    Amount:
                    <TextEdit
                            value={"" + this.props.settings.amount}
                            helpKey={DitheringSettingEdit.amountHelp}
                            onChange={(e:string)=> this.props.update({field: 'amount', value: parseFloat(e)})}/>
                </div>
                <div className="DitheringSettingParam">
                    RA-only: <input type="checkbox"
                            checked={!!this.props.settings.raOnly}
                            {...DitheringSettingEdit.raOnlyHelp.dom()}
                            onChange={(e)=>this.props.update({field: 'raOnly', value: !!e.target.checked})}/>
                </div>
            </div>
            <div className="DitheringSettingBlock">
                <h2>Settling</h2>

                <div className="DitheringSettingExplain">
                    Specify when PHD2 should consider guiding to be stable enough for imaging.
                </div>

                <div className="DitheringSettingParam">
                    Pixels:
                    <TextEdit
                            value={"" + this.props.settings.pixels}
                            helpKey={DitheringSettingEdit.pixelsHelp}
                            onChange={(e:string)=> this.props.update({field: 'pixels', value: parseFloat(e)})}/>
                </div>

                <div className="DitheringSettingParam">
                    Time:
                    <TextEdit
                            value={"" + this.props.settings.time}
                            helpKey={DitheringSettingEdit.timeHelp}
                            onChange={(e:string)=> this.props.update({field: 'time', value: parseInt(e)})}/>
                </div>
                <div className="DitheringSettingParam">
                    Timeout:
                    <TextEdit
                            value={"" + this.props.settings.timeout}
                            helpKey={DitheringSettingEdit.timeoutHelp}
                            onChange={(e:string)=> this.props.update({field: 'timeout', value: parseInt(e)})}/>
                </div>
            </div>

        </div>
    }

}
