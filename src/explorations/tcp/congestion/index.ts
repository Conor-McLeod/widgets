import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Congestion from './Congestion.vue';

export const mount: Mount = (el) => {
  const app = createApp(Congestion);
  app.mount(el);
  return () => app.unmount();
};
