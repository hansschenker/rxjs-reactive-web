import { Observable, merge } from 'rxjs';
import { map } from 'rxjs/operators';
import { BindingObject } from './bind';
import { createComponent } from './component';
import { RunMVUConfig } from './mvu';

type Model = { count: number };

type Msg =
  | { type: 'Inc' }
  | { type: 'Dec' };

const init: Model = { count: 0 };

function update(model: Model, msg: Msg): Model {
  switch (msg.type) {
    case 'Inc':
      return { ...model, count: model.count + 1 };
    case 'Dec':
      return { ...model, count: model.count - 1 };
  }
}

function view(model$: Observable<Model>): BindingObject {
  return {
    text: {
      count: model$.pipe(map((m) => m.count)),
    },
    disabled: {
      dec: model$.pipe(map((m) => m.count <= 0)),
    },
  };
}

function eventsToMsg(
  events$: Record<string, Observable<Event>>,
): Observable<Msg> {
  const inc$ = events$.inc?.pipe(map(() => ({ type: 'Inc' } as Msg)));
  const dec$ = events$.dec?.pipe(map(() => ({ type: 'Dec' } as Msg)));

  const streams = [inc$, dec$].filter(
    (s): s is Observable<Msg> => !!s,
  );

  return merge(...streams);
}

const cfg: Omit<RunMVUConfig<Model, Msg>, 'root'> = {
  init,
  update,
  view,
  eventsToMsg,
};

export const counterComponent = createComponent(cfg);
