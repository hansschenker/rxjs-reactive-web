import { runRouterApp } from './router-app';
import { bindHashLinks } from './router';

const root = document.getElementById('app') as HTMLElement;

const appSub = runRouterApp(root);
const linksSub = bindHashLinks(document.body);

// Optionally keep these around to clean up later:
// appSub.unsubscribe();
// linksSub.unsubscribe();
