export type RateLimitCategory = 'public_inquiry' | 'client_message' | 'client_upload' | 'client_read'

export type RateLimitPolicy = {
  action: string
  category: RateLimitCategory
  max: number
  windowSeconds: number
  failClosed: boolean
  keyDimensions: Array<'ip' | 'email' | 'token'>
}

export type RateLimitDecision =
  | { kind: 'allowed' }
  | { kind: 'blocked'; status: 429; retryAfter: number }
  | { kind: 'unavailable'; status: 503 }

export type RedisPipelineResult = Array<{ result?: unknown; error?: string }>

export type RateLimitDeps = {
  redisUrl?: string
  redisToken?: string
  fetchFn?: typeof fetch
  now?: () => number
  log?: (entry: Record<string, unknown>) => void
}

export type TrustedClientIpConfig = {
  /**
   * Explicit opt-in. When false/undefined, forwarding headers are NOT trusted and a safe fallback identity is used.
   * Enable only when a trusted gateway/proxy in front of the edge function sanitizes/overwrites the chosen header.
   */
  trustForwardedHeaders?: boolean
  /** Header to read when trustForwardedHeaders is true. Default: x-forwarded-for */
  trustedHeaderName?: string
  /**
   * Optional shared secret gate: if set, the named request header must exactly match expectedSecret for forwarded headers
   * to be trusted. Use only when a trusted gateway can inject an unguessable secret header.
   */
  trustedGatewaySecretHeader?: string
  expectedGatewaySecret?: string
}

export type ClientIpResult = {
  ip: string
  source: 'trusted_header' | 'fallback'
  trusted: boolean
}

export type CorsConfig = {
  /** Comma-separated exact origins, e.g. https://app.example.com,https://staging.example.com */
  allowedOrigins?: string
  /** When true, localhost/127.0.0.1/[::1] http origins are accepted (development only). */
  allowLocalhostDev?: boolean
  /** 'production' disallows localhost even if allowLocalhostDev is misconfigured. */
  environment?: string
  allowedMethods?: string[]
  allowedHeaders?: string[]
  /** 'deny' = 403 for disallowed browser origins; 'omit' = no permissive CORS headers (browser blocks). */
  disallowedOriginMode?: 'deny' | 'omit'
  allowNullOrigin?: boolean
}

export type CorsDecision = {
  origin: string | null
  allowed: boolean
  browserRequest: boolean
  headers: Record<string, string>
  denyStatus?: number
}

const DEFAULT_POLICIES: RateLimitPolicy[] = [
  { action: 'submit_inquiry', category: 'public_inquiry', max: 3, windowSeconds: 3600, failClosed: true, keyDimensions: ['ip'] },
  { action: 'submit_inquiry_email', category: 'public_inquiry', max: 3, windowSeconds: 86400, failClosed: true, keyDimensions: ['email'] },
  { action: 'client_send', category: 'client_message', max: 20, windowSeconds: 600, failClosed: true, keyDimensions: ['token', 'ip'] },
  { action: 'upload_url', category: 'client_upload', max: 10, windowSeconds: 600, failClosed: true, keyDimensions: ['token'] },
  { action: 'client_get', category: 'client_read', max: 120, windowSeconds: 600, failClosed: true, keyDimensions: ['token'] },
]

export function getRateLimitPolicies() {
  return DEFAULT_POLICIES.map((p) => ({ ...p, keyDimensions: [...p.keyDimensions] }))
}

export function policiesForAction(action: string) {
  return DEFAULT_POLICIES.filter((p) => p.action === action)
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function fingerprint(value: string) {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest).slice(0, 32)
}

function stripIpNoise(value: string) {
  let v = value.trim()
  if (v.startsWith('[')) {
    const end = v.indexOf(']')
    if (end > 0) v = v.slice(1, end)
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(v)) {
    v = v.replace(/:\d+$/, '')
  }
  const mapped = v.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)
  if (mapped) v = mapped[1]
  return v
}

export function isValidIp(value: string) {
  const v = stripIpNoise(value)
  if (!v) return false
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(v)) {
    return v.split('.').every((part) => {
      if (!/^\d{1,3}$/.test(part)) return false
      const n = Number(part)
      return n >= 0 && n <= 255 && String(n) === String(Number(part))
    })
  }
  if (!/^[a-fA-F0-9:]+$/.test(v)) return false
  if (v.includes(':::')) return false
  const parts = v.split('::')
  if (parts.length > 2) return false
  const groups = v.split(':').filter((g) => g.length > 0)
  if (groups.some((g) => g.length > 4)) return false
  if (parts.length === 2) return groups.length <= 7
  return groups.length === 8
}

export function normalizeIpCandidate(raw: string | null | undefined): string | null {
  if (!isNonEmptyString(raw)) return null
  if (/[\r\n]/.test(raw)) return null
  const first = raw.includes(',') ? raw.split(',')[0].trim() : raw
  const v = stripIpNoise(first)
  return isValidIp(v) ? v.slice(0, 64).toLowerCase() : null
}

