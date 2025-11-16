import { Observable, Subscription, fromEvent, merge, Subject, from, of } from 'rxjs';
import { share, tap, finalize, distinctUntilChanged, switchMap } from 'rxjs/operators';

// Extend ErrorConstructor to include captureStackTrace
declare global {
  interface ErrorConstructor {
    captureStackTrace?(error: Error, constructorOpt?: Function): void;
  }
}

// Enhanced type definitions
export type TextLike = string | number | null | undefined;
type EventHandler = (ev: Event) => void;
type BindingKey = `[${string}]` | `.${string}` | string;

// Cache for event streams to prevent duplicate subscriptions
const eventCache = new WeakMap<HTMLElement, Map<string, Observable<Event>>>();

// Custom error class for binding errors
export class BindingError extends Error {
  constructor(message: string, public readonly context?: unknown) {
    super(message);
    this.name = 'BindingError';
    // Fix for TypeScript error with captureStackTrace
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, BindingError);
    }
  }
}

// Type-safe binding handlers
interface BindingHandlers {
  text: (el: HTMLElement, value: TextLike) => void;
  value: (el: HTMLInputElement, value: TextLike) => void;
  html: (el: HTMLElement, value: string) => void;
  className: (el: HTMLElement, value: string) => void;
  disabled: (el: HTMLElement, value: boolean) => void;
  [key: `data-${string}`]: (el: HTMLElement, value: unknown) => void;
}

/**
 * BindingObject contains the actual data bindings:
 * - sinks: Observables driving DOM properties/attributes
 * - optional callback handlers for events (legacy / convenience)
 */
export interface BindingObject {
  text?: Record<BindingKey, Observable<TextLike>>;
  value?: Record<BindingKey, Observable<TextLike>>;
  html?: Record<BindingKey, Observable<string>>;
  className?: Record<BindingKey, Observable<string | string[]>>;
  disabled?: Record<BindingKey, Observable<boolean>>;
  events?: Record<string, EventHandler>;
  // Allow custom data attributes
  [key: `data-${string}`]: Record<BindingKey, Observable<unknown>> | Record<string, EventHandler> | undefined;
}

/**
 * Result of binding:
 * - `subscription` controls the lifecycle of all sink bindings + callback handlers.
 * - `events$` exposes Observable event streams per [data-on="name"].
 *   Each stream merges events from all elements with that name.
 */
export interface BindingResult {
  subscription: Subscription;
  events$: Record<string, Observable<Event>>;
  // New: Add cleanup function for better resource management
  dispose: () => void;
}

// Internal helper to find *all* matching elements with validation
function qAll<T extends HTMLElement = HTMLElement>(root: HTMLElement, selector: string): T[] {
  if (!root || !(root instanceof HTMLElement)) {
    throw new BindingError('Invalid root element', { root, selector });
  }
  
  try {
    const elements = Array.from(root.querySelectorAll<T>(selector));
    if (elements.length === 0) {
      console.warn(`No elements found for selector: ${selector}`);
    }
    return elements;
  } catch (error) {
    throw new BindingError(`Invalid selector: ${selector}`, { error, selector });
  }
}

// Default binding handlers
const defaultHandlers: BindingHandlers = {
  text: (el, value) => { el.textContent = value?.toString() ?? ''; },
  value: (el, value) => { if ('value' in el) (el as HTMLInputElement).value = value?.toString() ?? ''; },
  html: (el, value) => { el.innerHTML = value; },
  className: (el, value) => { 
    if (Array.isArray(value)) {
      el.className = value.join(' ');
    } else {
      el.className = value || ''; 
    }
  },
  disabled: (el, value) => { 
    if (value) el.setAttribute('disabled', '');
    else el.removeAttribute('disabled');
  }
};

/**
 * Binds Observables (sinks) and event handlers (sources) to a DOM subtree.
 * - Supports multiple elements per binding name using querySelectorAll.
 * - Exposes event streams as Observables (events$) for MVU-style wiring.
 * - Includes performance optimizations and better type safety.
 * 
 * @param root - The root element to bind within
 * @param bindings - Object containing the bindings configuration
 * @returns BindingResult with subscription and event streams
 * 
 * @example
 * // Basic text binding
 * bind(root, {
 *   text: { '.greeting': of('Hello, World!') }
 * });
 * 
 * // Event handling
 * const { events$ } = bind(root, {
 *   events: { 'click': (e) => console.log('Clicked!') }
 * });
 */
