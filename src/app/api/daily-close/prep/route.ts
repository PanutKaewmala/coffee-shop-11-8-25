import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { roundMoney } from "@/lib/dailyCloseMoney";
import { parseDailyCloseRole } from "@/lib/dailyClosePolicy.mjs";

export const dynamic = "force-dynamic";

type DailyCloseQuery = {
    select: (cols: string) => DailyCloseQuery;
    eq: (col: string, val: string | undefined) => DailyCloseQuery;
    maybeSingle: () => Promise<{ data: unknown | null; error: { message: string } | null }>;
    update: (payload: unknown) => DailyCloseUpdateQuery;
};

type DailyCloseUpdateQuery = {
    eq: (col: string, val: string) => DailyCloseUpdateQuery;
    select: (cols: string) => {
        maybeSingle: () => Promise<{ data: unknown | null; error: { message: string } | null }>;
    };
};

type DailyCloseFrom = {
    from: (table: "daily_closes") => DailyCloseQuery;
};

function unexpectedServerError(scope: string, error: unknown) {
    console.error(`[daily-close-prep] ${scope}`, error);
    return NextResponse.json(
        { error: "Unexpected server error", code: "DAILY_CLOSE_PREP_SERVER_ERROR" },
        { status: 500 }
    );
}

function isValidDateKey(value: string | null | undefined): value is string {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
    );
}

function validateCountedCash(value: unknown): number {
    if (value === null || value === undefined) {
        throw new Error("counted_cash must be a number");
    }
    if (typeof value !== "number") {
        throw new Error("counted_cash must be a number");
    }
    if (!Number.isFinite(value)) {
        throw new Error("counted_cash must be a finite number");
    }
    if (value < 0) {
        throw new Error("counted_cash cannot be negative");
    }
    return roundMoney(value);
}

// Staff draft preparation: a current shop member may save only counted_cash, notes, and
// updated_at on a still-draft Daily Close row. System-calculated fields and approval /
// closure fields are never accepted. No broad Staff UPDATE RLS policy is added.
export async function POST(req: NextRequest) {
    try {
        const supabase = await getSupabaseServer();
        const admin = getSupabaseAdmin();
        const dcAdmin = admin as unknown as DailyCloseFrom;
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
        const role = parseDailyCloseRole(membership.role);
        if (!role) return NextResponse.json({ error: "Owner or staff role required", code: "DAILY_CLOSE_ROLE_REQUIRED" }, { status: 403 });

        const body = (await req.json().catch(() => null)) as {
            business_date?: string;
            counted_cash?: number;
            notes?: string;
        } | null;

        if (!body || typeof body !== "object") {
            return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
        }

        const businessDate = body.business_date;
        if (!isValidDateKey(businessDate)) {
            return NextResponse.json(
                { error: "Invalid business_date. Use YYYY-MM-DD." },
                { status: 400 }
            );
        }

        let countedCash: number;
        try {
            countedCash = validateCountedCash(body.counted_cash);
        } catch (validationError) {
            const message = validationError instanceof Error ? validationError.message : "Invalid counted_cash";
            return NextResponse.json({ error: message, code: "INVALID_COUNTED_CASH" }, { status: 400 });
        }
        const notes = typeof body.notes === "string" ? body.notes.trim() : undefined;

        const { data: existing, error: existingError } = await dcAdmin
            .from("daily_closes")
            .select("*")
            .eq("shop_id", currentShopId)
            .eq("branch_id", currentBranchId)
            .eq("business_date", businessDate)
            .maybeSingle();

        if (existingError) {
            return unexpectedServerError("existing_lookup_failed", existingError);
        }
        if (!existing) {
            return NextResponse.json({ error: "Daily close not found" }, { status: 404 });
        }

        const existingRecord = existing as Record<string, unknown>;
        if (existingRecord.status !== "draft") {
            return NextResponse.json(
                { error: "Can only prepare a draft daily close" },
                { status: 409 }
            );
        }

        const updatePayload: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        };
        updatePayload.counted_cash = countedCash;
        if (notes !== undefined) updatePayload.notes = notes;

        const { data: updated, error: updateError } = await dcAdmin
            .from("daily_closes")
            .update(updatePayload)
            .eq("id", existingRecord.id as string)
            .eq("shop_id", currentShopId)
            .eq("branch_id", currentBranchId)
            .eq("business_date", businessDate)
            .eq("status", "draft")
            .select("*")
            .maybeSingle();

        if (updateError) return unexpectedServerError("update_failed", updateError);
        if (!updated) {
            return NextResponse.json({ error: "Can only prepare a draft daily close", code: "DAILY_CLOSE_NOT_DRAFT" }, { status: 409 });
        }

        const row = updated as Record<string, unknown>;
        return NextResponse.json({
            date: businessDate,
            context: { shopId: currentShopId, branchId: currentBranchId },
            close: {
                ...row,
                counted_cash: row.counted_cash ?? null,
                cash_difference: row.cash_difference ?? null,
                closed_by: row.closed_by ?? null,
                closed_at: row.closed_at ?? null,
                approved_by: row.approved_by ?? null,
                approved_at: row.approved_at ?? null,
                notes: row.notes ?? null,
            },
        });
    } catch (error: unknown) {
        return unexpectedServerError("unexpected", error);
    }
}
