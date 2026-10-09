import { beforeEach, expect, it, vi } from 'vitest'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { from } }))

import { blogService, contentService } from './contentService'

beforeEach(() => from.mockReset())

function queryWithResult(result: unknown) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  query.select = vi.fn(() => query)
  query.eq = vi.fn(() => query)
  query.order = vi.fn()
  query.maybeSingle = vi.fn().mockResolvedValue(result)
  query.order.mockImplementation(() => query)
  Object.defineProperty(query, 'then', { value: (resolve: (value: unknown) => unknown) => resolve(result) })
  from.mockReturnValue(query)
  return query
}

it('reads only published projects and applies stable schema-backed ordering', async () => {
  const q = queryWithResult({ data: [], error: null })
  await expect(contentService.projects()).resolves.toEqual([])
  expect(from).toHaveBeenCalledWith('projects')
  expect(q.select).toHaveBeenCalledWith('id,title,slug,summary,problem,solution,result,technologies')
  expect(q.eq).toHaveBeenCalledWith('is_published', true)
  expect(q.order).toHaveBeenNthCalledWith(1, 'display_order')
  expect(q.order).toHaveBeenNthCalledWith(2, 'created_at', { ascending: false })
})

it('keeps unpublished blog posts inaccessible by direct slug query', async () => {
  const q = queryWithResult({ data: null, error: null })
  await expect(blogService.get('draft-slug')).resolves.toBeNull()
  expect(from).toHaveBeenCalledWith('blog_posts')
  expect(q.eq).toHaveBeenNthCalledWith(1, 'slug', 'draft-slug')
  expect(q.eq).toHaveBeenNthCalledWith(2, 'is_published', true)
  expect(q.maybeSingle).toHaveBeenCalledOnce()
})

it('selects only summary columns in the insights list and sorts published dates last when null', async () => {
  const q = queryWithResult({ data: [], error: null })
  await expect(blogService.list()).resolves.toEqual([])
  expect(from).toHaveBeenCalledWith('blog_posts')
  expect(q.select).toHaveBeenCalledWith('id,title,slug,excerpt,published_at')
  expect(q.order).toHaveBeenNthCalledWith(1, 'published_at', { ascending: false, nullsFirst: false })
  expect(q.order).toHaveBeenNthCalledWith(2, 'created_at', { ascending: false })
})

it('propagates query errors instead of turning them into empty lists', async () => {
  const failure = new Error('database unavailable')
  queryWithResult({ data: null, error: failure })
  await expect(contentService.testimonials()).rejects.toBe(failure)
})
