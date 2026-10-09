// Public, rate-limited API. Holds the service-role key and Redis credentials server-side only.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3.23.8'
import { ATTACHMENT_LIMIT, isAllowedAttachment, isConversationAttachmentPath } from './attachmentValidation.ts'
import { insertMessageWithAttachmentCleanup } from './messagingOps.ts'
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const R = Deno.env.get('UPSTASH_REDIS_REST_URL'), RT = Deno.env.get('UPSTASH_REDIS_REST_TOKEN')
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const LIMITS: Record<string, [number, number]> = { submit_inquiry: [3, 3600], client_send: [20, 600], upload_url: [10, 600], client_get: [120, 600] } // [max, window seconds]
const TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
// Fixed-window counter in Redis. If Redis isn't configured or is down, requests are allowed (fail open).
async function limited(key: string, max: number, win: number) {
  if (!R || !RT) return false
  try {
    const r = await fetch(`${R}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${RT}` }, body: JSON.stringify([['INCR', key], ['EXPIRE', key, win, 'NX']]) })
    const [c] = await r.json(); return c.result > max
  } catch { return false }
}
const opt = z.string().trim().max(200).optional()
async function removeAttachment(path: string) {
  try { return !(await sb.storage.from('attachments').remove([path])).error }
  catch { return false }
}
const submitSchema = z.object({ action: z.literal('submit_inquiry'), name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(254), phone: opt, whatsapp: opt, company_name: opt,
  service_id: z.string().uuid().optional().or(z.literal('')), project_description: z.string().trim().min(20).max(5000), budget_range: opt, timeline: opt, referral_source: opt,
  website: z.string().max(0).optional() }).strict()
