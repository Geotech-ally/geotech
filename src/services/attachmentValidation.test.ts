import { describe, expect, it } from 'vitest'
import { ATTACHMENT_LIMIT, isAllowedAttachment, isConversationAttachmentPath } from '../../supabase/functions/public-api/attachmentValidation'

const conversationId = '72607ee8-3ed1-4edc-b8c4-86b232172954'
const objectPath = `${conversationId}/c2d60514-74fe-4fc8-9a06-c9d62ba073c1-report.pdf`

describe('private attachment validation', () => {
  it('accepts supported matching file types under the storage limit', () => {
    expect(isAllowedAttachment('report.pdf', 'application/pdf', 1200)).toBe(true)
    expect(isAllowedAttachment('notes.txt', 'text/plain', ATTACHMENT_LIMIT)).toBe(true)
  })

  it('rejects oversized, empty, or mismatched file types', () => {
    expect(isAllowedAttachment('report.pdf', 'application/pdf', ATTACHMENT_LIMIT + 1)).toBe(false)
    expect(isAllowedAttachment('report.exe', 'application/pdf', 1200)).toBe(false)
    expect(isAllowedAttachment('empty.txt', 'text/plain', 0)).toBe(false)
  })

  it('accepts only object paths directly inside the token-resolved conversation folder', () => {
    expect(isConversationAttachmentPath(objectPath, conversationId)).toBe(true)
    expect(isConversationAttachmentPath(objectPath, 'eac24793-5549-48e4-8b64-0887ae99b115')).toBe(false)
    expect(isConversationAttachmentPath(`${conversationId}/../other/file.pdf`, conversationId)).toBe(false)
    expect(isConversationAttachmentPath(`${conversationId}/not-a-uuid-report.pdf`, conversationId)).toBe(false)
  })
})
