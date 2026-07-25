import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
// Экспортируем отдельно — нужен, например, чтобы собрать URL edge-функции вручную
// (redirect на gmail-oauth-start для подключения личного Gmail-ящика пользователя).
export { supabaseUrl }
