import { Observable, Subscription, fromEvent, merge } from 'rxjs';
import { share } from 'rxjs/operators';

export type TextLike = string | number | null | undefined;

/**
 * BindingObject contains the actual data bindings:
 * - sinks: Observables driving DOM properties/attributes
 * - optional callback handlers for events (legacy / convenience)
 */
export interface BindingObject {
  text?: Record<string, Observable<TextLike>>;
  value?: Record<string, Observable<TextLike>>;
  html?: Record<string, Observable<string>>;
  className?: Record<string, Observable<string>>;
  disabled?: Record<string, Observable<boolean>>;
  events?: Record<string, (ev: Event) => void>;
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
}

/**
 * Internal helper to find *all* matching elements.
 */
function qAll<T extends HTMLElement = HTMLElement>(root: HTMLElement, selector: string): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

/**
 * Binds Observables (sinks) and event handlers (sources) to a DOM subtree.
 * - Supports multiple elements per binding name using querySelectorAll.
 * - Exposes event streams as Observables (events$) for MVU-style wiring.
 */
export function bindTemplate(root: HTMLElement, bindings: BindingObject): BindingResult {
  const sub = new Subscription();
  const events$: Record<string, Observable<Event>> = {};

  // TEXT: [data-text="name"] ← text$
  if (bindings.text) {
    for (const [name, stream] of Object.entries(bindings.text)) {
      const els = qAll(root, `[data-text="${name}"]`);
      if (!els.length) continue;

      for (const el of els) {
        sub.add(
          stream.subscribe((value) => {
            el.textContent = value == null ? '' : String(value);
          }),
        );
      }
    }
  }

  // VALUE: [data-value="name"] ← value$
  if (bindings.value) {
    for (const [name, stream] of Object.entries(bindings.value)) {
      const els = qAll<HTMLInputElement | HTMLTextAreaElement>(
        root,
        `[data-value="${name}"]`,
      );
      if (!els.length) continue;

      for (const el of els) {
        sub.add(
          stream.subscribe((value) => {
            el.value = value == null ? '' : String(value);
          }),
        );
      }
    }
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
            el.className = cls ?? '';
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
    for (const [name, handler] of Object.entries(bindings.events)) {
      const stream = events$[name];
      if (!stream) continue;

      sub.add(stream.subscribe(handler));
    }
  }

  return { subscription: sub, events$ };
}
