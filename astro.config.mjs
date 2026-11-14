import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import vue from '@astrojs/vue';
import react from '@astrojs/react';
import svelte from '@astrojs/svelte';
import { satteri } from '@astrojs/markdown-satteri';
import { htmlToHast } from 'satteri';
import katex from 'katex';

// Sätteri's `math` feature parses `$...$` and `$$...$$` but leaves them as
// <code class="math-inline|math-display">. Render those with KaTeX at build time. A TeX error
// throws, so a typo fails the build instead of shipping.
const katexMath = {
  name: 'katex-math',
  element: {
    filter: ['code'],
    visit(node, ctx) {
      const cls = node.properties?.className ?? [];
      const display = cls.includes('math-display');
      if (!display && !cls.includes('math-inline')) return;
      const src = ctx.textContent(node);
      let html;
      try {
        html = katex.renderToString(src, { displayMode: display, throwOnError: true, output: 'htmlAndMathml' });
      } catch (err) {
        const where = ctx.fileURL ? ctx.fileURL.pathname : 'a Markdown file';
        throw new Error(`TeX error in ${where}: ${err.message}\n  source: ${src}`);
      }
      // Swap in KaTeX's output as a parsed tree (MDX can't hold raw HTML). Drop `xmlns`: HTML gives inline
      // <math>/<svg> their namespace anyway, and Sätteri would emit it as a bogus `:xmlns` attribute.
      // Display maths arrives as <pre><code>; replace the <pre> so no code-block styling leaks in.
      const tree = htmlToHast(html.replace(/ xmlns="[^"]*"/g, ''), { fragment: true });
      ctx.replaceNode(display ? ctx.parent(node) : node, tree.children);
    },
  },
};

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
  // `$...$` inline and `$$...$$` display maths in Markdown and MDX (MDX inherits the processor).
  markdown: {
    processor: satteri({ features: { math: true }, hastPlugins: [katexMath] }),
  },
  integrations: [mdx(), vue(), react(), svelte(), reactPreamble],
});
