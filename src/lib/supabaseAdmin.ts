// src/lib/supabaseAdmin.ts
import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Service-role client (bypasses RLS). Use ONLY in server routes after
 * verifying user + membership/authorization.
 */
export function getSupabaseAdmin() {
    return createServerClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
        cookies: {
            getAll: () => [],
            setAll: () => {},
        },
    });
}
