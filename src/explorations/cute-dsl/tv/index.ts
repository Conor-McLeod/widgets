import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Tv from './Tv.vue';

export const mount: Mount = (el) => {
  const app = createApp(Tv);
  app.mount(el);
  return () => app.unmount();
};
