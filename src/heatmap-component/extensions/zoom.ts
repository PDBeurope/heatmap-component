import { Class } from '../class-names';
import * as d3 from '../d3-modules';
import { BehaviorBase, Extension } from '../extension';
import { Box, scaleDistance } from '../scales';
import { MIN_ZOOMED_DATAPOINTS_HARD } from '../state';
import { attrd } from '../utils';


/** Parameters for `ZoomExtension` */
export interface ZoomExtensionParams {
    /** Zooming mode: 'none' = zooming is off, 'x' = can zoom along X axis, Y axis stays the same. */
    axis: 'none' | 'x',
    /** Only interpret scrolling as zoom when the Control key is pressed (or Meta key, i.e. Command/Windows).  If `false`, zooming is allowed always, but Ctrl or Meta key makes it faster. */
    scrollRequireCtrl: boolean,
    /** Adjust how sensitive zooming is to wheel events */
    zoomSensitivity: number;
    /** Adjust how sensitive panning is to wheel events */
    panSensitivity: number;
    /** Smallest width or height that can be zoomed in (expressed as number of columns/rows) */
    minZoomedDatapoints: number;
}

/** Default parameter values for `ZoomExtension` */
export const DefaultZoomExtensionParams: ZoomExtensionParams = {
    axis: 'none',
    scrollRequireCtrl: false,
    zoomSensitivity: 1,
    panSensitivity: 0.6,
    minZoomedDatapoints: 1,
};

