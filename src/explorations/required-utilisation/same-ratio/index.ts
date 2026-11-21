import { createApp } from 'vue';
import type { Mount } from '~/widget';
import SameRatio from './SameRatio.vue';

export const mount: Mount = (el) => {
  const app = createApp(SameRatio);
  app.mount(el);
  return () => app.unmount();
};
