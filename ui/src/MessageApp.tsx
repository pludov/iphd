import React, { Component, PureComponent} from 'react';
import * as Help from './Help';
import BaseApp from './BaseApp';
import MessageView from './MessageView';


class MessageApp extends BaseApp {
    static help = Help.key("Notifications", "Keep track of notifications from various systems (indi, phd, system, ...)");

    constructor() {
        super("messages", MessageApp.help);
    }

    getUi() {
        var self = this;
        return (<div className="Page" key={self.appId}>
                    <MessageView />
                </div>);
    }
}

export default MessageApp;