import "server-only";

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { contextSelectorPath, safeInternalPath } from "@/lib/accessPolicy.mjs";
import { contextMutationOutcome, resolveBranchContext, resolveShopContext } from "@/lib/contextPolicy.mjs";

const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };

export async function GET(request: Request) {
    const next = safeInternalPath(new URL(request.url).searchParams.get("next"), "/admin");
    const supabase = await getSupabaseServer();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) return serverError("Unable to verify session");
    if (!auth.user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, request.url));

    const admin = getSupabaseAdmin();
    const { data: memberships, error: membershipError } = await admin.from("shop_members").select("shop_id,role,created_at").eq("user_id", auth.user.id).order("created_at");
    if (!contextMutationOutcome({ sourceError: Boolean(membershipError) }).ok) return serverError("Unable to resolve shop access");
    const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();
    const shop = resolveShopContext((memberships ?? []).map((row) => ({ shopId: row.shop_id })), currentShopId);
    if (shop.action === "no-access") return clearAndRedirect(request, "/no-access", auth.user.id, null, null);
    if (shop.action === "select-shop") return clearAndRedirect(request, contextSelectorPath("shop", next), auth.user.id, null, null);

    const shopId = shop.shopId;
    const membership = memberships?.find((row) => row.shop_id === shopId);
    if (!membership || (membership.role !== "owner" && membership.role !== "staff")) {
        return clearAndRedirect(request, "/no-access", auth.user.id, null, null);
    }
    const { data: branches, error: branchError } = await admin.from("branch").select("id,is_primary,created_at").eq("shop_id", shopId).order("created_at");
    if (!contextMutationOutcome({ sourceError: Boolean(branchError) }).ok) return serverError("Unable to resolve branch context");
    const branch = resolveBranchContext((branches ?? []).map((row) => ({ id: row.id, isPrimary: row.is_primary })), currentBranchId, membership.role);
    const branchId = branch.action === "keep" || branch.action === "select" ? branch.branchId : null;
    const href = branchId ? next : contextSelectorPath("branch", next);
    return clearAndRedirect(request, href, auth.user.id, shopId, branchId);
}

async function clearAndRedirect(request: Request, href: string, userId: string, shopId: string | null, branchId: string | null) {
    const { error: profileError } = await getSupabaseAdmin().from("profiles").update({ current_shop_id: shopId, current_branch_id: branchId }).eq("id", userId);
    if (!contextMutationOutcome({ profileError: Boolean(profileError) }).ok) return serverError("Unable to persist context");
    const response = NextResponse.redirect(new URL(href, request.url));
    response.cookies.set({ name: "current_shop_id", value: shopId ?? "", ...cookieOptions, maxAge: shopId ? 60 * 60 * 24 * 30 : 0 });
    response.cookies.set({ name: "current_branch_id", value: branchId ?? "", ...cookieOptions, maxAge: branchId ? 60 * 60 * 24 * 30 : 0 });
    return response;
}

function serverError(message: string) {
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
}
