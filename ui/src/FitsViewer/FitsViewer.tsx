
import React, { Component, PureComponent, ReactElement} from 'react';
import $ from 'jquery';
import * as Obj from '../shared/Obj';
import * as Help from '../Help';
import './FitsViewer.css'
import MouseMoveListener from '../MouseMoveListener';
import ContextMenu from './ContextMenu';
import LevelBar from './LevelBar';
import FWHMDisplayer from './FWHMDisplayer';
import BaseApp from 'src/BaseApp';
import ContextMenuCross from './ContextMenuCross';
import ReactResizeDetector from 'react-resize-detector';
import Histogram from './Histogram';
import FloatContainer from '../FloatContainer';
import FloatWindow from '../FloatWindow';
import FloatWindowMover from '../FloatWindowMover';

export type LevelId = "low"|"medium"|"high";

type ImageSize = {
    width: number;
    height: number;
}

export type Levels = {
    low: number;
    medium: number;
    high: number;
}

export type FullState = {
    levels: Levels;
}

type ImagePos = {
    x:number;
    y:number;
    w:number;
    h:number;
}

// When content is actually a subframe
// Gives actual margin in 0-1 range
type Window = {
    top: number;
    left: number;
    bottom: number;
    right: number;
};

type CompleteImagePos = ImagePos & {
    centerx: number;
    centery: number;
    zoomToBestfit: number;
};

export type ContextMenuEntry = {
    title: string;
    key: string;
    cb: (e:ContextMenuEvent)=>(void);
    positional?: boolean;
    helpKey: Help.Key;
}

export type ContextMenuEvent = {
    x: number;
    y: number;
    imageX?: number;
    imageY?: number;
}

const imageReleaseUrl = "about:blank";

function killImgLoad(img:HTMLImageElement) {
    if (img.src !== imageReleaseUrl) {
        img.src = imageReleaseUrl;
    }
}

class JQImageDisplay {

    currentImg: HTMLImageElement|null = null;
    // The path (without cgi settings)
    currentImgPath: string|null = null;
    currentImgSerial: string|null = null;
    currentImgWindow: Window|null = null;
    // Same with cgi settings ?
    currentImgSrc: string|null = null;

    currentDetails:ImageSize|null = null;
    currentDetailsPath: string|null = null;
    currentDetailsSerial: string|null = null;
    currentDetailsWindow: Window|null = null;

    loadingDetailsAjax:JQueryXHR|null = null;
    loadingDetailsPath:string|null = null;
    loadingDetailsSerial:string|null = null;
    loadingDetailsWindow: Window|null = null;

    loadingImg:HTMLImageElement|null = null;

    // The path (without cgi settings)
    loadingImgSrc:string|null = null;
    loadingImgPath:string|null = null;
    loadingImgSerial:string|null = null;
    loadingImgWindow: Window|null = null;

    loadingToDisplay?:boolean = false;
    nextLoadingImgSrc:string|null = null;
    nextLoadingImgSerial:string|null = null;
    nextLoadingImgSize: ImageSize|undefined = undefined;
    nextLoadingImgWindow: Window|null = null;
    
    child:JQuery<HTMLDivElement>;
    
    levels: Levels;

    
    currentImageSize:ImageSize = {width: -1, height: -1};
    currentImagePos:CompleteImagePos = {x:0, y:0, w:0, h:0, centerx: 0.5, centery: 0.5, zoomToBestfit: 1};

    menuTimer:NodeJS.Timeout|null = null;
    directPort: number = parseInt(document.location.port);

    closeContextMenuCb:()=>void;
    onViewSettingsChangeCb:(state:FullState)=>void;
    contextMenuCb:(x:number, y:number)=>void;
    posUpdatedCb:(pos: ImagePos, size: ImageSize)=>(void);

    mouseListener: MouseMoveListener;

    constructor(elt:JQuery<HTMLDivElement>, contextMenuCb:(x:number, y:number)=>void, closeContextMenuCb:()=>void, onViewSettingsChangeCb:(state:FullState)=>void, posUpdatedCb:(pos: ImagePos, size: ImageSize)=>(void)) {
        
        this.child = elt;
        this.contextMenuCb = contextMenuCb;
        this.closeContextMenuCb = closeContextMenuCb;
        this.onViewSettingsChangeCb = onViewSettingsChangeCb;
        this.posUpdatedCb = posUpdatedCb;
        elt.css('display', 'block');
        elt.css('width', '100%');
        elt.css('height', '100%');
        elt.css('overflow', 'hidden');

        this.mouseListener = new MouseMoveListener(elt, {
            zoom: this.zoom,
            drag:(dx:number, dy:number)=>this.setCurrentImagePos({
                x: this.currentImagePos.x + dx,
                y: this.currentImagePos.y + dy,
                w: this.currentImagePos.w,
                h: this.currentImagePos.h
            }),
            endDrag: ()=>{},
            openContextMenu: this.contextMenuCb,
            closeContextMenu: this.closeMenu,
        });

        this.levels = {
            low: 0.05,
            medium: 0.5,
            high: 0.95
        };
    }

