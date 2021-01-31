import * as React from 'react';
import * as Help from './Help';
import BaseApp from './BaseApp';
import SequenceView from './Sequence/SequenceView';


class SequenceApp extends BaseApp {
    static help = Help.key("Imaging sequences", "Create and run exposure sequences coordinating filters, guiding, ...");

    constructor() {
        super("sequence", SequenceApp.help);
    }

    getUi() {
        return (<div className="Page" key={this.appId}>
                    <SequenceView />
                </div>);
    }
}

export default SequenceApp;