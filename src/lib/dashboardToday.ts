export const DASHBOARD_TIME_ZONE = "Asia/Bangkok";
const BANGKOK_OFFSET = "+07:00";

export type BangkokDay = {
    date: string;
    start: string;
    end: string;
};

function dateKeyInBangkok(now: Date): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: DASHBOARD_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(now);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? "";
    return `${value("year")}-${value("month")}-${value("day")}`;
}

function shiftDate(dateKey: string, days: number): string {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function bangkokDay(dateKey: string): BangkokDay {
    return {
        date: dateKey,
        start: `${dateKey}T00:00:00${BANGKOK_OFFSET}`,
        end: `${shiftDate(dateKey, 1)}T00:00:00${BANGKOK_OFFSET}`,
    };
}

export function dashboardDates(now = new Date()) {
    const today = dateKeyInBangkok(now);
    return {
        timeZone: DASHBOARD_TIME_ZONE,
        today: bangkokDay(today),
        yesterday: bangkokDay(shiftDate(today, -1)),
    };
}

export type DashboardTodayResponse = {
    context: { shopId: string; branchId: string; branchName: string };
    dates: ReturnType<typeof dashboardDates>;
    yesterdayClose: null | {
        status: string;
        netSales: number;
        cashDifference: number | null;
        countedCash: number | null;
        expectedCash: number;
        closedAt: string | null;
    };
    tasks: {
        outOfStock: Array<{ id: string; name: string; stock: number; unit: string }>;
        lowStock: Array<{ id: string; name: string; stock: number; minStock: number; unit: string }>;
        expiringLots: Array<{
            id: string;
            ingredientId: string;
            ingredientName: string;
            lotCode: string | null;
            quantity: number;
            unit: string | null;
            daysToExpiry: number;
        }>;
    };
    reviewEvents: {
        orders: Array<{ id: string; status: string; total: number; createdAt: string }>;
        stock: Array<{
            id: string;
            ingredientId: string;
            ingredientName: string;
            type: string;
            amount: number;
            note: string | null;
            createdAt: string;
        }>;
        cashDifference: number | null;
    };
    sales: {
        netSales: number;
        paidOrderCount: number;
        averageOrderValue: number;
        cashSales: number;
        promptPaySales: number;
        otherSales: number;
    };
};