    onResize = ()=>{
        const newSize = {x: this.child.width(), y:this.child.height() };
        if (newSize.x === undefined) return;
        if (newSize.y === undefined) return;

        if (this.currentImageSize.width === -1) return;
        if (this.currentImageSize.height === -1) return;

        const centerX = this.currentImageSize.width * this.currentImagePos.x;
        const centerY = this.currentImageSize.height * this.currentImagePos.y;
        const bestFit = this.getBestFit();

        bestFit.w *= this.currentImagePos.zoomToBestfit;
        bestFit.h *= this.currentImagePos.zoomToBestfit;
        // Center at centerX, centerY
        bestFit.x  = newSize.x / 2 - bestFit.w * this.currentImagePos.centerx;
        bestFit.y  = newSize.y / 2 - bestFit.h * this.currentImagePos.centery;

        bestFit.centerx = this.currentImagePos.zoomToBestfit;
        bestFit.centery = this.currentImagePos.zoomToBestfit;
        bestFit.zoomToBestfit = this.currentImagePos.zoomToBestfit;

        this.setCurrentImagePos(bestFit);
    }



    dispose() {
        this.mouseListener.dispose();

        this.abortDetailsLoading();
        this.abortLoading();
        if (this.currentImg !== null) {
            killImgLoad(this.currentImg);
        }
    }

    abortDetailsLoading()
    {
        if (this.loadingDetailsAjax !== null) {
            var toCancel = this.loadingDetailsAjax;
            this.loadingDetailsAjax = null;
            this.loadingDetailsPath = null;
            toCancel.abort();
            this.child.removeClass('PreLoading');
        }
    }

    abortLoading() {
        if (this.loadingImg !== null) {
            if (this.loadingToDisplay) {
                if (this.loadingImg.parentNode != null) {
                    this.loadingImg.parentNode!.removeChild(this.loadingImg);
                }
                this.loadingToDisplay = false;
            }
            killImgLoad(this.loadingImg);
            // this.loadingImg.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEAAAAALAAAAAABAAEAAAI=;';
            this.loadingImg = null;
            this.loadingImgPath = null;
            this.loadingImgSrc = null;
            this.nextLoadingImgSrc = null;
            this.nextLoadingImgSerial = null;
            this.child.removeClass('Loading');
        }
    }
    
    getFullState(): FullState
    {
        return {
            levels: {...this.levels}
        }
    }

    changeLevels(f:(l:Levels)=>(boolean))
    {
        if (!f(this.levels)) {
            return false;
        }
        this.emitStateChange();
        return true;
    }

    computeSrc(path:string|null, serial: string|null, optionalImageSize?:ImageSize)
    {
        const imageSize = optionalImageSize || this.currentImageSize;
        let str;
        if (path !== null) {
            if (path === undefined ){
                throw new Error("Undefined path arrived");
            }
            var bin = 16;
            if (this.currentImagePos.w > 0 && this.currentImagePos.h > 0
                 && imageSize.width  > -1 && imageSize.height > -1)
            {
                bin = Math.floor(Math.min(
                    imageSize.width / this.currentImagePos.w,
                    imageSize.height / this.currentImagePos.h
                ));
            } else if (imageSize.width > 0 && imageSize.height > 0) {
                // Prepare for a best fit
                const bestFit = this.getBestFitForSize(imageSize);
                bin = Math.floor(Math.min(
                    imageSize.width / bestFit.w,
                    imageSize.height / bestFit.h
                ));
            }

            // lower this to a 2^power
            bin = Math.floor(Math.log2(bin));
            if (bin < 0) {
                bin = 0;
            }

            const env = process.env.NODE_ENV;
            if (document.location.protocol === 'https:' || env === 'development') {
                str = "http://" + document.location.hostname + ":" + this.directPort + (document.location.pathname.replace(/\/[^/]+/, '') || '/');
            } else {
                str = "";
            }
            str += 'fitsviewer/fitsviewer.cgi?bin=' + bin + '&' + this.encodePathUrl(path);
            str += '&low=' + this.levels.low;
            str += '&med=' + this.levels.medium;
            str += '&high=' + this.levels.high;
            if (serial !== null) {
                str += "&serial=" + encodeURIComponent(serial);
            }
        } else {
            str = imageReleaseUrl;
        }
        return str;
    }

