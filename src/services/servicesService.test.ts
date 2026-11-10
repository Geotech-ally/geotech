import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { from: mocks.from } }))

import { servicesService } from './servicesService'

describe('servicesService public catalogue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists only active services in display order', async () => {
    const result = { data: [{ id: '1', slug: 'a', is_active: true }], error: null }
    const c: any = {}
    c.select = vi.fn().mockReturnValue(c)
    c.eq = vi.fn().mockReturnValue(c)
    c.order = vi.fn().mockReturnValue(c)
    Object.defineProperty(c, 'then', { value: (resolve: (v: unknown) => unknown) => resolve(result) })
    mocks.from.mockReturnValue(c)

    await expect(servicesService.list()).resolves.toEqual(result.data)
    expect(mocks.from).toHaveBeenCalledWith('services')
    expect(c.select).toHaveBeenCalledWith(expect.stringContaining('short_description'))
    expect(c.eq).toHaveBeenCalledWith('is_active', true)
  })

  it('returns null for inactive/missing slug lookups', async () => {
    const c: any = {}
    c.select = vi.fn().mockReturnValue(c)
    c.eq = vi.fn().mockReturnValue(c)
    c.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    mocks.from.mockReturnValue(c)
    await expect(servicesService.getBySlug('x')).resolves.toBeNull()
    expect(c.eq).toHaveBeenNthCalledWith(1, 'slug', 'x')
    expect(c.eq).toHaveBeenNthCalledWith(2, 'is_active', true)
  })
})
