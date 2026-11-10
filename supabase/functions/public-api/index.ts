// Public, rate-limited API. Holds the service-role key and Redis credentials server-side only.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3.23.8'
import { ATTACHMENT_LIMIT, isAllowedAttachment, isConversationAttachmentPath } from './attachmentValidation.ts'
import { insertMessageWithAttachmentCleanup } from './messagingOps.ts'
import {
  checkRateLimit,
  enforcePolicies,
  extractTrustedClientIp,
  policiesForAction,
  readCorsConfigFromEnv,
  readTrustedClientIpConfigFromEnv,
  resolveCorsDecision,
} from './rateLimit.ts'
import {
  getNotificationConfig,
  sendAdminReplyClientNotification,
  sendClientMessageAdminNotification,
  sendInquiryNotifications,
  sendInquiryStatusClientNotification,
} from './delivery.ts'
import { shouldSendStatusNotification } from './notifications.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const sb = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const REDIS_URL = Deno.env.get('UPSTASH_REDIS_REST_URL') ?? undefined
const REDIS_TOKEN = Deno.env.get('UPSTASH_REDIS_REST_TOKEN') ?? undefined
const TRUSTED_IP_CONFIG = readTrustedClientIpConfigFromEnv({
  TRUST_CLIENT_IP_HEADERS: Deno.env.get('TRUST_CLIENT_IP_HEADERS') ?? undefined,
  TRUSTED_CLIENT_IP_HEADER: Deno.env.get('TRUSTED_CLIENT_IP_HEADER') ?? undefined,
  TRUSTED_PROXY_SECRET_HEADER: Deno.env.get('TRUSTED_PROXY_SECRET_HEADER') ?? undefined,
  TRUSTED_PROXY_SECRET: Deno.env.get('TRUSTED_PROXY_SECRET') ?? undefined,
})
const CORS_CONFIG = readCorsConfigFromEnv({
  PUBLIC_API_ALLOWED_ORIGINS: Deno.env.get('PUBLIC_API_ALLOWED_ORIGINS') ?? undefined,
  PUBLIC_API_ALLOW_LOCALHOST_DEV: Deno.env.get('PUBLIC_API_ALLOW_LOCALHOST_DEV') ?? undefined,
  PUBLIC_API_ENV: Deno.env.get('PUBLIC_API_ENV') ?? Deno.env.get('DENO_DEPLOYMENT_ID') ? 'production' : undefined,
  PUBLIC_API_CORS_DENY_MODE: Deno.env.get('PUBLIC_API_CORS_DENY_MODE') ?? undefined,
  PUBLIC_API_ALLOW_NULL_ORIGIN: Deno.env.get('PUBLIC_API_ALLOW_NULL_ORIGIN') ?? undefined,
})
const NOTIFY_CONFIG = getNotificationConfig()

const TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']

type LogLevel = 'info' | 'warn' | 'error'
function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  // Never log passwords, auth tokens, access tokens, emails, messages, or attachment contents.
  const entry = { ts: new Date().toISOString(), level, event, service: 'public-api', ...fields }
  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}

const rateLimitDeps = {
  redisUrl: REDIS_URL,
  redisToken: REDIS_TOKEN,
  log: (entry: Record<string, unknown>) => log('warn', String(entry.event ?? 'rate_limit_event'), entry),
}

const jsonHeaders = (corsHeaders: Record<string, string>) => ({ 'Content-Type': 'application/json', ...corsHeaders })
const out = (b: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status, headers })
const fail = (code: string, message: string, status: number, headers: Record<string, string> = {}) =>
  out({ ok: false, error: { code, message } }, status, headers)

function rateLimitFailure(action: string, decision: { kind: 'blocked'; retryAfter: number } | { kind: 'unavailable' }, headers: Record<string, string>) {
  if (decision.kind === 'blocked') {
    return fail('rate_limited', 'Too many attempts. Please wait a few minutes and try again.', 429, {
      ...headers,
      'Retry-After': String(decision.retryAfter),
    })
  }
  log('error', 'rate_limit_dependency_unavailable', { action })
  return fail(
    'service_unavailable',
    'This service is temporarily unavailable. Please try again shortly.',
    503,
    { ...headers, 'Retry-After': '60' },
  )
}

async function getAuthedAdmin(req: Request) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!token || !SUPABASE_ANON_KEY) return null
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data, error } = await userClient.auth.getUser()
  if (error || !data?.user) return null
  const profile = await sb.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
  if (profile.error || profile.data?.role !== 'admin') return null
  return { userId: data.user.id as string }
}

