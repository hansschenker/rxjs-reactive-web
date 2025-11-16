# rxjs-reactive-web

A tiny **reactive web framework** built from:

- **RxJS** for streams and time
- **TypeScript** for types
- **MVU (Model–View–Update)** in an Elm-like style
- **Pure HTML and DOM** (no directives, no JSX, no virtual DOM)

It combines:

- A convention-based binding system using `data-*` attributes
- An MVU runtime (`runMVU`)
- Reusable MVU components
- A minimal hash-based router with rich `Route` objects

> ✨ A great inspiration to create this RxJS + TypeScript based reactive web framework was **ChatGPT 5.1 Thinking**, including its own step-by-step “thinking stream” explanations, which also served as a learning resource while designing the architecture.

---

## Philosophy

- **No directives needed**
- **No extra compiler involved (besides TypeScript)**
- **Pure HTML, pure JavaScript enhanced with RxJS and TypeScript**
- **Elm-like MVU architecture style**
- Inputs and Outputs are explicit:
  - `data-on="name"` = **Input** (DOM → Observable → Msg)
  - `data-text/value/html/class/disabled` = **Sinks** (Model streams → DOM)

---

## Core ideas

### 1. BindingObject + bindTemplate

You declare DOM bindings via a **BindingObject**:

```ts
interface BindingObject {
  text?:      Record<string, Observable<TextLike>>;
  value?:     Record<string, Observable<TextLike>>;
  html?:      Record<string, Observable<string>>;
  className?: Record<string, Observable<string>>;
  disabled?:  Record<string, Observable<boolean>>;
  events?:    Record<string, (ev: Event) => void>;
}
```

And in HTML:

```html
<span data-text="name"></span>
<input data-value="query" />
<div data-html="results"></div>
<button data-disabled="save"></button>
<button data-on="inc">+</button>
```

`bindTemplate(root, bindings)`:

- Subscribes to all sink Observables and updates:
  - `textContent`, `value`, `innerHTML`, `className`, `disabled`
- Builds `events$: Record<string, Observable<Event>>` from `[data-on="name"]`
  - Multiple elements with the same `data-on` are merged into one stream.

### 2. MVU runtime: runMVU

You define:

- `Model` – your app state
- `Msg` – your messages
- `init` – initial model
- `update(model, msg)` – pure update function
- `view(model$)` – returns a `BindingObject`
- `eventsToMsg(events$)` – maps DOM events into Msg
- optional `externalMsgs$` – e.g. route changes, timers

Then:

```ts
const sub = runMVU({
  root,
  init,
  update,
  view,
  eventsToMsg,
  externalMsgs$,
});
```

This sets up the loop:

```text
DOM events (data-on) → events$ → Msg → update → model$ → view(model$) → BindingObject → DOM
```

### 3. Components (MVU islands)

You can turn any MVU configuration into a reusable component:

```ts
const counterComponent = createComponent({
  init,
  update,
  view,
  eventsToMsg,
});

counterComponent.run(document.getElementById('counter-1')!);
counterComponent.run(document.getElementById('counter-2')!);
```

Each call to `run(...)` mounts an **MVU island** under that root.

### 4. Routing

A minimal hash-based router:

- `createHashRoute$()` gives you `Observable<Route>`.
- `Route` has:
  - `hash`, `path`, `segments`, `params`.

You turn routes into messages:

```ts
const routeMsgs$ = createRouteMsg$<Msg>((route) => ({
  type: 'RouteChanged',
  route,
}));
```

Then pass `routeMsgs$` into `runMVU` as `externalMsgs$`.

To avoid full page reloads for links, you use:

```html
<a data-link href="#/counter">Counter</a>
<a data-link href="#/about">About</a>
```

And:

```ts
bindHashLinks(document.body);
```

This intercepts clicks on `<a data-link>` and only updates `window.location.hash`.

---

## Example: routed counter app

See `src/router-app.ts` and `index.html`:

- `#/counter` (or `#/`) shows the counter page.
- `#/about` shows a simple About page.
- Other routes show a “Not found” message.
- The counter itself uses `data-text`, `data-disabled`, `data-on` bindings.

---

## Getting started

```bash
git clone https://github.com/your-username/rxjs-reactive-web.git
cd rxjs-reactive-web
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`) and click around the demo.

---

## Credits

- Design & implementation: **you**, as the creator and maintainer of `rxjs-reactive-web`.
- Great inspiration: **ChatGPT 5.1 Thinking**, whose iterative “thinking stream” helped shape:
  - The `BindingObject` in/out model
  - Multi-element bindings using `querySelectorAll`
  - Event streams via `events$`
  - The Elm-like MVU architecture with RxJS
  - Components and routing on top of a pure web + RxJS + TypeScript stack

---

## License

MIT (or your preferred license).
