import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Absorb from './Absorb.vue';

export const mount: Mount = (el) => {
  const app = createApp(Absorb);
  app.mount(el);
  return () => app.unmount();
};
