// Somente variáveis públicas (anon key é segura no navegador com RLS ativa).
// A service_role NUNCA é lida aqui — apenas em rotas de servidor (src/app/api).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local (veja .env.example)."
  )
}

export const env = { supabaseUrl, supabaseAnonKey }