    emitStateChange()
    {
        this.onViewSettingsChangeCb(this.getFullState());
    }

    encodePathUrl(path: string) {
        if (path.startsWith("file:")) {
            return 'path=' + encodeURIComponent(path.substring(5));
        } else if (path.startsWith("stream:")) {
            return 'streamid=' + encodeURIComponent(path.substring(7));
        } else {
            throw new Error("invalid path: " + path);
        }
    }

    private windowEquals(w1 : Window|null, w2: Window|null) {
        if ((w1 === null) != (w2 === null)) {
            return false;
        }
        if (w1 === null || w2 === null) {
            return true;
        }
        return (w1.top === w2.top)
            && (w1.bottom === w2.bottom)
            && (w1.left === w2.left)
            && (w1.right === w2.right);
    }

    private applyWindow(img: HTMLImageElement, window: Window|null) {
        const jqimg = $(img);

        if (window !== null) {
            const h = jqimg.css("height");
            jqimg.css("padding-top", `calc( ${window.top} * ${h} )`);
            jqimg.css("padding-bottom", `calc( ${window.bottom} * ${h} )`);
            const w = jqimg.css("width");
            jqimg.css("padding-left", `calc( ${window.left} * ${w} )`);
            jqimg.css("padding-right", `calc( ${window.right} * ${w} )`);
        } else {
            jqimg.css("padding-top", "0");
            jqimg.css("padding-bottom", "0");
            jqimg.css("padding-left", "0");
            jqimg.css("padding-right", "0");
        }
    }

    setFullState(file: string|null, streamId:string|null, streamSerial: string|null, window: Window|null, directPort: number, params?:FullState, imageSize?: ImageSize) {
        // Don't display stream until ready
        if (streamId !== null && !imageSize) {
            streamId = null;
        }

        this.directPort = directPort;

        const path = file ? "file:" + file : streamId ? "stream:" + streamId : null;

        if (params !== undefined && 'levels' in params) {
            this.levels = params.levels;
        }
        // FIXME: c'est ici qu'il faut continuer:
        // il faut assurer qu'on charge la taille avant, que computeurl dépende de la taille
        // et implementer le downsampling coté serveur
        // et revoir le témoin de chargement
        if (this.loadingImg !== null && this.loadingImgPath === path) {
            const newSrc = this.computeSrc(path, streamSerial);
            if (this.loadingImgSrc === newSrc) {
                if (!this.windowEquals(this.loadingImgWindow, window)) {
                    this.loadingImgWindow = window;
                    if (this.loadingToDisplay) {
                        this.applyWindow(this.loadingImg,  this.loadingImgWindow);
                    }
                }
                // Already loading... Just wait...
                this.nextLoadingImgSrc = null;
                this.nextLoadingImgSerial = null;
                this.nextLoadingImgSize = undefined;
                this.nextLoadingImgWindow = null;
            } else {
                // Enqueue the loading
                this.nextLoadingImgSrc = newSrc;
                this.nextLoadingImgSerial = streamSerial;
                this.nextLoadingImgSize = imageSize;
                this.nextLoadingImgWindow = window;
            }
        } else {
            this.nextLoadingImgSrc = null;
            this.nextLoadingImgSerial = null;
            this.nextLoadingImgSize = undefined;
            this.nextLoadingImgWindow = null;
            if (this.currentImgPath !== path) {
                if (!this.setDetails(path, window, imageSize)) {
                    // Stop loading for previous path
                    this.abortLoading();
                } else {
                    // Ready for new url. go
                    const newSrc = this.computeSrc(path, streamSerial);
                    this.setSrc(path, streamSerial, newSrc, window);
                }
            } else {
                // Ready for new url. go
                // Don't go back...
                this.abortDetailsLoading();

                // use new details if provided
                if (imageSize !== undefined) {
                    this.currentDetails = imageSize;
                }

                const newSrc = this.computeSrc(path, streamSerial);
                this.setSrc(path, streamSerial, newSrc, window);
            }
        }
    }

