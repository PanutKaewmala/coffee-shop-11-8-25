import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ✅ สำหรับฝั่ง Client Components (frontend, Navbar, etc.)
export const supabase = createClient(supabaseUrl, supabaseKey);

// ✅ สำหรับฝั่ง Server (API routes, server actions, etc.)
export const getSupabaseServer = () => {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return createClient(supabaseUrl, serviceKey);
};
