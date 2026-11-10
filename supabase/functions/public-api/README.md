# `public-api` Edge Function

Public, rate-limited API for unauthenticated project inquiries and token-based client conversation operations. It holds `SUPABASE_SERVICE_ROLE_KEY` and Upstash credentials server-side and performs server-side validation before sensitive writes.

## Deployment architecture (verified in-repo)

- Frontend: Vite SPA (`src/`), deployed to Netlify and/or Vercel static hosting (`netlify.toml`, `vercel.json`). Both configs serve `dist` and rewrite SPA routes to `/index.html`; **no proxy/rewrite forwards `/functions/*` to Supabase in this repo**.
- Client call path: browser uses `@supabase/supabase-js` `supabase.functions.invoke('public-api', ...)` (`src/lib/api.ts`) against `VITE_SUPABASE_URL` (`src/lib/supabase.ts`). Requests go **directly from the browser to the Supabase project edge gateway/function endpoint**.
- Supabase edge runtime: Deno `Deno.serve` handler (`supabase/functions/public-api/index.ts`). No local `supabase/config.toml` is committed.
- Actual production frontend domain is **not committed in this repository**. Configure `PUBLIC_API_ALLOWED_ORIGINS` and `PUBLIC_SITE_URL` with the real deployed frontend origin(s) before production use.

## Actions

| Action | Purpose | Auth/Access | Notes |
|---|---|---|---|
| `submit_inquiry` | Create inquiry/conversation/message (atomic RPC) | Public, rate-limited, fail-closed | Queues admin + client acknowledgement notifications after successful storage |
| `client_get` | Read conversation/messages by token | Conversation token capability | Server-side read; status visible to client |
| `upload_url` | Create signed upload URL for client attachment | Conversation token capability | Open conversations only |
| `client_send` | Client sends a new message | Conversation token capability | Open conversations only; queues admin notification after successful save |
| `admin_send_reply` | Admin sends text reply | Authenticated admin bearer token + `profiles.role=admin` | Queues client reply notification after successful save |
| `admin_update_inquiry_status` | Admin updates inquiry status/priority/notes | Authenticated admin | Optional client notification on actual status change via `notify_client` |
| `admin_set_conversation_status` | Admin closes/reopens conversation | Authenticated admin | Persists status, preserves history; optional notification via `notify_client` |

## Rate limiting (fail-closed)

Defined in `src/lib/publicApiRateLimit.ts` (re-exported by `rateLimit.ts`). Sensitive public operations reject when verification cannot be performed.

| Action/category | Default limit | Key dimensions | Fail closed |
|---|---:|---|---|
| `submit_inquiry` / `public_inquiry` | 3 / 3600s (IP) + 3 / 86400s (email) | Hashed verified client IP/fallback + hashed normalized email | Yes |
| `client_send` / `client_message` | 20 / 600s | Hashed conversation token + hashed verified client IP/fallback | Yes |
| `upload_url` / `client_upload` | 10 / 600s | Hashed conversation token | Yes |
| `client_get` / `client_read` | 120 / 600s | Hashed conversation token | Yes |

- Missing Upstash config or Redis connectivity/HTTP/invalid responses => `503 service_unavailable` (`Retry-After: 60`).
- Exceeded threshold => `429 rate_limited` with `Retry-After`.
- Raw IPs/emails/tokens are never used as Redis keys or logged.

## Trusted client IP identification

Centralized in `extractTrustedClientIp()` (`src/lib/publicApiRateLimit.ts`). Forwarding headers are **not trusted by default** because browsers can call the Supabase endpoint directly and spoof headers. Default returns fallback identity `unverified` (prevents identity rotation). Enable trust only with a verified sanitizing gateway: `TRUST_CLIENT_IP_HEADERS=true`, `TRUSTED_CLIENT_IP_HEADER`, optional `TRUSTED_PROXY_SECRET_HEADER`/`TRUSTED_PROXY_SECRET`. If conditions cannot be proven, keep untrusted.

