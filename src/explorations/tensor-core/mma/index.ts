import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Mma from './Mma.vue';

export const mount: Mount = (el) => {
  const app = createApp(Mma);
  app.mount(el);
  return () => app.unmount();
};
