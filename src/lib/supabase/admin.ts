if (typeof window !== "undefined") {
  throw new Error("admin.ts can only be used on the server (Server Actions, Route Handlers, Server Components). Import it only from files with \"use server\" or server components.")
}

import { createClient } from "@supabase/supabase-js"

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}
