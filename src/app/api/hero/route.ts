import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolvePublicShopId } from "@/lib/publicShop";

export async function GET(req: NextRequest) {
    const supabase = await getSupabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;

    if (!user) {
        const { shopId, mismatch } = resolvePublicShopId(req.nextUrl.searchParams);
        if (mismatch) {
            return NextResponse.json({ error: "shop_id mismatch" }, { status: 403 });
        }
        if (!shopId) {
            return NextResponse.json(
                { error: "Public shop not configured" },
                { status: 409 }
            );
        }

        const admin = getSupabaseAdmin();
        const { data, error } = await admin
            .from("hero")
            .select("*")
            .eq("shop_id", shopId)
            .limit(1)
            .single();

        if (error) {
            console.error("Hero fetch error:", error);
            return NextResponse.json({ error: "Failed to load hero data" }, { status: 500 });
        }

        return NextResponse.json(data);
    }

    const { data, error } = await supabase.from("hero").select("*").limit(1).single();

    if (error) {
        console.error("Hero fetch error:", error);
        return NextResponse.json({ error: "Failed to load hero data" }, { status: 500 });
    }

    return NextResponse.json(data);
}
