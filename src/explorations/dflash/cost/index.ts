import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Cost from './Cost.vue';

export const mount: Mount = (el) => {
  const app = createApp(Cost);
  app.mount(el);
  return () => app.unmount();
};
