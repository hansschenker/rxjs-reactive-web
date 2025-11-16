import { Observable, merge, fromEvent, Subscription } from 'rxjs';
import { map, withLatestFrom, distinctUntilChanged, startWith } from 'rxjs/operators';
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
  const route$ = model$.pipe(map(m => m.route));
  
  const title$ = route$.pipe(
    map((route) =>
      isCounter(route) ? 'Counter Page' :
      route.path === '/about' ? 'About Page' :
      'Not Found',
    ),
  );

  // Only show count when on counter route
  const count$ = model$.pipe(
    withLatestFrom(route$),
    map(([m, route]) => ({
      show: isCounter(route),
      count: m.count
    })),
    map(({show, count}) => show ? String(count) : '')
  );

  // Content based on route
  const content$ = route$.pipe(
    map((route) => {
      if (isCounter(route)) {
        return `
          <div id="counter-root">
            <p>Count: <span data-text="count"></span></p>
            <button data-on="inc">+</button>
            <button data-on="dec">-</button>
            <button data-disabled="dec">Can't go below zero</button>
          </div>
        `;
      }
      if (route.path === '/about') {
        return `
          <div id="about-root">
            <h1>About This App</h1>
            <p>This is a simple counter application built with RxJS and TypeScript.</p>
            <p>It demonstrates the Model-View-Update (MVU) architecture pattern.</p>
          </div>
        `;
      }
      return `<p>Sorry, route <code>${route.hash}</code> not found.</p>`;
    })
  );

  return {
    text: {
      // Title binding
      'h1': title$,
      // Count binding - only updates when on counter route
      '[data-text="count"]': count$
    },
    // Set the content based on route
    html: {
      '#app > div': content$
    },
    // Disable buttons when not on counter route
    disabled: {
      '[data-on="dec"]': model$.pipe(
        withLatestFrom(route$),
        map(([m, route]) => m.count <= 0 || !isCounter(route))
      ),
      '[data-disabled="dec"]': model$.pipe(
        withLatestFrom(route$),
        map(([m, route]) => m.count > 0 || !isCounter(route))
      )
    },
    // Event handlers for counter buttons
    events: {
      'click [data-on="inc"]': (event: Event) => {
        event.preventDefault();
        return { type: 'Inc' } as Msg;
      },
      'click [data-on="dec"]': (event: Event) => {
        event.preventDefault();
        return { type: 'Dec' } as Msg;
      }
    }
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
const routeMsgs$ = createRouteMsg$<Msg>((route) => {
  console.log('Route changed to:', route);
  return {
    type: 'RouteChanged',
    route,
  };
});

// Add initial route change
const initialRouteMsg$ = new Observable<Msg>(subscriber => {
  subscriber.next({
    type: 'RouteChanged',
    route: parseRoute(window.location.hash || '#/')
  });
  subscriber.complete();
});

// Combine initial route with route changes
const allRouteMsgs$ = merge(initialRouteMsg$, routeMsgs$);

// Debug: Log all navigation events
const debugSub = fromEvent(window, 'hashchange').subscribe(() => {
  console.log('Hash changed:', window.location.hash);
});

export function runRouterApp(root: HTMLElement) {
  // Ensure initial route is set
  if (!window.location.hash) {
    window.location.hash = '/counter';
  }

  const mvuSub = runMVU({
    root,
    init,
    update,
    view,
    eventsToMsg,
    externalMsgs$: allRouteMsgs$,
  });

  // Combine subscriptions
  const combinedSub = new Subscription();
  combinedSub.add(mvuSub);
  combinedSub.add(debugSub);
  
  return combinedSub;
}
