import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Handshake from './Handshake.vue';

export const mount: Mount = (el) => {
  const app = createApp(Handshake);
  app.mount(el);
  return () => app.unmount();
};
