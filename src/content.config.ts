import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const explorations = defineCollection({
  loader: glob({
    pattern: '*/index.mdx',
    base: './src/explorations',
    // The folder name is the slug: explorations/float64/index.mdx -> "float64".
    generateId: ({ entry }) => entry.split('/')[0],
  }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { explorations };