/** Behavior class for `ZoomExtension` (allows zooming and panning the heatmap by mouse) */
export class ZoomBehavior extends BehaviorBase<ZoomExtensionParams> {
    private zoomBehavior?: d3.ZoomBehavior<Element, unknown>;
    /** Used to merge multiple wheel events into one gesture (needed for correct functioning on Mac touchpad) */
    private readonly currentWheelGesture = { lastTimestamp: 0, lastAbsDelta: 0, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
    /** Used to avoid emitting a new zoom event when adjusting D3 zoom behavior to zoom changes from elsewhere */
    private suppressEmit: boolean = false;
    /** DOM element to which the zoom behavior is bound */
    private get targetElement() { return this.state.dom?.svg; }

    override register(): void {
        super.register();
        this.subscribe(this.state.events.render, () => this.addZoomBehavior());
        this.subscribe(this.state.events.data, () => {
            this.adjustZoomExtent();
            this.adjustZoom();
        });
        this.subscribe(this.state.events.resize, () => {
            this.adjustZoomExtent();
            this.adjustZoom();
        });
        this.subscribe(this.state.events.zoom, e => {
            if (e?.origin !== ZoomExtension.name) { // ignore own events
                this.adjustZoom();
            }
        });
    }
    override update(params: Partial<ZoomExtensionParams>): void {
        const needsReapply = params.axis !== undefined && params.axis !== this.params.axis;
        super.update(params);
        if (needsReapply) this.addZoomBehavior();
        this.adjustZoomExtent();
        this.adjustZoom();
    }

    /** Initialize zoom behavior (also remove any existing zoom behavior) */
    private addZoomBehavior(): void {
        if (!this.targetElement) return;
        if (this.zoomBehavior) {
            // Remove any old behavior
            this.zoomBehavior.on('zoom', null);
            this.targetElement.on('.zoom', null);
            this.targetElement.on('.customzoom', null);
            this.zoomBehavior = undefined;
        }
        if (this.params.axis === 'none') return;
        this.zoomBehavior = d3.zoom();
        this.zoomBehavior.filter(e => (e instanceof WheelEvent) ? (this.wheelAction(e).kind === 'zoom') : true);
        this.zoomBehavior.wheelDelta(e => {
            // Default function is: -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * (e.ctrlKey ? 10 : 1)
            const action = this.wheelAction(e);
            return action.kind === 'zoom' ? this.params.zoomSensitivity * action.delta : 0;
        });
        this.zoomBehavior.on('zoom', e => this.handleZoom(e));

        this.targetElement.call(this.zoomBehavior as any);
        this.targetElement.on('wheel.customzoom', e => this.handleWheel(e)); // Avoid calling the event 'wheel.zoom', that would conflict with zoom behavior
    }

    /** Handle zoom event coming from the D3 zoom behavior */
    private handleZoom(e: any): void {
        const visWorld = this.zoomTransformToVisWorld(e.transform);
        this.state.zoomVisWorldBox(visWorld, ZoomExtension.name, !this.suppressEmit);
        if (e.sourceEvent) {
            this.state.events.hover.next({
                cell: this.state.getPointedCell(e.sourceEvent),
                sourceEvent: e.sourceEvent,
            });
        }
    }

    /** Handle event coming directly from the mouse wheel (customizes basic D3 zoom behavior) */
    private handleWheel(e: WheelEvent): void {
        if (!this.targetElement) return;
        e.preventDefault(); // avoid scrolling or previous-page gestures

        // Magic to handle touchpad scrolling on Mac
        this.updateCurrentWheelGesture(e);

        if (this.zoomBehavior) {
            const action = this.wheelAction(e);
            if (action.kind === 'pan') {
                const shiftX = this.params.panSensitivity * scaleDistance(this.state.scales.svgToWorld.x, action.deltaX);
                this.zoomBehavior.duration(1000).translateBy(this.targetElement as any, shiftX, 0);
            }
            if (action.kind === 'showHelp') {
                this.showScrollingMessage();
            }
        }
        this.state.events.hover.next({
            cell: this.state.getPointedCell(e),
            sourceEvent: e,
        });
    }

    /** Magic to handle touchpad scrolling on Mac (when user lifts fingers from touchpad, but the browser is still getting wheel events) */
    private updateCurrentWheelGesture(e: WheelEvent): void {
        const now = Date.now();
        const absDelta = Math.max(Math.abs(e.deltaX), Math.abs(e.deltaY));
        if (now > this.currentWheelGesture.lastTimestamp + 150 || absDelta > this.currentWheelGesture.lastAbsDelta + 1) {
            // Starting a new gesture
            this.currentWheelGesture.ctrlKey = e.ctrlKey;
            this.currentWheelGesture.shiftKey = e.shiftKey;
            this.currentWheelGesture.altKey = e.altKey;
            this.currentWheelGesture.metaKey = e.metaKey;
        }
        this.currentWheelGesture.lastTimestamp = now;
        this.currentWheelGesture.lastAbsDelta = absDelta;
    }

    /** Adjust zoom extent based on current data and canvas size
     * (limit maximum zoom in/out and translation to avoid getting out of the data world) */
    private adjustZoomExtent(): void {
        if (!this.state.dom) return;
        if (!this.zoomBehavior) return;
        this.zoomBehavior.translateExtent([[this.state.boxes.wholeWorld.xmin, -Infinity], [this.state.boxes.wholeWorld.xmax, Infinity]]);
        const canvasWidth = Box.width(this.state.boxes.svg);
        const wholeWorldWidth = Box.width(this.state.boxes.wholeWorld);
        const minZoom = canvasWidth / wholeWorldWidth; // zoom-out
        const minZoomedDatapoints = Math.max(this.params.minZoomedDatapoints, MIN_ZOOMED_DATAPOINTS_HARD);
        const maxZoom = Math.max(canvasWidth / minZoomedDatapoints, minZoom); // zoom-in
        this.zoomBehavior.scaleExtent([minZoom, maxZoom]);
        this.zoomBehavior.extent([[this.state.boxes.svg.xmin, this.state.boxes.svg.ymin], [this.state.boxes.svg.xmax, this.state.boxes.svg.ymax]]);
    }

    /** Synchronize the state of the zoom behavior with the visWorld box (e.g. when canvas resizes) */
    private adjustZoom(): void {
        if (!this.targetElement) return;
        if (!this.zoomBehavior) return;
        const currentZoom = this.visWorldToZoomTransform(this.state.boxes.visWorld);
        this.suppressEmit = true;
        this.zoomBehavior.transform(this.targetElement as any, currentZoom);
        this.suppressEmit = false;
    }

    /** Convert zoom transform to visWorld box */
    private zoomTransformToVisWorld(transform: { k: number, x: number, y: number }): Box {
        return {
            ...this.state.boxes.visWorld, // preserve Y zoom
            xmin: (this.state.boxes.svg.xmin - transform.x) / transform.k,
            xmax: (this.state.boxes.svg.xmax - transform.x) / transform.k,
        };
    }

    /** Convert visWorld box to zoom transform */
    private visWorldToZoomTransform(visWorld: Box): d3.ZoomTransform {
        const k = (this.state.boxes.svg.xmax - this.state.boxes.svg.xmin) / (visWorld.xmax - visWorld.xmin);
        const x = this.state.boxes.svg.xmin - k * visWorld.xmin;
        const y = 0;
        return new d3.ZoomTransform(k, x, y);
    }

    /** Show overlay with message about how to use scrolling */
    private showScrollingMessage(): void {
        if (!this.state.dom) return;
        if (!this.state.dom.mainDiv.selectAll(`.${Class.Overlay}`).empty()) return;

        const overlay = attrd(this.state.dom.mainDiv.append('div'), { class: Class.Overlay });
        attrd(overlay.append('div'), { class: Class.OverlayShade });
        attrd(overlay.append('div'), { class: Class.OverlayMessage })
            .text('Press Ctrl and scroll to apply zoom');
        setTimeout(() => overlay.remove(), 750);
    }

    /** Categorize wheel event to one of action kinds */
    private wheelAction(e: WheelEvent): { kind: 'ignore' } | { kind: 'showHelp' } | { kind: 'zoom', delta: number } | { kind: 'pan', deltaX: number, deltaY: number } {
        const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
        const isVertical = Math.abs(e.deltaX) < Math.abs(e.deltaY);

        const modeSpeed = (e.deltaMode === 1) ? 25 : e.deltaMode ? 500 : 1; // scroll in lines vs pages vs pixels
        const speedup = this.params.scrollRequireCtrl ? 1 : (this.currentWheelGesture.ctrlKey || this.currentWheelGesture.metaKey ? 10 : 1);

        if (isHorizontal) {
            return { kind: 'pan', deltaX: -e.deltaX * modeSpeed * speedup, deltaY: 0 };
        }
        if (isVertical) {
            if (this.currentWheelGesture.shiftKey) {
                return { kind: 'pan', deltaX: -e.deltaY * modeSpeed * speedup, deltaY: 0 };
            }
            if (this.params.scrollRequireCtrl && !this.currentWheelGesture.ctrlKey && !this.currentWheelGesture.metaKey) {
                return (Math.abs(e.deltaY) * modeSpeed >= 5) ? { kind: 'showHelp' } : { kind: 'ignore' };
            }
            return { kind: 'zoom', delta: -e.deltaY * 0.002 * modeSpeed * speedup };
            // Default function for zoom behavior is: -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * (e.ctrlKey ? 10 : 1)
        }
        return { kind: 'ignore' };
    }
}


/** Adds behavior that allows zooming and panning the heatmap by mouse (scroll, drag, double-click)
 * (programmatic zooming via `heatmap.zoom` is independent from this extension) */
export const ZoomExtension = Extension.fromBehaviorClass({
    name: 'builtin.zoom',
    defaultParams: DefaultZoomExtensionParams,
    behavior: ZoomBehavior,
});
