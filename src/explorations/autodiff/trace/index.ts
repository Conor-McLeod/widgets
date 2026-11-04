import { createApp } from 'vue';
import type { Mount } from '~/widget';
import GraphStepper from '../lib/GraphStepper.vue';
import { BAYDIN } from '../lib/graph';

export const mount: Mount = (el) => {
  const app = createApp(GraphStepper, { graph: BAYDIN });
  app.mount(el);
  return () => app.unmount();
};
