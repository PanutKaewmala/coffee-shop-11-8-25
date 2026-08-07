import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { applyFinalizedDailyCloseSnapshot, computeDailyCloseReport } from "@/lib/dailyCloseReport";
import { parseDailyCloseRole } from "@/lib/dailyClosePolicy.mjs";

export const dynamic = "force-dynamic";

function unexpectedServerError(scope: string, error: unknown) {
    console.error(`[daily-close-report] ${scope}`, error);
    return NextResponse.json({ error: "Unexpected server error", code: "DAILY_CLOSE_REPORT_SERVER_ERROR" }, { status: 500 });
}

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

        if (authError) return unexpectedServerError("auth_failed", authError);
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

        if (membershipError) return unexpectedServerError("membership_failed", membershipError);
        if (!membership) {
            return NextResponse.json({ error: "Not a member of current shop" }, { status: 403 });
        }
        if (!parseDailyCloseRole(membership.role)) {
            return NextResponse.json({ error: "Owner or staff role required", code: "DAILY_CLOSE_ROLE_REQUIRED" }, { status: 403 });
        }

        const report = await computeDailyCloseReport(admin, currentShopId, currentBranchId, businessDate);
        const { data: finalized, error: finalizedError } = await admin
            .from("daily_closes" as never)
            .select("status,net_sales,cash_sales,promptpay_sales,unknown_payment_sales,paid_order_count")
            .eq("shop_id", currentShopId)
            .eq("branch_id", currentBranchId)
            .eq("business_date", businessDate)
            .in("status", ["closed", "approved"])
            .maybeSingle();
        if (finalizedError) return unexpectedServerError("finalized_snapshot_failed", finalizedError);

        if (finalized) {
            const row = finalized as unknown as {
                net_sales: number; cash_sales: number; promptpay_sales: number;
                unknown_payment_sales: number; paid_order_count: number;
            };
            return NextResponse.json(applyFinalizedDailyCloseSnapshot(report, row));
        }

        return NextResponse.json(report);
    } catch (error: unknown) {
        return unexpectedServerError("unexpected", error);
    }
}
