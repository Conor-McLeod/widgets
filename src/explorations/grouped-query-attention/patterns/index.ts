import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Patterns from './Patterns.vue';

export const mount: Mount = (el) => {
  const app = createApp(Patterns);
  app.mount(el);
  return () => app.unmount();
};
