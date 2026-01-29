// src/lib/supabaseServer.ts
import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

const SHOP_COOKIE = "current_shop_id";
const BRANCH_COOKIE = "current_branch_id";

export async function getSupabaseServer() {
    const cookieStore = await cookies();

    return createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => cookieStore.getAll(),
                setAll: (cookiesToSet) => {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            cookieStore.set({ name, value, ...options });
                        });
                    } catch {
                        // ignore
                    }
                },
            },
        }
    );
}

export async function getCurrentContextFromCookies(): Promise<{
    currentShopId: string | null;
    currentBranchId: string | null;
}> {
    const cookieStore = await cookies();
    const currentShopId = cookieStore.get(SHOP_COOKIE)?.value ?? null;
    const currentBranchId = cookieStore.get(BRANCH_COOKIE)?.value ?? null;

    return { currentShopId, currentBranchId };
}

/**
 * ✅ identity + current context (ใช้ใน admin layouts)
 */
export async function getServerIdentity(): Promise<{
    user: { id: string; email: string | null } | null;
    currentShopId: string | null;
    currentBranchId: string | null;
}> {
    const supabase = await getSupabaseServer();

    const { data } = await supabase.auth.getUser();
    const u = data.user ?? null;

    const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();

    return {
        user: u ? { id: u.id, email: u.email ?? null } : null,
        currentShopId,
        currentBranchId,
    };
}
