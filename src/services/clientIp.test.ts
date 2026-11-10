import { describe, expect, it } from 'vitest'
import {
  extractTrustedClientIp,
  isValidIp,
  normalizeIpCandidate,
  readTrustedClientIpConfigFromEnv,
} from '../lib/publicApiRateLimit'

function h(entries: Record<string, string>) {
  return new Headers(entries)
}

describe('IP parsing/validation', () => {
  it('accepts IPv4 and IPv6 addresses', () => {
    expect(isValidIp('203.0.113.9')).toBe(true)
    expect(isValidIp('2001:db8::1')).toBe(true)
    expect(isValidIp('::1')).toBe(true)
    expect(isValidIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true)
  })

  it('normalizes bracketed IPv6 and IPv4 ports/mapped forms', () => {
    expect(normalizeIpCandidate('[2001:db8::1]:443')).toBe('2001:db8::1')
    expect(normalizeIpCandidate('203.0.113.9:12345')).toBe('203.0.113.9')
    expect(normalizeIpCandidate('::ffff:203.0.113.9')).toBe('203.0.113.9')
  })

  it('rejects malformed IP addresses', () => {
    expect(isValidIp('999.1.1.1')).toBe(false)
    expect(isValidIp('1.2.3')).toBe(false)
    expect(isValidIp('not-an-ip')).toBe(false)
    expect(isValidIp('1.2.3.4\r\nINCR x')).toBe(false)
    expect(isValidIp('2001:::1')).toBe(false)
    expect(normalizeIpCandidate('bogus')).toBeNull()
  })
})

describe('extractTrustedClientIp', () => {
  it('does not trust arbitrary forwarding headers by default (spoofing protection)', () => {
    const res = extractTrustedClientIp(h({ 'x-forwarded-for': '198.51.100.9', 'x-real-ip': '198.51.100.10' }))
    expect(res).toEqual({ ip: 'unverified', source: 'fallback', trusted: false })
  })

  it('returns safe fallback when headers are missing', () => {
    expect(extractTrustedClientIp(h({}), { trustForwardedHeaders: true })).toEqual({ ip: 'unverified', source: 'fallback', trusted: false })
  })

  it('uses first valid gateway-provided x-forwarded-for value when explicitly trusted', () => {
    const res = extractTrustedClientIp(h({ 'x-forwarded-for': '203.0.113.7, 10.0.0.2, 10.0.0.1' }), { trustForwardedHeaders: true })
    expect(res).toEqual({ ip: '203.0.113.7', source: 'trusted_header', trusted: true })
  })

  it('handles multiple forwarded addresses and skips invalid leading candidates', () => {
    const res = extractTrustedClientIp(h({ 'x-forwarded-for': 'spoofed\r\n, 203.0.113.8, 10.0.0.1' }), { trustForwardedHeaders: true })
    expect(res.ip).toBe('203.0.113.8')
    expect(res.trusted).toBe(true)
  })

  it('supports an explicitly trusted non-x-forwarded-for header', () => {
    const res = extractTrustedClientIp(h({ 'x-real-ip': '198.51.100.55' }), { trustForwardedHeaders: true, trustedHeaderName: 'x-real-ip' })
    expect(res).toEqual({ ip: '198.51.100.55', source: 'trusted_header', trusted: true })
  })

  it('requires a verified gateway secret header when configured', () => {
    const headers = h({ 'x-forwarded-for': '203.0.113.44', 'x-gateway-secret': 'bad' })
    const cfg = { trustForwardedHeaders: true, trustedGatewaySecretHeader: 'x-gateway-secret', expectedGatewaySecret: 'good' }
    expect(extractTrustedClientIp(headers, cfg).trusted).toBe(false)
    expect(extractTrustedClientIp(h({ 'x-forwarded-for': '203.0.113.44', 'x-gateway-secret': 'good' }), cfg)).toMatchObject({ ip: '203.0.113.44', trusted: true })
  })

  it('falls back on malformed trusted-header values', () => {
    const res = extractTrustedClientIp(h({ 'x-forwarded-for': 'unknown, not-an-ip' }), { trustForwardedHeaders: true })
    expect(res).toEqual({ ip: 'unverified', source: 'fallback', trusted: false })
  })

  it('prevents attacker-controlled header rotation from creating a usable trusted IP when untrusted', () => {
    const a = extractTrustedClientIp(h({ 'x-forwarded-for': '203.0.113.1' }))
    const b = extractTrustedClientIp(h({ 'x-forwarded-for': '203.0.113.2' }))
    expect(a.ip).toBe('unverified')
    expect(b.ip).toBe('unverified')
    expect(a.ip).toEqual(b.ip)
  })
})

describe('trusted client IP env config', () => {
  it('defaults to untrusted', () => {
    expect(readTrustedClientIpConfigFromEnv({}).trustForwardedHeaders).toBe(false)
  })

  it('reads explicit opt-in and header config', () => {
    expect(readTrustedClientIpConfigFromEnv({
      TRUST_CLIENT_IP_HEADERS: 'true',
      TRUSTED_CLIENT_IP_HEADER: 'x-real-ip',
      TRUSTED_PROXY_SECRET_HEADER: 'x-gateway-secret',
      TRUSTED_PROXY_SECRET: 's3cr3t',
    })).toEqual({
      trustForwardedHeaders: true,
      trustedHeaderName: 'x-real-ip',
      trustedGatewaySecretHeader: 'x-gateway-secret',
      expectedGatewaySecret: 's3cr3t',
    })
  })
})
