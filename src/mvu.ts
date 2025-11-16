import { Observable, Subject, Subscription } from 'rxjs';
import { scan, startWith, shareReplay } from 'rxjs/operators';
import { BindingObject, BindingResult, bindTemplate } from './bind';

export interface RunMVUConfig<Model, Msg> {
  root: HTMLElement;
  init: Model;
  update: (model: Model, msg: Msg) => Model;
  view: (model$: Observable<Model>) => BindingObject;
  eventsToMsg?: (events$: BindingResult['events$']) => Observable<Msg>;
  externalMsgs$?: Observable<Msg>;
}

/**
 * Tiny MVU runner:
 * - Builds model$ from init + update + Msg stream.
 * - Calls view(model$) to get BindingObject.
 * - Uses bindTemplate(root, bindings) to wire DOM.
 * - Maps events$ (and optional external streams) into Msg.
 * - Returns a Subscription that controls the whole lifecycle.
 */
export function runMVU<Model, Msg>(cfg: RunMVUConfig<Model, Msg>): Subscription {
  const { root, init, update, view, eventsToMsg, externalMsgs$ } = cfg;

  const msg$ = new Subject<Msg>();

  const model$ = msg$.pipe(
    scan(update, init),
    startWith(init),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  const bindings: BindingObject = view(model$);
  const bindingResult: BindingResult = bindTemplate(root, bindings);

  const rootSub = new Subscription();
  rootSub.add(bindingResult.subscription);

  if (eventsToMsg) {
    const domMsgs$ = eventsToMsg(bindingResult.events$);
    rootSub.add(domMsgs$.subscribe(msg$));
  }

  if (externalMsgs$) {
    rootSub.add(externalMsgs$.subscribe(msg$));
  }

  return rootSub;
}
