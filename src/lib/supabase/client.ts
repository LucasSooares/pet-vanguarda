import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "@/lib/database.types"
import { env } from "@/lib/env"

let client: ReturnType<typeof createBrowserClient<Database>> | undefined

export function getSupabase() {
  client ??= createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey)
  return client
}
