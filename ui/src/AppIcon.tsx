import React, { Component } from 'react';
import { connect } from 'react-redux';
import * as Utils from './Utils';
import * as Help from './Help';
import './AppIcon.css';
import * as Store from './Store';
import * as Actions from './Actions';
import * as AppStore from './AppStore';
import { BackofficeStatus } from '@bo/BackOfficeStatus';
import { Notification } from './NotificationStore';

export type InputProps = {
    appid: string;
    helpKey: Help.Key;
};

export type MappedProps = {
    apps: BackofficeStatus["apps"];
    currentApp: Store.Content["currentApp"];
    notification: {[notifId: string]: Notification|undefined};
}

export type Props = InputProps & MappedProps;

class AppIcon extends React.PureComponent<Props> {
    constructor(props:Props)
    {
        super(props);
    }

    render() {
        var appId = this.props.appid;
        if (!this.props.apps) return null;
        if (!(appId in this.props.apps)) return null;
        if (!this.props.apps[appId].enabled) return null;
        let inner = null;
        if (this.props.notification !== undefined) {
            const notifs = this.props.notification;
            inner = Object.keys(notifs).sort().map(id=>
                {
                    const notif = notifs[id];
                    if (notif === undefined) {
                        return null;
                    }
                    return <span key={id} className={"Notification" + (notif.className ? " Notification_" + notif.className:"")}>{notif.text}</span>;
                });
        }
        return (
            <div id={"AppIcon_" + appId} className={'Application' + (this.props.currentApp == appId ? ' Active' : '')} onClick={this.activate}>
                <img  src={appId + ".png"} {...this.props.helpKey.dom()}></img>
                {inner}
            </div>);
    }

    private activate=()=>{
        Actions.dispatch<AppStore.AppActions>()("SwitchToApp", {value: this.props.appid});
    }
}

const mapStateToProps = function(store:Store.Content, ownProps:InputProps) {
    var result = {
        apps: store.backend.apps,
        currentApp: store.currentApp,
        notification: Utils.getOwnProp(store.notifs.byApp, ownProps.appid) || {error:true},
    };
    return result;
}

export default connect(mapStateToProps)(AppIcon);
