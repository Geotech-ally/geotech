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
2. Create a free Upstash Redis database, then:
   `supabase secrets set UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=...`
   (Redis only counts requests per IP/email. Postgres stays the source of truth. If Redis is unset, limiting is skipped.)
3. `supabase functions deploy public-api`
4. Clients get a private link `/c/<token>` after submitting. Admins copy the same link from each inquiry's conversation panel.
5. Admin editors: `/admin/content/projects`, `/admin/content/testimonials`, `/admin/content/blog_posts`.
Content tables are created by migrations `0002` (`projects`, `testimonials`) and `0003` (`blog_posts`). Public reads are limited by RLS to published rows; admins manage drafts through the dashboard. Project and blog-post slugs are unique; testimonials do not have slugs. Publishing a blog post sets `published_at` when it is empty.
Attachments: private `attachments` bucket, 5 MB limit, PDF/PNG/JPG/TXT/DOCX only (enforced by the bucket itself).
