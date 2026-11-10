import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  buildAdminInquiryLink,
  buildAdminReplyClientNotification,
  buildClientLink,
  buildClientMessageAdminNotification,
  buildInquiryAdminNotification,
  buildInquiryClientAcknowledgement,
  buildInquiryStatusClientNotification,
  canRetry,
  createResendProvider,
  isValidEmail,
  makeIdempotencyKey,
  nextAttemptAt,
  normalizeEmail,
  readNotificationConfigFromEnv,
  redactError,
  type NotificationConfig,
  type NotificationEventType,
  type NotificationRequest,
} from './notifications.ts'

export type { NotificationConfig, NotificationEventType, NotificationRequest }
export { readNotificationConfigFromEnv }

type Db = SupabaseClient

type EnqueueInput = {
  eventType: NotificationEventType
  eventKey: string
  recipient: string
  recipientRole: 'admin' | 'client'
  subject: string
  html: string
  text: string
  payload?: Record<string, unknown>
  maxAttempts: number
}

export function getNotificationConfig() {
  return readNotificationConfigFromEnv({
    RESEND_API_KEY: Deno.env.get('RESEND_API_KEY') ?? Deno.env.get('EMAIL_PROVIDER_API_KEY') ?? undefined,
    EMAIL_FROM: Deno.env.get('EMAIL_FROM') ?? undefined,
    ADMIN_NOTIFICATION_EMAIL: Deno.env.get('ADMIN_NOTIFICATION_EMAIL') ?? undefined,
    PUBLIC_SITE_URL: Deno.env.get('PUBLIC_SITE_URL') ?? Deno.env.get('SITE_URL') ?? undefined,
    ADMIN_DASHBOARD_PATH: Deno.env.get('ADMIN_DASHBOARD_PATH') ?? undefined,
    NOTIFICATION_MAX_ATTEMPTS: Deno.env.get('NOTIFICATION_MAX_ATTEMPTS') ?? undefined,
  })
}

export async function enqueueNotification(db: Db, input: EnqueueInput) {
  const recipient = normalizeEmail(input.recipient)
  const idempotencyKey = makeIdempotencyKey(input.eventType, input.eventKey, recipient)
  const row = {
    event_type: input.eventType,
    event_key: input.eventKey,
    recipient,
    recipient_role: input.recipientRole,
    subject: input.subject,
    status: 'pending',
    attempt_count: 0,
    max_attempts: input.maxAttempts,
    next_attempt_at: new Date().toISOString(),
    payload: { ...(input.payload ?? {}), html: input.html, text: input.text },
    idempotency_key: idempotencyKey,
    updated_at: new Date().toISOString(),
  }
  // Idempotent: duplicates are ignored and existing record is reused.
  const { data, error } = await db
    .from('notification_deliveries')
    .upsert(row, { onConflict: 'idempotency_key', ignoreDuplicates: true })
    .select('id,status,attempt_count,max_attempts,next_attempt_at,recipient,event_type,event_key')
    .maybeSingle()
  if (error) return { ok: false as const, error }
  if (data) return { ok: true as const, id: data.id as string, duplicate: false }
  const existing = await db.from('notification_deliveries').select('id,status,attempt_count,max_attempts,next_attempt_at').eq('idempotency_key', idempotencyKey).maybeSingle()
  if (existing.error || !existing.data) return { ok: false as const, error: existing.error ?? new Error('Notification record unavailable') }
  return { ok: true as const, id: existing.data.id as string, duplicate: true }
}

