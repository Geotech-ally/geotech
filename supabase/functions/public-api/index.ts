// Public, rate-limited API. Holds the service-role key and Redis credentials server-side only.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3.23.8'
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const R = Deno.env.get('UPSTASH_REDIS_REST_URL'), RT = Deno.env.get('UPSTASH_REDIS_REST_TOKEN')
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const LIMITS: Record<string, [number, number]> = { submit_inquiry: [3, 3600], client_send: [20, 600], upload_url: [10, 600], client_get: [120, 600] } // [max, window seconds]
const TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
// Fixed-window counter in Redis. If Redis isn't configured or is down, requests are allowed (fail open).
async function limited(key: string, max: number, win: number) {
  if (!R || !RT) return false
  try {
    const r = await fetch(`${R}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${RT}` }, body: JSON.stringify([['INCR', key], ['EXPIRE', key, win, 'NX']]) })
    const [c] = await r.json(); return c.result > max
  } catch { return false }
}
const opt = z.string().trim().max(200).optional()
const inquiry = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email(), phone: opt, whatsapp: opt, company_name: opt,
  service_id: z.string().uuid().optional().or(z.literal('')), project_description: z.string().trim().min(20).max(5000), budget_range: opt, timeline: opt, referral_source: opt })
const token = z.string().uuid()
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const out = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...cors, 'Content-Type': 'application/json' } })
  const fail = (error: string) => out({ ok: false, error })
  try {
    const { action, ...p } = await req.json()
    const lim = LIMITS[action]; if (!lim) return fail('Unknown action.')
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
    if (await limited(`rl:${action}:${ip}`, lim[0], lim[1])) return fail('Too many requests. Please wait a few minutes and try again.')
    if (action === 'submit_inquiry') {
      const v = inquiry.safeParse(p); if (!v.success) return fail('Please check the form and try again.')
      if (await limited(`rl:email:${v.data.email.toLowerCase()}`, 3, 86400)) return fail('Too many requests. Please wait a few minutes and try again.')
      const { data: i, error } = await sb.from('inquiries').insert({ ...v.data, service_id: v.data.service_id || null }).select('id').single()
      if (error) return fail('Failed to send inquiry. Please try again.')
      const { data: c } = await sb.from('conversations').insert({ inquiry_id: i.id, subject: `Project inquiry from ${v.data.name}` }).select('id,access_token').single()
      await sb.from('messages').insert({ conversation_id: c!.id, sender_type: 'client', message: v.data.project_description })
      return out({ ok: true, token: c!.access_token })
    }
    const t = token.safeParse(p.token); if (!t.success) return fail('This link is not valid.')
    const { data: conv } = await sb.from('conversations').select('id,subject,status').eq('access_token', t.data).maybeSingle()
    if (!conv) return fail('This link is not valid.')
    if (action === 'client_get') {
      const { data: ms } = await sb.from('messages').select('id,sender_type,message,created_at,attachment_path').eq('conversation_id', conv.id).order('created_at')
      const messages = await Promise.all((ms ?? []).map(async ({ attachment_path, ...m }) => ({ ...m, attachment_url: attachment_path ? (await sb.storage.from('attachments').createSignedUrl(attachment_path, 3600)).data?.signedUrl ?? null : null })))
      return out({ ok: true, subject: conv.subject, status: conv.status, messages })
    }
    if (conv.status !== 'open') return fail('This conversation is closed.')
    if (action === 'upload_url') {
      if (!TYPES.includes(p.type) || !(p.size > 0 && p.size <= 5242880)) return fail('Use a PDF, PNG, JPG, TXT or DOCX file under 5 MB.')
      const path = `${conv.id}/${crypto.randomUUID()}-${String(p.filename).replace(/[^\w.-]/g, '_').slice(0, 80)}`
      const { data, error } = await sb.storage.from('attachments').createSignedUploadUrl(path)
      return error ? fail('Could not prepare the upload.') : out({ ok: true, path, token: data.token })
    }
    const m = z.string().trim().min(1).max(5000).safeParse(p.message); if (!m.success) return fail('Write a message first.')
    const path = typeof p.attachment_path === 'string' && p.attachment_path.startsWith(`${conv.id}/`) ? p.attachment_path : null
    const { error } = await sb.from('messages').insert({ conversation_id: conv.id, sender_type: 'client', message: m.data, attachment_path: path })
    return error ? fail('Message not sent. Try again.') : out({ ok: true })
  } catch { return fail('Something went wrong. Please try again.') }
})
