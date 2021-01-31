import * as React from 'react';
import * as Help from './Help';
import BaseApp from './BaseApp';
import CameraView from './CameraView';

class CameraApp extends BaseApp {
    static help = Help.key("Camera", "Live control of cameras (settings, exposure)");

    constructor() {
        super("camera", CameraApp.help);
    }

    getUi() {
        return (<div className="Page" key={this.appId}>
                    <CameraView />
                </div>);
    }
}

export default CameraApp;