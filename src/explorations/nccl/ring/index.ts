import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Ring from './Ring.vue';

export const mount: Mount = (el) => {
  const app = createApp(Ring);
  app.mount(el);
  return () => app.unmount();
};
