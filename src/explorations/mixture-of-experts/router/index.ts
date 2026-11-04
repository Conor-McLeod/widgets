import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Router from './Router.vue';

export const mount: Mount = (el) => {
  const app = createApp(Router);
  app.mount(el);
  return () => app.unmount();
};
