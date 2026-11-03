import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import vue from '@astrojs/vue';
import react from '@astrojs/react';
import svelte from '@astrojs/svelte';

// @astrojs/react only injects the Fast Refresh preamble on pages with a React island.
// Widgets mount React themselves, so inject it on every page in dev.
const reactPreamble = {
  name: 'react-preamble-everywhere',
  hooks: {
    'astro:config:setup': ({ command, injectScript }) => {
      if (command !== 'dev') return;
      injectScript(
        'page',
        `import { injectIntoGlobalHook } from "/@react-refresh";
injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;`,
      );
    },
  },
};

export default defineConfig({
  integrations: [mdx(), vue(), react(), svelte(), reactPreamble],
});
