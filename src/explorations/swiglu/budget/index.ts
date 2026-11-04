import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Budget from './Budget.vue';

export const mount: Mount = (el) => {
  const app = createApp(Budget);
  app.mount(el);
  return () => app.unmount();
};
