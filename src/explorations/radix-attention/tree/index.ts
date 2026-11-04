import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Tree from './Tree.vue';

export const mount: Mount = (el) => {
  const app = createApp(Tree);
  app.mount(el);
  return () => app.unmount();
};
