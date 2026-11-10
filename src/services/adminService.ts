import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { validateContentRow, type ContentRow, type ContentTable } from './contentValidation'
export type { ContentTable }
export type Row = ContentRow
export const STATUSES = ['new', 'reviewing', 'contacted', 'proposal_sent', 'negotiating', 'approved', 'rejected', 'completed'] as const
export const PRIORITIES = ['low', 'normal', 'high'] as const
export interface Inquiry {
  id: string
  name: string
  email: string
  phone: string | null
  whatsapp: string | null
  company_name: string | null
  service_id: string | null
  project_description: string
  budget_range: string | null
  timeline: string | null
  referral_source: string | null
  status: string
  priority: string
  admin_notes: string | null
  created_at: string
  updated_at?: string | null
}
export interface Message { id: string; sender_type: 'client' | 'admin'; message: string; created_at: string; attachment_path: string | null; read_at?: string | null }
export interface AdminService {
  id?: string
  name: string
  slug: string
  short_description: string
  description: string
  category: string
  starting_price: number | null
  pricing_type: 'starting_from' | 'fixed' | 'hourly' | 'custom_quote'
  currency?: string
  estimated_duration: string | null
  features: string[]
  is_featured: boolean
  is_active: boolean
  display_order: number
  icon?: string | null
  image_url?: string | null
  created_at?: string
  updated_at?: string
}
export interface ConversationSummary {
  conversation_id: string
  inquiry_id: string
  access_token: string
  subject: string
  status: 'open' | 'closed'
  updated_at: string
  created_at: string
  client_name: string
  client_email: string
  inquiry_status: string
  latest_message_at: string
  latest_message_preview: string
  latest_sender_type: 'client' | 'admin' | null
  unread_count: number
}
export interface ConversationDetails { id: string; access_token: string; status: 'open' | 'closed'; subject: string }

export interface InquiriesQuery {
  page?: number
  pageSize?: number
  status?: string
  search?: string
  fromDate?: string
  toDate?: string
}
export interface InquiriesPage {
  rows: Inquiry[]
  count: number
  page: number
  pageSize: number
  totalPages: number
}

const ok = <T,>(r: { data: T | null; error: unknown }): T => { if (r.error) throw r.error; return r.data as T }
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024
const ATTACHMENT_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
export const attachmentError = 'Choose a PDF, PNG, JPG, TXT, or DOCX file under 5 MB.'

function escapeIlike(value: string) {
  // Escape characters with special meaning in PostgREST/LIKE patterns.
  return value.replace(/[,%()\\._*]/g, (ch) => `\\${ch}`)
}

