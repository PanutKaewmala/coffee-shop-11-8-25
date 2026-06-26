import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { computeDailyCloseReport } from "@/lib/dailyCloseReport";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const date = req.nextUrl.searchParams.get("date");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
            return NextResponse.json(
                { error: "Invalid date. Use YYYY-MM-DD." },
                { status: 400 }
            );
        }

        const businessDate = date!;

        const supabase = await getSupabaseServer();
        const admin = getSupabaseAdmin();
        const { data: auth, error: authError } = await supabase.auth.getUser();

        if (authError) {
            return NextResponse.json({ error: authError.message }, { status: 500 });
        }
        if (!auth.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();
        if (!currentShopId) {
            return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
        }
        if (!currentBranchId) {
            return NextResponse.json({ error: "No current branch selected" }, { status: 409 });
        }

        const { data: membership, error: membershipError } = await admin
            .from("shop_members")
            .select("role")
            .eq("user_id", auth.user.id)
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (membershipError) {
            return NextResponse.json({ error: membershipError.message }, { status: 500 });
        }
        if (!membership) {
            return NextResponse.json({ error: "Not a member of current shop" }, { status: 403 });
        }

        const report = await computeDailyCloseReport(admin, currentShopId, currentBranchId, businessDate);

        return NextResponse.json(report);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to load daily close report";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
