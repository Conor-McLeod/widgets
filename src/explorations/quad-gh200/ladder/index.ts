import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Ladder from './Ladder.vue';

export const mount: Mount = (el) => {
  const app = createApp(Ladder);
  app.mount(el);
  return () => app.unmount();
};
