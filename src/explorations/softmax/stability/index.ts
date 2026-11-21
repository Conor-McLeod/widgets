import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Stability from './Stability.vue';

export const mount: Mount = (el) => {
  const app = createApp(Stability);
  app.mount(el);
  return () => app.unmount();
};
