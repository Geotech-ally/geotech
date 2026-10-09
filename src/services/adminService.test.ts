import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), signOut: vi.fn(), signIn: vi.fn(), from: vi.fn(), rpc: vi.fn(), storageFrom: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: {
  auth: { getUser: mocks.getUser, signOut: mocks.signOut, signInWithPassword: mocks.signIn },
  from: mocks.from,
  rpc: mocks.rpc,
  storage: { from: mocks.storageFrom },
} }))

import { adminService } from './adminService'

beforeEach(() => vi.clearAllMocks())

function profileResult(data: { role: string } | null, error: unknown = null) {
  const terminal = { maybeSingle: vi.fn().mockResolvedValue({ data, error }) }
  const equality = { eq: vi.fn().mockReturnValue(terminal) }
  mocks.from.mockReturnValue({ select: vi.fn().mockReturnValue(equality) })
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
    await expect(adminService.conversation('inquiry-id', 'Project')).resolves.toEqual(expected)
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
