import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { upsertBranchMenuAvailability } from "@/lib/branchMenuAvailability";

export const dynamic = "force-dynamic";

type Body = {
    menu_id?: unknown;
    is_enabled?: unknown;
};

function asString(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asBoolean(v: unknown): boolean | null {
    return typeof v === "boolean" ? v : null;
}

export async function PUT(req: NextRequest) {
    const supabase = await getSupabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();
    if (!currentShopId) {
        return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
    }
    if (!currentBranchId) {
        return NextResponse.json({ error: "No current branch selected" }, { status: 409 });
    }

    let body: Body;
    try {
        body = (await req.json()) as Body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const menuId = asString(body.menu_id);
    const isEnabled = asBoolean(body.is_enabled);
    if (!menuId || isEnabled === null) {
        return NextResponse.json(
            { error: "menu_id(string) and is_enabled(boolean) are required" },
            { status: 400 }
        );
    }

    const { data: member, error: memberErr } = await supabase
        .from("shop_members")
        .select("role")
        .eq("shop_id", currentShopId)
        .eq("user_id", user.id)
        .maybeSingle();

    if (memberErr) {
        return NextResponse.json({ error: memberErr.message }, { status: 500 });
    }
    if (member?.role !== "owner") {
        return NextResponse.json({ error: "Only owner can update availability" }, { status: 403 });
    }

    const { data: menuRow, error: menuErr } = await supabase
        .from("menu")
        .select("id")
        .eq("id", menuId)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (menuErr) return NextResponse.json({ error: menuErr.message }, { status: 500 });
    if (!menuRow?.id) return NextResponse.json({ error: "Menu not found" }, { status: 404 });

    const { data: branchRow, error: branchErr } = await supabase
        .from("branch")
        .select("id")
        .eq("id", currentBranchId)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (branchErr) return NextResponse.json({ error: branchErr.message }, { status: 500 });
    if (!branchRow?.id) {
        return NextResponse.json({ error: "Branch not found in current shop" }, { status: 404 });
    }

    try {
        await upsertBranchMenuAvailability({
            client: supabase,
            branchId: currentBranchId,
            menuId,
            shopId: currentShopId,
            isEnabled,
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to update availability";
        return NextResponse.json({ error: msg }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        menu_id: menuId,
        branch_id: currentBranchId,
        is_enabled: isEnabled,
    });
}
