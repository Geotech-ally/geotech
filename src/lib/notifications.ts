export type NotificationEventType =
  | 'inquiry_admin'
  | 'inquiry_client_ack'
  | 'client_message_admin'
  | 'admin_reply_client'
  | 'inquiry_status_client'
  | 'conversation_status_client'

export type NotificationStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'skipped'

export type NotificationConfig = {
  providerApiKey?: string
  fromAddress?: string
  adminAddress?: string
  productionDomain?: string
  dashboardPath?: string
  maxAttempts?: number
}

export type NotificationRequest = {
  eventType: NotificationEventType
  eventKey: string
  recipient: string
  recipientRole: 'admin' | 'client'
  subject: string
  html: string
  text: string
  payload?: Record<string, unknown>
}

export type DeliveryRecord = {
  status: NotificationStatus
  attemptCount: number
  maxAttempts: number
  nextAttemptAt: string
  lastError?: string | null
  provider?: string | null
  providerMessageId?: string | null
  sentAt?: string | null
  failedAt?: string | null
}

export function isValidEmail(value: string | null | undefined) {
  return typeof value === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim()) && value.trim().length <= 254
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

export function makeIdempotencyKey(eventType: NotificationEventType, eventKey: string, recipient: string) {
  return `${eventType}:${eventKey}:${normalizeEmail(recipient)}`
}

export function backoffSeconds(attempt: number) {
  // attempt starts at 1 for first retry scheduling; cap to avoid runaway delays.
  const base = Math.min(3600, 30 * Math.pow(2, Math.max(0, attempt - 1)))
  const jitter = Math.floor(base * 0.1)
  return base + jitter
}

export function nextAttemptAt(now: Date, attempt: number) {
  return new Date(now.getTime() + backoffSeconds(attempt) * 1000).toISOString()
}

export function canRetry(status: NotificationStatus, attemptCount: number, maxAttempts: number) {
  return (status === 'pending' || status === 'processing' || status === 'failed') && attemptCount < maxAttempts
}

export function isTransientDeliveryError(status: number | null, err?: unknown) {
  if (status === 429) return true
  if (status !== null && status >= 500) return true
  if (status === 408) return true
  if (err instanceof Error) return /timeout|network|fetch|temporar|econn|socket/i.test(err.message)
  return status === null
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function layout(title: string, bodyHtml: string, footerNote: string) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#17202a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
        <tr><td style="background:#0f3d3e;color:#ffffff;padding:18px 24px;font-size:18px;font-weight:700;">Nexyvon Technologies</td></tr>
        <tr><td style="padding:24px;">
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#111827;">${escapeHtml(title)}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 24px;background:#f9fafb;color:#6b7280;font-size:12px;line-height:1.5;">${escapeHtml(footerNote)}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function button(url: string, label: string) {
  const safeUrl = escapeHtml(url)
  return `<p style="margin:20px 0;"><a href="${safeUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;">${escapeHtml(label)}</a></p>`
}

function p(text: string) {
  return `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">${escapeHtml(text)}</p>`
}

function kv(label: string, value: string) {
  return `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;vertical-align:top;width:140px;">${escapeHtml(label)}</td><td style="padding:6px 0;color:#111827;font-size:14px;vertical-align:top;">${escapeHtml(value)}</td></tr>`
}

export function buildClientLink(domain: string | undefined, token: string) {
  const base = (domain || '').replace(/\/$/, '')
  return base ? `${base}/c/${token}` : `/c/${token}`
}

export function buildAdminInquiryLink(domain: string | undefined) {
  const base = (domain || '').replace(/\/$/, '')
  return base ? `${base}/admin` : '/admin'
}

export function buildInquiryAdminNotification(input: {
  inquiryId: string
  clientName: string
  clientEmail: string
  companyName?: string | null
  adminLink: string
}): Pick<NotificationRequest, 'subject' | 'html' | 'text'> {
  const subject = `New inquiry received (${shortRef(input.inquiryId)})`
  const body = `${p('A new project inquiry was submitted and stored successfully.')}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;width:100%;">
${kv('Reference', shortRef(input.inquiryId))}
${kv('Client', input.clientName)}
${kv('Email', input.clientEmail)}
${input.companyName ? kv('Company', input.companyName) : ''}
</table>
${p('Private message content is not included in this notification.')}
${button(input.adminLink, 'Open admin dashboard')}`
  return {
    subject,
    html: layout('New inquiry received', body, 'This is an automated notification from Nexyvon Technologies.'),
    text: `${subject}\nReference: ${shortRef(input.inquiryId)}\nClient: ${input.clientName}\nEmail: ${input.clientEmail}\nDashboard: ${input.adminLink}\nPrivate message content is not included.`,
  }
}

