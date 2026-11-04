import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Horizons from './Horizons.vue';

export const mount: Mount = (el) => {
  const app = createApp(Horizons);
  app.mount(el);
  return () => app.unmount();
};