export function extractTrustedClientIp(headers: Headers, config: TrustedClientIpConfig = {}): ClientIpResult {
  const fallback: ClientIpResult = { ip: 'unverified', source: 'fallback', trusted: false }
  if (!config.trustForwardedHeaders) return fallback

  if (config.trustedGatewaySecretHeader && config.expectedGatewaySecret) {
    const presented = headers.get(config.trustedGatewaySecretHeader)
    if (presented !== config.expectedGatewaySecret) return fallback
  }

  const headerName = (config.trustedHeaderName || 'x-forwarded-for').toLowerCase()
  const raw = headers.get(headerName)
  if (!isNonEmptyString(raw)) return fallback

  const candidates = headerName === 'x-forwarded-for' ? raw.split(',') : [raw]
  for (const candidate of candidates) {
    const ip = normalizeIpCandidate(candidate)
    if (ip) return { ip, source: 'trusted_header', trusted: true }
  }
  return fallback
}

/** @deprecated Use extractTrustedClientIp. Kept for compatibility; does not trust headers. */
export function normalizeIp(raw: string | null | undefined) {
  return normalizeIpCandidate(raw) ?? 'unknown'
}

export function readTrustedClientIpConfigFromEnv(env: Record<string, string | undefined>): TrustedClientIpConfig {
  const trust = env.TRUST_CLIENT_IP_HEADERS === 'true'
  return {
    trustForwardedHeaders: trust,
    trustedHeaderName: env.TRUSTED_CLIENT_IP_HEADER || 'x-forwarded-for',
    trustedGatewaySecretHeader: env.TRUSTED_PROXY_SECRET_HEADER || undefined,
    expectedGatewaySecret: env.TRUSTED_PROXY_SECRET || undefined,
  }
}

function normalizeOrigin(origin: string) {
  try {
    const u = new URL(origin)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.origin
  } catch {
    return null
  }
}

function isLocalhostOrigin(origin: string) {
  try {
    const u = new URL(origin)
    if (u.protocol !== 'http:') return false
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]' || u.hostname === '::1'
  } catch {
    return false
  }
}

export function resolveCorsDecision(origin: string | null, config: CorsConfig = {}): CorsDecision {
  const allowedMethods = (config.allowedMethods?.length ? config.allowedMethods : ['POST', 'OPTIONS']).join(', ')
  const allowedHeaders = (config.allowedHeaders?.length
    ? config.allowedHeaders
    : ['authorization', 'x-client-info', 'apikey', 'content-type']
  ).join(', ')
  const baseVary = { Vary: 'Origin' }
  const browserRequest = isNonEmptyString(origin)
  const disallowedMode = config.disallowedOriginMode ?? 'deny'
  const production = (config.environment || '').toLowerCase() === 'production'

  if (!browserRequest) {
    // Non-browser/server requests typically have no Origin. Endpoint access is still controlled by request
    // validation, rate limiting, and capability tokens. No CORS permission is granted.
    return { origin: null, allowed: true, browserRequest: false, headers: { ...baseVary } }
  }

  if (origin === 'null') {
    if (config.allowNullOrigin) {
      return {
        origin,
        allowed: true,
        browserRequest: true,
        headers: {
          ...baseVary,
          'Access-Control-Allow-Origin': 'null',
          'Access-Control-Allow-Methods': allowedMethods,
          'Access-Control-Allow-Headers': allowedHeaders,
          'Access-Control-Max-Age': '600',
        },
      }
    }
    return disallowedMode === 'omit'
      ? { origin, allowed: false, browserRequest: true, headers: { ...baseVary } }
      : { origin, allowed: false, browserRequest: true, headers: { ...baseVary }, denyStatus: 403 }
  }

  const normalized = normalizeOrigin(origin)
  if (!normalized) {
    return disallowedMode === 'omit'
      ? { origin, allowed: false, browserRequest: true, headers: { ...baseVary } }
      : { origin, allowed: false, browserRequest: true, headers: { ...baseVary }, denyStatus: 403 }
  }

  const allowlist = (config.allowedOrigins ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map(normalizeOrigin)
    .filter((v): v is string => !!v)
  const allowed = allowlist.includes(normalized) || (!!config.allowLocalhostDev && !production && isLocalhostOrigin(normalized))

  if (!allowed) {
    return disallowedMode === 'omit'
      ? { origin: normalized, allowed: false, browserRequest: true, headers: { ...baseVary } }
      : { origin: normalized, allowed: false, browserRequest: true, headers: { ...baseVary }, denyStatus: 403 }
  }

  return {
    origin: normalized,
    allowed: true,
    browserRequest: true,
    headers: {
      ...baseVary,
      'Access-Control-Allow-Origin': normalized,
      'Access-Control-Allow-Methods': allowedMethods,
      'Access-Control-Allow-Headers': allowedHeaders,
      'Access-Control-Max-Age': '600',
    },
  }
}

export function readCorsConfigFromEnv(env: Record<string, string | undefined>): CorsConfig {
  const envName = (env.PUBLIC_API_ENV || env.NODE_ENV || '').toLowerCase()
  const allowLocalhost = env.PUBLIC_API_ALLOW_LOCALHOST_DEV === 'true' || (envName !== 'production' && env.PUBLIC_API_ALLOW_LOCALHOST_DEV !== 'false')
  return {
    allowedOrigins: env.PUBLIC_API_ALLOWED_ORIGINS,
    allowLocalhostDev: allowLocalhost,
    environment: envName,
    disallowedOriginMode: env.PUBLIC_API_CORS_DENY_MODE === 'omit' ? 'omit' : 'deny',
    allowNullOrigin: env.PUBLIC_API_ALLOW_NULL_ORIGIN === 'true',
    allowedMethods: ['POST', 'OPTIONS'],
    allowedHeaders: ['authorization', 'x-client-info', 'apikey', 'content-type'],
  }
}

export function normalizeEmail(raw: string | null | undefined) {
  return (raw ?? '').trim().toLowerCase().slice(0, 254)
}

export function normalizeToken(raw: string | null | undefined) {
  return (raw ?? '').trim().toLowerCase().slice(0, 128)
}

export async function buildRateLimitKey(
  policy: Pick<RateLimitPolicy, 'action' | 'windowSeconds'>,
  dims: Partial<Record<'ip' | 'email' | 'token', string>>,
) {
  const parts = [`rl`, policy.action, `w${policy.windowSeconds}`]
  if (dims.ip) parts.push(`ip:${await fingerprint(`ip:${dims.ip}`)}`)
  if (dims.email) parts.push(`em:${await fingerprint(`email:${normalizeEmail(dims.email)}`)}`)
  if (dims.token) parts.push(`tk:${await fingerprint(`token:${normalizeToken(dims.token)}`)}`)
  return parts.join(':')
}

function safeNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value)
  return NaN
}

