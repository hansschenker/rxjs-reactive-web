import { Observable, fromEvent, Subscription } from 'rxjs';
import {
  map,
  startWith,
  distinctUntilChanged,
  shareReplay,
} from 'rxjs/operators';

/**
 * Rich Route model:
 * - hash:  raw hash including leading "#", e.g. "#/users/42?tab=details"
 * - path:  normalized path, always starting with "/", e.g. "/users/42"
 * - segments: ["users", "42"]
 * - params: parsed query string, e.g. { tab: "details" }
 */
export interface Route {
  hash: string;
  path: string;
  segments: string[];
  params: Record<string, string>;
}

/**
 * Parse a hash string like "#/users/42?tab=details" into a Route object.
 */
export function parseRoute(rawHash: string): Route {
  const hash = rawHash || '#/';

  const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const [pathPartRaw, queryPart = ''] = withoutHash.split('?', 2);

  const pathPart = pathPartRaw || '/';
  const path =
    pathPart.startsWith('/') || pathPart === '' ? pathPart || '/' : `/${pathPart}`;

  const segments = path
    .split('/')
    .filter((seg) => seg.length > 0);

  const params: Record<string, string> = {};
  if (queryPart) {
    const search = new URLSearchParams(queryPart);
    search.forEach((value, key) => {
      params[key] = value;
    });
  }

  return { hash, path, segments, params };
}

/**
 * Observable of Route:
 * - emits the current route immediately
 * - emits on each hashchange
 */
export function createHashRoute$(): Observable<Route> {
  const getRoute = () => parseRoute(window.location.hash || '#/');

  return fromEvent<HashChangeEvent>(window, 'hashchange').pipe(
    map(getRoute),
    startWith(getRoute()),
    distinctUntilChanged((a, b) => a.hash === b.hash),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
}

/**
 * Helper: turn routes into messages for MVU.
 */
export function createRouteMsg$<Msg>(
  mkMsg: (route: Route) => Msg,
): Observable<Msg> {
  return createHashRoute$().pipe(map(mkMsg));
}

/**
 * Enhance <a data-link> anchors so they:
 * - prevent full page navigation
 * - simply update window.location.hash
 *
 * Example HTML:
 *   <a data-link href="#/counter">Counter</a>
 */
export function bindHashLinks(root: HTMLElement = document.body): Subscription {
  const sub = new Subscription();
  const links = Array.from(
    root.querySelectorAll<HTMLAnchorElement>('a[data-link]'),
  );

  for (const link of links) {
    const onClick = (ev: MouseEvent) => {
      if (
        ev.defaultPrevented ||
        ev.button !== 0 ||
        ev.metaKey ||
        ev.ctrlKey ||
        ev.shiftKey ||
        ev.altKey
      ) {
        return;
      }

      const href = link.getAttribute('href');
      if (!href) return;
      if (!href.startsWith('#')) return;

      ev.preventDefault();
      window.location.hash = href;
    };

    link.addEventListener('click', onClick);

    sub.add(
      new Subscription(() => {
        link.removeEventListener('click', onClick);
      }),
    );
  }

  return sub;
}
