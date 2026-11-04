import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Chain from './Chain.vue';

export const mount: Mount = (el) => {
  const app = createApp(Chain);
  app.mount(el);
  return () => app.unmount();
};
