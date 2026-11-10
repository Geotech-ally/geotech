import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), signOut: vi.fn(), signIn: vi.fn(), from: vi.fn(), rpc: vi.fn(), storageFrom: vi.fn() }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser, signOut: mocks.signOut, signInWithPassword: mocks.signIn },
    from: mocks.from,
    rpc: mocks.rpc,
    storage: { from: mocks.storageFrom },
  },
}))

import { adminService } from './adminService'

beforeEach(() => vi.clearAllMocks())

function profileResult(data: { role: string } | null, error: unknown = null) {
  const terminal = { maybeSingle: vi.fn().mockResolvedValue({ data, error }) }
  const equality = { eq: vi.fn().mockReturnValue(terminal) }
  mocks.from.mockReturnValue({ select: vi.fn().mockReturnValue(equality) })
}

function inquiryQueryResult(result: { data: any[] | null; error: unknown; count?: number | null }) {
  const chain: any = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.or = vi.fn().mockReturnValue(chain)
  chain.gte = vi.fn().mockReturnValue(chain)
  chain.lte = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.range = vi.fn().mockResolvedValue(result)
  mocks.from.mockReturnValue(chain)
  return chain
}

describe('admin authorization and messaging behavior', () => {
  it('fails closed when there is no authenticated user', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(adminService.isAdmin()).resolves.toBe(false)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('does not treat profile lookup failures or ordinary roles as admin', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-id' } }, error: null })
    profileResult(null, new Error('RLS denied'))
    await expect(adminService.isAdmin()).resolves.toBe(false)
    profileResult({ role: 'client' })
    await expect(adminService.isAdmin()).resolves.toBe(false)
  })

  it('allows only an authenticated profile with the admin role', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-id' } }, error: null })
    profileResult({ role: 'admin' })
    await expect(adminService.isAdmin()).resolves.toBe(true)
  })

  it('shows sign-out failure instead of treating it as success', async () => {
    mocks.signOut.mockResolvedValue({ error: new Error('auth backend detail') })
    await expect(adminService.signOut()).rejects.toThrow('Could not sign out. Please try again.')
  })

  it('creates or reuses an inquiry conversation through the admin-only RPC', async () => {
    const expected = { id: 'thread-id', access_token: 'private-token' }
    const single = vi.fn().mockResolvedValue({ data: expected, error: null })
    mocks.rpc.mockReturnValue({ single })
    await expect(adminService.conversation('inquiry-id', 'Project')).resolves.toEqual({ ...expected, status: 'open', subject: 'Project' })
    expect(mocks.rpc).toHaveBeenCalledWith('admin_get_or_create_conversation', { p_inquiry_id: 'inquiry-id', p_subject: 'Project' })
  })

  it('validates content fields and publishes a blog post with a schema timestamp', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'post-id' }, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const upsert = vi.fn().mockReturnValue({ select })
    mocks.from.mockReturnValue({ upsert })
    await expect(adminService.contentSave('blog_posts', { title: 'A post', slug: 'a-post', body: 'A fictional article body.', is_published: true })).resolves.toBeUndefined()
    expect(mocks.from).toHaveBeenCalledWith('blog_posts')
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ title: 'A post', body: 'A fictional article body.', is_published: true, published_at: expect.any(String) }))
    await expect(adminService.contentSave('projects', { title: 'Missing summary', slug: 'missing-summary' })).rejects.toThrow(/required fields/i)
  })

  it('saves company profile drafts and sets publish timestamps when published', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'profile-id' }, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const upsert = vi.fn().mockReturnValue({ select })
    mocks.from.mockReturnValue({ upsert })

    await expect(adminService.contentSave('company_profile', { company_name: 'Nexyvon Technologies', introduction: 'Intro', mission: 'Mission', vision: 'Vision', is_published: false })).resolves.toBeUndefined()
    expect(upsert).toHaveBeenLastCalledWith(expect.objectContaining({ company_name: 'Nexyvon Technologies', is_published: false, slug: 'default' }))

    await expect(adminService.contentSave('company_profile', { company_name: 'Nexyvon Technologies', introduction: 'Intro', mission: 'Mission', vision: 'Vision', is_published: true })).resolves.toBeUndefined()
    expect(upsert).toHaveBeenLastCalledWith(expect.objectContaining({ is_published: true, published_at: expect.any(String), updated_at: expect.any(String) }))
  })

  it('turns a duplicate content slug into a safe editor error', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'private database detail' } })
    const select = vi.fn().mockReturnValue({ single })
    mocks.from.mockReturnValue({ upsert: vi.fn().mockReturnValue({ select }) })
    await expect(adminService.contentSave('blog_posts', { title: 'A post', slug: 'a-post', is_published: false })).rejects.toThrow('That slug is already in use. Choose a different slug.')
  })

  it('removes an uploaded admin attachment if its message insert is rejected by RLS', async () => {
    const remove = vi.fn().mockResolvedValue({ error: null })
    mocks.storageFrom.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      remove,
    })
    const single = vi.fn().mockResolvedValue({ data: null, error: new Error('RLS denied') })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    mocks.from.mockReturnValue({ insert })
    const file = new File(['safe test content'], 'brief.txt', { type: 'text/plain' })

    await expect(adminService.send('conversation-id', 'Please review this file', file)).rejects.toThrow('Message could not be saved. Please try again.')
    expect(remove).toHaveBeenCalledOnce()
    expect(remove.mock.calls[0][0][0]).toMatch(/^conversation-id\//)
  })

  it('rejects unsupported admin attachments before uploading', async () => {
    const upload = vi.fn()
    mocks.storageFrom.mockReturnValue({ upload })
    await expect(adminService.send('conversation-id', 'Please review', new File(['x'], 'payload.exe', { type: 'application/octet-stream' }))).rejects.toThrow(/PDF, PNG, JPG, TXT, or DOCX/)
    expect(upload).not.toHaveBeenCalled()
  })
})

