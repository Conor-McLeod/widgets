import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Decay from './Decay.vue';

export const mount: Mount = (el) => {
  const app = createApp(Decay);
  app.mount(el);
  return () => app.unmount();
};
