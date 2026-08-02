import type {
    ReportsSalesComparison,
    ReportsSalesGranularity,
    ReportsSalesMetrics,
    ReportsSalesRange,
    ReportsSalesResponse,
} from "@/lib/reportsSales";

const THAI_TIME_ZONE = "Asia/Bangkok";

export const reportsSalesRangeLabels: Record<ReportsSalesRange["key"], string> = {
    today: "วันนี้",
    week: "7 วัน",
    month: "30 วัน",
    year: "ปีนี้",
    "5year": "5 ปี",
    all: "ทั้งหมด",
};

export function formatReportsMoney(value: number): string {
    return `${value.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} บาท`;
}

export function formatReportsPercent(value: number): string {
    return `${Math.abs(value).toLocaleString("th-TH", { maximumFractionDigits: 2 })}%`;
}

export function formatReportsDateRange(range: Pick<ReportsSalesRange, "startInclusive" | "endExclusive">): string {
    const formatter = new Intl.DateTimeFormat("th-TH", {
        timeZone: THAI_TIME_ZONE,
        day: "numeric",
        month: "short",
        year: "numeric",
    });
    return `${formatter.format(new Date(range.startInclusive))} – ${formatter.format(new Date(range.endExclusive))}`;
}

export function formatTrendTick(value: string, granularity: ReportsSalesGranularity): string {
    const date = new Date(value);
    const options: Intl.DateTimeFormatOptions = granularity === "hourly"
        ? { timeZone: THAI_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
        : granularity === "daily"
            ? { timeZone: THAI_TIME_ZONE, day: "numeric", month: "short" }
            : { timeZone: THAI_TIME_ZONE, month: "short", year: "2-digit" };
    return new Intl.DateTimeFormat("th-TH", options).format(date);
}

export function trendTitle(granularity: ReportsSalesGranularity): string {
    if (granularity === "hourly") return "ยอดขายรายชั่วโมง";
    if (granularity === "daily") return "ยอดขายรายวัน";
    return "ยอดขายรายเดือน";
}

export function salesSituation(summary: ReportsSalesMetrics, comparison: ReportsSalesComparison): string {
    const previousSales = comparison.available ? comparison.previous.paidSales : 0;
    if (summary.paidSales === 0 && previousSales === 0) return "ยังไม่มียอดขายที่ชำระแล้วในช่วงนี้";
    if (!comparison.available) return `ยอดขายที่ชำระแล้วในช่วงนี้ ${formatReportsMoney(summary.paidSales)}`;

    const percent = comparison.delta.paidSalesPercent;
    if (comparison.previous.paidSales === 0 && summary.paidSales > 0 && percent === null) {
        return "ช่วงก่อนหน้าไม่มียอดขาย จึงยังคำนวณเปอร์เซ็นต์เปรียบเทียบไม่ได้";
    }
    if (percent !== null && percent > 0) return `ยอดขายช่วงนี้เพิ่มขึ้น ${formatReportsPercent(percent)} จากช่วงก่อนหน้า`;
    if (percent !== null && percent < 0) return `ยอดขายช่วงนี้ลดลง ${formatReportsPercent(percent)} จากช่วงก่อนหน้า`;
    return "ยอดขายช่วงนี้ใกล้เคียงกับช่วงก่อนหน้า";
}

export function isReportsMainEmpty(data: ReportsSalesResponse): boolean {
    const previousHasSales = data.comparison.available && data.comparison.previous.paidSales > 0;
    return data.summary.paidOrderCount === 0 && !previousHasSales;
}

export function hasReportsDataQualityIssues(dataQuality: ReportsSalesResponse["dataQuality"]): boolean {
    return dataQuality.legacyPaidFallbackCount !== 0
        || dataQuality.unknownPaymentCount !== 0
        || dataQuality.itemRevenueMismatchOrderCount !== 0
        || dataQuality.itemRevenueMismatchAmount !== 0;
}

export function reportsErrorMessage(status: number, apiError: string | null): string {
    if (status === 401) return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่";
    if (status === 403 && apiError === "Owner only") return "หน้านี้สำหรับเจ้าของร้านเท่านั้น";
    if (status === 403 && apiError === "Branch not in current shop") return "สาขาที่เลือกไม่ถูกต้อง กรุณาเลือกสาขาใหม่หรือทุกสาขา";
    if (status === 409) return "ยังไม่ได้เลือกร้านที่ต้องการดู";
    return "โหลดรายงานยอดขายไม่สำเร็จ";
}

export type ReportsKpi = {
    label: string;
    value: string;
    delta: number | null;
    deltaPercent: number | null;
    deltaKind: "money" | "count";
};

export function buildReportsKpis(data: ReportsSalesResponse): ReportsKpi[] {
    const delta = data.comparison.available ? data.comparison.delta : null;
    return [
        { label: "ยอดขายที่ชำระแล้ว", value: formatReportsMoney(data.summary.paidSales), delta: delta?.paidSalesAmount ?? null, deltaPercent: delta?.paidSalesPercent ?? null, deltaKind: "money" },
        { label: "ออเดอร์ที่ชำระแล้ว", value: `${data.summary.paidOrderCount.toLocaleString("th-TH")} ออเดอร์`, delta: delta?.paidOrderCount ?? null, deltaPercent: delta?.paidOrderCountPercent ?? null, deltaKind: "count" },
        { label: "เฉลี่ยต่อออเดอร์", value: formatReportsMoney(data.summary.averagePaidOrderValue), delta: delta?.averagePaidOrderValueAmount ?? null, deltaPercent: delta?.averagePaidOrderValuePercent ?? null, deltaKind: "money" },
    ];
}
