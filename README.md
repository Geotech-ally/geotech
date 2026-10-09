# Geotech business site
1. `npm install`
2. Copy `.env.example` to `.env`; fill in the Supabase URL and anon key.
3. Apply `supabase/migrations/0001_init.sql` (Supabase CLI: `supabase db push`).
4. Make yourself admin: sign up, then `insert into profiles (id, role) values ('<your-user-id>', 'admin')`.
5. `npm run dev`. Edit services and prices in the `services` table; the site reads them live.
Seed services and prices are placeholders: change them before launch.

## Public API, Redis and files (migrations 0002 and 0003)
Public writes (inquiries, client replies, upload URLs) go through the `public-api` Supabase Edge Function, which holds the service-role key.
1. Apply migrations `0002` and `0003`.
2. Create a free Upstash Redis database, then:
   `supabase secrets set UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=...`
   (Redis only counts requests per IP/email. Postgres stays the source of truth. If Redis is unset, limiting is skipped.)
3. `supabase functions deploy public-api`
4. Clients get a private link `/c/<token>` after submitting. Admins copy the same link from each inquiry's conversation panel.
5. Admin editors: `/admin/content/projects`, `/admin/content/testimonials`, `/admin/content/blog_posts`.
Attachments: private `attachments` bucket, 5 MB limit, PDF/PNG/JPG/TXT/DOCX only (enforced by the bucket itself).
