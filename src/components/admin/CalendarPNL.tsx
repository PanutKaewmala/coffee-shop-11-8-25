// components/admin/CalendarPNL.tsx
"use client";

import React from "react";
import type { Order } from "@/lib/types";

type RangeType = "today" | "week" | "month" | "year" | "5year" | "all";

interface Props {
    orders: Order[];
    range: RangeType;
}

type Cell = { iso?: string; day?: number };

const RANGE_DAYS: Record<Exclude<RangeType, "all">, number> = {
    today: 1,
    week: 7,
    month: 30,
    year: 365,
    "5year": 5 * 365,
};

/* -------------------------
 * Helpers
 * ------------------------- */
function pad(n: number) {
    return String(n).padStart(2, "0");
}

function rangeLabelTH(range: RangeType) {
    if (range === "today") return "วันนี้";
    if (range === "week") return "7 วัน";
    if (range === "month") return "30 วัน";
    if (range === "year") return "ปีนี้";
    if (range === "5year") return "5 ปี";
    return "ทั้งหมด";
}

/** Format a Date object as local YYYY-MM-DD */
function toLocalISO(d: Date) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse local date key YYYY-MM-DD -> local Date */
function fromLocalISO(iso: string) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}

function formatMonthLabel(monthKey: string) {
    if (!monthKey) return "-";
    const [y, m] = monthKey.split("-").map(Number);
    return new Date(y, (m || 1) - 1, 1).toLocaleDateString("th-TH", {
        month: "long",
        year: "numeric",
    });
}

function formatDateLabel(iso: string) {
    return fromLocalISO(iso).toLocaleDateString("th-TH", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function formatShortDateLabel(iso: string) {
    return fromLocalISO(iso).toLocaleDateString("th-TH", {
        day: "2-digit",
        month: "short",
    });
}

function formatCompactBaht(value: number) {
    const sign = value < 0 ? "-" : "";
    const abs = Math.abs(value);

    if (abs >= 1_000_000) {
        const n = abs / 1_000_000;
        const text = n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, "");
        return `${sign}${text}m฿`;
    }

    if (abs >= 1_000) {
        const n = abs / 1_000;
        const text = n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, "");
        return `${sign}${text}k฿`;
    }

    return `${sign}${Math.round(abs).toLocaleString("th-TH")}฿`;
}

function formatCompactNumber(value: number) {
    const sign = value < 0 ? "-" : "";
    const abs = Math.abs(value);

    if (abs >= 1_000_000) {
        const n = abs / 1_000_000;
        const text = n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, "");
        return `${sign}${text}m`;
    }

    if (abs >= 1_000) {
        const n = abs / 1_000;
        const text = n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, "");
        return `${sign}${text}k`;
    }

    return `${sign}${Math.round(abs).toLocaleString("th-TH")}`;
}

function heatClass(total: number, maxTotal: number, inRange: boolean) {
    if (!inRange) return "border-text-muted/10 bg-background/20 text-text-muted/45";
    if (total <= 0) return "border-text-muted/15 bg-background/45 text-text-muted";

    const ratio = maxTotal > 0 ? total / maxTotal : 0;
    if (ratio >= 0.75) return "border-amber-400/55 bg-amber-400/30 text-text-primary";
    if (ratio >= 0.4) return "border-amber-500/35 bg-amber-500/20 text-text-primary";
    return "border-amber-500/20 bg-amber-500/10 text-text-primary";
}

/* -------------------------
 * Component
 * ------------------------- */
