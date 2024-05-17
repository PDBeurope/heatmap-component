/** This file provides a framework for extending heatmap behavior via Extensions.
 * Extension lifetime:
 * - When an Extension is registered with a heatmap instance:
 *   - The Extension creates an instance of Behavior, bound to the heatmap State
 *   - The Behavior runs `register` method
 * - The Behavior can be later modified by `update` method
 * - The Behavior can be later removed by `unregister` method
 */

import { Observable, Observer, Unsubscribable } from 'rxjs';
import { State } from './state';
import { removeElement, shallowMerge } from './utils';


/** A unit of additional behavior, bound to a heatmap instance */
export interface Behavior<TParams extends {}> {
    /** Activate the behavior */
    register: () => void,
    /** Change behavior settings (`params`), do not touch parameters whose value is not provided (undefined) */
    update: (params: Partial<TParams>) => void,
    /** Deactivate the behavior */
    unregister: () => void,
}

/** Unique name of the extension, prefixed by scope, e.g. builtin.tooltip, spamextensions.spam */
export type ScopedExtensionName = `${string}.${string}`

/** "Behavior factory" */
export interface Extension<TParams extends {}, TDefaults extends TParams> {
    /** Unique name of the extension, prefixed by scope, e.g. builtin.tooltip, spamextensions.spam */
    name: ScopedExtensionName,
    /** Default parameter values */
    defaultParams: TDefaults,
    /** Create a new behavior, bound to `state` */
    create<P extends TParams>(state: State<any, any, any>, params?: Partial<P>): Behavior<P>,
}


/** Base class for creating Behavior classes */
export class BehaviorBase<TParams extends {}, TX = any, TY = any, TDatum = any> implements Behavior<TParams> {
    private readonly subscriptions: Unsubscribable[] = [];

    constructor(protected state: State<TX, TY, TDatum>, protected params: TParams) { }

    register(): void { };
    update(params: Partial<TParams>): void {
        this.params = shallowMerge(this.params, params);
    };
    unregister(): void {
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
    protected unsubscribeAll(): void {
        for (const sub of this.subscriptions) {
            sub.unsubscribe();
        }
        this.subscriptions.length = 0;
    };
}

type ExtensionCreationParam<TParams extends {}, TDefaults extends TParams> = {
    name: ScopedExtensionName,
    defaultParams: TDefaults,
    behavior: typeof BehaviorBase<TParams>,
}

export const Extension = {
    /** Create an Extension based on a behavior class */
    fromBehaviorClass<TParams extends {}, TDefaults extends TParams>(p: ExtensionCreationParam<TParams, TDefaults>): Extension<TParams, TDefaults> {
        return {
            name: p.name,
            defaultParams: p.defaultParams,
            create: (state, params) => new p.behavior(state, shallowMerge<TParams>(p.defaultParams, params)),
        };
    },
};
