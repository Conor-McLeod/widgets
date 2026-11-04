import { createApp } from 'vue';
import type { Mount } from '~/widget';
import E2m1 from './E2m1.vue';

export const mount: Mount = (el) => {
  const app = createApp(E2m1);
  app.mount(el);
  return () => app.unmount();
};
