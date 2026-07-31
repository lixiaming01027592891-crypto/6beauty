import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishDate: z.string(),
    coverImage: z.string(),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { blog };
