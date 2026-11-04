import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Training from './Training.vue';

export const mount: Mount = (el) => {
  const app = createApp(Training);
  app.mount(el);
  return () => app.unmount();
};
