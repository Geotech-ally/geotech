import { describe, expect, it } from 'vitest'
import { readCorsConfigFromEnv, resolveCorsDecision } from '../lib/publicApiRateLimit'

describe('CORS allowlist', () => {
  it('allows an approved production domain and returns exact origin headers', () => {
    const d = resolveCorsDecision('https://geotech.example.com', {
      allowedOrigins: 'https://geotech.example.com,https://staging.geotech.example.com',
      environment: 'production',
      allowLocalhostDev: false,
    })
    expect(d.allowed).toBe(true)
    expect(d.browserRequest).toBe(true)
    expect(d.headers['Access-Control-Allow-Origin']).toBe('https://geotech.example.com')
    expect(d.headers['Access-Control-Allow-Methods']).toContain('POST')
    expect(d.headers['Access-Control-Allow-Headers']).toContain('authorization')
    expect(d.headers.Vary).toBe('Origin')
  })

  it('allows an approved staging domain', () => {
    const d = resolveCorsDecision('https://staging.geotech.example.com', {
      allowedOrigins: 'https://geotech.example.com,https://staging.geotech.example.com',
      environment: 'production',
    })
    expect(d.allowed).toBe(true)
    expect(d.headers['Access-Control-Allow-Origin']).toBe('https://staging.geotech.example.com')
  })

  it('allows localhost in non-production development when enabled', () => {
    const d = resolveCorsDecision('http://localhost:5173', {
      allowedOrigins: 'https://geotech.example.com',
      allowLocalhostDev: true,
      environment: 'development',
    })
    expect(d.allowed).toBe(true)
    expect(d.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173')
  })

  it('does not allow localhost in production even if dev flag is set', () => {
    const d = resolveCorsDecision('http://localhost:5173', {
      allowedOrigins: 'https://geotech.example.com',
      allowLocalhostDev: true,
      environment: 'production',
    })
    expect(d.allowed).toBe(false)
    expect(d.headers['Access-Control-Allow-Origin']).toBeUndefined()
    expect(d.denyStatus).toBe(403)
  })

  it('denies unauthorized external domains and omits permissive CORS headers', () => {
    const d = resolveCorsDecision('https://evil.example', {
      allowedOrigins: 'https://geotech.example.com',
      environment: 'production',
    })
    expect(d.allowed).toBe(false)
    expect(d.headers['Access-Control-Allow-Origin']).toBeUndefined()
    expect(d.headers.Vary).toBe('Origin')
  })

  it('supports omit mode for disallowed origins', () => {
    const d = resolveCorsDecision('https://evil.example', {
      allowedOrigins: 'https://geotech.example.com',
      disallowedOriginMode: 'omit',
    })
    expect(d.allowed).toBe(false)
    expect(d.denyStatus).toBeUndefined()
    expect(d.headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('handles missing Origin header without granting browser CORS permission', () => {
    const d = resolveCorsDecision(null, { allowedOrigins: 'https://geotech.example.com' })
    expect(d.browserRequest).toBe(false)
    expect(d.allowed).toBe(true) // non-browser access control is separate (validation/rate limits/tokens)
    expect(d.headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('rejects malformed/null origins unless explicitly enabled', () => {
    expect(resolveCorsDecision('null', { allowedOrigins: 'https://geotech.example.com' }).allowed).toBe(false)
    expect(resolveCorsDecision('not-a-url', { allowedOrigins: 'https://geotech.example.com' }).allowed).toBe(false)
  })

  it('reads env config with safe production defaults', () => {
    const cfg = readCorsConfigFromEnv({
      PUBLIC_API_ALLOWED_ORIGINS: 'https://app.example.com, https://staging.example.com',
      PUBLIC_API_ENV: 'production',
      PUBLIC_API_ALLOW_LOCALHOST_DEV: 'true',
    })
    expect(cfg.allowedOrigins).toContain('https://app.example.com')
    expect(cfg.environment).toBe('production')
    expect(cfg.allowLocalhostDev).toBe(true) // localhost still blocked by production check in resolver
    expect(resolveCorsDecision('http://localhost:5173', cfg).allowed).toBe(false)
  })

  it('never returns wildcard origin', () => {
    const d = resolveCorsDecision('https://geotech.example.com', { allowedOrigins: 'https://geotech.example.com' })
    expect(d.headers['Access-Control-Allow-Origin']).not.toBe('*')
  })
})
