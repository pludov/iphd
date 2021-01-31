import * as React from 'react';
import * as Help from './Help';
import BaseApp from './BaseApp';
import ToolExecuterView from './ToolExecuterView';

export default class ToolsApp extends BaseApp {
    static help = Help.key("Tools", "Low level system tools (power off, ...)");

    constructor() {
        super("toolExecuter", ToolsApp.help);
    }

    getUi() {
        return (<div className="Page" key={this.appId}>
                    <ToolExecuterView />
                </div>);
    }
}
