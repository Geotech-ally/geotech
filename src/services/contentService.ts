import { supabase } from '../lib/supabase'
export interface Project { id:string; title:string; slug:string; summary:string; problem:string|null; solution:string|null; result:string|null; technologies:string[] }
export interface Testimonial { id:string; author:string; role:string|null; quote:string }
export const contentService = {
  async projects() { const { data, error } = await supabase.from('projects').select('id,title,slug,summary,problem,solution,result,technologies').eq('is_published', true).order('display_order').order('created_at', { ascending: false }); if (error) throw error; return data as Project[] },
  async testimonials() { const { data, error } = await supabase.from('testimonials').select('id,author,role,quote').eq('is_published', true).order('created_at', { ascending: false }); if (error) throw error; return data as Testimonial[] },
}
export interface PostSummary { id: string; title: string; slug: string; excerpt: string | null; published_at: string | null }
export interface Post extends PostSummary { body: string }
export const blogService = {
  async list() { const { data, error } = await supabase.from('blog_posts').select('id,title,slug,excerpt,published_at').eq('is_published', true).order('published_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }); if (error) throw error; return data as PostSummary[] },
  async get(slug: string) { const { data, error } = await supabase.from('blog_posts').select('id,title,slug,excerpt,body,published_at').eq('slug', slug).eq('is_published', true).maybeSingle(); if (error) throw error; return data as Post | null },
}
