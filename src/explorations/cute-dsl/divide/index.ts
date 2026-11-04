import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Divide from './Divide.vue';

export const mount: Mount = (el) => {
  const app = createApp(Divide);
  app.mount(el);
  return () => app.unmount();
};
