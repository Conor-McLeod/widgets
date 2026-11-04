import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Layout from './Layout.vue';

export const mount: Mount = (el) => {
  const app = createApp(Layout);
  app.mount(el);
  return () => app.unmount();
};
