import "server-only";

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseServer, getCurrentContextFromCookies } from "@/lib/supabaseServer";

type ShopOption = { id: string; name: string };
type BranchOption = { id: string; name: string };

export async function GET() {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
        return NextResponse.json({ error: authErr.message }, { status: 500 });
    }

    const user = auth.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();

    const { data: sm, error: smErr } = await admin
        .from("shop_members")
        .select("shop_id, shops(id,name), created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

    if (smErr) return NextResponse.json({ error: smErr.message }, { status: 500 });

    const shops: ShopOption[] = (sm ?? [])
        .map((row) => {
            const shopsObj = (row as { shops: { id: string; name: string } | null }).shops;
            if (!shopsObj?.id) return null;
            return { id: shopsObj.id, name: shopsObj.name ?? shopsObj.id };
        })
        .filter((x): x is ShopOption => x !== null);

    let branches: BranchOption[] = [];

    if (currentShopId) {
        const { data: br, error: brErr } = await admin
            .from("branch")
            .select("id,name,is_primary")
            .eq("shop_id", currentShopId)
            .order("is_primary", { ascending: false })
            .order("name", { ascending: true });

        if (brErr) return NextResponse.json({ error: brErr.message }, { status: 500 });

        branches = (br ?? []).map((b) => ({ id: b.id, name: b.name }));
    }

    return NextResponse.json({
        me: { id: user.id, email: user.email ?? null },
        currentShopId,
        currentBranchId,
        shops,
        branches,
    });
}
