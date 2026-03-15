// app/api/branch/primary/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer, getCurrentContextFromCookies } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolvePublicShopId } from "@/lib/publicShop";

function jsonError(message: string, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

/* ---------------------------------------
   GET primary branch (in current shop)
---------------------------------------- */
export async function GET(req: NextRequest) {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();

    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) {
        const { shopId, mismatch } = resolvePublicShopId(req.nextUrl.searchParams);
        if (mismatch) return jsonError("shop_id mismatch", 403);
        if (!shopId) return jsonError("Public shop not configured", 409);

        const { data, error } = await admin
            .from("branch")
            .select("*")
            .eq("shop_id", shopId)
            .eq("is_primary", true)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

        if (error) return jsonError(error.message, 500);

        return NextResponse.json({ ok: true, data: data ?? null });
    }

    const { currentShopId } = await getCurrentContextFromCookies();
    if (!currentShopId) return jsonError("No current shop selected", 409);

    // verify membership (any role can read)
    const { data: member, error: mErr } = await admin
        .from("shop_members")
        .select("shop_id")
        .eq("user_id", user.id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (mErr) return jsonError(mErr.message, 500);
    if (!member) return jsonError("Not a member of current shop", 403);

    const { data, error } = await admin
        .from("branch")
        .select("*")
        .eq("shop_id", currentShopId)
        .eq("is_primary", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) return jsonError(error.message, 500);

    // ถ้าไม่มี primary ก็คืน null (ให้ client/flow ไปเลือกเอง)
    return NextResponse.json({ ok: true, data: data ?? null });
}

/* ---------------------------------------
   PUT - Set new primary branch (in current shop)
   Query: ?id=<branchId>
---------------------------------------- */
export async function PUT(req: NextRequest) {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();

    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return jsonError("Unauthorized", 401);

    const { currentShopId } = await getCurrentContextFromCookies();
    if (!currentShopId) return jsonError("No current shop selected", 409);

    const id = req.nextUrl.searchParams.get("id")?.trim();
    if (!id) return jsonError("Missing id", 400);

    // verify membership + role (owner only to change primary)
    const { data: member, error: mErr } = await admin
        .from("shop_members")
        .select("shop_id, role")
        .eq("user_id", user.id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (mErr) return jsonError(mErr.message, 500);
    if (!member) return jsonError("Not a member of current shop", 403);
    if (member.role !== "owner") return jsonError("Owner only", 403);

    // verify branch belongs to current shop
    const { data: br, error: bErr } = await admin
        .from("branch")
        .select("id, shop_id, is_primary")
        .eq("id", id)
        .maybeSingle();

    if (bErr) return jsonError(bErr.message, 500);
    if (!br) return jsonError("Branch not found", 404);
    if (br.shop_id !== currentShopId) return jsonError("Branch not in current shop", 403);

    // If already primary -> return quickly
    if (br.is_primary === true) {
        const { data: current, error: curErr } = await admin
            .from("branch")
            .select("*")
            .eq("id", id)
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (curErr) return jsonError(curErr.message, 500);
        return NextResponse.json({ ok: true, data: current ?? null });
    }

    // 1) Reset primary within current shop ONLY
    const { error: resetError } = await admin
        .from("branch")
        .update({ is_primary: false })
        .eq("shop_id", currentShopId)
        .neq("id", id);

    if (resetError) return jsonError(resetError.message, 500);

    // 2) Set primary for selected branch within current shop ONLY
    const { data, error } = await admin
        .from("branch")
        .update({ is_primary: true })
        .eq("id", id)
        .eq("shop_id", currentShopId)
        .select("*")
        .single();

    if (error) {
        if (error.message.includes("branch_one_primary_idx")) {
            return jsonError(
                "Primary branch index is not scoped per shop. Run latest branch-primary migration.",
                409
            );
        }
        return jsonError(error.message, 500);
    }

    return NextResponse.json({ ok: true, data }, { status: 200 });
}
