import React, { Component, PureComponent} from 'react';
import BaseApp from './BaseApp';
import * as Help from './Help';
import AstrometryView from './AstrometryView';


export default class AstrometryApp extends BaseApp {
    static help = Help.key("Astrometry", "Use astrometry for telescope pointing and polar alignment");

    constructor() {
        super("astrometry", AstrometryApp.help);
    }

    getUi() {
        return (<div className="Page" key={this.appId}>
                    <AstrometryView />
                </div>);
    }
}