import { Observable, of } from 'rxjs';
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
      '[data-text="count"]': model$.pipe(map((m) => String(m.count))),
      '[data-text="title"]': of('Counter Example')
    },
    disabled: {
      '[data-disabled="dec"]': model$.pipe(map((m) => m.count <= 0)),
    },
    events: {
      'click [data-on="inc"]': () => ({ type: 'Inc' } as Msg),
      'click [data-on="dec"]': () => ({ type: 'Dec' } as Msg)
    }
  };
}

const cfg: Omit<RunMVUConfig<Model, Msg>, 'root'> = {
  init,
  update,
  view,
};

export const counterComponent = createComponent(cfg);