const clientGetSchema = z.object({ action: z.literal('client_get'), token: z.string().uuid() }).strict()
const uploadSchema = z.object({ action: z.literal('upload_url'), token: z.string().uuid(), filename: z.string().min(1).max(255), size: z.number().int().positive().max(5242880), type: z.string().min(1).max(120) }).strict()
const clientSendSchema = z.object({ action: z.literal('client_send'), token: z.string().uuid(), message: z.string().trim().min(1).max(5000), attachment_path: z.string().min(1).max(500).optional() }).strict()
const requestSchema = z.discriminatedUnion('action', [submitSchema, clientGetSchema, uploadSchema, clientSendSchema])
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const out = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  const fail = (code: string, message: string, status: number) => out({ ok: false, error: { code, message } }, status)
  try {
    if (req.method !== 'POST') return fail('method_not_allowed', 'Use POST to submit this request.', 405)
    let raw: unknown
    try { raw = await req.json() } catch { return fail('invalid_request', 'The request body must be valid JSON.', 400) }
    const parsed = requestSchema.safeParse(raw)
    if (!parsed.success) return fail('invalid_request', 'Please check the request details and try again.', 400)
    const p = parsed.data
    const action = p.action
    const lim = LIMITS[action]
    if (!lim) return fail('unsupported_action', 'This request is not supported.', 400)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
    if (await limited(`rl:${action}:${ip}`, lim[0], lim[1])) return fail('rate_limited', 'Too many attempts. Please wait a few minutes and try again.', 429)
    if (action === 'submit_inquiry') {
      if (p.website) return fail('invalid_request', 'We could not submit this inquiry. Please check the form and try again.', 400)
      if (await limited(`rl:email:${p.email.toLowerCase()}`, 3, 86400)) return fail('rate_limited', 'Too many attempts. Please wait a few minutes and try again.', 429)
      const { data: conversationToken, error } = await sb.rpc('submit_project_inquiry', {
        p_name: p.name, p_email: p.email, p_phone: p.phone ?? null, p_whatsapp: p.whatsapp ?? null,
        p_company_name: p.company_name ?? null, p_service_id: p.service_id || null,
        p_project_description: p.project_description, p_budget_range: p.budget_range ?? null,
        p_timeline: p.timeline ?? null, p_referral_source: p.referral_source ?? null,
      })
      if (error || typeof conversationToken !== 'string' || !z.string().uuid().safeParse(conversationToken).success) {
        return fail('submission_failed', 'We could not save your inquiry. Please try again shortly.', 500)
      }
      return out({ ok: true, token: conversationToken })
    }
    const { data: conv, error: conversationError } = await sb.from('conversations').select('id,subject,status').eq('access_token', p.token).maybeSingle()
    if (conversationError) return fail('request_failed', 'We could not load this conversation. Please try again.', 500)
    if (!conv) return fail('invalid_token', 'This conversation link is invalid or expired.', 404)
    if (action === 'client_get') {
      const { data: ms, error: messagesError } = await sb.from('messages').select('id,sender_type,message,created_at,attachment_path').eq('conversation_id', conv.id).order('created_at')
      if (messagesError) return fail('request_failed', 'We could not load this conversation. Please try again.', 500)
      const messages = await Promise.all((ms ?? []).map(async ({ attachment_path, ...m }) => {
        if (!attachment_path) return { ...m, attachment_url: null }
        const { data, error } = await sb.storage.from('attachments').createSignedUrl(attachment_path, 300)
        if (error || !data) throw new Error('Attachment could not be prepared.')
        return { ...m, attachment_url: data.signedUrl }
      }))
      return out({ ok: true, subject: conv.subject, status: conv.status, messages })
    }
    if (conv.status !== 'open') return fail('conversation_closed', 'This conversation is closed.', 409)
    if (action === 'upload_url') {
      if (!TYPES.includes(p.type) || !isAllowedAttachment(p.filename, p.type, p.size)) return fail('invalid_file', 'Choose a matching PDF, PNG, JPG, TXT, or DOCX file under 5 MB.', 400)
      const path = `${conv.id}/${crypto.randomUUID()}-${p.filename.replace(/[^\w.-]/g, '_').slice(0, 80)}`
      const { data, error } = await sb.storage.from('attachments').createSignedUploadUrl(path)
      return error || !data ? fail('upload_failed', 'We could not prepare the file upload. Please try again.', 500) : out({ ok: true, path, token: data.token })
    }
    const path = p.attachment_path
    if (path) {
      if (!isConversationAttachmentPath(path, conv.id)) {
        return fail('invalid_file', 'The attached file does not belong to this conversation.', 400)
      }
      const { data: info, error: infoError } = await sb.storage.from('attachments').info(path)
      const contentType = info?.contentType
      const filename = path.split('/')[1].slice(37)
      if (infoError || !info || typeof info.size !== 'number' || !TYPES.includes(contentType ?? '') || !isAllowedAttachment(filename, contentType ?? '', info.size)) {
        const cleaned = await removeAttachment(path)
        return fail(cleaned ? 'invalid_file' : 'attachment_cleanup_failed', cleaned
          ? 'The attached file is missing or is not an allowed type and size.'
          : 'The attached file could not be validated or removed. Please contact support before retrying.', 400)
      }
    }
    const result = await insertMessageWithAttachmentCleanup(
      () => sb.from('messages').insert({ conversation_id: conv.id, sender_type: 'client', message: p.message, attachment_path: path ?? null }),
      () => path ? removeAttachment(path) : Promise.resolve(true),
    )
    if (!result.saved) {
      const cleanupFailed = !!path && !result.cleanupSucceeded
      const message = !path
        ? 'Your reply could not be sent. Please try again.'
        : result.cleanupSucceeded
          ? 'Your reply could not be sent. The uploaded file was removed; please try again.'
          : 'Your reply could not be sent and its uploaded file could not be removed. Please contact support before retrying.'
      return fail(cleanupFailed ? 'attachment_cleanup_failed' : 'message_failed', message, 500)
    }
    return out({ ok: true })
  } catch { return fail('request_failed', 'We could not complete your request. Please try again.', 500) }
})
