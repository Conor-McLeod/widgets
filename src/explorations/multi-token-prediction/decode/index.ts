import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Decode from './Decode.vue';

export const mount: Mount = (el) => {
  const app = createApp(Decode);
  app.mount(el);
  return () => app.unmount();
};
