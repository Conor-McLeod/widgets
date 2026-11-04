import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Block from './Block.vue';

export const mount: Mount = (el) => {
  const app = createApp(Block);
  app.mount(el);
  return () => app.unmount();
};
