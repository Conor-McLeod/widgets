import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Pick from './Pick.vue';

export const mount: Mount = (el) => {
  const app = createApp(Pick);
  app.mount(el);
  return () => app.unmount();
};
