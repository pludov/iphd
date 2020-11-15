import * as React from "react";
import { connect as reduxConnect } from 'react-redux'
import * as Store from "../Store";
import * as Utils from "../Utils";

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>

type BaseInput = {
    deviceId: string|null;
}

type PathBasedInput = {
    deviceType: "cameraDevice"|"focuserDevice"|"filterWheelDevice";
}

export function forCurrentImagingSetup<TOwnProps extends BaseInput>(
        ctor: (new (props:TOwnProps)=>(React.PureComponent<TOwnProps>))
    )
        : new (props:Omit<TOwnProps, "deviceId">&PathBasedInput)=>(React.PureComponent<Omit<TOwnProps, "deviceId">&PathBasedInput>)
{
    return reduxConnect((state:Store.Content, t: Omit<TOwnProps, "deviceId">&PathBasedInput)=> {
        const {deviceType, ...rest} = t;
        const imagingSetupId = state.backend?.imagingSetup?.configuration.currentImagingSetup;
        const imagingSetup = Utils.getOwnProp(state.backend?.imagingSetup?.configuration?.byuuid, imagingSetupId);
        if (imagingSetup) {
            return {
                ...rest,
                deviceId: imagingSetup[deviceType],
            }
        }
        return {
            ...rest,
            deviceId: null,
        };
    }, null, null, {forwardRef:true} as any)(ctor as any) as any;
}
