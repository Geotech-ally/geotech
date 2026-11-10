import { describe, expect, it, vi } from 'vitest'
import {
  buildRateLimitKey,
  checkRateLimit,
  enforcePolicies,
  fingerprint,
  getRateLimitPolicies,
  normalizeIpCandidate,
  policiesForAction,
  type RateLimitPolicy,
} from '../lib/publicApiRateLimit'

const policy = (overrides: Partial<RateLimitPolicy> = {}): RateLimitPolicy => ({
  action: 'client_send',
  category: 'client_message',
  max: 2,
  windowSeconds: 600,
  failClosed: true,
  keyDimensions: ['token', 'ip'],
  ...overrides,
})

function redisResponse(count: unknown) {
  return { ok: true, json: async () => [{ result: count }, { result: 1 }] } as Response
}

describe('rate limit normalization and keys', () => {
  it('normalizes valid IP candidates and rejects malformed values', () => {
    expect(normalizeIpCandidate('203.0.113.9, 10.0.0.1')).toBe('203.0.113.9')
    expect(normalizeIpCandidate(' 2001:db8::1 ')).toBe('2001:db8::1')
    expect(normalizeIpCandidate('1.2.3.4\r\nINCR x')).toBeNull()
    expect(normalizeIpCandidate(null)).toBeNull()
  })

  it('hashes identifiers so raw tokens/emails are not embedded in keys', async () => {
    const token = '72607ee8-3ed1-4edc-b8c4-86b232172954'
    const key = await buildRateLimitKey({ action: 'client_send', windowSeconds: 600 }, { token, ip: '203.0.113.9' })
    expect(key).toContain('rl:client_send:w600')
    expect(key).not.toContain(token)
    expect(key).not.toContain('203.0.113.9')
    expect(key).toMatch(/tk:[a-f0-9]{32}/)
    expect(key).toMatch(/ip:[a-f0-9]{32}/)
  })

  it('produces stable fingerprints for equivalent identifiers', async () => {
    await expect(fingerprint('token:a')).resolves.toEqual(await fingerprint('token:a'))
    await expect(fingerprint('token:a')).resolves.not.toEqual(await fingerprint('token:b'))
  })
})

describe('checkRateLimit fail-closed behavior', () => {
  it('returns unavailable when Upstash config is missing', async () => {
    const log = vi.fn()
    const decision = await checkRateLimit(policy(), { token: 't' }, { log })
    expect(decision).toEqual({ kind: 'unavailable', status: 503 })
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: 'rate_limit_unavailable', reason: 'missing_config', action: 'client_send' }))
  })

  it('returns unavailable when Redis is down/connectivity fails', async () => {
    const log = vi.fn()
    const fetchFn = vi.fn().mockRejectedValue(new Error('network'))
    const decision = await checkRateLimit(policy(), { token: 't' }, { redisUrl: 'https://redis', redisToken: 'tok', fetchFn, log })
    expect(decision).toEqual({ kind: 'unavailable', status: 503 })
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: 'rate_limit_unavailable', reason: 'redis_connectivity' }))
  })

  it('returns unavailable on non-OK Redis responses', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response)
    const decision = await checkRateLimit(policy(), { token: 't' }, { redisUrl: 'https://redis', redisToken: 'tok', fetchFn })
    expect(decision).toEqual({ kind: 'unavailable', status: 503 })
  })

  it('returns unavailable on malformed Redis payloads', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ nope: true }) } as Response)
    const decision = await checkRateLimit(policy(), { token: 't' }, { redisUrl: 'https://redis', redisToken: 'tok', fetchFn })
    expect(decision).toEqual({ kind: 'unavailable', status: 503 })
  })

  it('allows requests under the threshold when Redis is available', async () => {
    const fetchFn = vi.fn().mockResolvedValue(redisResponse(2))
    const decision = await checkRateLimit(policy({ max: 2 }), { token: 't', ip: '1.2.3.4' }, { redisUrl: 'https://redis', redisToken: 'tok', fetchFn })
    expect(decision).toEqual({ kind: 'allowed' })
    expect(fetchFn).toHaveBeenCalledOnce()
    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string)
    expect(body[0][0]).toBe('INCR')
    expect(body[1]).toEqual(['EXPIRE', body[0][1], 600, 'NX'])
  })

  it('blocks requests that exceed the configured threshold', async () => {
    const log = vi.fn()
    const fetchFn = vi.fn().mockResolvedValue(redisResponse(3))
    const decision = await checkRateLimit(policy({ max: 2 }), { token: 't' }, { redisUrl: 'https://redis', redisToken: 'tok', fetchFn, log })
    expect(decision).toEqual({ kind: 'blocked', status: 429, retryAfter: 600 })
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: 'rate_limit_blocked', action: 'client_send' }))
  })

  it('uses separate keys for different clients/tokens', async () => {
    const fetchFn = vi.fn().mockResolvedValue(redisResponse(1))
    await checkRateLimit(policy(), { token: 'token-a', ip: '1.1.1.1' }, { redisUrl: 'https://redis', redisToken: 'tok', fetchFn })
    await checkRateLimit(policy(), { token: 'token-b', ip: '1.1.1.1' }, { redisUrl: 'https://redis', redisToken: 'tok', fetchFn })
    const keyA = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string)[0][1]
    const keyB = JSON.parse((fetchFn.mock.calls[1][1] as RequestInit).body as string)[0][1]
    expect(keyA).not.toEqual(keyB)
  })

  it('enforces the first failing policy in a policy set', async () => {
    const fetchFn = vi.fn().mockResolvedValue(redisResponse(1))
    const decision = await enforcePolicies(
      [policy({ action: 'submit_inquiry', max: 5 }), policy({ action: 'submit_inquiry', max: 0 })],
      { ip: '1.2.3.4' },
      { redisUrl: 'https://redis', redisToken: 'tok', fetchFn },
    )
    expect(decision.kind).toBe('blocked')
  })
})

describe('configured public policies', () => {
  it('keeps separate fail-closed policies for sensitive public operations', () => {
    const policies = getRateLimitPolicies()
    const byAction = Object.fromEntries(policies.map((p) => [p.action, p]))
    expect(byAction.submit_inquiry).toMatchObject({ category: 'public_inquiry', failClosed: true, keyDimensions: ['ip'] })
    expect(byAction.submit_inquiry_email).toMatchObject({ category: 'public_inquiry', failClosed: true, keyDimensions: ['email'] })
    expect(byAction.client_send).toMatchObject({ category: 'client_message', failClosed: true, keyDimensions: expect.arrayContaining(['token']) })
    expect(byAction.upload_url).toMatchObject({ category: 'client_upload', failClosed: true, keyDimensions: ['token'] })
    expect(byAction.client_get).toMatchObject({ category: 'client_read', failClosed: true })
  })

  it('resolves policies per endpoint action', () => {
    expect(policiesForAction('client_send').map((p) => p.action)).toEqual(['client_send'])
    expect(policiesForAction('submit_inquiry').map((p) => p.action)).toEqual(['submit_inquiry'])
    expect(policiesForAction('submit_inquiry_email').map((p) => p.action)).toEqual(['submit_inquiry_email'])
  })

  it('treats invalid request payloads as non-rate-limit concerns by keeping policies endpoint-specific', () => {
    expect(policiesForAction('totally_invalid_action')).toEqual([])
  })
})
