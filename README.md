# Geotech business site
1. `npm install`
2. Copy `.env.example` to `.env`; fill in the Supabase URL and anon key.
3. Apply all migrations in `supabase/migrations` in filename order (`0001` through `0006`; Supabase CLI: `supabase db push`).
4. Make yourself admin: sign up, then `insert into profiles (id, role) values ('<your-user-id>', 'admin')`.
5. `npm run dev`. Edit services and prices in the `services` table; the site reads them live.
Seed services and prices are placeholders: change them before launch.

## Public API, Redis and files (migrations 0002–0006)
Public writes (inquiries, client replies, upload URLs) go through the `public-api` Supabase Edge Function, which holds the service-role key.
1. Apply migrations `0002` through `0006` after `0001`. Migration `0004` repairs conversation tokens, attachment-path schema, indexes, and private bucket policy. Migration `0005` creates inquiries, conversations, and the initial message atomically through a server-only RPC. Migration `0006` locks private tables and attachments to admins and adds serialized admin conversation creation.
2. Create a free Upstash Redis database, then set both secrets (required for production because `public-api` rate limiting is fail-closed for sensitive public operations):
   `supabase secrets set UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=...`
   Redis only counts requests per IP/email/token dimension. Postgres stays the source of truth. If Redis is unset or unavailable, `public-api` returns `503 service_unavailable` rather than allowing unverified sensitive requests.
3. `supabase functions deploy public-api`
4. Clients get a private link `/c/<token>` after submitting. Admins copy the same link from each inquiry's conversation panel.
5. Admin editors: `/admin/content/projects`, `/admin/content/testimonials`, `/admin/content/blog_posts`.
See `supabase/functions/public-api/README.md` for rate-limit policies, fail-closed behavior, trusted client IP/CORS, transactional email notifications (Resend/provider secrets, sender/admin/domain config, templates, delivery tracking/retries/idempotency), and logging.
Content tables are created by migrations `0002` (`projects`, `testimonials`) and `0003` (`blog_posts`). Public reads are limited by RLS to published rows; admins manage drafts through the dashboard. Project and blog-post slugs are unique; testimonials do not have slugs. Publishing a blog post sets `published_at` when it is empty.
Attachments: private `attachments` bucket, 5 MB limit, PDF/PNG/JPG/TXT/DOCX only (enforced by the bucket itself).

## Technical SEO & Production Deployment

The site includes a complete, high-performance Technical SEO implementation:

### 1. Production Domain Configuration
Set `VITE_SITE_URL` in your frontend environment (e.g. Netlify/Vercel environment settings or `.env`):
```bash
VITE_SITE_URL=https://geotech.example.com
```
All canonical URLs, Open Graph images, Twitter cards, XML sitemap locations, and Schema.org structured data automatically inherit this origin.

### 2. Prerendering (SSG) for Social Crawlers & Search Engines
Because social crawlers (Facebook, LinkedIn, Twitter, WhatsApp, Slack, Telegram) do not execute JavaScript, the build script runs `scripts/prerender.js` after Vite finishes building:
```bash
npm run build
```
This automatically produces static `index.html` files for all eligible public routes in `dist/` (e.g. `dist/services/index.html`, `dist/about/index.html`, `dist/contact/index.html`, etc.) with route-specific `<title>`, `<meta name="description">`, `<link rel="canonical">`, Open Graph tags, and Schema.org JSON-LD.

### 3. XML Sitemap & Robots.txt
- `public/robots.txt`: Allows public routes, disallows private administration (`/admin*`) and confidential client conversations (`/c/*`), and references the sitemap.
- `public/sitemap.xml`: Valid XML sitemap indexing all public routes (`/`, `/services`, `/projects`, `/insights`, `/about`, `/contact`, `/start`, and service slugs). Strictly excludes private admin and client portal paths.
- Sitemap regeneration: Programmatically generated using `src/lib/sitemap.ts`.

### 4. Application Identity & Social Sharing Assets
The `public/` directory contains standard multi-resolution assets generated from the corporate brand identity:
- `favicon.ico` (multi-resolution 16x16, 32x32, 48x48)
- `favicon.svg` (SVG icon with adaptive light/dark mode styling)
- `favicon-16x16.png` & `favicon-32x32.png`
- `apple-touch-icon.png` (180x180)
- `android-chrome-192x192.png` & `android-chrome-512x512.png`
- `site.webmanifest` (PWA application identity)
- `og-image.png` & `og-image.jpg` (1200x630 px Open Graph / Twitter Card social preview images)

### 5. Private Route Protection & Defense-in-Depth Headers
Private portals (`/admin/*` and `/c/*`) are protected with multiple layers:
- Dynamic `<SEO noindex />` component applies `<meta name="robots" content="noindex, nofollow, noarchive" />`.
- Server response headers in `netlify.toml` and `vercel.json` return `X-Robots-Tag: noindex, nofollow, noarchive`.
- Excluded from `robots.txt` and `sitemap.xml`.

### 6. Verification & Tests
Run the SEO test suite covering all public metadata, admin exclusion, sitemap validity, robots.txt, and social preview assets:
```bash
npx vitest run src/tests/seo.test.ts
```

