// src/lib/supabaseServer.ts
import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Database } from "@/lib/database.types";
import { parseAppRole } from "@/lib/accessPolicy.mjs";

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
export type CurrentShopRole = "owner" | "staff";

export async function getServerIdentity(): Promise<{
    user: { id: string; email: string | null } | null;
    currentShopId: string | null;
    currentBranchId: string | null;
    currentShopRole: CurrentShopRole | null;
    hasAnyShopMembership: boolean;
}> {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();

    const { data } = await supabase.auth.getUser();
    const u = data.user ?? null;

    const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();

    let effectiveShopId: string | null = currentShopId;
    let effectiveBranchId: string | null = currentBranchId;
    let currentShopRole: CurrentShopRole | null = null;
    let hasAnyShopMembership = false;

    // Validate context cookies against current user membership.
    if (u && effectiveShopId) {
        const { data: member, error: mErr } = await admin
            .from("shop_members")
            .select("shop_id, role")
            .eq("user_id", u.id)
            .eq("shop_id", effectiveShopId)
            .maybeSingle();

        if (mErr || !member) {
            effectiveShopId = null;
            effectiveBranchId = null;
        } else {
            hasAnyShopMembership = true;
            currentShopRole = parseAppRole(member.role);
        }
    }

    if (u && !hasAnyShopMembership) {
        const { data: anyMembership } = await admin
            .from("shop_members")
            .select("shop_id")
            .eq("user_id", u.id)
            .limit(1)
            .maybeSingle();
        hasAnyShopMembership = Boolean(anyMembership);
    }

    if (u && effectiveShopId && effectiveBranchId) {
        const { data: br, error: bErr } = await admin
            .from("branch")
            .select("id, shop_id")
            .eq("id", effectiveBranchId)
            .maybeSingle();

        if (bErr || !br || br.shop_id !== effectiveShopId) {
            effectiveBranchId = null;
        }
    }

    return {
        user: u ? { id: u.id, email: u.email ?? null } : null,
        currentShopId: effectiveShopId,
        currentBranchId: effectiveBranchId,
        currentShopRole,
        hasAnyShopMembership,
    };
}
