import "server-only";

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getServerIdentity } from "@/lib/supabaseServer";
import {
    buildReportsSalesComparison,
    buildReportsSalesContext,
    buildReportsSalesDataQuality,
    buildReportsSalesMenus,
    buildReportsSalesPayments,
    buildReportsSalesRange,
    buildReportsSalesTrend,
    calculateReportsSalesMetrics,
    getReportsSalesAccessError,
    isReportsSalesRangeKey,
    resolveReportsSalesTimestamp,
    type ReportsSalesOrderItem,
    type ReportsSalesPaidOrder,
    type ReportsSalesPeriod,
    type ReportsSalesRangeKey,
    type ReportsSalesResponse,
} from "@/lib/reportsSales";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 500;
const ORDER_ITEM_ID_CHUNK_SIZE = 100;

type PaidOrderRow = {
    id: string;
    total: number | string | null;
    paid_at: string | null;
    created_at: string | null;
    payment_method: string | null;
};

type OrderItemRow = {
    id: string;
    order_id: string | null;
    menu_id: string | null;
    variant_id: string | null;
    name: string;
    variant_label: string | null;
    price: number | string | null;
    qty: number | string | null;
};

const numberOrZero = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

function chunks<T>(items: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
    return result;
}

async function findFirstPaidOrderAt(
    shopId: string,
    branchId: string | null,
): Promise<string | null> {
    const admin = getSupabaseAdmin();
    let paidQuery = admin
        .from("orders")
        .select("paid_at")
        .eq("shop_id", shopId)
        .eq("status", "paid")
        .not("paid_at", "is", null)
        .order("paid_at", { ascending: true })
        .limit(1);
    let legacyQuery = admin
        .from("orders")
        .select("created_at")
        .eq("shop_id", shopId)
        .eq("status", "paid")
        .is("paid_at", null)
        .order("created_at", { ascending: true })
        .limit(1);
    if (branchId) {
        paidQuery = paidQuery.eq("branch_id", branchId);
        legacyQuery = legacyQuery.eq("branch_id", branchId);
    }
    const [paidResult, legacyResult] = await Promise.all([paidQuery.maybeSingle(), legacyQuery.maybeSingle()]);
    if (paidResult.error) throw new Error(paidResult.error.message);
    if (legacyResult.error) throw new Error(legacyResult.error.message);
    const candidates = [paidResult.data?.paid_at, legacyResult.data?.created_at]
        .filter((value): value is string => typeof value === "string" && Number.isFinite(new Date(value).getTime()))
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    return candidates[0] ?? null;
}

async function fetchPaidOrderStream(
    period: ReportsSalesPeriod,
    shopId: string,
    branchId: string | null,
    timestampSource: "paid_at" | "created_at",
): Promise<ReportsSalesPaidOrder[]> {
    const admin = getSupabaseAdmin();
    const rows: ReportsSalesPaidOrder[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
        let query = admin
            .from("orders")
            .select("id,total,paid_at,created_at,payment_method")
            .eq("shop_id", shopId)
            .eq("status", "paid");
        query = timestampSource === "paid_at" ? query.not("paid_at", "is", null) : query.is("paid_at", null);
        if (branchId) query = query.eq("branch_id", branchId);
        const result = await query
            .gte(timestampSource, period.startInclusive)
            .lt(timestampSource, period.endExclusive)
            .order(timestampSource, { ascending: true })
            .order("id", { ascending: true })
            .range(from, from + PAGE_SIZE - 1);
        if (result.error) throw new Error(result.error.message);
        const page = (result.data ?? []) as PaidOrderRow[];
        for (const row of page) {
            const resolvedTimestamp = resolveReportsSalesTimestamp(row.paid_at, row.created_at, period);
            if (!resolvedTimestamp || resolvedTimestamp.timestampSource !== timestampSource) continue;
            rows.push({
                id: row.id,
                total: numberOrZero(row.total),
                occurredAt: resolvedTimestamp.occurredAt,
                timestampSource: resolvedTimestamp.timestampSource,
                paymentMethod: row.payment_method,
                items: [],
            });
        }
        if (page.length < PAGE_SIZE) break;
    }
    return rows;
}

