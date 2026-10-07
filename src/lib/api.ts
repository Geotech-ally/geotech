import { supabase } from './supabase'
export async function api<T = Record<string, never>>(action: string, payload: object = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('public-api', { body: { action, ...payload } })
  if (error) throw new Error('Something went wrong. Please try again.')
  if (!data.ok) throw new Error(data.error)
  return data as T
}
