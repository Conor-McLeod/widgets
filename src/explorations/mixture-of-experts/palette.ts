// One colour per expert, used by every widget on this page so "expert 3" is the same colour
// everywhere. Eight categorical hues, each stepped separately for light and dark surfaces.
// Colour is never the only cue: experts are also labelled by number.
import { onBeforeUnmount, ref } from 'vue';

const LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

export const MAX_EXPERTS = LIGHT.length;

/** Reactive expert colours that follow the OS colour scheme (as the site theme does). */
export function useExpertColors() {
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const colors = ref(mq?.matches ? DARK : LIGHT);
  const onChange = () => (colors.value = mq?.matches ? DARK : LIGHT);
  mq?.addEventListener('change', onChange);
  onBeforeUnmount(() => mq?.removeEventListener('change', onChange));
  return colors;
}
