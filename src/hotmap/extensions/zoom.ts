import { Class, ItemEventParam } from '../heatmap';
import { Box, scaleDistance } from '../scales';
import { attrd } from '../utils';
import { HotmapExtension, HotmapExtensionBase } from './extension';


export interface ZoomExtensionParams {
    /** Only interpret scrolling as zoom when the Control key is pressed. */
    scrollRequireCtrl: boolean,
}

export const DefaultZoomExtensionParams: ZoomExtensionParams = {
    scrollRequireCtrl: false,
};

export const MarkerExtension = HotmapExtension.fromClass({
    name: 'builtin.marker',
    defaultParams: DefaultZoomExtensionParams,
    class: class extends HotmapExtensionBase<ZoomExtensionParams> {
        register() {
            super.register();
        }

    }
});
