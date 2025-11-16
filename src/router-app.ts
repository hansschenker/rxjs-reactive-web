import { Observable, merge } from 'rxjs';
import { map } from 'rxjs/operators';
import { BindingObject } from './bind';
import { runMVU, RunMVUConfig } from './mvu';
import { createRouteMsg$, Route, parseRoute } from './router';

type Model = {
  route: Route;
  count: number;
};

type Msg =
  | { type: 'RouteChanged'; route: Route }
  | { type: 'Inc' }
  | { type: 'Dec' };

const init: Model = {
  route: parseRoute(window.location.hash || '#/'),
  count: 0,
};

function update(model: Model, msg: Msg): Model {
  switch (msg.type) {
    case 'RouteChanged':
      return { ...model, route: msg.route };
    case 'Inc':
      return { ...model, count: model.count + 1 };
    case 'Dec':
      return { ...model, count: model.count - 1 };
  }
}

/**
 * For simplicity:
 * - "/" or "/counter" → counter page
 * - "/about"         → about page
 * - anything else    → not found
 */
function isCounter(route: Route): boolean {
  return route.path === '/' || route.path === '/counter';
}

function view(model$: Observable<Model>): BindingObject {
  const title$ = model$.pipe(
    map((m) =>
      isCounter(m.route) ? 'Counter Page' :
      m.route.path === '/about' ? 'About Page' :
      'Not Found',
    ),
  );

  const content$ = model$.pipe(
    map((m) => {
      if (isCounter(m.route)) {
        return `<p>This is the counter. Use the buttons below.</p>`;
      }
      if (m.route.path === '/about') {
        return `<p>This is the About page, rendered via data-html.</p>`;
      }
      return `<p>Sorry, route <code>${m.route.hash}</code> not found.</p>`;
    }),
  );

  const count$ = model$.pipe(map((m) => m.count));

  return {
    text: {
      title: title$,
      count: count$,
    },
    html: {
      content: content$,
    },
    disabled: {
      dec: model$.pipe(map((m) => m.count <= 0)),
    },
  };
}

/**
 * DOM events → messages
 */
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

/**
 * Router → messages
 */
const routeMsgs$ = createRouteMsg$<Msg>((route) => ({
  type: 'RouteChanged',
  route,
}));

export function runRouterApp(root: HTMLElement) {
  const cfg: RunMVUConfig<Model, Msg> = {
    root,
    init,
    update,
    view,
    eventsToMsg,
    externalMsgs$: routeMsgs$,
  };

  return runMVU(cfg);
}