    // True if ready, false otherwise
    private setDetails(path:string|null, window: Window|null, imageSize?: ImageSize)
    {
        if (this.currentDetailsPath === path) {
            this.abortDetailsLoading();
            if (imageSize) {
                this.currentDetails = imageSize;
            }
            this.currentDetailsWindow = window;
            return true;
        }

        if (imageSize) {
            this.abortDetailsLoading();
            this.currentDetailsPath = path;
            this.currentDetails = imageSize;
            this.currentDetailsWindow = window;
            return true;
        }

        if ((this.loadingDetailsAjax !== null) && this.loadingDetailsPath === path) {
            this.loadingDetailsWindow = window;
            return false;
        }

        this.abortDetailsLoading();

        // Start an ajax load of the new path
        this.loadingDetailsPath = path;
        this.loadingDetailsWindow = window;
        this.child.addClass('PreLoading');
        if (path === null) {
            this.gotDetails(path, null);
            return true;
        } else {
            this.loadingDetailsAjax = $.ajax({
                url: 'fitsviewer/fitsviewer.cgi?size=true&' + this.encodePathUrl(path),
                dataType: 'json',
                error: (e)=>{
                    console.log('size query had error', e);
                    this.gotDetails(path, null);
                },
                success: (d)=> {
                    console.log('Size is ', d);
                    this.gotDetails(path, d);
                },
                timeout: 30000
            });
        }
        return false;
    }

    private gotDetails(path:string|null, rslt:ImageSize|null)
    {
        // FIXME: ajax request can be reordered (right path with the wrong request, is it important ?)
        if (path !== this.loadingDetailsPath) {
            console.log('Ignore late size result');
            return;
        }
        this.currentDetailsPath = this.loadingDetailsPath;
        this.currentDetailsSerial = this.loadingDetailsSerial;
        this.currentDetailsWindow = this.loadingDetailsWindow;
        this.currentDetails = rslt;
        this.loadingDetailsPath = null;
        this.loadingDetailsSerial = null;
        this.loadingDetailsAjax = null;
        this.loadingDetailsWindow = null;
        this.child.removeClass('PreLoading');
        if (rslt !== null) {
            this.setSrc(this.currentDetailsPath, this.currentDetailsSerial, this.computeSrc(this.currentDetailsPath, this.currentDetailsSerial, rslt), this.currentDetailsWindow);
        } else {
            this.setSrc(this.currentDetailsPath, this.currentDetailsSerial, imageReleaseUrl, this.currentDetailsWindow);
        }
    }

    public flushView()
    {
        if (this.loadingImg !== null && this.nextLoadingImgSrc !== null) {
            this.setSrc(this.loadingImgPath!, this.loadingImgSerial, this.nextLoadingImgSrc, this.nextLoadingImgWindow);
        }
    }

    private setSrc(path:string|null, serial: string|null, src: string, window: Window|null) {
        if (this.currentImgSrc === src) {
            this.abortLoading();
            this.currentImgPath = path;
            this.currentImgSerial = serial;
            if (!this.windowEquals(this.currentImgWindow, window)) {
                this.currentImgWindow = window;
                this.applyWindow(this.currentImg!, this.currentImgWindow);
            }
            return;
        }
        if ((this.loadingImg !== null) && (this.loadingImgSrc === src)) {
            if (!this.windowEquals(this.loadingImgWindow, window)) {
                this.loadingImgWindow = window;
                if (this.loadingToDisplay) {
                    this.applyWindow(this.loadingImg, this.loadingImgWindow);
                }
            }
            return;
        }

        this.abortLoading();

        const newImage = new Image();
        newImage.addEventListener("load", () => {
                console.log('image loaded', newImage.src);
                console.warn('image loaded ok');
                this.loaded(src, newImage, true)
        });
        newImage.addEventListener("error", (e) => {
                console.log('image error', newImage.src);
                console.warn('image loading failed', e);
                this.loaded(src, newImage, false) ;
        });
        newImage.src = src;
        $(newImage).css('display', 'block');
        $(newImage).css('pointer-events', 'none');
        $(newImage).css('box-sizing', 'border-box');
        $(newImage).css('border', '0px');
        console.log('Loading image: ', (newImage as any).debugid, src);
        if (this.loadingImg !== null) {
            if (this.loadingImg.parentElement) {
                this.loadingImg.parentElement.removeChild(this.loadingImg);
            }
            killImgLoad(this.loadingImg);
        }
        this.loadingImg = newImage;
        this.loadingImgSrc = src;
        this.loadingImgSerial = serial;
        this.loadingImgPath = path;
        this.loadingImgWindow = window;

        // Do exposed loading if possible (display image while it is loading)
        // FIXME: only for image of the same geo ?
        // FIXME: some browser  flickers to black. whitelist browser ?
        if (this.currentImg !== null && this.currentImgPath === this.loadingImgPath) {
            this.loadingToDisplay = true;
            $(this.loadingImg).css('position', 'absolute');
            $(this.loadingImg).css("width", $(this.currentImg).css("width"));
            $(this.loadingImg).css("height", $(this.currentImg).css("height"));
            $(this.loadingImg).css('top', $(this.currentImg).css("top"));
            $(this.loadingImg).css('left', $(this.currentImg).css("left"));
            this.applyWindow(this.loadingImg, this.loadingImgWindow);
            this.child.append(this.loadingImg);
        } else {
            this.loadingToDisplay = false;
        }

        this.child.addClass('Loading');
        this.child.removeClass('Error');
    }

