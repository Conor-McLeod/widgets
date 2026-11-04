import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Recall from './Recall.vue';

export const mount: Mount = (el) => {
  const app = createApp(Recall);
  app.mount(el);
  return () => app.unmount();
};
