import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Fan from './Fan.vue';

export const mount: Mount = (el) => {
  const app = createApp(Fan);
  app.mount(el);
  return () => app.unmount();
};
