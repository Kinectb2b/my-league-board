import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Create .env at project root with ' +
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. See .env.example.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
