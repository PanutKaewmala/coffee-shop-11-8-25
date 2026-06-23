import "server-only";

import { NextRequest, NextResponse } from "next/server";

import type { Database } from "@/lib/database.types";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 500;
const TIME_ZONE = "Asia/Bangkok";

type OrdersRow = Database["public"]["Tables"]["orders"]["Row"];
type PaidOrderRow = Pick<
    OrdersRow,
    | "id"
    | "total"
    | "created_at"
    | "paid_at"
    | "payment_method"
    | "paid_amount"
    | "change_amount"
>;
type CancelledOrderRow = Pick<
    OrdersRow,
    | "id"
    | "total"
    | "cancelled_at"
    | "cancel_reason"
    | "cancel_note"
    | "cancelled_by"
    | "stock_refunded"
    | "stock_refunded_at"
>;

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

type DataQualityWarning = {
    code: string;
    message: string;
    count?: number;
};

function isValidDateKey(value: string | null): value is string {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
    );
}

function addOneDay(dateKey: string) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    return next.toISOString().slice(0, 10);
}

function toAmount(value: number | null) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function fetchPaidByPaidAt(
    admin: AdminClient,
    shopId: string,
    branchId: string,
    start: string,
    end: string
) {
    const rows: PaidOrderRow[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await admin
            .from("orders")
            .select("id,total,created_at,paid_at,payment_method,paid_amount,change_amount")
            .eq("shop_id", shopId)
            .eq("branch_id", branchId)
            .eq("status", "paid")
            .gte("paid_at", start)
            .lt("paid_at", end)
            .order("paid_at", { ascending: true })
            .range(from, from + PAGE_SIZE - 1)
            .returns<PaidOrderRow[]>();

        if (error) throw new Error(error.message);
        const page = data ?? [];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
    }

    return rows;
}

async function fetchLegacyPaidByCreatedAt(
    admin: AdminClient,
    shopId: string,
    branchId: string,
    start: string,
    end: string
) {
    const rows: PaidOrderRow[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await admin
            .from("orders")
            .select("id,total,created_at,paid_at,payment_method,paid_amount,change_amount")
            .eq("shop_id", shopId)
            .eq("branch_id", branchId)
            .eq("status", "paid")
            .is("paid_at", null)
            .gte("created_at", start)
            .lt("created_at", end)
            .order("created_at", { ascending: true })
            .range(from, from + PAGE_SIZE - 1)
            .returns<PaidOrderRow[]>();

        if (error) throw new Error(error.message);
        const page = data ?? [];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
    }

    return rows;
}

