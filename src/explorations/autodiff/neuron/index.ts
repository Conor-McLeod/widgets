import { createApp } from 'vue';
import type { Mount } from '~/widget';
import GraphStepper from '../lib/GraphStepper.vue';
import { NEURON } from '../lib/graph';

export const mount: Mount = (el) => {
  const app = createApp(GraphStepper, { graph: NEURON, trainable: true, initialMode: 'reverse' });
  app.mount(el);
  return () => app.unmount();
};
