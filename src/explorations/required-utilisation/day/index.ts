import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Day from './Day.vue';

export const mount: Mount = (el) => {
  const app = createApp(Day);
  app.mount(el);
  return () => app.unmount();
};
