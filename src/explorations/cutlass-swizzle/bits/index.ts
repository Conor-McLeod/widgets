import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Bits from './Bits.vue';

export const mount: Mount = (el) => {
  const app = createApp(Bits);
  app.mount(el);
  return () => app.unmount();
};
