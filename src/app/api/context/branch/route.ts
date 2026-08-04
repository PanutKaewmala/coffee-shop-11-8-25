// src/app/api/context/branch/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer, getCurrentContextFromCookies } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveBranchContext } from "@/lib/contextPolicy.mjs";

type Body = { branch_id?: string | null };

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

    const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();
    if (!currentShopId) return jsonError("No current shop selected", 409);

    // Validate cookie shop against membership.
    const { data: member, error: mErr } = await supabase
        .from("shop_members")
        .select("shop_id")
        .eq("user_id", user.id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (mErr) return jsonError(mErr.message, 500);

    if (!member) {
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

        if (mode !== "pick") return NextResponse.json({ branch_id: null });
        return NextResponse.json({ mode: "none" });
    }

    const admin = getSupabaseAdmin();

    // 1) read current context from cookies
    if (mode !== "pick") {
        if (!currentBranchId) {
            return NextResponse.json({ branch_id: null });
        }

        // Validate cookie branch belongs to current shop.
        const { data: br, error: bErr } = await admin
            .from("branch")
            .select("id, shop_id")
            .eq("id", currentBranchId)
            .maybeSingle();

        if (bErr) return jsonError(bErr.message, 500);

        if (!br || br.shop_id !== currentShopId) {
            await admin.from("profiles").update({ current_branch_id: null }).eq("id", user.id);
            const cookieStore = await cookies();
            cookieStore.set({
                name: "current_branch_id",
                value: "",
                httpOnly: true,
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                path: "/",
                maxAge: 0,
            });
            return NextResponse.json({ branch_id: null });
        }

        return NextResponse.json({ branch_id: currentBranchId });
    }

    const { data: rows, error } = await admin
        .from("branch")
        .select("id,is_primary,created_at")
        .eq("shop_id", currentShopId)
        .order("created_at", { ascending: true })
        .limit(50);

    if (error) return jsonError(error.message, 500);

    const decision = resolveBranchContext((rows ?? []).map((row) => ({ id: row.id, isPrimary: row.is_primary })), null, null);
    if (decision.action === "select") return NextResponse.json({ mode: "single", branch_id: decision.branchId });
    if (decision.action === "select-branch") return NextResponse.json({ mode: "multiple" });
    return NextResponse.json({ mode: "none" });
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

    const branchId = body.branch_id ?? null;

    // ✅ ต้องมี current_shop_id ก่อน
    const { currentShopId } = await getCurrentContextFromCookies();
    if (!currentShopId) return jsonError("No current shop selected", 409);

    // ✅ verify membership in current shop
    const { data: member, error: mErr } = await supabase
        .from("shop_members")
        .select("shop_id")
        .eq("user_id", user.id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (mErr) return jsonError(mErr.message, 500);
    if (!member) return jsonError("Not a member of current shop", 403);

    const admin = getSupabaseAdmin();
    const cookieStore = await cookies();

    // null = clear branch cookie
    if (!branchId) {
        const { error: profileErr } = await admin
            .from("profiles")
            .update({ current_branch_id: null })
            .eq("id", user.id);

        if (profileErr) return jsonError(profileErr.message, 500);

        cookieStore.set({
            name: "current_branch_id",
            value: "",
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 0,
        });
        return NextResponse.json({ ok: true });
    }

    // ✅ verify branch belongs to current shop
    const { data: br, error: bErr } = await admin
        .from("branch")
        .select("id, shop_id")
        .eq("id", branchId)
        .maybeSingle();

    if (bErr) return jsonError(bErr.message, 500);
    if (!br) return jsonError("Branch not found", 404);
    if (br.shop_id !== currentShopId) return jsonError("Branch not in current shop", 403);

    const { error: profileErr } = await admin
        .from("profiles")
        .update({
            current_shop_id: currentShopId,
            current_branch_id: branchId,
        })
        .eq("id", user.id);

    if (profileErr) return jsonError(profileErr.message, 500);

    // ✅ set cookie
    cookieStore.set({
        name: "current_branch_id",
        value: branchId,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
    });

    return NextResponse.json({ ok: true });
}