export async function attemptDelivery(db: Db, deliveryId: string, request: NotificationRequest, config: NotificationConfig) {
  const provider = createResendProvider(fetch)
  const now = new Date()
  const current = await db.from('notification_deliveries').select('*').eq('id', deliveryId).single()
  if (current.error || !current.data) return { delivered: false, skipped: true, reason: 'missing' as const }
  const rec = current.data as any
  if (rec.status === 'sent') return { delivered: true, skipped: true, reason: 'already_sent' as const }
  if (!canRetry(rec.status, rec.attempt_count, rec.max_attempts)) return { delivered: false, skipped: true, reason: 'exhausted' as const }
  if (rec.next_attempt_at && new Date(rec.next_attempt_at).getTime() > now.getTime() + 1000 && rec.status === 'failed') {
    return { delivered: false, skipped: true, reason: 'not_due' as const }
  }

  await db.from('notification_deliveries').update({ status: 'processing', updated_at: now.toISOString() }).eq('id', deliveryId).in('status', ['pending', 'failed', 'processing'])

  if (!config.providerApiKey || !config.fromAddress) {
    const attemptCount = Number(rec.attempt_count ?? 0) + 1
    const exhausted = attemptCount >= Number(rec.max_attempts ?? 5)
    await db.from('notification_deliveries').update({
      status: exhausted ? 'failed' : 'failed',
      attempt_count: attemptCount,
      last_error: 'Email provider is not configured.',
      next_attempt_at: exhausted ? rec.next_attempt_at : nextAttemptAt(now, attemptCount),
      failed_at: exhausted ? now.toISOString() : rec.failed_at,
      updated_at: now.toISOString(),
    }).eq('id', deliveryId)
    return { delivered: false, skipped: false, reason: 'not_configured' as const }
  }
  if (!isValidEmail(request.recipient)) {
    await db.from('notification_deliveries').update({
      status: 'skipped',
      last_error: 'Recipient email is invalid.',
      updated_at: now.toISOString(),
      failed_at: now.toISOString(),
      attempt_count: Number(rec.attempt_count ?? 0) + 1,
    }).eq('id', deliveryId)
    return { delivered: false, skipped: true, reason: 'invalid_recipient' as const }
  }

  const result = await provider.send({ recipient: request.recipient, subject: request.subject, html: request.html, text: request.text }, config)
  const attemptCount = Number(rec.attempt_count ?? 0) + 1
  if (result.ok) {
    await db.from('notification_deliveries').update({
      status: 'sent',
      attempt_count: attemptCount,
      provider: result.provider,
      provider_message_id: result.id,
      last_error: null,
      sent_at: now.toISOString(),
      updated_at: now.toISOString(),
      next_attempt_at: now.toISOString(),
    }).eq('id', deliveryId)
    return { delivered: true, skipped: false, reason: 'sent' as const }
  }

  const exhausted = !result.transient || attemptCount >= Number(rec.max_attempts ?? 5)
  await db.from('notification_deliveries').update({
    status: exhausted ? 'failed' : 'pending',
    attempt_count: attemptCount,
    provider: result.provider,
    last_error: redactError(result.error),
    next_attempt_at: exhausted ? rec.next_attempt_at : nextAttemptAt(now, attemptCount),
    failed_at: exhausted ? now.toISOString() : rec.failed_at,
    updated_at: now.toISOString(),
  }).eq('id', deliveryId)
  return { delivered: false, skipped: false, reason: exhausted ? 'failed' as const : 'retry_scheduled' as const }
}

export async function sendNotification(db: Db, req: NotificationRequest, config: NotificationConfig) {
  const enq = await enqueueNotification(db, {
    eventType: req.eventType,
    eventKey: req.eventKey,
    recipient: req.recipient,
    recipientRole: req.recipientRole,
    subject: req.subject,
    html: req.html,
    text: req.text,
    payload: req.payload,
    maxAttempts: config.maxAttempts ?? 5,
  })
  if (!enq.ok) return { ok: false as const, error: enq.error }
  const result = await attemptDelivery(db, enq.id, req, config)
  return { ok: true as const, id: enq.id, duplicate: enq.duplicate, ...result }
}

export async function sendInquiryNotifications(db: Db, input: { inquiryId: string; conversationId: string; conversationToken: string; clientName: string; clientEmail: string; companyName?: string | null }, config: NotificationConfig) {
  const domain = config.productionDomain
  const adminLinkBase = buildAdminInquiryLink(domain)
  const adminLink = adminLinkBase // dashboard path included by PUBLIC_SITE_URL+ADMIN_DASHBOARD_PATH convention in links; keep base admin URL
  const clientLink = buildClientLink(domain, input.conversationToken)
  const results: Record<string, unknown> = {}

  if (config.adminAddress && isValidEmail(config.adminAddress)) {
    const tpl = buildInquiryAdminNotification({ inquiryId: input.inquiryId, clientName: input.clientName, clientEmail: input.clientEmail, companyName: input.companyName, adminLink })
    results.admin = await sendNotification(db, {
      eventType: 'inquiry_admin', eventKey: input.inquiryId, recipient: config.adminAddress, recipientRole: 'admin',
      subject: tpl.subject, html: tpl.html, text: tpl.text,
      payload: { inquiryId: input.inquiryId, conversationId: input.conversationId },
    }, config)
  } else {
    results.admin = { ok: false, reason: 'admin_not_configured' }
  }

  if (isValidEmail(input.clientEmail)) {
    const tpl = buildInquiryClientAcknowledgement({ inquiryId: input.inquiryId, clientName: input.clientName, conversationLink: clientLink })
    results.client = await sendNotification(db, {
      eventType: 'inquiry_client_ack', eventKey: input.inquiryId, recipient: input.clientEmail, recipientRole: 'client',
      subject: tpl.subject, html: tpl.html, text: tpl.text,
      payload: { inquiryId: input.inquiryId, conversationId: input.conversationId },
    }, config)
  } else {
    results.client = { ok: false, reason: 'invalid_client_email' }
  }
  return results
}

