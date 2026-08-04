import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { safeInternalPath } from "@/lib/accessPolicy.mjs";
import { shopSwitchPlan } from "@/lib/contextPolicy.mjs";

type Body = { shop_id?: string; next?: string };

function jsonError(message: string, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: Request) {
    const supabase = await getSupabaseServer();

    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return jsonError("Unauthorized", 401);

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode");

    if (mode !== "pick") {
        const { currentShopId } = await getCurrentContextFromCookies();
        if (!currentShopId) {
            return NextResponse.json({ shop_id: null });
        }

        const { data: member, error: mErr } = await supabase
            .from("shop_members")
            .select("shop_id")
            .eq("user_id", user.id)
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (mErr) return jsonError(mErr.message, 500);

        if (!member) {
            const { error: profileErr } = await getSupabaseAdmin().from("profiles").update({ current_shop_id: null, current_branch_id: null }).eq("id", user.id);
            if (profileErr) return jsonError(profileErr.message, 500);
            const cookieStore = await cookies();
            cookieStore.set({
                name: "current_shop_id",
                value: "",
                httpOnly: true,
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                path: "/",
                maxAge: 0,
            });
            cookieStore.set({
                name: "current_branch_id",
                value: "",
                httpOnly: true,
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                path: "/",
                maxAge: 0,
            });
            return NextResponse.json({ shop_id: null });
        }

        return NextResponse.json({ shop_id: currentShopId });
    }

    const { data: rows, error } = await supabase
        .from("shop_members")
        .select("shop_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(2);

    if (error) return jsonError(error.message, 500);

    if (!rows || rows.length === 0) return NextResponse.json({ mode: "none" });
    if (rows.length === 1) return NextResponse.json({ mode: "single", shop_id: rows[0].shop_id });

    return NextResponse.json({ mode: "multiple" });
}

export async function POST(req: Request) {
    const supabase = await getSupabaseServer();

    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return jsonError("Unauthorized", 401);

    let body: Body;
    try {
        body = (await req.json()) as Body;
    } catch {
        return jsonError("Invalid JSON body");
    }

    const shopId = body.shop_id?.trim();
    if (!shopId) return jsonError("shop_id is required");

    const { data: member, error: mErr } = await supabase
        .from("shop_members")
        .select("shop_id")
        .eq("user_id", user.id)
        .eq("shop_id", shopId)
        .maybeSingle();

    if (mErr) return jsonError(mErr.message, 500);
    if (!member) return jsonError("Not a member of this shop", 403);

    const admin = getSupabaseAdmin();
    const { data: branchRows, error: branchErr } = await admin
        .from("branch")
        .select("id,is_primary,created_at")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: true });
    if (branchErr) return jsonError(branchErr.message, 500);

    const plan = shopSwitchPlan(
        (branchRows ?? []).map((branch) => ({ id: branch.id, isPrimary: branch.is_primary })),
        safeInternalPath(body.next, "/admin"),
        null
    );
    const selectedBranchId = plan.branch.action === "select" ? plan.branch.branchId : null;
    const { error: profileErr } = await admin
        .from("profiles")
        .update({
            current_shop_id: shopId,
            current_branch_id: selectedBranchId,
        })
        .eq("id", user.id);

    if (profileErr) return jsonError(profileErr.message, 500);

    const cookieStore = await cookies();
    cookieStore.set({
        name: "current_shop_id",
        value: shopId,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
    });

    cookieStore.set(selectedBranchId ? {
        name: "current_branch_id", value: selectedBranchId, httpOnly: true, sameSite: "lax",
        secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30,
    } : {
        name: "current_branch_id", value: "", httpOnly: true, sameSite: "lax",
        secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0,
    });

    return NextResponse.json({ ok: true, branch_id: selectedBranchId, href: plan.href, context_ready: plan.readyToReloadDestination });
}
