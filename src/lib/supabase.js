import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://crfccsmymyzdbtlwwrzf.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyZmNjc215bXl6ZGJ0bHd3cnpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTIxMjksImV4cCI6MjA5MTE4ODEyOX0.D8LH-lDI8iV-aMzUvCJiGHGJRIZxjWPPUKaxQ1YwV_s'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
