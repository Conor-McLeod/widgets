import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Cache from './Cache.vue';

export const mount: Mount = (el) => {
  const app = createApp(Cache);
  app.mount(el);
  return () => app.unmount();
};
