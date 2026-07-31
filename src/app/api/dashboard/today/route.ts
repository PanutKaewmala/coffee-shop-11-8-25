import "server-only";

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { computeDailyCloseReport } from "@/lib/dailyCloseReport";
import { dashboardDates, type DashboardTodayResponse } from "@/lib/dashboardToday";
import { getDaysToExpiry, getExpiryAlertTone } from "@/lib/ingredientExpiry";

type DailyCloseRow = {
    status: string;
    net_sales: number | string;
    cash_difference: number | string | null;
    counted_cash: number | string | null;
    expected_cash: number | string;
    closed_at: string | null;
};

type ExpiryRow = {
    id: string;
    ingredient_id: string;
    ingredient_name: string;
    lot_code: string | null;
    qty_remaining: number | string | null;
    unit: string | null;
    effective_expiry_at: string | null;
    expires_at: string | null;
};

const numberOrZero = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
const numberOrNull = (value: unknown) => value == null ? null : numberOrZero(value);

export async function GET() {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) return NextResponse.json({ error: authError.message }, { status: 500 });
    if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();
    if (!currentShopId) return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
    if (!currentBranchId) return NextResponse.json({ error: "กรุณาเลือกสาขาเพื่อดูภาพรวมวันนี้" }, { status: 409 });

    const [{ data: membership, error: membershipError }, { data: branch, error: branchError }] = await Promise.all([
        admin.from("shop_members").select("role").eq("user_id", auth.user.id).eq("shop_id", currentShopId).maybeSingle(),
        admin.from("branch").select("id,name").eq("id", currentBranchId).eq("shop_id", currentShopId).maybeSingle(),
    ]);
    if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
    if (!membership || membership.role !== "owner") return NextResponse.json({ error: "Owner only" }, { status: 403 });
    if (branchError) return NextResponse.json({ error: branchError.message }, { status: 500 });
    if (!branch) return NextResponse.json({ error: "Branch not in current shop" }, { status: 403 });

    const dates = dashboardDates();
    const [report, closeResult, ingredientsResult, lotsResult, orderEventsResult, stockEventsResult] = await Promise.all([
        computeDailyCloseReport(admin, currentShopId, currentBranchId, dates.yesterday.date),
        admin.from("daily_closes" as never).select("status,net_sales,cash_difference,counted_cash,expected_cash,closed_at").eq("shop_id", currentShopId).eq("branch_id", currentBranchId).eq("business_date", dates.yesterday.date).maybeSingle(),
        admin.from("ingredients").select("id,name,stock,min_stock,unit").eq("shop_id", currentShopId).eq("branch_id", currentBranchId).eq("is_active", true).order("stock", { ascending: true }),
        admin.from("ingredient_lot_expiry_status").select("id,ingredient_id,ingredient_name,lot_code,qty_remaining,unit,effective_expiry_at,expires_at").eq("shop_id", currentShopId).eq("branch_id", currentBranchId).gt("qty_remaining", 0).limit(250),
        admin.from("orders").select("id,status,total,created_at").eq("shop_id", currentShopId).eq("branch_id", currentBranchId).in("status", ["cancelled", "void", "refunded"]).gte("created_at", dates.yesterday.start).lt("created_at", dates.yesterday.end).order("created_at", { ascending: false }),
        admin.from("stock_logs").select("id,ingredient_id,type,amount,note,created_at,ingredient:ingredients!stock_logs_ingredient_id_fkey(name)").eq("shop_id", currentShopId).eq("branch_id", currentBranchId).in("type", ["adjust", "waste"]).gte("created_at", dates.yesterday.start).lt("created_at", dates.yesterday.end).order("created_at", { ascending: false }),
    ]);

    const firstError = [closeResult.error, ingredientsResult.error, lotsResult.error, orderEventsResult.error, stockEventsResult.error].find(Boolean);
    if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

    const close = closeResult.data as unknown as DailyCloseRow | null;
    const ingredients = ingredientsResult.data ?? [];
    const lots = (lotsResult.data ?? []) as unknown as ExpiryRow[];
    const expiringLots = lots.flatMap((lot) => {
        const days = getDaysToExpiry(lot.effective_expiry_at ?? lot.expires_at);
        const tone = getExpiryAlertTone(days);
        if (days == null || (tone !== "danger" && tone !== "warning")) return [];
        return [{ id: lot.id, ingredientId: lot.ingredient_id, ingredientName: lot.ingredient_name, lotCode: lot.lot_code, quantity: numberOrZero(lot.qty_remaining), unit: lot.unit, daysToExpiry: days }];
    }).sort((a, b) => a.daysToExpiry - b.daysToExpiry).slice(0, 8);

    const response: DashboardTodayResponse = {
        context: { shopId: currentShopId, branchId: currentBranchId, branchName: branch.name },
        dates,
        yesterdayClose: close ? {
            status: close.status,
            netSales: numberOrZero(close.net_sales),
            cashDifference: numberOrNull(close.cash_difference),
            countedCash: numberOrNull(close.counted_cash),
            expectedCash: numberOrZero(close.expected_cash),
            closedAt: close.closed_at,
        } : null,
        tasks: {
            outOfStock: ingredients.filter((row) => numberOrZero(row.stock) <= 0).map((row) => ({ id: row.id, name: row.name, stock: numberOrZero(row.stock), unit: row.unit })),
            lowStock: ingredients.filter((row) => numberOrZero(row.stock) > 0 && numberOrZero(row.stock) <= numberOrZero(row.min_stock)).map((row) => ({ id: row.id, name: row.name, stock: numberOrZero(row.stock), minStock: numberOrZero(row.min_stock), unit: row.unit })),
            expiringLots,
        },
        reviewEvents: {
            orders: (orderEventsResult.data ?? []).map((row) => ({ id: row.id, status: row.status, total: numberOrZero(row.total), createdAt: row.created_at })),
            stock: (stockEventsResult.data ?? []).map((row) => ({ id: row.id, ingredientId: row.ingredient_id, ingredientName: (row.ingredient as unknown as { name?: string } | null)?.name ?? "วัตถุดิบ", type: row.type ?? "", amount: numberOrZero(row.amount), note: row.note, createdAt: row.created_at ?? "" })),
            cashDifference: close ? numberOrNull(close.cash_difference) : null,
        },
        sales: {
            netSales: report.summary.paidTotal,
            paidOrderCount: report.summary.paidOrderCount,
            averageOrderValue: report.summary.averageOrderValue,
            cashSales: report.payments.cash.sales,
            promptPaySales: report.payments.promptPay.sales,
            otherSales: report.payments.unknown.sales,
        },
    };
    return NextResponse.json(response);
}
