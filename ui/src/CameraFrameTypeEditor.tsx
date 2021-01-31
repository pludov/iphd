import React, { Component, PureComponent} from 'react';
import * as Help from './Help';
import * as IndiSelectorEditor from './IndiSelectorEditor';

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>

type InputProps = Omit<IndiSelectorEditor.InputProps, "vecName"|"helpKey">;

const cameraFrameTypeEditorHelp = Help.key("frame type", "Choose the frame type. Mobindi uses that for naming of files and statistics. This is also recorded in FITS files. It may have additional effect for the camera driver.");

export default function(ownProps:InputProps) {
    return <IndiSelectorEditor.default {...ownProps} helpKey={cameraFrameTypeEditorHelp} vecName="CCD_FRAME_TYPE"/>
}
