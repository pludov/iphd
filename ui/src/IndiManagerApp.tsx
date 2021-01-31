/**
 * Created by ludovic on 25/07/17.
 */
import * as React from 'react';
import * as Help from './Help';
import BaseApp from './BaseApp';
import IndiManagerView from './indiview/IndiManagerView';

class IndiManagerApp extends BaseApp {
    static help = Help.key("Indi settings", "Control panel for indi devices");

    constructor() {
        super("indiManager", IndiManagerApp.help);
    }

    getUi() {
        return <IndiManagerView key={this.appId}></IndiManagerView>;
    }
}

export default IndiManagerApp;