export async function checkRateLimit(
  policy: RateLimitPolicy,
  dims: Partial<Record<'ip' | 'email' | 'token', string>>,
  deps: RateLimitDeps = {},
): Promise<RateLimitDecision> {
  const fetchFn = deps.fetchFn ?? globalThis.fetch
  const log = deps.log ?? ((entry) => console.warn(JSON.stringify(entry)))
  const hasRedis = isNonEmptyString(deps.redisUrl) && isNonEmptyString(deps.redisToken)

  if (!hasRedis) {
    log({ event: 'rate_limit_unavailable', action: policy.action, category: policy.category, reason: 'missing_config' })
    return policy.failClosed ? { kind: 'unavailable', status: 503 } : { kind: 'allowed' }
  }

  let key: string
  try {
    key = await buildRateLimitKey(policy, dims)
  } catch {
    log({ event: 'rate_limit_error', action: policy.action, category: policy.category, reason: 'key_build_failed' })
    return policy.failClosed ? { kind: 'unavailable', status: 503 } : { kind: 'allowed' }
  }

  try {
    const res = await fetchFn(`${deps.redisUrl!.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${deps.redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, policy.windowSeconds, 'NX'],
      ]),
    })
    if (!res.ok) {
      log({ event: 'rate_limit_unavailable', action: policy.action, category: policy.category, reason: 'redis_http_error', status: res.status })
      return policy.failClosed ? { kind: 'unavailable', status: 503 } : { kind: 'allowed' }
    }
    const json = (await res.json()) as RedisPipelineResult
    const count = safeNumber(json?.[0]?.result)
    if (!Number.isFinite(count)) {
      log({ event: 'rate_limit_unavailable', action: policy.action, category: policy.category, reason: 'invalid_redis_response' })
      return policy.failClosed ? { kind: 'unavailable', status: 503 } : { kind: 'allowed' }
    }
    if (count > policy.max) {
      log({ event: 'rate_limit_blocked', action: policy.action, category: policy.category })
      return { kind: 'blocked', status: 429, retryAfter: policy.windowSeconds }
    }
    return { kind: 'allowed' }
  } catch {
    log({ event: 'rate_limit_unavailable', action: policy.action, category: policy.category, reason: 'redis_connectivity' })
    return policy.failClosed ? { kind: 'unavailable', status: 503 } : { kind: 'allowed' }
  }
}

export async function enforcePolicies(
  policies: RateLimitPolicy[],
  dims: Partial<Record<'ip' | 'email' | 'token', string>>,
  deps: RateLimitDeps = {},
): Promise<RateLimitDecision> {
  for (const policy of policies) {
    const decision = await checkRateLimit(policy, dims, deps)
    if (decision.kind !== 'allowed') return decision
  }
  return { kind: 'allowed' }
}

export const publicRateLimitPolicies = DEFAULT_POLICIES
