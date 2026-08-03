import { REPORTS_SALES_RANGE_KEYS, type ReportsSalesRangeKey, type ReportsSalesRangeQuery } from "@/lib/reportsSalesRangeQuery";
export { REPORTS_SALES_RANGE_KEYS, type ReportsSalesRangeKey } from "@/lib/reportsSalesRangeQuery";
export const REPORTS_SALES_TIME_ZONE = "Asia/Bangkok";
const BANGKOK_OFFSET = "+07:00";
export type ReportsSalesGranularity = "hourly" | "daily" | "weekly" | "monthly";

export type ReportsSalesPeriod = {
    startInclusive: string;
    endExclusive: string;
};

export type ReportsSalesContext = {
    shopId: string;
    shopName: string;
    branchId: string | null;
    branchName: string | null;
    isAllBranches: boolean;
};

export type ReportsSalesRange = {
    key: ReportsSalesRangeKey;
    timezone: typeof REPORTS_SALES_TIME_ZONE;
    startInclusive: string;
    endExclusive: string;
    comparisonStartInclusive: string | null;
    comparisonEndExclusive: string | null;
    granularity: ReportsSalesGranularity;
};

export type ReportsSalesOrderItem = {
    id: string;
    menuId: string | null;
    variantId: string | null;
    name: string;
    variantLabel: string | null;
    price: number;
    quantity: number;
};

export type ReportsSalesPaidOrder = {
    id: string;
    total: number;
    occurredAt: string;
    timestampSource: "paid_at" | "created_at";
    paymentMethod: string | null;
    items: ReportsSalesOrderItem[];
};

export type ReportsSalesMetrics = {
    paidSales: number;
    paidOrderCount: number;
    averagePaidOrderValue: number;
};

export type ReportsSalesTrendBucket = {
    key: string;
    label: string;
    start: string;
    paidSales: number;
    paidOrderCount: number;
};

export type ReportsSalesCalendarDay = {
    date: string;
    paidSales: number;
    paidOrderCount: number;
    averagePaidOrderValue: number;
};

export type ReportsSalesCalendar = {
    startDateInclusive: string;
    endDateExclusive: string;
    days: ReportsSalesCalendarDay[];
};

export type ReportsSalesPayment = {
    method: "cash" | "promptpay" | "unknown";
    paidSales: number;
    paidOrderCount: number;
    contributionPercent: number;
};

export type ReportsSalesMenuVariant = {
    key: string;
    variantId: string | null;
    label: string;
    quantity: number;
    revenue: number;
    contributionPercentWithinMenu: number;
};

export type ReportsSalesMenu = {
    key: string;
    menuId: string | null;
    name: string;
    quantity: number;
    revenue: number;
    contributionPercent: number;
    variants: ReportsSalesMenuVariant[];
};

export type ReportsSalesDelta = {
    paidSalesAmount: number;
    paidSalesPercent: number | null;
    paidOrderCount: number;
    paidOrderCountPercent: number | null;
    averagePaidOrderValueAmount: number;
    averagePaidOrderValuePercent: number | null;
};

export type ReportsSalesComparison =
    | {
        available: true;
        current: ReportsSalesMetrics;
        previous: ReportsSalesMetrics;
        delta: ReportsSalesDelta;
    }
    | {
        available: false;
        current: ReportsSalesMetrics;
        previous: null;
        delta: null;
    };

export type ReportsSalesResponse = {
    context: ReportsSalesContext;
    range: ReportsSalesRange;
    summary: ReportsSalesMetrics;
    comparison: ReportsSalesComparison;
    calendar: ReportsSalesCalendar;
    trend: ReportsSalesTrendBucket[];
    payments: ReportsSalesPayment[];
    menus: ReportsSalesMenu[];
    dataQuality: {
        legacyPaidFallbackCount: number;
        unknownPaymentCount: number;
        itemRevenueMismatchAmount: number;
        itemRevenueMismatchOrderCount: number;
    };
};

type BangkokParts = {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    millisecond: number;
};

