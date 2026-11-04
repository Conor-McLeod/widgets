import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Ttt from './Ttt.vue';

export const mount: Mount = (el) => {
  const app = createApp(Ttt);
  app.mount(el);
  return () => app.unmount();
};
