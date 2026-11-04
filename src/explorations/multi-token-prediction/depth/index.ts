import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Depth from './Depth.vue';

export const mount: Mount = (el) => {
  const app = createApp(Depth);
  app.mount(el);
  return () => app.unmount();
};
