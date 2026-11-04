import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Hash from './Hash.vue';

export const mount: Mount = (el) => {
  const app = createApp(Hash);
  app.mount(el);
  return () => app.unmount();
};