export function bind(root: HTMLElement, bindings: BindingObject): BindingResult {
  if (!root || !(root instanceof HTMLElement)) {
    throw new BindingError('Root element must be a valid HTMLElement');
  }

  const sub = new Subscription();
  const events$: Record<string, Observable<Event>> = {};
  const cleanupFns: Array<() => void> = [];

  // Helper to safely subscribe to observables with cleanup
  function bindObservable<T>(
    selector: string, 
    stream$: Observable<T>,
    handler: (el: HTMLElement, value: T) => void
  ) {
    const elements = qAll(root, selector);
    if (!elements.length) return;

    const sub$ = stream$.pipe(
      distinctUntilChanged(),
      tap(value => {
        elements.forEach(el => {
          try {
            handler(el, value);
          } catch (error) {
            console.error(`Error in binding handler for ${selector}:`, error);
          }
        });
      })
    ).subscribe();

    sub.add(sub$);
  }

  // Helper to create or get cached event stream
  function getOrCreateEventStream(eventName: string, selector: string): Observable<Event> {
    const cacheKey = `${eventName}:${selector}`;
    let elementMap = eventCache.get(root);
    
    if (!elementMap) {
      elementMap = new Map();
      eventCache.set(root, elementMap);
    }

    if (elementMap.has(cacheKey)) {
      return elementMap.get(cacheKey)!;
    }

    const elements = qAll(root, selector);
    if (!elements.length) {
      return new Observable<Event>();
    }

    const eventStream$ = merge(
      ...elements.map(el => fromEvent(el, eventName))
    ).pipe(share());

    elementMap.set(cacheKey, eventStream$);
    return eventStream$;
  }

  // Bind text content
  if (bindings.text) {
    Object.entries(bindings.text).forEach(([selector, stream$]) => {
      bindObservable(selector, stream$, (el, value) => {
        defaultHandlers.text(el, value);
      });
    });
  }

  // Bind value
  if (bindings.value) {
    Object.entries(bindings.value).forEach(([selector, stream$]) => {
      bindObservable(selector, stream$, (el, value) => {
        if (el instanceof HTMLInputElement || 
            el instanceof HTMLTextAreaElement || 
            el instanceof HTMLSelectElement) {
          el.value = value == null ? '' : String(value);
        }
      });
    });
  }

  // HTML: [data-html="name"] ← html$
  if (bindings.html) {
    for (const [name, stream] of Object.entries(bindings.html)) {
      const els = qAll(root, `[data-html="${name}"]`);
      if (!els.length) continue;

      for (const el of els) {
        sub.add(
          stream.subscribe((html) => {
            el.innerHTML = html ?? '';
          }),
        );
      }
    }
  }

  // CLASSNAME: [data-class="name"] ← class$
  if (bindings.className) {
    for (const [name, stream] of Object.entries(bindings.className)) {
      const els = qAll(root, `[data-class="${name}"]`);
      if (!els.length) continue;

      for (const el of els) {
        sub.add(
          stream.subscribe((cls) => {
            el.className = Array.isArray(cls) ? cls.join(' ') : (cls ?? '');
          }),
        );
      }
    }
  }

  // DISABLED: [data-disabled="name"] ← disabled$
  if (bindings.disabled) {
    for (const [name, stream] of Object.entries(bindings.disabled)) {
      const els = qAll<HTMLButtonElement | HTMLInputElement>(
        root,
        `[data-disabled="${name}"]`,
      );
      if (!els.length) continue;

      for (const el of els) {
        sub.add(
          stream.subscribe((isDisabled) => {
            el.disabled = Boolean(isDisabled);
          }),
        );
      }
    }
  }

  // EVENTS (as Observables): [data-on="name"] → events$[name]
  const onEls = qAll<HTMLElement>(root, '[data-on]');
  for (const el of onEls) {
    const name = el.getAttribute('data-on');
    if (!name) continue;

    const streamForEl = fromEvent<Event>(el, 'click');

    if (!events$[name]) {
      events$[name] = streamForEl;
    } else {
      events$[name] = merge(events$[name], streamForEl);
    }
  }

  // Make each events$[name] shared so multiple subscribers
  // share a single underlying DOM subscription.
  for (const [name, stream] of Object.entries(events$)) {
    events$[name] = stream.pipe(share());
  }

  // Optional: callback mode: bindings.events[name](ev) ← events$[name]
  if (bindings.events) {
    Object.entries(bindings.events).forEach(([name, handler]) => {
      const stream = events$[name];
      if (stream) {
        sub.add(stream.subscribe(handler));
      }
    });
  }

  // Handle custom data attributes
  Object.entries(bindings).forEach(([key, value]) => {
    if (key.startsWith('data-') && value && typeof value === 'object') {
      Object.entries(value).forEach(([selector, stream$]) => {
        if (stream$ instanceof Observable) {
          bindObservable(selector, stream$, (el, val) => {
            el.setAttribute(key, String(val));
          });
        }
      });
    }
  });

  // Return the binding result
  return {
    subscription: sub,
    events$,
    dispose: () => {
      sub.unsubscribe();
      cleanupFns.forEach(fn => fn());
      cleanupFns.length = 0;
    }
  };
}

/**
 * Binds a template to the root element using the provided bindings.
 * This is a convenience wrapper around the main bind function.
 * 
 * @param root - The root element to bind to
 * @param bindings - The bindings configuration
 * @returns The binding result with subscription and event streams
 */
export function bindTemplate(root: HTMLElement, bindings: BindingObject): BindingResult {
  return bind(root, bindings);
}