export async function sendClientMessageAdminNotification(db: Db, input: { inquiryId: string; conversationId: string; messageId: string }, config: NotificationConfig) {
  if (!config.adminAddress || !isValidEmail(config.adminAddress)) return { ok: false as const, reason: 'admin_not_configured' }
  const adminLink = (config.productionDomain || '').replace(/\/$/, '') + (config.dashboardPath || '/admin')
  const tpl = buildClientMessageAdminNotification({ inquiryId: input.inquiryId, conversationId: input.conversationId, adminLink })
  return sendNotification(db, {
    eventType: 'client_message_admin', eventKey: input.messageId || input.conversationId, recipient: config.adminAddress, recipientRole: 'admin',
    subject: tpl.subject, html: tpl.html, text: tpl.text,
    payload: { inquiryId: input.inquiryId, conversationId: input.conversationId, messageId: input.messageId },
  }, config)
}

export async function sendAdminReplyClientNotification(db: Db, input: { inquiryId: string; conversationToken: string; clientEmail: string; messageId: string }, config: NotificationConfig) {
  if (!isValidEmail(input.clientEmail)) return { ok: false as const, reason: 'invalid_client_email' }
  const link = buildClientLink(config.productionDomain, input.conversationToken)
  const tpl = buildAdminReplyClientNotification({ inquiryId: input.inquiryId, conversationLink: link })
  return sendNotification(db, {
    eventType: 'admin_reply_client', eventKey: input.messageId, recipient: input.clientEmail, recipientRole: 'client',
    subject: tpl.subject, html: tpl.html, text: tpl.text,
    payload: { inquiryId: input.inquiryId, messageId: input.messageId },
  }, config)
}

export async function sendInquiryStatusClientNotification(db: Db, input: { inquiryId: string; conversationToken: string; clientEmail: string; newStatus: string; eventKey: string }, config: NotificationConfig) {
  if (!isValidEmail(input.clientEmail)) return { ok: false as const, reason: 'invalid_client_email' }
  const link = buildClientLink(config.productionDomain, input.conversationToken)
  const tpl = buildInquiryStatusClientNotification({ inquiryId: input.inquiryId, newStatus: input.newStatus, conversationLink: link })
  return sendNotification(db, {
    eventType: 'inquiry_status_client', eventKey: input.eventKey, recipient: input.clientEmail, recipientRole: 'client',
    subject: tpl.subject, html: tpl.html, text: tpl.text,
    payload: { inquiryId: input.inquiryId, newStatus: input.newStatus },
  }, config)
}

export async function processPendingNotifications(db: Db, config: NotificationConfig, limit = 10) {
  const nowIso = new Date().toISOString()
  const { data, error } = await db
    .from('notification_deliveries')
    .select('*')
    .in('status', ['pending', 'failed'])
    .lte('next_attempt_at', nowIso)
    .order('next_attempt_at', { ascending: true })
    .limit(limit)
  if (error || !data) return { ok: false as const, error }
  let processed = 0
  for (const row of data as any[]) {
    const req: NotificationRequest = {
      eventType: row.event_type,
      eventKey: row.event_key,
      recipient: row.recipient,
      recipientRole: row.recipient_role,
      subject: row.subject ?? '',
      html: (row.payload?.html as string) || '',
      text: (row.payload?.text as string) || '',
      payload: row.payload ?? {},
    }
    // For retries we need content; persist minimal render inputs not necessary, so rebuild from payload hints is limited.
    // Instead skip if no subject/payload hints; real sends happen at enqueue time with full content. Retries here only for rows
    // enqueued as pending but not attempted due to transient enqueue-time issue when html/text stored in payload.
    if (!req.subject) continue
    if (!req.html || !req.text) {
      // cannot safely resend without stored content; mark failed terminal if exhausted-like state to avoid infinite loop
      await db.from('notification_deliveries').update({ status: 'failed', last_error: 'Missing template content for retry.', updated_at: nowIso, failed_at: nowIso }).eq('id', row.id)
      continue
    }
    await attemptDelivery(db, row.id, req, config)
    processed++
  }
  return { ok: true as const, processed }
}
