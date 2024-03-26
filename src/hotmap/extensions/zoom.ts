import * as d3 from '../d3-modules';
import { Class, ItemEventParam } from '../heatmap';
import { Box, Scales, scaleDistance } from '../scales';
import { attrd } from '../utils';
import { HotmapExtension, HotmapExtensionBase } from './extension';


/** Only allow zooming with scrolling gesture when Ctrl key (or Meta key, i.e. Command/Windows) is pressed.
 * If `false`, zooming is allowed always, but Ctrl or Meta key makes it faster. */
const ZOOM_REQUIRE_CTRL = false;
const ZOOM_SENSITIVITY = 1;
const PAN_SENSITIVITY = 0.6;
const MIN_ZOOMED_DATAPOINTS = 1;
// TODO move consts to params


export interface ZoomExtensionParams {
    /** Only interpret scrolling as zoom when the Control key is pressed. */
    scrollRequireCtrl: boolean,
}

export const DefaultZoomExtensionParams: ZoomExtensionParams = {
    scrollRequireCtrl: false,
};


// TODO continue here refactoring ZoomExtension
export const ZoomExtension = HotmapExtension.fromClass({
    name: 'builtin.zoom',
    defaultParams: DefaultZoomExtensionParams,
    class: class extends HotmapExtensionBase<ZoomExtensionParams> {
        private zoomBehavior?: d3.ZoomBehavior<Element, unknown>;

        register() {
            super.register();
            this.subscribe(this.state.events.render, () => this.addZoomBehavior());
            this.subscribe(this.state.events.data, () => {
                this.adjustZoomExtent('data');
                this.adjustZoom();
            });
            this.subscribe(this.state.events.resize, e => {
                console.log('resize', e)
                this.adjustZoomExtent('resize');
                this.adjustZoom();
            });
            this.subscribe(this.state.events.zoom, e => {
                if (e?.origin !== ZoomExtension.name) { // ignore own events
                    this.adjustZoom();
                }
            });
        }

        private addZoomBehavior() {
            if (!this.state.dom) return;
            if (this.zoomBehavior) {
                // Remove any old behavior
                this.zoomBehavior.on('zoom', null);
            }
            this.zoomBehavior = d3.zoom();
            this.zoomBehavior.filter(e => (e instanceof WheelEvent) ? (this.wheelAction(e).kind === 'zoom') : true);
            this.zoomBehavior.wheelDelta(e => {
                // Default function is: -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * (e.ctrlKey ? 10 : 1)
                const action = this.wheelAction(e);
                return action.kind === 'zoom' ? ZOOM_SENSITIVITY * action.delta : 0;
            });
            this.zoomBehavior.on('zoom', e => {
                const real = !!e.sourceEvent;
                const visWorld = this.zoomTransformToVisWorld(e.transform);
                console.log('onzoom', real, visWorld.xmin, visWorld.xmax, visWorld.ymin, visWorld.ymax);
                if (real) {
                    this.state.zoomToVisWorld(visWorld, ZoomExtension.name);
                    this.state.events.hover.next(this.state.getPointedItem(e.sourceEvent));
                }
            });
            this.state.dom.svg.on('wheel', (e: WheelEvent) => this.handleWheel(e));
            // wheel event must be subscribed before setting zoom. or must it?
            this.state.dom.svg.call(this.zoomBehavior as any);
            // .on('wheel', e => e.preventDefault()); // Prevent fallback to normal scroll when on min/max zoom
        }

        private adjustZoomExtent(debugCause: string) {
            console.log('adjustZoomExtent', debugCause, !!this.zoomBehavior)
            if (!this.state.dom) return;
            if (!this.zoomBehavior) return;
            this.zoomBehavior.translateExtent([[this.state.boxes.wholeWorld.xmin, -Infinity], [this.state.boxes.wholeWorld.xmax, Infinity]]);
            const canvasWidth = Box.width(this.state.boxes.canvas);
            const wholeWorldWidth = Box.width(this.state.boxes.wholeWorld);
            const minZoom = canvasWidth / wholeWorldWidth; // zoom-out
            const maxZoom = Math.max(canvasWidth / MIN_ZOOMED_DATAPOINTS, minZoom); // zoom-in
            this.zoomBehavior.scaleExtent([minZoom, maxZoom]);
            this.zoomBehavior.extent([[this.state.boxes.canvas.xmin, this.state.boxes.canvas.ymin], [this.state.boxes.canvas.xmax, this.state.boxes.canvas.ymax]]);
        }

        private adjustZoom() {
            if (!this.zoomBehavior) return;
            const currentZoom = this.visWorldToZoomTransform(this.state.boxes.visWorld);
            this.zoomBehavior.transform(this.state.dom?.svg as any, currentZoom);
        }

        private zoomTransformToVisWorld(transform: { k: number, x: number, y: number }): Box {
            return {
                ...this.state.boxes.visWorld, // preserve Y zoom
                xmin: (this.state.boxes.canvas.xmin - transform.x) / transform.k,
                xmax: (this.state.boxes.canvas.xmax - transform.x) / transform.k,
            };
        }

        private visWorldToZoomTransform(visWorld: Box): d3.ZoomTransform {
            const k = (this.state.boxes.canvas.xmax - this.state.boxes.canvas.xmin) / (visWorld.xmax - visWorld.xmin);
            const x = this.state.boxes.canvas.xmin - k * visWorld.xmin;
            const y = 0;
            return new d3.ZoomTransform(k, x, y);
        }

        private showScrollingMessage() {
            if (!this.state.dom) return;
            if (!this.state.dom.mainDiv.selectAll(`.${Class.Overlay}`).empty()) return;

            const overlay = attrd(this.state.dom.mainDiv.append('div'), { class: Class.Overlay });
            attrd(overlay.append('div'), { class: Class.OverlayShade });
            attrd(overlay.append('div'), { class: Class.OverlayMessage })
                .text('Press Ctrl and scroll to apply zoom');
            setTimeout(() => overlay.remove(), 750);
        }

        private wheelAction(e: WheelEvent): { kind: 'ignore' } | { kind: 'showHelp' } | { kind: 'zoom', delta: number } | { kind: 'pan', deltaX: number, deltaY: number } {
            const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
            const isVertical = Math.abs(e.deltaX) < Math.abs(e.deltaY);

            const modeSpeed = (e.deltaMode === 1) ? 25 : e.deltaMode ? 500 : 1; // scroll in lines vs pages vs pixels
            const speedup = ZOOM_REQUIRE_CTRL ? 1 : (this.state.lastWheelEvent.ctrlKey || this.state.lastWheelEvent.metaKey ? 10 : 1);

            if (isHorizontal) {
                return { kind: 'pan', deltaX: -e.deltaX * modeSpeed * speedup, deltaY: 0 };
            }

            if (isVertical) {
                if (this.state.lastWheelEvent.shiftKey) {
                    return { kind: 'pan', deltaX: -e.deltaY * modeSpeed * speedup, deltaY: 0 };
                }
                if (ZOOM_REQUIRE_CTRL && !this.state.lastWheelEvent.ctrlKey && !this.state.lastWheelEvent.metaKey) {
                    return (Math.abs(e.deltaY) * modeSpeed >= 5) ? { kind: 'showHelp' } : { kind: 'ignore' };
                }
                return { kind: 'zoom', delta: -e.deltaY * 0.002 * modeSpeed * speedup };
                // Default function for zoom behavior is: -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * (e.ctrlKey ? 10 : 1)
            }

            return { kind: 'ignore' };
        }

        private handleWheel(e: WheelEvent) {
            if (!this.state.dom) return;
            e.preventDefault(); // TODO ???

            // Magic to handle touchpad scrolling on Mac (when user lifts fingers from touchpad, but the browser is still getting wheel events)
            const now = Date.now();
            const absDelta = Math.max(Math.abs(e.deltaX), Math.abs(e.deltaY));
            if (now > this.state.lastWheelEvent.timestamp + 150 || absDelta > this.state.lastWheelEvent.absDelta + 1) {
                // Starting a new gesture
                this.state.lastWheelEvent.ctrlKey = e.ctrlKey;
                this.state.lastWheelEvent.shiftKey = e.shiftKey;
                this.state.lastWheelEvent.altKey = e.altKey;
                this.state.lastWheelEvent.metaKey = e.metaKey;
            }
            this.state.lastWheelEvent.timestamp = now;
            this.state.lastWheelEvent.absDelta = absDelta;

            if (this.zoomBehavior) {
                const action = this.wheelAction(e);
                if (action.kind === 'pan') {
                    const shiftX = PAN_SENSITIVITY * scaleDistance(this.state.scales.canvasToWorld.x, action.deltaX);
                    this.zoomBehavior.duration(1000).translateBy(this.state.dom.svg as any, shiftX, 0);
                }
                if (action.kind === 'showHelp') {
                    this.showScrollingMessage();
                }
            }
        }
    }
});
