import { Subscription } from 'rxjs';
import { RunMVUConfig, runMVU } from './mvu';

/**
 * A Component is something you can "run" on a DOM root,
 * returning a Subscription that controls its lifecycle.
 */
export interface Component<Model, Msg> {
  run(root: HTMLElement): Subscription;
}

/**
 * Create a reusable MVU component.
 *
 * You provide init, update, view, eventsToMsg, externalMsgs$.
 * The root is injected when mounting.
 */
export function createComponent<Model, Msg>(
  cfg: Omit<RunMVUConfig<Model, Msg>, 'root'>,
): Component<Model, Msg> {
  return {
    run(root: HTMLElement): Subscription {
      return runMVU({ ...cfg, root });
    },
  };
}