function normalizeDateBound(value: string | undefined, endOfDay: boolean) {
  if (!value) return undefined
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undefined
  if (endOfDay) d.setHours(23, 59, 59, 999)
  else d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export const adminService = {
  async isAdmin() {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return false
    const r = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    return !r.error && r.data?.role === 'admin'
  },
  async signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error('Wrong email or password.')
  },
  async requestPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/admin/reset-password`,
    })
    if (error) throw new Error('Password reset email could not be sent. Check the email address and try again.')
  },
  async updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error('Password could not be updated. Request a new reset link and try again.')
  },
  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw new Error('Could not sign out. Please try again.')
  },
  async inquiries(query: InquiriesQuery = {}): Promise<InquiriesPage> {
    const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100)
    const requestedPage = Math.max(query.page ?? 1, 1)
    let q = supabase
      .from('inquiries')
      .select('id,name,email,phone,whatsapp,company_name,service_id,project_description,budget_range,timeline,referral_source,status,priority,admin_notes,created_at,updated_at', { count: 'exact' })

    if (query.status) q = q.eq('status', query.status)
    const search = query.search?.trim()
    if (search) {
      const term = `%${escapeIlike(search)}%`
      q = q.or(`name.ilike.${term},email.ilike.${term},company_name.ilike.${term},project_description.ilike.${term}`)
    }
    const from = normalizeDateBound(query.fromDate, false)
    const to = normalizeDateBound(query.toDate, true)
    if (from) q = q.gte('created_at', from)
    if (to) q = q.lte('created_at', to)

    // Stable ordering for pagination: newest first, unique secondary key.
    q = q.order('created_at', { ascending: false }).order('id', { ascending: false })

    const fromIdx = (requestedPage - 1) * pageSize
    const toIdx = fromIdx + pageSize - 1
    const { data, error, count } = await q.range(fromIdx, toIdx)
    if (error) throw error

    const total = count ?? 0
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const page = Math.min(requestedPage, totalPages)

    // If requested page moved past the end (e.g. records deleted/new filters), return last valid page's empty-safe result.
    if (requestedPage > totalPages && total > 0) {
      return this.inquiries({ ...query, page, pageSize })
    }

    return { rows: (data ?? []) as Inquiry[], count: total, page, pageSize, totalPages }
  },
  async updateInquiry(id: string, patch: Partial<Pick<Inquiry, 'status' | 'priority' | 'admin_notes'>> & { notify_client?: boolean }) {
    // Route through server-side admin action so optional status-change notifications can be sent securely
    // with server-held credentials and recorded delivery status. notify_client is only honored for actual status changes.
    if (patch.status) {
      await api('admin_update_inquiry_status', {
        inquiry_id: id,
        status: patch.status,
        priority: patch.priority,
        admin_notes: patch.admin_notes,
        notify_client: patch.notify_client === true,
      }, { admin: true })
      // Apply any non-status fields not covered by the status RPC in the same intent.
      const extra: Partial<Pick<Inquiry, 'priority' | 'admin_notes'>> = {}
      if (patch.priority !== undefined) extra.priority = patch.priority
      if (patch.admin_notes !== undefined) extra.admin_notes = patch.admin_notes
      // RPC already sets priority/admin_notes when provided; nothing more to do.
      void extra
      return
    }
    ok(await supabase.from('inquiries').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select('id').single())
  },
  async messages(conversationId: string) {
    return ok<Message[]>(await supabase.from('messages').select('id,sender_type,message,created_at,attachment_path,read_at').eq('conversation_id', conversationId).order('created_at'))
  },
  async conversation(inquiryId: string, subject: string) {
    const base = ok<{ id: string; access_token: string }>(await supabase.rpc('admin_get_or_create_conversation', {
      p_inquiry_id: inquiryId, p_subject: subject,
    }).single())
    try {
      const { data, error } = await supabase.from('conversations').select('id,access_token,status,subject').eq('id', base.id).single()
      if (!error && data) return data as ConversationDetails
    } catch { /* fall back to base shape */ }
    return { ...base, status: 'open' as const, subject }
  },
  async conversationSummaries(filter: { status?: 'open' | 'closed'; unreadOnly?: boolean } = {}): Promise<ConversationSummary[]> {
    const { data, error } = await supabase.rpc('admin_list_conversations', {
      p_status: filter.status ?? null,
      p_unread_only: filter.unreadOnly === true,
      p_limit: 100,
      p_offset: 0,
    })
    if (error) throw error
    return (data ?? []) as ConversationSummary[]
  },
  async setConversationStatus(conversationId: string, status: 'open' | 'closed', notifyClient = false) {
    // Prefer server action so optional status-change notifications can be delivered with server-held credentials.
    return api<{ status: 'open' | 'closed' }>('admin_set_conversation_status', {
      conversation_id: conversationId,
      status,
      notify_client: notifyClient,
    }, { admin: true })
  },
  async markConversationRead(conversationId: string) {
    const { error } = await supabase.rpc('admin_mark_conversation_read', { p_conversation_id: conversationId })
    if (error) throw error
  },
  async send(conversationId: string, message: string, file?: File | null) {
    if (!message.trim() || message.trim().length > 5000) throw new Error('Write a message of 1–5000 characters before sending.')
    // Server-side action for text-only replies enables secure admin-reply notifications without exposing provider creds.
    if (!file) {
      await api('admin_send_reply', { conversation_id: conversationId, message: message.trim() }, { admin: true })
      return
    }
    let attachment_path: string | null = null
    if (file) {
      if (!ATTACHMENT_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_ATTACHMENT_SIZE) throw new Error(attachmentError)
      attachment_path = `${conversationId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '_')}`
      const up = await supabase.storage.from('attachments').upload(attachment_path, file)
      if (up.error) throw new Error(attachmentError)
    }
    const result = await supabase.from('messages').insert({ conversation_id: conversationId, sender_type: 'admin', message: message.trim(), attachment_path }).select('id').single()
    if (result.error) {
      let cleanupFailed = false
      if (attachment_path) {
        try { cleanupFailed = !!(await supabase.storage.from('attachments').remove([attachment_path])).error }
        catch { cleanupFailed = true }
      }
      if (cleanupFailed) throw new Error('Message could not be saved and its uploaded file could not be removed. Contact an administrator before retrying.')
      throw new Error('Message could not be saved. Please try again.')
    }
  },
  async contentList(t: ContentTable) { return ok<Row[]>(await supabase.from(t).select('*').order('created_at', { ascending: false })) },
  async contentSave(t: ContentTable, row: Row) {
    const r = validateContentRow(t, row) as any
    if (t === 'blog_posts' && r.is_published && !r.published_at) r.published_at = new Date().toISOString()
    if (t === 'company_profile') {
      r.updated_at = new Date().toISOString()
      if (r.is_published && !r.published_at) r.published_at = new Date().toISOString()
      if (!r.is_published) r.published_at = r.published_at ?? null
      if (!r.slug) r.slug = 'default'
    }
    const { error } = await supabase.from(t).upsert(r).select('id').single()
    if (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
      if (code === '23505' && t !== 'testimonials') throw new Error('That slug is already in use. Choose a different slug.')
      if (code === '23505') throw new Error('That content record already exists. Refresh and try again.')
      if (code === '23503') throw new Error('A related record is no longer available. Refresh the editor and try again.')
      throw new Error('Content could not be saved. Please try again.')
    }
  },
  async contentDelete(t: ContentTable, id: string) {
    const { error } = await supabase.from(t).delete().eq('id', id).select('id').single()
    if (error) throw new Error('Content could not be deleted. Please refresh and try again.')
  },
  async services() {
    return ok<AdminService[]>(await supabase
      .from('services')
      .select('id,name,slug,short_description,description,category,starting_price,pricing_type,currency,estimated_duration,features,is_featured,is_active,display_order,icon,image_url,created_at,updated_at')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false }))
  },
  async saveService(input: Partial<AdminService> & Pick<AdminService, 'name' | 'slug' | 'short_description' | 'description' | 'category' | 'pricing_type'>) {
    const name = String(input.name ?? '').trim()
    const slug = String(input.slug ?? '').trim().toLowerCase()
    const short_description = String(input.short_description ?? '').trim()
    const description = String(input.description ?? '').trim()
    const category = String(input.category ?? '').trim() || 'development'
    const pricing_type = input.pricing_type
    if (!name || !slug || !short_description || !description) throw new Error('Name, slug, short description, and full description are required.')
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Use a URL-safe slug (lowercase letters, numbers, hyphens).')
    if (!['starting_from', 'fixed', 'hourly', 'custom_quote'].includes(pricing_type)) throw new Error('Select a valid pricing type.')
    const price = input.starting_price === null || input.starting_price === undefined || input.starting_price === ('' as any)
      ? null
      : Number(input.starting_price)
    if (price !== null && (!Number.isFinite(price) || price < 0)) throw new Error('Enter a valid non-negative price or leave it blank.')
    if (pricing_type !== 'custom_quote' && price === null) throw new Error('Non-custom pricing requires a price amount.')
    const features = Array.isArray(input.features) ? input.features.map((f) => String(f).trim()).filter(Boolean) : []
    const row: Record<string, unknown> = {
      name,
      slug,
      short_description,
      description,
      category,
      starting_price: pricing_type === 'custom_quote' ? price : price,
      pricing_type,
      currency: (input.currency || 'KES').trim() || 'KES',
      estimated_duration: input.estimated_duration?.toString().trim() || null,
      features,
      is_featured: input.is_featured === true,
      is_active: input.is_active !== false,
      display_order: Number.isFinite(Number(input.display_order)) ? Math.trunc(Number(input.display_order)) : 0,
      icon: input.icon?.toString().trim() || null,
      image_url: input.image_url?.toString().trim() || null,
      updated_at: new Date().toISOString(),
    }
    if (input.id) row.id = input.id
    const { error } = await supabase.from('services').upsert(row).select('id').single()
    if (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? (error as any).code : undefined
      if (code === '23505') throw new Error('That service slug is already in use. Choose a different slug.')
      throw new Error('Service could not be saved. Please try again.')
    }
  },
  async deleteService(id: string) {
    // Prefer hard delete only when safe; DB FKs use ON DELETE SET NULL to preserve inquiry/project references.
    const { error } = await supabase.from('services').delete().eq('id', id).select('id').single()
    if (error) throw new Error('Service could not be deleted. You can archive it by setting it inactive instead.')
  },
  async updateService(id: string, patch: Partial<AdminService>) {
    ok(await supabase.from('services').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select('id').single())
  },
}