function safeNotify(task: Promise<unknown>, event: string, fields: Record<string, unknown> = {}) {
  // Notification delivery must never discard successful stored operations.
  task.catch(() => log('warn', 'notification_delivery_error', { event, ...fields }))
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
const adminReplySchema = z.object({ action: z.literal('admin_send_reply'), conversation_id: z.string().uuid(), message: z.string().trim().min(1).max(5000) }).strict()
const adminStatusSchema = z.object({ action: z.literal('admin_update_inquiry_status'), inquiry_id: z.string().uuid(), status: z.enum(['new','reviewing','contacted','proposal_sent','negotiating','approved','rejected','completed']), notify_client: z.boolean().optional().default(false), priority: z.enum(['low','normal','high']).optional(), admin_notes: z.string().max(5000).nullable().optional() }).strict()
const adminConversationStatusSchema = z.object({ action: z.literal('admin_set_conversation_status'), conversation_id: z.string().uuid(), status: z.enum(['open','closed']), notify_client: z.boolean().optional().default(false) }).strict()
const requestSchema = z.discriminatedUnion('action', [submitSchema, clientGetSchema, uploadSchema, clientSendSchema, adminReplySchema, adminStatusSchema, adminConversationStatusSchema])

Deno.serve(async (req) => {
  const cors = resolveCorsDecision(req.headers.get('origin'), CORS_CONFIG)
  const headers = jsonHeaders(cors.headers)

  if (cors.browserRequest && !cors.allowed) {
    log('warn', 'cors_origin_denied', { hasOrigin: true })
    if (req.method === 'OPTIONS') return new Response(null, { status: cors.denyStatus ?? 403, headers: cors.headers })
    return fail('origin_not_allowed', 'This request origin is not allowed.', cors.denyStatus ?? 403, headers)
  }

  if (req.method === 'OPTIONS') {
    if (cors.browserRequest && cors.allowed) return new Response(null, { status: 204, headers: cors.headers })
    return new Response(null, { status: 204, headers: { Vary: 'Origin' } })
  }

  try {
    if (req.method !== 'POST') return fail('method_not_allowed', 'Use POST to submit this request.', 405, headers)

    let raw: unknown
    try { raw = await req.json() } catch { return fail('invalid_request', 'The request body must be valid JSON.', 400, headers) }
    const parsed = requestSchema.safeParse(raw)
    if (!parsed.success) {
      log('info', 'request_invalid', { action: typeof (raw as any)?.action === 'string' ? (raw as any).action : 'unknown' })
      return fail('invalid_request', 'Please check the request details and try again.', 400, headers)
    }

    const p = parsed.data
    const action = p.action
    const clientIp = extractTrustedClientIp(req.headers, TRUSTED_IP_CONFIG)
    if (!clientIp.trusted) {
      log('warn', 'client_ip_unverified', { action, source: clientIp.source })
    }

    if (action === 'submit_inquiry') {
      if (p.website) return fail('invalid_request', 'We could not submit this inquiry. Please check the form and try again.', 400, headers)

      const ipDecision = await enforcePolicies(policiesForAction('submit_inquiry'), { ip: clientIp.ip }, rateLimitDeps)
      if (ipDecision.kind !== 'allowed') return rateLimitFailure(action, ipDecision, headers)

      const emailPolicies = policiesForAction('submit_inquiry_email')
      for (const policy of emailPolicies) {
        const emailDecision = await checkRateLimit(policy, { email: p.email }, rateLimitDeps)
        if (emailDecision.kind !== 'allowed') return rateLimitFailure(action, emailDecision, headers)
      }

      const { data: rpcData, error } = await sb.rpc('submit_project_inquiry', {
        p_name: p.name, p_email: p.email, p_phone: p.phone ?? null, p_whatsapp: p.whatsapp ?? null,
        p_company_name: p.company_name ?? null, p_service_id: p.service_id || null,
        p_project_description: p.project_description, p_budget_range: p.budget_range ?? null,
        p_timeline: p.timeline ?? null, p_referral_source: p.referral_source ?? null,
      })

      // Backward-compatible: older RPC returned uuid token string; newer returns jsonb object.
      let token: string | null = null
      let inquiryId: string | null = null
      let conversationId: string | null = null
      if (!error && typeof rpcData === 'string' && z.string().uuid().safeParse(rpcData).success) {
        token = rpcData
      } else if (!error && rpcData && typeof rpcData === 'object') {
        const obj = rpcData as Record<string, unknown>
        if (typeof obj.token === 'string' && z.string().uuid().safeParse(obj.token).success) token = obj.token
        if (typeof obj.inquiry_id === 'string') inquiryId = obj.inquiry_id
        if (typeof obj.conversation_id === 'string') conversationId = obj.conversation_id
      }
      if (error || !token) {
        log('error', 'inquiry_submission_failed', { action })
        return fail('submission_failed', 'We could not save your inquiry. Please try again shortly.', 500, headers)
      }

      // Inquiry is stored successfully at this point. Email delivery is best-effort and must never discard it.
      if (inquiryId && conversationId) {
        safeNotify(sendInquiryNotifications(sb, {
          inquiryId, conversationId, conversationToken: token,
          clientName: p.name, clientEmail: p.email, companyName: p.company_name ?? null,
        }, NOTIFY_CONFIG), 'inquiry_submitted', { action })
      } else {
        log('warn', 'notification_skipped', { event: 'inquiry_submitted', reason: 'missing_ids' })
      }

      log('info', 'inquiry_submitted', { action })
      return out({ ok: true, token }, 200, headers)
    }

    if (action === 'admin_send_reply') {
      const admin = await getAuthedAdmin(req)
      if (!admin) return fail('unauthorized', 'Admin access required.', 401, headers)
      // Load conversation+inquiry context with service role after explicit admin authz.
      const { data: conv, error: cErr } = await sb.from('conversations').select('id,inquiry_id,access_token,status').eq('id', p.conversation_id).maybeSingle()
      if (cErr) return fail('request_failed', 'We could not load this conversation. Please try again.', 500, headers)
      if (!conv) return fail('invalid_request', 'Conversation not found.', 404, headers)
      const { data: inquiry, error: iErr } = await sb.from('inquiries').select('id,email').eq('id', conv.inquiry_id).maybeSingle()
      if (iErr || !inquiry) return fail('request_failed', 'We could not load this inquiry. Please try again.', 500, headers)

      const { data: inserted, error: insErr } = await sb.from('messages').insert({ conversation_id: conv.id, sender_type: 'admin', message: p.message, attachment_path: null }).select('id').single()
      if (insErr || !inserted) return fail('message_failed', 'Your reply could not be sent. Please try again.', 500, headers)

      safeNotify(sendAdminReplyClientNotification(sb, {
        inquiryId: String(inquiry.id), conversationToken: String(conv.access_token), clientEmail: String(inquiry.email), messageId: String(inserted.id),
      }, NOTIFY_CONFIG), 'admin_reply', { action })

      log('info', 'admin_reply_sent', { action })
      return out({ ok: true, id: inserted.id }, 200, headers)
    }


    if (action === 'admin_set_conversation_status') {
      const admin = await getAuthedAdmin(req)
      if (!admin) return fail('unauthorized', 'Admin access required.', 401, headers)
      const { data, error } = await sb.rpc('admin_set_conversation_status', {
        p_conversation_id: p.conversation_id,
        p_status: p.status,
      })
      if (error || !data) return fail('request_failed', 'We could not update this conversation. Please try again.', 500, headers)
      const result = data as Record<string, unknown>
      if (shouldSendStatusNotification(String(result.old_status ?? ''), String(result.new_status ?? ''), p.notify_client === true) && result.conversation_token && result.client_email) {
        safeNotify(sendInquiryStatusClientNotification(sb, {
          inquiryId: String(result.inquiry_id),
          conversationToken: String(result.conversation_token),
          clientEmail: String(result.client_email),
          newStatus: `conversation_${String(result.new_status)}`,
          eventKey: `conversation:${String(result.conversation_id)}:${String(result.new_status)}:${Date.now()}`,
        }, NOTIFY_CONFIG), 'conversation_status_client', { action })
      }
      log('info', 'conversation_status_updated', { action, status_changed: result.status_changed === true })
      return out({ ok: true, status: result.new_status }, 200, headers)
    }

    if (action === 'admin_update_inquiry_status') {
      const admin = await getAuthedAdmin(req)
      if (!admin) return fail('unauthorized', 'Admin access required.', 401, headers)
      const { data, error } = await sb.rpc('admin_update_inquiry', {
        p_inquiry_id: p.inquiry_id,
        p_patch: {
          status: p.status,
          notify_client: p.notify_client ?? false,
          ...(p.priority ? { priority: p.priority } : {}),
          ...(p.admin_notes !== undefined ? { admin_notes: p.admin_notes } : {}),
        },
      })
      if (error || !data) return fail('request_failed', 'We could not update this inquiry. Please try again.', 500, headers)
      const result = data as Record<string, unknown>
      if (shouldSendStatusNotification(String(result.old_status ?? ''), String(result.new_status ?? ''), result.notify_client === true) && result.conversation_token && result.client_email) {
        safeNotify(sendInquiryStatusClientNotification(sb, {
          inquiryId: String(result.id),
          conversationToken: String(result.conversation_token),
          clientEmail: String(result.client_email),
          newStatus: String(result.new_status),
          eventKey: `${String(result.id)}:${String(result.new_status)}:${Date.now()}`,
        }, NOTIFY_CONFIG), 'inquiry_status_client', { action })
      }
      log('info', 'inquiry_status_updated', { action, status_changed: result.status_changed === true })
      return out({ ok: true }, 200, headers)
    }

    // Token-bearing client operations: fail-closed before DB/storage work.
    const tokenDims = { token: p.token, ip: clientIp.ip }
    const tokenDecision = await enforcePolicies(policiesForAction(action), tokenDims, rateLimitDeps)
    if (tokenDecision.kind !== 'allowed') return rateLimitFailure(action, tokenDecision, headers)

    const { data: conv, error: conversationError } = await sb.from('conversations').select('id,inquiry_id,access_token,subject,status').eq('access_token', p.token).maybeSingle()
    if (conversationError) return fail('request_failed', 'We could not load this conversation. Please try again.', 500, headers)
    if (!conv) return fail('invalid_token', 'This conversation link is invalid or expired.', 404, headers)

    if (action === 'client_get') {
      const { data: ms, error: messagesError } = await sb.from('messages').select('id,sender_type,message,created_at,attachment_path').eq('conversation_id', conv.id).order('created_at')
      if (messagesError) return fail('request_failed', 'We could not load this conversation. Please try again.', 500, headers)
      const messages = await Promise.all((ms ?? []).map(async ({ attachment_path, ...m }) => {
        if (!attachment_path) return { ...m, attachment_url: null }
        const { data, error } = await sb.storage.from('attachments').createSignedUrl(attachment_path, 300)
        if (error || !data) throw new Error('Attachment could not be prepared.')
        return { ...m, attachment_url: data.signedUrl }
      }))
      return out({ ok: true, subject: conv.subject, status: conv.status, messages }, 200, headers)
    }

    if (conv.status !== 'open') return fail('conversation_closed', 'This conversation is closed.', 409, headers)

    if (action === 'upload_url') {
      if (!TYPES.includes(p.type) || !isAllowedAttachment(p.filename, p.type, p.size)) return fail('invalid_file', 'Choose a matching PDF, PNG, JPG, TXT, or DOCX file under 5 MB.', 400, headers)
      const path = `${conv.id}/${crypto.randomUUID()}-${p.filename.replace(/[^\w.-]/g, '_').slice(0, 80)}`
      const { data, error } = await sb.storage.from('attachments').createSignedUploadUrl(path)
      return error || !data ? fail('upload_failed', 'We could not prepare the file upload. Please try again.', 500, headers) : out({ ok: true, path, token: data.token }, 200, headers)
    }

    const path = p.attachment_path
    if (path) {
      if (!isConversationAttachmentPath(path, conv.id)) {
        return fail('invalid_file', 'The attached file does not belong to this conversation.', 400, headers)
      }
      const { data: info, error: infoError } = await sb.storage.from('attachments').info(path)
      const contentType = info?.contentType
      const filename = path.split('/')[1].slice(37)
      if (infoError || !info || typeof info.size !== 'number' || !TYPES.includes(contentType ?? '') || !isAllowedAttachment(filename, contentType ?? '', info.size)) {
        const cleaned = await removeAttachment(path)
        return fail(cleaned ? 'invalid_file' : 'attachment_cleanup_failed', cleaned
          ? 'The attached file is missing or is not an allowed type and size.'
          : 'The attached file could not be validated or removed. Please contact support before retrying.', 400, headers)
      }
    }

    let insertedMessageId: string | null = null
    const result = await insertMessageWithAttachmentCleanup(
      async () => {
        const ins = await sb.from('messages').insert({ conversation_id: conv.id, sender_type: 'client', message: p.message, attachment_path: path ?? null }).select('id').single()
        insertedMessageId = ins.data?.id ?? null
        return { error: ins.error }
      },
      () => path ? removeAttachment(path) : Promise.resolve(true),
    )
    if (!result.saved) {
      const cleanupFailed = !!path && !result.cleanupSucceeded
      const message = !path
        ? 'Your reply could not be sent. Please try again.'
        : result.cleanupSucceeded
          ? 'Your reply could not be sent. The uploaded file was removed; please try again.'
          : 'Your reply could not be sent and its uploaded file could not be removed. Please contact support before retrying.'
      return fail(cleanupFailed ? 'attachment_cleanup_failed' : 'message_failed', message, 500, headers)
    }

    // Message is saved. Notify admin asynchronously/best-effort without failing the client request.
    if (conv.inquiry_id && insertedMessageId) {
      safeNotify(sendClientMessageAdminNotification(sb, {
        inquiryId: String(conv.inquiry_id), conversationId: String(conv.id), messageId: String(insertedMessageId),
      }, NOTIFY_CONFIG), 'client_message_admin', { action })
    }

    log('info', 'client_message_sent', { action })
    return out({ ok: true }, 200, headers)
  } catch {
    log('error', 'request_failed', { reason: 'unhandled_exception' })
    return fail('request_failed', 'We could not complete your request. Please try again.', 500, headers)
  }
})
