import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Wire from './Wire.vue';

export const mount: Mount = (el) => {
  const app = createApp(Wire);
  app.mount(el);
  return () => app.unmount();
};
