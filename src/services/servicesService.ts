import { supabase } from '../lib/supabase'
import type { Service } from '../lib/money'
const COLS = 'id,name,slug,short_description,description,category,starting_price,pricing_type,currency,estimated_duration,features,is_featured'
export const servicesService = {
  async list(): Promise<Service[]> {
    const { data, error } = await supabase.from('services').select(COLS).eq('is_active',true).order('display_order')
    if (error) throw error
    return data as Service[]
  },
  async getBySlug(slug: string): Promise<Service | null> {
    const { data, error } = await supabase.from('services').select(COLS).eq('slug',slug).eq('is_active',true).maybeSingle()
    if (error) throw error
    return data as Service | null
  },
}
