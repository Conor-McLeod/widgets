import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Request from './Request.vue';

export const mount: Mount = (el) => {
  const app = createApp(Request);
  app.mount(el);
  return () => app.unmount();
};
