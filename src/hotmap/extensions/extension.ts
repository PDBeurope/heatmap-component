import { Observable, Observer, Unsubscribable } from 'rxjs';
import { State } from '../state';
import { removeElement, shallowMerge } from '../utils';


export interface ExtensionInstance<TParams extends {}> {
    register: () => void,
    update: (params: Partial<TParams>) => void,
    unregister: () => void,
}

export interface ExtensionInstanceRegistration<TParams extends {}> {
    update: (params: Partial<TParams>) => void,
    unregister: () => void,
}

export type ScopeExtensionName = `${string}.${string}`

export interface Extension<TState, TParams extends {}> {
    /** Unique name of the extension, prefixed by scope, e.g. builtin.tooltip, spamextensions.spam */
    name: ScopeExtensionName,
    defaultParams: TParams,
    create(state: TState, params?: Partial<TParams>): ExtensionInstance<TParams>,
}

export type HotmapExtension<TParams extends {}> = Extension<State<any, any, any>, TParams>


export class HotmapExtensionBase<TParams extends {}, TX = any, TY = any, TItem = any> implements ExtensionInstance<TParams> {
    constructor(protected state: State<TX, TY, TItem>, protected params: TParams) { }
    private readonly subs: Unsubscribable[] = [];
    register() { };
    update(params: Partial<TParams>) {
        this.params = shallowMerge(this.params, params);
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

type HotmapExtensionCreationParam<TParams extends {}> = {
    name: ScopeExtensionName,
    defaultParams: TParams,
    class: typeof HotmapExtensionBase<TParams>,
}

export const HotmapExtension = {
    fromClass<TParams extends {}>(p: HotmapExtensionCreationParam<TParams>): HotmapExtension<TParams> {
        return {
            name: p.name,
            defaultParams: p.defaultParams,
            create: (state, params) => new p.class(state, shallowMerge(p.defaultParams, params)),
        };
    },
};

interface SampleExtensionParams { x: number }
const DefaultSampleExtensionParams: SampleExtensionParams = { x: 7 };

export const SampleExtension = HotmapExtension.fromClass({
    name: 'builtin.sample',
    defaultParams: DefaultSampleExtensionParams,
    class: class extends HotmapExtensionBase<SampleExtensionParams> {
        register() {
            super.register();
            console.log('Registering SampleExtension', this.state, this.params);
        }
        update(params: Partial<SampleExtensionParams>) {
            super.update(params);
            console.log('Updating SampleExtension with params', params);
        }
        unregister() {
            console.log('Unregistering SampleExtension');
            super.unregister();
        }
    }
});