    private loaded(newSrc:string, newImage:HTMLImageElement, result: boolean) {
        if (newImage !== this.loadingImg) {
            console.log('ignoring loaded for old image: ', newImage, this.loadingImg);
            return;
        }

        this.child.removeClass('Loading');
        if (result) {
            this.child.addClass('Success');
        } else {
            this.child.addClass('Error');
        }

        var previousSize = this.currentImageSize;

        var previousImg = this.currentImg;
        var previousImgSrc = this.currentImgSrc;

        this.loadingImg = null;
        this.currentImg = result ? newImage : null;
        this.currentImgSrc = newSrc;
        this.currentImgPath = this.loadingImgPath;
        this.currentImgSerial = this.loadingImgSerial;
        this.currentImgWindow = this.loadingImgWindow;
        this.child.empty();

        if (this.currentImg !== null) {
            this.currentImageSize = this.currentDetails!;
            
            $(this.currentImg).css('position', 'relative');

            this.child.append(this.currentImg);

            if (previousImg === null || previousSize.width != this.currentImageSize.width || previousSize.height != this.currentImageSize.height) {
                this.bestFit();
            } else {
                $(this.currentImg).css('top', $(previousImg).css('top'));
                $(this.currentImg).css('left', $(previousImg).css('left'));
                $(this.currentImg).css('width', $(previousImg).css('width'));
                $(this.currentImg).css('height', $(previousImg).css('height'));
            }
            this.applyWindow(this.currentImg, this.currentImgWindow);
        }

        if (this.nextLoadingImgSrc !== null) {
            const todoSrc = this.nextLoadingImgSrc;
            const todoSerial = this.nextLoadingImgSerial;
            const todoWindow = this.nextLoadingImgWindow;
            this.nextLoadingImgSrc = null;
            this.nextLoadingImgSerial = null;
            this.nextLoadingImgWindow = null;
            this.setSrc(this.currentImgPath, todoSerial, todoSrc, todoWindow);
        }
        if (previousImg !== null) {
            killImgLoad(previousImg);
        }
    }

    closeMenu=()=>{
        this.closeContextMenuCb();
    }

    readonly getImagePosFromParent=(x:number, y:number):{imageX:number, imageY:number}|null=>
    {
        console.log('Translate : ' ,x ,y, this.currentImagePos, this.currentImageSize);
        if ((this.currentImageSize.width <= 0) || (this.currentImageSize.height <= 0)) {
            return null;
        }
        if (this.currentImagePos.w <= 0 || (this.currentImagePos.h <= 0)) {
            return null;
        }

        return {
            imageX: (x - this.currentImagePos.x) * this.currentImageSize.width / this.currentImagePos.w,
            imageY: (y - this.currentImagePos.y) * this.currentImageSize.height / this.currentImagePos.h,
        }
    }

    public readonly zoom=(cx:number, cy:number, z:number)=>{
        var corners = [
            [this.currentImagePos.x, this.currentImagePos.y],
            [this.currentImagePos.x + this.currentImagePos.w, this.currentImagePos.y + this.currentImagePos.h]
        ];

        var newCorners = [[0,0],[0,0]];
        var center = [cx, cy];
        for(var pt = 0; pt < corners.length; ++pt) {
            for(var i = 0; i < 2; ++i) {
                newCorners[pt][i] = center[i] + (corners[pt][i] - center[i]) * z;
            }
        }
        var newPos = {
            x: newCorners[0][0],
            y: newCorners[0][1],
            w: newCorners[1][0] - newCorners[0][0],
            h: newCorners[1][1] - newCorners[0][1]
        };
        //window.alert('setting newpos:' + JSON.stringify(newPos));
        this.setCurrentImagePos(newPos);
    }

