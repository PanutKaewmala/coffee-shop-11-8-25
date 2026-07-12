import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { computeDailyCloseReport, computeSnapshotFromReport } from "@/lib/dailyCloseReport";
import { roundMoney } from "@/lib/dailyCloseMoney";

export const dynamic = "force-dynamic";

type DailyCloseQuery = {
     select: (cols: string) => DailyCloseQuery;
     eq: (col: string, val: string | undefined) => DailyCloseQuery;
     in: (col: string, values: string[]) => DailyCloseQuery;
     order: (col: string, opts: { ascending: boolean }) => DailyCloseQuery;
     limit: (count: number) => DailyCloseQuery;
     maybeSingle: () => Promise<{ data: unknown | null; error: { message: string } | null }>;
     insert: (payload: unknown) => {
         select: (cols: string) => {
             single: () => Promise<{ data: unknown | null; error: { message: string } | null }>;
         };
     };
     update: (payload: unknown) => {
         eq: (col: string, val: string | undefined) => {
             select: (cols: string) => {
                 single: () => Promise<{ data: unknown | null; error: { message: string } | null }>;
             };
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
    return roundMoney(n);
}

function validateCountedCash(value: unknown): number {
    if (value === null || value === undefined) {
        throw new Error("counted_cash is required");
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

async function assertBranchBelongsToShop(
    admin: ReturnType<typeof getSupabaseAdmin>,
    shopId: string,
    branchId: string
): Promise<void> {
    const { data, error } = await admin
        .from("branch")
        .select("id")
        .eq("id", branchId)
        .eq("shop_id", shopId)
        .maybeSingle();
    if (error) {
        throw new Error(error.message);
    }
    if (!data) {
        throw new Error("Branch does not belong to the current shop");
    }
}

export async function GET(req: NextRequest) {
    try {
        const historyParam = req.nextUrl.searchParams.get("history");
        const limitParam = req.nextUrl.searchParams.get("limit");
        const date = req.nextUrl.searchParams.get("date");

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

        if (historyParam === "1") {
            const parsedLimit = limitParam ? parseInt(limitParam, 10) : 14;
            const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 30) : 14;

            const historyResult = (await (dcAdmin
                .from("daily_closes")
                .select(
                    "business_date,status,gross_sales,paid_order_count,expected_cash,counted_cash,cash_difference,closed_at"
                )
                .eq("shop_id", currentShopId)
                .eq("branch_id", currentBranchId)
                .in("status", ["closed", "approved"])
                .order("business_date", { ascending: false })
                .limit(limit) as unknown)) as { data: Array<Record<string, unknown>> | null; error: { message: string } | null };

            const { data: history, error: historyError } = historyResult;

            if (historyError) {
                return NextResponse.json({ error: (historyError as { message: string }).message }, { status: 500 });
            }

            const rows = (history ?? []).map((row) => ({
                business_date: row.business_date,
                status: row.status,
                gross_sales: row.gross_sales,
                paid_order_count: row.paid_order_count,
                expected_cash: row.expected_cash,
                counted_cash: row.counted_cash ?? null,
                cash_difference: row.cash_difference ?? null,
                closed_at: row.closed_at,
            }));

            return NextResponse.json({
                context: { shopId: currentShopId, branchId: currentBranchId },
                role: membership.role,
                permissions: { canFinalize: membership.role === "owner" },
                history: rows,
            });
        }

        if (!isValidDateKey(date)) {
            return NextResponse.json(
                { error: "Invalid date. Use YYYY-MM-DD." },
                { status: 400 }
            );
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
            role: membership.role,
            permissions: { canFinalize: membership.role === "owner" },
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
        const snapshot = computeSnapshotFromReport(report, openingCashFloat);

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

 export async function PATCH(req: NextRequest) {
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
         if (membership.role !== "owner") {
             return NextResponse.json({ error: "Only owners can close daily close" }, { status: 403 });
         }

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
            const message = validationError instanceof Error ? validationError.message : "counted_cash is required";
            return NextResponse.json({ error: message }, { status: 400 });
        }

        const notes = typeof body.notes === "string" ? body.notes.trim() : null;

         const { data: existing, error: existingError } = await dcAdmin
             .from("daily_closes")
             .select("*")
             .eq("shop_id", currentShopId)
             .eq("branch_id", currentBranchId)
             .eq("business_date", businessDate)
             .maybeSingle();

         if (existingError) {
             return NextResponse.json({ error: (existingError as { message: string }).message }, { status: 500 });
         }
         if (!existing) {
             return NextResponse.json({ error: "Daily close not found" }, { status: 404 });
         }

        const existingRecord = existing as Record<string, unknown>;
        if (existingRecord.status !== "draft") {
            return NextResponse.json(
                { error: "Can only close a draft daily close" },
                { status: 409 }
            );
        }

        await assertBranchBelongsToShop(admin, currentShopId, currentBranchId);

        const openingCashFloat = Number(existingRecord.opening_cash_float) || 0;
        const report = await computeDailyCloseReport(admin, currentShopId, currentBranchId, businessDate);
        const snapshot = computeSnapshotFromReport(report, openingCashFloat);
        const expectedCash = snapshot.expected_cash;
        const cashDifference = countedCash - expectedCash;

         const updatePayload = {
             status: "closed",
             counted_cash: countedCash,
             expected_cash: expectedCash,
             cash_difference: cashDifference,
             closed_by: auth.user.id,
             closed_at: new Date().toISOString(),
             notes,
             gross_sales: snapshot.gross_sales,
             net_sales: snapshot.net_sales,
             cash_sales: snapshot.cash_sales,
             promptpay_sales: snapshot.promptpay_sales,
             unknown_payment_sales: snapshot.unknown_payment_sales,
             paid_order_count: snapshot.paid_order_count,
             cancelled_order_count: snapshot.cancelled_order_count,
             refunded_order_count: snapshot.refunded_order_count,
             void_order_count: snapshot.void_order_count,
         };

         const { data: updated, error: updateError } = await dcAdmin
             .from("daily_closes")
             .update(updatePayload)
             .eq("id", existingRecord.id as string)
             .select("*")
             .single();

         if (updateError) {
             return NextResponse.json({ error: (updateError as { message: string }).message }, { status: 500 });
         }

         return NextResponse.json({
             date: businessDate,
             context: { shopId: currentShopId, branchId: currentBranchId },
             close: updated,
         });
     } catch (error: unknown) {
         const message = error instanceof Error ? error.message : "Failed to close daily close";
         return NextResponse.json({ error: message }, { status: 500 });
     }
 }

