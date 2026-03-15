import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type UUID = string;

function isUUID(s: string | null): s is UUID {
    return !!s && s.length >= 16;
}

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id?: string }> }
) {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
    if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();
    if (!currentShopId) {
        return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
    }
    if (!currentBranchId) {
        return NextResponse.json({ error: "No current branch selected" }, { status: 409 });
    }

    const { data: member, error: mErr } = await admin
        .from("shop_members")
        .select("role")
        .eq("user_id", auth.user.id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    if (!member) return NextResponse.json({ error: "Not a member of current shop" }, { status: 403 });

    const { id } = await params;
    const rawId = (id ?? "").trim();

    if (!isUUID(rawId)) {
        return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const { data, error } = await admin
        .from("ingredients")
        .select("id,name,stock,min_stock,base_unit,unit,updated_at,category,is_active,archived_at")
        .eq("id", rawId)
        .eq("shop_id", currentShopId)
        .filter("branch_id", "eq", currentBranchId)
        .maybeSingle();

    if (error) {
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }

    if (!data) {
        return NextResponse.json(
            { error: "Not found" },
            { status: 404 }
        );
    }

    return NextResponse.json({ ingredient: data });
}