    private dispatchNewPos(pos: ImagePos, size: ImageSize) {
        this.posUpdatedCb(pos, size);
    }

    private setRawCurrentImagePos(e:CompleteImagePos) {
        if (this.currentImg !== null) {
            $(this.currentImg).css("width", e.w + 'px');
            $(this.currentImg).css("height", e.h + 'px');
            $(this.currentImg).css('top', e.y + 'px');
            $(this.currentImg).css('left', e.x + 'px');
            this.dispatchNewPos(e, this.currentImageSize);
            this.applyWindow(this.currentImg, this.currentImgWindow);
            if(this.loadingToDisplay) {
                $(this.loadingImg!).css("width", e.w + 'px');
                $(this.loadingImg!).css("height", e.h + 'px');
                $(this.loadingImg!).css('top', e.y + 'px');
                $(this.loadingImg!).css('left', e.x + 'px');
                this.applyWindow(this.loadingImg!, this.loadingImgWindow);
            }
        }
        this.currentImagePos = e;
    }

    setCurrentImagePos(imgPos:ImagePos) {
        let targetPos: CompleteImagePos;
        const viewSize = { x: this.child.width()!, y: this.child.height()!};
        // prevent zoom under 1.
        if (imgPos.w < viewSize.x && imgPos.h < viewSize.y) {
            targetPos = this.getBestFit();
        } else {
            // Prevent black borders
            targetPos = {...imgPos,
                centerx: (viewSize.x / 2 - imgPos.x) / imgPos.w,
                centery: (viewSize.y / 2 - imgPos.y) / imgPos.h,
                zoomToBestfit: Math.max(imgPos.w/viewSize.x, imgPos.h/viewSize.y)
            };
            const marginX = (targetPos.w < viewSize.x) ? (viewSize.x - targetPos.w) / 2 : 0;
            const minx = marginX;
            const maxx = viewSize.x - marginX;


            const marginY = (targetPos.h < viewSize.y) ? (viewSize.y - targetPos.h) / 2 : 0;
            const miny = marginY;
            const maxy = viewSize.y - marginY;

            if (targetPos.x > minx) {
                targetPos.x = minx;
            }
            if (targetPos.y > miny) {
                targetPos.y = miny;
            }
            if (targetPos.x + targetPos.w < maxx) {
                targetPos.x = maxx - targetPos.w;
            }
            if (targetPos.y + targetPos.h < maxy) {
                targetPos.y = maxy - targetPos.h;
            }
        }
        this.setRawCurrentImagePos(targetPos);

        // Adjust the bin
        if (this.loadingDetailsPath === null) {
            // No path change. Make sure the path is the latest
            let path, serial, window;
            if (this.loadingImgPath !== null) {
                path = this.loadingImgPath;
                serial = this.loadingImgSerial;
                window = this.loadingImgWindow;
            } else {
                path = this.currentImgPath;
                serial = this.currentImgSerial;
                window = this.currentImgWindow;
            }
            const newSrc = this.computeSrc(path!, serial);
            this.setSrc(path, serial, newSrc, window);
        }
    }

    getBestFit():CompleteImagePos {
        return {
            ...this.getBestFitForSize(this.currentImageSize),
            centerx: 0.5,
            centery: 0.5,
            zoomToBestfit: 1.0,
        };
    }

    getBestFitForSize(imageSize:ImageSize) {
        var viewSize = { width: this.child.width()!, height: this.child.height()!};

        if (imageSize.width == 0
            || imageSize.height == 0
            || viewSize.width == 0
            || viewSize.height == 0)
        {
            // Don't bother
            return {x: 0, y:0, w: viewSize.width, h: viewSize.height};

        }
        // If image is larger than view
        // imageSize.x / imageSize.y > viewSize.x / viewSize.y
        // imageSize.x * viewSize.y > viewSize.x * imageSize.y
        else if (imageSize.width * viewSize.height > viewSize.width * imageSize.height) {
            // scale for width and adjust height
            var heightInClient = viewSize.width * imageSize.height / imageSize.width;
            return {x: 0, y:(viewSize.height - heightInClient) / 2, w: viewSize.width, h: heightInClient};
        } else {
            // Scale for height and adjust width
            var widthInClient = viewSize.height * imageSize.width / imageSize.height;
            return {x: ((viewSize.width - widthInClient) / 2), y:0, w: widthInClient, h: viewSize.height};
        }
    }

