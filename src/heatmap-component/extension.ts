import { Observable, Observer, Unsubscribable } from 'rxjs';
import { State } from './state';
import { removeElement, shallowMerge } from './utils';


export interface Behavior<TParams extends {}> {
    register: () => void,
    update: (params: Partial<TParams>) => void,
    unregister: () => void,
}

/** Unique name of the extension, prefixed by scope, e.g. builtin.tooltip, spamextensions.spam */
export type ScopedExtensionName = `${string}.${string}`

export interface Extension<TState, TParams extends {}, TDefaults extends TParams> {
    /** Unique name of the extension, prefixed by scope, e.g. builtin.tooltip, spamextensions.spam */
    name: ScopedExtensionName,
    /** Default parameter values */
    defaultParams: TDefaults,
    /** Create a new behavior, bound to `state` */
    create<P extends TParams>(state: TState, params?: Partial<P>): Behavior<P>,
}


export type HeatmapExtension<TParams extends {}, TDefaults extends TParams> = Extension<State<any, any, any>, TParams, TDefaults>


export class HeatmapBehaviorBase<TParams extends {}, TX = any, TY = any, TItem = any> implements Behavior<TParams> {
    constructor(protected state: State<TX, TY, TItem>, protected params: TParams) { }
    private readonly subscriptions: Unsubscribable[] = [];
    register() { };
    update(params: Partial<TParams>) {
        this.params = shallowMerge(this.params, params);
    };
    unregister() {
        this.unsubscribeAll();
    };

    protected subscribe<T>(subject: Observable<T>, observer: Partial<Observer<T>> | ((value: T) => void)): Unsubscribable {
        const sub = subject.subscribe(observer);
        this.subscriptions.push(sub);
        const unsubscribe = () => {
            removeElement(this.subscriptions, sub);
            sub.unsubscribe();
        };
        return {
            unsubscribe,
        };
    };
    protected unsubscribeAll() {
        for (const sub of this.subscriptions) {
            sub.unsubscribe();
        }
        this.subscriptions.length = 0;
    };
}

type HeatmapExtensionCreationParam<TParams extends {}, TDefaults extends TParams> = {
    name: ScopedExtensionName,
    defaultParams: TDefaults,
    behavior: typeof HeatmapBehaviorBase<TParams>,
}

export const HeatmapExtension = {
    fromClass<TParams extends {}, TDefaults extends TParams>(p: HeatmapExtensionCreationParam<TParams, TDefaults>): HeatmapExtension<TParams, TDefaults> {
        return {
            name: p.name,
            defaultParams: p.defaultParams,
            create: (state, params) => new p.behavior(state, shallowMerge<TParams>(p.defaultParams, params)),
        };
    },
};
