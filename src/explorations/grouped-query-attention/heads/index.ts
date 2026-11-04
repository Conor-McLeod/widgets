import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Heads from './Heads.vue';

export const mount: Mount = (el) => {
  const app = createApp(Heads);
  app.mount(el);
  return () => app.unmount();
};
