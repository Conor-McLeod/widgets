import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Schedule from './Schedule.vue';

export const mount: Mount = (el) => {
  const app = createApp(Schedule);
  app.mount(el);
  return () => app.unmount();
};