    // Max zoom keeping aspect ratio
    bestFit() {
        // Move the img
        this.setCurrentImagePos(this.getBestFit());
    }
}

let uid:number = 0;

export type Props = {
    path: string|null;
    streamId: string|null;
    streamSerial: string|null;
    subframe?: Window|null;
    streamSize: ImageSize|null;
    viewSettings?: Partial<FullState>;
    contextMenu?: ContextMenuEntry[];
    directPort: number;
    onViewSettingsChange: (state: FullState)=>(void);
};

export type State = {
    contextmenu: {x:number, y:number}|null;
    histogramView: null|LevelId;
    histogramWindow: boolean;
    fwhm: boolean;
};

export class MarkerToken {
    private readonly el: React.RefObject<HTMLDivElement>;
    private readonly fv: FitsViewer;
    private readonly uid: string;
    private imgx:number;
    private imgy:number;
    private pos?: ImagePos;
    private size?: ImageSize;

    constructor(fv: FitsViewer, uid:string, el: React.RefObject<HTMLDivElement>) {
        this.el = el;
        this.fv = fv;
        this.uid = uid;
        this.imgx = NaN;
        this.imgy = NaN;
        console.log('new marker', uid);
    }

    private doSetPosition=()=>{
        if (this.pos === undefined || this.size === undefined) {
            return;
        }
        if (isNaN(this.imgx) || isNaN(this.imgy)) {
            return;
        }
        const elem = this.el.current;
        if (elem === null) {
            return;
        }

        let pos = this.size.width >= 1 && this.size.height >= 1
            ?
                {
                    x: this.pos.x + this.imgx * this.pos.w / this.size.width,
                    y: this.pos.y + this.imgy * this.pos.h / this.size.height,
                }
            :
                {
                    x: this.imgx,
                    y: this.imgy,
                };
        elem.style.left = pos.x + "px";
        elem.style.top = pos.y + "px";
    }

    public setPosition=(x:number, y:number)=>{
        this.imgx = x;
        this.imgy = y;
        this.doSetPosition();
    }

    free=()=>{
        this.fv.killMarker(this.uid);
    }

    updatePos=(pos?: ImagePos, size?: ImageSize)=>{
        this.pos = pos;
        this.size = size;
        this.doSetPosition();
    }
}

class FitsViewer extends React.PureComponent<Props, State> {
    uid:number;
    ImageDisplay: JQImageDisplay;
    $el: JQuery<HTMLDivElement>;
    el: React.RefObject<HTMLDivElement> = React.createRef();

    constructor(props: Props) {
        super(props);
        this.uid = uid++;
        this.state = {
            contextmenu: null,
            histogramView: null,
            fwhm: false,
            histogramWindow: false,
        };
        // FIXME: persist state : histogram is visible
    }

    componentDidUpdate(prevProps: Props) {
        this.ImageDisplay.setFullState(this.props.path, this.props.streamId, this.props.streamSerial, this.props.subframe||null, this.props.directPort, this.getViewSettingsCopy(), this.props.streamSize || undefined);
    }

    componentDidMount() {
        this.$el = $(this.el.current!);
        this.ImageDisplay = new JQImageDisplay(this.$el,
            this.openContextMenu.bind(this),
            this.closeContextMenu.bind(this),
            this.onViewSettingsChange.bind(this),
            this.onViewMoved);
        this.ImageDisplay.setFullState(this.props.path, this.props.streamId, this.props.streamSerial, this.props.subframe||null, this.props.directPort, this.getViewSettingsCopy(), this.props.streamSize || undefined);
    }

    private markers: {[uid:string]: MarkerToken} = {};
    private markerUid:number = 0;
    private lastPos?: ImagePos;
    private lastSize?: ImageSize;

    onViewMoved=(pos: ImagePos, size: ImageSize)=>{
        this.lastPos = {...pos};
        this.lastSize = {...size};
        for(const o of Object.keys(this.markers)) {
            const marker = this.markers[o];
            marker.updatePos(this.lastPos, this.lastSize);
        }
    }

    createMarkerToken=(e:React.RefObject<HTMLDivElement>)=>{
        const uid = "" + (this.markerUid++);
        const ret = new MarkerToken(this, uid, e);
        this.markers[uid] = ret;
        ret.updatePos(this.lastPos, this.lastSize);
        return ret;
    }

    killMarker=(uid:string)=>{
        delete this.markers[uid];
    }

    componentWillUnmount() {
        if (this.ImageDisplay) {
            this.ImageDisplay.dispose();
        }
        (this as any).ImageDisplay = undefined;
        (this as any).$el = undefined;
    }

