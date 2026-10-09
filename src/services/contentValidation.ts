import { z } from 'zod'

const id = z.string().uuid().optional()
const slug = z.string().trim().min(1, 'Enter a slug.')
const published = z.boolean().optional().default(false)
const createdAt = z.string().datetime({ offset: true }).optional()

const schemas = {
  projects: z.object({
    id, title: z.string().trim().min(1), slug, summary: z.string().trim().min(1),
    problem: z.string().nullable().optional(), solution: z.string().nullable().optional(), result: z.string().nullable().optional(),
    technologies: z.array(z.string()).optional().default([]), image_url: z.string().nullable().optional(),
    service_id: z.string().uuid().nullable().optional(), is_published: published,
    display_order: z.number().int().optional().default(0), created_at: createdAt,
  }).strict(),
  testimonials: z.object({
    id, author: z.string().trim().min(1), role: z.string().nullable().optional(),
    quote: z.string().trim().min(1), is_published: published, created_at: createdAt,
  }).strict(),
  blog_posts: z.object({
    id, title: z.string().trim().min(1), slug, excerpt: z.string().nullable().optional(), body: z.string().optional().default(''),
    is_published: published, published_at: z.string().datetime({ offset: true }).nullable().optional(), created_at: createdAt,
  }).strict().refine(row => !row.is_published || row.body.trim().length > 0, { message: 'Published articles need a body.' }),
}

export type ContentTable = keyof typeof schemas
export type ContentRow = Record<string, string | boolean | string[] | number | null>

export function validateContentRow(table: ContentTable, row: ContentRow): ContentRow {
  const parsed = schemas[table].safeParse(row)
  if (!parsed.success) throw new Error('Check the required fields and values, then try saving again.')
  return parsed.data as ContentRow
}
