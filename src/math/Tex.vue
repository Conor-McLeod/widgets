<script setup lang="ts">
// Inline maths for Vue widgets: <Tex t="\beta" />. Pass `text` instead of `t` to render a
// string where only the `$...$` parts are maths.
import { computed } from 'vue';
import { tex, texText } from './tex';

const props = defineProps<{ t?: string; text?: string; display?: boolean }>();
const html = computed(() =>
  props.text !== undefined ? texText(props.text, { display: props.display }) : tex(props.t ?? '', { display: props.display }),
);
</script>

<template>
  <span class="tex" v-html="html" />
</template>