    openContextMenu(x:number, y:number) {
        this.setState({contextmenu:{x, y}});
    }

    closeContextMenu(x:number, y:number) {
        if (this.state.contextmenu !== null) {
            this.setState({contextmenu:null});
        }
    }

    onViewSettingsChange(state:FullState)
    {
        this.props.onViewSettingsChange(state);
    }

    private readonly displaySetting=(which: LevelId|"fwhm"|"histogram"|null)=>{
        if (which === "histogram") {
            this.setState({contextmenu: null, histogramWindow: !this.state.histogramWindow});
        } else if (which === 'fwhm') {
            this.setState({contextmenu: null, histogramView: null, fwhm: true});
        } else {
            this.setState({contextmenu: null, histogramView: (this.state.histogramView === which ? null : which), fwhm: false});
        }
    }

    getViewSettingsCopy(): FullState
    {
        let propValue:any = this.props.viewSettings;
        if (propValue === undefined) {
            propValue = {};
        }
        propValue = Obj.deepCopy(propValue);
        if (!('levels' in propValue)) {
            propValue.levels = {};
        }
        if (!('low' in propValue.levels)) propValue.levels.low = 0.05;
        if (!('medium' in propValue.levels)) propValue.levels.medium = 0.5;
        if (!('high' in propValue.levels)) propValue.levels.high = 0.95;

        return propValue as FullState;
    }

    updateHisto = (which: string, v:number)=>{
        var newViewSettings = this.getViewSettingsCopy();
        newViewSettings.levels[which] = v;

        this.props.onViewSettingsChange(newViewSettings);
    }

    flushView() {
        if (this.ImageDisplay !== undefined) {
            this.ImageDisplay.flushView();
        }
    }

    xlateCoords=(x:number, y:number)=> {
        if (this.ImageDisplay !== undefined) {
            return this.ImageDisplay.getImagePosFromParent(x, y);
        }
        return null;
    }

    onResize = () => {
        if (this.ImageDisplay !== undefined) {
            this.ImageDisplay.onResize();
        }
    }

    declareChild=()=>{
        console.log('declareChild called');
        return undefined;
    }

    render() {
        var contextMenu, visor;
        if (this.state.contextmenu !== null) {
            contextMenu = <ContextMenu
                            contextMenu={this.props.contextMenu}
                            x={this.state.contextmenu.x} y={this.state.contextmenu.y}
                            xlateCoords={this.xlateCoords}
                            displaySetting={this.displaySetting}
            />
            if (this.props.contextMenu && this.props.contextMenu.filter(e=>e.positional).length) {
                visor = <ContextMenuCross
                            x={this.state.contextmenu.x}
                            y={this.state.contextmenu.y}/>
            }
        } else {
            contextMenu = null;
            visor = null;
        }
        var histogramView;
        if (this.state.histogramView !== null) {
            var viewSettings = this.getViewSettingsCopy();
            histogramView = <LevelBar
                    property={this.state.histogramView}
                    onChange={this.updateHisto}
                    onFinishMove={this.flushView}
                    value={viewSettings.levels[this.state.histogramView]}/>;
        } else if (this.state.fwhm) {
            histogramView = <FWHMDisplayer path={this.props.path} streamId={this.props.streamId}/>
        } else {
            histogramView = null;
        }
        const childrenWithProps = React.Children.map(this.props.children, child =>
            React.cloneElement(child as ReactElement<any>, { __fitsViewerDeclareChild: this.createMarkerToken })
        );
        return(
            <div className='FitsViewOverlayContainer'>
                <div className='FitsView' ref={this.el}>
                    <ReactResizeDetector handleWidth handleHeight onResize={this.onResize} />
                </div>
                <div className='FitsViewMarkers'>
                    {childrenWithProps}
                </div>
                <div className='FitsViewLoading'/>
                <div className='FitsSettingsOverlay'>
                    {histogramView}
                </div>
                {visor}

                <FloatContainer>
                    {this.state.histogramWindow
                        ?
                            <FloatWindow key="fits_view_overlay">
                                <FloatWindowMover>
                                    <Histogram
                                        path={this.props.path}
                                        streamId={this.props.streamId}
                                        streamSerial={this.props.streamSerial}
                                        />
                                </FloatWindowMover>
                            </FloatWindow>
                        :
                            null
                    }


                </FloatContainer>

                {contextMenu}
            </div>);
    }

}

export default FitsViewer;