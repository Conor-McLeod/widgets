import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Fit from './Fit.vue';

export const mount: Mount = (el) => {
  const app = createApp(Fit);
  app.mount(el);
  return () => app.unmount();
};
