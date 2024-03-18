import { HotmapExtension, HotmapExtensionBase } from './extension';


interface MarkerExtensionParams { }

export const MarkerExtension = HotmapExtension(
    class extends HotmapExtensionBase<MarkerExtensionParams> {
        register(): void {
            super.register();
            console.log('Registering MarkerExtension')
            this.subscribe(this.state.events.hover, e => {
                console.log('MarkerExtension', e)
                // this.unregister();
            });
        }
        update(params: MarkerExtensionParams): void {
            super.update(params);
            console.log('Updating MarkerExtension')
        }
        unregister(): void {
            console.log('Unregistering MarkerExtension')
            super.unregister();
        }
    }
);
