import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Logits from './Logits.vue';

export const mount: Mount = (el) => {
  const app = createApp(Logits);
  app.mount(el);
  return () => app.unmount();
};