export function buildInquiryClientAcknowledgement(input: {
  inquiryId: string
  clientName: string
  conversationLink: string
}): Pick<NotificationRequest, 'subject' | 'html' | 'text'> {
  const subject = `We received your inquiry (${shortRef(input.inquiryId)})`
  const body = `${p(`Hello ${input.clientName},`)}
${p('Thank you for contacting Nexyvon Technologies. Your inquiry has been received successfully.')}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;width:100%;">${kv('Reference', shortRef(input.inquiryId))}</table>
${p('Use your private conversation link to view updates or send additional information.')}
${button(input.conversationLink, 'Open your conversation')}`
  return {
    subject,
    html: layout('Inquiry received', body, 'If you did not submit this inquiry, you can ignore this email.'),
    text: `${subject}\nHello ${input.clientName},\nReference: ${shortRef(input.inquiryId)}\nConversation: ${input.conversationLink}`,
  }
}

export function buildClientMessageAdminNotification(input: {
  inquiryId: string
  conversationId: string
  adminLink: string
}): Pick<NotificationRequest, 'subject' | 'html' | 'text'> {
  const subject = `New client message (${shortRef(input.inquiryId)})`
  const body = `${p('A client sent a new message in an existing conversation.')}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;width:100%;">
${kv('Inquiry reference', shortRef(input.inquiryId))}
${kv('Conversation', shortRef(input.conversationId))}
</table>
${p('Message content is not included in this notification. Please review it in the secure admin dashboard.')}
${button(input.adminLink, 'Review in dashboard')}`
  return {
    subject,
    html: layout('New client message', body, 'Automated notification. Message contents are intentionally omitted.'),
    text: `${subject}\nInquiry: ${shortRef(input.inquiryId)}\nDashboard: ${input.adminLink}\nMessage content omitted.`,
  }
}

export function buildAdminReplyClientNotification(input: {
  inquiryId: string
  conversationLink: string
}): Pick<NotificationRequest, 'subject' | 'html' | 'text'> {
  const subject = `New reply from Nexyvon Technologies (${shortRef(input.inquiryId)})`
  const body = `${p('You have a new reply regarding your inquiry.')}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;width:100%;">${kv('Reference', shortRef(input.inquiryId))}</table>
${p('Reply details are available in your secure conversation page.')}
${button(input.conversationLink, 'View reply')}`
  return {
    subject,
    html: layout('New reply available', body, 'This notification does not include private message content.'),
    text: `${subject}\nReference: ${shortRef(input.inquiryId)}\nConversation: ${input.conversationLink}`,
  }
}

export function buildInquiryStatusClientNotification(input: {
  inquiryId: string
  newStatus: string
  conversationLink: string
}): Pick<NotificationRequest, 'subject' | 'html' | 'text'> {
  const label = humanStatus(input.newStatus)
  const subject = `Inquiry status update (${shortRef(input.inquiryId)})`
  const body = `${p('The status of your inquiry has been updated.')}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;width:100%;">
${kv('Reference', shortRef(input.inquiryId))}
${kv('New status', label)}
</table>
${button(input.conversationLink, 'Open conversation')}`
  return {
    subject,
    html: layout('Inquiry status update', body, 'Automated notification from Nexyvon Technologies.'),
    text: `${subject}\nReference: ${shortRef(input.inquiryId)}\nNew status: ${label}\nConversation: ${input.conversationLink}`,
  }
}

export function shortRef(id: string) {
  return id ? id.slice(0, 8).toUpperCase() : 'UNKNOWN'
}

export function humanStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function shouldSendStatusNotification(oldStatus: string | null | undefined, newStatus: string | null | undefined, explicitlyRequested: boolean) {
  if (!explicitlyRequested) return false
  if (!newStatus) return false
  return oldStatus !== newStatus
}
