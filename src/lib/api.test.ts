import { beforeEach, expect, it, vi } from 'vitest'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { functions: { invoke } } }))

import { api } from './api'

beforeEach(() => invoke.mockReset())

it('turns a safe server rejection into a frontend error', async () => {
  invoke.mockResolvedValue({ data: { ok: false, error: { code: 'submission_failed', message: 'We could not save your inquiry. Please try again shortly.' } }, error: null })
  await expect(api('submit_inquiry', {})).rejects.toThrow('We could not save your inquiry. Please try again shortly.')
})

it('reads only allowlisted safe messages from an Edge HTTP error response', async () => {
  invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ ok: false, error: { code: 'rate_limited', message: 'internal detail must be ignored' } }), { status: 429 }) } })
  await expect(api('submit_inquiry', {})).rejects.toThrow('Too many attempts. Please wait a few minutes and try again.')
})

it('hides transport and infrastructure details from the user', async () => {
  invoke.mockResolvedValue({ data: null, error: new Error('postgres host and internal credentials') })
  await expect(api('submit_inquiry', {})).rejects.toThrow('We could not complete your request. Please check your details and try again.')
})