function bangkokParts(value: Date): BangkokParts {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: REPORTS_SALES_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(value);
    const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    return {
        year: read("year"),
        month: read("month"),
        day: read("day"),
        hour: read("hour"),
        minute: read("minute"),
        second: read("second"),
        millisecond: value.getUTCMilliseconds(),
    };
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0");
const dateKey = (parts: Pick<BangkokParts, "year" | "month" | "day">) =>
    `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
const bangkokIso = (parts: BangkokParts) =>
    `${dateKey(parts)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}.${pad(parts.millisecond, 3)}${BANGKOK_OFFSET}`;
const bangkokMidnightIso = (key: string) => `${key}T00:00:00.000${BANGKOK_OFFSET}`;

function keyToDayNumber(key: string): number {
    const [year, month, day] = key.split("-").map(Number);
    return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function dayNumberToKey(dayNumber: number): string {
    return new Date(dayNumber * 86_400_000).toISOString().slice(0, 10);
}

function addDays(key: string, days: number): string {
    return dayNumberToKey(keyToDayNumber(key) + days);
}

function partsForDateKey(key: string, time: BangkokParts): BangkokParts {
    const [year, month, day] = key.split("-").map(Number);
    return { ...time, year, month, day };
}

function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function sameBangkokTimeInYear(parts: BangkokParts, year: number): string {
    return bangkokIso({ ...parts, year, day: Math.min(parts.day, daysInMonth(year, parts.month)) });
}

export function isReportsSalesRangeKey(value: string): value is ReportsSalesRangeKey {
    return (REPORTS_SALES_RANGE_KEYS as readonly string[]).includes(value);
}

export function getReportsSalesAccessError(identity: {
    user: { id: string } | null;
    currentShopId: string | null;
    currentShopRole: string | null;
}): { status: 401 | 403 | 409; error: string } | null {
    if (!identity.user) return { status: 401, error: "Unauthorized" };
    if (!identity.currentShopId) return { status: 409, error: "No current shop selected" };
    if (identity.currentShopRole !== "owner") return { status: 403, error: "Owner only" };
    return null;
}

export function normalizeReportsSalesRequestedBranchId(rawCurrentBranchId: string | null): string | null {
    return rawCurrentBranchId?.trim() || null;
}

export function resolveReportsSalesBranchScope(
    requestedBranchId: string | null,
    branch: { id: string; name: string } | null,
):
    | { ok: true; branchId: string | null; branch: { id: string; name: string } | null; isAllBranches: boolean }
    | { ok: false; status: 403; error: "Branch not in current shop" } {
    if (!requestedBranchId) return { ok: true, branchId: null, branch: null, isAllBranches: true };
    if (!branch || branch.id !== requestedBranchId) {
        return { ok: false, status: 403, error: "Branch not in current shop" };
    }
    return { ok: true, branchId: requestedBranchId, branch, isAllBranches: false };
}

export function resolveReportsSalesTimestamp(
    paidAt: string | null,
    createdAt: string | null,
    period: ReportsSalesPeriod,
): { occurredAt: string; timestampSource: "paid_at" | "created_at" } | null {
    const value = paidAt ?? createdAt;
    if (!value) return null;
    const timestamp = new Date(value).getTime();
    const start = new Date(period.startInclusive).getTime();
    const end = new Date(period.endExclusive).getTime();
    if (![timestamp, start, end].every(Number.isFinite) || timestamp < start || timestamp >= end) return null;
    return { occurredAt: value, timestampSource: paidAt ? "paid_at" : "created_at" };
}

export function buildReportsSalesContext(
    shopId: string,
    shopName: string,
    branch: { id: string; name: string } | null,
): ReportsSalesResponse["context"] {
    return {
        shopId,
        shopName,
        branchId: branch?.id ?? null,
        branchName: branch?.name ?? null,
        isAllBranches: branch === null,
    };
}

export function buildReportsSalesRange(
    query: ReportsSalesRangeQuery,
    now = new Date(),
    firstPaidOrderAt: string | null = null,
): ReportsSalesRange {
    const nowParts = bangkokParts(now);
    const todayKey = dateKey(nowParts);
    let endExclusive = now.toISOString();
    let startInclusive: string;
    let comparisonStartInclusive: string | null = null;
    let comparisonEndExclusive: string | null = null;
    let granularity: ReportsSalesGranularity;

    const key = query.key;
    if (key === "today") {
        startInclusive = bangkokMidnightIso(todayKey);
        const yesterdayKey = addDays(todayKey, -1);
        comparisonStartInclusive = bangkokMidnightIso(yesterdayKey);
        comparisonEndExclusive = bangkokIso(partsForDateKey(yesterdayKey, nowParts));
        granularity = "hourly";
    } else if (key === "7d" || key === "30d" || key === "90d") {
        const dayCount = key === "7d" ? 7 : key === "30d" ? 30 : 90;
        startInclusive = bangkokMidnightIso(addDays(todayKey, -(dayCount - 1)));
        const duration = now.getTime() - new Date(startInclusive).getTime();
        const previousEnd = new Date(startInclusive);
        comparisonEndExclusive = previousEnd.toISOString();
        comparisonStartInclusive = new Date(previousEnd.getTime() - duration).toISOString();
        granularity = key === "90d" ? "weekly" : "daily";
    } else if (key === "year") {
        startInclusive = bangkokMidnightIso(`${nowParts.year}-01-01`);
        comparisonStartInclusive = bangkokMidnightIso(`${nowParts.year - 1}-01-01`);
        comparisonEndExclusive = sameBangkokTimeInYear(nowParts, nowParts.year - 1);
        granularity = "monthly";
    } else if (query.allTime) {
        const firstAt = firstPaidOrderAt ? new Date(firstPaidOrderAt) : null;
        startInclusive = firstAt && Number.isFinite(firstAt.getTime()) && firstAt < now
            ? firstAt.toISOString()
            : bangkokMidnightIso(todayKey);
        granularity = "monthly";
    } else {
        const startKey = query.start;
        const endKey = query.end;
        if (startKey === null || endKey === null) throw new Error("Custom dates are required");
        startInclusive = bangkokMidnightIso(startKey);
        const inclusiveDays = keyToDayNumber(endKey) - keyToDayNumber(startKey) + 1;
        const isToday = endKey === todayKey;
        const customEnd = isToday ? now : new Date(bangkokMidnightIso(addDays(endKey, 1)));
        const duration = customEnd.getTime() - new Date(startInclusive).getTime();
        endExclusive = customEnd.toISOString();
        comparisonEndExclusive = startInclusive;
        comparisonStartInclusive = new Date(new Date(startInclusive).getTime() - duration).toISOString();
        granularity = inclusiveDays <= 31 ? "daily" : inclusiveDays <= 180 ? "weekly" : "monthly";
    }

    return {
        key,
        timezone: REPORTS_SALES_TIME_ZONE,
        startInclusive,
        endExclusive,
        comparisonStartInclusive,
        comparisonEndExclusive,
        granularity,
    };
}

export function calculateReportsSalesMetrics(orders: ReportsSalesPaidOrder[]): ReportsSalesMetrics {
    const paidSales = orders.reduce((sum, order) => sum + order.total, 0);
    const paidOrderCount = orders.length;
    return {
        paidSales,
        paidOrderCount,
        averagePaidOrderValue: paidOrderCount > 0 ? paidSales / paidOrderCount : 0,
    };
}

export function buildReportsSalesCalendar(
    orders: ReportsSalesPaidOrder[],
    period: ReportsSalesPeriod,
): ReportsSalesCalendar {
    const start = new Date(period.startInclusive);
    const end = new Date(period.endExclusive);
    const days: ReportsSalesCalendarDay[] = [];
    const byDate = new Map<string, ReportsSalesCalendarDay>();

    if (start < end) {
        const firstDate = dateKey(bangkokParts(start));
        const lastDate = dateKey(bangkokParts(new Date(end.getTime() - 1)));
        for (let day = keyToDayNumber(firstDate); day <= keyToDayNumber(lastDate); day += 1) {
            const date = dayNumberToKey(day);
            const calendarDay = { date, paidSales: 0, paidOrderCount: 0, averagePaidOrderValue: 0 };
            days.push(calendarDay);
            byDate.set(date, calendarDay);
        }
    }

    for (const order of orders) {
        const occurredAt = new Date(order.occurredAt);
        if (!Number.isFinite(occurredAt.getTime())) continue;
        const day = byDate.get(dateKey(bangkokParts(occurredAt)));
        if (!day) continue;
        day.paidSales += order.total;
        day.paidOrderCount += 1;
    }
    for (const day of days) {
        day.averagePaidOrderValue = day.paidOrderCount > 0 ? day.paidSales / day.paidOrderCount : 0;
    }
    return { startDateInclusive: period.startInclusive, endDateExclusive: period.endExclusive, days };
}

export function percentChange(current: number, previous: number): number | null {
    if (previous === 0) return current === 0 ? 0 : null;
    const value = ((current - previous) / previous) * 100;
    return Number.isFinite(value) ? value : null;
}

export function buildReportsSalesComparison(
    available: boolean,
    current: ReportsSalesMetrics,
    previous: ReportsSalesMetrics | null,
): ReportsSalesComparison {
    if (!available) return { available: false, current, previous: null, delta: null };
    if (!previous) throw new Error("Previous metrics are required when comparison is available");
    return {
        available: true,
        current,
        previous,
        delta: {
            paidSalesAmount: current.paidSales - previous.paidSales,
            paidSalesPercent: percentChange(current.paidSales, previous.paidSales),
            paidOrderCount: current.paidOrderCount - previous.paidOrderCount,
            paidOrderCountPercent: percentChange(current.paidOrderCount, previous.paidOrderCount),
            averagePaidOrderValueAmount: current.averagePaidOrderValue - previous.averagePaidOrderValue,
            averagePaidOrderValuePercent: percentChange(current.averagePaidOrderValue, previous.averagePaidOrderValue),
        },
    };
}

function monthKey(parts: Pick<BangkokParts, "year" | "month">): string {
    return `${pad(parts.year, 4)}-${pad(parts.month)}`;
}

function nextMonth(key: string): string {
    const [year, month] = key.split("-").map(Number);
    return month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;
}

function trendKey(value: Date, granularity: Exclude<ReportsSalesGranularity, "weekly">): string {
    const parts = bangkokParts(value);
    if (granularity === "hourly") return `${dateKey(parts)}T${pad(parts.hour)}`;
    if (granularity === "daily") return dateKey(parts);
    return monthKey(parts);
}

function trendStart(key: string, granularity: ReportsSalesGranularity): string {
    if (granularity === "hourly") return `${key}:00:00.000${BANGKOK_OFFSET}`;
    if (granularity === "daily") return bangkokMidnightIso(key);
    return bangkokMidnightIso(`${key}-01`);
}

function trendLabel(key: string, granularity: ReportsSalesGranularity): string {
    if (granularity === "hourly") return `${key.slice(11)}:00`;
    return key;
}

function bucketKeys(range: ReportsSalesRange): string[] {
    const start = new Date(range.startInclusive);
    const end = new Date(range.endExclusive);
    if (!(start < end)) return [];
    if (range.granularity === "weekly") {
        const firstDate = dateKey(bangkokParts(start));
        const lastDate = dateKey(bangkokParts(new Date(end.getTime() - 1)));
        const keys: string[] = [];
        for (let day = keyToDayNumber(firstDate); day <= keyToDayNumber(lastDate); day += 7) keys.push(dayNumberToKey(day));
        return keys;
    }
    const first = trendKey(start, range.granularity);
    const last = trendKey(new Date(end.getTime() - 1), range.granularity);
    const keys: string[] = [];

    if (range.granularity === "hourly") {
        const day = first.slice(0, 10);
        const firstHour = Number(first.slice(11));
        const lastHour = Number(last.slice(11));
        for (let hour = firstHour; hour <= lastHour; hour++) keys.push(`${day}T${pad(hour)}`);
    } else if (range.granularity === "daily") {
        for (let day = keyToDayNumber(first); day <= keyToDayNumber(last); day++) keys.push(dayNumberToKey(day));
    } else {
        for (let month = first; month.localeCompare(last) <= 0; month = nextMonth(month)) keys.push(month);
    }
    return keys;
}

export function buildReportsSalesTrend(
    orders: ReportsSalesPaidOrder[],
    range: ReportsSalesRange,
): ReportsSalesTrendBucket[] {
    const buckets = new Map<string, ReportsSalesTrendBucket>();
    const keys = bucketKeys(range);
    const reportLastDate = dateKey(bangkokParts(new Date(new Date(range.endExclusive).getTime() - 1)));
    const weeklyLabel = (startKey: string, endKey: string) => {
        const format = (value: string, includeMonth: boolean) => new Intl.DateTimeFormat("th-TH", {
            timeZone: "UTC", day: "numeric", ...(includeMonth ? { month: "short" as const } : {}),
        }).format(new Date(`${value}T00:00:00.000Z`));
        const sameMonth = startKey.slice(0, 7) === endKey.slice(0, 7);
        return `${format(startKey, !sameMonth)}–${format(endKey, true)}`;
    };
    for (const key of keys) {
        if (range.granularity === "weekly") {
            const weeklyEnd = addDays(key, 6).localeCompare(reportLastDate) > 0 ? reportLastDate : addDays(key, 6);
            buckets.set(key, {
                key,
                label: weeklyLabel(key, weeklyEnd),
                start: bangkokMidnightIso(key),
                paidSales: 0,
                paidOrderCount: 0,
            });
            continue;
        }
        buckets.set(key, {
            key,
            label: trendLabel(key, range.granularity),
            start: trendStart(key, range.granularity),
            paidSales: 0,
            paidOrderCount: 0,
        });
    }
    for (const order of orders) {
        const key = range.granularity === "weekly"
            ? keys[Math.floor((keyToDayNumber(dateKey(bangkokParts(new Date(order.occurredAt)))) - keyToDayNumber(keys[0])) / 7)]
            : trendKey(new Date(order.occurredAt), range.granularity);
        const bucket = buckets.get(key);
        if (!bucket) continue;
        bucket.paidSales += order.total;
        bucket.paidOrderCount += 1;
    }
    return [...buckets.values()];
}

export function buildReportsSalesPayments(
    orders: ReportsSalesPaidOrder[],
    paidSales: number,
): ReportsSalesPayment[] {
    const payments: ReportsSalesPayment[] = [
        { method: "cash", paidSales: 0, paidOrderCount: 0, contributionPercent: 0 },
        { method: "promptpay", paidSales: 0, paidOrderCount: 0, contributionPercent: 0 },
        { method: "unknown", paidSales: 0, paidOrderCount: 0, contributionPercent: 0 },
    ];
    const byMethod = new Map(payments.map((payment) => [payment.method, payment]));
    for (const order of orders) {
        const normalized = order.paymentMethod?.trim().toLowerCase();
        const method = normalized === "cash" || normalized === "promptpay" ? normalized : "unknown";
        const payment = byMethod.get(method);
        if (!payment) continue;
        payment.paidSales += order.total;
        payment.paidOrderCount += 1;
    }
    for (const payment of payments) {
        payment.contributionPercent = paidSales > 0 ? (payment.paidSales / paidSales) * 100 : 0;
    }
    return payments;
}

type MutableVariant = Omit<ReportsSalesMenuVariant, "contributionPercentWithinMenu"> & {
    snapshotOccurredAt: number;
    hasSnapshotLabel: boolean;
};
type MutableMenu = Omit<ReportsSalesMenu, "contributionPercent" | "variants"> & {
    snapshotOccurredAt: number;
    hasSnapshotName: boolean;
    variants: Map<string, MutableVariant>;
};

const fallbackKey = (value: string) => encodeURIComponent(value.trim().toLocaleLowerCase("th-TH") || "ไม่ระบุ");

export function buildReportsSalesMenus(orders: ReportsSalesPaidOrder[]): ReportsSalesMenu[] {
    const menus = new Map<string, MutableMenu>();
    for (const order of orders) {
        const occurredAt = new Date(order.occurredAt).getTime();
        const snapshotOccurredAt = Number.isFinite(occurredAt) ? occurredAt : Number.NEGATIVE_INFINITY;
        for (const item of order.items) {
            const snapshotName = item.name.trim();
            const name = snapshotName || "ไม่ระบุชื่อเมนู";
            const menuKey = item.menuId ? `menu:${item.menuId}` : `snapshot:${fallbackKey(name)}`;
            let menu = menus.get(menuKey);
            if (!menu) {
                menu = {
                    key: menuKey,
                    menuId: item.menuId,
                    name,
                    quantity: 0,
                    revenue: 0,
                    snapshotOccurredAt,
                    hasSnapshotName: Boolean(snapshotName),
                    variants: new Map(),
                };
                menus.set(menuKey, menu);
            } else if (snapshotName && (!menu.hasSnapshotName || snapshotOccurredAt >= menu.snapshotOccurredAt)) {
                menu.name = snapshotName;
                menu.snapshotOccurredAt = snapshotOccurredAt;
                menu.hasSnapshotName = true;
            }
            const revenue = item.price * item.quantity;
            menu.quantity += item.quantity;
            menu.revenue += revenue;

            const snapshotLabel = item.variantLabel?.trim() ?? "";
            const label = snapshotLabel || "ไม่ระบุ Variant";
            const variantKey = item.variantId
                ? `${menuKey}:variant:${item.variantId}`
                : `${menuKey}:snapshot:${fallbackKey(label)}`;
            let variant = menu.variants.get(variantKey);
            if (!variant) {
                variant = {
                    key: variantKey,
                    variantId: item.variantId,
                    label,
                    quantity: 0,
                    revenue: 0,
                    snapshotOccurredAt,
                    hasSnapshotLabel: Boolean(snapshotLabel),
                };
                menu.variants.set(variantKey, variant);
            } else if (snapshotLabel && (!variant.hasSnapshotLabel || snapshotOccurredAt >= variant.snapshotOccurredAt)) {
                variant.label = snapshotLabel;
                variant.snapshotOccurredAt = snapshotOccurredAt;
                variant.hasSnapshotLabel = true;
            }
            variant.quantity += item.quantity;
            variant.revenue += revenue;
        }
    }

    const totalItemRevenue = [...menus.values()].reduce((sum, menu) => sum + menu.revenue, 0);
    return [...menus.values()]
        .map((menu): ReportsSalesMenu => ({
            key: menu.key,
            menuId: menu.menuId,
            name: menu.name,
            quantity: menu.quantity,
            revenue: menu.revenue,
            contributionPercent: totalItemRevenue > 0 ? (menu.revenue / totalItemRevenue) * 100 : 0,
            variants: [...menu.variants.values()]
                .map((variant): ReportsSalesMenuVariant => ({
                    key: variant.key,
                    variantId: variant.variantId,
                    label: variant.label,
                    quantity: variant.quantity,
                    revenue: variant.revenue,
                    contributionPercentWithinMenu: menu.revenue > 0 ? (variant.revenue / menu.revenue) * 100 : 0,
                }))
                .sort((a, b) => b.revenue - a.revenue || a.label.localeCompare(b.label, "th")),
        }))
        .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, "th"));
}

export function buildReportsSalesDataQuality(orders: ReportsSalesPaidOrder[]): ReportsSalesResponse["dataQuality"] {
    let itemRevenueMismatchAmount = 0;
    let itemRevenueMismatchOrderCount = 0;
    for (const order of orders) {
        const itemRevenue = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const mismatch = itemRevenue - order.total;
        if (Math.abs(mismatch) > 0.001) {
            itemRevenueMismatchAmount += Math.abs(mismatch);
            itemRevenueMismatchOrderCount += 1;
        }
    }
    return {
        legacyPaidFallbackCount: orders.filter((order) => order.timestampSource === "created_at").length,
        unknownPaymentCount: orders.filter((order) => {
            const method = order.paymentMethod?.trim().toLowerCase();
            return method !== "cash" && method !== "promptpay";
        }).length,
        itemRevenueMismatchAmount,
        itemRevenueMismatchOrderCount,
    };
}
