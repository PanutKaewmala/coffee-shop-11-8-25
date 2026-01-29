// src/app/api/context/branch/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer, getCurrentContextFromCookies } from "@/lib/supabaseServer";

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

    // 1) read current context from cookies
    if (mode !== "pick") {
        return NextResponse.json({ branch_id: currentBranchId ?? null });
    }

    // 2) auto-pick branch in current shop
    // prefer primary first
    const { data: primary, error: pErr } = await supabase
        .from("branch")
        .select("id")
        .eq("shop_id", currentShopId)
        .eq("is_primary", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (pErr) return jsonError(pErr.message, 500);
    if (primary?.id) return NextResponse.json({ mode: "single", branch_id: primary.id });

    // else check count (limit 2 to detect multiple)
    const { data: rows, error } = await supabase
        .from("branch")
        .select("id, created_at")
        .eq("shop_id", currentShopId)
        .order("created_at", { ascending: true })
        .limit(2);

    if (error) return jsonError(error.message, 500);

    if (!rows || rows.length === 0) return NextResponse.json({ mode: "none" });
    if (rows.length === 1) return NextResponse.json({ mode: "single", branch_id: rows[0].id });

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

    const cookieStore = await cookies();

    // null = clear branch cookie
    if (!branchId) {
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
    const { data: br, error: bErr } = await supabase
        .from("branch")
        .select("id, shop_id")
        .eq("id", branchId)
        .maybeSingle();

    if (bErr) return jsonError(bErr.message, 500);
    if (!br) return jsonError("Branch not found", 404);
    if (br.shop_id !== currentShopId) return jsonError("Branch not in current shop", 403);

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
