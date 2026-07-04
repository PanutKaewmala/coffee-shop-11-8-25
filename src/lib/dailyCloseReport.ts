// src/lib/dailyCloseReport.ts
// Shared server-only helper for daily close live calculations.

export const PAGE_SIZE = 500;
export const TIME_ZONE = "Asia/Bangkok";

export type DataQualityWarning = {
    code: string;
    message: string;
    count?: number;
};

export type PaidTransaction = {
    id: string;
    occurredAt: string;
    timestampSource: "paid_at" | "created_at";
    paymentMethod: string | null;
    total: number;
    paidAmount: number | null;
    changeAmount: number | null;
};

export type CancelledTransaction = {
    id: string;
    cancelledAt: string | null;
    originalTotal: number;
    reason: string | null;
    note: string | null;
    cancelledBy: string | null;
    stockRefunded: boolean | null;
    stockRefundedAt: string | null;
};

export type DailyCloseReport = {
    date: string;
    boundaries: { start: string; end: string; timeZone: string };
    context: {
        shopId: string;
        shopName: string | null;
        branchId: string;
        branchName: string;
    };
    generatedAt: string;
    summary: {
        paidTotal: number;
        paidOrderCount: number;
        averageOrderValue: number;
    };
    payments: {
        cash: { sales: number; orderCount: number };
        promptPay: { sales: number; orderCount: number };
        unknown: { sales: number; orderCount: number };
        reconciled: boolean;
    };
    cash: {
        sales: number;
        tendered: number;
        change: number;
        retained: number;
        dataMissingCount: number;
    };
    cashMovements: {
        cashInTotal: number;
        cashOutTotal: number;
        cashMovementNet: number;
        movements: Array<{
            id: string;
            type: "cash_in" | "cash_out";
            reason: string;
            amount: number;
            note: string | null;
            created_at: string;
        }>;
    };
    cancellations: {
        count: number;
        originalValue: number;
    };
    paidTransactions: PaidTransaction[];
    cancelledTransactions: CancelledTransaction[];
    dataQuality: DataQualityWarning[];
};

export type DailyCloseSnapshot = {
    gross_sales: number;
    net_sales: number;
    cash_sales: number;
    promptpay_sales: number;
    unknown_payment_sales: number;
    paid_order_count: number;
    cancelled_order_count: number;
    refunded_order_count: number;
    void_order_count: number;
    expected_cash: number;
    cash_difference: number | null;
};

type AdminClient = {
    from(table: string): unknown;
};

type OrdersRow = {
    id: string;
    total: number | null;
    created_at: string | null;
    paid_at: string | null;
    payment_method: string | null;
    paid_amount: number | null;
    change_amount: number | null;
};

type CancelledRow = {
    id: string;
    total: number | null;
    cancelled_at: string | null;
    cancel_reason: string | null;
    cancel_note: string | null;
    cancelled_by: string | null;
    stock_refunded: boolean | null;
    stock_refunded_at: string | null;
};

type CashMovementRow = {
    id: string;
    type: "cash_in" | "cash_out";
    reason: string;
    amount: string | number;
    note: string | null;
    created_at: string;
};

function addOneDay(dateKey: string) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    return next.toISOString().slice(0, 10);
}

function toAmount(value: number | null): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

type PaginatedResult<T> = {
    data: T[] | null;
    error: { message: string } | null;
};

type SingleResult<T> = {
    data: T | null;
    error: { message: string } | null;
};

interface QB {
    select: (cols: string) => QB;
    eq: (col: string, val: string | boolean | null) => QB;
    gte: (col: string, val: string) => QB;
    lt: (col: string, val: string) => QB;
    is: (col: string, val: null) => QB;
    order: (col: string, opts: { ascending: boolean }) => QB;
    range: (from: number, to: number) => QB & { (): PaginatedResult<unknown> };
    maybeSingle: () => QB & { (): SingleResult<unknown> };
}

function toQB(admin: AdminClient, table: string): QB {
    return admin.from(table) as unknown as QB;
}

