import { supabase } from '../lib/supabase'
export type ContentTable = 'projects' | 'testimonials' | 'blog_posts'
export type Row = Record<string, string | boolean | string[] | null>
export const STATUSES = ['new','reviewing','contacted','proposal_sent','negotiating','approved','rejected','completed'] as const
export const PRIORITIES = ['low','normal','high'] as const
export interface Inquiry { id:string; name:string; email:string; phone:string|null; company_name:string|null; project_description:string; budget_range:string|null; timeline:string|null; status:string; priority:string; admin_notes:string|null; created_at:string }
export interface Message { id:string; sender_type:'client'|'admin'; message:string; created_at:string; attachment_path:string|null }
export interface AdminService { id:string; name:string; starting_price:number|null; pricing_type:string; is_active:boolean; is_featured:boolean }
const ok = <T,>(r: { data: T | null; error: unknown }): T => { if (r.error) throw r.error; return r.data as T }
export const adminService = {
  async isAdmin() {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return false
    const r = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    return r.data?.role === 'admin'
  },
  async signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error('Wrong email or password.')
  },
  signOut: () => supabase.auth.signOut(),
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
    const ex = await supabase.from('conversations').select('id,access_token').eq('inquiry_id', inquiryId).maybeSingle()
    if (ex.data) return ex.data as { id: string; access_token: string }
    return ok<{ id: string; access_token: string }>(await supabase.from('conversations').insert({ inquiry_id: inquiryId, subject }).select('id,access_token').single())
  },
  async send(conversationId: string, message: string, file?: File | null) {
    let attachment_path: string | null = null
    if (file) {
      attachment_path = `${conversationId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '_')}`
      const up = await supabase.storage.from('attachments').upload(attachment_path, file)
      if (up.error) throw up.error
    }
    ok(await supabase.from('messages').insert({ conversation_id: conversationId, sender_type: 'admin', message, attachment_path }).select('id').single())
  },
  async contentList(t: ContentTable) { return ok<Row[]>(await supabase.from(t).select('*').order('created_at', { ascending: false })) },
  async contentSave(t: ContentTable, row: Row) {
    const r = { ...row }; if (t === 'blog_posts' && r.is_published && !r.published_at) r.published_at = new Date().toISOString()
    ok(await supabase.from(t).upsert(r).select('id').single())
  },
  async contentDelete(t: ContentTable, id: string) { ok(await supabase.from(t).delete().eq('id', id).select('id').single()) },
  async services() { return ok<AdminService[]>(await supabase.from('services').select('id,name,starting_price,pricing_type,is_active,is_featured').order('display_order')) },
  async updateService(id: string, patch: Partial<AdminService>) {
    ok(await supabase.from('services').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select('id').single())
  },
}
