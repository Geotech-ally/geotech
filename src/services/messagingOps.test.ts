import { expect, it, vi } from 'vitest'
import { insertMessageWithAttachmentCleanup } from '../../supabase/functions/public-api/messagingOps'

it('keeps the uploaded file when the message row is saved', async () => {
  const remove = vi.fn()
  const result = await insertMessageWithAttachmentCleanup(async () => ({ error: null }), remove)
  expect(result).toEqual({ saved: true, cleanupSucceeded: true })
  expect(remove).not.toHaveBeenCalled()
})

it('cleans up an uploaded file when the message insert fails', async () => {
  const remove = vi.fn().mockResolvedValue(true)
  const result = await insertMessageWithAttachmentCleanup(async () => ({ error: new Error('RLS denied') }), remove)
  expect(result).toEqual({ saved: false, cleanupSucceeded: true })
  expect(remove).toHaveBeenCalledOnce()
})

it('reports cleanup failures without exposing the storage error', async () => {
  const remove = vi.fn().mockRejectedValue(new Error('storage internals'))
  const result = await insertMessageWithAttachmentCleanup(async () => ({ error: new Error('database internals') }), remove)
  expect(result).toEqual({ saved: false, cleanupSucceeded: false })
})
