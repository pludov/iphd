import * as React from 'react';
import logo from './logo.svg';
import './App.css';

import AppIcon from './AppIcon';

import PhdApp from './PhdApp';
import IndiManagerApp from './IndiManagerApp';
import CameraApp from './CameraApp';
import SequenceApp from './SequenceApp';
import FocuserApp from './FocuserApp';
import AstrometryApp from './AstrometryApp';
import MessageApp from './MessageApp';
import ToolExecuterApp from './ToolExecuterApp';

import { BackendStatus } from './BackendStore';

import * as StoreInitialiser from './StoreInitialiser';
import * as Store from './Store';
import BaseApp from './BaseApp';
import * as ChartJSZoomBugfix from './utils/ChartJSZoomPlugin';
import NotificationContainer from './NotificationContainer';
import HelpOverlayView from './HelpOverlay';

ChartJSZoomBugfix.init();

/** Affiche un état pendant la connection */

StoreInitialiser.start();


type MappedProps = {
    backendStatus: Store.Content["backendStatus"];
    backendError: Store.Content["backendError"];
    currentApp: Store.Content["currentApp"];
}

type InputProps = {
}

type Props = InputProps&MappedProps;

class App extends React.PureComponent<Props> {
    apps: BaseApp[];

    constructor(props:Props) {
        super(props);

        this.apps = [
            new CameraApp(),
            new SequenceApp(),
            new PhdApp(),
            new FocuserApp(),
            new AstrometryApp(),
            new IndiManagerApp(),
            new ToolExecuterApp(),
            new MessageApp()
        ];
    }

    render() {
        var bs = this.props.backendStatus;
        switch (bs) {
            case BackendStatus.Idle:
            case BackendStatus.Connecting:
                return (
                    <>
                        <NotificationContainer/>
                        <div className="Loading">
                                <h2>MOBINDI</h2>
                                <h4>Mobile Indi Control Panel</h4>
                                <img src={logo} className="App-logo" alt="logo"/>
                                <h2>Initialisation...</h2>
                        </div>
                    </>);
            case BackendStatus.Failed:
                return (
                    <>
                        <NotificationContainer/>
                        <div className="Loading">
                                <h2>MOBINDI</h2>
                                <h4>Mobile Indi Control Panel</h4>
                                <img src={logo} className="App-logo" alt="logo"/>
                                <h2>Backend problem {(this.props.backendError ? " : " + this.props.backendError : null)}</h2>
                        </div>
                    </>);
            case BackendStatus.Connected:
            case BackendStatus.Paused:
                return (
                    <>
                        <NotificationContainer/>
                        <HelpOverlayView/>
                        <div className="App">
                            <div className="AppStatusBar">
                                {
                                    this.apps.map((app) => <AppIcon key={app.getAppId()} appid={app.getAppId()} helpKey={app.helpKey}/>)
                                }
                            </div>

                            <div className="AppMainContent">
                                {
                                    this.apps.map((app) => (app.getAppId() === this.props.currentApp ? app.getUi() : null))
                                }
                            </div>
                        </div>
                    </>);
            default:
                // C'est l'application par défaut.
                return (this.props.children || null);
        }
    }

    static mapStateToProps = function(store:Store.Content, props:InputProps):MappedProps {
        return {
            backendStatus: store.backendStatus,
            backendError: store.backendError,
            currentApp: store.currentApp
        };
    }
}

export default Store.Connect(App);
