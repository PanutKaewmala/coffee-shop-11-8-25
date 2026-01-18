import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(supabaseUrl, anonKey);

export const getSupabaseServer = () => {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return createClient<Database>(supabaseUrl, serviceKey);
};