describe('admin inquiry pagination', () => {
  it('fetches a server-side page with stable ordering and exact count (no full-table fetch)', async () => {
    const chain = inquiryQueryResult({ data: [{ id: '1' }], error: null, count: 145 })
    const page = await adminService.inquiries({ page: 2, pageSize: 20, status: 'new', search: 'acme', fromDate: '2026-01-01', toDate: '2026-01-31' })

    expect(mocks.from).toHaveBeenCalledWith('inquiries')
    expect(chain.select).toHaveBeenCalledWith(expect.stringContaining('project_description'), { count: 'exact' })
    expect(chain.eq).toHaveBeenCalledWith('status', 'new')
    expect(chain.or).toHaveBeenCalledWith(expect.stringContaining('name.ilike'))
    expect(chain.gte).toHaveBeenCalledWith('created_at', expect.stringContaining('2026-01-01'))
    expect(chain.lte).toHaveBeenCalledWith('created_at', expect.stringContaining('2026-01-31'))
    expect(chain.order).toHaveBeenNthCalledWith(1, 'created_at', { ascending: false })
    expect(chain.order).toHaveBeenNthCalledWith(2, 'id', { ascending: false })
    expect(chain.range).toHaveBeenCalledWith(20, 39) // page 2, 20 per page
    expect(page).toMatchObject({ page: 2, pageSize: 20, count: 145, totalPages: 8 })
    expect(page.rows).toHaveLength(1)
  })

  it('handles empty inquiry database', async () => {
    inquiryQueryResult({ data: [], error: null, count: 0 })
    await expect(adminService.inquiries({ page: 1 })).resolves.toEqual({ rows: [], count: 0, page: 1, pageSize: 20, totalPages: 1 })
  })

  it('supports >100 inquiries via pagination metadata', async () => {
    inquiryQueryResult({ data: Array.from({ length: 20 }, (_, i) => ({ id: String(i) })), error: null, count: 120 })
    const page = await adminService.inquiries({ page: 1, pageSize: 20 })
    expect(page.rows).toHaveLength(20)
    expect(page.count).toBe(120)
    expect(page.totalPages).toBe(6)
  })

  it('surfaces database errors (including unauthorized/RLS failures)', async () => {
    inquiryQueryResult({ data: null, error: new Error('permission denied for table inquiries'), count: null })
    await expect(adminService.inquiries()).rejects.toThrow(/permission denied/i)
  })
})


