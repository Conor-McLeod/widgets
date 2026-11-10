import { createApp } from 'vue';
import type { Mount } from '~/widget';
import Topology from './Topology.vue';

export const mount: Mount = (el) => {
  const app = createApp(Topology);
  app.mount(el);
  return () => app.unmount();
};
