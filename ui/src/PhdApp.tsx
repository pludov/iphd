import React, { Component } from 'react';
import * as Help from './Help';
import BaseApp from './BaseApp';
import PhdView from './PhdView';


class PhdApp extends BaseApp {
    static help = Help.key("PHD", "Control PHD guiding");

    constructor() {
        super("phd", PhdApp.help);
    }

    getUi() {
        return <PhdView key={this.appId}></PhdView>;
    }
}

export default PhdApp;