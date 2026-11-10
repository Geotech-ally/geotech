import { describe, expect, it, vi } from 'vitest'
import {
  backoffSeconds,
  buildAdminReplyClientNotification,
  buildClientMessageAdminNotification,
  buildInquiryAdminNotification,
  buildInquiryClientAcknowledgement,
  canRetry,
  createResendProvider,
  isTransientDeliveryError,
  makeIdempotencyKey,
  nextAttemptAt,
  readNotificationConfigFromEnv,
  redactError,
  shouldSendStatusNotification,
} from '../lib/notificationEmail'

describe('notification idempotency and retry helpers', () => {
  it('creates stable idempotency keys per event/recipient', () => {
    expect(makeIdempotencyKey('inquiry_admin', 'inq-1', 'Admin@Example.com')).toBe('inquiry_admin:inq-1:admin@example.com')
    expect(makeIdempotencyKey('inquiry_admin', 'inq-1', 'admin@example.com')).toBe(makeIdempotencyKey('inquiry_admin', 'inq-1', 'ADMIN@example.com'))
  })

  it('computes backoff and retry eligibility', () => {
    expect(backoffSeconds(1)).toBeGreaterThanOrEqual(30)
    const now = new Date('2026-01-01T00:00:00.000Z')
    expect(new Date(nextAttemptAt(now, 1)).getTime()).toBeGreaterThan(now.getTime())
    expect(canRetry('failed', 1, 5)).toBe(true)
    expect(canRetry('failed', 5, 5)).toBe(false)
    expect(canRetry('sent', 1, 5)).toBe(false)
  })

  it('detects transient delivery failures', () => {
    expect(isTransientDeliveryError(429)).toBe(true)
    expect(isTransientDeliveryError(503)).toBe(true)
    expect(isTransientDeliveryError(400)).toBe(false)
    expect(isTransientDeliveryError(null, new Error('network timeout'))).toBe(true)
  })

  it('status notifications are optional and only for actual changes', () => {
    expect(shouldSendStatusNotification('new', 'reviewing', true)).toBe(true)
    expect(shouldSendStatusNotification('new', 'new', true)).toBe(false)
    expect(shouldSendStatusNotification('new', 'reviewing', false)).toBe(false)
  })

  it('redacts sensitive values from provider errors', () => {
    expect(redactError('Bearer sk_live_secret user@example.com')).toBe('Bearer [redacted] [redacted-email]')
  })
})

describe('email templates', () => {
  it('builds inquiry admin notification without private message content', () => {
    const msg = buildInquiryAdminNotification({ inquiryId: 'abcd1234-1111', clientName: 'Ada Lovelace', clientEmail: 'ada@example.com', companyName: 'Analytical', adminLink: 'https://site.test/admin' })
    expect(msg.subject).toContain('ABCD1234')
    expect(msg.html).toContain('Ada Lovelace')
    expect(msg.html).toContain('https://site.test/admin')
    expect(msg.text).toContain('Private message content')
    expect(msg.html).not.toContain('project description body')
  })

  it('builds client acknowledgement with secure conversation link', () => {
    const msg = buildInquiryClientAcknowledgement({ inquiryId: 'abcd1234-1111', clientName: 'Ada', conversationLink: 'https://site.test/c/token-1' })
    expect(msg.html).toContain('https://site.test/c/token-1')
    expect(msg.subject).toContain('received')
  })

  it('builds client-message and admin-reply notifications without message body', () => {
    const adminMsg = buildClientMessageAdminNotification({ inquiryId: 'abcd1234', conversationId: 'conv-1', adminLink: 'https://site.test/admin' })
    expect(adminMsg.html).toContain('not included')
    expect(adminMsg.html).not.toContain('SECRET_MESSAGE')
    const reply = buildAdminReplyClientNotification({ inquiryId: 'abcd1234', conversationLink: 'https://site.test/c/tok' })
    expect(reply.html).toContain('does not include private message content')
  })
})

describe('Resend provider', () => {
  it('sends successfully and returns provider id', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'email_123' }) })
    const provider = createResendProvider(fetchFn as any)
    const res = await provider.send({ recipient: 'a@b.com', subject: 'Hi', html: '<p>x</p>', text: 'x' }, { providerApiKey: 'key', fromAddress: 'Nexyvon <noreply@example.com>' })
    expect(res).toEqual({ ok: true, provider: 'resend', id: 'email_123' })
    expect(fetchFn).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({ method: 'POST' }))
  })

  it('reports transient provider failures for retry handling', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ message: 'temporary' }) })
    const provider = createResendProvider(fetchFn as any)
    const res = await provider.send({ recipient: 'a@b.com', subject: 'Hi', html: '<p>x</p>', text: 'x' }, { providerApiKey: 'key', fromAddress: 'from@example.com' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.transient).toBe(true)
  })

  it('fails closed when provider config is missing', async () => {
    const provider = createResendProvider(vi.fn() as any)
    const res = await provider.send({ recipient: 'a@b.com', subject: 'Hi', html: '<p>x</p>', text: 'x' }, {})
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.transient).toBe(false)
  })

  it('reads notification config from env', () => {
    expect(readNotificationConfigFromEnv({ RESEND_API_KEY: 'k', EMAIL_FROM: 'f', ADMIN_NOTIFICATION_EMAIL: 'a', PUBLIC_SITE_URL: 'https://x.test' })).toMatchObject({ providerApiKey: 'k', fromAddress: 'f', adminAddress: 'a', productionDomain: 'https://x.test' })
  })
})
