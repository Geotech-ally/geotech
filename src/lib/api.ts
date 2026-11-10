import { supabase } from './supabase'
export class ApiError extends Error {
  constructor(message = 'We could not complete your request. Please check your details and try again.') {
    super(message)
    this.name = 'ApiError'
  }
}

const safeMessages: Record<string, string> = {
  invalid_request: 'Please check the request details and try again.',
  unsupported_action: 'This request is not supported.',
  rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
  service_unavailable: 'This service is temporarily unavailable. Please try again shortly.',
  submission_failed: 'We could not save your inquiry. Please try again shortly.',
  invalid_token: 'This conversation link is invalid or expired.',
  conversation_closed: 'This conversation is closed.',
  invalid_file: 'Check the selected file and try again.',
  upload_failed: 'We could not prepare the file upload. Please try again.',
  message_failed: 'Your reply could not be sent. Please try again.',
  attachment_cleanup_failed: 'Your reply could not be sent and its uploaded file could not be removed. Please contact support before retrying.',
  request_failed: 'We could not complete your request. Please try again.',
}

async function safeServerMessage(data: unknown, error: unknown): Promise<string | undefined> {
  let body = data
  if (!body && error && typeof error === 'object' && 'context' in error && error.context instanceof Response) {
    try { body = await error.context.clone().json() } catch { /* Use the generic safe message below. */ }
  }
  if (!body || typeof body !== 'object' || !('error' in body) || !body.error || typeof body.error !== 'object') return undefined
  const code = 'code' in body.error && typeof body.error.code === 'string' ? body.error.code : ''
  return safeMessages[code]
}

export async function api<T = Record<string, never>>(action: string, payload: object = {}, options: { admin?: boolean } = {}): Promise<T> {
  try {
    const headers: Record<string, string> = {}
    if (options.admin) {
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token
      if (token) headers.Authorization = `Bearer ${token}`
    }
    const { data, error } = await supabase.functions.invoke('public-api', { body: { ...payload, action }, headers })
    if (error || !data || data.ok !== true) {
      const message = await safeServerMessage(data, error)
      throw new ApiError(message)
    }
    return data as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    // Edge transport errors can contain response bodies or infrastructure details.
    throw new ApiError()
  }
}
