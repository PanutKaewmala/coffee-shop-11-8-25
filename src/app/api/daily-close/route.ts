import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { computeDailyCloseReport, computeSnapshotFromReport } from "@/lib/dailyCloseReport";

export const dynamic = "force-dynamic";

type DailyCloseQuery = {
    select: (cols: string) => DailyCloseQuery;
    eq: (col: string, val: string) => DailyCloseQuery;
    maybeSingle: () => Promise<{ data: unknown | null; error: { message: string } | null }>;
    insert: (payload: unknown) => {
        select: (cols: string) => {
            single: () => Promise<{ data: unknown | null; error: { message: string } | null }>;
        };
    };
};

type DailyCloseFrom = {
    from: (table: "daily_closes") => DailyCloseQuery;
};

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

function toMoney(value: unknown): number {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n) || n < 0) {
        throw new Error("Must be a non-negative finite number");
    }
    return Math.round(n * 100) / 100;
}

export async function GET(req: NextRequest) {
    try {
        const date = req.nextUrl.searchParams.get("date");
        if (!isValidDateKey(date)) {
            return NextResponse.json(
                { error: "Invalid date. Use YYYY-MM-DD." },
                { status: 400 }
            );
        }

        const supabase = await getSupabaseServer();
        const admin = getSupabaseAdmin();
        const dcAdmin = admin as unknown as DailyCloseFrom;
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

        const { data: close, error: closeError } = await dcAdmin
            .from("daily_closes")
            .select("*")
            .eq("shop_id", currentShopId)
            .eq("branch_id", currentBranchId)
            .eq("business_date", date)
            .maybeSingle();

        if (closeError) {
            return NextResponse.json({ error: (closeError as { message: string }).message }, { status: 500 });
        }

        return NextResponse.json({
            date,
            context: { shopId: currentShopId, branchId: currentBranchId },
            close: close
                ? {
                      ...close,
                      counted_cash: (close as Record<string, unknown>).counted_cash ?? null,
                      cash_difference: (close as Record<string, unknown>).cash_difference ?? null,
                      closed_by: (close as Record<string, unknown>).closed_by ?? null,
                      closed_at: (close as Record<string, unknown>).closed_at ?? null,
                      approved_by: (close as Record<string, unknown>).approved_by ?? null,
                      approved_at: (close as Record<string, unknown>).approved_at ?? null,
                      notes: (close as Record<string, unknown>).notes ?? null,
                  }
                : null,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to load daily close";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await getSupabaseServer();
        const admin = getSupabaseAdmin();
        const dcAdmin = admin as unknown as DailyCloseFrom;
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

        const body = (await req.json().catch(() => null)) as {
            business_date?: string;
            opening_cash_float?: number;
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

        const openingCashFloat = toMoney(body.opening_cash_float ?? 0);
        const countedCash = body.counted_cash !== undefined ? toMoney(body.counted_cash) : null;
        const notes = typeof body.notes === "string" ? body.notes.trim() : null;

        const { data: existing, error: existingError } = await dcAdmin
            .from("daily_closes")
            .select("id")
            .eq("shop_id", currentShopId)
            .eq("branch_id", currentBranchId)
            .eq("business_date", businessDate)
            .maybeSingle();

        if (existingError) {
            return NextResponse.json({ error: (existingError as { message: string }).message }, { status: 500 });
        }
        if (existing) {
            return NextResponse.json(
                { error: "Daily close already exists for this branch and date. Fetch it instead." },
                { status: 409 }
            );
        }

        const report = await computeDailyCloseReport(admin, currentShopId, currentBranchId, businessDate);
        const snapshot = computeSnapshotFromReport(report);

        const payload = {
            shop_id: currentShopId,
            branch_id: currentBranchId,
            business_date: businessDate,
            opening_cash_float: openingCashFloat,
            counted_cash: countedCash,
            ...snapshot,
            cash_difference: countedCash !== null ? countedCash - snapshot.expected_cash : null,
            notes,
            status: "draft",
            closed_by: null,
            closed_at: null,
            approved_by: null,
            approved_at: null,
        };

        const { data: inserted, error: insertError } = await dcAdmin
            .from("daily_closes")
            .insert(payload)
            .select("*")
            .single();

        if (insertError) {
            return NextResponse.json({ error: (insertError as { message: string }).message }, { status: 500 });
        }

        return NextResponse.json(
            {
                date: businessDate,
                context: { shopId: currentShopId, branchId: currentBranchId },
                close: inserted,
            },
            { status: 201 }
        );
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to create daily close";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

