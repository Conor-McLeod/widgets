import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Vector from './Vector.vue';

export const mount: Mount = (el) => {
  const app = createApp(Vector);
  app.mount(el);
  return () => app.unmount();
};
