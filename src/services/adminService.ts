import { supabase } from '../lib/supabase'
import { validateContentRow, type ContentRow, type ContentTable } from './contentValidation'
export type { ContentTable }
export type Row = ContentRow
export const STATUSES = ['new','reviewing','contacted','proposal_sent','negotiating','approved','rejected','completed'] as const
export const PRIORITIES = ['low','normal','high'] as const
export interface Inquiry { id:string; name:string; email:string; phone:string|null; company_name:string|null; project_description:string; budget_range:string|null; timeline:string|null; status:string; priority:string; admin_notes:string|null; created_at:string }
export interface Message { id:string; sender_type:'client'|'admin'; message:string; created_at:string; attachment_path:string|null }
export interface AdminService { id:string; name:string; starting_price:number|null; pricing_type:string; is_active:boolean; is_featured:boolean }
const ok = <T,>(r: { data: T | null; error: unknown }): T => { if (r.error) throw r.error; return r.data as T }
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024
const ATTACHMENT_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
export const attachmentError = 'Choose a PDF, PNG, JPG, TXT, or DOCX file under 5 MB.'
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
  async inquiries(status?: string) {
    let q = supabase.from('inquiries').select('*').order('created_at', { ascending: false }).limit(100)
    if (status) q = q.eq('status', status)
    return ok<Inquiry[]>(await q)
  },
  async updateInquiry(id: string, patch: Partial<Pick<Inquiry, 'status' | 'priority' | 'admin_notes'>>) {
    ok(await supabase.from('inquiries').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select('id').single())
  },
  async messages(conversationId: string) {
    return ok<Message[]>(await supabase.from('messages').select('id,sender_type,message,created_at,attachment_path').eq('conversation_id', conversationId).order('created_at'))
  },
  async conversation(inquiryId: string, subject: string) {
    return ok<{ id: string; access_token: string }>(await supabase.rpc('admin_get_or_create_conversation', {
      p_inquiry_id: inquiryId, p_subject: subject,
    }).single())
  },
  async send(conversationId: string, message: string, file?: File | null) {
    if (!message.trim() || message.trim().length > 5000) throw new Error('Write a message of 1–5000 characters before sending.')
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
    const r = validateContentRow(t, row)
    if (t === 'blog_posts' && r.is_published && !r.published_at) r.published_at = new Date().toISOString()
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
  async services() { return ok<AdminService[]>(await supabase.from('services').select('id,name,starting_price,pricing_type,is_active,is_featured').order('display_order')) },
  async updateService(id: string, patch: Partial<AdminService>) {
    ok(await supabase.from('services').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select('id').single())
  },
}