async function fetchCancelledByCancelledAt(
    admin: AdminClient,
    shopId: string,
    branchId: string,
    start: string,
    end: string
) {
    const rows: CancelledOrderRow[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await admin
            .from("orders")
            .select(
                "id,total,cancelled_at,cancel_reason,cancel_note,cancelled_by,stock_refunded,stock_refunded_at"
            )
            .eq("shop_id", shopId)
            .eq("branch_id", branchId)
            .eq("status", "cancelled")
            .gte("cancelled_at", start)
            .lt("cancelled_at", end)
            .order("cancelled_at", { ascending: true })
            .range(from, from + PAGE_SIZE - 1)
            .returns<CancelledOrderRow[]>();

        if (error) throw new Error(error.message);
        const page = data ?? [];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
    }

    return rows;
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

        const nextDate = addOneDay(date);
        const start = `${date}T00:00:00+07:00`;
        const end = `${nextDate}T00:00:00+07:00`;

        const [shopResult, branchResult, paidRows, legacyPaidRows, cancelledRows] = await Promise.all([
            admin.from("shops").select("id,name").eq("id", currentShopId).maybeSingle(),
            admin
                .from("branch")
                .select("id,name")
                .eq("id", currentBranchId)
                .eq("shop_id", currentShopId)
                .maybeSingle(),
            fetchPaidByPaidAt(admin, currentShopId, currentBranchId, start, end),
            fetchLegacyPaidByCreatedAt(admin, currentShopId, currentBranchId, start, end),
            fetchCancelledByCancelledAt(admin, currentShopId, currentBranchId, start, end),
        ]);

        if (shopResult.error) throw new Error(shopResult.error.message);
        if (branchResult.error) throw new Error(branchResult.error.message);
        if (!branchResult.data) {
            return NextResponse.json({ error: "Current branch not found" }, { status: 409 });
        }

        const paidTransactions = [
            ...paidRows.map((row) => ({ row, timestampSource: "paid_at" as const })),
            ...legacyPaidRows.map((row) => ({ row, timestampSource: "created_at" as const })),
        ]
            .map(({ row, timestampSource }) => ({
                id: row.id,
                occurredAt: row.paid_at ?? row.created_at,
                timestampSource,
                paymentMethod: row.payment_method,
                total: toAmount(row.total),
                paidAmount: row.paid_amount,
                changeAmount: row.change_amount,
            }))
            .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

        let paidTotal = 0;
        let cashSales = 0;
        let cashOrderCount = 0;
        let promptPaySales = 0;
        let promptPayOrderCount = 0;
        let unknownSales = 0;
        let unknownOrderCount = 0;
        let cashTendered = 0;
        let cashChange = 0;
        let cashDataMissingCount = 0;

        for (const transaction of paidTransactions) {
            paidTotal += transaction.total;
            const method = (transaction.paymentMethod ?? "").toLowerCase();

            if (method === "cash") {
                cashSales += transaction.total;
                cashOrderCount += 1;

                const paidKnown = typeof transaction.paidAmount === "number";
                const changeKnown = typeof transaction.changeAmount === "number";
                if (paidKnown) cashTendered += transaction.paidAmount ?? 0;
                if (changeKnown) cashChange += transaction.changeAmount ?? 0;
                if (!paidKnown || !changeKnown) cashDataMissingCount += 1;
            } else if (method === "promptpay") {
                promptPaySales += transaction.total;
                promptPayOrderCount += 1;
            } else {
                unknownSales += transaction.total;
                unknownOrderCount += 1;
            }
        }

        const paymentTotal = cashSales + promptPaySales + unknownSales;
        const cancellationTransactions = cancelledRows.map((row) => ({
            id: row.id,
            cancelledAt: row.cancelled_at,
            originalTotal: toAmount(row.total),
            reason: row.cancel_reason,
            note: row.cancel_note,
            cancelledBy: row.cancelled_by,
            stockRefunded: row.stock_refunded,
            stockRefundedAt: row.stock_refunded_at,
        }));
        const cancelledOriginalValue = cancellationTransactions.reduce(
            (sum, row) => sum + row.originalTotal,
            0
        );

        const dataQuality: DataQualityWarning[] = [];
        if (legacyPaidRows.length > 0) {
            dataQuality.push({
                code: "PAID_AT_FALLBACK",
                message: "Some paid orders used created_at because paid_at was missing.",
                count: legacyPaidRows.length,
            });
        }
        if (cashDataMissingCount > 0) {
            dataQuality.push({
                code: "CASH_DATA_MISSING",
                message: "Some cash orders are missing paid_amount or change_amount.",
                count: cashDataMissingCount,
            });
        }
        if (unknownOrderCount > 0) {
            dataQuality.push({
                code: "UNKNOWN_PAYMENT_METHOD",
                message: "Some paid orders have an unknown payment method.",
                count: unknownOrderCount,
            });
        }
        if (Math.abs(paidTotal - paymentTotal) > 0.001) {
            dataQuality.push({
                code: "PAYMENT_RECONCILIATION_MISMATCH",
                message: "Paid sales do not reconcile with the payment-method breakdown.",
            });
        }

        const paidOrderCount = paidTransactions.length;

        return NextResponse.json({
            date,
            boundaries: { start, end, timeZone: TIME_ZONE },
            context: {
                shopId: currentShopId,
                shopName: shopResult.data?.name ?? null,
                branchId: currentBranchId,
                branchName: branchResult.data.name,
            },
            generatedAt: new Date().toISOString(),
            summary: {
                paidTotal,
                paidOrderCount,
                averageOrderValue: paidOrderCount > 0 ? paidTotal / paidOrderCount : 0,
            },
            payments: {
                cash: { sales: cashSales, orderCount: cashOrderCount },
                promptPay: { sales: promptPaySales, orderCount: promptPayOrderCount },
                unknown: { sales: unknownSales, orderCount: unknownOrderCount },
                reconciled: Math.abs(paidTotal - paymentTotal) <= 0.001,
            },
            cash: {
                sales: cashSales,
                tendered: cashTendered,
                change: cashChange,
                retained: cashTendered - cashChange,
                dataMissingCount: cashDataMissingCount,
            },
            cancellations: {
                count: cancellationTransactions.length,
                originalValue: cancelledOriginalValue,
            },
            paidTransactions,
            cancelledTransactions: cancellationTransactions,
            dataQuality,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to load daily close report";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
