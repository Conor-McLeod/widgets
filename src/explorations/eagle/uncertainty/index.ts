import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Uncertainty from './Uncertainty.vue';

export const mount: Mount = (el) => {
  const app = createApp(Uncertainty);
  app.mount(el);
  return () => app.unmount();
};
