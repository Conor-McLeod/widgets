import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Conflicts from './Conflicts.vue';

export const mount: Mount = (el) => {
  const app = createApp(Conflicts);
  app.mount(el);
  return () => app.unmount();
};
