import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type CloseStatus = "closed" | "approved" | null;

export interface DailyCloseGuardResult {
    blocked: boolean;
    businessDate: string;
    closeStatus: CloseStatus;
}

type DailyCloseQuery = {
    select: (cols: string) => DailyCloseQuery;
    eq: (col: string, val: string | undefined) => DailyCloseQuery;
    maybeSingle: () => Promise<{ data: { status?: string | null } | null; error: { message: string } | null }>;
};

type DailyCloseFrom = {
    from: (table: "daily_closes") => DailyCloseQuery;
};

function getBangkokToday(): string {
    return new Date().toLocaleDateString("sv-SE", {
        timeZone: "Asia/Bangkok",
    });
}

export async function checkDailyClose(
    shopId: string,
    branchId: string,
    businessDate?: string
): Promise<DailyCloseGuardResult> {
    const date = businessDate ?? getBangkokToday();
    const admin = getSupabaseAdmin();
    const dcAdmin = admin as unknown as DailyCloseFrom;

    const { data, error } = await dcAdmin
        .from("daily_closes")
        .select("status")
        .eq("shop_id", shopId)
        .eq("branch_id", branchId)
        .eq("business_date", date)
        .maybeSingle();

    if (error) {
        console.error("[dailyCloseGuard] query failed:", error.message);
        return { blocked: false, businessDate: date, closeStatus: null };
    }

    const status = data?.status ?? null;
    const blocked = status === "closed" || status === "approved";

    return {
        blocked,
        businessDate: date,
        closeStatus: blocked ? (status as "closed" | "approved") : null,
    };
}
