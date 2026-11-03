import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Float64Explorer from './Float64Explorer.vue';

export const mount: Mount = (el) => {
  const app = createApp(Float64Explorer);
  app.mount(el);
  return () => app.unmount();
};
