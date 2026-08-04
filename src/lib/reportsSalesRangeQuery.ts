export const REPORTS_SALES_RANGE_KEYS = ["today", "7d", "30d", "90d", "year", "custom"] as const;
export type ReportsSalesRangeKey = (typeof REPORTS_SALES_RANGE_KEYS)[number];

export type ReportsSalesRangeQuery =
    | { key: Exclude<ReportsSalesRangeKey, "custom">; start: null; end: null; allTime: false }
    | { key: "custom"; start: string; end: string; allTime: false }
    | { key: "custom"; start: null; end: null; allTime: true };

export type ReportsSalesRangeQueryResult =
    | { ok: true; value: ReportsSalesRangeQuery }
    | { ok: false; error: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export function isReportsSalesRangeKey(value: string): value is ReportsSalesRangeKey {
    return REPORTS_SALES_RANGE_KEYS.some((key) => key === value);
}
const dayNumber = (value: string) => {
    if (!DATE_PATTERN.test(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
        ? Math.floor(date.getTime() / 86_400_000) : null;
};

export function getReportsBangkokDate(now = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now);
}

export function parseReportsSalesRangeQuery(params: URLSearchParams, now = new Date()): ReportsSalesRangeQueryResult {
    const ownedParameters = ["range", "start", "end", "preset"] as const;
    if (ownedParameters.some((parameter) => params.getAll(parameter).length > 1)) {
        return { ok: false, error: "Duplicate range parameter" };
    }
    const rawRange = params.get("range") ?? "7d";
    if (!isReportsSalesRangeKey(rawRange)) return { ok: false, error: "Invalid range" };
    const hasStart = params.has("start");
    const hasEnd = params.has("end");
    const hasPreset = params.has("preset");
    const start = params.get("start");
    const end = params.get("end");
    const preset = params.get("preset");
    if (rawRange !== "custom") {
        if (hasStart || hasEnd || hasPreset) return { ok: false, error: "Range parameters are only valid for custom range" };
        return { ok: true, value: { key: rawRange, start: null, end: null, allTime: false } };
    }
    if (hasPreset) {
        if (preset !== "all") return { ok: false, error: "Unknown preset" };
        if (hasStart || hasEnd) return { ok: false, error: "All-time cannot include start or end" };
        return { ok: true, value: { key: "custom", start: null, end: null, allTime: true } };
    }
    if (!hasStart || !hasEnd || !start || !end) return { ok: false, error: "Custom range requires start and end" };
    const startDay = dayNumber(start);
    const endDay = dayNumber(end);
    if (startDay === null || endDay === null) return { ok: false, error: "Invalid date format" };
    if (startDay > endDay) return { ok: false, error: "Start must not be after end" };
    const todayDay = dayNumber(getReportsBangkokDate(now));
    if (todayDay === null || endDay > todayDay) return { ok: false, error: "Future dates are not allowed" };
    if (endDay - startDay + 1 > 3_653) return { ok: false, error: "Custom range exceeds 10 years" };
    return { ok: true, value: { key: "custom", start, end, allTime: false } };
}

export function buildReportsSalesRangeSearch(query: ReportsSalesRangeQuery): string {
    const params = new URLSearchParams({ range: query.key });
    if (query.allTime) params.set("preset", "all");
    else if (query.key === "custom") {
        params.set("start", query.start);
        params.set("end", query.end);
    }
    return params.toString();
}