## CORS

Centralized in `resolveCorsDecision()`; no wildcard origins. Approved browser origins get exact `Access-Control-Allow-Origin`, explicit methods `POST, OPTIONS`, explicit headers `authorization, x-client-info, apikey, content-type`, `Vary: Origin`. Disallowed browser origins receive no permissive CORS headers (403 or omit). Missing `Origin` treated as non-browser (no browser CORS grant) while endpoint remains protected by validation, fail-closed limits, and capability/admin auth.

## Transactional email notifications (Nexyvon Technologies)

Server-side only (Resend API via `delivery.ts`; templates in `src/lib/notifications.ts`). Email delivery is best-effort **after successful storage** and never discards stored inquiries/messages.

- Events: `inquiry_admin`, `inquiry_client_ack`, `client_message_admin`, `admin_reply_client`, optional `inquiry_status_client`/conversation status notification on explicit actual status change.
- Templates include inquiry reference, appropriate client details/links; **private message contents are not included** in notifications.
- DB tracking: `notification_deliveries` (0007) with status/attempts/max attempts/`next_attempt_at`/provider ids/timestamps/redacted errors/payload and unique idempotency keys prevent duplicates. Retries use exponential backoff+jitter for transient failures.
- `inquiry_status_audit` + `admin_update_inquiry` (0007) and `admin_set_conversation_status` (0009) support authorized, auditable status changes and optional notifications.

## Conversation management (admin/client)

- Conversation status: `open|closed` (schema 0001, preserved). Admin can close/reopen via UI and server action/RPC; history preserved. Client portal blocks replies when closed (`client_send` rejects, UI shows closed state).
- Read/unread: `messages.read_at` set for client-sent unread messages when an authorized admin views the conversation (`admin_mark_conversation_read`, 0009). Admin UI shows unread indicators/counts and inbox filters (open/closed/unread). `admin_list_conversations` provides latest message timestamp/preview and unread counts.
- RLS/authorization: inquiries/conversations/messages/profiles locked to admins (0006); public/client access mediated by token-gated service-role edge function. Admin RPCs/actions require `is_admin()` and authenticated bearer verification; clients cannot mutate status or read receipts.

## Environment variables / secrets

Required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (admin action auth), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

CORS: `PUBLIC_API_ALLOWED_ORIGINS`, `PUBLIC_API_ENV`, `PUBLIC_API_ALLOW_LOCALHOST_DEV`, `PUBLIC_API_CORS_DENY_MODE`, `PUBLIC_API_ALLOW_NULL_ORIGIN`.

Trusted IP (default untrusted): `TRUST_CLIENT_IP_HEADERS`, `TRUSTED_CLIENT_IP_HEADER`, `TRUSTED_PROXY_SECRET_HEADER`, `TRUSTED_PROXY_SECRET`.

Notifications: `RESEND_API_KEY` (or `EMAIL_PROVIDER_API_KEY`), `EMAIL_FROM`, `ADMIN_NOTIFICATION_EMAIL`, `PUBLIC_SITE_URL` (or `SITE_URL`), `ADMIN_DASHBOARD_PATH`, `NOTIFICATION_MAX_ATTEMPTS`.

## Logging

Structured JSON logs for CORS denials, rate-limit unavailable/blocked/dependency issues, unverified client IP, request invalid/failed, inquiry submitted, client/admin message sent, status updates, and notification delivery errors/skips. Never log passwords, auth tokens, access tokens, raw emails, private messages, raw request IPs, attachment contents, or service-role/provider credentials.

## Testing

Vitest unit tests (shared pure modules/services): `src/services/rateLimit.test.ts`, `src/services/clientIp.test.ts`, `src/services/cors.test.ts`, `src/services/notifications.test.ts`, `src/services/adminService.test.ts`, `src/services/inquiriesService.test.ts`, `src/lib/api.test.ts`, etc.

Run:
```bash
npm ci
npm test
npm run build
```