describe('admin conversation management', () => {
  it('lists conversation summaries through admin-only RPC with filters', async () => {
    const rows = [{ conversation_id: 'c1', unread_count: 2, status: 'open' }]
    mocks.rpc.mockResolvedValue({ data: rows, error: null })
    await expect(adminService.conversationSummaries({ status: 'open', unreadOnly: true })).resolves.toEqual(rows)
    expect(mocks.rpc).toHaveBeenCalledWith('admin_list_conversations', { p_status: 'open', p_unread_only: true, p_limit: 100, p_offset: 0 })
  })

  it('surfaces unauthorized/RLS errors when listing conversations', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('Admin access required.') })
    await expect(adminService.conversationSummaries()).rejects.toThrow(/Admin access required/i)
  })

  it('marks conversation read through admin-only RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: 3, error: null })
    await expect(adminService.markConversationRead('conv-1')).resolves.toBeUndefined()
    expect(mocks.rpc).toHaveBeenCalledWith('admin_mark_conversation_read', { p_conversation_id: 'conv-1' })
  })
})

describe('admin service catalogue CMS', () => {
  it('loads full service records for admin management', async () => {
    const chain: any = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockReturnValue(chain)
    chain.then = (resolve: any) => resolve({ data: [{ id: 's1', name: 'Svc' }], error: null })
    mocks.from.mockReturnValue(chain)
    await expect(adminService.services()).resolves.toEqual([{ id: 's1', name: 'Svc' }])
    expect(mocks.from).toHaveBeenCalledWith('services')
    expect(chain.select).toHaveBeenCalledWith(expect.stringContaining('short_description'))
  })

  it('validates and saves a service (create/edit)', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 's1' }, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const upsert = vi.fn().mockReturnValue({ select })
    mocks.from.mockReturnValue({ upsert })
    await expect(adminService.saveService({
      name: 'New Service', slug: 'new-service', short_description: 'Short', description: 'Full description',
      category: 'development', pricing_type: 'fixed', starting_price: 1000, currency: 'KES',
      estimated_duration: '2 weeks', features: ['A'], is_featured: true, is_active: true, display_order: 1,
    })).resolves.toBeUndefined()
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ slug: 'new-service', is_active: true, is_featured: true, features: ['A'] }))
  })

  it('rejects invalid service payloads without inventing prices', async () => {
    await expect(adminService.saveService({
      name: '', slug: 'x', short_description: 's', description: 'd', category: 'c', pricing_type: 'custom_quote',
    } as any)).rejects.toThrow(/required/i)
    await expect(adminService.saveService({
      name: 'N', slug: 'bad slug', short_description: 's', description: 'd', category: 'c', pricing_type: 'custom_quote',
    } as any)).rejects.toThrow(/slug/i)
    await expect(adminService.saveService({
      name: 'N', slug: 'ok', short_description: 's', description: 'd', category: 'c', pricing_type: 'fixed', starting_price: null,
    } as any)).rejects.toThrow(/price/i)
  })

  it('archives/deletes services through admin-authorized mutations and surfaces errors', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 's1' }, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const delEq = vi.fn().mockReturnValue({ select })
    const del = vi.fn().mockReturnValue({ eq: delEq })
    mocks.from.mockReturnValue({ delete: del })
    await expect(adminService.deleteService('s1')).resolves.toBeUndefined()
    expect(mocks.from).toHaveBeenCalledWith('services')

    const updSingle = vi.fn().mockResolvedValue({ data: null, error: new Error('RLS denied') })
    const updSelect = vi.fn().mockReturnValue({ single: updSingle })
    const updEq = vi.fn().mockReturnValue({ select: updSelect })
    const update = vi.fn().mockReturnValue({ eq: updEq })
    mocks.from.mockReturnValue({ update })
    await expect(adminService.updateService('s1', { is_active: false })).rejects.toThrow(/RLS denied/i)
  })
})
