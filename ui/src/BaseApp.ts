import * as React from 'react';
import * as Help from './Help';

/**
 * Created by ludovic on 25/07/17.
 */
export default class BaseApp {
    readonly appId: string;
    readonly helpKey : Help.Key;

    constructor(appId: string, helpKey: Help.Key) {
        this.appId = appId;
        this.helpKey = helpKey;
    }

    getAppId() {
        return this.appId;
    }

    getUi():null|React.ReactNode {
        return null;
    }
}