async function fetchPaidByPaidAt(
    admin: AdminClient,
    shopId: string,
    branchId: string,
    start: string,
    end: string
): Promise<OrdersRow[]> {
    const rows: OrdersRow[] = [];
    const q = toQB(admin, "orders");

    for (let from = 0; ; from += PAGE_SIZE) {
        const result = (await q
            .select("id,total,created_at,paid_at,payment_method,paid_amount,change_amount")
            .eq("shop_id", shopId)
            .eq("branch_id", branchId)
            .eq("status", "paid")
            .gte("paid_at", start)
            .lt("paid_at", end)
            .order("paid_at", { ascending: true })
            .range(from, from + PAGE_SIZE - 1)) as unknown as PaginatedResult<OrdersRow>;

        if (result.error) throw new Error(result.error.message);
        const page = result.data ?? [];
        for (const row of page) rows.push(row);
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
): Promise<OrdersRow[]> {
    const rows: OrdersRow[] = [];
    const q = toQB(admin, "orders");

    for (let from = 0; ; from += PAGE_SIZE) {
        const result = (await q
            .select("id,total,created_at,paid_at,payment_method,paid_amount,change_amount")
            .eq("shop_id", shopId)
            .eq("branch_id", branchId)
            .eq("status", "paid")
            .is("paid_at", null)
            .gte("created_at", start)
            .lt("created_at", end)
            .order("created_at", { ascending: true })
            .range(from, from + PAGE_SIZE - 1)) as unknown as PaginatedResult<OrdersRow>;

        if (result.error) throw new Error(result.error.message);
        const page = result.data ?? [];
        for (const row of page) rows.push(row);
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
): Promise<CancelledRow[]> {
    const rows: CancelledRow[] = [];
    const q = toQB(admin, "orders");

    for (let from = 0; ; from += PAGE_SIZE) {
        const result = (await q
            .select(
                "id,total,cancelled_at,cancel_reason,cancel_note,cancelled_by,stock_refunded,stock_refunded_at"
            )
            .eq("shop_id", shopId)
            .eq("branch_id", branchId)
            .eq("status", "cancelled")
            .gte("cancelled_at", start)
            .lt("cancelled_at", end)
            .order("cancelled_at", { ascending: true })
            .range(from, from + PAGE_SIZE - 1)) as unknown as PaginatedResult<CancelledRow>;

        if (result.error) throw new Error(result.error.message);
        const page = result.data ?? [];
        for (const row of page) rows.push(row);
        if (page.length < PAGE_SIZE) break;
    }

    return rows;
}

async function fetchCashMovements(
    admin: AdminClient,
    shopId: string,
    branchId: string,
    businessDate: string
): Promise<CashMovementRow[]> {
    const q = toQB(admin, "cash_movements");

    const result = (await q
        .select("id,type,reason,amount,note,created_at")
        .eq("shop_id", shopId)
        .eq("branch_id", branchId)
        .eq("business_date", businessDate)
        .order("created_at", { ascending: true })) as unknown as PaginatedResult<CashMovementRow>;

    if (result.error) throw new Error(result.error.message);
    return result.data ?? [];
}

export async function computeDailyCloseReport(
    admin: AdminClient,
    shopId: string,
    branchId: string,
    businessDate: string
): Promise<DailyCloseReport> {
    const nextDate = addOneDay(businessDate);
    const start = `${businessDate}T00:00:00+07:00`;
    const end = `${nextDate}T00:00:00+07:00`;

    const shopQ = toQB(admin, "shops");
    const branchQ = toQB(admin, "branch");

    const [shopResult, branchResult, paidRows, legacyPaidRows, cancelledRows, cashMovementRows] = await Promise.all([
        shopQ.select("id,name").eq("id", shopId).maybeSingle() as unknown as SingleResult<{ id: string; name: string }>,
        branchQ
            .select("id,name")
            .eq("id", branchId)
            .eq("shop_id", shopId)
            .maybeSingle() as unknown as SingleResult<{ id: string; name: string }>,
        fetchPaidByPaidAt(admin, shopId, branchId, start, end),
        fetchLegacyPaidByCreatedAt(admin, shopId, branchId, start, end),
        fetchCancelledByCancelledAt(admin, shopId, branchId, start, end),
        fetchCashMovements(admin, shopId, branchId, businessDate),
    ]);

    if ((shopResult as { error: { message: string } | null }).error) {
        throw new Error((shopResult as { error: { message: string } }).error.message);
    }
    if ((branchResult as { error: { message: string } | null }).error) {
        throw new Error((branchResult as { error: { message: string } }).error.message);
    }

    const shopName = (shopResult.data as { id: string; name: string } | null)?.name ?? null;
    const branchName = (branchResult.data as { id: string; name: string } | null)?.name ?? "";

    const paidTransactions = [
        ...paidRows.map((row) => ({ row, timestampSource: "paid_at" as const })),
        ...legacyPaidRows.map((row) => ({ row, timestampSource: "created_at" as const })),
    ]
        .map(({ row, timestampSource }) => ({
            id: row.id,
            occurredAt: row.paid_at ?? row.created_at ?? "",
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

    let cashInTotal = 0;
    let cashOutTotal = 0;
    const cashMovementItems = cashMovementRows.map((row) => {
        const amount = typeof row.amount === "number" ? row.amount : Number(row.amount);
        const safeAmount = Number.isFinite(amount) ? amount : 0;
        if (row.type === "cash_in") {
            cashInTotal += safeAmount;
        } else {
            cashOutTotal += safeAmount;
        }
        return {
            id: row.id,
            type: row.type,
            reason: row.reason,
            amount: safeAmount,
            note: row.note ?? null,
            created_at: row.created_at,
        };
    });
    const cashMovementNet = cashInTotal - cashOutTotal;

    const dataQuality: DataQualityWarning[] = [];
    if (legacyPaidRows.length > 0) {
        dataQuality.push({
            code: "PAID_AT_FALLBACK",
            message: "บางออเดอร์ใช้เวลาสร้างออเดอร์แทนเวลาชำระเงิน",
            count: legacyPaidRows.length,
        });
    }
    if (cashDataMissingCount > 0) {
        dataQuality.push({
            code: "CASH_DATA_MISSING",
            message: "บางออเดอร์เงินสดมีข้อมูลเงินรับหรือเงินทอนไม่ครบ",
            count: cashDataMissingCount,
        });
    }
    if (unknownOrderCount > 0) {
        dataQuality.push({
            code: "UNKNOWN_PAYMENT_METHOD",
            message: "บางออเดอร์ไม่มีวิธีชำระเงิน",
            count: unknownOrderCount,
        });
    }
    if (Math.abs(paidTotal - paymentTotal) > 0.001) {
        dataQuality.push({
            code: "PAYMENT_RECONCILIATION_MISMATCH",
            message: "ยอดขายรวมไม่ตรงกับยอดแยกตามวิธีชำระเงิน",
        });
    }

    const paidOrderCount = paidTransactions.length;

    const report: DailyCloseReport = {
        date: businessDate,
        boundaries: { start, end, timeZone: TIME_ZONE },
        context: {
            shopId,
            shopName,
            branchId,
            branchName,
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
        cashMovements: {
            cashInTotal,
            cashOutTotal,
            cashMovementNet,
            movements: cashMovementItems,
        },
        cancellations: {
            count: cancellationTransactions.length,
            originalValue: cancelledOriginalValue,
        },
        paidTransactions,
        cancelledTransactions: cancellationTransactions,
        dataQuality,
    };

    return report;
}

export function computeSnapshotFromReport(report: DailyCloseReport): DailyCloseSnapshot {
    const retained = report.cash.retained;
    const cashMovementNet = report.cashMovements.cashMovementNet;
    return {
        gross_sales: report.summary.paidTotal,
        net_sales: report.summary.paidTotal,
        cash_sales: report.payments.cash.sales,
        promptpay_sales: report.payments.promptPay.sales,
        unknown_payment_sales: report.payments.unknown.sales,
        paid_order_count: report.summary.paidOrderCount,
        cancelled_order_count: report.cancellations.count,
        refunded_order_count: 0,
        void_order_count: 0,
        expected_cash: retained + cashMovementNet,
        cash_difference: null,
    };
}