export default function CalendarPNL({ orders, range }: Props) {
    const [selectedMonth, setSelectedMonth] = React.useState<string>("");
    const [selectedDay, setSelectedDay] = React.useState<string | null>(null);

    // Keep calendar sales aligned with successful orders only
    const paidOrders = React.useMemo(() => {
        return orders.filter((o) => !o.status || o.status === "paid");
    }, [orders]);

    // 1) Build daily totals keyed by LOCAL date (YYYY-MM-DD)
    const dailyMapLocal = React.useMemo(() => {
        const m = new Map<string, number>();
        for (const o of paidOrders) {
            const keyISO = o.paid_at ?? o.created_at;
            const d = new Date(keyISO);
            if (Number.isNaN(d.getTime())) continue;
            const key = toLocalISO(d);
            m.set(key, (m.get(key) || 0) + (o.total ?? 0));
        }
        return m;
    }, [paidOrders]);

    const dailyOrderCountMap = React.useMemo(() => {
        const m = new Map<string, number>();
        for (const o of paidOrders) {
            const keyISO = o.paid_at ?? o.created_at;
            const d = new Date(keyISO);
            if (Number.isNaN(d.getTime())) continue;
            const key = toLocalISO(d);
            m.set(key, (m.get(key) || 0) + 1);
        }
        return m;
    }, [paidOrders]);

    // 2) Build rangeDates
    const rangeDates = React.useMemo(() => {
        const s = new Set<string>();
        const today = new Date();
        const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        if (range === "all") {
            if (paidOrders.length === 0) return s;
            let earliest: Date | null = null;
            for (const o of paidOrders) {
                const keyISO = o.paid_at ?? o.created_at;
                const d = new Date(keyISO);
                if (Number.isNaN(d.getTime())) continue;
                const localDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                if (!earliest || localDay < earliest) earliest = localDay;
            }
            if (!earliest) return s;
            for (let d = new Date(earliest); d <= localToday; d.setDate(d.getDate() + 1)) {
                s.add(toLocalISO(new Date(d)));
            }
            return s;
        }

        // For 'year' and '5year' subtract calendar years (so startLocal matches backend)
        if (range === "year" || range === "5year") {
            const yearsBack = range === "year" ? 1 : 5;
            const start = new Date(localToday.getFullYear() - yearsBack, localToday.getMonth(), localToday.getDate());
            for (let d = new Date(start); d <= localToday; d.setDate(d.getDate() + 1)) {
                s.add(toLocalISO(new Date(d)));
            }
            return s;
        }

        // For other ranges (week, month, etc.) day-count from local midnight
        const days = RANGE_DAYS[range as Exclude<RangeType, "all">];
        const start = new Date(localToday.getFullYear(), localToday.getMonth(), localToday.getDate() - (days - 1));
        for (let d = new Date(start); d <= localToday; d.setDate(d.getDate() + 1)) {
            s.add(toLocalISO(new Date(d)));
        }
        return s;
    }, [paidOrders, range]);

    // 3) Month list
    const monthList = React.useMemo(() => {
        if (rangeDates.size === 0) return [] as string[];
        const days = Array.from(rangeDates).sort((a, b) => a.localeCompare(b));
        const first = fromLocalISO(days[0]);
        const last = fromLocalISO(days[days.length - 1]);
        const months: string[] = [];
        const cur = new Date(first.getFullYear(), first.getMonth(), 1);
        const end = new Date(last.getFullYear(), last.getMonth(), 1);
        while (cur <= end) {
            months.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}`);
            cur.setMonth(cur.getMonth() + 1);
        }
        return months;
    }, [rangeDates]);

    // Months in current range that actually contain paid sales
    const monthsWithData = React.useMemo(() => {
        const s = new Set<string>();
        for (const day of rangeDates) {
            if (!dailyMapLocal.has(day)) continue;
            s.add(day.slice(0, 7));
        }
        return s;
    }, [dailyMapLocal, rangeDates]);

    // 4) default selected month
    React.useEffect(() => {
        if (!monthList.length) {
            setSelectedMonth("");
            return;
        }

        const latestMonthWithData = [...monthList]
            .reverse()
            .find((m) => monthsWithData.has(m));

        setSelectedMonth((prev) => {
            if (
                prev &&
                monthList.includes(prev) &&
                (monthsWithData.size === 0 || monthsWithData.has(prev))
            ) {
                return prev;
            }
            if (latestMonthWithData) return latestMonthWithData;
            return monthList[monthList.length - 1];
        });
    }, [monthList, monthsWithData]);

    // 5) build calendar weeks
    const calendarMatrix = React.useMemo(() => {
        if (!selectedMonth) return [] as Cell[][];
        const [yStr, mmStr] = selectedMonth.split("-");
        const y = Number(yStr);
        const mm = Number(mmStr);
        const first = new Date(y, mm - 1, 1);
        const startDow = first.getDay();
        const daysInMonth = new Date(y, mm, 0).getDate();

        const weeks: Cell[][] = [];
        let day = 1;

        const firstWeek: Cell[] = Array.from({ length: 7 }, () => ({} as Cell));
        for (let i = startDow; i < 7 && day <= daysInMonth; i++) {
            firstWeek[i] = { iso: toLocalISO(new Date(y, mm - 1, day)), day };
            day++;
        }
        weeks.push(firstWeek);

        while (day <= daysInMonth) {
            const w: Cell[] = Array.from({ length: 7 }, () => ({} as Cell));
            for (let i = 0; i < 7 && day <= daysInMonth; i++) {
                w[i] = { iso: toLocalISO(new Date(y, mm - 1, day)), day };
                day++;
            }
            weeks.push(w);
        }

        return weeks;
    }, [selectedMonth]);

    const monthDays = React.useMemo(() => {
        if (!selectedMonth) return [] as string[];
        const [yStr, mmStr] = selectedMonth.split("-");
        const y = Number(yStr);
        const mm = Number(mmStr);
        const daysInMonth = new Date(y, mm, 0).getDate();

        return Array.from({ length: daysInMonth }, (_, i) => toLocalISO(new Date(y, mm - 1, i + 1)));
    }, [selectedMonth]);

    const monthSummary = React.useMemo(() => {
        let total = 0;
        let activeDays = 0;
        let maxTotal = 0;
        let bestDay: { iso: string; total: number } | null = null;

        for (const iso of monthDays) {
            if (!rangeDates.has(iso)) continue;
            const dayTotal = dailyMapLocal.get(iso) ?? 0;
            total += dayTotal;

            if (dayTotal > 0) {
                activeDays++;
                if (!bestDay || dayTotal > bestDay.total) {
                    bestDay = { iso, total: dayTotal };
                }
                maxTotal = Math.max(maxTotal, dayTotal);
            }
        }

        return { total, activeDays, bestDay, maxTotal };
    }, [dailyMapLocal, monthDays, rangeDates]);

    React.useEffect(() => {
        if (!monthDays.length) {
            setSelectedDay(null);
            return;
        }

        setSelectedDay((prev) => {
            if (prev && monthDays.includes(prev)) return prev;

            const latestSalesDay = [...monthDays]
                .reverse()
                .find((iso) => rangeDates.has(iso) && (dailyMapLocal.get(iso) ?? 0) > 0);

            const todayISO = toLocalISO(new Date());
            if (monthDays.includes(todayISO)) return todayISO;
            return latestSalesDay ?? monthDays[monthDays.length - 1] ?? null;
        });
    }, [dailyMapLocal, monthDays, rangeDates]);

    const selectedMonthIndex = monthList.indexOf(selectedMonth);
    const canGoPrevMonth = selectedMonthIndex > 0;
    const canGoNextMonth = selectedMonthIndex >= 0 && selectedMonthIndex < monthList.length - 1;

    const selectedDayTotal = selectedDay ? dailyMapLocal.get(selectedDay) ?? 0 : 0;
    const selectedDayOrderCount = selectedDay ? dailyOrderCountMap.get(selectedDay) ?? 0 : 0;
    const todayISO = toLocalISO(new Date());

    const goToMonth = (direction: -1 | 1) => {
        const nextMonth = monthList[selectedMonthIndex + direction];
        if (nextMonth) setSelectedMonth(nextMonth);
    };

    return (
        <div className="w-full min-w-0 overflow-hidden rounded-xl border border-text-muted/25 bg-surface p-1 shadow sm:p-4">
            <div className="mb-2 flex flex-col gap-2 sm:mb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="min-w-0">
                    <h2 className="text-base font-semibold text-text-primary sm:text-lg">ปฏิทินยอดขาย</h2>
                    <div className="text-xs text-text-muted">ช่วง: {rangeLabelTH(range)}</div>
                </div>

                <div className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-text-muted/20 bg-background/45 p-1 sm:w-auto">
                    <button
                        type="button"
                        onClick={() => goToMonth(-1)}
                        disabled={!canGoPrevMonth}
                        className="h-8 w-8 rounded-md text-sm font-semibold text-text-secondary transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label="เดือนก่อนหน้า"
                    >
                        {"<"}
                    </button>
                    <div className="min-w-0 flex-1 truncate px-2 text-center text-sm font-semibold text-text-primary sm:min-w-36 sm:flex-none">
                        {formatMonthLabel(selectedMonth)}
                    </div>
                    <button
                        type="button"
                        onClick={() => goToMonth(1)}
                        disabled={!canGoNextMonth}
                        className="h-8 w-8 rounded-md text-sm font-semibold text-text-secondary transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label="เดือนถัดไป"
                    >
                        {">"}
                    </button>
                </div>
            </div>

            <div className="mb-2 flex min-w-0 items-center gap-1 overflow-hidden px-0.5 text-[11px] leading-none text-text-muted sm:hidden">
                <span className="min-w-0 shrink truncate whitespace-nowrap">
                    รวม <strong className="font-semibold text-text-primary">{formatCompactBaht(monthSummary.total)}</strong>
                </span>
                <span className="shrink-0 text-text-muted/50">·</span>
                <span className="shrink-0 whitespace-nowrap">
                    ดีสุด <strong className="font-semibold text-text-primary">{monthSummary.bestDay ? formatShortDateLabel(monthSummary.bestDay.iso) : "-"}</strong>
                </span>
                <span className="shrink-0 text-text-muted/50">·</span>
                <span className="shrink-0 whitespace-nowrap">
                    ขาย <strong className="font-semibold text-text-primary">{monthSummary.activeDays}</strong> วัน
                </span>
            </div>

            <div className="mb-2 hidden w-full min-w-0 grid-cols-3 gap-1 sm:mb-3 sm:grid sm:gap-2">
                <div className="min-w-0 rounded-lg border border-text-muted/15 bg-background/35 p-1.5 sm:p-2">
                    <div className="truncate text-[10px] text-text-muted">รวม</div>
                    <div className="mt-1 truncate text-xs font-semibold text-text-primary sm:text-sm">
                        {formatCompactBaht(monthSummary.total)}
                    </div>
                </div>
                <div className="min-w-0 rounded-lg border border-text-muted/15 bg-background/35 p-1.5 sm:p-2">
                    <div className="truncate text-[10px] text-text-muted">ดีสุด</div>
                    <div className="mt-1 truncate text-xs font-semibold text-text-primary sm:text-sm">
                        {monthSummary.bestDay ? formatShortDateLabel(monthSummary.bestDay.iso) : "-"}
                    </div>
                </div>
                <div className="min-w-0 rounded-lg border border-text-muted/15 bg-background/35 p-1.5 sm:p-2">
                    <div className="truncate text-[10px] text-text-muted">วันขาย</div>
                    <div className="mt-1 truncate text-xs font-semibold text-text-primary sm:text-sm">
                        {monthSummary.activeDays}
                    </div>
                </div>
            </div>

            <div className="w-full max-w-full min-w-0 overflow-hidden">
                <div className="w-full max-w-full min-w-0">
                    <div className="mb-1.5 grid w-full min-w-0 grid-cols-7 text-[10px] font-medium text-text-muted sm:mb-2 sm:text-xs">
                        {["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."].map((d) => (
                            <div key={d} className="min-w-0 text-center">
                                {d}
                            </div>
                        ))}
                    </div>

                    <div className="space-y-[2px] sm:space-y-1">
                        {calendarMatrix.map((week, wi) => (
                            <div key={wi} className="grid w-full min-w-0 grid-cols-7 gap-[2px] sm:gap-1">
                                {week.map((cell, ci) => {
                                    if (!cell.iso) {
                                        return <div key={ci} className="h-9 min-w-0 rounded-md sm:h-[68px] sm:rounded-lg lg:h-[76px]" />;
                                    }

                                    const iso = cell.iso;
                                    const inRange = rangeDates.has(iso);
                                    const total = dailyMapLocal.get(iso) ?? 0;
                                    const isBestDay = monthSummary.bestDay?.iso === iso;
                                    const isSelected = selectedDay === iso;
                                    const isToday = todayISO === iso;
                                    const showAmount = inRange && total > 0;

                                    return (
                                        <button
                                            type="button"
                                            key={iso}
                                            onClick={() => setSelectedDay(iso)}
                                            className={[
                                                "relative flex h-9 min-w-0 flex-col justify-between overflow-hidden rounded-md border p-1 text-left transition focus:outline-none sm:h-[68px] sm:rounded-lg sm:p-2 lg:h-[76px] lg:p-3",
                                                heatClass(total, monthSummary.maxTotal, inRange),
                                                isBestDay ? "border-amber-400/80" : "",
                                                isSelected
                                                    ? "border-2 border-accent bg-accent/10"
                                                    : "hover:border-accent/50",
                                            ].join(" ")}
                                            aria-pressed={isSelected}
                                        >
                                            {isToday ? (
                                                <span className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-accent sm:right-1 sm:top-1 sm:h-1.5 sm:w-1.5" />
                                            ) : null}
                                            <span className="text-[9px] font-medium leading-none text-text-secondary sm:text-xs">
                                                {cell.day}
                                            </span>
                                            <span
                                                className="block max-w-full self-end overflow-hidden text-ellipsis whitespace-nowrap text-[9px] font-semibold leading-none text-text-primary tabular-nums sm:text-[11px] lg:text-xs"
                                            >
                                                {showAmount ? formatCompactNumber(total) : ""}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-2 min-w-0 border-t border-text-muted/15 px-0.5 pt-2 sm:mt-3 sm:rounded-lg sm:border sm:bg-background/35 sm:p-3">
                {selectedDay ? (
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:gap-3">
                        <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-text-primary sm:text-sm">
                                {formatDateLabel(selectedDay)}
                            </div>
                            <div className="mt-0.5 truncate text-[11px] text-text-muted sm:mt-1 sm:text-xs">
                                {selectedDayOrderCount} ออเดอร์
                            </div>
                        </div>
                        <div className="min-w-0 text-right">
                            <div className="text-[10px] text-text-muted">ยอดขาย</div>
                            <div className="max-w-[8rem] truncate text-sm font-bold text-text-primary sm:max-w-none sm:text-base">
                                {formatCompactBaht(selectedDayTotal)}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-sm text-text-muted">ยังไม่มีวันที่ให้เลือก</div>
                )}
            </div>
        </div>
    );
}
