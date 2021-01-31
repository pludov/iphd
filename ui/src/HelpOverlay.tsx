import * as React from 'react';
import IconButton from './IconButton';
import Icons from './Icons';
import * as Help from './Help';
import './HelpOverlay.css';



type HelpItem = {
    id: string;
    areas: Array<HelpArea>;
}

type HelpArea = {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
}


type Props = {};

type State = {
    open: boolean;
    zones: Array<HelpItem>;
    selected?: string;
    bubblePos?: string;
}

export default class HelpOverlayView extends React.PureComponent<Props, State> {
    constructor(props : Props) {
        super(props);
        this.state = {open: false, zones: []};
    }

    componentDidUpdate() {
    }

    componentDidMount() {
        document.addEventListener('keydown', this.handleKey);
    }

    componentWillUnmount() {
        document.removeEventListener('keydown', this.handleKey);
    }

    openHelp = ()=>{
        this.setState({open: true, zones: getHelpZones(), selected: undefined});
    }

    closeHelp = ()=>{
        this.setState({open: false, zones: [], selected: undefined});
    }

    handleKey = (evt:KeyboardEvent)=> {
        if (this.state.open) {
            console.log(evt);
            if (evt.key === "Escape" || evt.key === "Esc") {
                evt.preventDefault();
                this.closeHelp();
            }
        }
    }

    activateZone = (id:string|undefined)=>{
        let bubblePos = "center";
        let hits = [0,0,0];
        let limits = [0, document.body.clientHeight / 3, 2 * document.body.clientHeight / 3, document.body.clientHeight];
        for(const zone of this.state.zones) {
            if (zone.id === id) {
                for(const rect of zone.areas) {
                    for(let i = 0; i < hits.length; ++i) {
                        if (rect.y + rect.h < limits[i] || rect.y > limits[i + 1]) {
                            continue;
                        }
                        hits[i]++;
                    }
                }
            }
        }
        if (!hits[1]) {
            bubblePos = "center";
        } else if (!hits[0]) {
            bubblePos = "top";
        } else if (!hits[2]) {
            bubblePos = "bottom";
        }
        this.setState({selected: id, bubblePos});
    }

    closeBubble = ()=>{
        this.activateZone(undefined);
    }

    static getHelpForKey = (id:string)=>{
        const key = Help.Key.byId(id);
        if (!key) {
            return "Missing help key";
        }

        return <>
            {key.title === undefined || <div className="HelpTitle">{key.title}</div>}
            {key.details === undefined || <div className="HelpContent">{typeof key.details === "string" ? key.details : key.details()}</div>}
        </>;
    }

    render() {
        return <>
                <img key="button" className="HelpButton" src={Icons.help} onClick={this.openHelp}
                    style={this.state.open ? {visibility: "hidden"} : {}}
                    />

                {(!this.state.open) ||
                    <div className="HelpOverlay" onClick={(e)=>this.activateZone(undefined)}>
                        <img key="button" className="HelpButton HelpButtonClose" src={Icons.apply} onClick={this.closeHelp}/>

                        {this.state.zones.map((zone)=>
                            zone.areas.map((area)=>
                                <div className={"HelpArea" + (zone.id === this.state.selected ? " Selected" : "")}
                                    id={zone.id + ":" + area.id}
                                    onClick={(e)=>{e.preventDefault(); e.stopPropagation(); this.activateZone(zone.id)}}
                                    style={({
                                        left: area.x,
                                        top: area.y,
                                        width: area.w,
                                        height: area.h,
                                    })}
                                />
                            )
                        )}

                        {this.state.zones.map((zone)=>
                            (zone.id !== this.state.selected)
                            || <div className={"HelpBubble HelpBubble_" + this.state.bubblePos}>
                                    {HelpOverlayView.getHelpForKey(zone.id)}
                                    <div className="HelpControlBar">
                                        <img className="closeHelpBubbleButton" src={Icons.apply} onClick={this.closeBubble}/>
                                    </div>
                                </div>
                        )}
                    </div>
                }
        </>
    }

    public static define(label: string)
    {
        return label;
    }
}


function isSameOrChild(parent: Element, child: Element|null)
{
    while(child !== null) {
        if (parent === child) {
            return true;
        }
        child = child.parentElement;
    }
    return false;
}

function getHelpZones() {
    let result: Array<HelpItem> = [];
    const elements = document.querySelectorAll("[data-help]");
    for(let i = 0 ; i < elements.length; ++i) {
        const element = elements[i];
        const width = element.clientWidth;
        const height = element.clientHeight;
        const visibleArea = element.getClientRects();
        let visible = false;

        let areas : Array<HelpArea> = []
        for(let rectId = 0 ; rectId < visibleArea.length; ++rectId) {
            const rect = visibleArea[rectId];
            if (rect.width === 0 || rect.height === 0) {
                continue;
            }
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;

            const checked = document.elementFromPoint(cx, cy);
            if (!isSameOrChild(element, checked)) {
                continue;
            }

            areas.push({
                x: rect.left,
                y: rect.top,
                w: rect.width,
                h: rect.height,
                id: "" + areas.length,
            });
            visible = true;
        }
        if (visible) {
            result.push({
                id: (element as any).dataset.help,
                areas
            });
        }
    }
    console.log('Help is ', result);
    return result;
}


(window as any).triggerHelp = function() {
    getHelpZones();
}