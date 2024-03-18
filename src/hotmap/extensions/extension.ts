import { Observable, Observer, Unsubscribable } from 'rxjs';
import { State } from '../state';
import { removeElement } from '../utils';


export interface ExtensionInstance<TParams extends {}> {
    register(): void,
    update(params: TParams): void,
    unregister(): void,
}

export interface ExtensionInstanceRegistration<TParams extends {}> {
    update(params: TParams): void,
    unregister(): void,
}

export interface Extension<TState, TParams extends {}> {
    create(state: TState, params: TParams): ExtensionInstance<TParams>,
}

export type HotmapExtension<TParams extends {}> = Extension<State<any, any, any>, TParams>


export class HotmapExtensionBase<TParams extends {}, TX = any, TY = any, TItem = any> implements ExtensionInstance<TParams> {
    constructor(protected state: State<TX, TY, TItem>, protected params: TParams) { }
    private readonly subs: Unsubscribable[] = [];
    register() { };
    update(params: TParams) {
        this.params = params;
    };
    unregister() {
        this.unsubscribeAll();
    };

    protected subscribe<T>(subject: Observable<T>, observer: Partial<Observer<T>> | ((value: T) => void)): Unsubscribable {
        const sub = subject.subscribe(observer);
        this.subs.push(sub);
        const unsubscribe = () => {
            removeElement(this.subs, sub);
            sub.unsubscribe();
        };
        return {
            unsubscribe,
        };
    };
    protected unsubscribeAll() {
        for (const sub of this.subs) {
            sub.unsubscribe();
        }
        this.subs.length = 0;
    };
}

export function HotmapExtension<TParams extends {}>(cls: typeof HotmapExtensionBase<TParams>): HotmapExtension<TParams> {
    return {
        create: (state, params) => new cls(state, params),
    };
}


interface SampleExtensionParams { }

export const SampleExtension = HotmapExtension(
    class extends HotmapExtensionBase<SampleExtensionParams> {
        register() {
            super.register();
            console.log('Registering SampleExtension', this.state, this.params)
        }
        update(params: SampleExtensionParams) {
            super.update(params);
            console.log('Updating SampleExtension with params', params)
        }
        unregister() {
            console.log('Unregistering SampleExtension')
            super.unregister();
        }
    }
);