async function fetchPaidOrders(
    period: ReportsSalesPeriod,
    shopId: string,
    branchId: string | null,
): Promise<ReportsSalesPaidOrder[]> {
    const [paidAtOrders, legacyOrders] = await Promise.all([
        fetchPaidOrderStream(period, shopId, branchId, "paid_at"),
        fetchPaidOrderStream(period, shopId, branchId, "created_at"),
    ]);
    return [...paidAtOrders, ...legacyOrders].sort(
        (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime() || a.id.localeCompare(b.id),
    );
}

async function fetchOrderItems(shopId: string, orderIds: string[]): Promise<Map<string, ReportsSalesOrderItem[]>> {
    const admin = getSupabaseAdmin();
    const byOrderId = new Map<string, ReportsSalesOrderItem[]>();
    for (const orderId of orderIds) byOrderId.set(orderId, []);

    for (const idChunk of chunks(orderIds, ORDER_ITEM_ID_CHUNK_SIZE)) {
        for (let from = 0; ; from += PAGE_SIZE) {
            const result = await admin
                .from("order_items")
                .select("id,order_id,menu_id,variant_id,name,variant_label,price,qty")
                .eq("shop_id", shopId)
                .in("order_id", idChunk)
                .order("order_id", { ascending: true })
                .order("id", { ascending: true })
                .range(from, from + PAGE_SIZE - 1);
            if (result.error) throw new Error(result.error.message);
            const page = (result.data ?? []) as OrderItemRow[];
            for (const row of page) {
                if (!row.order_id || !byOrderId.has(row.order_id)) continue;
                byOrderId.get(row.order_id)?.push({
                    id: row.id,
                    menuId: row.menu_id,
                    variantId: row.variant_id,
                    name: row.name,
                    variantLabel: row.variant_label,
                    price: numberOrZero(row.price),
                    quantity: numberOrZero(row.qty),
                });
            }
            if (page.length < PAGE_SIZE) break;
        }
    }
    return byOrderId;
}

function unavailableComparisonMetrics() {
    return { paidSales: 0, paidOrderCount: 0, averagePaidOrderValue: 0 };
}

export async function GET(request: Request) {
    try {
        const requestedRange = new URL(request.url).searchParams.get("range") ?? "today";
        if (!isReportsSalesRangeKey(requestedRange)) {
            return NextResponse.json({ error: "Invalid range" }, { status: 400 });
        }

        const admin = getSupabaseAdmin();
        const identity = await getServerIdentity();
        const accessError = getReportsSalesAccessError(identity);
        if (accessError) return NextResponse.json({ error: accessError.error }, { status: accessError.status });
        const currentShopId = identity.currentShopId as string;
        const currentBranchId = identity.currentBranchId;

        const shopPromise = admin.from("shops").select("id,name").eq("id", currentShopId).maybeSingle();
        const branchPromise = currentBranchId
            ? admin.from("branch").select("id,name,shop_id").eq("id", currentBranchId).eq("shop_id", currentShopId).maybeSingle()
            : Promise.resolve({ data: null, error: null });
        const [shopResult, branchResult] = await Promise.all([shopPromise, branchPromise]);
        if (shopResult.error) return NextResponse.json({ error: shopResult.error.message }, { status: 500 });
        if (!shopResult.data) return NextResponse.json({ error: "Current shop not found" }, { status: 404 });
        if (branchResult.error) return NextResponse.json({ error: branchResult.error.message }, { status: 500 });
        if (currentBranchId && !branchResult.data) {
            return NextResponse.json({ error: "Branch not in current shop" }, { status: 403 });
        }

        const now = new Date();
        const firstPaidOrderAt = requestedRange === "all"
            ? await findFirstPaidOrderAt(currentShopId, currentBranchId)
            : null;
        const range = buildReportsSalesRange(requestedRange as ReportsSalesRangeKey, now, firstPaidOrderAt);
        const currentPeriod = { startInclusive: range.startInclusive, endExclusive: range.endExclusive };
        const comparisonAvailable = range.comparisonStartInclusive !== null && range.comparisonEndExclusive !== null;
        const comparisonPeriod = comparisonAvailable
            ? { startInclusive: range.comparisonStartInclusive as string, endExclusive: range.comparisonEndExclusive as string }
            : null;

        const [currentOrders, previousOrders] = await Promise.all([
            fetchPaidOrders(currentPeriod, currentShopId, currentBranchId),
            comparisonPeriod ? fetchPaidOrders(comparisonPeriod, currentShopId, currentBranchId) : Promise.resolve([]),
        ]);
        const itemsByOrderId = await fetchOrderItems(currentShopId, currentOrders.map((order) => order.id));
        for (const order of currentOrders) order.items = itemsByOrderId.get(order.id) ?? [];

        const summary = calculateReportsSalesMetrics(currentOrders);
        const previousMetrics = comparisonAvailable
            ? calculateReportsSalesMetrics(previousOrders)
            : unavailableComparisonMetrics();
        const response: ReportsSalesResponse = {
            context: buildReportsSalesContext(
                currentShopId,
                shopResult.data.name,
                branchResult.data ? { id: branchResult.data.id, name: branchResult.data.name } : null,
            ),
            range,
            summary,
            comparison: buildReportsSalesComparison(comparisonAvailable, summary, previousMetrics),
            trend: buildReportsSalesTrend(currentOrders, range),
            payments: buildReportsSalesPayments(currentOrders, summary.paidSales),
            menus: buildReportsSalesMenus(currentOrders),
            dataQuality: buildReportsSalesDataQuality(currentOrders),
        };
        return NextResponse.json(response);
    } catch (error: unknown) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to load sales report" },
            { status: 500 },
        );
    }
}
