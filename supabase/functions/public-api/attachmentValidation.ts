export const ATTACHMENT_LIMIT = 5 * 1024 * 1024

const EXTENSIONS: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'text/plain': ['txt'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
}

export function isAllowedAttachment(filename: string, contentType: string, size: number) {
  const extension = filename.split('.').pop()?.toLowerCase() ?? ''
  return size > 0 && size <= ATTACHMENT_LIMIT && EXTENSIONS[contentType]?.includes(extension) === true
}

export function isConversationAttachmentPath(path: string, conversationId: string) {
  const [folder, objectName, ...extra] = path.split('/')
  if (folder !== conversationId || extra.length || !objectName || objectName[36] !== '-') return false
  const uuid = objectName.slice(0, 36)
  const filename = objectName.slice(37)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidPattern.test(uuid) && filename.length > 0 && filename.length <= 80 && /^[\w.-]+$/.test(filename)
}
