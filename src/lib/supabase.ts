import { createClient } from '@supabase/supabase-js'

function getRequiredEnv(key: string): string {
  const value = import.meta.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}. Check your .env file.`)
  }
  return value
}

export const supabase = createClient(getRequiredEnv('VITE_SUPABASE_URL'), getRequiredEnv('VITE_SUPABASE_ANON_KEY'))
