// Scaffold an exploration and/or a widget inside one.
//
//   pnpm new <slug>                          new exploration with a Vue widget named "main"
//   pnpm new <slug> --fw vanilla             ...with a plain TS/DOM widget instead
//   pnpm new <slug> <widget> --fw react      add a widget to an existing (or new) exploration
//
// Frameworks: vue | vanilla | react | svelte
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const FRAMEWORKS = ['vanilla', 'vue', 'react', 'svelte'] as const;
type Framework = (typeof FRAMEWORKS)[number];

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    fw: { type: 'string', default: 'vue' },
    title: { type: 'string' },
  },
});

const [slug, widget = 'main'] = positionals;
const fw = values.fw as Framework;
const kebab = /^[a-z0-9]+(-[a-z0-9]+)*$/;

if (!slug || !kebab.test(slug) || !kebab.test(widget)) {
  console.error('usage: pnpm new <slug> [widget] [--fw vue|vanilla|react|svelte] [--title "..."]');
  console.error('slug and widget must be kebab-case');
  process.exit(1);
}
if (!FRAMEWORKS.includes(fw)) {
  console.error(`unknown --fw ${fw}; expected one of ${FRAMEWORKS.join(', ')}`);
  process.exit(1);
}

const root = join(import.meta.dirname, '..', 'src', 'explorations', slug);
const widgetDir = join(root, widget);
const Name = widget.replace(/(^|-)([a-z0-9])/g, (_: string, __: string, c: string) => c.toUpperCase());

if (existsSync(widgetDir)) {
  console.error(`src/explorations/${slug}/${widget} already exists`);
  process.exit(1);
}

const created: string[] = [];
function write(path: string, content: string) {
  writeFileSync(path, content);
  created.push(path.slice(path.indexOf('src/')));
}

mkdirSync(widgetDir, { recursive: true });

const mdx = join(root, 'index.mdx');
if (!existsSync(mdx)) {
  const today = new Date().toISOString().slice(0, 10);
  write(
    mdx,
    `---
title: ${values.title ?? slug.replace(/-/g, ' ')}
summary: TODO one sentence on what this explains.
date: ${today}
tags: []
draft: true
---

TODO: what question motivated this?

<Widget src="${widget}" />
`,
  );
}

const templates: Record<Framework, () => void> = {
  vanilla() {
    write(
      join(widgetDir, 'index.ts'),
      `import type { Mount } from '~/widget';

export const mount: Mount = (el) => {
  el.innerHTML = \`<p>${Name}</p>\`;
  return () => {};
};
`,
    );
  },
  vue() {
    write(
      join(widgetDir, 'index.ts'),
      `import { createApp } from 'vue';
import type { Mount } from '~/widget';
import ${Name} from './${Name}.vue';

export const mount: Mount = (el) => {
  const app = createApp(${Name});
  app.mount(el);
  return () => app.unmount();
};
`,
    );
    write(
      join(widgetDir, `${Name}.vue`),
      `<script setup lang="ts">
import { ref } from 'vue';

const n = ref(0);
</script>

<template>
  <button @click="n++">${Name}: {{ n }}</button>
</template>

<style scoped></style>
`,
    );
  },
  react() {
    write(
      join(widgetDir, 'index.ts'),
      `import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Mount } from '~/widget';
import ${Name} from './${Name}';

export const mount: Mount = (el) => {
  const root = createRoot(el);
  root.render(createElement(${Name}));
  return () => root.unmount();
};
`,
    );
    write(
      join(widgetDir, `${Name}.tsx`),
      `import { useState } from 'react';

export default function ${Name}() {
  const [n, setN] = useState(0);
  return <button onClick={() => setN(n + 1)}>${Name}: {n}</button>;
}
`,
    );
  },
  svelte() {
    write(
      join(widgetDir, 'index.ts'),
      `import { mount as svelteMount, unmount } from 'svelte';
import type { Mount } from '~/widget';
import ${Name} from './${Name}.svelte';

export const mount: Mount = (el) => {
  const app = svelteMount(${Name}, { target: el });
  return () => unmount(app);
};
`,
    );
    write(
      join(widgetDir, `${Name}.svelte`),
      `<script lang="ts">
  let n = $state(0);
</script>

<button onclick={() => n++}>${Name}: {n}</button>
`,
    );
  },
};

templates[fw]();

console.log(created.map((p) => `  created ${p}`).join('\n'));
console.log(`\n  page:   http://localhost:4321/${slug}`);
console.log(`  widget: http://localhost:4321/w/${slug}/${widget}`);
