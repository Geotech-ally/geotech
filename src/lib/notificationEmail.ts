import {
  backoffSeconds,
  buildAdminInquiryLink,
  buildAdminReplyClientNotification,
  buildClientLink,
  buildClientMessageAdminNotification,
  buildInquiryAdminNotification,
  buildInquiryClientAcknowledgement,
  buildInquiryStatusClientNotification,
  canRetry,
  humanStatus,
  isTransientDeliveryError,
  isValidEmail,
  makeIdempotencyKey,
  nextAttemptAt,
  normalizeEmail,
  shortRef,
  shouldSendStatusNotification,
  type DeliveryRecord,
  type NotificationConfig,
  type NotificationEventType,
  type NotificationRequest,
  type NotificationStatus,
} from './notifications'

export {
  backoffSeconds,
  buildAdminInquiryLink,
  buildAdminReplyClientNotification,
  buildClientLink,
  buildClientMessageAdminNotification,
  buildInquiryAdminNotification,
  buildInquiryClientAcknowledgement,
  buildInquiryStatusClientNotification,
  canRetry,
  humanStatus,
  isTransientDeliveryError,
  isValidEmail,
  makeIdempotencyKey,
  nextAttemptAt,
  normalizeEmail,
  shortRef,
  shouldSendStatusNotification,
}
export type { DeliveryRecord, NotificationConfig, NotificationEventType, NotificationRequest, NotificationStatus }

export type ProviderSendResult = { ok: true; provider: string; id: string | null } | { ok: false; provider: string; status: number | null; transient: boolean; error: string }

export type EmailProvider = {
  name: string
  send: (req: Pick<NotificationRequest, 'recipient' | 'subject' | 'html' | 'text'>, config: NotificationConfig) => Promise<ProviderSendResult>
}

export function createResendProvider(fetchFn: typeof fetch = fetch): EmailProvider {
  return {
    name: 'resend',
    async send(req, config) {
      if (!config.providerApiKey || !config.fromAddress) {
        return { ok: false, provider: 'resend', status: null, transient: false, error: 'Email provider is not configured.' }
      }
      try {
        const res = await fetchFn('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.providerApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: config.fromAddress,
            to: [req.recipient],
            subject: req.subject,
            html: req.html,
            text: req.text,
          }),
        })
        const body = await res.json().catch(() => ({})) as { id?: string; message?: string; name?: string }
        if (!res.ok) {
          const transient = isTransientDeliveryError(res.status)
          return { ok: false, provider: 'resend', status: res.status, transient, error: typeof body?.message === 'string' ? body.message : `Provider returned ${res.status}` }
        }
        return { ok: true, provider: 'resend', id: typeof body?.id === 'string' ? body.id : null }
      } catch (err) {
        return { ok: false, provider: 'resend', status: null, transient: isTransientDeliveryError(null, err), error: err instanceof Error ? err.message : 'Network error' }
      }
    },
  }
}

export function readNotificationConfigFromEnv(env: Record<string, string | undefined>): NotificationConfig {
  const max = Number(env.NOTIFICATION_MAX_ATTEMPTS ?? '5')
  return {
    providerApiKey: env.RESEND_API_KEY || env.EMAIL_PROVIDER_API_KEY || undefined,
    fromAddress: env.EMAIL_FROM || undefined,
    adminAddress: env.ADMIN_NOTIFICATION_EMAIL || undefined,
    productionDomain: env.PUBLIC_SITE_URL || env.SITE_URL || undefined,
    dashboardPath: env.ADMIN_DASHBOARD_PATH || '/admin',
    maxAttempts: Number.isFinite(max) && max > 0 ? Math.min(Math.floor(max), 10) : 5,
  }
}

export function redactError(err: string | null | undefined) {
  if (!err) return null
  // Avoid storing secrets/tokens/PII in error text.
  return err.replace(/Bearer\s+[A-Za-z0-9._\-]+/g, 'Bearer [redacted]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]').slice(0, 500)
}

export function deliveryRecordFromRow(row: any): DeliveryRecord {
  return {
    status: row.status as NotificationStatus,
    attemptCount: Number(row.attempt_count ?? 0),
    maxAttempts: Number(row.max_attempts ?? 5),
    nextAttemptAt: String(row.next_attempt_at ?? new Date().toISOString()),
    lastError: row.last_error ?? null,
    provider: row.provider ?? null,
    providerMessageId: row.provider_message_id ?? null,
    sentAt: row.sent_at ?? null,
    failedAt: row.failed_at ?? null,
  }
}
